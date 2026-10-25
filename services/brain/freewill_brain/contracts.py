from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import SCHEMA_VERSION

OBSERVATION_DIMENSION = 192
CANDIDATE_DIMENSION = 64


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Candidate(ContractModel):
    candidate_id: str = Field(alias="candidateId", min_length=1, max_length=300)
    family: str = Field(min_length=1, max_length=100)
    features: list[float]

    @field_validator("features")
    @classmethod
    def candidate_shape(cls, value: list[float]) -> list[float]:
        if len(value) != CANDIDATE_DIMENSION:
            raise ValueError(f"candidate features must contain {CANDIDATE_DIMENSION} floats")
        return value


class EncodedDecision(ContractModel):
    request_id: str = Field(alias="requestId", min_length=1, max_length=300)
    citizen_id: int = Field(alias="citizenId")
    brain_id: str = Field(alias="brainId", min_length=1, max_length=200)
    observation: list[float]
    observation_mask: list[float] = Field(alias="observationMask")
    candidates: list[Candidate] = Field(min_length=1, max_length=50)
    sampling_seed: int = Field(alias="samplingSeed", ge=0, le=4_294_967_295)

    @field_validator("observation", "observation_mask")
    @classmethod
    def observation_shape(cls, value: list[float]) -> list[float]:
        if len(value) != OBSERVATION_DIMENSION:
            raise ValueError(f"observation must contain {OBSERVATION_DIMENSION} floats")
        return value


class DecisionBatch(ContractModel):
    schema_version: Literal[SCHEMA_VERSION] = Field(alias="schemaVersion")
    episode_id: str = Field(alias="episodeId", min_length=1, max_length=200)
    policy_version: str = Field(alias="policyVersion", min_length=1, max_length=100)
    decisions: list[EncodedDecision] = Field(min_length=1, max_length=256)


class Evaluation(ContractModel):
    candidate_id: str = Field(alias="candidateId")
    score: float
    probability: float


class DecisionResult(ContractModel):
    request_id: str = Field(alias="requestId")
    citizen_id: int = Field(alias="citizenId")
    brain_id: str = Field(alias="brainId")
    selected_candidate_id: str = Field(alias="selectedCandidateId")
    evaluations: list[Evaluation]
    entropy: float
    confidence: float
    checkpoint_version: str = Field(alias="checkpointVersion")
    sampling_counter: int = Field(alias="samplingCounter")
    latency_ms: float = Field(alias="latencyMs")


class ProviderDescriptor(ContractModel):
    kind: Literal["local-brain"] = "local-brain"
    id: str = "freewill-local-brain"
    label: str = "Local evolving brain"
    version: str


class DecisionBatchResponse(ContractModel):
    schema_version: Literal[SCHEMA_VERSION] = Field(alias="schemaVersion")
    episode_id: str = Field(alias="episodeId")
    provider: ProviderDescriptor
    decisions: list[DecisionResult]


class ExperienceDeltas(ContractModel):
    hunger: float = 0
    thirst: float = 0
    fatigue: float = 0
    loneliness: float = 0
    health: float = 0
    injury: float = 0
    illness: float = 0
    exposure: float = 0
    inventory: float = 0
    relationships: float = 0
    skills: float = 0
    knowledge: float = 0


class Experience(ContractModel):
    experience_id: str = Field(alias="experienceId")
    episode_id: str = Field(alias="episodeId")
    brain_id: str = Field(alias="brainId")
    citizen_id: int = Field(alias="citizenId")
    request_id: str | None = Field(default=None, alias="requestId")
    decision_id: str = Field(alias="decisionId")
    tick_started: int = Field(alias="tickStarted", ge=0)
    tick_completed: int = Field(alias="tickCompleted", ge=0)
    selected_candidate_id: str | None = Field(default=None, alias="selectedCandidateId")
    action_family: str = Field(alias="actionFamily")
    probability: float | None = None
    outcome: Literal["completed", "cancelled", "death"]
    reason: str | None = None
    deltas: ExperienceDeltas
    consequences: list[str] = Field(default_factory=list, max_length=32)
    terminal: bool = False


class ExperienceBatch(ContractModel):
    schema_version: Literal[SCHEMA_VERSION] = Field(alias="schemaVersion")
    episode_id: str = Field(alias="episodeId")
    experiences: list[Experience] = Field(max_length=1024)


class EpisodeCreate(ContractModel):
    episode_id: str = Field(alias="episodeId", min_length=1, max_length=200)
    brain_ids: list[str] = Field(alias="brainIds", max_length=256)


class EpisodeCheckpoint(ContractModel):
    reason: str = Field(default="periodic", max_length=100)


class EpisodeFinish(ContractModel):
    save_checkpoint: bool = Field(default=True, alias="saveCheckpoint")


class BrainClone(ContractModel):
    child_id: str = Field(alias="childId", min_length=1, max_length=200)
    generation: int = Field(default=0, ge=0)


class EvolutionMember(ContractModel):
    brain_id: str = Field(alias="brainId")
    fitness: list[float] = Field(min_length=1, max_length=32)
    novelty: float = 0


class EvolutionRequest(ContractModel):
    experiment_id: str = Field(alias="experimentId")
    generation: int = Field(ge=0)
    seed: int = Field(ge=0, le=4_294_967_295)
    population_size: int = Field(alias="populationSize", ge=4, le=1000)
    members: list[EvolutionMember] = Field(min_length=2, max_length=1000)


class EvolutionChild(ContractModel):
    brain_id: str = Field(alias="brainId")
    parent_id: str | None = Field(alias="parentId")
    parent_ids: list[str] = Field(default_factory=list, alias="parentIds")
    kind: Literal["elite", "mutation", "crossover", "immigrant"]
    artifact_hash: str = Field(alias="artifactHash")
    magnitude: float
    species_id: str = Field(alias="speciesId")
    mutations: list[dict] = Field(default_factory=list)
    topology: dict = Field(default_factory=dict)


class EvolutionSpecies(ContractModel):
    species_id: str = Field(alias="speciesId")
    representative_id: str = Field(alias="representativeId")
    member_ids: list[str] = Field(alias="memberIds")
    best_brain_id: str = Field(alias="bestBrainId")
    mean_distance: float = Field(alias="meanDistance")


class EvolutionAnalysis(ContractModel):
    experiment_id: str = Field(alias="experimentId")
    generation: int
    species: list[EvolutionSpecies]
    ranking: list[str]


class EvolutionResponse(ContractModel):
    experiment_id: str = Field(alias="experimentId")
    generation: int
    children: list[EvolutionChild]
    species: list[EvolutionSpecies]
    ranking: list[str]

