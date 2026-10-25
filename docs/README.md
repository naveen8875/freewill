# Freewill documentation

This directory is the source of truth for the current public implementation. Historical planning documents are clearly separated from active guides.

## Start here

| Goal | Read this |
| --- | --- |
| Run the complete stack | [Docker setup](getting-started/docker.md) |
| Work on the code | [Local development](getting-started/local-development.md) |
| Understand the project | [How Freewill works](concepts/how-freewill-works.md) |
| Understand the architecture | [Architecture overview](architecture/overview.md) |
| Train local brains | [Running an experiment](experiments/running-an-experiment.md) |
| Inspect a run | [Evolution observatory](experiments/evolution-observatory.md) |
| Connect another decision system | [Build a provider](providers/building-a-provider.md) |
| Deploy or back up data | [Operations](operations/README.md) |
| Look up exact contracts | [Technical reference](reference/README.md) |

## Documentation map

- **[Getting started](getting-started/README.md):** installation, configuration, development, and troubleshooting.
- **[Concepts](concepts/README.md):** brains, decisions, the engine boundary, evolution, and scientific integrity.
- **[Architecture](architecture/README.md):** code ownership, runtime flow, persistence, replay, and services.
- **[World systems](world/README.md):** survival, resources, construction, settlement, society, economy, and politics.
- **[Experiments](experiments/README.md):** training, metrics, validation, observatory, and reproducibility.
- **[Decision policies](providers/README.md):** Local lab, evolving neural brains, and the constrained policy boundary.
- **[Features](features/README.md):** Creator Studio and user-facing tools outside the core simulation.
- **[Operations](operations/README.md):** Docker, deployment, security, backups, and performance.
- **[Reference](reference/README.md):** environment variables, APIs, data models, actions, and versioning.
- **[Project](project/README.md):** implementation status, roadmap, contribution rules, and release policy.
- **[History](history/README.md):** superseded plans retained for context, never as current instructions.

## Documentation rules

1. Guides describe the current behavior, not the intended future behavior.
2. Exact fields, endpoints, and action names belong in `reference/`.
3. Design reasoning and invariants belong in `concepts/` or `architecture/`.
4. Superseded plans move to `history/` and receive a historical notice.
5. Changes to a public contract update its documentation in the same pull request.

