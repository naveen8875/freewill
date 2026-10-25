# Simulation engine

`MockSimulation` is the historical class name for the authoritative deterministic implementation. It owns the world clock, citizens, actions, routes, resources, structures, relationships, events, and checkpoints.

## Determinism

- Integer ticks define authoritative time.
- Seeded PRNG streams replace simulation `Math.random()` calls.
- Stable IDs and tie-breakers make action ordering reproducible.
- World topology revisions invalidate affected route caches and commitments.
- Snapshot digests detect replay divergence.

## Candidate and action lifecycle

```text
observe → generate candidates → spatial/legal filter → provider choice
        → current-state revalidation → reserve → route → work
        → complete/cancel → consequence events → memory
```

Candidate legality is not permission to skip execution. A legal building project still needs reachable materials, a valid site, labor, and time. Resources are reserved to prevent double spending and released on cancellation or expiry.

Walkable components use the same diagonal and corner-cut rules as A*. Unreachable targets are not presented as legal merely because they are geographically close.

See [Physical world](../world/physical-world.md), [Settlement systems](../world/settlement-systems.md), and the [action catalog](../reference/action-catalog.md).

