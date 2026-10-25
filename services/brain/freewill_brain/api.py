from __future__ import annotations

import math
import os
import resource
import sys
from typing import Any

import uvicorn
from fastapi import FastAPI, Header, HTTPException

from . import SCHEMA_VERSION, SERVICE_VERSION
from .contracts import (
    DecisionBatch,
    DecisionBatchResponse,
    EpisodeCreate,
    EpisodeCheckpoint,
    EpisodeFinish,
    BrainClone,
    EvolutionAnalysis,
    EvolutionRequest,
    EvolutionResponse,
    ExperienceBatch,
    ProviderDescriptor,
)
from .evolution import analyze, evolve
from .policy import BrainPolicy, GENOME_VERSION

app = FastAPI(title="Freewill local brain", version=SERVICE_VERSION, docs_url="/docs")
policy = BrainPolicy()


def authorize(authorization: str | None) -> None:
    expected = os.environ.get("FREEWILL_BRAIN_TOKEN")
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid local brain token")


@app.get("/v1/health")
def health() -> dict[str, Any]:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_mb = peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024
    return {
        "status": "ready",
        "schemaVersion": SCHEMA_VERSION,
        "serviceVersion": SERVICE_VERSION,
        "backend": "torch-cpu-sparse-neuroevolution",
        "genomeVersion": GENOME_VERSION,
        "loadedBrains": len(policy.genomes),
        "activeEpisodes": len(policy.episodes),
        "activeEpisodeIds": sorted(policy.episodes)[:20],
        "peakMemoryMb": round(peak_mb, 1),
        "torchThreads": __import__("torch").get_num_threads(),
    }


@app.post("/v1/episodes")
def create_episode(body: EpisodeCreate, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    policy.create_episode(body.episode_id, body.brain_ids)
    return {"episodeId": body.episode_id, "brainIds": body.brain_ids, "brains": [policy.describe_brain(brain_id) for brain_id in body.brain_ids], "status": "ready"}


@app.post("/v1/episodes/{episode_id}/checkpoint")
def checkpoint_episode(episode_id: str, body: EpisodeCheckpoint, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    try:
        return policy.checkpoint_episode(episode_id, body.reason)
    except KeyError:
        raise HTTPException(status_code=404, detail="Episode not found") from None


@app.post("/v1/episodes/{episode_id}/finish")
def finish_episode(episode_id: str, body: EpisodeFinish, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    try:
        return policy.finish_episode(episode_id, body.save_checkpoint)
    except KeyError:
        raise HTTPException(status_code=404, detail="Episode not found") from None


@app.get("/v1/brains/{brain_id}")
def brain(brain_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    return policy.describe_brain(brain_id)


@app.post("/v1/brains/{brain_id}/clone")
def clone_brain(brain_id: str, body: BrainClone, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    record = policy.clone(brain_id, body.child_id, body.generation)
    return {"brainId": body.child_id, "parentId": brain_id, "generation": body.generation, "artifactHash": record.artifact_hash}


@app.post("/v1/decide-batch", response_model=DecisionBatchResponse, response_model_by_alias=True)
def decide_batch(body: DecisionBatch, authorization: str | None = Header(default=None)) -> DecisionBatchResponse:
    authorize(authorization)
    try:
        decisions = [policy.decide(body.episode_id, item) for item in body.decisions]
    except KeyError:
        raise HTTPException(status_code=409, detail="Episode is already finished") from None
    return DecisionBatchResponse(
        schemaVersion=SCHEMA_VERSION,
        episodeId=body.episode_id,
        provider=ProviderDescriptor(version=policy.version),
        decisions=decisions,
    )


@app.post("/v1/experience-batch")
def experience_batch(body: ExperienceBatch, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    accepted = 0
    for item in body.experiences:
        # A bounded, transparent lifetime association. Neural weights remain
        # frozen during an episode in phase one.
        d = item.deltas
        signal = (
            d.hunger + d.thirst + d.fatigue + d.exposure + d.injury + d.illness
            + d.loneliness + d.health + d.inventory * 0.08 + d.relationships * 0.10
            + d.skills * 0.12 + d.knowledge * 0.05
        )
        if item.outcome == "death":
            signal -= 1.5
        elif item.outcome != "completed":
            signal -= 0.15
        if math.isfinite(signal):
            try:
                if policy.experience(body.episode_id, item.brain_id, item.experience_id, item.action_family, max(-2, min(2, signal))):
                    accepted += 1
            except KeyError:
                pass
    return {"episodeId": body.episode_id, "accepted": accepted, "rejected": len(body.experiences) - accepted}


@app.post("/v1/evolution/jobs", response_model=EvolutionResponse, response_model_by_alias=True)
def evolution_job(body: EvolutionRequest, authorization: str | None = Header(default=None)) -> EvolutionResponse:
    authorize(authorization)
    return evolve(policy, body)


@app.post("/v1/evolution/analyze", response_model=EvolutionAnalysis, response_model_by_alias=True)
def evolution_analysis(body: EvolutionRequest, authorization: str | None = Header(default=None)) -> EvolutionAnalysis:
    authorize(authorization)
    return analyze(policy, body)


def main() -> None:
    uvicorn.run(app, host=os.environ.get("FREEWILL_BRAIN_HOST", "127.0.0.1"), port=int(os.environ.get("FREEWILL_BRAIN_PORT", "8008")))


if __name__ == "__main__":
    main()

