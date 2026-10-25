import { useAppStore } from "./appStore";
import type { LegacyAssetDefinition, WorldTool } from "../types/legacy";
import { initializeBuilderHistory } from "./builderHistory";
import { recordBuilderMutation } from "./builderHistory";
import { applyEditorCommand, type EditorCommand } from "./editorCommands";
import type { SocietyGoalId } from "../sim/types";

export function reloadWorld(overrides: Partial<{
  presetId: string;
  seed: number;
  era: number;
  chapter: number;
  government: "council" | "kingdom" | "republic";
  societyGoal: SocietyGoalId;
  goalPrompt: string;
}> = {}) {
  const state = useAppStore.getState();
  state.setCivilizationStarted(false);
  state.setSpeed(0);
  state.renderer?.setSpeed(0);
  const presetId = overrides.presetId ?? state.presetId;
  const seed = overrides.seed ?? state.seed;
  const era = overrides.era ?? state.era;
  const chapter = overrides.chapter ?? state.chapter;
  const government = overrides.government ?? state.government;
  const societyGoal = overrides.societyGoal ?? state.societyGoal;
  const goalPrompt = overrides.goalPrompt ?? state.goalPrompt;

  if (overrides.presetId !== undefined) state.setPreset(presetId);
  if (overrides.seed !== undefined) state.setSeed(seed);
  if (overrides.era !== undefined) state.setEra(era);
  if (overrides.chapter !== undefined) state.setChapter(chapter);
  if (overrides.government !== undefined) state.setGovernment(government);
  if (overrides.societyGoal !== undefined) state.setSocietyGoal(societyGoal);
  if (overrides.goalPrompt !== undefined) state.setGoalPrompt(goalPrompt);

  const loadOptions = {
    era,
    chapter,
    gov: government,
    season: state.season,
    hour: 8,
  };
  if (presetId === "generated") {
    const world = state.renderer?.getWorld();
    state.renderer?.loadGeneratedWorld(state.worldName, seed, world?.w ?? 56, world?.h ?? 36, loadOptions);
  } else state.renderer?.loadWorld(presetId, seed, loadOptions);
  state.renderer?.setSpeed(0);
  state.renderer?.setWeather(state.weather);
  state.renderer?.setGrid(state.grid);
  state.setStatus(state.renderer?.getStatus() ?? null);
  state.bumpWorldRevision();
  initializeBuilderHistory();
}

export function selectCitizen(uid: number) {
  const state = useAppStore.getState();
  state.setSelectedCitizenId(uid);
  state.renderer?.selectEntity(uid);
  state.setStatus(state.renderer?.getStatus() ?? null);
  state.setPanel("people");
}

export function createConfiguredWorld(options: {
  name: string;
  presetId: string;
  seed: number;
  population: number;
  abundance: "scarce" | "balanced" | "abundant";
  harshness?: "gentle" | "balanced" | "harsh";
  government: "council" | "kingdom" | "republic";
  societyGoal?: SocietyGoalId;
  goalPrompt?: string;
  generatedSize?: { width: number; height: number };
  roster?: Array<{ name: string; job: string; trait: string; goal: string; inventory: Record<string, number>; appearance?: number; initialNeeds?: { hunger: number; fatigue: number; loneliness: number; thirst?: number }; settlementId?: string; relationshipPreset?: "strained" | "neutral" | "friendly" }>;
}) {
  const state = useAppStore.getState();
  state.setCivilizationStarted(false);
  state.setSpeed(0);
  state.renderer?.setSpeed(0);
  state.setWorldName(options.name);
  state.setPreset(options.presetId);
  state.setSeed(options.seed);
  state.setGovernment(options.government);
  state.setSocietyGoal(options.societyGoal ?? "none");
  state.setGoalPrompt(options.goalPrompt?.trim() ?? "");
  const loadOptions = {
    era: state.era,
    chapter: state.chapter,
    gov: options.government,
    season: state.season,
    hour: 8,
  };
  if (options.generatedSize) state.renderer?.loadGeneratedWorld(options.name, options.seed, options.generatedSize.width, options.generatedSize.height, { ...loadOptions, harshness: options.harshness ?? "balanced" });
  else state.renderer?.loadWorld(options.presetId, options.seed, loadOptions);
  state.renderer?.configureWorld({ name: options.name, population: options.population, abundance: options.abundance, roster: options.roster });
  state.renderer?.setSpeed(0);
  state.renderer?.setWeather(state.weather);
  state.renderer?.setGrid(state.grid);
  state.setStatus(state.renderer?.getStatus() ?? null);
  state.bumpWorldRevision();
  initializeBuilderHistory();
}

export function setWorldSpeed(speed: number) {
  const state = useAppStore.getState();
  if (speed > 0 && !state.civilizationStarted) return;
  state.setSpeed(speed);
  state.renderer?.setSpeed(speed);
}

export function startCivilization() {
  const state = useAppStore.getState();
  if (state.civilizationStarted || state.historicalTick !== null || !state.renderer) return;
  state.setCivilizationStarted(true);
  state.setSpeed(1);
  state.renderer.setSpeed(1);
}

export function setWorldSeason(season: number) {
  const state = useAppStore.getState();
  state.setSeason(season);
  state.renderer?.setSeason(season);
  state.setStatus(state.renderer?.getStatus() ?? null);
}

export function setWorldWeather(weather: string) {
  const state = useAppStore.getState();
  state.setWeather(weather);
  state.renderer?.setWeather(weather);
}

export function setWorldGrid(grid: boolean) {
  const state = useAppStore.getState();
  state.setGrid(grid);
  state.renderer?.setGrid(grid);
}

export function setWorldTool(tool: WorldTool) {
  const state = useAppStore.getState();
  if (state.historicalTick !== null && tool !== "watch") return;
  if (tool !== "watch" && state.speed !== 0) {
    state.setSpeed(0);
    state.renderer?.setSpeed(0);
  }
  state.setTool(tool);
  state.renderer?.setTool(tool);
}

export function selectAsset(asset: LegacyAssetDefinition) {
  const state = useAppStore.getState();
  if (state.historicalTick !== null) return;
  const tool: WorldTool = asset.cat === "nature" || asset.cat === "landmark" || asset.cat === "crop"
    ? "plant"
    : asset.cat === "character" || asset.cat === "animal"
      ? "people"
      : "build";
  state.setMode("build");
  state.setTool(tool);
  state.renderer?.setTool(tool, { id: asset.id, opts: { v: 0 } });
}

export function selectTerrain(terrain: number) {
  const state = useAppStore.getState();
  if (state.historicalTick !== null) return;
  state.setMode("build");
  state.setTool("terrain");
  state.setSelectedTerrain(terrain);
  state.renderer?.setTool("terrain", { terrain, brush: state.terrainBrush, fill: state.terrainFill });
}

export function setTerrainBrush(brush: 1 | 3 | 5) {
  const state = useAppStore.getState();
  state.setTerrainBrush(brush);
  state.setTerrainFill(false);
  state.renderer?.setTool("terrain", { terrain: state.selectedTerrain, brush, fill: false });
}

export function setTerrainFill(fill: boolean) {
  const state = useAppStore.getState();
  state.setTerrainFill(fill);
  state.renderer?.setTool("terrain", { terrain: state.selectedTerrain, brush: state.terrainBrush, fill });
}

export function executeEditorCommand(command: EditorCommand) {
  const state = useAppStore.getState();
  if (state.historicalTick !== null) throw new Error("Historical replay is read-only. Return to the present before editing.");
  if (!state.renderer) throw new Error("The world renderer is not ready.");
  if (state.speed !== 0) {
    state.setSpeed(0);
    state.renderer.setSpeed(0);
  }
  const document = state.renderer.exportDocument({
    presetId: state.presetId, seed: state.seed, era: state.era, chapter: state.chapter,
    government: state.government, societyGoal: state.societyGoal, goalPrompt: state.goalPrompt, decisionMode: state.decisionMode, brainDeployment: state.brainDeployment ?? undefined, weather: state.weather, simulation: state.liveSimulation,
  });
  const applied = applyEditorCommand(document, command);
  state.renderer.importDocument(applied.document);
  recordBuilderMutation();
  state.setStatus(state.renderer.getStatus());
  return applied;
}

export function editCurrentSelection(action: "left" | "right" | "up" | "down" | "rotate" | "delete") {
  const state = useAppStore.getState();
  const selection = state.status?.sel;
  if (!selection) return;
  const world = state.renderer?.getWorld();
  const target = selection.type === "object" ? world?.objects.find((item) => item.uid === selection.uid) : world?.entities.find((item) => item.uid === selection.uid);
  if (!target) return;
  const id = `editor-${world?.version ?? 0}-${selection.uid}-${action}`;
  if (action === "rotate") {
    if (selection.type !== "object") return;
    executeEditorCommand({ id, type: "rotate", uid: selection.uid, quarterTurns: 1 });
  } else if (action === "delete") {
    executeEditorCommand({ id, type: "delete", target: selection.type === "object" ? "object" : "entity", uid: selection.uid });
  } else {
    const delta = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[action];
    executeEditorCommand({ id, type: "move", target: selection.type === "object" ? "object" : "entity", uid: selection.uid, x: Math.floor(target.x) + delta[0], y: Math.floor(target.y) + delta[1] });
  }
}
