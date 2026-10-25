import { describe, expect, it } from "vitest";
import { parseWorldDocument, type WorldDocument } from "./worldDocument";
import { MockSimulation } from "../sim/MockSimulation";

const valid: WorldDocument = {
  schemaVersion: 6,
  config: { name: "Test Vale", presetId: "meadow", seed: 4, era: 0, chapter: 0, government: "council", societyGoal: "none", goalPrompt: "", decisionMode: "local-brain", weather: "auto" },
  world: {
    width: 8,
    height: 8,
    day: 1,
    time: 480,
    season: 1,
    stock: { wheat: 2 },
    tiles: Array.from({ length: 64 }, () => 3),
    objects: [],
    entities: [],
  },
  editor: { layers: { terrain: { visible: true, locked: false }, objects: { visible: true, locked: false }, people: { visible: true, locked: false } }, settlementByCitizen: {}, commandLog: [] },
  simulation: null,
};

describe("world document validation", () => {
  it("accepts a versioned document with matching tile dimensions", () => {
    expect(parseWorldDocument(valid).config.name).toBe("Test Vale");
  });

  it("round-trips the explicit decision mode", () => {
    const restored = parseWorldDocument(JSON.parse(JSON.stringify({ ...valid, config: { ...valid.config, decisionMode: "mock" } })));
    expect(restored.config.decisionMode).toBe("mock");
    const lab = parseWorldDocument(JSON.parse(JSON.stringify({ ...valid, config: { ...valid.config, decisionMode: "mock" } })));
    expect(lab.config.decisionMode).toBe("mock");
  });

  it("round-trips a deployed evolved generation", () => {
    const brainDeployment = { experimentId: "experiment-1", generation: 12, label: "Island line · generation 12", brainIds: ["brain-a", "brain-b"], speciesIds: ["species-1", "species-2"] };
    const restored = parseWorldDocument(JSON.parse(JSON.stringify({ ...valid, config: { ...valid.config, decisionMode: "local-brain", brainDeployment } })));
    expect(restored.config.brainDeployment).toEqual(brainDeployment);
  });

  it("rejects corrupt tile payloads", () => {
    expect(() => parseWorldDocument({ ...valid, world: { ...valid.world, tiles: [3] } })).toThrow(/tile data/i);
  });

  it("migrates schema v1 documents to v6 without mutating their source", () => {
    const legacy = structuredClone({ ...valid, schemaVersion: 1 as const }) as Omit<WorldDocument, "schemaVersion"> & { schemaVersion: 1; config: Omit<WorldDocument["config"], "societyGoal"> };
    delete (legacy.config as Partial<WorldDocument["config"]>).societyGoal;
    const migrated = parseWorldDocument(legacy);
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.config.societyGoal).toBe("none");
    expect(migrated.config.decisionMode).toBe("local-brain");
    expect(legacy.schemaVersion).toBe(1);
    expect("societyGoal" in legacy.config).toBe(false);
  });

  it("migrates v2 simulation checkpoints by adding neutral economic state and fresh digests", async () => {
    const simulation = new MockSimulation(6, [{ id: 1, name: "Ada", job: "farmer" }], { wheat: 3 });
    for (let tick = 0; tick < 61; tick += 1) await simulation.step(1);
    const legacy = JSON.parse(JSON.stringify({ ...valid, schemaVersion: 2, simulation: simulation.getSnapshot() }));
    delete legacy.config.societyGoal;
    legacy.simulation.schemaVersion = 2;
    delete legacy.simulation.civilizationGoal;
    delete legacy.simulation.economy;
    for (const checkpoint of legacy.simulation.checkpoints) {
      delete checkpoint.state.civilizationGoal;
      delete checkpoint.state.economy;
    }
    const migrated = parseWorldDocument(legacy);
    expect(migrated).toMatchObject({ schemaVersion: 6, config: { societyGoal: "none" }, simulation: { schemaVersion: 6, civilizationGoal: { id: "none" }, politics: { constitution: { system: "direct-majority" } }, physicalWorld: { resources: {}, projects: {}, buildings: {}, roads: {}, mandates: {}, escrows: {}, foodLots: {}, demolitions: {}, waste: 0 } } });
    expect(migrated.simulation?.checkpoints.every((checkpoint) => checkpoint.state.civilizationGoal.id === "none" && checkpoint.state.economy.moneySupply === 0)).toBe(true);
  });

  it("round-trips market goal, economy, political state, and physical state through schema v6 JSON", async () => {
    const simulation = new MockSimulation(
      12,
      [{ id: 1, name: "Ada", job: "merchant", traits: ["Bold"], inventory: { wheat: 2 } }],
      { wheat: 2 },
      undefined,
      undefined,
      undefined,
      undefined,
      { societyGoal: "market-economy" },
    );
    for (let tick = 0; tick < 8; tick += 1) await simulation.step(1);
    const restored = parseWorldDocument(JSON.parse(JSON.stringify({
      ...valid,
      config: { ...valid.config, societyGoal: "market-economy" },
      simulation: simulation.getSnapshot(),
    })));
    expect(restored.config.societyGoal).toBe("market-economy");
    expect(restored.simulation?.civilizationGoal.id).toBe("market-economy");
    expect(restored.simulation?.economy.currency.id).toBe("shell");
    expect(restored.simulation?.physicalWorld).toMatchObject({ resources: {}, projects: {}, buildings: {} });
  });

  it("migrates schema v4 map objects into authoritative physical resources and homes", () => {
    const simulation = new MockSimulation(77, [{ id: 1, name: "Ada", job: "woodcutter" }], { wheat: 2 }).getSnapshot() as unknown as Record<string, unknown>;
    simulation.schemaVersion = 4;
    delete simulation.physicalWorld;
    for (const checkpoint of simulation.checkpoints as Array<{ state: Record<string, unknown> }>) delete checkpoint.state.physicalWorld;
    const migrated = parseWorldDocument(JSON.parse(JSON.stringify({
      ...valid,
      schemaVersion: 4,
      world: {
        ...valid.world,
        objects: [
          { uid: 20, id: "oak", x: 2, y: 2, opts: {}, build: 1, age: 0 },
          { uid: 21, id: "cottage", x: 4, y: 4, opts: {}, build: 1, age: 0 },
          { uid: 22, id: "rock", x: 6, y: 2, opts: {}, build: 1, age: 0 },
          { uid: 23, id: "wheat", x: 6, y: 3, opts: { v: 2 }, build: 1, age: 100 },
        ],
        entities: [{ uid: 1, kind: "villager", x: 4, y: 6, name: "Ada", job: "woodcutter", homeUid: 21 }],
      },
      simulation,
    })));
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.simulation?.physicalWorld.resources["tree:20"]).toMatchObject({ objectUid: 20, assetId: "oak", status: "available" });
    expect(migrated.simulation?.physicalWorld.resources["stone:22"]).toMatchObject({ objectUid: 22, kind: "stone", status: "available" });
    expect(migrated.simulation?.physicalWorld.resources["crop:23"]).toMatchObject({ objectUid: 23, kind: "crop", status: "available" });
    expect(migrated.simulation?.physicalWorld.buildings["21"]).toMatchObject({ buildingType: "cottage", residentIds: [1] });
    expect(migrated.simulation?.citizens[1].homeObjectUid).toBe(21);
  });

  it("rejects schema v6 simulations without physical world state", () => {
    const simulation = new MockSimulation(78, [{ id: 1, name: "Ada", job: "farmer" }], { wheat: 2 }).getSnapshot() as unknown as Record<string, unknown>;
    delete simulation.physicalWorld;
    expect(() => parseWorldDocument({ ...valid, simulation })).toThrow(/physical world/i);
  });

  it("rejects schema v3 checkpoint corruption instead of silently rewriting its digest", async () => {
    const simulation = new MockSimulation(18, [{ id: 1, name: "Ada", job: "farmer" }], { wheat: 4 });
    for (let tick = 0; tick < 61; tick += 1) await simulation.step(1);
    const corrupted = simulation.getSnapshot();
    corrupted.checkpoints[1].state.stock.wheat = 999;
    expect(() => parseWorldDocument({ ...valid, simulation: corrupted })).toThrow(/checkpoint mismatch at tick 60/i);
  });

  it("rejects inconsistent v3 goals and unbalanced currency", async () => {
    const simulation = new MockSimulation(19, [{ id: 1, name: "Ada", job: "merchant" }], { wheat: 2 }, undefined, undefined, undefined, undefined, { societyGoal: "market-economy" });
    for (let tick = 0; tick < 8; tick += 1) await simulation.step(1);
    const market = simulation.getSnapshot();
    expect(() => parseWorldDocument({ ...valid, simulation: market })).toThrow(/goals do not match/i);
    market.economy.wallets[1] = 999;
    market.economy.moneySupply = 1;
    expect(() => parseWorldDocument({ ...valid, config: { ...valid.config, societyGoal: "market-economy" }, simulation: market })).toThrow(/money|shells are accounted/i);
  });

  it("rejects unsupported schema versions", () => {
    expect(() => parseWorldDocument({ ...valid, schemaVersion: 7 })).toThrow();
  });

  it("round-trips real decision history through JSON", async () => {
    const simulation = new MockSimulation(4, [{ id: 1, name: "Ada", job: "builder", traits: ["Bold"], goal: "Build a secure home", inventory: { wood: 1 } }], { wheat: 2, wood: 4, stone: 2 });
    await simulation.step(1);
    const encoded = JSON.stringify({ ...valid, simulation: simulation.getSnapshot() });
    const restored = parseWorldDocument(JSON.parse(encoded));
    expect(restored.simulation?.decisions).toHaveLength(1);
    expect(restored.simulation?.decisions[0]).toMatchObject({ actionStatus: "in-progress", actionInstanceId: expect.stringMatching(/^action-/) });
    expect(Object.keys(restored.simulation?.activeActions ?? {})).toHaveLength(1);
    expect(restored.simulation?.citizens[1].inventory.wood).toBe(1);
  });

  it("round-trips emergent groups and personal promises", () => {
    const simulation = new MockSimulation(81, [{ id: 1, name: "Ada", job: "unassigned" }, { id: 2, name: "Bo", job: "unassigned" }], {}).getSnapshot();
    simulation.socialGroups.camp = { id: "camp", name: "River Camp", founderId: 1, memberIds: [1, 2], sharedInventory: { branches: 2 }, norms: ["share firewood"], decisionSystem: "consensus", createdAtTick: 3 };
    simulation.citizens[1].groupIds = ["camp"];
    simulation.citizens[2].groupIds = ["camp"];
    simulation.socialPromises.p1 = { id: "p1", fromCitizenId: 1, toCitizenId: 2, resource: "berries", amount: 1, promisedAtTick: 4, dueTick: 10, status: "open" };
    const restored = parseWorldDocument(JSON.parse(JSON.stringify({ ...valid, simulation })));
    expect(restored.simulation?.socialGroups.camp).toMatchObject({ memberIds: [1, 2], sharedInventory: { branches: 2 }, decisionSystem: "consensus" });
    expect(restored.simulation?.socialPromises.p1).toMatchObject({ fromCitizenId: 1, toCitizenId: 2, status: "open" });
  });
});
