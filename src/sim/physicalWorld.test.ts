import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import { buildCivilizationDecisionMap } from "./civilizationDecisionMap";
import { findBuildSites, physicalIntentBlockReason } from "./physicalWorld";
import type { DecisionProvider } from "./types";
import type { SimulationWorldSeed } from "./spatial";
import { legacyDurationTicks, simulationDay } from "./time";

const descriptor = { kind: "test-delayed" as const, id: "physical-loop", label: "Physical loop fixture", version: "1" };

const physicalProvider: DecisionProvider = {
  descriptor,
  decide: async (request) => {
    const priorities = ["move_home", "work_construction", "deliver_material", "start_construction", "fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "draw_water", "drink_water", "idle"];
    const selected = priorities
      .map((kind) => request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === kind))
      .find(Boolean) ?? request.candidates.find((candidate) => candidate.legal);
    if (!selected) throw new Error("Physical loop fixture received no legal action.");
    return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
  },
};

function physicalSeed(): SimulationWorldSeed {
  const width = 16;
  const height = 14;
  const walkable = Array.from({ length: width * height }, () => 1);
  const trees = [
    { uid: 40, assetId: "oak", x: 3, y: 4 },
    { uid: 41, assetId: "oak", x: 4, y: 4 },
  ];
  const rocks = [{ uid: 42, assetId: "rock", x: 5, y: 4 }];
  for (const node of [...trees, ...rocks]) walkable[node.y * width + node.x] = 0;
  return {
    width,
    height,
    topologyRevision: 1,
    walkable,
    locations: { plaza: [{ x: 8, y: 7 }], rest: [{ x: 8, y: 7 }] },
    nextObjectUid: 43,
    objects: [
      ...trees.map((tree) => ({ ...tree, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: true, homeCapacity: 0 })),
      ...rocks.map((rock) => ({ ...rock, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: false, homeCapacity: 0 })),
    ],
  };
}

describe("physical resource and construction loop", () => {
  it("gives concurrent builders distinct reachable work positions around one project", async () => {
    const people = [
      { id: 1, name: "Ines", job: "builder", position: { x: 7, y: 7 } },
      { id: 2, name: "Mika", job: "builder", position: { x: 7, y: 8 } },
    ];
    const initial = new MockSimulation(498, people, {}, undefined, undefined, undefined, physicalSeed()).getSnapshot();
    initial.physicalWorld.projects["project:43"] = {
      id: "project:43", objectUid: 43, buildingType: "cottage", position: { x: 8, y: 7 }, workPosition: { x: 9, y: 9 }, footprint: { width: 2, height: 2 },
      owner: { kind: "citizen", id: 1 }, requestedByCitizenId: 1, status: "building", required: {}, delivered: {}, laborRequired: 20, laborCompleted: 0,
      residentIds: [], capacity: 2, createdAtTick: 0,
    };
    initial.physicalWorld.nextObjectUid = 44;
    const simulation = new MockSimulation(498, people, {}, initial, physicalProvider);
    await simulation.step(1);
    await simulation.step(1);
    const actions = Object.values(simulation.getSnapshot().activeActions).filter((action) => action.intent?.kind === "work_construction");
    expect(actions).toHaveLength(2);
    expect(new Set(actions.map((action) => `${action.target.x},${action.target.y}`)).size).toBe(2);
    expect(actions.every((action) => Math.max(Math.abs(action.target.x - 8), Math.abs(action.target.y - 7)) <= 3)).toBe(true);
  });

  it("routes shared construction materials through physical storage before the project", async () => {
    const people = [{ id: 1, name: "Ines", job: "builder", position: { x: 2, y: 2 } }];
    const initial = new MockSimulation(497, people, { wood: 3 }, undefined, undefined, undefined, physicalSeed()).getSnapshot();
    initial.physicalWorld.buildings["43"] = {
      objectUid: 43, buildingType: "storage-pile", position: { x: 2, y: 8 }, owner: { kind: "public", id: "settlement" }, capacity: 0, residentIds: [], condition: 1, completedAtTick: 0,
    };
    initial.physicalWorld.projects["project:44"] = {
      id: "project:44", objectUid: 44, buildingType: "shelter", position: { x: 10, y: 7 }, workPosition: { x: 10, y: 8 }, footprint: { width: 1, height: 1 },
      owner: { kind: "citizen", id: 1 }, requestedByCitizenId: 1, status: "materials", required: { wood: 3 }, delivered: { wood: 0 }, laborRequired: 4, laborCompleted: 0,
      residentIds: [], capacity: 1, createdAtTick: 0,
    };
    initial.physicalWorld.nextObjectUid = 45;
    const simulation = new MockSimulation(497, people, { wood: 3 }, initial, physicalProvider);
    await simulation.step(1);
    const action = Object.values(simulation.getSnapshot().activeActions).find((item) => item.intent?.kind === "deliver_material");
    expect(action?.intent).toMatchObject({ kind: "deliver_material", source: "stock", resource: "wood", amount: 3 });
    expect(action?.route.some((point) => Math.max(Math.abs(point.x - 2), Math.abs(point.y - 8)) <= 1)).toBe(true);
    expect(action?.target).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(Math.max(Math.abs((action?.target.x ?? 0) - 10), Math.abs((action?.target.y ?? 0) - 7))).toBeLessThanOrEqual(2);
    const originalRoute = structuredClone(action?.route);
    await simulation.step(1);
    const continuing = Object.values(simulation.getSnapshot().activeActions).find((item) => item.id === action?.id);
    expect(continuing?.route).toEqual(originalRoute);
    expect(continuing?.repathCount).toBe(0);
  });

  it("requires an empty-handed newcomer to gather and craft before felling a tree", async () => {
    const primitiveProvider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        const inventory = request.perception.citizen.inventory;
        const wanted = (inventory.hand_axe ?? 0) > 0 ? "fell_tree"
          : (inventory.branches ?? 0) < 1 ? "gather_branches"
            : (inventory.stone ?? 0) < 1 ? "gather_loose_stone" : "craft_hand_axe";
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === wanted)
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(499, [{ id: 1, name: "Noor", job: "unassigned", inventory: {}, position: { x: 2, y: 4 } }], {}, undefined, primitiveProvider, undefined, physicalSeed());
    for (let tick = 0; tick < 80; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    const sequence = [...snapshot.decisions].sort((left, right) => left.tick - right.tick).map((decision) => decision.selectedIntent?.kind);
    expect(sequence).toEqual(expect.arrayContaining(["gather_branches", "gather_loose_stone", "craft_hand_axe", "fell_tree"]));
    expect(sequence.indexOf("craft_hand_axe")).toBeLessThan(sequence.indexOf("fell_tree"));
    expect(snapshot.citizens[1].inventory.hand_axe).toBe(1);
  });

  it("turns exact trees into carried wood, a staged cottage, and an assigned home", async () => {
    const simulation = new MockSimulation(
      501,
      [
        { id: 1, name: "Ines", job: "builder", position: { x: 7, y: 7 }, traits: ["Diligent"] },
        { id: 2, name: "Sol", job: "woodcutter", position: { x: 2, y: 4 }, traits: ["Diligent"] },
        { id: 3, name: "Mara", job: "miner", position: { x: 6, y: 4 }, traits: ["Diligent"] },
      ],
      { wheat: 8, wood: 0, stone: 0 },
      undefined,
      physicalProvider,
      undefined,
      physicalSeed(),
    );

    for (let tick = 0; tick < 360; tick += 1) {
      const result = await simulation.step(simulationDay(tick), { copySnapshot: false });
      const live = result?.snapshot;
      if (live && Object.values(live.physicalWorld.projects).some((project) => project.status === "complete")
        && Object.values(live.physicalWorld.buildings).some((building) => building.buildingType === "cottage" && building.residentIds.length >= building.capacity)) break;
    }

    const snapshot = simulation.getSnapshot();
    const resources = Object.values(snapshot.physicalWorld.resources);
    const project = Object.values(snapshot.physicalWorld.projects)[0];
    const building = project ? snapshot.physicalWorld.buildings[String(project.objectUid)] : undefined;
    expect(resources.filter((node) => node.kind === "tree" && node.status === "depleted")).toHaveLength(2);
    expect(resources.filter((node) => node.kind === "stone" && node.status === "depleted")).toHaveLength(1);
    expect(project).toMatchObject({ buildingType: "cottage", status: "complete", delivered: { wood: 6, stone: 2 }, laborCompleted: 8 });
    expect(building).toMatchObject({ buildingType: "cottage", capacity: 2 });
    expect(Object.values(snapshot.citizens).filter((citizen) => citizen.homeObjectUid === building?.objectUid)).toHaveLength(2);
    expect(snapshot.events.some((event) => /fells oak/i.test(event.title))).toBe(true);
    expect(snapshot.events.some((event) => /quarries rock/i.test(event.title))).toBe(true);
    expect(snapshot.events.some((event) => /completes a cottage/i.test(event.title))).toBe(true);
    expect(snapshot.decisions.some((decision) => decision.selectedIntent?.kind === "deliver_material")).toBe(true);
    const decisionMap = buildCivilizationDecisionMap(snapshot);
    expect(decisionMap.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "decision", lane: "resources", intentKind: "fell_tree" }),
      expect.objectContaining({ kind: "decision", lane: "resources", intentKind: "quarry_stone" }),
      expect.objectContaining({ kind: "decision", lane: "construction", intentKind: "deliver_material" }),
      expect.objectContaining({ kind: "decision", lane: "homes", intentKind: "move_home" }),
    ]));
    expect(decisionMap.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "supplied", relation: "advanced" }),
      expect.objectContaining({ label: "made habitable", relation: "advanced" }),
    ]));
  });

  it("does not offer the same reserved tree to a second woodcutter", async () => {
    const seed = physicalSeed();
    seed.objects = seed.objects?.slice(0, 1);
    const simulation = new MockSimulation(502, [
      { id: 1, name: "Sol", job: "woodcutter", position: { x: 2, y: 4 } },
      { id: 2, name: "Mara", job: "woodcutter", position: { x: 2, y: 5 } },
    ], { wheat: 4 }, undefined, physicalProvider, undefined, seed);
    for (let tick = 0; tick < 8; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    const treeDecisions = snapshot.decisions.filter((decision) => decision.selectedIntent?.kind === "fell_tree");
    expect(treeDecisions).toHaveLength(1);
    expect(Object.values(snapshot.reservations).filter((reservation) => reservation.key === "node:tree:40").length).toBeLessThanOrEqual(1);
  });

  it("revalidates public mandates and private ownership at the construction boundary", () => {
    const simulation = new MockSimulation(503, [{ id: 1, name: "Ines", job: "builder", position: { x: 7, y: 7 } }], { wheat: 4 }, undefined, physicalProvider, undefined, physicalSeed());
    const snapshot = simulation.getSnapshot();
    snapshot.politics.institutionStage = "formal";
    const citizen = snapshot.citizens[1];
    const hall = findBuildSites(snapshot, "hall", 1)[0];
    const cottage = findBuildSites(snapshot, "cottage", 1)[0];
    expect(hall).toBeDefined();
    expect(cottage).toBeDefined();
    const context = {
      tick: snapshot.tick,
      stateVersion: snapshot.stateVersion,
      citizen,
      citizens: Object.values(snapshot.citizens),
      stock: snapshot.stock,
      constructionProgress: snapshot.constructionProgress,
      civilizationGoal: snapshot.civilizationGoal,
      economy: snapshot.economy,
      politics: snapshot.politics,
      physicalWorld: snapshot.physicalWorld,
      buildSites: [hall, cottage],
    };
    expect(physicalIntentBlockReason({ kind: "start_construction", buildingType: "hall", x: hall.x, y: hall.y, owner: { kind: "public", id: "settlement" } }, context)).toMatch(/majority mandate/i);
    expect(physicalIntentBlockReason({ kind: "start_construction", buildingType: "cottage", x: cottage.x, y: cottage.y, owner: { kind: "citizen", id: 1 } }, context)).toMatch(/property rights/i);
  });

  it("harvests one exact ripe crop and advances its deterministic growth cycle", async () => {
    const seed = physicalSeed();
    seed.objects = [{ uid: 70, assetId: "wheat", x: 4, y: 4, build: 1, age: 100, footprint: { width: 1, height: 1 }, category: "crop", tree: false, crop: true, homeCapacity: 0 }];
    seed.nextObjectUid = 71;
    const simulation = new MockSimulation(504, [{ id: 1, name: "Paz", job: "farmer", position: { x: 3, y: 4 } }], { wheat: 0 }, undefined, physicalProvider, undefined, seed);
    for (let tick = 0; tick < 20 && !simulation.getSnapshot().events.some((event) => /harvests wheat/i.test(event.title)); tick += 1) await simulation.step(1);
    let snapshot = simulation.getSnapshot();
    expect(snapshot.physicalWorld.resources["crop:70"]).toMatchObject({ kind: "crop", status: "depleted" });
    expect(snapshot.citizens[1].inventory.wheat).toBe(2);
    expect(snapshot.citizens[1].inventory.wheat_seed).toBe(1);
    expect(snapshot.decisions.some((decision) => decision.selectedIntent?.kind === "harvest_crop")).toBe(true);
    let ripened = false;
    for (let tick = 0; tick < legacyDurationTicks(260) && !ripened; tick += 1) {
      const result = await simulation.step(simulationDay(tick), { copySnapshot: false });
      ripened = Boolean(result?.snapshot.events.some((event) => /plot #70 ripens/i.test(event.title)));
    }
    snapshot = simulation.getSnapshot();
    expect(snapshot.events.some((event) => /plot #70 ripens/i.test(event.title))).toBe(true);
  });

  it("reserves and conserves private construction funding when a site opens", async () => {
    const inputs = [{ id: 1, name: "Ines", job: "builder", position: { x: 7, y: 7 } }];
    const initial = new MockSimulation(505, inputs, { wheat: 4 }, undefined, physicalProvider, undefined, physicalSeed(), { societyGoal: "market-economy" }).getSnapshot();
    initial.economy.policies.privateProperty = true;
    initial.economy.policies.currency = true;
    initial.economy.wallets[1] = 10;
    initial.economy.moneySupply = 10;
    const simulation = new MockSimulation(505, inputs, {}, initial, physicalProvider);
    for (let tick = 0; tick < 30 && !Object.keys(simulation.getSnapshot().physicalWorld.projects).length; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    const project = Object.values(snapshot.physicalWorld.projects)[0];
    expect(project?.owner).toEqual({ kind: "citizen", id: 1 });
    expect(snapshot.economy.wallets[1]).toBe(6);
    const escrow = project?.escrowId ? snapshot.physicalWorld.escrows[project.escrowId] : undefined;
    expect(snapshot.economy.treasury).toBe(0);
    expect(escrow).toMatchObject({ deposited: 4, balance: 4, spent: 0, status: "held" });
    expect(snapshot.economy.wallets[1] + snapshot.economy.treasury + (escrow?.balance ?? 0)).toBe(snapshot.economy.moneySupply);
    expect(snapshot.decisions.find((decision) => decision.selectedIntent?.kind === "start_construction")?.consequences).toContain("4 shells are held in refundable project escrow.");
  });
});
