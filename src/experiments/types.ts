import type { EpisodeMetrics } from "../sim/headless/experimentTypes";
import type { WorldHarshness } from "../sim/worldGeneration";

export type ExperimentStatus = "queued" | "running" | "completed" | "cancelled" | "failed";
export type ExperimentProfile = "eco" | "balanced" | "demo";
export type ExperimentCohort = "training" | "random-control" | "heuristic-control" | "unevolved-control" | "evolved-evaluation";

export interface LearningExperimentConfig {
  name: string;
  population: number;
  days: number;
  generations: number;
  replicates: number;
  trainingSeeds: number[];
  heldOutSeeds: number[];
  harshness: WorldHarshness;
  width: number;
  height: number;
  profile: ExperimentProfile;
}

export interface ExperimentEpisodeSummary {
  episodeId: string;
  generation: number;
  cohort: ExperimentCohort;
  seed: number;
  replicate: number;
  durationMs: number;
  digest: string;
  metrics: EpisodeMetrics;
}

export interface BrainTopologySummary {
  genomeVersion: string;
  nodes: number;
  maximumNodes: number;
  connections: number;
  maximumConnections: number;
  recurrentConnections: number;
}

export interface BrainSpeciesSummary {
  speciesId: string;
  representativeId: string;
  memberIds: string[];
  bestBrainId: string;
  meanDistance: number;
}

export interface BrainMutationSummary {
  kind: string;
  target?: string;
  count: number;
  magnitude: number;
  node?: number;
}

export interface BrainGenerationSummary {
  generation: number;
  brainIds: string[];
  episodes: ExperimentEpisodeSummary[];
  medianFitness: number[];
  diversity: number;
  species?: BrainSpeciesSummary[];
  ranking?: string[];
  behaviorShift?: number;
}

export interface ExperimentProgressState {
  stage: "queued" | "training" | "evolving" | "evaluating" | "complete" | "cancelled" | "failed";
  generation: number;
  totalGenerations: number;
  currentEpisodeId?: string;
  currentSeed?: number;
  currentDay?: number;
  maximumDay?: number;
  survivors?: number;
  completedEpisodes: number;
  totalEpisodes: number;
  message: string;
}

export interface LearningExperimentState {
  id: string;
  name: string;
  status: ExperimentStatus;
  config: LearningExperimentConfig;
  progress: ExperimentProgressState;
  generations: BrainGenerationSummary[];
  evaluations: ExperimentEpisodeSummary[];
  createdAt: number;
  updatedAt: number;
  error?: string;
}

