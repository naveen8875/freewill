from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from threading import RLock

import torch

from . import SERVICE_VERSION
from .checkpoints import CheckpointStore, GenomeRecord
from .contracts import DecisionResult, EncodedDecision, Evaluation

torch.set_num_threads(max(1, min(4, int(__import__("os").environ.get("FREEWILL_BRAIN_THREADS", "2")))))

OBSERVATION_INPUTS = 384
CANDIDATE_INPUTS = 64
HIDDEN_NODES = 48
ACTION_FAMILIES = 40
GENOME_VERSION = "freewill-sparse-recurrent-v2"


@dataclass
class BrainGenome:
    brain_id: str
    tensors: dict[str, torch.Tensor]
    record: GenomeRecord


@dataclass
class LifetimeState:
    hidden: torch.Tensor = field(default_factory=lambda: torch.zeros(HIDDEN_NODES))
    sampling_counter: int = 0
    action_values: dict[str, tuple[float, int]] = field(default_factory=dict)
    decision_cache: dict[str, DecisionResult] = field(default_factory=dict)
    seen_experiences: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class MutationResult:
    record: GenomeRecord
    events: tuple[dict, ...]


def _seed_for(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode("utf8")).digest()[:8], "big") % 2**31


def _randn(shape: tuple[int, ...], generator: torch.Generator, scale: float) -> torch.Tensor:
    return torch.randn(shape, generator=generator, dtype=torch.float32) * scale


def _sparse_mask(shape: tuple[int, ...], generator: torch.Generator, density: float) -> torch.Tensor:
    return (torch.rand(shape, generator=generator) < density).to(torch.float32)


class BrainPolicy:
    """Complete independently inheritable neural policies.

    Every genome owns observation, candidate, recurrent and scoring weights.
    Binary connection masks are an evolvable topology. Lifetime hidden state
    and experience associations are separate and are never inherited.
    """

    def __init__(self, store: CheckpointStore | None = None) -> None:
        self.store = store or CheckpointStore()
        self.genomes: dict[str, BrainGenome] = {}
        self.episodes: dict[str, dict[str, LifetimeState]] = {}
        self.finished_episodes: dict[str, dict] = {}
        # Balanced experiments may start two episodes with the same immutable
        # population concurrently. Serialize only the first load/create so a
        # genome artifact can never be written twice by competing API threads.
        self._genome_lock = RLock()

    def _random_tensors(self, brain_id: str, seed: int | None = None) -> dict[str, torch.Tensor]:
        generator = torch.Generator(device="cpu")
        generator.manual_seed(seed if seed is not None else _seed_for(brain_id))
        node_mask = torch.zeros(HIDDEN_NODES, dtype=torch.float32)
        initial_nodes = 16 + int(torch.randint(0, 9, (1,), generator=generator).item())
        node_mask[torch.randperm(HIDDEN_NODES, generator=generator)[:initial_nodes]] = 1
        return {
            "obs_weight": _randn((HIDDEN_NODES, OBSERVATION_INPUTS), generator, 0.16),
            "obs_mask": _sparse_mask((HIDDEN_NODES, OBSERVATION_INPUTS), generator, 0.09),
            "obs_bias": _randn((HIDDEN_NODES,), generator, 0.08),
            "candidate_weight": _randn((HIDDEN_NODES, CANDIDATE_INPUTS), generator, 0.20),
            "candidate_mask": _sparse_mask((HIDDEN_NODES, CANDIDATE_INPUTS), generator, 0.18),
            "candidate_bias": _randn((HIDDEN_NODES,), generator, 0.08),
            "recurrent_weight": _randn((HIDDEN_NODES, HIDDEN_NODES), generator, 0.10),
            "recurrent_mask": _sparse_mask((HIDDEN_NODES, HIDDEN_NODES), generator, 0.06),
            "recurrent_bias": _randn((HIDDEN_NODES,), generator, 0.05),
            "score_hidden": _randn((HIDDEN_NODES,), generator, 0.22),
            "score_candidate": _randn((HIDDEN_NODES,), generator, 0.22),
            "family_bias": _randn((ACTION_FAMILIES,), generator, 0.28),
            "node_mask": node_mask,
            "temperature": torch.tensor([0.65 + torch.rand(1, generator=generator).item() * 0.70]),
            "persistence": torch.tensor([0.20 + torch.rand(1, generator=generator).item() * 0.65]),
            "reward_sensitivity": torch.rand(8, generator=generator) * 0.4 + 0.8,
        }

    def _upgrade_tensors(self, brain_id: str, tensors: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
        if "obs_weight" in tensors:
            return tensors
        upgraded = self._random_tensors(brain_id, _seed_for(f"upgrade:{brain_id}"))
        if "family_bias" in tensors and tensors["family_bias"].shape == upgraded["family_bias"].shape:
            upgraded["family_bias"] = tensors["family_bias"].to(torch.float32).clone()
        for key in ("temperature", "persistence", "reward_sensitivity"):
            if key in tensors and tensors[key].shape == upgraded[key].shape:
                upgraded[key] = tensors[key].to(torch.float32).clone()
        return upgraded

    def ensure_genome(self, brain_id: str, *, generation: int = 0) -> BrainGenome:
        cached = self.genomes.get(brain_id)
        if cached:
            return cached
        with self._genome_lock:
            cached = self.genomes.get(brain_id)
            if cached:
                return cached
            loaded = self.store.load_genome(brain_id)
            if loaded:
                record, stored = loaded
                tensors = self._upgrade_tensors(brain_id, stored)
                if tensors is not stored:
                    record = self.store.save_genome(brain_id, tensors, parent_ids=record.parent_ids, generation=record.generation)
            else:
                tensors = self._random_tensors(brain_id)
                record = self.store.save_genome(brain_id, tensors, generation=generation)
            genome = BrainGenome(brain_id, tensors, record)
            self.genomes[brain_id] = genome
            return genome

    def create_episode(self, episode_id: str, brain_ids: list[str]) -> None:
        # Safe to retry after a caller loses the first response.
        states = self.episodes.setdefault(episode_id, {})
        self.finished_episodes.pop(episode_id, None)
        for brain_id in brain_ids:
            states.setdefault(brain_id, LifetimeState())
            self.ensure_genome(brain_id)

    def checkpoint_episode(self, episode_id: str, reason: str = "periodic") -> dict:
        states = self.episodes.get(episode_id)
        if states is None:
            raise KeyError(episode_id)
        tensors: dict[str, torch.Tensor] = {}
        brains = []
        for index, (brain_id, state) in enumerate(sorted(states.items())):
            tensors[f"brain_{index}_hidden"] = state.hidden
            tensors[f"brain_{index}_sampling_counter"] = torch.tensor([state.sampling_counter], dtype=torch.int64)
            brains.append({"brainId": brain_id, "actionValues": {family: {"average": average, "count": count} for family, (average, count) in sorted(state.action_values.items())}})
        return self.store.save_lifetime(episode_id, tensors, {"reason": reason, "brains": brains})

    def finish_episode(self, episode_id: str, save_checkpoint: bool = True) -> dict:
        previous = self.finished_episodes.get(episode_id)
        if previous is not None:
            return previous
        states = self.episodes.get(episode_id)
        if states is None:
            raise KeyError(episode_id)
        checkpoint = self.checkpoint_episode(episode_id, "finish") if save_checkpoint else None
        summary = {
            "episodeId": episode_id,
            "brains": len(states),
            "samples": sum(state.sampling_counter for state in states.values()),
            "learnedFamilies": sum(len(state.action_values) for state in states.values()),
            "checkpoint": checkpoint,
        }
        del self.episodes[episode_id]
        self.finished_episodes[episode_id] = summary
        if len(self.finished_episodes) > 10_000:
            for key in sorted(self.finished_episodes)[:5_000]:
                del self.finished_episodes[key]
        return summary

    def topology(self, genome: BrainGenome | str) -> dict:
        item = self.ensure_genome(genome) if isinstance(genome, str) else genome
        tensors = item.tensors
        connections = sum(int(tensors[key].sum().item()) for key in ("obs_mask", "candidate_mask", "recurrent_mask"))
        return {
            "genomeVersion": GENOME_VERSION,
            "nodes": int(tensors["node_mask"].sum().item()),
            "maximumNodes": HIDDEN_NODES,
            "connections": connections,
            "maximumConnections": HIDDEN_NODES * (OBSERVATION_INPUTS + CANDIDATE_INPUTS + HIDDEN_NODES),
            "recurrentConnections": int(tensors["recurrent_mask"].sum().item()),
        }

    def describe_brain(self, brain_id: str) -> dict:
        genome = self.ensure_genome(brain_id)
        return {
            "brainId": brain_id,
            "artifactHash": genome.record.artifact_hash,
            "generation": genome.record.generation,
            "parentIds": list(genome.record.parent_ids),
            "topology": self.topology(genome),
            "tensorShapes": {key: list(value.shape) for key, value in sorted(genome.tensors.items())},
        }

    def _state(self, episode_id: str, brain_id: str) -> LifetimeState:
        if episode_id in self.finished_episodes:
            raise KeyError(f"Episode {episode_id} is already finished")
        return self.episodes.setdefault(episode_id, {}).setdefault(brain_id, LifetimeState())

    def _forward(self, genome: BrainGenome, state: LifetimeState, decision: EncodedDecision) -> tuple[list[float], torch.Tensor]:
        tensors = genome.tensors
        observation = torch.tensor(decision.observation + decision.observation_mask, dtype=torch.float32)
        node_mask = tensors["node_mask"]
        observed = torch.mv(tensors["obs_weight"] * tensors["obs_mask"], observation) + tensors["obs_bias"]
        recurrent = torch.mv(tensors["recurrent_weight"] * tensors["recurrent_mask"], state.hidden)
        hidden = torch.tanh(observed + recurrent * float(tensors["persistence"].item()) + tensors["recurrent_bias"]) * node_mask
        scores: list[float] = []
        for candidate in decision.candidates:
            features = torch.tensor(candidate.features, dtype=torch.float32)
            encoded = torch.tanh(torch.mv(tensors["candidate_weight"] * tensors["candidate_mask"], features) + tensors["candidate_bias"]) * node_mask
            score = float(torch.dot(tensors["score_hidden"], hidden).item() + torch.dot(tensors["score_candidate"], encoded).item())
            family_index = next((index for index, value in enumerate(candidate.features[:ACTION_FAMILIES]) if value > 0.5), -1)
            if family_index >= 0:
                score += float(tensors["family_bias"][family_index].item())
                learned = state.action_values.get(candidate.family)
                if learned:
                    sensitivity = float(tensors["reward_sensitivity"][family_index % len(tensors["reward_sensitivity"])].item())
                    score += max(-0.7, min(0.7, learned[0] * sensitivity)) * 0.30
            scores.append(max(-30.0, min(30.0, score)))
        return scores, hidden

    def decide(self, episode_id: str, decision: EncodedDecision) -> DecisionResult:
        started = time.perf_counter()
        genome = self.ensure_genome(decision.brain_id)
        state = self._state(episode_id, decision.brain_id)
        cached = state.decision_cache.get(decision.request_id)
        if cached is not None:
            return cached
        scores, hidden = self._forward(genome, state, decision)
        state.hidden = hidden.detach()
        temperature = max(0.15, min(2.0, float(genome.tensors["temperature"].item())))
        probabilities = torch.softmax(torch.tensor(scores, dtype=torch.float32) / temperature, dim=0)
        generator = torch.Generator(device="cpu")
        generator.manual_seed((decision.sampling_seed + state.sampling_counter * 2_654_435_761) % 2**32)
        selected_index = int(torch.multinomial(probabilities, 1, generator=generator).item())
        state.sampling_counter += 1
        result = DecisionResult(
            requestId=decision.request_id,
            citizenId=decision.citizen_id,
            brainId=decision.brain_id,
            selectedCandidateId=decision.candidates[selected_index].candidate_id,
            evaluations=[Evaluation(candidateId=candidate.candidate_id, score=scores[index], probability=float(probabilities[index].item())) for index, candidate in enumerate(decision.candidates)],
            entropy=float(-(probabilities * torch.log(probabilities.clamp_min(1e-9))).sum().item()),
            confidence=float(probabilities[selected_index].item()),
            checkpointVersion=genome.record.artifact_hash,
            samplingCounter=state.sampling_counter,
            latencyMs=(time.perf_counter() - started) * 1000,
        )
        state.decision_cache[decision.request_id] = result
        if len(state.decision_cache) > 2_000:
            state.decision_cache.pop(next(iter(state.decision_cache)))
        return result

    def experience(self, episode_id: str, brain_id: str, experience_id: str, family: str, signal: float) -> bool:
        state = self._state(episode_id, brain_id)
        if experience_id in state.seen_experiences:
            return False
        state.seen_experiences.add(experience_id)
        average, count = state.action_values.get(family, (0.0, 0))
        count += 1
        state.action_values[family] = (average + (signal - average) / count, count)
        return True

    @staticmethod
    def _mutate_connections(mask: torch.Tensor, generator: torch.Generator, add_count: int, remove_count: int) -> tuple[torch.Tensor, int, int]:
        changed = mask.clone()
        inactive = torch.nonzero(changed == 0, as_tuple=False)
        active = torch.nonzero(changed > 0, as_tuple=False)
        added = min(add_count, len(inactive))
        removed = min(remove_count, len(active))
        if added:
            for index in torch.randperm(len(inactive), generator=generator)[:added]:
                changed[tuple(inactive[int(index)].tolist())] = 1
        if removed:
            for index in torch.randperm(len(active), generator=generator)[:removed]:
                changed[tuple(active[int(index)].tolist())] = 0
        return changed, added, removed

    def mutate(self, parent_id: str, child_id: str, seed: int, magnitude: float, generation: int) -> MutationResult:
        parent = self.ensure_genome(parent_id)
        generator = torch.Generator(device="cpu")
        generator.manual_seed(seed)
        child = {key: value.clone() for key, value in parent.tensors.items()}
        events: list[dict] = []
        rate = min(0.35, 0.06 + magnitude * 0.8)
        changed_weights = 0
        for key in ("obs_weight", "obs_bias", "candidate_weight", "candidate_bias", "recurrent_weight", "recurrent_bias", "score_hidden", "score_candidate", "family_bias"):
            tensor = child[key]
            selected = torch.rand(tensor.shape, generator=generator) < rate
            if selected.any():
                tensor[selected] += torch.randn((int(selected.sum().item()),), generator=generator) * max(0.08, magnitude * 2.5)
                changed_weights += int(selected.sum().item())
        events.append({"kind": "weights", "count": changed_weights, "magnitude": magnitude})
        for key, base_add in (("obs_mask", 18), ("candidate_mask", 8), ("recurrent_mask", 6)):
            additions = max(1, round(base_add * (0.5 + magnitude * 5)))
            removals = max(0, round(additions * 0.20))
            child[key], added, removed = self._mutate_connections(child[key], generator, additions, removals)
            if added:
                events.append({"kind": "add-connection", "target": key, "count": added, "magnitude": magnitude})
            if removed:
                events.append({"kind": "remove-connection", "target": key, "count": removed, "magnitude": magnitude})
        if torch.rand(1, generator=generator).item() < 0.30:
            inactive = torch.nonzero(child["node_mask"] == 0, as_tuple=False).flatten()
            if len(inactive):
                node = int(inactive[int(torch.randint(len(inactive), (1,), generator=generator).item())])
                child["node_mask"][node] = 1
                events.append({"kind": "add-node", "count": 1, "node": node, "magnitude": magnitude})
        if torch.rand(1, generator=generator).item() < 0.08 and int(child["node_mask"].sum()) > 8:
            active = torch.nonzero(child["node_mask"] > 0, as_tuple=False).flatten()
            node = int(active[int(torch.randint(len(active), (1,), generator=generator).item())])
            child["node_mask"][node] = 0
            events.append({"kind": "disable-node", "count": 1, "node": node, "magnitude": magnitude})
        child["temperature"] = (child["temperature"] + torch.randn((1,), generator=generator) * max(0.03, magnitude)).clamp(0.15, 2.0)
        child["persistence"] = (child["persistence"] + torch.randn((1,), generator=generator) * max(0.02, magnitude * 0.5)).clamp(0, 1.5)
        child["reward_sensitivity"] = (child["reward_sensitivity"] + torch.randn(child["reward_sensitivity"].shape, generator=generator) * magnitude).clamp(0, 2)
        record = self.store.save_genome(child_id, child, parent_ids=(parent_id,), generation=generation)
        self.genomes[child_id] = BrainGenome(child_id, child, record)
        return MutationResult(record, tuple(events))

    def crossover(self, first_id: str, second_id: str, child_id: str, seed: int, generation: int, magnitude: float = 0.05) -> MutationResult:
        first = self.ensure_genome(first_id)
        second = self.ensure_genome(second_id)
        generator = torch.Generator(device="cpu")
        generator.manual_seed(seed)
        child: dict[str, torch.Tensor] = {}
        for key, left in first.tensors.items():
            right = second.tensors[key]
            child[key] = torch.where(torch.rand(left.shape, generator=generator) < 0.5, right, left).clone()
        for key in ("obs_mask", "candidate_mask", "recurrent_mask", "node_mask"):
            child[key] = torch.maximum(first.tensors[key], second.tensors[key]).clone()
        child["family_bias"] += torch.randn(child["family_bias"].shape, generator=generator) * magnitude
        record = self.store.save_genome(child_id, child, parent_ids=(first_id, second_id), generation=generation)
        self.genomes[child_id] = BrainGenome(child_id, child, record)
        return MutationResult(record, ({"kind": "crossover", "count": 1, "magnitude": magnitude},))

    def immigrant(self, brain_id: str, seed: int, generation: int) -> GenomeRecord:
        tensors = self._random_tensors(brain_id, seed)
        record = self.store.save_genome(brain_id, tensors, generation=generation)
        self.genomes[brain_id] = BrainGenome(brain_id, tensors, record)
        return record

    def clone(self, parent_id: str, child_id: str, generation: int) -> GenomeRecord:
        parent = self.ensure_genome(parent_id)
        tensors = {key: value.clone() for key, value in parent.tensors.items()}
        record = self.store.save_genome(child_id, tensors, parent_ids=(parent_id,), generation=generation)
        self.genomes[child_id] = BrainGenome(child_id, tensors, record)
        return record

    def genome_distance(self, first_id: str, second_id: str) -> float:
        first = self.ensure_genome(first_id).tensors
        second = self.ensure_genome(second_id).tensors
        structural = sum(float((first[key] != second[key]).to(torch.float32).mean().item()) for key in ("obs_mask", "candidate_mask", "recurrent_mask", "node_mask")) / 4
        weight = sum(float(torch.mean(torch.abs(first[key] - second[key])).item()) for key in ("score_hidden", "score_candidate", "family_bias")) / 3
        return structural * 0.70 + min(1.0, weight) * 0.30

    @property
    def version(self) -> str:
        return SERVICE_VERSION
