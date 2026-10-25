import { database, type WorldSave, type WorldSaveSummary } from "./database";
import { parseWorldDocument, type WorldDocument } from "./worldDocument";
import { useAppStore } from "../state/appStore";
import { initializeBuilderHistory } from "../state/builderHistory";
import { getServerWorld, listServerWorlds, putServerWorld, ServerStorageUnavailable } from "./serverStorage";

export type PersistenceBackend = "postgres" | "browser";
let activeBackend: PersistenceBackend = "browser";

export function getPersistenceBackend() {
  return activeBackend;
}

export async function listWorlds(): Promise<WorldSaveSummary[]> {
  try {
    const worlds = await listServerWorlds();
    activeBackend = "postgres";
    return worlds;
  } catch (cause) {
    if (!(cause instanceof ServerStorageUnavailable)) throw cause;
    activeBackend = "browser";
    return database.worlds.orderBy("updatedAt").reverse().toArray();
  }
}

export function captureDocument(): WorldDocument {
  const state = useAppStore.getState();
  if (!state.renderer) throw new Error("The world renderer is not ready.");
  if (state.historicalTick !== null) throw new Error("Return to the live world before saving or exporting.");
  return state.renderer.exportDocument({
    presetId: state.presetId,
    seed: state.seed,
    era: state.era,
    chapter: state.chapter,
    government: state.government,
    societyGoal: state.societyGoal,
    goalPrompt: state.goalPrompt,
    decisionMode: state.decisionMode,
    brainDeployment: state.brainDeployment ?? undefined,
    weather: state.weather,
    simulation: state.liveSimulation,
  });
}

export async function saveCurrentWorld() {
  const state = useAppStore.getState();
  const document = captureDocument();
  const id = state.currentSaveId ?? crypto.randomUUID();
  const existing = await database.worlds.get(id);
  const now = Date.now();
  const save: WorldSave = {
    id,
    name: document.config.name,
    presetId: document.config.presetId,
    seed: document.config.seed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    document,
  };
  let stored = save;
  try {
    stored = await putServerWorld(save);
    activeBackend = "postgres";
  } catch (cause) {
    if (!(cause instanceof ServerStorageUnavailable)) throw cause;
    activeBackend = "browser";
  }
  await database.worlds.put(stored);
  state.setCurrentSaveId(id);
  state.setLastSavedAt(stored.updatedAt);
  return stored;
}

export async function loadSavedWorld(id: string) {
  let save: WorldSave | undefined;
  try {
    save = await getServerWorld(id);
    activeBackend = "postgres";
    await database.worlds.put(save);
  } catch (cause) {
    if (!(cause instanceof ServerStorageUnavailable)) throw cause;
    activeBackend = "browser";
    save = await database.worlds.get(id);
  }
  if (!save) throw new Error("That saved world no longer exists.");
  const document = parseWorldDocument(save.document);
  const state = useAppStore.getState();
  if (!state.renderer) throw new Error("The world renderer is not ready.");
  state.setCivilizationStarted(false);
  state.setSpeed(0);
  state.renderer.setSpeed(0);
  state.renderer.importDocument(document);
  state.renderer.setSpeed(0);
  state.setPreset(document.config.presetId);
  state.setSeed(document.config.seed);
  state.setEra(document.config.era);
  state.setChapter(document.config.chapter);
  state.setGovernment(document.config.government);
  state.setSocietyGoal(document.config.societyGoal);
  state.setGoalPrompt(document.config.goalPrompt);
  state.setDecisionMode(document.config.decisionMode ?? "local-brain");
  state.setBrainDeployment(document.config.brainDeployment ?? null);
  state.setWeather(document.config.weather);
  state.setWorldName(document.config.name);
  state.setCurrentSaveId(save.id);
  state.bumpWorldRevision();
  state.setSimulation(document.simulation);
  state.setStatus(state.renderer.getStatus());
  initializeBuilderHistory();
  return save;
}

export async function replaySavedWorld(id: string) {
  const save = await loadSavedWorld(id);
  const state = useAppStore.getState();
  const recording = state.liveSimulation;
  if (!recording || recording.tick < 1) {
    throw new Error(`${save.name} has no recorded decisions to replay yet.`);
  }
  state.setPanel("chronicle");
  state.setReplayStartRequested(true);
  state.setReplayPlaying(true);
  return save;
}

export async function duplicateWorld(id: string) {
  let source: WorldSave | undefined;
  try {
    source = await getServerWorld(id);
    activeBackend = "postgres";
  } catch (cause) {
    if (!(cause instanceof ServerStorageUnavailable)) throw cause;
    activeBackend = "browser";
    source = await database.worlds.get(id);
  }
  if (!source) throw new Error("That saved world no longer exists.");
  const now = Date.now();
  const copy: WorldSave = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
  copy.document.config.name = copy.name;
  let stored = copy;
  if (activeBackend === "postgres") stored = await putServerWorld(copy);
  await database.worlds.put(stored);
  return stored;
}

export function downloadCurrentWorld() {
  const document = captureDocument();
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "freewill-world"}.freewill.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importWorldFile(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("World imports are limited to 10 MB.");
  const document = parseWorldDocument(JSON.parse(await file.text()));
  const now = Date.now();
  const save: WorldSave = {
    id: crypto.randomUUID(),
    name: document.config.name,
    presetId: document.config.presetId,
    seed: document.config.seed,
    createdAt: now,
    updatedAt: now,
    document,
  };
  let stored = save;
  try {
    stored = await putServerWorld(save);
    activeBackend = "postgres";
  } catch (cause) {
    if (!(cause instanceof ServerStorageUnavailable)) throw cause;
    activeBackend = "browser";
  }
  await database.worlds.put(stored);
  return stored;
}
