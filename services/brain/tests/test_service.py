from pathlib import Path
import json

from fastapi.testclient import TestClient

from freewill_brain.api import app, policy
from freewill_brain.checkpoints import CheckpointStore
from freewill_brain.policy import BrainPolicy
from freewill_brain.contracts import DecisionBatch


def decision(candidate_ids=("idle-a", "idle-b")):
    candidates = []
    for index, candidate_id in enumerate(candidate_ids):
        features = [0.0] * 64
        features[0] = 1.0
        features[40] = 1.0
        features[41] = 1.0
        features[53 + index] = 1.0
        candidates.append({"candidateId": candidate_id, "family": "idle", "features": features})
    return {
        "requestId": "request-1-1",
        "citizenId": 1,
        "brainId": "brain-one",
        "observation": [0.0] * 192,
        "observationMask": [1.0] * 192,
        "candidates": candidates,
        "samplingSeed": 123,
    }


def test_cross_language_golden_fixture_parses_without_coercion():
    path = Path(__file__).parents[3] / "src" / "sim" / "learning" / "fixtures" / "decision-v1.json"
    raw = json.loads(path.read_text("utf8"))
    parsed = DecisionBatch.model_validate(raw)
    assert parsed.model_dump(by_alias=True) == raw


def test_batch_decision_is_constrained_and_deterministic(tmp_path, monkeypatch):
    monkeypatch.setattr("freewill_brain.api.policy", BrainPolicy(CheckpointStore(tmp_path)))
    client = TestClient(app)
    body = {"schemaVersion": "freewill-learning-v1", "episodeId": "episode-a", "policyVersion": "brain-v1", "decisions": [decision()]}
    client.post("/v1/episodes", json={"episodeId": "episode-a", "brainIds": ["brain-one"]}).raise_for_status()
    first = client.post("/v1/decide-batch", json=body)
    first.raise_for_status()
    selected = first.json()["decisions"][0]["selectedCandidateId"]
    assert selected in {"idle-a", "idle-b"}
    assert len(first.json()["decisions"][0]["evaluations"]) == 2

    client.post("/v1/episodes", json={"episodeId": "episode-a", "brainIds": ["brain-one"]}).raise_for_status()
    second = client.post("/v1/decide-batch", json=body)
    assert second.json()["decisions"][0]["selectedCandidateId"] == selected


def test_evolution_preserves_elites_mutates_and_adds_immigrants(tmp_path, monkeypatch):
    local = BrainPolicy(CheckpointStore(tmp_path))
    monkeypatch.setattr("freewill_brain.api.policy", local)
    for brain_id in ["a", "b", "c", "d"]:
        local.ensure_genome(brain_id)
    response = TestClient(app).post("/v1/evolution/jobs", json={
        "experimentId": "exp",
        "generation": 0,
        "seed": 9,
        "populationSize": 20,
        "members": [
            {"brainId": "a", "fitness": [1, 1], "novelty": .5},
            {"brainId": "b", "fitness": [.8, 1.2], "novelty": .7},
            {"brainId": "c", "fitness": [.6, .6], "novelty": .2},
            {"brainId": "d", "fitness": [.5, .9], "novelty": .4},
        ],
    })
    response.raise_for_status()
    children = response.json()["children"]
    assert len(children) == 20
    assert {child["kind"] for child in children} == {"elite", "mutation", "crossover", "immigrant"}
    assert response.json()["species"]
    assert all(child["topology"]["connections"] > 0 for child in children)
    assert all((tmp_path / "genomes" / f"{child['artifactHash']}.safetensors").exists() for child in children)


def test_founder_ids_create_distinct_reproducible_genomes(tmp_path):
    first = BrainPolicy(CheckpointStore(tmp_path / "first"))
    a = first.ensure_genome("experiment-g0-brain-1").record.artifact_hash
    b = first.ensure_genome("experiment-g0-brain-2").record.artifact_hash
    second = BrainPolicy(CheckpointStore(tmp_path / "second"))
    again = second.ensure_genome("experiment-g0-brain-1").record.artifact_hash
    assert a != b
    assert a == again
    topology = first.topology("experiment-g0-brain-1")
    assert 16 <= topology["nodes"] <= 24
    assert topology["connections"] > 0


def test_lifetime_checkpoint_is_safe_and_finish_releases_state(tmp_path, monkeypatch):
    local = BrainPolicy(CheckpointStore(tmp_path))
    monkeypatch.setattr("freewill_brain.api.policy", local)
    client = TestClient(app)
    client.post("/v1/episodes", json={"episodeId": "episode-life", "brainIds": ["../../brain-one"]}).raise_for_status()
    checkpoint = client.post("/v1/episodes/episode-life/checkpoint", json={"reason": "day-1"})
    checkpoint.raise_for_status()
    digest = checkpoint.json()["artifactHash"]
    assert (tmp_path / "lifetimes" / f"{digest}.safetensors").exists()
    finish = client.post("/v1/episodes/episode-life/finish", json={"saveCheckpoint": True})
    finish.raise_for_status()
    assert finish.json()["brains"] == 1
    assert client.post("/v1/episodes/episode-life/finish", json={"saveCheckpoint": True}).json() == finish.json()
    assert "episode-life" not in local.episodes
    assert not (tmp_path.parent / "brain-one.json").exists()
    late = client.post("/v1/decide-batch", json={"schemaVersion": "freewill-learning-v1", "episodeId": "episode-life", "policyVersion": "brain-v1", "decisions": [decision()]})
    assert late.status_code == 409
    assert "episode-life" not in local.episodes


def test_brain_metadata_and_clone_endpoints(tmp_path, monkeypatch):
    local = BrainPolicy(CheckpointStore(tmp_path))
    monkeypatch.setattr("freewill_brain.api.policy", local)
    client = TestClient(app)
    original = client.get("/v1/brains/founder")
    original.raise_for_status()
    clone = client.post("/v1/brains/founder/clone", json={"childId": "child", "generation": 2})
    clone.raise_for_status()
    assert clone.json()["artifactHash"] == original.json()["artifactHash"]
    assert client.get("/v1/brains/child").json()["parentIds"] == ["founder"]


def test_positive_need_relief_updates_lifetime_value_positively(tmp_path, monkeypatch):
    local = BrainPolicy(CheckpointStore(tmp_path))
    monkeypatch.setattr("freewill_brain.api.policy", local)
    client = TestClient(app)
    client.post("/v1/episodes", json={"episodeId": "learning", "brainIds": ["brain"]}).raise_for_status()
    experience = {
        "experienceId": "exp-1", "episodeId": "learning", "brainId": "brain", "citizenId": 1,
        "decisionId": "decision-1", "tickStarted": 1, "tickCompleted": 2,
        "actionFamily": "eat", "outcome": "completed", "deltas": {"hunger": .4}, "terminal": False,
    }
    client.post("/v1/experience-batch", json={"schemaVersion": "freewill-learning-v1", "episodeId": "learning", "experiences": [experience]}).raise_for_status()
    assert local.episodes["learning"]["brain"].action_values["eat"][0] > 0


def test_social_relief_is_learnable_and_death_is_not_treated_like_a_minor_cancel(tmp_path, monkeypatch):
    local = BrainPolicy(CheckpointStore(tmp_path))
    monkeypatch.setattr("freewill_brain.api.policy", local)
    client = TestClient(app)
    client.post("/v1/episodes", json={"episodeId": "social-learning", "brainIds": ["brain"]}).raise_for_status()
    base = {
        "episodeId": "social-learning", "brainId": "brain", "citizenId": 1,
        "tickStarted": 1, "tickCompleted": 2, "terminal": False,
    }
    experiences = [
        {**base, "experienceId": "social", "decisionId": "social", "actionFamily": "teach_technique", "outcome": "completed", "deltas": {"loneliness": .25, "relationships": .2}},
        {**base, "experienceId": "death", "decisionId": "death", "actionFamily": "explore", "outcome": "death", "deltas": {}, "terminal": True},
    ]
    client.post("/v1/experience-batch", json={"schemaVersion": "freewill-learning-v1", "episodeId": "social-learning", "experiences": experiences}).raise_for_status()
    assert local.episodes["social-learning"]["brain"].action_values["teach_technique"][0] > 0
    assert local.episodes["social-learning"]["brain"].action_values["explore"][0] <= -1.5


def test_mutation_changes_topology_and_action_probabilities(tmp_path):
    local = BrainPolicy(CheckpointStore(tmp_path))
    parent = local.ensure_genome("parent")
    mutation = local.mutate("parent", "child", seed=1234, magnitude=.25, generation=1)
    child = local.ensure_genome("child")
    assert mutation.record.artifact_hash != parent.record.artifact_hash
    assert child.record.parent_ids == ("parent",)
    assert any(event["kind"] == "add-connection" for event in mutation.events)
    assert local.topology(parent)["connections"] != local.topology(child)["connections"]

    parent_decision = decision()
    parent_decision["brainId"] = "parent"
    child_decision = decision()
    child_decision["brainId"] = "child"
    local.create_episode("parent-episode", ["parent"])
    local.create_episode("child-episode", ["child"])
    parent_result = local.decide("parent-episode", DecisionBatch.model_validate({
        "schemaVersion": "freewill-learning-v1", "episodeId": "parent-episode", "policyVersion": "v2", "decisions": [parent_decision],
    }).decisions[0])
    child_result = local.decide("child-episode", DecisionBatch.model_validate({
        "schemaVersion": "freewill-learning-v1", "episodeId": "child-episode", "policyVersion": "v2", "decisions": [child_decision],
    }).decisions[0])
    assert [item.probability for item in parent_result.evaluations] != [item.probability for item in child_result.evaluations]


def test_crossover_inherits_two_parents(tmp_path):
    local = BrainPolicy(CheckpointStore(tmp_path))
    local.ensure_genome("first")
    local.ensure_genome("second")
    crossed = local.crossover("first", "second", "child", seed=55, generation=1)
    assert crossed.record.parent_ids == ("first", "second")
    assert crossed.record.artifact_hash not in {local.ensure_genome("first").record.artifact_hash, local.ensure_genome("second").record.artifact_hash}
    assert crossed.events[0]["kind"] == "crossover"


def test_decisions_and_experiences_are_idempotent(tmp_path):
    local = BrainPolicy(CheckpointStore(tmp_path))
    local.create_episode("retry-safe", ["brain-one"])
    parsed = DecisionBatch.model_validate({
        "schemaVersion": "freewill-learning-v1", "episodeId": "retry-safe", "policyVersion": "v2", "decisions": [decision()],
    }).decisions[0]
    first = local.decide("retry-safe", parsed)
    second = local.decide("retry-safe", parsed)
    assert first == second
    assert local.episodes["retry-safe"]["brain-one"].sampling_counter == 1
    assert local.experience("retry-safe", "brain-one", "experience-1", "idle", .5)
    assert not local.experience("retry-safe", "brain-one", "experience-1", "idle", .5)
    assert local.episodes["retry-safe"]["brain-one"].action_values["idle"][1] == 1

