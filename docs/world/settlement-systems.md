# Freewill settlement systems

Updated 2026-10-24. This is the broad simulation substrate used by every economic specialization. A bakery is one recipe on this substrate, not a special-case game loop.

## Authority split

The decision provider is each villager's planning brain. It chooses objectives such as committing to an enterprise, changing occupation, acquiring inputs, leasing a facility, operating a recipe, supplying a project or selling output. The deterministic engine handles pathfinding, animation, reservations, elapsed work, conservation, decay and exact consequences.

```text
AI chooses a legal objective
  → engine reserves target + inventory + money
  → engine routes and animates the villager
  → completion boundary revalidates the world
  → exact resources, money, skill, wear and history change once
  → blockers and new evidence enter the next perception
```

No provider can invent an item, building, price, route, target or action parameter. It can only select a candidate generated from the current world.

## Universal production model

All transformed goods use a `ProductionRecipe`:

```text
inputs + operational facility + authorized inventory + minimum skill + labor time
  → outputs + dated food lots (when edible) + skill experience + facility wear
```

Current recipes prove four different chains:

| Process | Facility | Inputs | Outputs |
| --- | --- | --- | --- |
| Bake bread | Bakery | 2 wheat, 1 water, 1 wood | 4 bread |
| Forge tools | Smithy | 2 ore, 1 wood | 1 tools |
| Saw planks | Lumber mill | 2 wood | 3 planks |
| Craft furniture | Workshop | 2 planks | 1 furniture |

Adding a new workshop or product is a definition change. It does not require a new magical `work_job` effect. In physical worlds, generic baker and smith work cannot create goods; they must run an authorized recipe.

## Resource truth

- Trees and mineral deposits are exact world objects. Mineral yields currently include stone and ore.
- Crops use conserved wheat, cabbage or pumpkin as seed. A successful harvest returns a dated food lot; sowing consumes the oldest matching lot when one exists.
- Shore collection, wells and nearby-well irrigation draw from one persisted renewable water table. It regenerates at a bounded rate.
- Fishing draws from a persisted renewable fish stock.
- Food lots preserve production and expiry through storage, market escrow, transfers and purchases. Recipe consumption removes both inventory and the corresponding oldest lots.
- Construction, repair, cancellation and demolition use generic material maps, so future resources can enter projects without changing the action contract.

## People, occupations and commitments

Every villager has persistent skills and may practice them. Initial occupation grants a starting competency, but work experience changes capability. When a settlement has construction but no builder, legal apprenticeship and occupation-change candidates prevent a scripted-role deadlock.

A villager may hold one persistent commitment: survival, enterprise, production, construction, public service or learning. Commitments survive individual actions and expose progress and blockers. Enterprise commitments observe real production runs; production commitments observe completed batches; construction commitments observe material and labor progress. Missing or cancelled targets become explicit blocked or abandoned commitments, allowing the model to replan.

## Organizations and workplaces

A business is a persistent organization with capital, inventory, workers, facilities, blockers and a production-run count. Registration alone produces nothing. A productive business must:

1. fund itself;
2. own or lease a compatible physical facility;
3. acquire recipe inputs in its own inventory;
4. authorize an owner or employee with sufficient skill;
5. run a timed recipe;
6. decide whether to retain, transfer or list the output.

Facilities wear during production and eventually require repair. Removing a business returns its remaining inventory to common stores, returns dated food-lot ownership and releases its facilities rather than deleting assets silently.

Ordinary job wages are escrowed when offered, remain escrowed when accepted and move to the worker only after a qualifying work or production action completes. An accepted contract alone does not count as employment success.

## Projects and institutions

Buildings, roads, wells, repairs and demolition remain universal projects. Individual public projects require a majority vote for an immutable plan. Adoption creates an expiring mandate; starting the project moves the approved budget into refundable escrow. Materials and labor are recorded independently. Paid labor remains paid, while cancellation returns unused money and delivered material.

## Verification gates

The automated suite is organized around system boundaries rather than showcase objects:

- physical truth: exact extraction, renewable stocks, seed use, dated lots and spoilage;
- production truth: input/facility/skill authorization and conserved outputs;
- institutional truth: votes, mandates, ownership, contracts and escrow;
- adaptation: apprenticeship, changing occupations, commitments and blocker-driven replanning;
- functional settlement: extraction, farming, homes, roads, water and private enterprise integration;
- scale: a sustained 100-villager autonomous run with invariants checked after every committed action;
- determinism: midpoint restore, provider-free replay and golden digests.

Brain experiments are calibration tests, not basic correctness tests. First inspect candidate selection, wait rate, blocked commitments, production throughput, unmet needs and resource pressure. Tune rewards, mutations, or cadence only after the deterministic gates stay green.
