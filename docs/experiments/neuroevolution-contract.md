# Freewill Neuroevolution Laboratory

Status: implemented baseline (`freewill-sparse-recurrent-v2`)

This document defines the scientific contract for Freewill's local evolution mode. The simulation owns physics, legality, pathfinding and consequences. A brain only receives a citizen-scoped observation and chooses one legal high-level action.

## Two connected modes

### Evolution Laboratory

The laboratory resets repeatable islands, evaluates a population across training seeds, performs survival-first Pareto selection, preserves elites and produces mutations, crossovers and immigrants. Every generation is checkpointed. Unseen seeds compare the final population with random, heuristic and unevolved controls.

### Evolution Observatory

Every active headless island can be inspected at `/observatory?experiment=<experiment-id>`. The page is read-only and samples the engine about once per second, so observing cannot alter selection, timing or random seeds. It exposes actual positions, routes, needs, inventory, social groups, recent memories, world events and the local brain's scored legal candidates. It deliberately does not invent an inner monologue: before a decision arrives, the inspector says so. When no island is active, the latest saved completed snapshot is shown for post-run debugging.

The field-recorder timeline can play, pause, single-step or scrub an episode. Each requested frame is reconstructed server-side from a verified simulation checkpoint plus the recorded decisions between that checkpoint and the selected tick. Replay never calls a decision provider, changes the saved episode or branches the experiment. Checkpoint marks on the rail show the retained verification anchors; intermediate ticks are deterministic reconstructions, not interpolated screenshots.

### Living Island

Any saved generation can be deployed into the visible world. The world keeps animation, movement, personal memory, skills, relationships, resources and construction in the TypeScript engine. Completed actions are converted into bounded outcome records and update only that citizen brain's episode-local action values; the inherited genome remains unchanged. The deployed genome IDs are persisted with the world save. Citizens beyond the deployed population receive new independent local brains; deployed brains are never silently duplicated into shared lifetime state.

Continuous birth, inheritance and overlapping natural generations remain a later living-island layer. They must reuse the same genome and lineage contracts rather than introducing a separate decision system.

## Genome

Every NPC owns a complete Safetensors genome:

- sparse observation weights and connection mask;
- sparse candidate-action weights and connection mask;
- sparse recurrent weights and connection mask;
- active hidden-node mask;
- scoring weights and action-family biases;
- exploration temperature, persistence and reward sensitivity.

Founders begin with 16–24 of 48 available hidden nodes. Structural mutations can add or remove connections and enable or disable nodes. Two compatible parents can produce a crossover whose topology retains innovations from both parents. This is a compact NEAT-inspired representation, not a claim that Freewill uses the NEAT-Python implementation.

## Lifetime state versus inheritance

Inherited:

- neural weights;
- connection topology;
- action biases;
- exploration and persistence parameters.

Not inherited:

- recurrent hidden state;
- remembered action outcomes;
- known resource positions;
- relationships, promises and grievances;
- learned skills and personal memories.

The brain service records bounded action-outcome associations during one lifetime. The world engine owns semantic memory. A finished episode can save a lifetime checkpoint for inspection, but reproduction only reads the genome checkpoint.

## Selection and species

Citizen fitness currently contains seven independently visible dimensions:

1. survival;
2. physiological stability;
3. action competence;
4. adaptability;
5. personal-value alignment;
6. resource efficiency;
7. behavioral novelty.

Selection uses deterministic non-dominated sorting. Survival and physiological stability break ties before novelty. It does not directly reward houses, farms, governments or markets. Those strategies only matter when their world consequences improve the measured outcomes.

Genomes are grouped by structural and behavioral-parameter distance. The best member of as many species as the elite budget permits is protected. The UI records species size, representative, best member and mean genomic distance.

## Reliability contract

Brain requests retry temporary connection failures with bounded exponential backoff. Episode creation, decisions, experiences and finishing are idempotent, making retries safe. Failed experiments close their Python lifetime state, mark the database episode failed with a concrete stage/day error and release the active simulation.

## Evidence required before claiming learning

A completed run is not automatically a successful result. The UI reports “evolution not yet proven” unless:

- at least two held-out seeds are used;
- each held-out seed has at least two replicates;
- evolved survival beats the unevolved baseline by more than two percentage points;
- physiological stability does not regress;
- all control cohorts complete.

The behavior-shift metric measures total variation between action-family distributions in adjacent generations. A nonzero value proves behavioral change, not improvement.

## Reproducibility

World seeds, sampling seeds, mutation seeds, parent ranking and species assignment are deterministic. A saved experiment bundle contains configuration, results, checkpoint hashes and lineage. Safetensors remain content-addressed in the local `freewill_brains` Docker volume.

Balanced compute runs two isolated episodes concurrently; Eco and Demo run one. Concurrency only changes scheduling: generation aggregation preserves configured seed and replicate order, while every episode keeps independent lifetime state and deterministic sampling.

## Next research layers

These layers are intentionally gated behind the controlled baseline:

- continuous births, aging, reproduction and overlapping generations;
- inherited two-parent genomes during a living island;
- reinforcement learning that changes an individual policy during life;
- richer episodic memory retrieval;
- environment suites designed to test cooperation and competition;
- statistical confidence intervals across larger seed sets.

They should be added only after the controlled laboratory repeatedly beats its baselines on unseen islands.
