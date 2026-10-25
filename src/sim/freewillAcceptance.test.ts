import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import type { SimulationWorldSeed } from "./spatial";
import { generateWilderness } from "./worldGeneration";
import { SIM_TICKS_PER_DAY, simulationDay } from "./time";

function generatedSeed(seed: number, width = 64, height = 48): SimulationWorldSeed {
  const plan = generateWilderness(seed, width, height, "balanced");
  const shore = plan.tiles.flatMap((tile, index) => tile.biome === "shore" ? [{ x: index % plan.width, y: Math.floor(index / plan.width) }] : []);
  return {
    width: plan.width,
    height: plan.height,
    topologyRevision: 1,
    walkable: plan.tiles.map((tile) => tile.walkable ? 1 : 0),
    locations: { plaza: [{ ...plan.spawn }], rest: [{ ...plan.spawn }], shore },
    environment: {
      seed: plan.seed,
      harshness: plan.harshness,
      spawn: { ...plan.spawn },
      biomes: plan.tiles.map((tile) => tile.biome),
      elevation: plan.tiles.map((tile) => tile.elevation),
      moisture: plan.tiles.map((tile) => tile.moisture),
      fertility: plan.tiles.map((tile) => tile.fertility),
      hazard: plan.tiles.map((tile) => tile.hazard),
    },
    nextObjectUid: plan.objects.length + 1,
    objects: plan.objects.map((object, index) => ({
      uid: index + 1,
      assetId: object.assetId,
      x: object.x,
      y: object.y,
      build: 1,
      age: 0,
      footprint: { width: 1, height: 1 },
      category: "nature",
      tree: object.assetId === "oak" || object.assetId === "pine",
      homeCapacity: 0,
      wildResource: object.assetId === "oak" || object.assetId === "pine" ? "wood" as const
        : object.assetId === "bush" || object.assetId === "mushroom" ? "wild-food" as const
          : object.assetId === "reeds" ? "fiber" as const
            : object.assetId === "rock" || object.assetId === "stones" ? "stone" as const : undefined,
    })),
  };
}

describe("Freewill wilderness acceptance", () => {
  it("runs twelve empty-handed independent people for thirty days with traceable outcomes", async () => {
    const world = generatedSeed(2_610);
    const spawn = world.environment!.spawn;
    const citizens = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      name: `Person ${index + 1}`,
      job: "unassigned",
      inventory: {},
      position: { x: spawn.x + index % 4 - 1, y: spawn.y + Math.floor(index / 4) - 1 },
      initialNeeds: { hunger: 0.28, fatigue: 0.18, loneliness: 0.25, thirst: 0.28 },
    }));
    const simulation = new MockSimulation(2_610, citizens, {}, undefined, undefined, undefined, world, { societyGoal: "none" });
    for (let tick = 0; tick < 30 * SIM_TICKS_PER_DAY; tick += 1) await simulation.step(simulationDay(tick), { copySnapshot: false });
    const snapshot = simulation.getSnapshot();
    const living = Object.values(snapshot.citizens).filter((citizen) => citizen.physical?.alive !== false);
    const completed = snapshot.decisions.filter((decision) => decision.actionStatus === "completed");
    const kinds = new Set(completed.map((decision) => decision.selectedIntent?.kind));
    const actionCounts = completed.reduce<Record<string, number>>((counts, decision) => {
      const kind = decision.selectedIntent?.kind ?? decision.selected;
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {});
    console.info("FREEWILL_30_DAY_ACCEPTANCE", JSON.stringify({
      living: living.length,
      deaths: 12 - living.length,
      buildings: Object.values(snapshot.physicalWorld.buildings).map((building) => building.buildingType),
      projects: Object.values(snapshot.physicalWorld.projects).map((project) => ({ type: project.buildingType, status: project.status, required: project.required, delivered: project.delivered, labor: [project.laborCompleted, project.laborRequired], owner: project.owner })),
      crops: Object.values(snapshot.physicalWorld.resources).filter((resource) => resource.kind === "crop").map((resource) => ({ stage: resource.cropStage, growth: Number((resource.growth ?? 0).toFixed(2)), moisture: Number((resource.moisture ?? 0).toFixed(2)), health: Number((resource.health ?? 0).toFixed(2)) })),
      groups: Object.keys(snapshot.socialGroups).length,
      households: new Set(Object.values(snapshot.citizens).flatMap((citizen) => citizen.householdId ? [citizen.householdId] : [])).size,
      promises: Object.values(snapshot.socialPromises).reduce<Record<string, number>>((counts, promise) => ({ ...counts, [promise.status]: (counts[promise.status] ?? 0) + 1 }), {}),
      actions: actionCounts,
      survivors: living.map((citizen) => ({ id: citizen.id, health: Number((citizen.physical?.health ?? 0).toFixed(2)), hunger: Number(citizen.needs.hunger.toFixed(2)), thirst: Number((citizen.needs.thirst ?? 0).toFixed(2)), exposure: Number((citizen.physical?.exposure ?? 0).toFixed(2)), home: citizen.homeObjectUid, commitment: citizen.commitment ? `${citizen.commitment.kind}:${citizen.commitment.status}` : undefined })),
    }));
    expect(snapshot.civilizationGoal.id).toBe("none");
    expect(Object.values(snapshot.stock).every((amount) => amount === 0)).toBe(true);
    expect(kinds.has("gather_food") || kinds.has("work_job") || kinds.has("construct")).toBe(false);
    expect(completed.length).toBeGreaterThan(80);
    expect(kinds.has("explore") || Object.values(snapshot.citizens).some((citizen) => (citizen.knowledge?.discoveredTiles.length ?? 0) >= 40)).toBe(true);
    expect(kinds.has("forage_wild_food") || kinds.has("catch_fish") || kinds.has("hunt_game")).toBe(true);
    expect(Object.values(snapshot.physicalWorld.buildings).some((building) => building.buildingType === "campfire")).toBe(true);
    expect(Object.values(snapshot.physicalWorld.buildings).some((building) => building.buildingType === "shelter")).toBe(true);
    expect(Object.values(snapshot.physicalWorld.buildings).filter((building) => building.buildingType === "garden-plot").length).toBeGreaterThanOrEqual(1);
    expect(kinds.has("harvest_crop")).toBe(true);
    expect(Object.values(snapshot.citizens).some((citizen) => Object.entries(citizen.inventory).some(([resource, amount]) => resource.endsWith("_seed") && amount > 0))).toBe(true);
    expect(kinds.has("fuel_campfire")).toBe(true);
    expect(living.length).toBeGreaterThanOrEqual(6);
    expect(snapshot.decisions.every((decision) => decision.selectedIntent && decision.consequences.length > 0)).toBe(true);
  }, 60_000);
});
