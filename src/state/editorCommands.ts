import type { PersistedEntity, PersistedObject, WorldDocument } from "../persistence/worldDocument";

export type EditorLayer = "terrain" | "objects" | "people";

export type EditorCommand =
  | { id: string; type: "move"; target: "object" | "entity"; uid: number; x: number; y: number }
  | { id: string; type: "rotate"; uid: number; quarterTurns: -1 | 1 }
  | { id: string; type: "delete"; target: "object" | "entity"; uid: number }
  | { id: string; type: "set-layer"; layer: EditorLayer; visible?: boolean; locked?: boolean }
  | { id: string; type: "assign-settlement"; citizenId: number; settlementId: string };

export interface EditorPatch {
  path: string;
  before: unknown;
  after: unknown;
}

export interface AppliedEditorCommand {
  document: WorldDocument;
  patches: EditorPatch[];
  inversePatches: EditorPatch[];
}

export function diffWorldDocuments(before: WorldDocument, after: WorldDocument): EditorPatch[] {
  const patches: EditorPatch[] = [];
  for (let index = 0; index < after.world.tiles.length; index += 1) {
    if (before.world.tiles[index] !== after.world.tiles[index]) patches.push({ path: `world.tiles.${index}`, before: before.world.tiles[index], after: after.world.tiles[index] });
  }
  const diffList = (name: "objects" | "entities") => {
    const previous = new Map(before.world[name].map((item) => [item.uid, item]));
    const next = new Map(after.world[name].map((item) => [item.uid, item]));
    for (const uid of new Set([...previous.keys(), ...next.keys()])) {
      const left = previous.get(uid);
      const right = next.get(uid);
      if (JSON.stringify(left) !== JSON.stringify(right)) patches.push({ path: `world.${name}.${uid}`, before: structuredClone(left), after: structuredClone(right) });
    }
  };
  diffList("objects");
  diffList("entities");
  return patches;
}

function assertCoordinate(document: WorldDocument, x: number, y: number) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= document.world.width || y >= document.world.height) {
    throw new Error(`Editor coordinate ${x},${y} is outside the world.`);
  }
}

function targetLayer(target: "object" | "entity"): EditorLayer {
  return target === "object" ? "objects" : "people";
}

function findTarget(document: WorldDocument, target: "object" | "entity", uid: number): PersistedObject | PersistedEntity {
  const item = target === "object" ? document.world.objects.find((candidate) => candidate.uid === uid) : document.world.entities.find((candidate) => candidate.uid === uid);
  if (!item) throw new Error(`Editor target ${target} ${uid} does not exist.`);
  return item;
}

export function applyEditorCommand(source: WorldDocument, command: EditorCommand): AppliedEditorCommand {
  const document = structuredClone(source);
  const patches: EditorPatch[] = [];
  const write = (path: string, before: unknown, after: unknown) => patches.push({ path, before: structuredClone(before), after: structuredClone(after) });

  if (command.type === "set-layer") {
    const layer = document.editor.layers[command.layer];
    if (command.visible !== undefined && command.visible !== layer.visible) {
      write(`editor.layers.${command.layer}.visible`, layer.visible, command.visible);
      layer.visible = command.visible;
    }
    if (command.locked !== undefined && command.locked !== layer.locked) {
      write(`editor.layers.${command.layer}.locked`, layer.locked, command.locked);
      layer.locked = command.locked;
    }
  } else if (command.type === "assign-settlement") {
    if (document.editor.layers.people.locked) throw new Error("The people layer is locked.");
    const citizen = document.world.entities.find((entity) => entity.uid === command.citizenId && entity.kind === "villager");
    if (!citizen) throw new Error(`Citizen ${command.citizenId} does not exist.`);
    const settlementId = command.settlementId.trim();
    if (!settlementId || settlementId.length > 80) throw new Error("Settlement IDs must contain 1–80 characters.");
    const key = String(command.citizenId);
    write(`editor.settlementByCitizen.${key}`, document.editor.settlementByCitizen[key], settlementId);
    document.editor.settlementByCitizen[key] = settlementId;
  } else {
    const layer = command.type === "rotate" ? "objects" : targetLayer(command.target);
    if (document.editor.layers[layer].locked) throw new Error(`The ${layer} layer is locked.`);
    if (command.type === "delete") {
      const list = command.target === "object" ? document.world.objects : document.world.entities;
      const index = list.findIndex((item) => item.uid === command.uid);
      if (index < 0) throw new Error(`Editor target ${command.target} ${command.uid} does not exist.`);
      write(`world.${command.target === "object" ? "objects" : "entities"}.${index}`, list[index], undefined);
      list.splice(index, 1);
      if (command.target === "entity") delete document.editor.settlementByCitizen[String(command.uid)];
    } else if (command.type === "rotate") {
      const object = findTarget(document, "object", command.uid) as PersistedObject;
      const previous = Number.isFinite(object.opts.rotation) ? Number(object.opts.rotation) : 0;
      const rotation = (previous + command.quarterTurns + 4) % 4;
      write(`world.objects.${command.uid}.opts.rotation`, previous, rotation);
      object.opts.rotation = rotation;
    } else {
      assertCoordinate(document, command.x, command.y);
      const item = findTarget(document, command.target, command.uid);
      if (command.target === "entity") {
        const tile = document.world.tiles[command.y * document.world.width + command.x];
        if (tile < 2) throw new Error("A citizen cannot be moved onto impassable terrain.");
        if (document.world.entities.some((entity) => entity.uid !== command.uid && Math.floor(entity.x) === command.x && Math.floor(entity.y) === command.y)) throw new Error("That tile is occupied by another entity.");
      } else if (document.world.objects.some((object) => object.uid !== command.uid && object.x === command.x && object.y === command.y)) {
        throw new Error("That tile is occupied by another object.");
      }
      write(`world.${command.target === "object" ? "objects" : "entities"}.${command.uid}.position`, { x: item.x, y: item.y }, { x: command.x, y: command.y });
      item.x = command.x;
      item.y = command.y;
    }
  }

  document.editor.commandLog = [...document.editor.commandLog, { id: command.id, type: command.type, payload: { ...command } }].slice(-500);
  return { document, patches, inversePatches: patches.map((patch) => ({ path: patch.path, before: patch.after, after: patch.before })).reverse() };
}
