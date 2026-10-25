import type { DecisionProvider, SimulationSnapshot } from "../types";
import type { WorldHarshness } from "../worldGeneration";
import type { BrainExperienceRecord } from "../learning/contracts";

export interface ExperimentConfig {
  experimentId: string;
  episodeId: string;
  seed: number;
  runSeed?: number;
  width?: number;
  height?: number;
  harshness?: WorldHarshness;
  population: number;
  maximumDays: number;
  provider: DecisionProvider;
  brainIds?: string[];
}

export interface EpisodeMetrics {
  daysElapsed: number;
  survivors: number;
  deaths: number;
  averageHealth: number;
  averageLoneliness: number;
  criticalNeedFraction: number;
  completedActions: number;
  cancelledActions: number;
  successfulActionFraction: number;
  unreachableActions: number;
  unreachableActionFraction: number;
  criticalNeedInterruptions: number;
  collapses: number;
  rescues: number;
  collapsesPerHundredPersonDays: number;
  renewableFoodProduced: number;
  spoiledFood: number;
  knownTiles: number;
  learnedSkill: number;
  buildings: number;
  cropPlots: number;
  campfires: number;
  fueledCampfires: number;
  unfueledCampfireFraction: number;
  groups: number;
  households: number;
  actionDistribution: Record<string, number>;
  causesOfDeath: Record<string, number>;
}

export interface CitizenEpisodeResult {
  citizenId: number;
  brainId: string;
  alive: boolean;
  daysAlive: number;
  fitness: [number, number, number, number, number, number, number];
  actionDistribution: Record<string, number>;
}

export interface EpisodeResult {
  experimentId: string;
  episodeId: string;
  seed: number;
  engineVersion: string;
  terminalReason: "maximum-days" | "extinction" | "cancelled";
  durationMs: number;
  ticks: number;
  digest: string;
  metrics: EpisodeMetrics;
  citizens: CitizenEpisodeResult[];
  experiences: BrainExperienceRecord[];
  snapshot: SimulationSnapshot;
}

export interface EpisodeProgress {
  episodeId: string;
  tick: number;
  day: number;
  maximumDays: number;
  survivors: number;
  decisions: number;
}

