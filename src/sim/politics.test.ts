import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import { createCivilizationGoal, createEconomyState } from "./economy";
import { advancePolitics, assertPoliticsInvariants, buildPoliticalCandidates, createPoliticsState, executePoliticalIntent, politicalIntentBlockReason } from "./politics";
import type { ActionIntent, CitizenState, DecisionProvider, DecisionRequest } from "./types";

function citizens(count: number): CitizenState[] {
  return Array.from({ length: count }, (_, index) => new MockSimulation(index + 1, [{ id: index + 1, name: `Citizen ${index + 1}`, job: index % 3 === 0 ? "merchant" : "farmer", traits: index === 1 ? ["Bold"] : [] }], {}).getSnapshot().citizens[index + 1]);
}

function context(population = 3) {
  const people = citizens(population);
  return {
    tick: 1,
    citizen: people[0],
    citizens: people,
    politics: createPoliticsState(people.map((citizen) => citizen.id)),
    economy: createEconomyState(),
    civilizationGoal: createCivilizationGoal("market-economy"),
    stock: { wheat: 3 },
  };
}

describe("direct-majority politics", () => {
  it("waits for every eligible ballot, adopts a strict majority, and preserves dissent", () => {
    const state = context(3);
    executePoliticalIntent({ kind: "propose_policy", policyId: "market-charter" }, state);
    const proposalId = state.politics.activeProposalId!;

    state.tick = 2;
    executePoliticalIntent({ kind: "cast_ballot", proposalId, choice: "support" }, state);
    expect(state.politics.proposals[proposalId]).toMatchObject({ status: "voting", tally: { support: 1, oppose: 0, abstain: 0 } });
    state.citizen = state.citizens[1];
    state.tick = 3;
    executePoliticalIntent({ kind: "cast_ballot", proposalId, choice: "oppose" }, state);
    expect(state.politics.proposals[proposalId].status).toBe("voting");
    state.citizen = state.citizens[2];
    state.tick = 4;
    executePoliticalIntent({ kind: "cast_ballot", proposalId, choice: "support" }, state);

    expect(state.politics.proposals[proposalId]).toMatchObject({ status: "adopted", tally: { support: 2, oppose: 1, abstain: 0 } });
    expect(state.politics.laws["market-charter"]).toBeDefined();
    expect(state.economy.moneySupply).toBe(60);
    expect(state.politics.activeProposalId).toBe(proposalId);

    state.citizen = state.citizens[1];
    const reactions = buildPoliticalCandidates({ ...state, stateVersion: 4, constructionProgress: 0 });
    expect(reactions.map((candidate) => candidate.intent)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "respond_to_vote", response: "accept" }),
      expect.objectContaining({ kind: "respond_to_vote", response: "organize" }),
      expect.objectContaining({ kind: "respond_to_vote", response: "rebel" }),
    ]));
    executePoliticalIntent({ kind: "respond_to_vote", proposalId, response: "rebel" }, state);
    expect(Object.values(state.politics.factions)[0]).toMatchObject({ memberIds: [2], position: "oppose" });
    expect(Object.values(state.politics.collectiveActions)[0]).toMatchObject({ kind: "rebellion", status: "organizing" });
    assertPoliticsInvariants(state.politics, state.citizens);
  });

  it("keeps the status quo on a tie and rejects duplicate ballots at the authority boundary", () => {
    const state = context(2);
    executePoliticalIntent({ kind: "propose_policy", policyId: "market-charter" }, state);
    const proposalId = state.politics.activeProposalId!;
    executePoliticalIntent({ kind: "cast_ballot", proposalId, choice: "support" }, state);
    expect(politicalIntentBlockReason({ kind: "cast_ballot", proposalId, choice: "oppose" }, { ...state, stateVersion: 1, constructionProgress: 0 })).toMatch(/already voted/i);
    state.citizen = state.citizens[1];
    executePoliticalIntent({ kind: "cast_ballot", proposalId, choice: "oppose" }, state);
    expect(state.politics.proposals[proposalId].status).toBe("rejected");
    expect(state.politics.laws["market-charter"]).toBeUndefined();
    expect(state.economy.moneySupply).toBe(0);
  });

  it("records one immutable ballot from each of 50 villagers before resolving", async () => {
    const roster = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, name: `V${index + 1}`, job: "farmer" }));
    const descriptor = { kind: "test-delayed" as const, id: "assembly-fixture", label: "Assembly fixture", version: "1" };
    const provider: DecisionProvider = {
      descriptor,
      async decide(request: DecisionRequest) {
        const priorities: ActionIntent["kind"][] = ["cast_ballot", "respond_to_vote", "propose_policy", "idle"];
        const selected = priorities.map((kind) => request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === kind)).find(Boolean) ?? request.candidates.find((candidate) => candidate.legal);
        if (!selected) throw new Error("No legal option.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(41, roster, { wheat: 100 }, undefined, provider, undefined, undefined, { societyGoal: "market-economy" });
    for (let tick = 0; tick < 1_200; tick += 1) {
      await simulation.step(1 + Math.floor(tick / 12));
      const proposal = Object.values(simulation.getSnapshot().politics.proposals)[0];
      if (proposal && proposal.status !== "voting") break;
    }
    const proposal = Object.values(simulation.getSnapshot().politics.proposals)[0];
    expect(proposal.status).toBe("adopted");
    expect(proposal.eligibleVoterIds).toHaveLength(50);
    expect(Object.keys(proposal.ballots)).toHaveLength(50);
    expect(new Set(Object.values(proposal.ballots).map((ballot) => ballot.citizenId)).size).toBe(50);
  }, 20_000);

  it("lets a majority-backed rebellion change the administration without removing public law votes", () => {
    const politics = createPoliticsState([1, 2, 3]);
    politics.factions.reform = { id: "reform", name: "Reform front", founderId: 1, proposalId: "old-law", position: "oppose", memberIds: [1, 2], influence: 2 / 3, radicalization: 0.8, createdAtTick: 1 };
    politics.collectiveActions.rebellion = { id: "rebellion", factionId: "reform", kind: "rebellion", participantIds: [1, 2], status: "organizing", startedAtTick: 1 };
    expect(advancePolitics(politics, 3, 1)[0]?.title).toMatch(/collective action/i);
    const events = advancePolitics(politics, 15, 2);
    expect(politics.collectiveActions.rebellion).toMatchObject({ status: "resolved", outcome: "administration-changed" });
    expect(politics.administration).toMatchObject({ form: "faction-council", governingFactionId: "reform" });
    expect(politics.constitution).toMatchObject({ system: "direct-majority", ballot: "one-person-one-vote" });
    expect(events[0]?.detail).toMatch(/public majority vote/i);
  });
});
