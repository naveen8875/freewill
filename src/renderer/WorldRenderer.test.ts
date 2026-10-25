import { describe, expect, it } from "vitest";
import { MockSimulation } from "../sim/MockSimulation";
import { snapshotDigest } from "../sim/snapshotDigest";
import { LegacyCanvasRenderer } from "./WorldRenderer";

describe("renderer authority boundary", () => {
  it("converges visual positions without mutating the authoritative snapshot", () => {
    const simulation = new MockSimulation(12, [{ id: 1, name: "Ada", job: "farmer", position: { x: 5, y: 6 }, inventory: { wheat: 2 } }], { wheat: 2 });
    const snapshot = simulation.getSnapshot();
    const before = snapshotDigest(snapshot);
    const entity = { uid: 1, kind: "villager", x: 1, y: 1, speed: 1.5, path: null as Array<[number, number]> | null, onArrive: () => undefined, wait: 4, activity: "", mood: 0, inventory: {} as Record<string, number>, goTo() { return this; } };
    const receiver = { game: { speed: 3, world: { stock: {}, entities: [entity], objects: [] } }, playbackIntervalMs: 500, syncPhysicalWorld: () => new Map(), routeVisualMovement: LegacyCanvasRenderer.prototype["routeVisualMovement"] } as unknown as LegacyCanvasRenderer;
    LegacyCanvasRenderer.prototype.applySimulation.call(receiver, snapshot);
    expect(entity.path).toEqual([[2, 2], [3, 3], [4, 4], [5, 5], [5, 6]]);
    expect(entity.onArrive).toBeNull();
    expect(entity.speed).toBeGreaterThan(1.5);
    expect(entity.inventory).toEqual({ wheat: 2 });
    expect(snapshotDigest(snapshot)).toBe(before);
  });
});
