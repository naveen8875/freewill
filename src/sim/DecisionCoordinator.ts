import type { DecisionProvider, DecisionRequest, DecisionRequestLog, DecisionRequestStatus, ProviderDecision } from "./types";

export interface DecisionPolicy {
  timeoutMs: number;
  policyVersion: string;
  maxInFlight?: number;
  fallbackMode?: "mock" | "wait";
}

export type DecisionResolution =
  | { status: "accepted" | "fallback"; decision: ProviderDecision; reason?: string; latencyMs: number }
  | { status: "discarded"; decision: null; reason: string; latencyMs: number };

const DEFAULT_POLICY: DecisionPolicy = { timeoutMs: 2_500, policyVersion: "local-v1" };

interface QueuedDecision {
  key: string;
  request: DecisionRequest;
  isFresh: () => boolean;
  complete: (resolution: DecisionResolution) => void;
  promise: Promise<DecisionResolution>;
}

export class DecisionCoordinator {
  private readonly pending = new Map<string, QueuedDecision>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly queue: QueuedDecision[] = [];
  private readonly requestLog: DecisionRequestLog[] = [];
  private inFlight = 0;

  constructor(
    private readonly provider: DecisionProvider,
    private readonly fallback: DecisionProvider | undefined,
    readonly policy: DecisionPolicy = DEFAULT_POLICY,
  ) {}

  decide(request: DecisionRequest, isFresh: () => boolean = () => true): Promise<DecisionResolution> {
    const key = `${request.perception.citizen.id}:${request.freshness.perceptionHash}:${request.freshness.legalSetHash}`;
    const existing = this.pending.get(key);
    if (existing) return existing.promise;
    let complete!: (resolution: DecisionResolution) => void;
    const promise = new Promise<DecisionResolution>((resolve) => { complete = resolve; });
    const job = { key, request, isFresh, complete, promise };
    this.pending.set(key, job);
    this.queue.push(job);
    this.queue.sort((a, b) => this.priority(a.request, b.request));
    this.record(request, "queued");
    this.pump();
    return promise;
  }

  getRequestLog() {
    // Log entries contain primitives only. A shallow entry copy preserves the
    // authority boundary without cloning an ever-growing graph every tick.
    return this.requestLog.map((entry) => ({ ...entry }));
  }

  cancelAll(reason = "World runtime stopped") {
    for (const job of this.queue.splice(0)) {
      this.pending.delete(job.key);
      this.record(job.request, "cancelled", reason);
      job.complete({ status: "discarded", decision: null, reason: "cancelled", latencyMs: 0 });
    }
    for (const controller of this.controllers.values()) controller.abort(reason);
    this.controllers.clear();
  }

  cancel(requestId: string, reason = "Decision request cancelled") {
    const queuedIndex = this.queue.findIndex((job) => job.request.requestId === requestId);
    if (queuedIndex >= 0) {
      const [job] = this.queue.splice(queuedIndex, 1);
      this.pending.delete(job.key);
      this.record(job.request, "cancelled", reason);
      job.complete({ status: "discarded", decision: null, reason: "cancelled", latencyMs: 0 });
      return;
    }
    this.controllers.get(requestId)?.abort(reason);
    this.controllers.delete(requestId);
  }

  forceFallback(request: DecisionRequest, reason: string, isFresh: () => boolean = () => true) {
    return this.useFallback(request, reason, isFresh, performance.now());
  }

  private pump() {
    const limit = Math.max(1, this.policy.maxInFlight ?? 4);
    while (this.inFlight < limit && this.queue.length) {
      const job = this.queue.shift()!;
      this.inFlight += 1;
      this.record(job.request, "in-flight");
      void this.resolve(job.request, job.isFresh).then((resolution) => {
        const status = resolution.status === "accepted" ? "accepted" : resolution.status === "fallback" ? "fallback" : resolution.reason === "cancelled" ? "cancelled" : "discarded";
        this.record(job.request, status, resolution.reason);
        job.complete(resolution);
      }).finally(() => {
        this.inFlight -= 1;
        if (this.pending.get(job.key) === job) this.pending.delete(job.key);
        this.pump();
      });
    }
  }

  private priority(a: DecisionRequest, b: DecisionRequest) {
    const urgency = (request: DecisionRequest) => Math.max(...Object.values(request.perception.citizen.needs));
    return urgency(b) - urgency(a)
      || Number(Boolean(b.perception.visibleToPlayer)) - Number(Boolean(a.perception.visibleToPlayer))
      || a.freshness.deadlineTick - b.freshness.deadlineTick
      || a.freshness.requestedAtTick - b.freshness.requestedAtTick
      || a.perception.citizen.id - b.perception.citizen.id;
  }

  private record(request: DecisionRequest, status: DecisionRequestStatus, reason?: string) {
    const entry = this.requestLog.find((item) => item.requestId === request.requestId);
    if (entry) {
      entry.status = status;
      if (reason) entry.reason = reason;
      return;
    }
    this.requestLog.push({
      requestId: request.requestId,
      citizenId: request.perception.citizen.id,
      requestedAtTick: request.freshness.requestedAtTick,
      deadlineTick: request.freshness.deadlineTick,
      status,
      providerId: this.provider.descriptor.id,
      ...(reason ? { reason } : {}),
    });
    if (this.requestLog.length > 500) this.requestLog.splice(0, this.requestLog.length - 500);
  }

  private async resolve(request: DecisionRequest, isFresh: () => boolean): Promise<DecisionResolution> {
    const startedAt = performance.now();
    const primary = new AbortController();
    this.controllers.set(request.requestId, primary);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.provider.decide(request, primary.signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            primary.abort("Decision deadline exceeded");
            reject(new Error("provider-timeout"));
          }, this.policy.timeoutMs);
        }),
      ]);
      const invalid = this.validate(request, result);
      if (!isFresh()) return { status: "discarded", decision: null, reason: "stale-context", latencyMs: performance.now() - startedAt };
      if (!invalid) return { status: "accepted", decision: result, latencyMs: performance.now() - startedAt };
      return this.useFallback(request, invalid, isFresh, startedAt);
    } catch (cause) {
      if (primary.signal.aborted && primary.signal.reason !== "Decision deadline exceeded") {
        return { status: "discarded", decision: null, reason: "cancelled", latencyMs: performance.now() - startedAt };
      }
      if (!isFresh()) return { status: "discarded", decision: null, reason: "stale-context", latencyMs: performance.now() - startedAt };
      const reason = primary.signal.aborted && primary.signal.reason === "Decision deadline exceeded"
        ? "provider-timeout"
        : cause instanceof Error && cause.message === "provider-timeout"
          ? "provider-timeout"
          : "provider-error";
      return this.useFallback(request, reason, isFresh, startedAt);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.controllers.delete(request.requestId);
    }
  }

  private async useFallback(request: DecisionRequest, reason: string, isFresh: () => boolean, startedAt: number): Promise<DecisionResolution> {
    if (this.policy.fallbackMode === "wait" || !this.fallback) {
      return { status: "discarded", decision: null, reason, latencyMs: performance.now() - startedAt };
    }
    const controller = new AbortController();
    try {
      const result = await this.fallback.decide(request, controller.signal);
      const invalid = this.validate(request, result);
      if (!isFresh()) return { status: "discarded", decision: null, reason: "stale-context", latencyMs: performance.now() - startedAt };
      if (invalid) return { status: "discarded", decision: null, reason: `fallback-${invalid}`, latencyMs: performance.now() - startedAt };
      return { status: "fallback", decision: result, reason, latencyMs: performance.now() - startedAt };
    } catch {
      return { status: "discarded", decision: null, reason: "fallback-error", latencyMs: performance.now() - startedAt };
    }
  }

  private validate(request: DecisionRequest, decision: ProviderDecision): string | null {
    if (!decision || typeof decision !== "object") return "malformed-response";
    if (decision.requestId !== request.requestId) return "request-id-mismatch";
    if (!decision.provider || typeof decision.provider.id !== "string" || !decision.provider.id || typeof decision.provider.label !== "string" || !decision.provider.label || typeof decision.provider.version !== "string" || !decision.provider.version) return "malformed-provider";
    if (!["mock", "test-delayed", "local-brain"].includes(decision.provider.kind)) return "malformed-provider";
    if (decision.signals && !this.validSignals(decision.signals)) return "malformed-signals";
    const candidate = request.candidates.find((item) => item.id === decision.selectedCandidateId);
    if (!candidate) return "unknown-candidate";
    if (!candidate.legal) return "illegal-candidate";
    return null;
  }

  private validSignals(signals: NonNullable<ProviderDecision["signals"]>) {
    if (signals.kind !== "heuristic" && signals.kind !== "external") return false;
    if (!Array.isArray(signals.evaluations)) return false;
    if (signals.kind === "external" && (
      signals.confidence !== undefined && (!Number.isFinite(signals.confidence) || signals.confidence < 0 || signals.confidence > 1)
      || signals.inputTokens !== undefined && (!Number.isInteger(signals.inputTokens) || signals.inputTokens < 0)
      || signals.costUsd !== undefined && (!Number.isFinite(signals.costUsd) || signals.costUsd < 0)
      || signals.entropy !== undefined && (!Number.isFinite(signals.entropy) || signals.entropy < 0)
      || signals.checkpointVersion !== undefined && (typeof signals.checkpointVersion !== "string" || !signals.checkpointVersion)
      || signals.responseModel !== undefined && (typeof signals.responseModel !== "string" || !signals.responseModel)
    )) return false;
    return signals.evaluations.every((evaluation) =>
      typeof evaluation.candidateId === "string"
      && (evaluation.score === undefined || Number.isFinite(evaluation.score))
      && (evaluation.probability === undefined || Number.isFinite(evaluation.probability) && evaluation.probability >= 0 && evaluation.probability <= 1)
      && (evaluation.trace === undefined || Array.isArray(evaluation.trace) && evaluation.trace.every((trace) => typeof trace.rule === "string" && Number.isFinite(trace.contribution)))
    );
  }
}
