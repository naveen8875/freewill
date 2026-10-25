import { describe, expect, it } from "vitest";
import { createOpenSpatialWorld, findPath, normalizeSpatialWorld, walkableComponents } from "./spatial";

describe("authoritative spatial pathfinding", () => {
  it("uses stable tie-breaking for equal-cost paths", () => {
    const world = createOpenSpatialWorld(7, 7);
    world.walkable[3 * 7 + 3] = 0;
    const first = findPath(world, { x: 1, y: 3 }, { x: 5, y: 3 });
    const second = findPath(world, { x: 1, y: 3 }, { x: 5, y: 3 });
    expect(first).toEqual(second);
    expect(first?.some((point) => point.x === 3 && point.y === 3)).toBe(false);
  });

  it("does not cut diagonally through blocked corners", () => {
    const world = createOpenSpatialWorld(3, 3);
    world.walkable[1] = 0;
    world.walkable[3] = 0;
    expect(findPath(world, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it("finds a nearby walkable arrival tile for a blocked target", () => {
    const world = createOpenSpatialWorld(5, 5);
    world.walkable[2 * 5 + 2] = 0;
    const path = findPath(world, { x: 0, y: 2 }, { x: 2, y: 2 });
    expect(path?.at(-1)).toEqual({ x: 1, y: 2 });
  });

  it("rejects malformed spatial seeds", () => {
    expect(() => normalizeSpatialWorld({ width: 4, height: 4, topologyRevision: 0, walkable: [1], locations: {} })).toThrow(/dimensions/i);
  });

  it("labels disconnected walkable regions with the same corner rules as pathfinding", () => {
    const world = createOpenSpatialWorld(5, 3);
    for (let y = 0; y < world.height; y += 1) world.walkable[y * world.width + 2] = 0;
    const labels = walkableComponents(world);
    expect(labels[1 * world.width + 0]).toBe(labels[1 * world.width + 1]);
    expect(labels[1 * world.width + 0]).not.toBe(labels[1 * world.width + 4]);
    expect(labels[1 * world.width + 2]).toBe(-1);
  });
});
