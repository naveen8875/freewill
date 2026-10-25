# Action catalog

The learning vocabulary currently exposes approximately forty high-level action families. A family becomes one or more fully parameterized candidates based on the citizen's knowledge and current world state.

## Survival and resources

Idle/rest, explore, drink, forage, gather wood/fiber/stone/ore, fish, hunt, cook/boil, fuel fire, sow, tend, harvest, store, and retrieve.

## Making and settlement

Craft tools, build or contribute to structures/projects, repair, demolish, maintain roads, work production recipes, and deliver project materials.

## Social behavior

Request, share, barter, steal, rescue, teach, warn, conceal, claim, challenge, promise, repay, forgive, retaliate, socialize, form/leave households, and form/leave groups.

## Institutions

Propose or participate in available group rules, votes, public projects, laws, enterprises, factions, and rebellion only when their prerequisites exist.

The exact stable IDs, masks, observation layout, and candidate encoding live in `src/sim/learning/learningVocabulary.ts`, `contracts.ts`, `observationEncoder.ts`, and `candidateEncoder.ts`. Update those contracts and cross-language fixtures together.

