from __future__ import annotations

import random

from .contracts import EvolutionAnalysis, EvolutionChild, EvolutionRequest, EvolutionResponse, EvolutionSpecies
from .policy import BrainPolicy


def _dominates(left, right) -> bool:
    if len(left.fitness) != len(right.fitness):
        return False
    return all(a >= b for a, b in zip(left.fitness, right.fitness)) and any(a > b for a, b in zip(left.fitness, right.fitness))


def pareto_ranking(members) -> list:
    """Deterministic non-dominated sorting with survival-first tie breaks."""
    remaining = list(members)
    ranked: list = []
    while remaining:
        front = [candidate for candidate in remaining if not any(other is not candidate and _dominates(other, candidate) for other in remaining)]
        if not front:
            front = [min(remaining, key=lambda member: member.brain_id)]
        front.sort(key=lambda member: (
            -(member.fitness[0] if member.fitness else 0),
            -(member.fitness[1] if len(member.fitness) > 1 else 0),
            -member.novelty,
            member.brain_id,
        ))
        ranked.extend(front)
        chosen = {member.brain_id for member in front}
        remaining = [member for member in remaining if member.brain_id not in chosen]
    return ranked


def speciate(policy: BrainPolicy, request: EvolutionRequest, ranked: list | None = None) -> list[EvolutionSpecies]:
    ordered = ranked or pareto_ranking(request.members)
    groups: list[dict] = []
    # Founders are intentionally diverse. Descendants with modest structural
    # changes remain protected beside their representative.
    threshold = 0.12
    rank_index = {member.brain_id: index for index, member in enumerate(ordered)}
    for member in ordered:
        placed = None
        for group in groups:
            if policy.genome_distance(member.brain_id, group["representative"]) <= threshold:
                placed = group
                break
        if placed is None:
            placed = {"representative": member.brain_id, "members": []}
            groups.append(placed)
        placed["members"].append(member.brain_id)
    species: list[EvolutionSpecies] = []
    for index, group in enumerate(groups):
        representative = group["representative"]
        member_ids = group["members"]
        distances = [policy.genome_distance(representative, brain_id) for brain_id in member_ids]
        species.append(EvolutionSpecies(
            speciesId=f"species-g{request.generation}-{index + 1}",
            representativeId=representative,
            memberIds=member_ids,
            bestBrainId=min(member_ids, key=lambda brain_id: rank_index[brain_id]),
            meanDistance=sum(distances) / max(1, len(distances)),
        ))
    return species


def analyze(policy: BrainPolicy, request: EvolutionRequest) -> EvolutionAnalysis:
    ranked = pareto_ranking(request.members)
    return EvolutionAnalysis(
        experimentId=request.experiment_id,
        generation=request.generation,
        species=speciate(policy, request, ranked),
        ranking=[member.brain_id for member in ranked],
    )


def evolve(policy: BrainPolicy, request: EvolutionRequest) -> EvolutionResponse:
    rng = random.Random(request.seed)
    analysis = analyze(policy, request)
    by_id = {member.brain_id: member for member in request.members}
    ranked = [by_id[brain_id] for brain_id in analysis.ranking]
    species_by_member = {brain_id: species.species_id for species in analysis.species for brain_id in species.member_ids}
    elite_count = max(1, round(request.population_size * 0.10))
    immigrant_count = max(1, round(request.population_size * 0.10))
    reproduction_count = request.population_size - elite_count - immigrant_count
    crossover_count = min(reproduction_count, max(1, round(reproduction_count * 0.30)))
    mutation_count = reproduction_count - crossover_count
    children: list[EvolutionChild] = []
    next_generation = request.generation + 1

    # Protect the best representative of as many species as elite slots allow.
    elite_ids = []
    for species in analysis.species:
        if species.best_brain_id not in elite_ids:
            elite_ids.append(species.best_brain_id)
        if len(elite_ids) == elite_count:
            break
    for member in ranked:
        if len(elite_ids) == elite_count:
            break
        if member.brain_id not in elite_ids:
            elite_ids.append(member.brain_id)
    for index, parent_id in enumerate(elite_ids):
        brain_id = f"{request.experiment_id}-g{next_generation}-elite-{index}"
        record = policy.clone(parent_id, brain_id, next_generation)
        children.append(EvolutionChild(
            brainId=brain_id, parentId=parent_id, parentIds=[parent_id], kind="elite",
            artifactHash=record.artifact_hash, magnitude=0, speciesId=species_by_member[parent_id],
            mutations=[], topology=policy.topology(brain_id),
        ))

    parent_pool = ranked[:max(2, min(len(ranked), max(len(analysis.species) * 2, request.population_size // 2)))]
    for index in range(mutation_count):
        parent = parent_pool[index % len(parent_pool)] if index < len(parent_pool) else rng.choice(parent_pool)
        brain_id = f"{request.experiment_id}-g{next_generation}-mut-{index}"
        magnitude = 0.08 + rng.random() * 0.20
        mutation = policy.mutate(parent.brain_id, brain_id, rng.randrange(2**32), magnitude, next_generation)
        children.append(EvolutionChild(
            brainId=brain_id, parentId=parent.brain_id, parentIds=[parent.brain_id], kind="mutation",
            artifactHash=mutation.record.artifact_hash, magnitude=magnitude, speciesId=species_by_member[parent.brain_id],
            mutations=list(mutation.events), topology=policy.topology(brain_id),
        ))

    for index in range(crossover_count):
        first = parent_pool[index % len(parent_pool)]
        first_species = species_by_member[first.brain_id]
        compatible = [member for member in parent_pool if member.brain_id != first.brain_id and species_by_member[member.brain_id] == first_species]
        second = rng.choice(compatible or [member for member in parent_pool if member.brain_id != first.brain_id])
        brain_id = f"{request.experiment_id}-g{next_generation}-cross-{index}"
        crossed = policy.crossover(first.brain_id, second.brain_id, brain_id, rng.randrange(2**32), next_generation)
        children.append(EvolutionChild(
            brainId=brain_id, parentId=first.brain_id, parentIds=[first.brain_id, second.brain_id], kind="crossover",
            artifactHash=crossed.record.artifact_hash, magnitude=0.05, speciesId=first_species,
            mutations=list(crossed.events), topology=policy.topology(brain_id),
        ))

    for index in range(immigrant_count):
        brain_id = f"{request.experiment_id}-g{next_generation}-new-{index}"
        record = policy.immigrant(brain_id, rng.randrange(2**32), next_generation)
        children.append(EvolutionChild(
            brainId=brain_id, parentId=None, parentIds=[], kind="immigrant",
            artifactHash=record.artifact_hash, magnitude=1,
            speciesId=f"species-g{next_generation}-novel-{index + 1}", mutations=[{"kind": "new-genome", "count": 1, "magnitude": 1}],
            topology=policy.topology(brain_id),
        ))

    return EvolutionResponse(
        experimentId=request.experiment_id,
        generation=next_generation,
        children=children,
        species=analysis.species,
        ranking=analysis.ranking,
    )
