import Dexie, { type EntityTable } from "dexie";
import type { WorldDocument } from "./worldDocument";

export interface WorldSave {
  id: string;
  name: string;
  presetId: string;
  seed: number;
  createdAt: number;
  updatedAt: number;
  document: WorldDocument;
}

export type WorldSaveSummary = Omit<WorldSave, "document">;

class FreewillDatabase extends Dexie {
  worlds!: EntityTable<WorldSave, "id">;

  constructor() {
    // Keep the legacy namespace so the rebrand never strands existing local worlds.
    super("little-worlds");
    this.version(1).stores({ worlds: "id, updatedAt, name, presetId" });
  }
}

export const database = new FreewillDatabase();
