import type { WorldSave, WorldSaveSummary } from "./database";
import { parseWorldDocument } from "./worldDocument";

export class ServerStorageUnavailable extends Error {}

export interface RuntimeStatus {
  storage: "postgres" | "browser";
  database: { configured: boolean; reachable: boolean; schemaVersion: number | null; worlds: number; bytes?: number; history?: { decisions: number; events: number; checkpoints: number } };
  dashboardUrl?: string;
}

async function request(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(5_000) });
  } catch (cause) {
    throw new ServerStorageUnavailable(cause instanceof Error ? cause.message : "The Freewill server is unavailable.");
  }
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (response.status === 404 || response.status >= 500) throw new ServerStorageUnavailable(payload?.error || `Server storage returned ${response.status}.`);
  if (!response.ok) throw new Error(payload?.error || `Server storage returned ${response.status}.`);
  return payload as Record<string, unknown>;
}

function summary(value: unknown): WorldSaveSummary {
  if (!value || typeof value !== "object") throw new Error("The server returned malformed world metadata.");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || typeof input.name !== "string" || typeof input.presetId !== "string" || !Number.isInteger(input.seed) || !Number.isFinite(input.createdAt) || !Number.isFinite(input.updatedAt)) throw new Error("The server returned malformed world metadata.");
  return { id: input.id, name: input.name, presetId: input.presetId, seed: Number(input.seed), createdAt: Number(input.createdAt), updatedAt: Number(input.updatedAt) };
}

function world(value: unknown): WorldSave {
  const metadata = summary(value);
  const input = value as Record<string, unknown>;
  return { ...metadata, document: parseWorldDocument(input.document) };
}

export async function listServerWorlds() {
  const payload = await request("/api/worlds");
  if (!Array.isArray(payload.worlds)) throw new Error("The server returned a malformed world list.");
  return payload.worlds.map(summary);
}

export async function getServerWorld(id: string) {
  const payload = await request(`/api/worlds/${encodeURIComponent(id)}`);
  return world(payload.world);
}

export async function putServerWorld(save: WorldSave) {
  const payload = await request(`/api/worlds/${encodeURIComponent(save.id)}`, { method: "PUT", body: JSON.stringify(save) });
  return world(payload.world);
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  try {
    const payload = await request("/api/status");
    return payload as unknown as RuntimeStatus;
  } catch (cause) {
    if (!(cause instanceof ServerStorageUnavailable)) throw cause;
    return {
      storage: "browser",
      database: { configured: false, reachable: false, schemaVersion: null, worlds: 0 },
    };
  }
}
