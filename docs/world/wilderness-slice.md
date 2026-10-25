# Freewill wilderness-to-society slice

Freewill begins with a question, not a civilization objective: if distinct people wake in a finite untouched world with empty hands, what kind of life will they make, and will they decide that cooperation is worth it?

## Experiment setup

The observer chooses only the world seed, finite map size, environmental harshness, population, decision provider, and speed. A generated world starts paused. Its people have no inventory, assigned occupation, building, currency, government, shared stock, ownership regime, or common goal.

The default acceptance experiment uses 12 distinct people for 30 in-game days. Scale validation then covers 50 and 100 people.

## Authority boundary

```text
local observation + body + traits + memories + relationships
                              |
                              v
                 model chooses meaningful intent
                              |
                              v
          legality, reservation, route, and work executor
                              |
                              v
       conserved resources + health + trust + changed terrain
                              |
                              v
             memory, skill, reputation, reconsideration
```

Local evolving brains and the deterministic lab policy use the same candidate contract. A policy receives only locally available, fully parameterized choices. It cannot create an arbitrary action, resource, building, vote, or outcome. The engine revalidates a choice before starting it and again when the routed action completes.

A model turn happens at a meaningful boundary: a commitment completes or fails, a need becomes critical, a discovery matters, another person makes an offer, or the surrounding world changes. Movement, pathfinding, animation, repeated labor, crop growth, weather, spoilage, and reservations remain deterministic engine work.

## Generated world

Generation is deterministic for a seed and bounded to a finite map. Elevation, moisture, fertility, hazard, coastline, forest, wetland, grassland, and highland determine walkability and natural resources. Spawn is a clear patch near water and a sparse opportunity ring of wild food, trees, stone, and fiber. Those nodes remain finite physical resources: nobody receives free inventory and survival is not guaranteed.

Each person knows only explored tiles, nearby resources, and people they have met. Exploration expands that map. Resource knowledge can be taught, warned about, concealed, or exchanged when people voluntarily join a project.

## Survival and production ladder

1. Drink from nature, forage, hand-fish, gather branches, stone, fiber, reeds, herbs, and clay.
2. Craft primitive axes, picks, sharp stones, fishing tools, spears, fire starters, baskets, clothing, medicine, and fired water containers.
3. Build exact campfires, sleeping shelters, storage, drying racks, gardens, huts, wells, paths, and workshops from delivered material and labor.
4. Fuel finite fires, cook perishable food, boil water, rest safely, repair structures, and demolish unsafe ones.
5. Convert wild seed into a first planted garden. Crops track stage, health, moisture, tending, deterministic rain, ripening, harvest, edible produce, and durable seed for the next cycle.
6. Let practiced work create skill and eventually an occupation. Facilities, inputs, permission, customers, and labor—not a job label—make later businesses possible.

Food has dated lots and spoils. Fish and game draw from regenerating populations. Trees, reeds, bushes, water, and crops use explicit depletion or regeneration. Construction uses exact sites, project stores, labor, ownership, and refundable escrow.

## Human model

Every person has continuous personality values, physical capabilities, values, emotional state, needs, skills, local knowledge, salient decaying memories, and multidimensional relationships. Traits influence choices but never hard-code an archetype.

Collapse, rescue, illness, exposure, injury, starvation, dehydration, and death have persistent consequences. Rescue requires a reachable person and meaningful aid; it can transfer real food or water and creates gratitude, trust, debt, and memory. Death is permanent, releases claims and group roles, and creates grief memories for witnesses.

## Social emergence

People can request, share, steal, barter, promise, repay, teach, warn, conceal, volunteer for a project, invite help, create households and persistent groups, establish or challenge resource claims, contribute to shared stores, forgive, retaliate, leave, or exclude.

There is no public ownership or universal ballot at spawn. A group can grow from trust and adopt informal, leader, consensus, majority, or council decision-making. Formal public projects and laws require an institution and an exact mandate. Currency, contracts, businesses, factions, and rebellion remain possible later outcomes, not initial conditions.

## Observer experience

The game exposes population, deaths, collapse, food and water security, shelter, health, mood, renewables, active projects, crop stages, groups, households, claims, promises, occupations, institutions, provider health, model calls, failures, and cost.

An individual dossier exposes body state, needs, traits, values, emotions, inventory, skill, local knowledge, memories, relationships, commitment, and current execution. The decision view traces:

```text
need/observation -> legal alternatives -> chosen commitment/action
                 -> validation -> route/work -> consequence -> memory
```

## Persistence and replay

The browser keeps an IndexedDB backup. The Docker stack stores the current compact world in PostgreSQL and separates bounded decision records, immutable events, and replay checkpoints into dedicated history tables. Saves rehydrate those streams on load. The same simulation can be replayed without consulting an AI provider.

## Release gates

- A lone person can attempt seven days and every success or death has a physical cause.
- Different personalities in the same seed produce different choices.
- Twelve empty-handed people can create a fire, shelter, renewable crop cycle, and traceable social behavior without free resources.
- Cooperation follows relationships and circumstances, not an assigned settlement goal.
- Politics and an economy appear only after people create the necessary group, rules, property, facilities, and exchange complexity.
- Fifty and 100 people remain within invariants under staggered decision turns.
- Save/load and provider-free replay preserve authoritative state and causal history.

Failure is a valid experimental result. A fragmented camp, hoarded food, abandoned project, rejected leader, or complete die-off is not replaced by a scripted success path.
