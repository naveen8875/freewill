import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import { snapshotDigest } from "./snapshotDigest";
import { assertEconomyInvariants, buildEconomicCandidates, createCivilizationGoal, createEconomyState, economicIntentBlockReason } from "./economy";
import { buildCivilizationDecisionMap } from "./civilizationDecisionMap";
import type { ActionIntent, DecisionProvider, DecisionRequest } from "./types";

const citizens = [
  { id: 1, name: "Mika", job: "farmer", traits: ["Diligent"], goal: "Support the shared objective", position: { x: 1, y: 1 } },
  { id: 2, name: "Sol", job: "woodcutter", traits: ["Bold"], goal: "Master a useful craft", position: { x: 2, y: 1 } },
  { id: 3, name: "Ines", job: "builder", traits: ["Patient"], goal: "Build a secure home", position: { x: 3, y: 1 } },
  { id: 4, name: "Teo", job: "merchant", traits: ["Sociable"], goal: "Support the shared objective", position: { x: 4, y: 1 } },
  { id: 5, name: "Lía", job: "baker", traits: ["Frugal"], goal: "Support the shared objective", position: { x: 5, y: 1 } },
];

const spatial = {
  width: 8, height: 8, topologyRevision: 0, walkable: Array(64).fill(1),
  locations: {
    plaza: [{ x: 3, y: 3 }], fields: [{ x: 2, y: 3 }], food: [{ x: 2, y: 3 }], sites: [{ x: 4, y: 3 }], rest: [{ x: 3, y: 2 }],
    "job:farmer": [{ x: 2, y: 3 }], "job:woodcutter": [{ x: 1, y: 3 }], "job:builder": [{ x: 4, y: 3 }], "job:merchant": [{ x: 3, y: 3 }], "job:baker": [{ x: 5, y: 3 }],
  },
};

const descriptor = { kind: "test-delayed" as const, id: "market-fixture", label: "Market fixture", version: "1" };

function intentKind(candidates: DecisionRequest["candidates"], candidateId: string) {
  return candidates.find((candidate) => candidate.id === candidateId)?.intent?.kind;
}

const marketProvider: DecisionProvider = {
  descriptor,
  async decide(request) {
    const priorities: ActionIntent["kind"][] = [
      "cast_ballot",
      "respond_to_vote",
      "propose_policy",
      "support_market_charter",
      "propose_market_charter",
      "accept_job",
      "buy_good",
      "register_business",
      "list_good",
      "offer_job",
      "invest_business",
      "work_job",
      "gather_food",
      "eat",
      "rest",
      "socialize",
      "idle",
    ];
    const selected = priorities.map((kind) => request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === kind)).find(Boolean)
      ?? request.candidates.find((candidate) => candidate.legal);
    if (!selected) throw new Error("Market fixture received no legal candidate.");
    return {
      requestId: request.requestId,
      selectedCandidateId: selected.id,
      provider: descriptor,
      signals: { kind: "external", evaluations: [{ candidateId: selected.id, probability: 1 }] },
    };
  },
};

async function marketRun(ticks: number) {
  const simulation = new MockSimulation(211, citizens, { wheat: 8, fish: 3, bread: 2, wood: 10, stone: 6 }, undefined, marketProvider, undefined, spatial, { societyGoal: "market-economy" });
  for (let tick = 0; tick < ticks; tick += 1) await simulation.step(1 + Math.floor(tick / 12));
  return simulation;
}

describe("market economy simulation", () => {
  it("reaches capital formation with the default mock provider in a five-citizen world", async () => {
    const simulation = new MockSimulation(211, citizens, { wheat: 8, fish: 3, bread: 2, wood: 10, stone: 6 }, undefined, undefined, undefined, spatial, { societyGoal: "market-economy" });
    for (let tick = 0; tick < 800 && simulation.getSnapshot().civilizationGoal.stage !== "capital-formation"; tick += 1) await simulation.step(1 + Math.floor(tick / 12));
    const snapshot = simulation.getSnapshot();
    expect(snapshot.civilizationGoal.stage).toBe("capital-formation");
    expect(snapshot.economy.charter?.status).toBe("adopted");
    expect(snapshot.economy.charter?.opponentIds.length).toBeGreaterThan(0);
    expect(snapshot.economy.transactions.some((transaction) => transaction.kind === "trade")).toBe(true);
    expect(snapshot.economy.transactions.some((transaction) => transaction.kind === "wage")).toBe(true);
    expect(snapshot.economy.transactions.some((transaction) => transaction.kind === "investment")).toBe(true);
    const listingDecision = snapshot.decisions.find((decision) => decision.selectedIntent?.kind === "list_good");
    expect(listingDecision?.providerSignals?.kind).toBe("heuristic");
    expect(listingDecision?.candidates.filter((candidate) => candidate.intent?.kind === "list_good" && candidate.intent.resource === (listingDecision.selectedIntent?.kind === "list_good" ? listingDecision.selectedIntent.resource : "")).length).toBeGreaterThan(1);
    expect(listingDecision?.candidates.find((candidate) => candidate.id === listingDecision.selectedCandidateId)?.trace.map((entry) => entry.rule)).toEqual(expect.arrayContaining(["frugal premium preference", "sociable quick-sale preference"]));
    const purchaseDecision = snapshot.decisions.find((decision) => decision.selectedIntent?.kind === "buy_good");
    expect(purchaseDecision?.candidates.find((candidate) => candidate.id === purchaseDecision.selectedCandidateId)?.trace.map((entry) => entry.rule)).toContain("lower asking price");
    expect(purchaseDecision).toMatchObject({ targetMode: "citizen", interactionRadius: 1, targetCitizenId: expect.any(Number) });
  }, 20_000);

  it("adopts a charter in a one-citizen world and permits a revised proposal after rejection", async () => {
    const solo = new MockSimulation(7, [citizens[0]], { wheat: 2 }, undefined, marketProvider, undefined, spatial, { societyGoal: "market-economy" });
    for (let tick = 0; tick < 16 && solo.getSnapshot().economy.charter?.status !== "adopted"; tick += 1) await solo.step(1);
    expect(solo.getSnapshot().economy.charter?.status).toBe("adopted");
    expect(solo.getSnapshot().economy.wallets[1]).toBe(20);
    expect(solo.getSnapshot().economy.moneySupply).toBe(20);

    const economy = createEconomyState();
    economy.charter = { id: "rejected-1", proposerId: 1, supporterIds: [1], opponentIds: [2, 3], status: "rejected", createdAtTick: 1, resolvedAtTick: 4 };
    const retry = buildEconomicCandidates({
      tick: 5,
      stateVersion: 5,
      citizen: solo.getSnapshot().citizens[1],
      citizens: [solo.getSnapshot().citizens[1]],
      stock: {},
      constructionProgress: 0,
      civilizationGoal: createCivilizationGoal("market-economy"),
      economy,
    });
    expect(retry).toEqual(expect.arrayContaining([expect.objectContaining({ intent: { kind: "propose_market_charter" }, legal: true })]));
  });

  it("rejects malformed parameterized intents at the authoritative executor boundary", () => {
    const citizen = { ...new MockSimulation(9, [citizens[0]], {}).getSnapshot().citizens[1], inventory: { wheat: 2 } };
    const economy = createEconomyState();
    economy.policies = { privateProperty: true, currency: true, contracts: true, taxRate: 0, publicFoodReserve: false };
    economy.charter = { id: "charter-1", proposerId: 1, supporterIds: [1], opponentIds: [], status: "adopted", createdAtTick: 0, resolvedAtTick: 0 };
    economy.wallets[1] = 20;
    economy.businesses.owned = { id: "owned", name: "Mika's Fields", kind: "farmer", ownerId: 1, capital: 5, inventory: { wheat: 2 }, employeeIds: [], organization: "sole-proprietorship", facilityObjectUids: [], blockers: [], productionRuns: 0, createdAtTick: 0 };
    const context = { tick: 1, stateVersion: 1, citizen, citizens: [citizen], stock: {}, constructionProgress: 0, civilizationGoal: createCivilizationGoal("market-economy"), economy };
    expect(economicIntentBlockReason({ kind: "list_good", ownerType: "citizen", ownerId: "999", resource: "wheat", amount: 1, unitPrice: 3 }, context)).toMatch(/own inventory/i);
    expect(economicIntentBlockReason({ kind: "list_good", ownerType: "business", ownerId: "missing", resource: "wheat", amount: 1, unitPrice: 3 }, context)).toMatch(/business they own/i);
    expect(economicIntentBlockReason({ kind: "buy_good", offerId: "missing", amount: 0 }, context)).toMatch(/positive whole number/i);
    expect(economicIntentBlockReason({ kind: "offer_job", businessId: "owned", workerId: 1, wage: 3 }, context)).toMatch(/own job offer/i);
    expect(economicIntentBlockReason({ kind: "register_business", businessKind: "smith" }, context)).toMatch(/match the citizen's occupation/i);
    const listingPrices = buildEconomicCandidates(context)
      .flatMap((candidate) => candidate.intent?.kind === "list_good" && candidate.intent.resource === "wheat" ? [candidate.intent.unitPrice] : []);
    expect(listingPrices).toEqual([2, 3, 4]);
    economy.offers.forged = { id: "forged", sellerId: 1, businessId: "missing", sourceOwnerType: "business", sourceOwnerId: "missing", resource: "wheat", amountRemaining: 1, unitPrice: 3, status: "open", createdAtTick: 0, expiresAtTick: 10 };
    expect(() => assertEconomyInvariants(economy, [citizen])).toThrow(/invalid business ownership/i);
  });

  it("builds institutions through trusted intents and conserves money", async () => {
    const simulation = await marketRun(320);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.economy.charter?.status).toBe("adopted");
    expect(snapshot.economy.policies).toMatchObject({ privateProperty: true, currency: true, contracts: true });
    expect(Object.keys(snapshot.economy.businesses).length).toBeGreaterThan(0);
    expect(snapshot.economy.ownership.length).toBeGreaterThan(0);
    expect(snapshot.economy.transactions.some((entry) => entry.kind === "trade")).toBe(true);
    expect(snapshot.economy.transactions.some((entry) => entry.kind === "investment")).toBe(true);
    expect(snapshot.economy.transactions.some((entry) => entry.kind === "wage")).toBe(true);
    expect(snapshot.civilizationGoal.stage).toBe("capital-formation");
    expect(snapshot.economy.transactions.some((entry) => entry.kind === "trade" && entry.toId.startsWith("business:"))).toBe(true);

    const decisionMap = buildCivilizationDecisionMap(snapshot);
    const nodeIds = new Set(decisionMap.nodes.map((node) => node.id));
    expect(decisionMap.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "milestone:charter", status: "completed" }),
      expect.objectContaining({ id: "milestone:market", status: "completed" }),
      expect.objectContaining({ id: "milestone:employment", status: "completed" }),
      expect.objectContaining({ id: "milestone:investment", status: "completed", kind: "outcome" }),
      expect.objectContaining({ kind: "decision", intentKind: "buy_good", status: "completed" }),
    ]));
    expect(decisionMap.edges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))).toBe(true);
    expect(decisionMap.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ to: "milestone:market", relation: "advanced" }),
      expect.objectContaining({ to: "milestone:employment", relation: "advanced" }),
      expect.objectContaining({ to: "milestone:investment", relation: "advanced" }),
    ]));

    const totalMoney = Object.values(snapshot.economy.wallets).reduce((total, amount) => total + amount, 0)
      + Object.values(snapshot.economy.businesses).reduce((total, business) => total + business.capital, 0)
      + Object.values(snapshot.economy.contracts).reduce((total, contract) => total + contract.escrowedWage, 0)
      + snapshot.economy.treasury;
    expect(totalMoney).toBe(citizens.length * 20);
    expect(totalMoney).toBe(snapshot.economy.moneySupply);
    expect(Object.values(snapshot.economy.wallets).every((amount) => Number.isFinite(amount) && amount >= 0)).toBe(true);
    expect(Object.values(snapshot.economy.businesses).every((business) => business.capital >= 0 && Object.values(business.inventory).every((amount) => amount >= 0))).toBe(true);
    expect(snapshot.decisions.filter((decision) => decision.selectedIntent && !["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"].includes(decision.selectedIntent.kind)).every((decision) => decision.selectedCandidateId && intentKind(decision.candidates, decision.selectedCandidateId) === decision.selectedIntent?.kind)).toBe(true);
  }, 20_000);

  it("continues deterministically from a snapshot with active economic state", async () => {
    const original = await marketRun(180);
    const midpoint = original.getSnapshot();
    const restored = new MockSimulation(211, citizens, {}, midpoint, marketProvider);
    for (let tick = 180; tick < 260; tick += 1) {
      const day = 1 + Math.floor(tick / 12);
      await original.step(day);
      await restored.step(day);
    }
    expect(snapshotDigest(restored.getSnapshot())).toBe(snapshotDigest(original.getSnapshot()));
  }, 20_000);
});

