import { describe, expect, it } from "vitest";
import { parseWorldDocument, type WorldDocument } from "../persistence/worldDocument";
import { applyEditorCommand } from "../state/editorCommands";
import { MockSimulation } from "./MockSimulation";
import { createSeededRandom } from "./random";
import { snapshotDigest } from "./snapshotDigest";

function document(): WorldDocument {
  return {
    schemaVersion: 6,
    config: { name: "Fuzz Vale", presetId: "generated", seed: 1, era: 0, chapter: 0, government: "council", societyGoal: "none", goalPrompt: "", weather: "auto" },
    world: { width: 8, height: 8, day: 1, time: 480, season: 1, stock: { wheat: 2 }, tiles: Array(64).fill(3), objects: [], entities: [{ uid: 1, kind: "villager", x: 2, y: 2, name: "Ada", job: "farmer" }] },
    editor: { layers: { terrain: { visible: true, locked: false }, objects: { visible: true, locked: false }, people: { visible: true, locked: false } }, settlementByCitizen: {}, commandLog: [] },
    simulation: null,
  };
}

describe("hardening invariants", () => {
  it("keeps resources finite/non-negative and relationships bounded across seeded runs", async () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const simulation = new MockSimulation(seed, [
        { id: 1, name: "Ada", job: "farmer", relationshipPreset: "friendly" },
        { id: 2, name: "Bo", job: "builder", relationshipPreset: "strained" },
        { id: 3, name: "Cy", job: "woodcutter" },
      ], { wheat: 2, wood: 4, stone: 2 });
      for (let tick = 0; tick < 60; tick += 1) await simulation.step(1 + Math.floor(tick / 12));
      const state = simulation.getSnapshot();
      expect(Object.values(state.stock).every((amount) => Number.isFinite(amount) && amount >= 0)).toBe(true);
      expect(Object.values(state.citizens).flatMap((citizen) => Object.values(citizen.relationships)).every((trust) => trust >= 0 && trust <= 1)).toBe(true);
    }
  });

  it("round-trips randomized valid editor coordinates transactionally", () => {
    const rng = createSeededRandom(99);
    let current = document();
    for (let index = 0; index < 80; index += 1) {
      const x = Math.floor(rng() * current.world.width);
      const y = Math.floor(rng() * current.world.height);
      current = applyEditorCommand(current, { id: `move-${index}`, type: "move", target: "entity", uid: 1, x, y }).document;
      current = parseWorldDocument(JSON.parse(JSON.stringify(current)));
    }
    expect(current.editor.commandLog).toHaveLength(80);
  });

  it("rejects non-finite, negative, and out-of-bounds external values", () => {
    expect(() => parseWorldDocument({ ...document(), world: { ...document().world, stock: { wheat: -1 } } })).toThrow();
    expect(() => parseWorldDocument({ ...document(), world: { ...document().world, entities: [{ ...document().world.entities[0], x: Infinity }] } })).toThrow();
    expect(() => parseWorldDocument({ ...document(), world: { ...document().world, entities: [{ ...document().world.entities[0], x: 99 }] } })).toThrow(/coordinate/i);
  });

  it("produces identical serialized digests for identical seeds", async () => {
    const run = async () => {
      const simulation = new MockSimulation(707, [{ id: 1, name: "Ada", job: "farmer" }], { wheat: 2 });
      for (let tick = 0; tick < 48; tick += 1) await simulation.step(1 + Math.floor(tick / 12));
      return snapshotDigest(parseWorldDocument({ ...document(), simulation: simulation.getSnapshot() }).simulation!);
    };
    expect(await run()).toBe(await run());
  });
});
