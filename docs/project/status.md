# freewill — Implementation Status

Updated 2026-10-25. The first complete wilderness-to-society slice is implemented. A generated experiment now begins paused with empty-handed, unassigned people, no common goal, no government, no currency and no public property. Seeded terrain, local knowledge, bodily survival, primitive work, conserved construction, renewable food, human traits, social memory, optional institutions, constrained AI decisions, replay and PostgreSQL persistence form one traceable loop. The retained settlement/economy systems are outcomes that can become available later; they are no longer the premise of a generated world.

## Working now

| Area | Implemented behavior | Verification |
| --- | --- | --- |
| Rendering | Finite generated wildernesses plus retained authored presets, procedural Canvas2D art, animated routed movement/work, weather/seasons, pan/zoom, selection/follow; renderer only interpolates authoritative citizen positions | Renderer authority unit test, production browser smoke and cross-browser flows |
| Simulation authority | Fixed integer positions/facing, deterministic A*, routes, timed actions, exact-once completion, typed resource/location reservations, expiry/cancellation, events and revisions | Headless spatial/action/reservation/edit fixtures |
| Physical world | Deterministic elevation/moisture/fertility/hazard biomes and viable-but-empty spawn; exact wild food/tree/fiber/rock/crop targets; direct drinking, fishing/hunting populations, fire/fuel/cooking, seed conservation, sow/tend/rain/growth/harvest, spoilage, shelter/exposure, illness/injury/collapse/death, wells, roads, repair and demolition | Generator invariants, seven-day wilderness fixtures, crop/fire/rescue tests, 12-person 30-day acceptance, double-claim guard and real browser canvas flow |
| Settlement production | Primitive tools and exact material/labor projects lead into universal input/facility/skill recipes. Repeated behavior develops skill and can become an occupation; bakery, smithy, lumber mill and workshop chains remain locked until their real inputs and facilities exist | Exact recipe accounting, missing-input/workplace rejection, seed/water conservation, persistent enterprise repetition, no-builder recovery and sustained 100-person invariant fixture |
| Decision boundary | Compact local perception with body state, continuous personality/values/emotions, memories, relationships, personally known world and current commitment; opaque stable legal candidate IDs; event-driven local brain calls; deterministic engine execution and strict revalidation | Brain contract suites, hostile/delayed-policy fixtures, commitment execution tests and 30-day chaos fixture |
| Persistence/replay | Save schema v6 with complete wilderness, human, social, economic and political state; PostgreSQL stores compact current worlds plus separate bounded decision/event/checkpoint tables; IndexedDB backup, stable checkpoint hashes, v1–v5 migration, corruption diagnostics and provider-free replay | Legacy migration, live PostgreSQL history-table round-trip, physical/social round-trips, midpoint, 10/30-day, edit-during-run and corrupt-checkpoint tests |
| Replay UX | Read-only historical scrubber, visible history banner, return-to-present, replay error recovery, linked decisions/events | Chrome, Firefox and WebKit flow |
| Observability | Generic provider identity/signals, request/fallback reason, freshness revisions/hashes, candidates, action instance/status and consequences; heuristic contributions are labeled honestly | Browser decision flow and envelope tests |
| Editor | Brush/fill/place/spawn/erase plus typed move/rotate/delete/layer/settlement commands, serialized forward/inverse patches, locking, visibility, undo/redo and topology invalidation | Pure command tests and real canvas undo/redo flow |
| World creation | Seed, 64–160 tile finite world, 3–100 distinct people, environmental harshness and local-brain/Local lab mind. Generated people always begin with empty inventories, no jobs, no structures, no formal group and no common objective; the clock waits for **Start** | Generator determinism/spawn tests, creation tests and production browser smoke |
| Social emergence | Requests, sharing, theft, barter, rescue, teaching, warnings/concealment, claims/challenges, promises/debt, forgiveness/retaliation, households, voluntary groups, shared stock and group decision-system adoption. No public institution or universal ballot exists at spawn | Relationship/memory/knowledge fixtures, resource-conserving rescue tests, group/promise/claim tests and politics lifecycle tests |
| Optional institutions | Groups may remain informal or adopt consensus, majority, leader or council systems. Formal public projects, laws, currency, businesses, factions and rebellion only become possible after their prerequisites emerge | Direct module fixtures, tie/duplicate guards, exact road authorization, 50-person policy scenario, rebellion lifecycle and persistence invariants |
| Game UI | Full-screen world, field-notebook wilderness ribbon, paused start gate, survival/resource dashboard, collapses/deaths, groups/institutions, provider calls/cost, detailed human dossier, personally discovered map and causal decision map | Production visual QA with zero console warnings/errors plus browser product flows |
| Deployment | Multi-stage non-root app image, PostgreSQL 17, automatic migrations, Adminer dashboard, persistent volume, health/readiness probes, security headers and graceful shutdown | Real Compose build/boot, app restart, PostgreSQL save/load and Adminer smoke test |
| Recovery/safety | UI error boundary, renderer recovery panel, persistence errors, invariant pause, transactional import validation, finite/non-negative resource and coordinate guards | Fuzz/boundary tests |
| Performance/release | Retained 50/200/500/1,000 benchmarks, 30-day soak, cross-browser CI, changelog/golden review policy and explicit repository license | [Performance report](../operations/performance.md) and CI workflow |

### Evolution integrity baseline

The current headless environment is `freewill-sim-v7-integrity`. Walkable components are labeled with the same diagonal/corner rules as authoritative A*, so a provider never receives a destination as legal merely because it is geographically close across disconnected terrain. Social relief is caused by completed face-to-face behavior rather than household/group labels. Held-out reports include unreachable-action rate, collapse burden, rescue count, renewable food/spoilage balance and fueled/unfueled campfires; an experiment cannot claim improvement while its accepted unreachable-action rate is at or above 1%.

## Verification commands

```text
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm benchmark
pnpm benchmark:browser
```

The release gate runs typecheck, unit/integration tests, production build, and the complete Chrome/Firefox/WebKit browser suite. Benchmark fixtures are retained but run separately so ordinary CI remains predictable.

## Remaining public-SaaS work

- The included Docker stack is complete for a single operator. Public multi-user hosting still needs account/world authentication, ownership checks, TLS/reverse proxying and per-user/IP rate limiting.
- No worker runtime is present: measured 50/200-citizen budgets pass inline, so a worker would add unproven synchronization complexity.
- Historical mode is read-only; branching or editing from a past tick is not supported.
- Bespoke legacy chapter choreography may restart when a document is loaded; authoritative citizen state and replay do not depend on it.
- Creator Studio remains real-time recording; offline replay rendering and trimming are future product work, not connector prerequisites.
- The initial recipe catalog intentionally proves the substrate rather than content breadth. More crops, tools, services and building definitions can now be added as data without introducing magical occupation outputs. See [Settlement systems](../world/settlement-systems.md).

## Decision-system status

`src/sim/LocalBrainDecisionProvider.ts` is the browser-safe client for the local Python brain service; `server/brainGateway.ts` owns the service boundary. Legal options are created by the simulation, reduced to opaque candidate IDs, validated on return, rebuilt against current state, and validated again before consequences. Brain-service failures leave the villager waiting for a later request; they never silently invoke the Local lab policy. Experiments, genomes, lineages, and replay checkpoints are stored in PostgreSQL.
