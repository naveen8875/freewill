# Freewill local evolving brains — master implementation plan

> Historical implementation plan retained for context. Use [Local evolving brains](../providers/local-evolving-brains.md) and the [experiment documentation](../experiments/README.md) for current behavior.

Status: Phase 1 engineering baseline implemented; extended scientific validation pending  
Plan version: 1.1  
Date: 2026-10-25

Implementation evidence, run commands, measured scale results and current limitations live in [Local evolving brains](../providers/local-evolving-brains.md). This document records the original plan; it is not the current source of truth.

## 1. Purpose

Freewill already answers the physical simulation question: a generated world contains finite resources, people have local knowledge and bodily needs, the engine produces legal actions, and every selected action has conserved, deterministic consequences.

The next experiment asks a different question:

> Can small local decision policies learn survival and social behavior from experience, then evolve across repeated islands, without a prescribed civilization goal or a remote model call for every decision?

The first deliverable is not a generally intelligent language model. It is a reproducible multi-agent learning laboratory in which:

- every NPC sees only local, permitted observations;
- every NPC chooses from the same engine-generated action vocabulary;
- traits, memories and an individual heritable brain state create behavioral variation;
- the engine, not the model, owns physics, legality, movement and consequences;
- learning and evolutionary selection are visible and inspectable;
- brain checkpoints can be saved, compared, cloned, mutated and replayed;
- failed societies and dead populations remain valid outcomes;
- the default experiment runs locally on an M3 Air without continuous paid inference.

This document is the source of truth for the program. API schemas, observation layouts and experimental reports may later move into focused companion documents, but changes to the experiment's purpose or authority boundaries must be reconciled here.

## 2. What this is — and is not

### This is

- a multi-agent reinforcement/evolution environment built around the existing Freewill world;
- a lightweight neural policy that ranks legal, parameterized action candidates;
- individual recurrent memory and heritable policy variation;
- population-based evaluation across many deterministic seeds;
- a UI for observing behavior, lineage, probabilities, outcomes and mutations;
- a platform for later reinforcement learning and optional local-LLM assistance.

### This is not

- 50 independently fine-tuned LLMs;
- a language model controlling walking or individual animation ticks;
- a hidden global objective to build a settlement;
- proof that one survivor is intelligent;
- evolution based on one lucky island;
- a system that silently rewards government, capitalism, cooperation or any other preferred social outcome;
- an excuse to bypass resource conservation or action legality.

## 3. Non-negotiable authority boundary

```text
Freewill engine
  local perception + legal parameterized candidates
                         |
                         v
Local Decisions API
  score candidates + sample/select one candidate ID
                         |
                         v
Freewill validator/executor
  reserve, route, animate, work, interrupt, commit consequences
                         |
                         v
Experience event
  what was attempted, what happened, body/social/world deltas
                         |
             +-----------+-----------+
             |                       |
             v                       v
 lifetime memory/value update   between-run evolution
```

The learned system is advisory in exactly the same way as the deterministic lab policy. It may select only an opaque candidate produced by `buildActionCandidates`. It cannot invent a resource, coordinate, building, relationship, vote, result or engine mutation.

The engine revalidates a choice before execution. Route planning, walking, work progress, crop growth, weather, spoilage, reservations, injuries and animation remain engine responsibilities.

## 4. Learning layers

The UI and data model must keep three forms of adaptation separate.

### 4.1 Lifetime learning

Within one island episode, an NPC develops:

- recurrent working state;
- episodic memories already owned by the simulation;
- action/outcome estimates for recurring situations;
- learned skills and resource knowledge;
- relationships and expectations about other people.

Phase 1 does not backpropagate neural weights during a running world. This avoids unstable online updates and keeps replay understandable. Lightweight running statistics and recurrent state may change, and are checkpointed as lifetime state.

### 4.2 Cultural learning

NPCs can teach, warn, observe, imitate and share discoveries through existing legal social actions. Cultural knowledge is neither a neural mutation nor omniscient world state. It remains an in-world consequence that can be forgotten, concealed or transmitted incorrectly.

### 4.3 Evolution between episodes

After evaluation across several worlds, brain genomes are selected, cloned and mutated. Evolution changes heritable policy parameters only between episodes. Parentage, mutation operations, evaluation seeds and resulting metrics are immutable records.

Later phases may add gradient-based reinforcement learning, but its updates will remain separately versioned from evolutionary mutations.

## 5. Phase 1 — evolutionary decision lab

### Phase 1 outcome

Run 20 empty-handed NPCs for 30 in-game days across multiple deterministic islands. Each NPC uses a local neural policy with individual heritable variation. Preserve all brains and outcomes, evolve a new population, repeat, and make the whole process inspectable in the existing UI.

Phase 1 ends only when an unseen-seed evaluation can compare evolved brains against random, heuristic and unevolved controls. A visually interesting single run is a demo, not completion.

### 5.1 Milestone A — freeze a headless experiment contract

The current TypeScript simulation remains authoritative. Do not port the physical world to Python in Phase 1. Instead, create a headless runner around the existing engine and a Python-compatible protocol.

Deliverables:

1. Extract or wrap `MockSimulation` behind an explicit `HeadlessSimulation` interface.
2. Accept an `ExperimentConfig` containing seed, world size, harshness, population, maximum days, decision provider and engine version.
3. Run without React, Canvas, timers, animation frames or browser persistence.
4. Advance as fast as possible using fixed deterministic ticks.
5. Emit batched decision requests and batched experience records.
6. Produce a terminal `EpisodeResult`, state digest and compact replay artifacts.
7. Support cancellation, time limits and periodic progress events.
8. Verify that headless and visible runs produce identical checkpoint digests when fed identical recorded decisions.

Proposed TypeScript surface:

```ts
interface HeadlessSimulation {
  reset(config: ExperimentConfig): EpisodeHandle;
  stepUntilDecisionOrTerminal(maxTicks: number): HeadlessBoundary;
  submitDecisions(batch: BrainDecisionBatch): void;
  getExperienceBatch(): ExperienceBatch;
  createCheckpoint(): HeadlessCheckpoint;
  getResult(): EpisodeResult | null;
  dispose(): void;
}
```

Implementation location:

```text
src/sim/headless/
  HeadlessSimulation.ts
  experimentTypes.ts
  episodeMetrics.ts
  experienceEncoder.ts
  HeadlessSimulation.test.ts
```

Acceptance gates:

- no DOM or Canvas dependency under `src/sim/headless`;
- the same seed and recorded decision sequence has the same final digest in browser and headless modes;
- cancelling an episode releases pending requests and resources;
- 20 NPCs × 30 days completes within 60 seconds on the reference M3 Air, with a stretch target below 20 seconds;
- the runner reports enough detail to explain every death and terminal condition.

### 5.2 Milestone B — observation and action contracts

The neural policy will not consume prose or raw snapshots. Introduce a versioned numerical observation and candidate-feature contract.

#### Observation design

Target a fixed `float32` vector between 160 and 256 values. Every feature has a stable index, normalization rule, missing-value rule and visibility justification.

Feature groups:

| Group | Examples | Rule |
| --- | --- | --- |
| Body and needs | hunger, thirst, energy, loneliness, health, injury, illness, exposure | normalized to `[0, 1]` |
| Emotions | fear, anger, hope, stress, gratitude, resentment, confidence, safety | current personal state only |
| Personality | empathy, patience, risk, dominance, curiosity, generosity, aggression, independence | stable personal inputs |
| Values | autonomy, security, community, fairness, status, equality, wealth, exploration, family, nature | stable personal inputs |
| Inventory | food, seed, water, branches, timber, stone, fiber, clay, medicine and tool classes | capped and log/linear normalized |
| Skills/tools | relevant skill levels and normalized tool durability | no hidden recipe knowledge |
| Time/environment | time of day, season, temperature, weather, shelter/fire state | only currently perceivable conditions |
| Local resources | fixed nearest/top-salience slots with type, relative direction, distance, yield/status | known or visible resources only |
| Local people | fixed nearest slots with relative position, visible condition, trust, affection, fear, respect, debt, grievance | known/visible people only |
| Current plan | commitment family, execution state, recent failure count | personal state only |
| Short outcome history | compact previous-action family, success, need deltas and interruption reason | bounded rolling context |

Do not include global stock, undiscovered terrain, other NPC memories, future weather, engine RNG state or population-wide summary values unavailable to the citizen.

#### Variable candidate scoring

The engine currently returns up to 50 fully parameterized candidates. A flat 40-way classifier would lose target identity: two berries, two people or two construction sites may be different candidates of the same action family.

Use a candidate scorer:

```text
observation -> shared encoder -> recurrent state
candidate   -> action/target encoder
combined representation -> score for this exact candidate
all legal scores -> masked softmax -> selected candidate ID
```

The policy therefore supports a changing set of candidates without learning illegal commands.

#### Phase 1 action vocabulary

Freeze a learning vocabulary of approximately 40 action families. The initial 40 are:

1. `idle`
2. `explore`
3. `rest`
4. `eat`
5. `drink_natural_water`
6. `collect_water`
7. `drink_water`
8. `forage_wild_food`
9. `gather_fiber`
10. `gather_branches`
11. `gather_loose_stone`
12. `gather_clay`
13. `catch_fish`
14. `hunt_game`
15. `use_medicine`
16. `craft_hand_axe`
17. `craft_stone_pick`
18. `craft_primitive`
19. `fuel_campfire`
20. `cook_food`
21. `boil_water`
22. `fell_tree`
23. `quarry_stone`
24. `sow_crop`
25. `tend_crop`
26. `harvest_crop`
27. `start_construction`
28. `deliver_material`
29. `work_construction`
30. `repair_structure`
31. `move_home`
32. `request_item`
33. `share_item`
34. `steal_item`
35. `barter_item`
36. `rescue_person`
37. `offer_project_help`
38. `teach_technique`
39. `form_household`
40. `form_group`

Recipes, targets, resources, people, building types and coordinates remain candidate parameters rather than separate output classes. `warn_resource`, promises, group governance, claims, politics and formal economic actions remain observable engine features but enter the learned vocabulary only after the primitive survival/social policy is stable.

Compatibility actions such as generic `gather_food`, `work_job`, `construct` and `socialize` are excluded from the learning vocabulary when the physical wilderness world is enabled.

Deliverables:

```text
src/sim/learning/
  observationSchema.ts
  observationEncoder.ts
  candidateSchema.ts
  candidateEncoder.ts
  learningVocabulary.ts
  contracts.test.ts
services/brain/freewill_brain/contracts.py
```

Every encoded request includes:

- `schemaVersion`;
- `engineVersion`;
- `episodeId` and tick;
- citizen/brain IDs;
- observation vector and validity mask;
- exact candidate IDs, family IDs and feature vectors;
- freshness and deterministic hashes.

Acceptance gates:

- TypeScript and Python fixtures encode/decode the same vectors byte-for-byte;
- permutation of candidate order does not change per-candidate scores before sampling;
- unavailable features are masked rather than confused with genuine zero;
- no observation leaks undiscovered or global state;
- every selected candidate is still accepted by the existing engine validator or visibly rejected as stale.

### 5.3 Milestone C — local brain service

Create a separate Python service. Keep the first version intentionally small:

- Python 3.12;
- FastAPI + Uvicorn for the local HTTP boundary;
- Pydantic for strict schemas;
- NumPy for metrics and mutations;
- PyTorch for the first neural implementation, running on CPU by default;
- Safetensors for policy checkpoints;
- optional MLX backend only after contract parity exists.

For this network size, CPU is the safest M3 Air default. Metal/MPS or MLX optimization must be driven by measurements rather than assumed to be faster.

Proposed repository structure:

```text
services/brain/
  pyproject.toml
  README.md
  freewill_brain/
    api.py
    config.py
    contracts.py
    policy.py
    recurrent_state.py
    experience.py
    evolution.py
    evaluation.py
    checkpoints.py
    metrics.py
    storage.py
  tests/
    fixtures/
    test_contracts.py
    test_policy.py
    test_evolution.py
    test_determinism.py
```

The browser never talks directly to Python. The production Node server proxies `/api/brain/*`, adds timeouts and request limits, and keeps the brain service address/token server-side.

#### API v1

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | version, backend, model loaded, queue depth and resource status |
| `POST /v1/episodes` | create isolated per-episode recurrent/lifetime state |
| `POST /v1/decide-batch` | score and select candidates for multiple ready NPCs |
| `POST /v1/experience-batch` | record resulting transitions/outcomes |
| `POST /v1/episodes/{id}/checkpoint` | save recurrent state and lifetime statistics |
| `POST /v1/episodes/{id}/finish` | finalize metrics and close episode state |
| `GET /v1/brains/{id}` | metadata, lineage and checkpoint hash |
| `POST /v1/brains/{id}/clone` | exact immutable clone with new identity |
| `POST /v1/evolution/jobs` | start selection/mutation for a completed evaluation set |
| `GET /v1/jobs/{id}` | progress/result for a local training job |
| `GET /v1/metrics` | inference, episode, resource and training metrics |

`decide-batch` returns, per citizen:

- selected candidate ID;
- top candidate probabilities;
- policy entropy and confidence;
- brain/checkpoint version;
- deterministic sampling seed/counter;
- inference latency;
- no hidden chain-of-thought.

Bind the service to `127.0.0.1` by default. Enforce body limits, batch limits, schema versions and an optional local bearer token. Never load untrusted pickle checkpoints.

### 5.4 Milestone D — brain architecture

Use one shared species backbone plus individual heritable state.

#### Shared backbone

- normalized observation encoder: two small dense layers;
- candidate encoder: action-family embedding plus candidate/target features;
- recurrent memory: a 64- or 96-unit GRU;
- candidate scoring head;
- optional scalar value/viability estimate used for diagnostics in Phase 1.

Target fewer than 250,000 shared parameters.

#### Individual brain genome

Each NPC receives:

- a 32-dimensional heritable identity embedding;
- a small per-layer adapter or policy head, initially 8,000–25,000 parameters;
- exploration temperature and persistence parameters;
- individual reward-sensitivity coefficients within safe bounds;
- mutation history and parent IDs;
- policy schema/backbone version.

#### Lifetime brain state

Kept separate from the genome:

- recurrent hidden state;
- bounded action/outcome estimates;
- novelty/familiarity counters;
- recent observation/action hashes;
- references to in-world memories, not a duplicate private world model.

Saving a “brain” offers two explicit forms:

1. **Genome checkpoint** — heritable behavior, safe to place into a new NPC/world.
2. **Lifetime checkpoint** — genome plus learned state from one life, usable for exact continuation or a clearly labeled memory-transfer experiment.

This distinction prevents accidental inheritance of knowledge about a world the new NPC has never seen.

### 5.5 Milestone E — experience and fitness

#### Experience transition

After an action resolves or is interrupted, emit:

```text
observation hash
chosen candidate and probability
action start/end ticks
completion, failure or interruption reason
need/body deltas
inventory/resource deltas
relationship/emotion deltas
skill/knowledge deltas
world events caused
terminal/death flag and physical cause
```

Raw rewards are not allowed to mutate authoritative world state.

#### Do not reward civilization

There is no positive reward simply for:

- creating a group;
- constructing a building;
- accumulating money;
- adopting voting;
- cooperating;
- defeating another person;
- surviving one lucky episode.

Phase 1 uses a fitness vector, not one opaque score:

| Dimension | Meaning |
| --- | --- |
| survival | days alive and terminal cause |
| physiological stability | time outside critical hunger, thirst, exposure, illness and collapse |
| competence | repeated successful completion of self-selected actions without waste/failure loops |
| adaptability | recovery after resource loss, weather, failed plans or social rejection |
| value alignment | outcomes consistent with that NPC's own security/community/autonomy/etc. profile |
| resource efficiency | benefit achieved relative to depleted resources and wasted labor |
| novelty | behavior/outcome distance from already preserved genomes |

Social and civilizational outcomes are reported separately: households, groups, trust networks, violence, projects, crops, ownership concentration, laws and settlement count. They are measurements, not default fitness objectives.

Selection uses Pareto ranking plus novelty preservation. Keep elite genomes, mutate a majority of descendants, and add random immigrants each generation. Do not add crossover until mutation-only lineage is understood.

Initial population recipe:

- 10% exact elites;
- 70% mutated descendants sampled from the non-dominated/diverse archive;
- 20% new random immigrants;
- no genome deleted merely because it is currently weak; artifacts remain inspectable.

Mutation operators:

- Gaussian noise on embeddings/adapters;
- sparse parameter reset;
- bounded exploration-temperature change;
- bounded persistence/risk sensitivity change;
- rare larger mutation, explicitly tagged;
- deterministic mutation seed and before/after summary.

### 5.6 Milestone F — experiment runner

An experiment consists of immutable configuration plus a sequence of generations.

```text
Experiment
  Generation 0
    training islands
    control islands
    metrics + artifacts
  Selection/mutation
  Generation 1
    ...
  Held-out evaluation
```

#### Phase 1 training protocol

1. Population: 20 NPCs per island.
2. Episode: 30 in-game days or total extinction.
3. Initial training seeds: at least four islands.
4. Held-out seeds: at least two never used during selection.
5. Cohorts: shuffle co-players so one helper or bully does not define a brain's fitness.
6. Replicates: repeat stochastic policy sampling with deterministic run seeds.
7. Controls:
   - random legal candidate;
   - current deterministic Local lab heuristic;
   - unevolved neural generation zero;
   - evolved neural population;
8. Preserve all terminal worlds, including extinction.

The generation report includes median and distribution, not just the best agent. Brain promotion requires improvement on held-out seeds and no catastrophic regression in basic viability.

#### Execution profiles for an M3 Air

| Profile | Concurrent worlds | CPU threads | Rendering | Use |
| --- | ---: | ---: | --- | --- |
| Eco | 1 | 1–2 | off | laptop/battery and debugging |
| Balanced | 2 | up to 4 | off | default local evolution |
| Demo | 1 | 2 | on for selected world | live observation |

Do not launch one process per NPC. Batch decisions for all ready NPCs and keep at most two headless worlds active by default. Expose pause/cancel and concurrency controls. A thermal or memory failure must stop cleanly without corrupting completed generations.

### 5.7 Milestone G — persistence and lineage

PostgreSQL stores searchable metadata and metrics; binary weights live in a dedicated local artifact directory/volume with SHA-256 hashes and atomic writes.

Proposed tables:

| Table | Purpose |
| --- | --- |
| `brain_backbones` | shared architecture/version/checkpoint metadata |
| `brain_genomes` | immutable individual genome metadata and artifact hash |
| `brain_lineage_edges` | parent, child, mutation job and generation |
| `brain_lifetime_checkpoints` | episode-scoped recurrent/lifetime artifacts |
| `learning_experiments` | immutable experiment configuration and status |
| `learning_generations` | generation seeds, controls, selection and summary |
| `learning_episodes` | world/run identity, terminal state and digest |
| `brain_episode_results` | per-brain fitness vector and outcome metrics |
| `brain_mutations` | exact mutation operator, seed and parameter summary |
| `learning_metric_series` | bounded time/generation series for charts |

Store artifacts under a non-source directory such as:

```text
data/brains/
  backbones/<hash>.safetensors
  genomes/<hash>.safetensors
  lifetimes/<hash>.safetensors
  reports/<experiment-id>/
```

`data/brains` is excluded from Git. A portable `.freewill-brain` export contains a manifest, schema versions, hashes and the minimum required checkpoints. Imports verify hashes and never execute code.

Garbage collection is explicit. Referenced artifacts, promoted brains and completed experiment reports are never automatically removed.

### 5.8 Milestone H — observable UI

Add an **Experiments** workspace without replacing the normal world observer.

#### Experiment control panel

- population, days, seeds, generations and control cohorts;
- Eco/Balanced/Demo execution profile;
- start, pause, resume and cancel;
- current generation, episode progress and estimated remaining work;
- CPU/memory use, brain-service queue and failures;
- exact configuration and reproducibility seed.

#### NPC brain panel

- genome ID, generation, parents and checkpoint type;
- traits/values alongside heritable policy parameters;
- current recurrent/lifetime state summary;
- exact legal candidates with probabilities;
- selected candidate, entropy and confidence;
- recent outcomes and updated action estimates;
- current fitness vector without presenting it as the NPC's conscious objective.

#### Lineage explorer

- parent/child graph;
- mutation type and magnitude;
- generation and evaluation summary;
- preserve/pin/export brain;
- compare two brains on identical recorded observations;
- launch an explicit new evaluation using selected brains.

#### Population dashboard

- survival curves and cause-of-death distribution;
- critical-need time, action success, exploration and resource use;
- behavior/action-family distribution;
- cooperation, conflict and network measures;
- settlement outcomes as observations, not rewards;
- training vs held-out seed performance;
- control-cohort comparisons;
- diversity/novelty and lineage collapse warnings.

The existing decision map gains a new provider view:

```text
local observation
  -> encoded features/version
  -> legal candidate distribution
  -> selected candidate
  -> engine execution
  -> measurable consequences
  -> lifetime update / later evolutionary evaluation
```

Show probabilities and measured feature sensitivity. Never invent prose reasoning or expose a supposed hidden chain-of-thought.

### 5.9 Phase 1 release gates

#### Correctness

- Python can never select a candidate absent from the request.
- All accepted actions pass the existing engine validator.
- local-knowledge boundaries pass dedicated leakage tests.
- brain-service failure pauses/waits visibly or uses an explicitly selected control provider; it never silently changes experimental condition.
- browser and headless episode digests match with recorded decisions.
- checkpoint/resume preserves the experiment, brain lineage and lifetime state.

#### Learning evidence

- at least three generations complete across four training and two held-out seeds;
- evolved brains are compared with all four required cohorts;
- promotion is based on distributions across seeds, not the single best run;
- random labels and shuffled observations fail as expected, demonstrating that the pipeline is not leaking the answer;
- at least one ablation compares individual embeddings enabled vs disabled;
- behavioral diversity does not collapse to one identical policy without a visible warning.

#### Performance

- 20 NPC × 30 day headless episode: hard ceiling 60 seconds on the reference M3 Air;
- decision batches do not block visible rendering;
- default Balanced profile remains below a measured memory ceiling of 2 GB for the brain service plus active experiment workers;
- no more than two local worlds run concurrently by default;
- the user can pause or cancel within two seconds;
- 50 NPC × 100 day scale test completes without invariant failure before Phase 2 begins. Its runtime is recorded rather than guessed.

#### Product

- an observer can identify why a brain was preserved;
- an observer can compare the same decision across two brains;
- a saved genome can enter a new island without inheriting world-specific memories;
- a lifetime checkpoint can resume its exact episode;
- a full experiment can be exported with configuration, code/schema versions, seeds, lineages, metrics and replay pointers.

## 6. Implementation order and dependency map

```text
Headless runner
      |
      +----> deterministic episode metrics
      |
Observation/candidate contract
      |
      +----> Python Decisions API ----> baseline neural policy
                                     |
Experience contract -----------------+
                                     |
                              evolution jobs
                                     |
                     persistence + lineage tables
                                     |
                         experiment/brain UI
                                     |
                     controls + held-out evaluation
                                     |
                         50 × 100 scale gate
```

Recommended focused work sequence:

1. Headless parity and benchmark.
2. Observation/candidate schemas and cross-language golden fixtures.
3. Python service with a deterministic random scorer.
4. Node proxy and `LocalBrainDecisionProvider` integration.
5. Neural scorer with immutable generation-zero checkpoints.
6. Experience emission and episode metrics.
7. Mutation, selection and lineage artifacts.
8. Multi-seed experiment runner and controls.
9. Brain/experiment UI.
10. Held-out evaluation, ablations and Phase 1 report.
11. 50 × 100 load/invariant run.

The UI should not be built ahead of the contracts. The training algorithm should not be tuned until random and heuristic baselines run through the same experiment pipeline.

## 7. Testing strategy

### Contract tests

- shared JSON schema/golden fixtures between TypeScript and Python;
- vector lengths, normalization, masks and enum mappings;
- unknown schema/action rejection;
- candidate-order invariance;
- stale request rejection.

### Determinism tests

- identical seed + genome + sampling counter gives identical decisions;
- identical recorded decisions give identical world digest;
- mutation with the same parents/seed produces the same child hash;
- checkpoint/resume matches uninterrupted generation results.

### Simulation invariants

- resources remain conserved;
- reservations cannot double-spend a target;
- dead/incapacitated NPCs do not act illegally;
- brain failures cannot complete actions;
- no learned provider can bypass local knowledge.

### Learning-pipeline tests

- a tiny synthetic environment improves under evolution;
- shuffled reward/fitness does not show systematic improvement;
- elites remain byte-identical;
- random immigrants are genuinely independent;
- held-out seeds never appear in mutation/selection input;
- novelty archive and Pareto ranking use stable tie-breakers.

### Experiment-level tests

- 1 NPC × 7 days diagnostic;
- 4 NPC × 3 days CI smoke test;
- 20 NPC × 30 days Phase 1 acceptance;
- 50 NPC × 100 days manual/release benchmark;
- extinction, total provider failure and corrupt checkpoint recovery.

## 8. Scientific validity rules

Freewill is an experiment/game, not automatically a scientific result. Credible claims require:

- immutable experiment configurations;
- multiple seeds and stochastic replicates;
- held-out worlds;
- random, heuristic and unevolved controls;
- medians/distributions and uncertainty, not cherry-picked highlights;
- published reward/fitness definitions;
- visible exclusions and failed runs;
- engine and brain version pinning;
- separation of training and evaluation;
- ablations for memory, traits, embeddings and social observations;
- no manual promotion based only on a compelling story.

The UI may present a cinematic replay, but the report must state whether an outcome was typical, rare or selected for storytelling.

## 9. Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Reward hacking | agents exploit metrics instead of surviving plausibly | vector fitness, engine invariants, qualitative replay audit, held-out seeds |
| Luck mistaken for learning | spawn/weather/cohort determines winners | multiple seeds, shuffled cohorts, replicates and controls |
| Policy collapse | all descendants become behaviorally identical | novelty archive, random immigrants and diversity alerts |
| Non-stationary social world | a brain's fitness changes with its cohort | cohort shuffling and repeated mixed-population evaluation |
| Sparse delayed credit | farming/social plans are hard to learn | meaningful commitment boundaries, outcome traces and curriculum only after baseline |
| Observation leakage | policies use global/hidden state | versioned local encoder and explicit leakage tests |
| Catastrophic online drift | a running NPC suddenly changes personality | no online neural backprop in Phase 1; checkpointed bounded lifetime updates |
| Thermal throttling | laptop becomes unusable or results vary | Eco/Balanced caps, headless runs, two-world default, measured timing |
| Corrupt/unsafe models | lost work or arbitrary code loading | atomic Safetensors, hashes, schema validation, no pickle |
| Story bias | team rewards outcomes it finds interesting | social outcomes measured separately from default survival/competence fitness |

## 10. Roadmap after Phase 1

### Phase 2 — experimental hardening

- larger seed suites and automatic confidence intervals;
- richer ablation reports;
- curriculum worlds for diagnosing water, food, shelter and social learning independently;
- optional distributed workers on another machine without changing the engine contract;
- branchable historical experiments;
- public, portable experiment bundles.

Exit condition: repeated results survive held-out evaluation and can be reproduced from one bundle on another compatible machine.

### Phase 3 — reinforcement learning

- train the shared backbone using stored transitions;
- begin with offline imitation/distillation of the deterministic heuristic as a disclosed baseline;
- add recurrent PPO or another masked discrete-action learner only after the evolution pipeline is stable;
- compare centralized training/decentralized execution with independent adapters;
- retain evolutionary selection for diversity and hyperparameters;
- keep inference checkpoints frozen during evaluation episodes.

Exit condition: RL improves held-out competence over evolution-only controls without reducing behavioral diversity below the declared threshold.

### Phase 4 — optional local language-model layer

Run a quantized sub-billion-parameter model locally through `llama.cpp` or MLX for infrequent reflective tasks:

- summarize salient memories;
- propose multi-step commitments from legal capabilities;
- name groups, discoveries and norms;
- generate observer-facing narration grounded in recorded facts;
- optionally act as a teacher whose suggestions the small policy may accept or reject.

The LLM does not control movement, raw execution or unrestricted actions. Its calls are sparse, cached and separately measured. Evolution/RL experiments can disable it completely.

Exit condition: an ablation demonstrates what the LLM changes, its compute cost, and whether it improves held-out outcomes rather than merely producing better prose.

### Phase 5 — long-horizon ecology and society

- 50–100 NPC, 100+ day standard experiments;
- multiple settlements and migration;
- individual animal agents where justified;
- reproduction, childhood, aging and genuine generational inheritance;
- brain inheritance vs cultural inheritance experiments;
- institution, norm and technology diffusion;
- ecological shocks and long-term sustainability.

Exit condition: first-generation survival remains stable and all generational mechanisms conserve physical and social state.

### Phase 6 — publishable experiment/game package

- one-command local experiment runner;
- curated but non-cherry-picked scenario suites;
- automatic methods/results report;
- shareable brain and replay bundles;
- reproducibility badges and version manifests;
- observer-friendly 100-day documentary export.

## 11. Decisions made now

1. Keep the TypeScript Freewill engine authoritative.
2. Add Python as a local brain/training service, not as a second world simulation.
3. Rank existing fully parameterized legal candidates instead of generating commands.
4. Use a compact numerical observation, not prose or screenshots.
5. Use a shared backbone plus individual embeddings/adapters and recurrent lifetime state.
6. Start with mutation/selection between episodes and no neural backprop inside a life.
7. Evaluate across multiple training and held-out seeds.
8. Preserve random, heuristic and unevolved neural controls.
9. Do not reward civilization, cooperation, markets or government by default.
10. Save genome and lifetime checkpoints as distinct artifacts.
11. Run locally in bounded Eco/Balanced profiles; no process per NPC.
12. Defer PPO and local LLM integration until the evolutionary baseline is measurable.

## 12. Open design decisions to resolve during implementation

These questions must be answered with measurements or a small experiment, not preference alone:

- exact observation vector length and nearest-resource/person slot counts;
- whether the recurrent unit is 64 or 96 wide;
- per-brain adapter size;
- sampling vs greedy policy during evaluation;
- minimum seeds/replicates that fit a practical local generation time;
- Pareto and novelty weighting/tie-breaking;
- fitness treatment of personality/value alignment;
- whether Phase 1 needs a hand-authored curriculum before full islands;
- CPU PyTorch vs optional MLX backend after benchmarks;
- exact artifact retention policy for long experiments.

Any chosen value is recorded in the experiment configuration and included in exports.

## 13. Definition of the first compelling experiment

The first public-quality run is:

> Place 20 genetically distinct local neural brains into several unseen Freewill islands with empty inventories, no common objective and identical physical rules. Let them live for 30 days, preserve every outcome, evolve multiple generations using disclosed survival/competence/diversity criteria, then place the selected and control brains into new islands. Show what changed, what did not, and whether the result generalizes.

Only after that succeeds do we make the headline experiment:

> Fifty locally evolving AI NPCs lived on an island for 100 days with no civilization objective. Here is what emerged, how their brains changed, and how often the result repeated.

