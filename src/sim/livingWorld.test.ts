import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import type { ActionCandidate, DecisionProvider } from "./types";
import type { SimulationWorldSeed } from "./spatial";

const descriptor = { kind: "test-delayed" as const, id: "living-world", label: "Living world scenario", version: "1" };

function provider(selectors: Array<(candidate: ActionCandidate) => boolean>): DecisionProvider {
  return {
    descriptor,
    decide: async (request) => {
      const legal = request.candidates.filter((candidate) => candidate.legal);
      const selected = selectors.map((selector) => legal.find(selector)).find(Boolean)
        ?? legal.find((candidate) => candidate.intent?.kind === "idle")
        ?? legal[0];
      if (!selected) throw new Error("Living world fixture received no legal action.");
      return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
    },
  };
}

const isKind = (kind: string) => (candidate: ActionCandidate) => candidate.intent?.kind === kind;

function villageSeed(objects: NonNullable<SimulationWorldSeed["objects"]> = []): SimulationWorldSeed {
  const width = 20;
  const height = 12;
  return {
    width,
    height,
    topologyRevision: 1,
    walkable: Array.from({ length: width * height }, () => 1),
    locations: { plaza: [{ x: 2, y: 6 }], rest: [{ x: 2, y: 6 }], fields: [{ x: 17, y: 6 }], food: [{ x: 17, y: 6 }], shore: [{ x: 1, y: 6 }] },
    nextObjectUid: Math.max(1, ...objects.map((object) => object.uid + 1)),
    objects,
  };
}

async function runUntil(simulation: MockSimulation, predicate: () => boolean, limit = 900) {
  for (let tick = 0; tick < limit && !predicate(); tick += 1) await simulation.step(1 + Math.floor(tick / 12));
  expect(predicate()).toBe(true);
}

describe("living settlement systems", () => {
  it("lets five villagers vote on one exact road, then funds, builds, and uses its escrow", async () => {
    const voters = [
      { id: 1, name: "Inez", job: "builder", position: { x: 2, y: 6 }, traits: ["Diligent"] },
      { id: 2, name: "Sol", job: "miner", position: { x: 3, y: 6 } },
      { id: 3, name: "Paz", job: "farmer", position: { x: 4, y: 6 } },
      { id: 4, name: "Mara", job: "woodcutter", position: { x: 5, y: 6 } },
      { id: 5, name: "Ari", job: "fisher", position: { x: 6, y: 6 } },
    ];
    const initial = new MockSimulation(610, voters, { wood: 20, stone: 40, wheat: 20 }, undefined, undefined, undefined, villageSeed()).getSnapshot();
    initial.economy.policies.currency = true;
    initial.politics.institutionStage = "formal";
    initial.economy.treasury = 30;
    initial.economy.moneySupply = 30;
    const scripted = provider([
      (candidate) => candidate.intent?.kind === "cast_ballot" && candidate.intent.choice === "support",
      (candidate) => candidate.intent?.kind === "respond_to_vote" && candidate.intent.response === "accept",
      (candidate) => candidate.intent?.kind === "propose_public_project" && candidate.intent.plan.operation === "road",
      (candidate) => candidate.intent?.kind === "start_construction" && candidate.intent.buildingType === "road",
      isKind("deliver_material"),
      isKind("work_construction"),
      isKind("idle"),
    ]);
    const simulation = new MockSimulation(610, voters, {}, initial, scripted);

    await runUntil(simulation, () => Object.values(simulation.getSnapshot().physicalWorld.projects).some((project) => project.buildingType === "road" && project.status === "complete"));
    const snapshot = simulation.getSnapshot();
    const proposal = Object.values(snapshot.politics.proposals).find((item) => item.projectPlan?.operation === "road");
    const project = Object.values(snapshot.physicalWorld.projects).find((item) => item.buildingType === "road")!;
    const mandate = proposal ? snapshot.physicalWorld.mandates[proposal.id] : undefined;
    const escrow = project.escrowId ? snapshot.physicalWorld.escrows[project.escrowId] : undefined;

    expect(proposal).toMatchObject({ status: "adopted", tally: { support: 5, oppose: 0, abstain: 0 } });
    expect(Object.keys(proposal?.ballots ?? {})).toHaveLength(5);
    expect(mandate).toMatchObject({ status: "fulfilled", projectId: project.id });
    expect(snapshot.physicalWorld.roads).not.toEqual({});
    expect(Object.values(snapshot.physicalWorld.roads).every((road) => snapshot.topology.moveCost[road.position.y * snapshot.topology.width + road.position.x] === 450)).toBe(true);
    expect(escrow?.status).toBe("settled");
    expect((escrow?.spent ?? 0) + (escrow?.refunded ?? 0)).toBe(escrow?.deposited);
    expect(escrow?.payouts.length).toBeGreaterThan(0);
    expect(snapshot.economy.treasury + Object.values(snapshot.economy.wallets).reduce((sum, amount) => sum + amount, 0) + (escrow?.balance ?? 0)).toBe(snapshot.economy.moneySupply);
  });

  it("draws water from a working well and drinks it to reduce thirst", async () => {
    const well = { uid: 80, assetId: "well", x: 5, y: 5, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "building", tree: false, homeCapacity: 0 };
    const people = [{ id: 1, name: "Paz", job: "farmer", position: { x: 4, y: 5 }, inventory: { water_container: 1 }, initialNeeds: { thirst: 0.95 } }];
    const simulation = new MockSimulation(611, people, { wheat: 4 }, undefined, provider([isKind("drink_water"), isKind("draw_water"), isKind("idle")]), undefined, villageSeed([well]));
    await runUntil(simulation, () => simulation.getSnapshot().events.some((event) => /drinks water/i.test(event.title)), 80);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.events.some((event) => /draws water/i.test(event.title))).toBe(true);
    expect(snapshot.citizens[1].needs.thirst).toBeLessThan(0.6);
    expect(snapshot.citizens[1].inventory.water).toBe(1);
  });

  it("survives without a well by slowly collecting untreated shore water", async () => {
    const people = [{ id: 1, name: "Paz", job: "farmer", position: { x: 4, y: 6 }, inventory: { water_container: 1 }, initialNeeds: { thirst: 0.95 } }];
    const simulation = new MockSimulation(615, people, { wheat: 4 }, undefined, provider([isKind("drink_water"), isKind("collect_water"), isKind("idle")]), undefined, villageSeed());
    await runUntil(simulation, () => simulation.getSnapshot().events.some((event) => /drinks water/i.test(event.title)), 100);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.events.some((event) => /collects water from the shore/i.test(event.title))).toBe(true);
    expect(snapshot.citizens[1].needs.thirst).toBeLessThan(0.6);
    expect(snapshot.physicalWorld.buildings).toEqual({});
  });

  it("uses shared starting water before walking to an untreated source", async () => {
    const people = [{ id: 1, name: "Paz", job: "farmer", position: { x: 4, y: 6 }, initialNeeds: { thirst: 0.95 } }];
    const simulation = new MockSimulation(616, people, { wheat: 4, water: 1 }, undefined, provider([isKind("drink_water"), isKind("collect_water"), isKind("idle")]), undefined, villageSeed());
    await runUntil(simulation, () => simulation.getSnapshot().events.some((event) => /drinks water/i.test(event.title)), 40);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.stock.water).toBe(0);
    expect(snapshot.citizens[1].needs.thirst).toBeLessThan(0.6);
    expect(snapshot.events.some((event) => /collects water from the shore/i.test(event.title))).toBe(false);
  });

  it("spoils dated food into waste while a storehouse extends its lifetime", async () => {
    const storehouse = { uid: 90, assetId: "storehouse", x: 7, y: 5, build: 1, age: 0, footprint: { width: 2, height: 2 }, category: "building", tree: false, homeCapacity: 0 };
    const people = [{ id: 1, name: "Ari", job: "wanderer", position: { x: 2, y: 6 } }];
    const base = new MockSimulation(612, people, { wheat: 3 }, undefined, undefined, undefined, villageSeed([storehouse])).getSnapshot();
    base.physicalWorld.foodLots = {
      loose: { id: "loose", resource: "wheat", amount: 2, owner: { kind: "stock" }, producedAtTick: 0, expiresAtTick: 1 },
      stored: { id: "stored", resource: "wheat", amount: 1, owner: { kind: "stock" }, producedAtTick: 0, expiresAtTick: 20, storageBuildingUid: 90 },
    };
    const simulation = new MockSimulation(612, people, {}, base, provider([isKind("idle")]));
    await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.stock.wheat).toBe(1);
    expect(snapshot.physicalWorld.waste).toBe(2);
    expect(snapshot.physicalWorld.foodLots.stored).toBeDefined();
    expect(snapshot.events.some((event) => /wheat spoils/i.test(event.title))).toBe(true);
  });

  it("requires exact mandates for major repairs and demolition, then keeps a demolition tombstone", async () => {
    const cottage = { uid: 100, assetId: "cottage", x: 8, y: 5, build: 1, age: 0, footprint: { width: 2, height: 2 }, category: "building", tree: false, homeCapacity: 2 };
    const people = [{ id: 1, name: "Inez", job: "builder", position: { x: 7, y: 5 }, traits: ["Diligent"] }];
    const base = new MockSimulation(613, people, { wood: 4, stone: 4 }, undefined, undefined, undefined, villageSeed([cottage])).getSnapshot();
    base.physicalWorld.buildings["100"].condition = 0.1;
    base.economy.treasury = 5;
    base.economy.moneySupply = 5;
    base.physicalWorld.mandates.repair = { id: "repair", proposalId: "repair", plan: { operation: "repair", targetKind: "building", targetId: "100", budget: 3, required: { wood: 1, stone: 1 }, laborRequired: 1, label: "cottage #100" }, status: "authorized", authorizedAtTick: 0, expiresAtTick: 100 };
    const repairSimulation = new MockSimulation(613, people, {}, base, provider([(candidate) => candidate.intent?.kind === "repair_structure" && candidate.intent.mandateId === "repair", isKind("idle")]));
    await runUntil(repairSimulation, () => repairSimulation.getSnapshot().physicalWorld.mandates.repair.status === "fulfilled", 80);
    const repaired = repairSimulation.getSnapshot();
    expect(repaired.physicalWorld.buildings["100"].condition).toBeCloseTo(0.5);
    expect(repaired.economy.wallets[1]).toBe(3);
    expect(repaired.economy.treasury).toBe(2);

    repaired.physicalWorld.buildings["100"].condition = 0.1;
    repaired.physicalWorld.mandates.demolish = { id: "demolish", proposalId: "demolish", plan: { operation: "demolish", targetKind: "building", targetId: "100", budget: 0, required: { wood: 0, stone: 0 }, laborRequired: 1, label: "cottage #100" }, status: "authorized", authorizedAtTick: repaired.tick, expiresAtTick: repaired.tick + 100 };
    const demolitionSimulation = new MockSimulation(613, people, {}, repaired, provider([(candidate) => candidate.intent?.kind === "demolish_structure" && candidate.intent.mandateId === "demolish", isKind("idle")]));
    await runUntil(demolitionSimulation, () => !demolitionSimulation.getSnapshot().physicalWorld.buildings["100"], 100);
    const demolished = demolitionSimulation.getSnapshot();
    expect(Object.values(demolished.physicalWorld.demolitions)).toEqual([expect.objectContaining({ buildingObjectUid: 100, buildingType: "cottage", mandateId: "demolish", conditionAtDemolition: 0.1 })]);
    expect(demolished.topology.walkable[5 * demolished.topology.width + 8]).toBe(1);
  });

  it("refunds only the unspent escrow and returns delivered materials when a private project is cancelled", async () => {
    const people = [{ id: 1, name: "Inez", job: "builder", position: { x: 6, y: 5 } }];
    const base = new MockSimulation(614, people, { wheat: 2 }, undefined, undefined, undefined, villageSeed()).getSnapshot();
    base.economy.policies.privateProperty = true;
    base.economy.policies.currency = true;
    base.economy.wallets[1] = 7;
    base.economy.moneySupply = 10;
    base.physicalWorld.nextObjectUid = 201;
    base.physicalWorld.projects["project:200"] = {
      id: "project:200", objectUid: 200, buildingType: "cottage", position: { x: 8, y: 5 }, workPosition: { x: 9, y: 7 }, footprint: { width: 2, height: 2 }, owner: { kind: "citizen", id: 1 }, requestedByCitizenId: 1,
      status: "materials", required: { wood: 6, stone: 2 }, delivered: { wood: 3, stone: 1 }, laborRequired: 8, laborCompleted: 1, residentIds: [], capacity: 2, createdAtTick: 0, escrowId: "escrow:200",
    };
    base.physicalWorld.escrows["escrow:200"] = { id: "escrow:200", projectId: "project:200", payer: { kind: "citizen", id: 1 }, deposited: 4, balance: 3, spent: 1, refunded: 0, status: "held", payouts: [{ citizenId: 1, amount: 1, tick: 0, reason: "labor" }] };
    for (let y = 5; y < 7; y += 1) for (let x = 8; x < 10; x += 1) base.topology.walkable[y * base.topology.width + x] = 0;
    const simulation = new MockSimulation(614, people, {}, base, provider([isKind("cancel_project"), isKind("idle")]));
    await runUntil(simulation, () => simulation.getSnapshot().physicalWorld.projects["project:200"].status === "cancelled", 80);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.physicalWorld.escrows["escrow:200"]).toMatchObject({ balance: 0, spent: 1, refunded: 3, status: "refunded" });
    expect(snapshot.economy.wallets[1]).toBe(10);
    expect(snapshot.citizens[1].inventory).toMatchObject({ wood: 3, stone: 1 });
    expect(snapshot.topology.walkable[5 * snapshot.topology.width + 8]).toBe(1);
    expect(snapshot.economy.wallets[1] + snapshot.physicalWorld.escrows["escrow:200"].balance).toBe(snapshot.economy.moneySupply);
  });
});
