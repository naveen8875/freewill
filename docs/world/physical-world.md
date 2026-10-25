# Freewill living settlement

Updated 2026-10-24. Save schema v6 makes agriculture, renewable water and fish, mineral extraction, production, public works, maintenance and removal part of the same authoritative simulation as villagers and politics. The cross-cutting production and organization model is documented in [Settlement systems](./settlement-systems.md).

## The complete loop

```text
harvest → fallow → sow a crop → tend/irrigate → ripen
                                      ↓
dated food lot → eat / trade / store → spoilage → waste

villager proposes one exact public project
  → every eligible villager votes
  → majority creates an expiring mandate
  → exact treasury budget enters project escrow
  → materials + verified paid labor
  → well / road / building becomes operational
  → decay → repair vote when major → repair
  → demolition vote when public → salvage + buildable footprint + tombstone
```

Every arrow is a typed action with a fully parameterized target. A local brain or the Local lab policy chooses only among those legal candidates; the executor revalidates ownership, mandate, money, materials, target condition and reservations again when the action completes.

## Spatial action contracts

High-level choices do not teleport their consequences. Each scheduled action records whether its target is the actor, a fixed world location, or another citizen, together with a route and interaction radius.

- Resource work routes to a reachable perimeter tile beside the exact tree, crop, rock, water source, building or project.
- Construction exposes multiple reservable perimeter work positions, so collaborators can work at one site without occupying a single magic tile.
- Shared construction deliveries route through an operational storage pile or storehouse (the plaza is the temporary founding-era common pile) before continuing to the project.
- Social actions, direct trades, job offers, job acceptance and citizen-to-citizen transfers require the people to meet. If the other person moves, the route is recomputed to a reachable rendezvous tile.
- An action applies no work or transfer until the actor is inside its interaction radius. A missing or repeatedly unreachable target cancels the action without applying consequences.
- Movement between those points is deterministic engine work. The decision provider chooses the intention; it is not called for every walking step.

The recorded target mode and interaction radius are part of the decision audit log, so replay reconstructs the same physical contract instead of inferring it from UI text.

## Agriculture, water and food

- Crop plots persist through `fallow`, `sown`, `growing`, `ripe` and `withered` stages with explicit crop type, growth, moisture and health.
- Farmers choose wheat, cabbage or pumpkin. Sowing consumes one conserved unit of that crop as seed. Tending improves health and growth; a nearby operational well or one carried water provides full irrigation.
- Wells and shore collection draw from one bounded, regenerating water table. Villagers accumulate thirst, draw water and drink it; wells below 15% condition stop operating.
- Every produced food unit belongs to a dated lot. Storehouses extend new shared or harvested lots from 180–240 ticks to 480 ticks.
- Eating, sowing and food recipes consume the oldest matching lot. Food retains its production and expiry dates through market listing, purchase, inventory transfer and returned market escrow. Expired food leaves inventory and increments settlement waste.

## Public works and voting

Public buildings, roads, major public repairs and public demolitions are individual proposals—not a blanket expansion permission. A proposal contains an immutable plan: operation, exact site, route or target, budget, wood, stone and labor. All eligible villagers receive a ballot. Adoption creates an expiring mandate that authorizes only that plan.

Road plans are paths from the plaza toward remote work and food locations. Completion creates one authoritative segment per tile and lowers movement cost from 1,000 to 450. Segment condition later raises it to 750 or 1,000.

## Escrow and cancellation

Starting funded construction transfers the exact approved or private amount into a persisted project escrow. Each completed labor action pays the actual builder from that escrow and records the payout. Completion refunds any unspent balance to the original citizen, business or treasury. Private payers may cancel unfinished work: remaining cash and delivered materials return, while already paid labor stays paid. Currency conservation includes all held project escrow.

## Damage, repair and demolition

- Buildings and roads decay every 120 ticks. Damaged cottages below 15% are evacuated; damaged operational buildings lose their bonuses.
- Minor repairs consume reserved shared material directly. Major public repairs require a mandate for the exact building or road segment and reserve the approved treasury budget.
- Public demolition requires a vote for the exact empty building. Private demolition requires owner authority. Salvage depends on current condition.
- Demolition clears the exact footprint, removes ownership, marks the source project, and persists an immutable demolition record so history survives after the object disappears.

## Authority and persistence

`PhysicalWorldState` is schema v6 and contains nodes, projects, buildings, roads, mandates, escrows, dated food lots, waste and demolition records. It is checkpointed and replayed with the rest of the simulation. The renderer only presents this state.

Reservations cover nodes, sites, stock, inventory, wallets, treasury, offers, business capital and exact structures. Invariants reject overlapping identities, invalid project totals, broken escrow conservation, orphaned road segments, completed projects without results, inconsistent residents and operational buildings that also have demolition tombstones.

The decision map links harvest→sow→tend, proposal→mandate-backed work, materials→projects, construction→operational outcomes and demolition authorization. These links come from recorded actions and immutable plans, not generated narrative.
