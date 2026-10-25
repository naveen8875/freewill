# Contributing to Freewill

Thanks for taking an interest in the little people.

Freewill is an experimental simulation, so correctness and explainability matter more than adding a large number of mechanics quickly. A change should preserve the boundary between what a brain decides and what the world actually allows.

## Set up the project

For the complete stack:

```bash
cp .env.example .env
docker compose up -d --build
```

For TypeScript development without PostgreSQL:

```bash
corepack enable
pnpm install
pnpm dev
```

The app falls back to IndexedDB when `DATABASE_URL` is absent. See the [development guide](docs/getting-started/local-development.md) for Python-service and database workflows.

## Before opening a pull request

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e --project=chrome
```

Run the complete cross-browser suite for UI, persistence, replay, or renderer changes. Run the relevant benchmark when changing cadence, pathfinding, candidate generation, headless execution, or rendering.

## Project rules

- The TypeScript simulation is authoritative. Providers and renderers never write world state directly.
- A brain chooses only among legal, fully parameterized candidates.
- World mutations must conserve resources and produce traceable events.
- Simulation logic must not use `Math.random()` or wall-clock time.
- Replays must not call a decision provider or mutate the live world.
- Provider failures stay visible; do not add hidden fallbacks.
- Persisted-schema changes require validation, migration coverage, and round-trip tests.
- New reward terms require documentation and held-out evaluation. Do not reward a specific desired civilization outcome.
- Keep keys server-side and never introduce a `VITE_` API-key variable.

## Good first contributions

- Improve documentation and diagrams.
- Add deterministic world-generation fixtures.
- Add observatory filters or clearer experiment comparisons.
- Add data-driven resources, recipes, or structures using existing conservation rules.
- Add invariant and regression tests for surprising runs.

Open an issue before undertaking a large simulation-contract, save-schema, or renderer rewrite.

## Reporting experiment results

Include the environment version, seed set, generation count, population, episode length, brain-service version, configuration, and both training and held-out metrics. A surprising single run is useful evidence, but it is not by itself proof that a brain improved.

## Pull requests

Keep pull requests focused. Explain what changed, why it belongs, which contracts are affected, how it was verified, and whether old saves, replays, or brains remain compatible.

By contributing, you agree that your contribution is licensed under the repository's MIT License.

