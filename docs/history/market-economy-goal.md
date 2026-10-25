# Market-economy civilization goal

> Historical scenario plan. Generated Freewill worlds no longer receive this goal by default; market systems remain optional outcomes available through ordinary simulation rules.

Updated 2026-10-24. The feature now has a production React UI bound directly to the stable simulation state and commands below. The imported economy art remains a visual layer; it does not define simulation rules.

## Player promise

Selecting `market-economy` gives the settlement an objective—build a capitalist society—but does not instantly turn on capitalism. Five autonomous citizens must create the institutions through legal, recorded actions:

1. one citizen proposes a market charter;
2. citizens support or oppose it, with a strict majority required;
3. adoption enables private property, Shell currency, and contracts;
4. each citizen receives the same 20-Shell founding allocation;
5. citizens may register businesses and productive ownership;
6. owners choose among explicit quick-sale, market, and premium prices, escrow the listed goods, and other citizens may buy them;
7. owners can reinvest personal funds into business capital;
8. businesses can escrow wages, offer jobs, and pay workers on acceptance.

The simulation remains authoritative. The decision provider can select only a generated, parameterized candidate. It cannot invent an offer, price, buyer, business, worker, or amount, and it cannot mutate balances.

The retained five-citizen fixture now runs this entire sequence with the production `MockDecisionProvider`, not only a scripted test provider. Its transparent utilities prioritize the selected shared objective during founding while still allowing urgent hunger and fatigue to win.

Listing prices are real decision candidates rather than presentation-only labels. Frugal sellers receive a transparent premium-price contribution; sociable sellers receive a quick-sale contribution. The selected price remains an inspectable `list_good` intent and is revalidated like every other economic parameter.

Buyers compare the asking prices of their legal purchase candidates, with an additional low-price preference for Frugal citizens. Founding-stage goal alignment encourages every citizen to participate in the charter process but does not dictate the vote: Patient and Frugal traits can produce recorded opposition, and the charter still requires a real majority.

For lab decisions, normalized candidate records are the canonical persisted score/trace evidence; the policy envelope retains its `heuristic` identity without duplicating those arrays. Neural envelopes retain the real scores and probabilities emitted by the local brain service.

## Stable UI inputs

The visual design should consume these existing fields rather than maintain parallel UI state:

| UI concept | Source |
| --- | --- |
| Selected objective | `useAppStore().societyGoal` |
| Current phase | `SimulationSnapshot.civilizationGoal.stage` |
| “How we got here” milestones | `SimulationSnapshot.civilizationGoal.milestones` |
| Citizen money | `SimulationSnapshot.economy.wallets[citizenId]` |
| Institutions | `SimulationSnapshot.economy.policies` and `.charter` |
| Property and businesses | `.ownership` and `.businesses` |
| Market activity | `.offers`, `.transactions`, and `.priceHistory` |
| Employment | `.contracts` |
| Dashboard metrics | `.indicators` |
| Exact decision provenance | `DecisionRecord.selectedCandidateId`, `.selectedIntent`, `.candidates`, and `.providerSignals` |

`buildCivilizationDecisionMap(snapshot)` in `src/sim/civilizationDecisionMap.ts` is the presentation-neutral adapter for the causal map. It returns stable objective, decision, milestone, and outcome nodes plus dependency/provenance edges. The eventual React layer should render this model rather than reconstructing causal relationships from event text.

The creation flow calls `createConfiguredWorld({ societyGoal: "market-economy", ... })`. Reloading an existing world can call `reloadWorld({ societyGoal: "market-economy" })`. Changing the objective is a world-level operation and should not be presented as a cosmetic dashboard toggle.

## Decision-map semantics

The decision view should read as a causal map, not a chat log. Use the recorded data to show:

```text
shared objective
  → charter proposal
  → individual votes
  → charter adopted
  → equal currency allocation
  → business/property registration
  → listing → purchase
  → job offer → acceptance/payment
  → reinvestment
  → capital formation
```

Every rendered decision node should link to its `DecisionRecord`. Milestone completion ticks are authoritative. A pending action must appear as pending; a cancelled action must not be presented as having caused a milestone. Provider traces explain selection, while consequences and transactions explain what actually changed.

Suggested visual states are `locked`, `available`, `in-progress`, `completed`, and `failed/cancelled`. These are presentation states derived from goal milestones and action status; they are not new simulation states.

## Economic invariants

- Wallets, treasury, business capital, inventory, and escrow never become negative or non-finite.
- Total Shells across wallets, treasury, business capital, and wage escrow always equals `moneySupply`.
- Listed goods leave the seller's usable inventory and stay in offer escrow until sold or expired.
- Offered wages leave business capital and stay in contract escrow until accepted or expired.
- Ownership records are unique and always reference valid citizens/assets.
- A trade transfers money and goods atomically.
- Personal listings pay the seller's wallet; registered-business listings pay business capital. Offer invariants bind every escrowed business good to the listed firm's actual owner.
- All market actions are revalidated at execution time after travel/work delay.
- Revalidation also rejects forged ownership references, occupation-mismatched registrations, fractional/non-positive quantities and wages, duplicate listings, and self-employment—even if a malformed replay document bypasses normal candidate generation.
- Citizen inventory is simulation-owned after world creation. The renderer mirrors authoritative balances for display/export but cannot merge stale starter goods back into a running world.

## Save, replay, and decision boundary

World schema v3 persists the goal, institutions, balances, property, businesses, offers, contracts, transactions, and price history. Schemas v1/v2 migrate to the neutral `none` goal and an empty economy. Recorded parameterized intents replay without consulting a provider.

The decision policy receives the same compact perception and opaque legal candidate list as the lab policy. The market system therefore requires no brain-specific action executor, save format, or UI fork.

## Implemented visual layer

- World creation exposes an explicit open-ended or market-economy goal choice and passes it through `createConfiguredWorld`.
- The Copperfield economy pack is bundled by Vite, registering its procedural pixel assets and five-person starting world without adding the prototype UI runtime.
- The Civilization panel renders goal stage, milestone state, money supply, trade volume, firms, employment, derived settlement health, wealth shares, offers, contracts, transactions, and citizen ownership.
- The full-screen decision map renders the presentation-neutral causal graph with completed, available, in-progress, locked, and cancelled states. It is portal-mounted so filtered/backdrop UI ancestors cannot constrain its viewport geometry.
- Market sprites are available in the builder catalog.

React derives every number and visual state from `SimulationSnapshot`; no gameplay rule lives in the components.

