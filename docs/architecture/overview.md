# Architecture overview

Freewill has four hard boundaries:

1. **Authoritative simulation:** deterministic TypeScript world state and rules.
2. **Decision providers:** constrained adapters that select legal candidate IDs.
3. **Renderer and React UI:** presentation, interpolation, inspection, and commands.
4. **Persistence and services:** versioned saves, experiments, replay, external gateways, and the Python brain service.

```text
Browser
├── React UI and Zustand UI state
├── Canvas renderer adapter
├── deterministic simulation
├── provider clients
└── IndexedDB fallback
          │ same-origin APIs
          ▼
Node production server
├── world and experiment APIs
├── Local brain gateway
├── local-brain gateway
└── PostgreSQL migrations and repositories
          │
          ├── PostgreSQL
          └── Python/PyTorch brain service
```

## Ownership

| Path | Owns |
| --- | --- |
| `src/sim/` | World state, actions, decisions, routes, needs, society, consequences |
| `src/renderer/` | Canvas integration and visual interpolation |
| `src/state/` | UI selection, modes, tools, and commands |
| `src/persistence/` | World-document validation, browser storage, import/export |
| `src/features/experiments/` | Experiment controls and comparisons |
| `src/features/observatory/` | Read-only live and historical brain inspection |
| `server/` | Production APIs, migrations, gateways, telemetry |
| `services/brain/` | Neural policy, checkpoints, evolution, brain API |
| `public/little-worlds/` | Runtime procedural art and Canvas2D world implementation |

The renderer receives snapshots. It does not advance needs or complete work. React does not own authoritative citizens or resources. Providers do not mutate world state.

