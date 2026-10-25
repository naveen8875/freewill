import { describe, expect, it } from "vitest";
import { buildActionCandidates } from "./actionCandidates";
import { checkActionLegality } from "./actionLegality";
import { MockSimulation } from "./MockSimulation";
import { PRODUCTION_RECIPES, recipeBlockers } from "./settlementSystems";
import type { DecisionProvider } from "./types";
import type { SimulationWorldSeed } from "./spatial";

const descriptor = { kind: "test-delayed" as const, id: "settlement-fixture", label: "Settlement fixture", version: "1" };

const productionProvider: DecisionProvider = {
  descriptor,
  async decide(request) {
    const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "operate_recipe")
      ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "train_skill")
      ?? request.candidates.find((candidate) => candidate.legal);
    if (!selected) throw new Error("Settlement fixture received no legal action.");
    return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
  },
};

function facilitySeed(assetId = "bakery"): SimulationWorldSeed {
  const width = 12;
  const height = 10;
  return {
    width,
    height,
    topologyRevision: 1,
    walkable: Array(width * height).fill(1),
    locations: { plaza: [{ x: 6, y: 5 }], "job:baker": [{ x: 4, y: 4 }], shore: [{ x: 1, y: 5 }] },
    nextObjectUid: 11,
    objects: [{ uid: 10, assetId, x: 4, y: 4, build: 1, age: 0, footprint: { width: 2, height: 2 }, category: "building", tree: false, homeCapacity: 0 }],
  };
}

describe("settlement systems", () => {
  it("turns exact recipe inputs into outputs at a physical facility", async () => {
    const simulation = new MockSimulation(
      901,
      [{ id: 1, name: "Odile", job: "baker", position: { x: 5, y: 5 }, traits: ["Diligent"] }],
      { wheat: 2, water: 1, wood: 1 },
      undefined,
      productionProvider,
      undefined,
      facilitySeed(),
    );
    for (let tick = 0; tick < 30 && simulation.getSnapshot().economy.production.length === 0; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.economy.production).toEqual(expect.arrayContaining([expect.objectContaining({ recipeId: "bake-bread", facilityObjectUid: 10, inputs: { wheat: 2, water: 1, wood: 1 }, outputs: { bread: 4 } })]));
    expect(snapshot.stock).toMatchObject({ wheat: 0, water: 0, wood: 0, bread: 4 });
    expect(snapshot.physicalWorld.buildings["10"].condition).toBeLessThan(1);
    expect(snapshot.citizens[1].skills.baking.level).toBeGreaterThan(0.35);
    expect(snapshot.decisions.find((decision) => decision.selectedIntent?.kind === "operate_recipe")?.consequences.join(" ")).toMatch(/were consumed/i);
  });

  it("blocks transformed-goods work when its inputs or physical workplace are missing", () => {
    const simulation = new MockSimulation(902, [{ id: 1, name: "Odile", job: "baker", position: { x: 5, y: 5 } }], {}, undefined, undefined, undefined, facilitySeed());
    const snapshot = simulation.getSnapshot();
    const citizen = snapshot.citizens[1];
    const context = { tick: 0, stateVersion: 1, citizen, citizens: [citizen], stock: {}, constructionProgress: 0, economy: snapshot.economy, physicalWorld: snapshot.physicalWorld };
    expect(checkActionLegality("work_job", context).reason).toMatch(/physical facility.*recipe/i);
    expect(checkActionLegality("gather_food", context).reason).toMatch(/exact crop plot.*renewable fish stock.*trade/i);
    const blockers = recipeBlockers(PRODUCTION_RECIPES["bake-bread"], citizen, { kind: "stock" }, { ...context, stock: {} }, 10);
    expect(blockers).toEqual(expect.arrayContaining([expect.stringMatching(/needs 2 wheat/i), expect.stringMatching(/needs 1 water/i), expect.stringMatching(/needs 1 wood/i)]));
  });

  it("offers apprenticeship instead of deadlocking when active construction has no builder", () => {
    const simulation = new MockSimulation(903, [{ id: 1, name: "Mara", job: "merchant", position: { x: 5, y: 5 } }], { wood: 6, stone: 2 }, undefined, undefined, undefined, facilitySeed());
    const snapshot = simulation.getSnapshot();
    snapshot.physicalWorld.projects["project:11"] = {
      id: "project:11", objectUid: 11, buildingType: "cottage", position: { x: 7, y: 6 }, workPosition: { x: 8, y: 8 }, footprint: { width: 2, height: 2 }, owner: { kind: "public", id: "settlement" }, requestedByCitizenId: 1,
      status: "materials", required: { wood: 6, stone: 2 }, delivered: { wood: 0, stone: 0 }, laborRequired: 8, laborCompleted: 0, residentIds: [], capacity: 2, createdAtTick: 0,
    };
    snapshot.physicalWorld.nextObjectUid = 12;
    const citizen = snapshot.citizens[1];
    const candidates = buildActionCandidates({ tick: 0, stateVersion: 1, citizen, citizens: [citizen], stock: snapshot.stock, constructionProgress: 0, economy: snapshot.economy, politics: snapshot.politics, physicalWorld: snapshot.physicalWorld });
    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({ legal: true, intent: { kind: "train_skill", skill: "construction" } })]));
  });

  it("accounts for fishing against a regenerating natural stock", async () => {
    const fishingProvider: DecisionProvider = {
      descriptor,
      async decide(request) {
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "catch_fish") ?? request.candidates.find((candidate) => candidate.legal)!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(904, [{ id: 1, name: "Ivo", job: "fisher", position: { x: 2, y: 5 }, inventory: { fishing_tool: 1 } }], {}, undefined, fishingProvider, undefined, facilitySeed());
    const initial = simulation.getSnapshot().physicalWorld.renewableStocks.fish.amount;
    for (let tick = 0; tick < 40 && !((simulation.getSnapshot().citizens[1].inventory.fish ?? 0) > 0); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[1].inventory.fish).toBe(1);
    expect(snapshot.physicalWorld.renewableStocks.fish.amount).toBeLessThan(initial);
    expect(snapshot.physicalWorld.renewableStocks.fish.lastHarvestedAtTick).toBeDefined();
  });

  it("consumes conserved seed and groundwater instead of creating farm inputs", async () => {
    const seed = facilitySeed("well");
    seed.objects!.push({ uid: 11, assetId: "wheat", x: 6, y: 5, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "crop", tree: false, crop: true, homeCapacity: 0 });
    seed.nextObjectUid = 12;
    const farmProvider: DecisionProvider = {
      descriptor,
      async decide(request) {
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "sow_crop" && candidate.intent.cropType === "wheat")
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "tend_crop")
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "draw_water")
          ?? request.candidates.find((candidate) => candidate.legal)!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const initial = new MockSimulation(905, [{ id: 1, name: "Paz", job: "farmer", position: { x: 6, y: 6 } }], { wheat: 1 }, undefined, farmProvider, undefined, seed).getSnapshot();
    initial.physicalWorld.resources["crop:11"].cropStage = "fallow";
    initial.physicalWorld.resources["crop:11"].status = "depleted";
    const simulation = new MockSimulation(905, [{ id: 1, name: "Paz", job: "farmer", position: { x: 6, y: 6 } }], {}, initial, farmProvider);
    for (let tick = 0; tick < 40 && !simulation.getSnapshot().decisions.some((decision) => decision.actionStatus === "completed" && decision.selectedIntent?.kind === "sow_crop"); tick += 1) await simulation.step(1);
    let snapshot = simulation.getSnapshot();
    expect(snapshot.stock.wheat).toBe(0);
    expect(snapshot.physicalWorld.resources["crop:11"]).toMatchObject({ cropStage: "sown", cropType: "wheat" });
    for (let tick = 0; tick < 60 && !simulation.getSnapshot().decisions.some((decision) => decision.actionStatus === "completed" && decision.selectedIntent?.kind === "tend_crop"); tick += 1) await simulation.step(1);
    snapshot = simulation.getSnapshot();
    expect(snapshot.physicalWorld.renewableStocks.water.amount).toBeLessThan(snapshot.physicalWorld.renewableStocks.water.capacity);
    expect(snapshot.decisions.find((decision) => decision.actionStatus === "completed" && decision.selectedIntent?.kind === "tend_crop")?.consequences.join(" ")).toMatch(/tracked water table/i);
  });

  it("runs a persistent private enterprise through a leased facility and conserved accounting", async () => {
    const inputs = [{ id: 1, name: "Odile", job: "baker", position: { x: 5, y: 5 }, traits: ["Diligent"] }];
    const initial = new MockSimulation(906, inputs, {}, undefined, productionProvider, undefined, facilitySeed()).getSnapshot();
    initial.economy.policies = { ...initial.economy.policies, privateProperty: true, currency: true, contracts: true };
    initial.economy.businesses.bakery = {
      id: "bakery", name: "Odile Bakery", kind: "baker", ownerId: 1, capital: 4,
      inventory: { wheat: 8, water: 4, wood: 4 }, employeeIds: [], organization: "sole-proprietorship",
      facilityObjectUids: [10], blockers: [], productionRuns: 0, createdAtTick: 0,
    };
    initial.economy.moneySupply = 4;
    initial.physicalWorld.buildings["10"].operatorBusinessId = "bakery";
    initial.citizens[1].commitment = { id: "commitment-enterprise", kind: "enterprise", objective: "Operate Odile Bakery", strategy: "Secure a facility and run repeated batches.", status: "active", createdAtTick: 0, updatedAtTick: 0, progress: 0, targetId: "bakery" };
    const simulation = new MockSimulation(906, inputs, {}, initial, productionProvider);
    for (let tick = 0; tick < 100 && simulation.getSnapshot().economy.businesses.bakery.productionRuns < 4; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.economy.businesses.bakery).toMatchObject({ inventory: { wheat: 0, water: 0, wood: 0, bread: 16 }, productionRuns: 4, blockers: [] });
    expect(snapshot.economy.production.filter((batch) => batch.businessId === "bakery")).toHaveLength(4);
    expect(snapshot.citizens[1].commitment).toMatchObject({ status: "completed", progress: 1 });
    expect(Object.values(snapshot.physicalWorld.foodLots).filter((lot) => lot.owner.kind === "business" && lot.owner.id === "bakery").reduce((sum, lot) => sum + lot.amount, 0)).toBe(16);
  });

  it("keeps wages in escrow until a worker completes real work", async () => {
    const fishingProvider: DecisionProvider = {
      descriptor,
      async decide(request) {
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "catch_fish") ?? request.candidates.find((candidate) => candidate.legal)!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const inputs = [{ id: 1, name: "Ivo", job: "fisher", position: { x: 2, y: 5 }, inventory: { fishing_tool: 1 } }, { id: 2, name: "Mara", job: "merchant", position: { x: 5, y: 5 } }];
    const initial = new MockSimulation(908, inputs, {}, undefined, fishingProvider, undefined, facilitySeed()).getSnapshot();
    initial.economy.policies = { ...initial.economy.policies, privateProperty: true, currency: true, contracts: true };
    initial.economy.wallets = { 1: 0, 2: 0 };
    initial.economy.moneySupply = 3;
    initial.economy.businesses.fishery = { id: "fishery", name: "Mara Fishery", kind: "fisher", ownerId: 2, capital: 0, inventory: {}, employeeIds: [1], organization: "sole-proprietorship", facilityObjectUids: [], blockers: [], productionRuns: 0, createdAtTick: 0 };
    initial.economy.contracts.job = { id: "job", businessId: "fishery", employerId: 2, workerId: 1, wage: 3, escrowedWage: 3, status: "active", createdAtTick: 0, acceptedAtTick: 0, expiresAtTick: 100 };
    const simulation = new MockSimulation(908, inputs, {}, initial, fishingProvider);
    for (let tick = 0; tick < 30 && simulation.getSnapshot().economy.contracts.job.status !== "completed"; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.economy.contracts.job).toMatchObject({ status: "completed", escrowedWage: 0 });
    expect(snapshot.economy.wallets[1]).toBe(3);
    expect(snapshot.economy.transactions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "wage", contractId: "job", money: 3 })]));
  });

  it("keeps a 100-villager settlement coherent across sustained autonomous decisions", async () => {
    const jobs = ["farmer", "builder", "woodcutter", "miner", "fisher", "baker", "smith", "merchant"];
    const citizens = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `Villager ${index + 1}`, job: jobs[index % jobs.length], position: { x: 2 + index % 8, y: 2 + Math.floor(index / 8) % 6 } }));
    const simulation = new MockSimulation(907, citizens, { wheat: 160, fish: 30, water: 120, wood: 100, stone: 80, ore: 40 }, undefined, undefined, undefined, facilitySeed());
    for (let tick = 0; tick < 240; tick += 1) await simulation.step(1 + Math.floor(tick / 24));
    const snapshot = simulation.getSnapshot();
    expect(Object.keys(snapshot.citizens)).toHaveLength(100);
    expect(snapshot.decisions.length).toBeGreaterThan(150);
    expect(Object.values(snapshot.citizens).every((citizen) => Object.values(citizen.needs).every((need) => need >= 0 && need <= 1))).toBe(true);
    expect(Object.values(snapshot.reservations).every((reservation) => reservation.amount >= 0)).toBe(true);
  }, 25_000);
});

