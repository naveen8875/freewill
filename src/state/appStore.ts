import { create } from "zustand";
import type { AssetCatalogGroup, WorldRenderer } from "../renderer/WorldRenderer";
import type { LegacyPreset, LegacyWorldStatus, WorldTool } from "../types/legacy";
import type { SimulationSnapshot, SocietyGoalId } from "../sim/types";

export type AppMode = "observe" | "build" | "creator";
export type DecisionMode = "mock" | "local-brain";
export type PanelId = "worlds" | "people" | "relationships" | "civilization" | "chronicle" | "decisions" | "experiments" | "assets" | "creator";

export interface BrainDeployment {
  experimentId: string;
  generation: number;
  label: string;
  brainIds: string[];
  speciesIds: string[];
}

export interface RuntimePerformance {
  tick: number;
  speed: number;
  ticksPerCycle: number;
  budgetMs: number;
  engineMs: number;
  snapshotMs: number;
  rendererMs: number;
  publishMs: number;
  totalMs: number;
  brainLatencyMs?: number;
  pendingBrains: number;
}

interface AppState {
  renderer: WorldRenderer | null;
  status: LegacyWorldStatus | null;
  presets: LegacyPreset[];
  catalog: AssetCatalogGroup[];
  mode: AppMode;
  panel: PanelId;
  panelOpen: boolean;
  presetId: string;
  seed: number;
  era: number;
  chapter: number;
  government: "council" | "kingdom" | "republic";
  societyGoal: SocietyGoalId;
  goalPrompt: string;
  decisionMode: DecisionMode;
  brainDeployment: BrainDeployment | null;
  civilizationStarted: boolean;
  speed: number;
  weather: string;
  season: number;
  grid: boolean;
  tool: WorldTool;
  terrainBrush: 1 | 3 | 5;
  terrainFill: boolean;
  selectedTerrain: number;
  worldRevision: number;
  simulation: SimulationSnapshot | null;
  liveSimulation: SimulationSnapshot | null;
  historicalTick: number | null;
  replayPlaying: boolean;
  replayStartRequested: boolean;
  replayError: string | null;
  selectedCitizenId: number | null;
  worldName: string;
  currentSaveId: string | null;
  lastSavedAt: number | null;
  persistenceError: string | null;
  runtimePerformance: RuntimePerformance | null;
  stepSimulation: (() => void) | null;
  viewSimulationTick: ((tick: number | null) => void) | null;
  invalidateSimulation: (() => void) | null;
  setRenderer(renderer: WorldRenderer | null): void;
  setStatus(status: LegacyWorldStatus | null): void;
  setMode(mode: AppMode): void;
  setPanel(panel: PanelId): void;
  closePanel(): void;
  setPreset(presetId: string): void;
  setSeed(seed: number): void;
  setEra(era: number): void;
  setChapter(chapter: number): void;
  setGovernment(government: AppState["government"]): void;
  setSocietyGoal(societyGoal: SocietyGoalId): void;
  setGoalPrompt(goalPrompt: string): void;
  setDecisionMode(decisionMode: DecisionMode): void;
  setBrainDeployment(deployment: BrainDeployment | null): void;
  setCivilizationStarted(started: boolean): void;
  setSpeed(speed: number): void;
  setWeather(weather: string): void;
  setSeason(season: number): void;
  setGrid(grid: boolean): void;
  setTool(tool: WorldTool): void;
  setTerrainBrush(size: 1 | 3 | 5): void;
  setTerrainFill(fill: boolean): void;
  setSelectedTerrain(terrain: number): void;
  bumpWorldRevision(): void;
  setSimulation(simulation: SimulationSnapshot | null): void;
  setHistoricalSimulation(simulation: SimulationSnapshot | null, tick: number | null): void;
  setReplayPlaying(playing: boolean): void;
  setReplayStartRequested(requested: boolean): void;
  setReplayError(message: string | null): void;
  setSelectedCitizenId(id: number | null): void;
  setWorldName(name: string): void;
  setCurrentSaveId(id: string | null): void;
  setLastSavedAt(time: number | null): void;
  setPersistenceError(message: string | null): void;
  setRuntimePerformance(performance: RuntimePerformance | null): void;
  setStepSimulation(step: (() => void) | null): void;
  setViewSimulationTick(view: ((tick: number | null) => void) | null): void;
  setInvalidateSimulation(invalidate: (() => void) | null): void;
}

export const useAppStore = create<AppState>((set) => ({
  renderer: null,
  status: null,
  presets: [],
  catalog: [],
  mode: "observe",
  panel: "worlds",
  panelOpen: false,
  presetId: "generated",
  seed: 7,
  era: 2,
  chapter: 0,
  government: "republic",
  societyGoal: "none",
  goalPrompt: "",
  decisionMode: "local-brain",
  brainDeployment: null,
  civilizationStarted: false,
  speed: 0,
  weather: "auto",
  season: 1,
  grid: false,
  tool: "watch",
  terrainBrush: 1,
  terrainFill: false,
  selectedTerrain: 3,
  worldRevision: 0,
  simulation: null,
  liveSimulation: null,
  historicalTick: null,
  replayPlaying: false,
  replayStartRequested: false,
  replayError: null,
  selectedCitizenId: null,
  worldName: "First Light",
  currentSaveId: null,
  lastSavedAt: null,
  persistenceError: null,
  runtimePerformance: null,
  stepSimulation: null,
  viewSimulationTick: null,
  invalidateSimulation: null,
  setRenderer: (renderer) => set({
    renderer,
    presets: renderer?.getPresets() ?? [],
    catalog: renderer?.getCatalog() ?? [],
  }),
  setStatus: (status) => set({ status }),
  setMode: (mode) => set((state) => ({ mode, panel: mode === "creator" ? "creator" : state.panel })),
  setPanel: (panel) => set({ panel, panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  setPreset: (presetId) => set({ presetId }),
  setSeed: (seed) => set({ seed }),
  setEra: (era) => set({ era }),
  setChapter: (chapter) => set({ chapter }),
  setGovernment: (government) => set({ government }),
  setSocietyGoal: (societyGoal) => set({ societyGoal }),
  setGoalPrompt: (goalPrompt) => set({ goalPrompt }),
  setDecisionMode: (decisionMode) => set({ decisionMode }),
  setBrainDeployment: (brainDeployment) => set({ brainDeployment }),
  setCivilizationStarted: (civilizationStarted) => set({ civilizationStarted }),
  setSpeed: (speed) => set({ speed }),
  setWeather: (weather) => set({ weather }),
  setSeason: (season) => set({ season }),
  setGrid: (grid) => set({ grid }),
  setTool: (tool) => set({ tool }),
  setTerrainBrush: (terrainBrush) => set({ terrainBrush }),
  setTerrainFill: (terrainFill) => set({ terrainFill }),
  setSelectedTerrain: (selectedTerrain) => set({ selectedTerrain }),
  bumpWorldRevision: () => set((state) => ({ worldRevision: state.worldRevision + 1, simulation: null, liveSimulation: null, historicalTick: null, replayPlaying: false, replayStartRequested: false, replayError: null, selectedCitizenId: null, runtimePerformance: null })),
  setSimulation: (simulation) => set((state) => ({ liveSimulation: simulation, ...(state.historicalTick === null ? { simulation } : {}) })),
  setHistoricalSimulation: (simulation, historicalTick) => set({ simulation, historicalTick, ...(historicalTick === null ? { replayPlaying: false } : {}) }),
  setReplayPlaying: (replayPlaying) => set({ replayPlaying }),
  setReplayStartRequested: (replayStartRequested) => set({ replayStartRequested }),
  setReplayError: (replayError) => set({ replayError }),
  setSelectedCitizenId: (selectedCitizenId) => set({ selectedCitizenId }),
  setWorldName: (worldName) => set({ worldName }),
  setCurrentSaveId: (currentSaveId) => set({ currentSaveId }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  setPersistenceError: (persistenceError) => set({ persistenceError }),
  setRuntimePerformance: (runtimePerformance) => set({ runtimePerformance }),
  setStepSimulation: (stepSimulation) => set({ stepSimulation }),
  setViewSimulationTick: (viewSimulationTick) => set({ viewSimulationTick }),
  setInvalidateSimulation: (invalidateSimulation) => set({ invalidateSimulation }),
}));
