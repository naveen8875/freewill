import { describe, expect, it } from "vitest";
import { generateWilderness } from "./worldGeneration";

describe("generated wilderness", () => {
  it("is deterministic, finite, and starts without civilization", () => {
    const first = generateWilderness(881, 64, 48, "balanced");
    const second = generateWilderness(881, 64, 48, "balanced");
    expect(first).toEqual(second);
    expect(first.tiles).toHaveLength(64 * 48);
    expect(first.tiles[first.spawn.y * 64 + first.spawn.x].walkable).toBe(true);
    expect(first.objects.length).toBeGreaterThan(0);
    expect(first.objects.every((object) => !["campfire", "field", "cottage", "well"].includes(object.assetId))).toBe(true);
  });

  it("makes harsh worlds measurably less resource-dense", () => {
    expect(generateWilderness(42, 96, 64, "harsh").objects.length).toBeLessThan(generateWilderness(42, 96, 64, "gentle").objects.length);
  });

  it("scores spawn as an opportunity near every primitive resource class", () => {
    const world = generateWilderness(2_610, 64, 48, "balanced");
    const distance = (ids: string[]) => Math.min(...world.objects.filter((object) => ids.includes(object.assetId)).map((object) => Math.abs(object.x - world.spawn.x) + Math.abs(object.y - world.spawn.y)));
    const countNearby = (ids: string[]) => world.objects.filter((object) => ids.includes(object.assetId) && Math.abs(object.x - world.spawn.x) + Math.abs(object.y - world.spawn.y) <= 14).length;
    expect(distance(["oak", "pine"])).toBeLessThanOrEqual(18);
    expect(distance(["bush", "mushroom"])).toBeLessThanOrEqual(18);
    expect(distance(["rock", "stones"])).toBeLessThanOrEqual(18);
    expect(distance(["reeds"])).toBeLessThanOrEqual(18);
    expect(countNearby(["oak", "pine"])).toBeGreaterThanOrEqual(3);
    expect(countNearby(["bush", "mushroom"])).toBeGreaterThanOrEqual(5);
    expect(countNearby(["rock", "stones"])).toBeGreaterThanOrEqual(3);
    expect(countNearby(["reeds"])).toBeGreaterThanOrEqual(3);
    expect(world.tiles.some((tile, index) => tile.biome === "shore" && Math.abs(index % world.width - world.spawn.x) + Math.abs(Math.floor(index / world.width) - world.spawn.y) <= 18)).toBe(true);
  });
});
