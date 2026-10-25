# freewill — Data Models

> Implementation note (2026-10-24): the concrete v1 contracts live in `src/sim/types.ts` and `src/persistence/worldDocument.ts`. Save imports are Zod-validated and contain full tiles, objects, inhabitants, time, stock, configuration, and optional mock simulation history. The richer replay/checkpoint envelope below remains the target for exact resimulation.

## Modeling principles

1. **The simulation owns truth.** UI views and Pixi objects reference stable IDs and derived snapshots.
2. **All stored and external data is versioned and validated.** TypeScript types alone do not protect save files, worker messages, or provider responses.
3. **Use integers for authoritative quantities.** Time is ticks, resources use units or milli-units, relationships use bounded integer scales, and positions use tiles plus fixed-point offsets where needed.
4. **Prefer structured facts over prose.** Memory, events, action outcomes, and decision context remain queryable and replayable.
5. **Separate definitions from instances.** Asset/action/need definitions are content; buildings, people, and actions are world state.
6. **Make revisions explicit.** They allow safe asynchronous decisions, path invalidation, edit transactions, and optimistic UI.

The examples below describe the intended shape rather than final source syntax. Every persisted boundary should have a Zod schema and inferred TypeScript type.

## Branded identifiers

```ts
type WorldId = Brand<string, "WorldId">;
type EntityId = Brand<number, "EntityId">;
type ObjectId = Brand<number, "ObjectId">;
type SettlementId = Brand<number, "SettlementId">;
type ActionId = Brand<string, "ActionId">;
type ActionInstanceId = Brand<number, "ActionInstanceId">;
type EventId = Brand<number, "EventId">;
type MemoryId = Brand<number, "MemoryId">;
type DecisionRequestId = Brand<string, "DecisionRequestId">;
type AssetId = Brand<string, "AssetId">;
```

In-memory numeric IDs are monotonic within a world and compact. Import/export envelopes can namespace them with the world ID. Avoid simulation-generated random UUIDs because they complicate deterministic replay.

## World aggregate

```ts
interface WorldState {
  schemaVersion: number;
  engineVersion: string;
  assetPackVersion: string;
  id: WorldId;
  name: string;
  seed: number;
  tick: number;
  revision: number;
  topologyRevision: number;
  configuration: WorldConfiguration;
  clock: WorldClockState;
  weather: WeatherState;
  terrain: TerrainState;
  objects: EntityTable<ObjectId, WorldObject>;
  characters: EntityTable<EntityId, Character>;
  settlements: EntityTable<SettlementId, Settlement>;
  relationships: RelationshipGraph;
  resources: ResourceLedger;
  actions: ActionSystemState;
  scheduler: SchedulerState;
  prng: PrngRegistryState;
  nextIds: NextIdState;
}

interface WorldConfiguration {
  width: number;
  height: number;
  gameSecondsPerTick: number;
  startDate: CalendarDate;
  rulesetId: string;
  difficulty: "cozy" | "standard" | "challenging";
  populationCap: number;
  decisionMode: "mock" | "local-brain";
  objective: CivilizationObjective;
  generationRules: {
    resourceAbundance: number;
    waterCoverage: number;
    vegetationDensity: number;
    initialWeather: WeatherKind;
  };
  simulationRules: {
    startingResources: Partial<Record<ResourceId, Quantity>>;
    needRateScale: number;
    regenerationScale: number;
    weatherDifficulty: number;
  };
  decisionPolicyRules: {
    cooperationCulture: number;
    conflictTendency: number;
    civicDuty: number;
  };
}
```

Generation and simulation rules directly affect deterministic formulas. Decision-policy rules affect candidate utilities and later brain context but never legal preconditions or action effects.

### Civilization objectives

```ts
type ObjectiveTemplateId =
  | "build-civilization"
  | "establish-democracy"
  | "prosperous-kingdom"
  | "peaceful-society"
  | "survive-scarcity"
  | "competing-settlements";

interface CivilizationObjective {
  templateId: ObjectiveTemplateId;
  title: string;
  description: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  milestones: readonly ObjectiveMilestone[];
}

interface ObjectiveMilestone {
  id: string;
  label: string;
  metric: MetricQuery;
  target: number;
  progress: number;
  status: "locked" | "active" | "completed" | "failed";
}
```

Editable text is presentation. Only supported templates, parameters, and metric-backed milestones affect the simulation.

`revision` changes after any committed authoritative mutation. `topologyRevision` changes only when passability/cost/connectivity changes. Per-entity revisions avoid discarding unrelated asynchronous work.

### Terrain

```ts
type TerrainId =
  | "deep-water" | "shallows" | "sand" | "grass" | "meadow"
  | "path" | "field" | "plaza" | "planks" | "dune" | "stone";

interface TerrainState {
  width: number;
  height: number;
  cells: Uint8Array;       // definition index, row-major
  elevation?: Int8Array;   // optional future input for generation/rendering
  moisture?: Uint8Array;
  chunkSize: number;
  chunkRevisions: Uint32Array;
}

interface TileView {
  point: TilePoint;
  terrainId: TerrainId;
  terrainRevision: number;
  occupiedBy: readonly ObjectId[];
  reservedBy: readonly ReservationId[];
}

interface TerrainDefinition {
  id: TerrainId;
  label: string;
  passability: ReadonlySet<MovementMode>;
  moveCostMilli: number;
  buildTags: readonly string[];
  atlasStyle: string;
}
```

Passability and movement cost are separate. A boat can use water without redefining `99` as passable.

Do not allocate an object for every tile in authoritative state. Packed arrays are the storage model; `TileView` is created only at inspection/query boundaries.

### Spatial value objects

```ts
interface TilePoint { x: number; y: number }
interface FixedPoint { xMilliTiles: number; yMilliTiles: number }
interface TileRect { x: number; y: number; width: number; height: number }
interface Facing { direction: "up" | "down" | "left" | "right" }
```

Validate all coordinates at the command boundary. Internal hot paths may use packed integer keys.

## Asset definitions and world objects

```ts
interface AssetDefinition {
  id: AssetId;
  category: "building" | "prop" | "nature" | "crop" | "character" | "animal";
  label: string;
  description: string;
  footprint: { width: number; height: number };
  anchorPixels: { x: number; y: number };
  selectionBoundsPixels: { x: number; y: number; width: number; height: number };
  collision: CollisionDefinition;
  placement: PlacementRule;
  tags: readonly string[];
  variants: readonly AssetVariant[];
  animations: Readonly<Record<string, AnimationDefinition>>;
  light?: LightDefinition;
  attachmentPoints?: Readonly<Record<string, PixelPoint>>;
}

interface WorldObject {
  id: ObjectId;
  revision: number;
  assetId: AssetId;
  variantId: string;
  origin: TilePoint;
  facing: Facing;
  construction: ConstructionState;
  condition: number; // 0..1000
  owner?: EntityId | SettlementId;
  settlementId?: SettlementId;
  inventoryId?: InventoryId;
  functions: readonly ObjectFunction[];
  customName?: string;
}
```

`ObjectFunction` is typed behavior such as housing, storage, production, light, water source, social venue, or decoration. The asset manifest defines what an object can support; the instance holds its current state.

## Characters

```ts
interface Character {
  id: EntityId;
  revision: number;
  kind: "villager" | "animal";
  identity: CharacterIdentity;
  appearance: Appearance;
  position: FixedPoint;
  tile: TilePoint;
  facing: Facing;
  movement: MovementState;
  life: LifeState;
  traits: PersonalityTraits;
  occupation?: OccupationState;
  needs: NeedState;
  inventory: Inventory;
  homeId?: ObjectId;
  settlementId?: SettlementId;
  currentGoal?: GoalState;
  currentAction?: ActionInstanceId;
  memories: MemoryIndex;
  decision: CharacterDecisionState;
}

interface CharacterIdentity {
  givenName: string;
  familyName?: string;
  pronouns: string;
  birthTick?: number;
}

interface LifeState {
  birthTick?: number;
  lifeStage: "child" | "adult" | "elder";
  health: number;        // 0..1000
  happiness: number;     // derived/cacheable summary, 0..1000
  alive: boolean;
  conditions: readonly ConditionState[];
}

interface Appearance {
  skin: string;
  hairColor: string;
  shirt: string;
  pants: string;
  hairStyle: string;
  hat: string;
}
```

The first production port can use the prototype's six appearance dimensions unchanged. New dimensions should be optional and content-versioned.

### Needs and personality

```ts
type NeedId = "hunger" | "energy" | "social" | "safety" | "belonging" | "purpose";

interface NeedState {
  values: Record<NeedId, number>; // 0 satisfied .. 1000 urgent
  lastUpdatedTick: number;
}

interface PersonalityTraits {
  sociability: number;      // -1000..1000
  industriousness: number;
  curiosity: number;
  generosity: number;
  caution: number;
}
```

Rules use the integer values. Decision context adds semantic buckets such as `reserved`, `balanced`, or `outgoing`; this gives a brain useful context without delegating threshold arithmetic.

### Occupations and goals

```ts
interface OccupationState {
  occupationId: "farmer" | "fisher" | "woodcutter" | "merchant" | "builder" | "none";
  workplaceId?: ObjectId;
  proficiency: number; // 0..1000
}

interface GoalState {
  id: string;
  kind: "satisfy-need" | "work" | "socialize" | "help" | "explore" | "rest";
  targetId?: EntityId | ObjectId;
  createdAtTick: number;
  expiresAtTick?: number;
  priority: number;
  source: "schedule" | "need" | "memory" | "interaction" | "event";
}
```

Goals focus candidate generation but do not bypass action legality.

## Settlements, factions, reputation, and leadership

```ts
interface Settlement {
  id: SettlementId;
  revision: number;
  name: string;
  memberIds: readonly EntityId[];
  objectIds: readonly ObjectId[];
  territory?: readonly TileRect[];
  publicInventoryIds: readonly InventoryId[];
  leadership: LeadershipState;
  policies: SettlementPolicies;
  reputation: number; // -1000..1000, derived from recorded effects/events
  government: GovernmentState;
  laws: readonly LawState[];
  institutionIds: readonly ObjectId[];
}

interface LeadershipState {
  model: "none" | "founder" | "appointed" | "elected";
  leaderIds: readonly EntityId[];
  sinceTick?: number;
}

interface Faction {
  id: string;
  name: string;
  memberIds: readonly EntityId[];
  settlementIds: readonly SettlementId[];
  values: readonly string[];
  reputationByFaction: Readonly<Record<string, number>>;
}

interface GovernmentState {
  type: "none" | "council" | "kingdom" | "republic";
  leaderIds: readonly EntityId[];
  foundedAtTick?: number;
  nextElectionTick?: number;
  legitimacy: number;
}

interface LawState {
  id: string;
  title: string;
  status: "proposed" | "active" | "repealed";
  enactedAtTick?: number;
  ruleId: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
}
```

Settlement membership is explicit and evented. Leadership, factions, and inter-settlement reputation should be introduced only after single-settlement social behavior is stable; the schema boundary leaves room without requiring Phase 3 implementation.

## Resources and inventories

```ts
type ResourceId = "food" | "wheat" | "fish" | "wood" | "water" | "stone";
type Quantity = number; // non-negative integer milli-units if fractions are needed

interface Inventory {
  id: InventoryId;
  revision: number;
  capacityMilli: number;
  stacks: Partial<Record<ResourceId, Quantity>>;
  reservations: readonly ResourceReservation[];
}

interface ResourceLedger {
  produced: Partial<Record<ResourceId, Quantity>>;
  consumed: Partial<Record<ResourceId, Quantity>>;
  destroyed: Partial<Record<ResourceId, Quantity>>;
  imported: Partial<Record<ResourceId, Quantity>>;
  exported: Partial<Record<ResourceId, Quantity>>;
}
```

Every transfer has source, destination, quantity, reason, and event ID. Tests assert that current stock equals initial + produced + imported − consumed − exported − destroyed. The prototype's global `{wheat, fish, wood, water}` counter becomes a derived settlement summary, not the storage model.

## Relationships and social interactions

Relationships are directed: A may trust B more than B trusts A.

```ts
interface RelationshipEdge {
  from: EntityId;
  to: EntityId;
  revision: number;
  affinity: number;      // -1000..1000
  trust: number;
  respect: number;
  fear: number;          // 0..1000
  resentment: number;    // 0..1000
  familiarity: number;   // 0..1000
  lastInteractionTick?: number;
}

interface SocialInteraction {
  kind: "greet" | "chat" | "share" | "help" | "argue" | "celebrate";
  initiator: EntityId;
  participants: readonly EntityId[];
  contextTags: readonly string[];
  outcome: InteractionOutcome;
}
```

Interaction rules emit bounded relationship deltas with reasons. The relationship explorer reads the event history, so every visible change can answer “what changed this?”

## Memories

```ts
interface MemoryFact {
  id: MemoryId;
  ownerId: EntityId;
  kind: "interaction" | "observation" | "achievement" | "loss" | "promise" | "place";
  subjectIds: readonly (EntityId | ObjectId | SettlementId)[];
  predicate: string;
  valence: number;          // -1000..1000
  salience: number;         // 0..1000
  occurredAtTick: number;
  learnedAtTick: number;
  expiresAtTick?: number;
  sourceEventIds: readonly EventId[];
  tags: readonly string[];
}
```

Memory is structured and compact. A presentation layer may turn a memory into a sentence, but that sentence is not the authoritative record. Retrieval ranks relevance using involved entities, current goals, recency, salience, and tags; it returns a bounded set for decisions.

## Candidate decisions and providers

```ts
interface ActionCandidate {
  id: string;                    // opaque within request
  actionId: ActionId;
  actorId: EntityId;
  target?: ActionTarget;
  parameters: Readonly<Record<string, string | number | boolean>>;
  summary: string;
  expectedEffects: readonly ExpectedEffect[];
  estimatedDurationTicks: number;
  estimatedTravelCost: number;
  utilityInputs: UtilityInputs;
}

interface DecisionRequest {
  requestId: DecisionRequestId;
  actorId: EntityId;
  requestedAtTick: number;
  deadlineTick: number;
  worldRevision: number;
  actorRevision: number;
  topologyRevision: number;
  perceptionHash: string;
  legalSetHash: string;
  context: DecisionContext;
  candidates: readonly ActionCandidate[];
}

interface DecisionResult {
  requestId: DecisionRequestId;
  provider: "mock" | "local-brain";
  candidateId: string;
  receivedAtTick: number;
  scores?: Readonly<Record<string, number>>;
  probabilities?: Readonly<Record<string, number>>;
  confidence?: number;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs?: number;
  trace: DecisionTrace;
}

interface DecisionProvider {
  readonly id: "mock" | "local-brain";
  decide(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResult>;
}
```

`probabilities` and `confidence` are optional. The lab policy emits transparent utility contributions and a seeded selection roll, not invented “AI confidence.” Local neural brains expose their real action scores and normalized selection probabilities. Noul has a probability but no confidence field.

### Decision trace

```ts
interface DecisionTrace {
  contextSummary: DecisionContext;
  candidateSummaries: readonly CandidateTrace[];
  providerOutput: unknown;
  validation: "accepted" | "stale" | "illegal" | "timed-out" | "fallback";
  validationDetails?: string;
}
```

This is observability, not fabricated chain-of-thought. The UI may show the supplied context, candidate utilities, neural scores, selection probabilities, selected action, and application validation. It must not label an app-generated narrative as the brain's private reasoning.

## Actions and reservations

```ts
interface ActionDefinition {
  id: ActionId;
  label: string;
  preconditions: readonly PreconditionsRule[];
  duration: DurationRule;
  reservationPlan: ReservationPlan;
  effects: readonly EffectRule[];
  interruptPolicy: "never" | "safe-point" | "anytime";
}

interface ActionInstance {
  id: ActionInstanceId;
  definitionId: ActionId;
  actorId: EntityId;
  target?: ActionTarget;
  status: "reserved" | "traveling" | "performing" | "committing" | "completed" | "cancelled";
  startedAtTick: number;
  progressTicks: number;
  durationTicks: number;
  reservations: readonly ReservationId[];
  sourceDecisionRequestId?: DecisionRequestId;
}
```

Validation happens before reservation and again before atomic commit. If the world changed, the action emits a structured rejection/cancellation event, releases all reservations, and schedules a new decision.

## Domain events

```ts
interface DomainEvent<TType extends string = string, TPayload = unknown> {
  id: EventId;
  worldId: WorldId;
  tick: number;
  sequence: number;
  type: TType;
  actorIds: readonly EntityId[];
  objectIds: readonly ObjectId[];
  settlementIds: readonly SettlementId[];
  payload: TPayload;
  visibility: "story" | "detail" | "debug";
  correlationId?: string;
  causationId?: EventId;
}
```

Core event families:

- world/time/weather;
- entity spawned/moved/died/changed occupation;
- need threshold crossed;
- decision requested/received/discarded/fell back;
- action started/progressed/completed/cancelled/rejected;
- inventory transferred/produced/consumed;
- interaction and relationship changed;
- memory created/decayed/removed;
- building placed/construction completed/removed;
- editor patch applied/reverted;
- snapshot/save/migration diagnostics.

The event feed filters `story` and selected `detail` events. Debug events remain available to developer tools but do not flood players.

## Editor commands

```ts
type EditorCommand =
  | PaintTerrainCommand
  | PlaceObjectCommand
  | RemoveObjectCommand
  | SpawnCharacterCommand
  | UpdateWorldSettingsCommand
  | CompositeEditorCommand;

interface EditorPatch {
  commandId: string;
  baseWorldRevision: number;
  affectedBounds: readonly TileRect[];
  before: readonly PatchOperation[];
  after: readonly PatchOperation[];
  topologyChanged: boolean;
}
```

Brush drag samples tiles into one deduplicated `CompositeEditorCommand`. The preview is UI state; only commit produces an authoritative patch. `before` permits inverse application while the simulation remains paused.

## Read models

Read models are intentionally smaller than `WorldState`.

```ts
interface WorldViewSnapshot {
  tick: number;
  revision: number;
  clock: ClockView;
  weather: WeatherView;
  resources: ResourceSummaryView;
  visibleObjects: readonly ObjectView[];
  visibleCharacters: readonly CharacterView[];
  selection?: SelectionView;
  metricsVersion: number;
  eventCursor: EventId;
}
```

Use specialized queries for character detail, relationship neighborhoods, dashboard time series, and event pages. Do not ship all memories and relationships with every render snapshot.

## Save and export envelope

```ts
interface WorldExportV1 {
  format: "freewill";
  schemaVersion: 1;
  engineVersion: string;
  assetPackVersion: string;
  exportedAt: string;
  world: WorldLibraryMetadata;
  snapshot: PersistedSnapshot;
  eventChunks?: readonly PersistedEventChunk[];
  checksum: string;
}
```

Persist PRNG states, pending schedules, reservations, action progress, and ID counters. Otherwise a loaded save will look correct but diverge on the next tick.

Imports must enforce dimensions, population, event count, decoded byte size, allowed enum values, coordinate bounds, unique IDs, and reference integrity before committing anything to IndexedDB.

## Creator and recording configuration

Recording is not authoritative simulation state. A recording project references a world/session and presentation settings:

```ts
interface RecordingPreset {
  id: "cinematic" | "decision-showcase" | "documentary" | "vertical-social" | "custom";
  aspectRatio: "16:9" | "9:16" | "1:1";
  width: number;
  height: number;
  frameRate: 24 | 30 | 60;
  overlays: {
    clock: boolean;
    events: boolean;
    decisions: boolean;
    statistics: boolean;
  };
  camera: { mode: "manual" | "follow"; targetId?: EntityId };
}

interface RecordingArtifact {
  id: string;
  worldId: WorldId;
  startedAtTick: number;
  endedAtTick?: number;
  createdAt: string;
  preset: RecordingPreset;
  mimeType: string;
  durationMs: number;
  byteSize: number;
  objectUrl?: string; // transient, never serialized
}
```

The browser-selected MIME type is recorded honestly. WebM is the portable baseline; MP4 is offered only when `MediaRecorder.isTypeSupported` confirms an implemented path.

## Versioning rules

- Increment `schemaVersion` only for persisted structural changes.
- Record `engineVersion` for behavior/replay compatibility.
- Record `assetPackVersion` for stable visual and footprint interpretation.
- Each migration is `vN -> vN+1`, pure where possible, independently tested, and never skips a version.
- Old replays may be viewable through their recorded snapshots even when exact resimulation is unsupported; communicate that distinction explicitly.
