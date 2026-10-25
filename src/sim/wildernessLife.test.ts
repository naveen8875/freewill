import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import type { DecisionProvider } from "./types";
import type { SimulationWorldSeed } from "./spatial";

const descriptor = { kind: "test-delayed" as const, id: "wilderness-life", label: "Wilderness life fixture", version: "1" };

function seed(withShelter = false): SimulationWorldSeed {
  const width = 20;
  const height = 16;
  const size = width * height;
  const objects: NonNullable<SimulationWorldSeed["objects"]> = [
    { uid: 10, assetId: "bush", x: 3, y: 3, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: false, homeCapacity: 0, wildResource: "wild-food" },
    { uid: 12, assetId: "oak", x: 4, y: 3, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: true, homeCapacity: 0, wildResource: "wood" },
    { uid: 13, assetId: "stones", x: 5, y: 3, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: false, homeCapacity: 0, wildResource: "stone" },
    ...(withShelter ? [{ uid: 11, assetId: "leanto", x: 2, y: 2, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "civic", tree: false, homeCapacity: 1 } as const] : []),
  ];
  return {
    width, height, topologyRevision: 1, walkable: Array.from({ length: size }, () => 1), locations: { plaza: [{ x: 2, y: 2 }], rest: [{ x: 2, y: 2 }], shore: [{ x: 1, y: 2 }] },
    environment: { seed: 77, harshness: "harsh", spawn: { x: 2, y: 2 }, biomes: Array.from({ length: size }, () => "forest"), elevation: Array.from({ length: size }, () => 0.5), moisture: Array.from({ length: size }, () => 0.6), fertility: Array.from({ length: size }, () => 0.8), hazard: Array.from({ length: size }, () => 0.2) },
    nextObjectUid: 14, objects,
  };
}

describe("wilderness life loop", () => {
  it("conserves a seed from foraging into the first cultivated plot", async () => {
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        const garden = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "start_construction" && candidate.intent.buildingType === "garden-plot");
        const hasProject = (request.perception.physicalWorld?.activeProjects.length ?? 0) > 0;
        const projectSteps = hasProject && (request.perception.citizen.inventory.branches ?? 0) < 1
          ? request.candidates.filter((candidate) => candidate.intent?.kind === "gather_branches")
          : request.candidates.filter((candidate) => ["deliver_material", "work_construction"].includes(candidate.intent?.kind ?? ""));
        const priorities = request.perception.citizen.inventory.wild_seed || hasProject ? [garden, ...projectSteps]
          : request.candidates.filter((candidate) => candidate.intent?.kind === "forage_wild_food");
        const selected = priorities.find((candidate) => candidate?.legal) ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(77, [{ id: 1, name: "Mika", job: "unassigned", position: { x: 2, y: 3 }, inventory: {} }], {}, undefined, provider, undefined, seed());
    for (let tick = 0; tick < 180 && !Object.values(simulation.getSnapshot().physicalWorld.resources).some((node) => node.kind === "crop"); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(Object.values(snapshot.physicalWorld.buildings)).toEqual(expect.arrayContaining([expect.objectContaining({ buildingType: "garden-plot" })]));
    expect(Object.values(snapshot.physicalWorld.resources)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "crop", cropStage: expect.stringMatching(/sown|growing|ripe/) })]));
    expect(snapshot.citizens[1].inventory.wild_seed ?? 0).toBe(0);
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toContain("forage_wild_food");
  });

  it("makes exposed survival physically worse than having a shelter", async () => {
    const idle: DecisionProvider = { descriptor, decide: async (request) => ({ requestId: request.requestId, selectedCandidateId: request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!.id, provider: descriptor }) };
    const exposed = new MockSimulation(78, [{ id: 1, name: "Sol", job: "unassigned", position: { x: 2, y: 2 } }], {}, undefined, idle, undefined, seed());
    const sheltered = new MockSimulation(78, [{ id: 1, name: "Sol", job: "unassigned", position: { x: 2, y: 2 }, homeObjectUid: 11 }], {}, undefined, idle, undefined, seed(true));
    for (let tick = 0; tick < 80; tick += 1) { await exposed.step(1); await sheltered.step(1); }
    expect(exposed.getSnapshot().citizens[1].physical!.exposure).toBeGreaterThan(sheltered.getSnapshot().citizens[1].physical!.exposure);
    expect(exposed.getSnapshot().citizens[1].emotions!.safety).toBeLessThan(sheltered.getSnapshot().citizens[1].emotions!.safety);
  });

  it("allows immediate drinking from nature without creating carried water", async () => {
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "drink_natural_water")
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(79, [{ id: 1, name: "Paz", job: "unassigned", position: { x: 2, y: 2 }, initialNeeds: { thirst: 0.95 } }], {}, undefined, provider, undefined, seed());
    for (let tick = 0; tick < 16 && !simulation.getSnapshot().decisions.some((decision) => decision.selectedIntent?.kind === "drink_natural_water" && decision.actionStatus === "completed"); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[1].needs.thirst).toBeLessThan(0.5);
    expect(snapshot.citizens[1].inventory.water ?? 0).toBe(0);
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toContain("drink_natural_water");
  });

  it("builds fire, gathers clay, and crafts a finite-durability water container from nothing", async () => {
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        const candidates = request.candidates;
        const inventory = request.perception.citizen.inventory;
        const waterContainer = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "craft_primitive" && candidate.intent.recipeId === "water-container");
        const fuelFire = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "fuel_campfire");
        const campfireProject = request.perception.physicalWorld?.activeProjects.find((project) => project.buildingType === "campfire");
        let selected = waterContainer;
        if (!selected) selected = fuelFire;
        if (!selected && campfireProject) {
          selected = candidates.find((candidate) => candidate.legal && ["deliver_material", "work_construction"].includes(candidate.intent?.kind ?? ""));
          if (!selected && (inventory.branches ?? 0) < 2) selected = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "gather_branches");
          if (!selected && (inventory.stone ?? 0) < 2) selected = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "gather_loose_stone");
        }
        if (!selected && (inventory.clay ?? 0) < 2) selected = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "gather_clay");
        if (!selected) selected = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "start_construction" && candidate.intent.buildingType === "campfire");
        if (!selected && (inventory.branches ?? 0) < 2) selected = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "gather_branches");
        if (!selected && (inventory.stone ?? 0) < 2) selected = candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "gather_loose_stone");
        selected ??= candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle");
        if (!selected) throw new Error("Primitive container fixture received no legal action.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(80, [{ id: 1, name: "Noor", job: "unassigned", position: { x: 2, y: 3 }, inventory: {} }], {}, undefined, provider, undefined, seed());
    for (let tick = 0; tick < 220 && (simulation.getSnapshot().citizens[1].inventory.water_container ?? 0) < 1; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(Object.values(snapshot.physicalWorld.buildings)).toEqual(expect.arrayContaining([expect.objectContaining({ buildingType: "campfire" })]));
    expect(snapshot.citizens[1].inventory.water_container).toBe(1);
    expect(snapshot.citizens[1].toolDurability?.water_container).toBe(20);
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toEqual(expect.arrayContaining(["gather_clay", "craft_primitive"]));
  });

  it("burns finite branches to cook food and boil carried water without creating either", async () => {
    const world = seed();
    world.objects!.push({ uid: 14, assetId: "campfire", x: 2, y: 2, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "civic", tree: false, homeCapacity: 0 });
    world.nextObjectUid = 15;
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        const wanted = ["cook_food", "boil_water", "fuel_campfire"];
        const selected = wanted.map((kind) => request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === kind)).find(Boolean)
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
        return { requestId: request.requestId, selectedCandidateId: selected!.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(8_012, [{ id: 1, name: "Ira", job: "unassigned", position: { x: 2, y: 3 }, inventory: { branches: 1, fish: 1, water: 1 } }], {}, undefined, provider, undefined, world);
    for (let tick = 0; tick < 30; tick += 1) {
      await simulation.step(1);
      const snapshot = simulation.getSnapshot();
      const kinds = snapshot.decisions.filter((decision) => decision.actionStatus === "completed").map((decision) => decision.selectedIntent?.kind);
      if (kinds.includes("cook_food") && kinds.includes("boil_water")) break;
    }
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[1].inventory).toMatchObject({ branches: 0, fish: 0, water: 0, cooked_meal: 1, clean_water: 1 });
    expect(snapshot.physicalWorld.buildings["14"].fuel).toBeGreaterThan(0);
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toEqual(expect.arrayContaining(["fuel_campfire", "cook_food", "boil_water"]));
  });

  it("keeps distant resources out of an NPC's choices until personal exploration reveals them", async () => {
    let firstCandidateKinds: string[] | undefined;
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        firstCandidateKinds ??= request.candidates.flatMap((candidate) => candidate.intent ? [candidate.intent.kind] : []);
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "forage_wild_food")
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "explore")
          ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const world = seed();
    world.objects = [{ uid: 10, assetId: "bush", x: 2, y: 2, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: false, homeCapacity: 0, wildResource: "wild-food" }];
    world.nextObjectUid = 11;
    const simulation = new MockSimulation(81, [{ id: 1, name: "Wren", job: "unassigned", position: { x: 2, y: 8 }, inventory: {} }], {}, undefined, provider, undefined, world);
    for (let tick = 0; tick < 48 && (simulation.getSnapshot().citizens[1].inventory.berries ?? 0) < 1; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(firstCandidateKinds).not.toContain("forage_wild_food");
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toEqual(expect.arrayContaining(["explore", "forage_wild_food"]));
    expect(snapshot.citizens[1].knowledge?.knownResources).toContain("wild-food:10");
  });
});
