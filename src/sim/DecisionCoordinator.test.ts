import { describe, expect, it, vi } from "vitest";
import { buildActionCandidates } from "./actionCandidates";
import { DecisionCoordinator } from "./DecisionCoordinator";
import { MockDecisionProvider } from "./MockDecisionProvider";
import type { DecisionProvider, DecisionRequest, ProviderDecision } from "./types";

const citizen = {
  id: 1,
  revision: 1,
  position: { x: 2, y: 2 },
  facing: "down" as const,
  name: "Rowan",
  job: "farmer",
  traits: ["Diligent"],
  goal: "Keep the settlement fed",
  needs: { hunger: 0.4, fatigue: 0.2, loneliness: 0.3 },
  happiness: 0.7,
  inventory: {},
  relationships: {},
  memories: [],
  currentActivity: "Waiting",
  skills: { farming: { level: 0.35, experience: 35 } },
};

function request(): DecisionRequest {
  const context = { tick: 4, stateVersion: 8, citizen, citizens: [citizen], stock: { wheat: 2, wood: 4, stone: 2 }, constructionProgress: 0.2 };
  return {
    requestId: "request-4-1",
    policyVersion: "test-v1",
    freshness: { requestedAtTick: 4, deadlineTick: 8, worldRevision: 8, npcRevision: 8, topologyRevision: 2, perceptionHash: "perception", legalSetHash: "legal" },
    perception: { tick: context.tick, stateVersion: context.stateVersion, citizen, population: 1, visibleCitizens: [{ id: citizen.id, position: citizen.position }], stock: context.stock, constructionProgress: context.constructionProgress },
    candidates: buildActionCandidates(context),
  };
}

function provider(decide: DecisionProvider["decide"]): DecisionProvider {
  return { descriptor: { kind: "test-delayed", id: "hostile", label: "Hostile test provider", version: "1" }, decide };
}

function selected(input: DecisionRequest, id: ProviderDecision["selectedCandidateId"] = "idle"): ProviderDecision {
  return { requestId: input.requestId, selectedCandidateId: id, provider: { kind: "test-delayed", id: "hostile", label: "Hostile test provider", version: "1" } };
}

describe("DecisionCoordinator", () => {
  it("accepts a valid provider selection", async () => {
    const coordinator = new DecisionCoordinator(provider(async (input) => selected(input)), new MockDecisionProvider(7));
    const result = await coordinator.decide(request());
    expect(result.status).toBe("accepted");
    expect(result.decision?.selectedCandidateId).toBe("idle");
  });

  it("coalesces identical in-flight contexts", async () => {
    let resolve!: (value: ProviderDecision) => void;
    const decide = vi.fn((input: DecisionRequest) => new Promise<ProviderDecision>((done) => { resolve = done; }));
    const coordinator = new DecisionCoordinator(provider(decide), new MockDecisionProvider(7));
    const input = request();
    const first = coordinator.decide(input);
    const second = coordinator.decide({ ...input, requestId: "duplicate-id" });
    expect(first).toBe(second);
    expect(decide).toHaveBeenCalledTimes(1);
    resolve(selected(input));
    expect((await first).status).toBe("accepted");
  });

  it("falls back for an unknown candidate without applying it", async () => {
    const bad = provider(async (input) => selected(input, "not-real" as ProviderDecision["selectedCandidateId"]));
    const coordinator = new DecisionCoordinator(bad, new MockDecisionProvider(7));
    const result = await coordinator.decide(request());
    expect(result.status).toBe("fallback");
    expect(result.reason).toBe("unknown-candidate");
    expect(request().candidates.some((candidate) => candidate.id === result.decision?.selectedCandidateId && candidate.legal)).toBe(true);
  });

  it("discards a response when its context became stale", async () => {
    const coordinator = new DecisionCoordinator(provider(async (input) => selected(input)), new MockDecisionProvider(7));
    const result = await coordinator.decide(request(), () => false);
    expect(result).toMatchObject({ status: "discarded", reason: "stale-context", decision: null });
  });

  it("aborts a timed-out provider and uses deterministic fallback", async () => {
    let aborted = false;
    const hanging = provider((_input, signal) => new Promise<ProviderDecision>((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); }, { once: true });
    }));
    const coordinator = new DecisionCoordinator(hanging, new MockDecisionProvider(7), { timeoutMs: 5, policyVersion: "test-v1" });
    const result = await coordinator.decide(request());
    expect(aborted).toBe(true);
    expect(result).toMatchObject({ status: "fallback", reason: "provider-timeout" });
  });

  it("cancels pending work without invoking fallback", async () => {
    const hanging = provider((_input, signal) => new Promise<ProviderDecision>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const fallback = new MockDecisionProvider(7);
    const fallbackSpy = vi.spyOn(fallback, "decide");
    const coordinator = new DecisionCoordinator(hanging, fallback, { timeoutMs: 5_000, policyVersion: "test-v1" });
    const pending = coordinator.decide(request());
    coordinator.cancelAll();
    expect(await pending).toMatchObject({ status: "discarded", reason: "cancelled", decision: null });
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it("bounds in-flight work and drains queued requests in stable deadline order", async () => {
    const started: string[] = [];
    const resolvers = new Map<string, (value: ProviderDecision) => void>();
    const delayed = provider((input) => {
      started.push(input.requestId);
      return new Promise<ProviderDecision>((resolve) => resolvers.set(input.requestId, resolve));
    });
    const coordinator = new DecisionCoordinator(delayed, new MockDecisionProvider(7), { timeoutMs: 5_000, policyVersion: "test-v1", maxInFlight: 1 });
    const first = request();
    const later = { ...request(), requestId: "later", perception: { ...request().perception, citizen: { ...citizen, id: 2 } }, freshness: { ...request().freshness, deadlineTick: 12, perceptionHash: "later" } };
    const urgent = { ...request(), requestId: "urgent", perception: { ...request().perception, citizen: { ...citizen, id: 3 } }, freshness: { ...request().freshness, deadlineTick: 7, perceptionHash: "urgent" } };
    const firstResult = coordinator.decide(first);
    const laterResult = coordinator.decide(later);
    const urgentResult = coordinator.decide(urgent);
    expect(started).toEqual([first.requestId]);
    resolvers.get(first.requestId)?.(selected(first));
    await firstResult;
    await Promise.resolve();
    expect(started).toEqual([first.requestId, urgent.requestId]);
    resolvers.get(urgent.requestId)?.(selected(urgent));
    await urgentResult;
    await Promise.resolve();
    expect(started).toEqual([first.requestId, urgent.requestId, later.requestId]);
    resolvers.get(later.requestId)?.(selected(later));
    await laterResult;
    expect(coordinator.getRequestLog().map((entry) => entry.status)).toEqual(["accepted", "accepted", "accepted"]);
  });

  it("keeps reverse-order completions associated with their own requests", async () => {
    const resolvers = new Map<string, (value: ProviderDecision) => void>();
    const coordinator = new DecisionCoordinator(provider((input) => new Promise<ProviderDecision>((resolve) => resolvers.set(input.requestId, resolve))), new MockDecisionProvider(7));
    const first = request();
    const second = { ...request(), requestId: "request-4-2", perception: { ...request().perception, citizen: { ...citizen, id: 2 } }, freshness: { ...request().freshness, perceptionHash: "p2" } };
    const firstResult = coordinator.decide(first);
    const secondResult = coordinator.decide(second);
    resolvers.get(second.requestId)?.(selected(second));
    resolvers.get(first.requestId)?.(selected(first));
    expect((await secondResult).decision?.requestId).toBe(second.requestId);
    expect((await firstResult).decision?.requestId).toBe(first.requestId);
  });

  it("rejects duplicated and malformed envelopes through deterministic fallback", async () => {
    const duplicate = provider(async (input) => ({ ...selected(input), requestId: "an-old-request" }));
    const malformed = provider(async (input) => ({ ...selected(input), signals: { kind: "external", evaluations: [{ candidateId: "idle", probability: Number.NaN }] } }));
    expect(await new DecisionCoordinator(duplicate, new MockDecisionProvider(9)).decide(request())).toMatchObject({ status: "fallback", reason: "request-id-mismatch" });
    expect(await new DecisionCoordinator(malformed, new MockDecisionProvider(9)).decide(request())).toMatchObject({ status: "fallback", reason: "malformed-signals" });
  });

  it("waits transparently when fallback is disabled instead of inventing a choice", async () => {
    const failed = provider(async () => { throw new Error("upstream unavailable"); });
    const coordinator = new DecisionCoordinator(failed, new MockDecisionProvider(9), { timeoutMs: 50, policyVersion: "wait-test", fallbackMode: "wait" });
    expect(await coordinator.decide(request())).toMatchObject({ status: "discarded", reason: "provider-error", decision: null });
  });
});
