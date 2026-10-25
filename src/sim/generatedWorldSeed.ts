import type { SimulationWorldSeed } from "./spatial";
import { generateWilderness, type WorldHarshness } from "./worldGeneration";

/** Builds the exact physical seed consumed by both headless and rendered runs. */
export function generatedWorldSeed(seed: number, width = 128, height = 128, harshness: WorldHarshness = "balanced"): SimulationWorldSeed {
  const plan = generateWilderness(seed, width, height, harshness);
  const shore = plan.tiles.flatMap((tile, index) => tile.biome === "shore" ? [{ x: index % plan.width, y: Math.floor(index / plan.width) }] : []);
  return {
    width: plan.width,
    height: plan.height,
    topologyRevision: 1,
    walkable: plan.tiles.map((tile) => tile.walkable ? 1 : 0),
    moveCost: plan.tiles.map((tile) => Math.max(1, Math.round((1 + tile.hazard * 0.8 + (tile.biome === "wetland" ? 0.45 : 0) + (tile.biome === "highland" ? 0.25 : 0)) * 1_000))),
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

