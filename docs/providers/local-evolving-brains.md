# Local evolving brains — Phase 1 implementation

Status: engineering baseline implemented  
Schema: `freewill-learning-v1`  
Environment: `freewill-sim-v7-integrity`  
Date: 2026-10-25

## Delivered slice

Phase 1 is an end-to-end local evolutionary baseline. The existing TypeScript simulation is still authoritative. A CPU-only Python service sees a compact citizen-local observation plus the exact legal candidates supplied by the engine, then returns one candidate ID. It cannot control movement ticks, create coordinates or resources, or mutate the world directly.

- Headless execution uses the same `MockSimulation` engine as the rendered game.
- The learning vocabulary is frozen at 40 high-level action families.
- Observations are 192 floats plus a 192-element availability mask; candidates are 64 floats each.
- Resource and person slots include only information known by that citizen.
- One frozen shared Torch backbone serves every NPC. Each brain has a 32D identity, small adapters, family biases, exploration temperature, persistence and reward sensitivity.
- GRU state and bounded action/outcome values are lifetime state. Completed transitions are sent during the episode, so later choices can use earlier outcomes.
- Genome mutation happens only between episodes. Selection preserves 10% elites, creates 70% mutated descendants and introduces 20% unrelated immigrants.
- Every genome is an immutable, SHA-256-addressed Safetensors artifact. Lifetime checkpoints use the same safe format and are kept separate from heritable state.
- Experiments use multiple training seeds, stochastic replicates and disjoint held-out seeds. Evaluation includes random, deterministic heuristic, unevolved-neural and evolved-neural cohorts.
- The environment rejects candidates outside the citizen's connected walkable region before a brain sees them. Accepted unreachable-action rate is a held-out integrity gate, not a fitness opportunity.
- Completed face-to-face cooperation relieves loneliness and produces a learnable lifetime signal. Repeated collapse lowers physical-stability fitness; death carries a substantially larger lifetime penalty than ordinary cancellation.
- Episode reports expose collapses per 100 person-days, rescues, critical-need interruptions, unreachable actions, renewable food produced, spoilage, campfire count and unfueled-campfire fraction. These diagnose behavior without scripting a preferred civilization.
- PostgreSQL stores experiment configuration, progress, generations, episodes, per-brain fitness, mutations, lineage edges and lifetime checkpoint references.
- The in-game Evolution laboratory starts/cancels runs and exposes progress, multidimensional fitness, behavioral diversity, held-out controls, lineage, mutation magnitude and artifact hashes.
- Completed experiments export a `.freewill-brain.json` manifest with configuration, versions, seeds, metrics and lineage pointers.

## Local development

Install the Python service once (Python 3.11–3.13 recommended):

```bash
cd services/brain
python3 -m venv .venv
.venv/bin/pip install -e '.[test]'
FREEWILL_BRAIN_TOKEN=local-dev .venv/bin/python -m freewill_brain.api
```

In another terminal:

```bash
FREEWILL_BRAIN_TOKEN=local-dev BRAIN_SERVICE_URL=http://127.0.0.1:8008 pnpm dev
```

Open Freewill, choose **Experiments**, keep the default 20 people / 30 days, and start a local experiment. A newly created ordinary world remains paused until the observer presses Start.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

The app is at `http://localhost:5173`, the brain API is loopback-only at `http://127.0.0.1:8008/v1/health`, and Adminer is at `http://localhost:8080`. PostgreSQL uses host port `55432` by default to avoid the common local `5432` collision. Brain artifacts persist in `freewill_brains`; database state persists in `freewill_postgres`.

## Verification commands

```bash
pnpm typecheck
pnpm test
pnpm build
cd services/brain && python -m pytest -q
FREEWILL_BRAIN_INTEGRATION_URL=http://127.0.0.1:8008 pnpm benchmark:phase1
```

The integration URL can point at port `8018` (or another loopback port) during development. Add `FREEWILL_BRAIN_INTEGRATION_TOKEN` when the service has a token.

## Measured acceptance run

Reference machine: the current Apple Silicon development machine, CPU backend, two Torch threads. These are measured results, not estimates.

| Gate | Result | Simulated ticks | Decisions | Outcome |
| --- | ---: | ---: | ---: | --- |
| 20 NPC × max 30 days | 43.30 s | 322 | 304 | valid extinction on day 27 |
| 50 NPC × max 100 days | 87.53 s | 427 | 318 | valid extinction on day 36 |

Both gates completed without illegal actions, corrupt state, provider failure or non-finite fitness. The first remained under the 60-second Phase 1 ceiling. The second is an invariant/scale gate, so early extinction is accepted and recorded rather than disguised as a successful society.

The production brain image is approximately 215 MB. A container smoke test used about 155 MiB resident memory; the service reported a 247 MB peak after complete experiment cycles. Finished runs returned to zero active episode states.

## Intentional limits before Phase 2

- No PPO or neural backpropagation is enabled.
- No local LLM is in the action loop.
- No claim of learned intelligence is made from the baseline runs.
- Exact mid-tick world resume is still owned by the existing world snapshot/replay system; the brain service checkpoints recurrent/lifetime state independently.
- The UI exports artifact hashes and experiment metadata, not copies of every binary Safetensors file.
- Balanced experiments evaluate two independent islands concurrently. Eco and Demo remain single-island modes for minimum heat and predictable observation. Episode results retain their configured seed/replicate order, and cancellation stops every active island.

Phase 2 should begin only after repeated three-generation runs show a useful signal against all controls and after shuffled-observation/reward and identity-embedding ablations are recorded.

## Scientific integrity gate

A generation cannot be labeled improved when accepted unreachable actions are at or above 1% on its held-out episodes. Campfire duplication, collapse, food waste and social fragmentation remain legal outcomes for evolution to discover; the engine only guarantees that observations, choices, routes and consequences are physically truthful. Compare generations only when they share the same environment version.
