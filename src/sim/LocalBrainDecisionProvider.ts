import type { DecisionProvider, DecisionRequest, ProviderDecision } from "./types";
import {
  LEARNING_SCHEMA_VERSION,
  type BrainDecisionBatchRequest,
  type BrainDecisionBatchResponse,
  type BrainExperienceRecord,
  type LocalBrainProviderOptions,
} from "./learning/contracts";
import { encodeDecisionRequest } from "./learning/encodeDecisionRequest";

export const LOCAL_BRAIN_PROVIDER = {
  kind: "local-brain",
  id: "freewill-local-brain",
  label: "Local evolving brain",
  version: "neuroevolution-v2",
} as const;

interface QueuedRequest {
  request: DecisionRequest;
  signal: AbortSignal;
  resolve: (decision: ProviderDecision) => void;
  reject: (cause: unknown) => void;
  abort?: () => void;
}

/**
 * Coalesces decisions arriving in the same short window into one local call.
 * Multiple headless worlds may share this provider to produce useful batches.
 */
export class LocalBrainDecisionProvider implements DecisionProvider {
  readonly descriptor = LOCAL_BRAIN_PROVIDER;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly brainIdForCitizen: (citizenId: number) => string;
  private readonly batchWindowMs: number;
  private queue: QueuedRequest[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly pendingLearning = new Set<Promise<{ accepted: number; rejected: number }>>();

  constructor(private readonly options: LocalBrainProviderOptions) {
    this.endpoint = options.endpoint ?? "/api/brain/decide-batch";
    // Keep the native browser fetch bound to its global receiver. Storing it
    // directly on this class and later calling `this.fetchImpl(...)` can make
    // WebKit treat the provider instance as the receiver and reject the call
    // before it ever reaches the local gateway.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.brainIdForCitizen = options.brainIdForCitizen ?? ((citizenId) => `${options.episodeId}-brain-${citizenId}`);
    this.batchWindowMs = options.batchWindowMs ?? 3;
  }

  decide(request: DecisionRequest, signal: AbortSignal): Promise<ProviderDecision> {
    if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Local brain request aborted."));
    return new Promise((resolve, reject) => {
      const item: QueuedRequest = { request, signal, resolve, reject };
      this.queue.push(item);
      const abort = () => {
        this.queue = this.queue.filter((queued) => queued !== item);
        reject(signal.reason ?? new Error("Local brain request aborted."));
      };
      item.abort = abort;
      signal.addEventListener("abort", abort, { once: true });
      if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.batchWindowMs);
    });
  }

  /** Releases lifetime state when a visible world is replaced or closed. */
  async finish(saveCheckpoint = true) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      await this.flush();
    }
    await Promise.allSettled([...this.pendingLearning]);
    const endpoint = this.endpoint.replace(/\/decide-batch$/, `/episodes/${encodeURIComponent(this.options.episodeId)}/finish`);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saveCheckpoint }),
    });
    if (!response.ok && response.status !== 404) throw new Error(`Local brain cleanup returned ${response.status}.`);
  }

  /** Applies completed action outcomes to episode-local memory, never to the inherited genome. */
  experience(experiences: BrainExperienceRecord[]) {
    if (!experiences.length) return Promise.resolve({ accepted: 0, rejected: 0 });
    const operation = this.sendExperience(experiences);
    this.pendingLearning.add(operation);
    void operation.finally(() => this.pendingLearning.delete(operation)).catch(() => undefined);
    return operation;
  }

  private async sendExperience(experiences: BrainExperienceRecord[]) {
    const endpoint = this.endpoint.replace(/\/decide-batch$/, "/experience-batch");
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: LEARNING_SCHEMA_VERSION, episodeId: this.options.episodeId, experiences }),
    });
    const payload = await response.json().catch(() => null) as { accepted?: number; rejected?: number; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || `Local brain learning returned ${response.status}.`);
    if (!payload || !Number.isInteger(payload.accepted) || !Number.isInteger(payload.rejected)) throw new Error("Local brain returned a malformed learning acknowledgement.");
    if (payload.accepted! + payload.rejected! !== experiences.length) throw new Error("Local brain acknowledged the wrong number of learning records.");
    return { accepted: payload.accepted!, rejected: payload.rejected! };
  }

  private async flush() {
    const batch = this.queue.splice(0).filter((item) => !item.signal.aborted);
    if (!batch.length) return;
    let body: BrainDecisionBatchRequest;
    try {
      body = {
        schemaVersion: LEARNING_SCHEMA_VERSION,
        episodeId: this.options.episodeId,
        policyVersion: "local-evolution-v1",
        decisions: batch.map((item) => encodeDecisionRequest(item.request, this.brainIdForCitizen(item.request.perception.citizen.id))),
      };
    } catch (cause) {
      for (const item of batch) {
        if (item.abort) item.signal.removeEventListener("abort", item.abort);
        item.reject(cause);
      }
      return;
    }
    const controller = new AbortController();
    const active = batch.filter((item) => !item.signal.aborted);
    const listeners = active.map((item) => {
      const listener = () => { if (active.every((candidate) => candidate.signal.aborted)) controller.abort(); };
      item.signal.addEventListener("abort", listener, { once: true });
      return { item, listener };
    });
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as (BrainDecisionBatchResponse & { error?: string }) | null;
      if (!response.ok) throw new Error(payload?.error || `Local brain returned ${response.status}.`);
      if (!payload || payload.schemaVersion !== LEARNING_SCHEMA_VERSION || payload.episodeId !== this.options.episodeId || !Array.isArray(payload.decisions)) throw new Error("Local brain returned a malformed batch.");
      for (const item of active) {
        if (item.signal.aborted) continue;
        const result = payload.decisions.find((decision) => decision.requestId === item.request.requestId && decision.citizenId === item.request.perception.citizen.id);
        if (!result) {
          item.reject(new Error(`Local brain omitted ${item.request.requestId}.`));
          continue;
        }
        item.resolve({
          requestId: result.requestId,
          selectedCandidateId: result.selectedCandidateId,
          provider: { ...LOCAL_BRAIN_PROVIDER, ...payload.provider },
          signals: {
            kind: "external",
            responseModel: `local:${result.brainId}`,
            confidence: result.confidence,
            entropy: result.entropy,
            checkpointVersion: result.checkpointVersion,
            evaluations: result.evaluations,
          },
        });
      }
    } catch (cause) {
      for (const item of active) if (!item.signal.aborted) item.reject(cause);
    } finally {
      for (const { item, listener } of listeners) {
        item.signal.removeEventListener("abort", listener);
        if (item.abort) item.signal.removeEventListener("abort", item.abort);
      }
    }
  }
}

