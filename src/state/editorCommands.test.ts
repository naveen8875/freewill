import { describe, expect, it } from "vitest";
import type { WorldDocument } from "../persistence/worldDocument";
import { applyEditorCommand } from "./editorCommands";

const base: WorldDocument = {
  schemaVersion: 6,
  config: { name: "Command Vale", presetId: "generated", seed: 1, era: 0, chapter: 0, government: "council", societyGoal: "none", goalPrompt: "", weather: "auto" },
  world: { width: 8, height: 8, day: 1, time: 480, season: 1, stock: {}, tiles: Array(64).fill(3), objects: [{ uid: 1, id: "cottage", x: 2, y: 2, opts: {}, build: 1, age: 0 }], entities: [{ uid: 2, kind: "villager", x: 3, y: 3, name: "Ada", job: "builder" }] },
  editor: { layers: { terrain: { visible: true, locked: false }, objects: { visible: true, locked: false }, people: { visible: true, locked: false } }, settlementByCitizen: {}, commandLog: [] },
  simulation: null,
};

describe("editor commands", () => {
  it("applies deterministic move/rotate/settlement commands with inverse patches", () => {
    const moved = applyEditorCommand(base, { id: "move-1", type: "move", target: "entity", uid: 2, x: 4, y: 4 });
    const rotated = applyEditorCommand(moved.document, { id: "rotate-1", type: "rotate", uid: 1, quarterTurns: 1 });
    const assigned = applyEditorCommand(rotated.document, { id: "settle-1", type: "assign-settlement", citizenId: 2, settlementId: "north-bank" });
    expect(assigned.document.world.entities[0]).toMatchObject({ x: 4, y: 4 });
    expect(assigned.document.world.objects[0].opts.rotation).toBe(1);
    expect(assigned.document.editor.settlementByCitizen[2]).toBe("north-bank");
    expect(moved.inversePatches[0]).toMatchObject({ after: { x: 3, y: 3 } });
  });

  it("rejects invalid coordinates, collision, and edits to locked layers", () => {
    expect(() => applyEditorCommand(base, { id: "bad", type: "move", target: "entity", uid: 2, x: Number.NaN, y: 0 })).toThrow(/outside/i);
    const locked = applyEditorCommand(base, { id: "lock", type: "set-layer", layer: "objects", locked: true }).document;
    expect(() => applyEditorCommand(locked, { id: "delete", type: "delete", target: "object", uid: 1 })).toThrow(/locked/i);
  });
});
