import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "./types";
import { LocalBrainDecisionProvider } from "./LocalBrainDecisionProvider";

function request(id: string, citizenId: number): DecisionRequest {
  return {
    requestId: id,
    policyVersion: "test",
    freshness: { requestedAtTick: 1, deadlineTick: 9, worldRevision: 1, npcRevision: 1, topologyRevision: 1, perceptionHash: "p", legalSetHash: "l" },
    perception: {
      tick: 1, stateVersion: 1, population: 2, stock: {}, constructionProgress: 0, visibleCitizens: [],
      citizen: { id: citizenId, revision: 1, name: `P${citizenId}`, job: "unassigned", traits: [], goal: "", needs: { hunger: .2, fatigue: .2, loneliness: .2, thirst: .2 }, happiness: .5, inventory: {}, position: { x: 1, y: 1 }, relationships: {}, memories: [], currentActivity: "", skills: {} },
    },
    candidates: [{ id: `idle-${citizenId}`, label: "Idle", legal: true, score: null, trace: [], intent: { kind: "idle" } }],
  };
}

describe("LocalBrainDecisionProvider", () => {
  it("batches requests and maps constrained results", async () => {
    const bodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return new Response(JSON.stringify({
        schemaVersion: body.schemaVersion, episodeId: body.episodeId,
        provider: { kind: "local-brain", id: "freewill-local-brain", label: "Local evolving brain", version: "test" },
        decisions: body.decisions.map((decision: { requestId: string; citizenId: number; brainId: string; candidates: Array<{ candidateId: string }> }) => ({
          requestId: decision.requestId, citizenId: decision.citizenId, brainId: decision.brainId,
          selectedCandidateId: decision.candidates[0].candidateId, evaluations: [{ candidateId: decision.candidates[0].candidateId, score: .2, probability: 1 }],
          entropy: 0, confidence: 1, checkpointVersion: "abc", samplingCounter: 1, latencyMs: .4,
        })),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const provider = new LocalBrainDecisionProvider({ episodeId: "episode", fetchImpl, batchWindowMs: 0 });
    const abort = new AbortController();
    const [first, second] = await Promise.all([provider.decide(request("r1", 1), abort.signal), provider.decide(request("r2", 2), abort.signal)]);
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { decisions: unknown[] }).decisions).toHaveLength(2);
    expect(first.selectedCandidateId).toBe("idle-1");
    expect(second.provider.kind).toBe("local-brain");
    expect(second.signals).toMatchObject({ kind: "external", checkpointVersion: "abc" });
  });

  it("sends completed live actions to episode-local learning memory", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ episodeId: "live-episode", accepted: 1, rejected: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const provider = new LocalBrainDecisionProvider({ episodeId: "live-episode", endpoint: "/api/brain/decide-batch", fetchImpl });
    const result = await provider.experience([{
      experienceId: "live-episode:decision-1",
      episodeId: "live-episode",
      brainId: "evolved-brain",
      citizenId: 302,
      decisionId: "decision-1",
      tickStarted: 2,
      tickCompleted: 7,
      selectedCandidateId: "forage-1",
      actionFamily: "forage_wild_food",
      probability: 0.42,
      outcome: "completed",
      deltas: { hunger: 0.2, thirst: 0, fatigue: -0.1, loneliness: 0, health: 0, injury: 0, illness: 0, exposure: 0, inventory: 2, relationships: 0, skills: 0.1, knowledge: 1 },
      consequences: ["Gathered berries."],
      terminal: false,
    }]);
    expect(result).toEqual({ accepted: 1, rejected: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/brain/experience-batch");
    expect(calls[0].body).toMatchObject({ schemaVersion: "freewill-learning-v1", episodeId: "live-episode" });
  });
});
