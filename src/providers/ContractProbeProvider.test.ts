import { describe, expect, it } from "vitest";
import { buildActionCandidates } from "../sim/actionCandidates";
import { DecisionCoordinator } from "../sim/DecisionCoordinator";
import { MockDecisionProvider } from "../sim/MockDecisionProvider";
import type { DecisionProvider, DecisionRequest } from "../sim/types";
import { ContractProbeProvider } from "./ContractProbeProvider";

const citizen = {
  id: 1, revision: 1, position: { x: 2, y: 2 }, facing: "down" as const, name: "Rowan", job: "farmer",
  traits: ["Diligent"], goal: "Feed the village", needs: { hunger: 0.4, fatigue: 0.2, loneliness: 0.3 },
  happiness: 0.7, inventory: {}, relationships: {}, memories: [], currentActivity: "Waiting", skills: { farming: { level: 0.35, experience: 35 } },
};

function request(): DecisionRequest {
  const context = { tick: 4, stateVersion: 8, citizen, citizens: [citizen], stock: { wheat: 2 }, constructionProgress: 0.2 };
  return {
    requestId: "probe-4-1", policyVersion: "test-v1",
    freshness: { requestedAtTick: 4, deadlineTick: 8, worldRevision: 1, npcRevision: 1, topologyRevision: 1, perceptionHash: "p", legalSetHash: "l" },
    perception: { tick: 4, stateVersion: 8, citizen, population: 1, visibleCitizens: [{ id: 1, position: citizen.position }], stock: context.stock, constructionProgress: 0.2 },
    candidates: buildActionCandidates(context),
  };
}

describe("ContractProbeProvider", () => {
  it("round-trips a decision through JSON and the generic coordinator port", async () => {
    const probe: DecisionProvider = new ContractProbeProvider(0);
    const result = await new DecisionCoordinator(probe, new MockDecisionProvider(5)).decide(request());
    expect(result.status).toBe("accepted");
    expect(result.decision?.provider.id).toBe("json-contract-probe");
  });

  it("cannot smuggle an invalid envelope past validation", async () => {
    const probe: DecisionProvider = new ContractProbeProvider(0, true);
    const result = await new DecisionCoordinator(probe, new MockDecisionProvider(5)).decide(request());
    expect(result).toMatchObject({ status: "fallback", reason: "request-id-mismatch" });
    expect(result.decision?.provider.kind).toBe("mock");
  });
});
