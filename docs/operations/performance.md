# Freewill performance report

Measured 2026-10-25 on an Apple M3 MacBook Air (8 GB RAM), Darwin 25.4.0, Node 22, and Vitest 5/Node. Run `pnpm benchmark` and `pnpm benchmark:browser` to repeat the retained fixtures. These numbers include the wilderness, human-state, local-knowledge, social and living-physical-world additions.

## Headless simulation matrix

Each row covers 30 authoritative ticks, including provider selection, pathfinding, action advancement, checkpoint work, and snapshot serialization. Times are milliseconds.

| Citizens | p50 | p95 | p99 | Save size | Restore |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 2.80 | 3.77 | 8.75 | 332 KB | 1.75 |
| 200 | 7.01 | 13.12 | 20.33 | 903 KB | 4.47 |
| 500 | 22.07 | 22.81 | 22.85 | 2.13 MB | 12.41 |
| 1,000 | 64.97 | 77.29 | 100.57 | 4.40 MB | 21.64 |

The accepted interactive budgets pass: 50-citizen p95 is below 8 ms and 200-citizen p95 is below 16 ms. The 1,000-citizen case remains a headless/LOD research target, as intended. A worker is therefore not justified by the accepted 50/200 targets; adding one now would increase synchronization risk without fixing a measured budget failure.

### Active market fixture

The retained market fixture begins from a constitutionally recorded adopted charter with 50 citizens, 10 funded businesses, five escrowed offers, and five escrowed job contracts. Across 360 ticks it exercised business activity, four completed trades, contract activity, and 64 total economic transactions.

| Citizens | Ticks | p50 | p95 | p99 | Save size |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 360 | 11.59 | 24.69 | 28.62 | 3.74 MB |

The developed-market fixture is now explicitly a compatibility stress case with a 30 ms p95 budget. It carries ten businesses, offers, contracts, a complete adopted ballot, production state and 360 ticks of inspectable history in addition to the new human and physical-world state. Rendering runs independently from simulation cadence. The primary 50–200 wilderness budgets remain 8/16 ms.

The physical-world addition initially exposed an avoidable regression: worlds without physical objects still scanned the entire map for six classes of build site twice per accepted decision. The runtime now short-circuits that scan when `physicalWorld.enabled` is false, restoring the 50-citizen active-market p95 to 12.02 ms while leaving physical worlds on the validated exact-site path.

## Browser and soak

- Chrome, 50 citizens, two-second viewer sample: 59.91 fps.
- Long-task entries during the sample: 4. This includes world creation and initial asset/render settling; it is retained as a regression baseline rather than presented as zero-jank.
- Active-backend save acknowledgement for the 50-citizen world: 297 ms (PostgreSQL in this run; the fixture also accepts IndexedDB).
- 30-day/360-tick headless soak: 360 bounded decisions, 358 events, and four live checkpoints.
- Checkpoints are captured every 60 ticks, retaining the origin plus the three most recent snapshots. Arbitrary historical ticks still reconstruct from the origin or preceding checkpoint and recorded decisions, while PostgreSQL stores checkpoint history separately from the compact current world.
- The unforced-GC process heap delta is retained only as diagnostic output and may be negative when V8 collects during the sample. It is not a retained-heap measurement. The implemented mitigation is structural: checkpoints cap at 64, requests at 500, decisions at 1,000, events/trends at 5,000, and configured relationships remain sparse (maximum eight generated neighbors per citizen). A future browser heap profiler run should replace this coarse process metric before claiming a hard retained-heap percentage.

### Live playback pass

The October 25 live-runtime pass separates logical simulation speed from visual animation speed. Visual review showed that batching three movement ticks at 10× met the compute budget but produced visible position jumps. Live playback therefore tops out at a truthful 5× mode: one authoritative tick every 340 ms, one defensive snapshot, one renderer reconciliation, and one React publication. Canvas animation is capped at 3×, while adaptive route playback finishes each authoritative path segment before the next state arrives. Brain experience submission remains asynchronous and does not hold the visible frame.

The renderer consumes the route already planned by the authoritative simulation and never starts a second A* search on the UI thread. If an action completes before publication, a bounded visual stepping line provides continuous motion. Headless evolution, soak tests, and non-visual replay remain free to run faster because they do not promise animated playback.

Physical-world reconciliation now indexes objects by UID once and skips the full resource/building/road scan when `worldRevision` has not changed. Movement and need updates still render every published cycle, crops still refresh, and a complete safety reconciliation runs every 120 ticks. The in-world **Engine pulse** control exposes the live breakdown without opening a developer tool.

Build-site discovery is also cached by physical-layout revision. When the layout does change, each building type scans the map once and retains only its twelve best legal sites instead of allocating and sorting every legal tile. In the rebuilt Docker app, a 12-villager Local lab run sustained 5× playback through day 9 with observed pulses between 43 and 224 ms, below the 340 ms visual cadence, and no browser warnings or errors.

## Decision

Inline simulation is accepted for the 50–100 person target. Reconsider a worker only if the same retained wilderness fixtures regress beyond 8 ms p95 at 50 citizens or 16 ms p95 at 200 citizens on the reference machine. The 500/1,000 rows remain scale-research baselines rather than the current interactive promise.

## Responsive-brain pass

The October 25 cognition pass changed the authoritative clock from twelve two-hour steps to forty-eight 30-minute steps per day. Metabolism, exposure, weather, crop growth, regeneration, decay and other physical rates were divided or rescheduled so their per-day behavior did not become four times faster. Action work remains durative and citizens retain commitments across review boundaries; only event-level safety failures cancel work immediately.

Local decision requests now fill the configured in-flight window before awaiting resolution, so a ready 20- or 50-person cohort reaches the Python service as an actual batch rather than one citizen per world tick. The headless runner also stopped cloning the complete growing snapshot after every internal step. On the retained machine, the focused suite containing the full 12-person, 30-day/1,440-tick wilderness acceptance run, three headless fixtures and twenty engine fixtures completed in 10.30 seconds. The acceptance world finished with 11 survivors and independently completed shelter, fire, cultivation, harvesting, tools, trade and rescue behavior.
