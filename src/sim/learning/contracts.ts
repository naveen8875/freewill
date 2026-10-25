import type { CandidateEvaluation, DecisionRequest, ProviderDescriptor } from "../types";

export const LEARNING_SCHEMA_VERSION = "freewill-learning-v1";
export const OBSERVATION_DIMENSION = 192;
export const CANDIDATE_DIMENSION = 64;

export interface EncodedBrainCandidate {
  candidateId: string;
  family: string;
  features: number[];
}

export interface EncodedBrainDecision {
  requestId: string;
  citizenId: number;
  brainId: string;
  observation: number[];
  observationMask: number[];
  candidates: EncodedBrainCandidate[];
  samplingSeed: number;
}

export interface BrainDecisionBatchRequest {
  schemaVersion: typeof LEARNING_SCHEMA_VERSION;
  episodeId: string;
  policyVersion: string;
  decisions: EncodedBrainDecision[];
}

export interface BrainDecisionResult {
  requestId: string;
  citizenId: number;
  brainId: string;
  selectedCandidateId: string;
  evaluations: CandidateEvaluation[];
  entropy: number;
  confidence: number;
  checkpointVersion: string;
  samplingCounter: number;
  latencyMs: number;
}

export interface BrainDecisionBatchResponse {
  schemaVersion: typeof LEARNING_SCHEMA_VERSION;
  episodeId: string;
  provider: ProviderDescriptor;
  decisions: BrainDecisionResult[];
}

export interface BrainExperienceRecord {
  experienceId: string;
  episodeId: string;
  brainId: string;
  citizenId: number;
  requestId?: string;
  decisionId: string;
  tickStarted: number;
  tickCompleted: number;
  selectedCandidateId?: string;
  actionFamily: string;
  probability?: number;
  outcome: "completed" | "cancelled" | "death";
  reason?: string;
  deltas: {
    hunger: number;
    thirst: number;
    fatigue: number;
    loneliness: number;
    health: number;
    injury: number;
    illness: number;
    exposure: number;
    inventory: number;
    relationships: number;
    skills: number;
    knowledge: number;
  };
  consequences: string[];
  terminal: boolean;
}

export interface BrainExperienceBatch {
  schemaVersion: typeof LEARNING_SCHEMA_VERSION;
  episodeId: string;
  experiences: BrainExperienceRecord[];
}

export interface LocalBrainProviderOptions {
  endpoint?: string;
  episodeId: string;
  brainIdForCitizen?: (citizenId: number) => string;
  fetchImpl?: typeof fetch;
  batchWindowMs?: number;
}

export interface EncodedRequestFixture {
  request: DecisionRequest;
  encoded: EncodedBrainDecision;
}

