import { MockDecisionProvider } from "./MockDecisionProvider";
import { DecisionCoordinator, type DecisionPolicy, type DecisionResolution } from "./DecisionCoordinator";
import { buildActionCandidates } from "./actionCandidates";
import { clamp01, createSeededRandom, hashSeed } from "./random";
import { checkActionLegality } from "./actionLegality";
import { assertEconomyInvariants, businessName, createCivilizationGoal, createEconomyState, economicIntentBlockReason, refreshEconomicIndicators, refreshGoalProgress } from "./economy";
import { deepFreeze, stableHash } from "./stableHash";
import { findPath, isWalkable, normalizeSpatialWorld, walkableComponents, type SimulationWorldSeed } from "./spatial";
import { advancePolitics, assertPoliticsInvariants, createPoliticsState, executePoliticalIntent, politicalIntentBlockReason, refreshGoalDimensions, refreshPoliticalIndicators, resolveReadyVotes, syncPoliticalCitizens } from "./politics";
import { assertPhysicalWorldInvariants, BUILDINGS, constructionSummary, createPhysicalWorld, findBuildSites, physicalIntentBlockReason, PRIMITIVE_RECIPES, projectProgress } from "./physicalWorld";
import { gainSkill, initialSkills, inventoryFor, PRODUCTION_RECIPES, refreshBusinessBlockers, refreshCitizenCommitments, settlementIntentBlockReason, skillLevel } from "./settlementSystems";
import { advanceSocialWorld, assertSocialWorldInvariants, socialIntentBlockReason, type SocialIntent } from "./socialWorld";
import { activeActionInterruptReason, commitmentWindowTicks, initialMindState, reviewIntervalTicks } from "./mindRuntime";
import { LEGACY_TICK_RATIO, legacyDurationTicks, simulationDay } from "./time";
import type {
  ActionCandidate,
  ActionId,
  ActionIntent,
  BuildingType,
  CitizenSeed,
  CitizenState,
  CoreActionId,
  DecisionProvider,
  DecisionRecord,
  EconomyState,
  InventoryOwner,
  MemoryRecord,
  ResourceClaim,
  SimulationEvent,
  SimulationSnapshot,
  SimulationStepResult,
  SocietyGoalId,
  TraditionalCoreActionId,
} from "./types";

const CORE_ACTIONS = new Set<ActionId>(["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"]);
const DECISION_DEADLINE_TICKS = 72;
// One simulation tick represents thirty minutes. Twelve ordinary terrain tiles
// leaves room for visible travel while keeping a 64x48 island traversable.
const MOVEMENT_BUDGET_PER_TICK = 12_000;
const CHECKPOINT_INTERVAL = 60;
const MAX_LIVE_CHECKPOINTS = 4;
const STATIC_SPATIAL_INTENTS = new Set<ActionIntent["kind"]>([
  "claim_resource", "challenge_claim", "conceal_resource", "forage_wild_food", "gather_fiber", "gather_branches", "gather_loose_stone",
  "fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "collect_water", "gather_clay", "drink_natural_water", "catch_fish",
  "hunt_game", "explore", "draw_water", "propose_public_project", "start_construction", "deliver_material", "work_construction", "cancel_project",
  "repair_structure", "demolish_structure", "move_home", "operate_recipe", "lease_facility", "fuel_campfire", "cook_food", "boil_water",
]);

const CONNECTIVE_SOCIAL_INTENTS = new Set<ActionIntent["kind"]>([
  "request_item", "share_item", "barter_item", "rescue_person", "offer_project_help", "invite_project", "teach_technique", "warn_resource",
  "form_household", "form_group", "invite_group", "adopt_group_system", "contribute_group_stock", "promise_item", "fulfill_promise", "forgive",
]);

function inferredTargetMode(intent: ActionIntent | undefined, targetCitizenId: number | undefined, _routeLength: number): PlannedMovement["targetMode"] {
  if (targetCitizenId !== undefined) return "citizen";
  if (intent && STATIC_SPATIAL_INTENTS.has(intent.kind)) return "static";
  return "self";
}

function defaultIntent(action: ActionId): ActionIntent {
  if (!CORE_ACTIONS.has(action)) throw new Error(`Parameterized action ${action} is missing its trusted intent.`);
  return { kind: action as TraditionalCoreActionId };
}

const TRAITS = ["Diligent", "Sociable", "Patient", "Curious", "Frugal", "Bold"];

const GOALS: Record<string, string> = {
  farmer: "Keep the settlement fed",
  fisher: "Read the water and fill the stores",
  baker: "Turn the harvest into shared meals",
  woodcutter: "Maintain a careful supply of timber",
  miner: "Find enough stone and ore to expand",
  builder: "Raise a lasting community landmark",
  merchant: "Keep goods moving between neighbors",
  smith: "Make useful things that outlast the season",
  guard: "Protect the village without dividing it",
  kid: "Learn every corner of the village",
  wanderer: "Find a place worth belonging to",
};

interface PendingDecision {
  request: import("./types").DecisionRequest;
  citizenId: number;
  resolution?: DecisionResolution;
  completion?: Promise<void>;
}

interface PlannedMovement {
  target: { x: number; y: number };
  route: Array<{ x: number; y: number }>;
  targetCitizenId?: number;
  targetMode: "self" | "static" | "citizen";
  interactionRadius: number;
  reachable: boolean;
  blockedReason?: string;
}

export interface SimulationConfig {
  societyGoal?: SocietyGoalId;
  goalPrompt?: string;
}

function citizenFromSeed(seed: number, input: CitizenSeed): CitizenState {
  const rng = createSeededRandom(hashSeed(seed, input.id));
  const firstTrait = TRAITS[Math.floor(rng() * TRAITS.length)];
  let secondTrait = TRAITS[Math.floor(rng() * TRAITS.length)];
  if (secondTrait === firstTrait) secondTrait = TRAITS[(TRAITS.indexOf(secondTrait) + 1) % TRAITS.length];
  const axis = () => Number((0.12 + rng() * 0.76).toFixed(3));
  const personality = input.personality ?? {
    empathy: axis(), sociability: axis(), industriousness: axis(),
    openness: axis(), conscientiousness: axis(), extraversion: axis(), agreeableness: axis(), emotionalSensitivity: axis(),
    riskTolerance: axis(), patience: axis(), generosity: axis(), dominance: axis(), curiosity: axis(), conformity: axis(), aggression: axis(), acquisitiveness: axis(), independence: axis(),
  };
  return {
    ...input,
    revision: 1,
    position: input.position ? { x: Math.trunc(input.position.x), y: Math.trunc(input.position.y) } : { x: 2 + (input.id * 3) % 24, y: 2 + (input.id * 5) % 16 },
    facing: "down",
    traits: input.traits?.length ? [...input.traits] : [firstTrait, secondTrait],
    goal: input.goal ?? GOALS[input.job] ?? "Survive, learn this place, and choose a life",
    needs: {
      hunger: clamp01(input.initialNeeds?.hunger ?? Number((0.18 + rng() * 0.28).toFixed(3))),
      fatigue: clamp01(input.initialNeeds?.fatigue ?? Number((0.12 + rng() * 0.3).toFixed(3))),
      loneliness: clamp01(input.initialNeeds?.loneliness ?? Number((0.1 + rng() * 0.32).toFixed(3))),
      thirst: clamp01(input.initialNeeds?.thirst ?? Number((0.14 + rng() * 0.24).toFixed(3))),
    },
    happiness: Number((0.62 + rng() * 0.22).toFixed(3)),
    inventory: { ...(input.inventory ?? {}) },
    toolDurability: {},
    relationships: {},
    socialRelationships: {},
    memories: [],
    currentActivity: "Waking in an unfamiliar wilderness",
    mind: initialMindState(),
    skills: initialSkills(input.job),
    personality,
    physical: { strength: axis(), endurance: axis(), health: 1, injury: 0, exposure: 0, age: 18 + Math.floor(rng() * 37), movementAbility: axis(), temperatureTolerance: axis(), illness: 0, alive: true },
    emotions: { fear: Number((0.2 + rng() * 0.25).toFixed(3)), anger: axis() * 0.15, hope: Number((0.45 + rng() * 0.35).toFixed(3)), contentment: 0.35, stress: 0.28, gratitude: 0, resentment: 0, confidence: axis(), safety: 0.35 },
    values: { autonomy: axis(), security: axis(), community: axis(), fairness: axis(), status: axis(), tradition: axis(), equality: axis(), wealth: axis(), exploration: axis(), family: axis(), nature: axis() },
    knowledge: { discoveredTiles: [], knownResources: [], knownPeople: [], learnedTechniques: ["forage", "gather-branches", "make-fire", "basic-shelter"] },
  };
}

function addMemory(citizen: CitizenState, memory: MemoryRecord) {
  citizen.memories = [memory, ...citizen.memories].slice(0, 8);
}

function foodKey(stock: Record<string, number>) {
  return ["cooked_meal", "berries", "meat", "bread", "fish", "wheat", "cabbage", "pumpkin"].find((key) => (stock[key] ?? 0) > 0);
}

function nearestOpenPosition(world: SimulationSnapshot["topology"], position: { x: number; y: number }) {
  if (isWalkable(world, position)) return { ...position };
  const limit = Math.max(world.width, world.height);
  for (let radius = 1; radius <= limit; radius += 1) {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const candidate = { x: position.x + dx, y: position.y + dy };
      if (isWalkable(world, candidate)) candidates.push(candidate);
    }
    if (candidates.length) return candidates.sort((left, right) => Math.abs(left.x - position.x) + Math.abs(left.y - position.y) - (Math.abs(right.x - position.x) + Math.abs(right.y - position.y)) || left.y - right.y || left.x - right.x)[0];
  }
  throw new Error("The world has no walkable tile for a citizen spawn.");
}

export class MockSimulation {
  private snapshot: SimulationSnapshot;
  private readonly coordinator: DecisionCoordinator;
  private readonly replayExpected = new Map<string, DecisionRecord>();
  private readonly pendingDecisions = new Map<number, PendingDecision>();
  private readonly localKnowledgeAnchors = new Map<number, string>();
  private readonly providerControlsCommitments: boolean;
  private componentCache?: { revision: number; labels: Int32Array };
  private buildSiteCache?: {
    key: string;
    decision?: Array<{ buildingType: BuildingType; x: number; y: number }>;
    validation?: Array<{ buildingType: BuildingType; x: number; y: number }>;
  };
  private roadPlanCache?: { key: string; plans: Array<Array<{ x: number; y: number }>> };

  constructor(seed: number, citizens: CitizenSeed[], stock: Record<string, number>, restored?: SimulationSnapshot, provider?: DecisionProvider, policy?: DecisionPolicy, spatialSeed?: SimulationWorldSeed, config: SimulationConfig = {}) {
    const fallback = new MockDecisionProvider(seed);
    this.coordinator = new DecisionCoordinator(provider ?? fallback, fallback, policy);
    this.providerControlsCommitments = provider?.descriptor.kind === "local-brain";
    this.snapshot = restored ?? {
      schemaVersion: 6,
      seed,
      tick: 0,
      stateVersion: 1,
      worldRevision: 1,
      topology: normalizeSpatialWorld(spatialSeed),
      activeActions: {},
      reservations: {},
      checkpoints: [],
      requests: [],
      cursor: 0,
      citizens: Object.fromEntries(citizens.map((citizen) => [citizen.id, citizenFromSeed(seed, citizen)])),
      stock: { ...stock },
      decisions: [],
      events: [{
        id: "event-0",
        tick: 0,
        day: 1,
        category: "world",
        title: config.societyGoal === "none" ? "People wake in the wilderness" : "The settlement wakes",
        detail: config.societyGoal === "none"
          ? `${citizens.length} people begin with empty hands, no institution, and no shared objective.`
          : `${citizens.length} inhabitants begin a reproducible society simulation.`,
        citizenIds: citizens.map((citizen) => citizen.id),
      }],
      trends: [],
      constructionProgress: 0,
      civilizationGoal: createCivilizationGoal(config.societyGoal, config.goalPrompt),
      economy: createEconomyState(),
      politics: createPoliticsState(citizens.map((citizen) => citizen.id), config.societyGoal && config.societyGoal !== "none" ? "formal" : "none"),
      physicalWorld: createPhysicalWorld(spatialSeed),
      socialGroups: {},
      socialPromises: {},
    };
    for (const citizen of Object.values(this.snapshot.citizens)) citizen.mind ??= initialMindState();
    for (const action of Object.values(this.snapshot.activeActions)) {
      const owner = this.snapshot.citizens[action.citizenId];
      action.workTicksTotal ??= Math.max(1, action.workTicksRemaining);
      action.interruptible ??= true;
      action.minimumCommitmentUntilTick ??= action.startedAtTick + commitmentWindowTicks(action.actionId, action.workTicksTotal);
      action.nextReviewAtTick ??= action.startedAtTick + (owner ? reviewIntervalTicks(owner) : 1);
      action.targetMode ??= inferredTargetMode(action.intent, action.targetCitizenId, action.route.length);
      action.interactionRadius ??= action.targetCitizenId !== undefined ? 1 : 0;
      action.repathCount ??= 0;
      action.unreachableTicks ??= 0;
    }
    this.snapshot.civilizationGoal ??= createCivilizationGoal(config.societyGoal, config.goalPrompt);
    this.snapshot.economy ??= createEconomyState();
    this.snapshot.economy.production ??= [];
    for (const business of Object.values(this.snapshot.economy.businesses)) {
      business.organization ??= "sole-proprietorship";
      business.facilityObjectUids ??= [];
      business.blockers ??= [];
      business.productionRuns ??= 0;
    }
    this.snapshot.politics ??= createPoliticsState(citizens.map((citizen) => citizen.id), this.snapshot.civilizationGoal.id === "none" ? "none" : "formal");
    this.snapshot.physicalWorld ??= createPhysicalWorld(spatialSeed);
    this.snapshot.socialGroups ??= {};
    this.snapshot.socialPromises ??= {};
    if (!restored) for (const citizen of Object.values(this.snapshot.citizens)) citizen.position = nearestOpenPosition(this.snapshot.topology, citizen.position);
    for (const building of Object.values(this.snapshot.physicalWorld.buildings)) {
      const businessId = building.operatorBusinessId ?? (building.owner.kind === "business" ? building.owner.id : undefined);
      const business = businessId ? this.snapshot.economy.businesses[businessId] : undefined;
      if (business && !business.facilityObjectUids.includes(building.objectUid)) business.facilityObjectUids.push(building.objectUid);
    }
    for (const citizen of Object.values(this.snapshot.citizens)) {
      citizen.skills ??= initialSkills(citizen.job);
      citizen.toolDurability ??= {};
      const defaults = citizenFromSeed(this.snapshot.seed, { id: citizen.id, name: citizen.name, job: citizen.job });
      citizen.personality = { ...defaults.personality!, ...citizen.personality };
      citizen.physical = { ...defaults.physical!, ...citizen.physical };
      citizen.emotions = { ...defaults.emotions!, ...citizen.emotions };
      citizen.values = { ...defaults.values!, ...citizen.values };
      citizen.socialRelationships ??= {};
      citizen.knowledge ??= defaults.knowledge;
      if (citizen.homeObjectUid !== undefined) {
        const building = this.snapshot.physicalWorld.buildings[String(citizen.homeObjectUid)];
        if (building && !building.residentIds.includes(citizen.id) && building.residentIds.length < building.capacity) building.residentIds.push(citizen.id);
        else if (!building) delete citizen.homeObjectUid;
      }
    }
    assertPhysicalWorldInvariants(this.snapshot.physicalWorld, Object.values(this.snapshot.citizens), this.snapshot.economy);
    assertSocialWorldInvariants(this.snapshot.socialGroups, this.snapshot.socialPromises, this.snapshot.citizens);
    if (!restored) this.initializeRelationships();
  }

  private initializeRelationships() {
    const citizens = Object.values(this.snapshot.citizens).sort((a, b) => a.id - b.id);
    const score = (preset: CitizenSeed["relationshipPreset"]) => preset === "friendly" ? 0.68 : preset === "strained" ? 0.32 : 0.5;
    for (const citizen of citizens) {
      for (const [id, trust] of Object.entries(citizen.initialRelationships ?? {})) {
        if (Number(id) !== citizen.id) citizen.relationships[Number(id)] = clamp01(trust);
      }
      const localCohort = citizens.filter((other) => other.id !== citizen.id && (
        citizen.relationshipPreset !== undefined && citizen.relationshipPreset !== "neutral"
        || Boolean(citizen.settlementId && citizen.settlementId === other.settlementId)
      )).slice(0, 8);
      for (const other of localCohort) {
        const sharedSettlement = citizen.settlementId && citizen.settlementId === other.settlementId ? 0.06 : 0;
        citizen.relationships[other.id] = clamp01((score(citizen.relationshipPreset) + score(other.relationshipPreset)) / 2 + sharedSettlement);
        citizen.socialRelationships![other.id] = {
          trust: citizen.relationships[other.id], affection: 0.25, fear: 0, respect: 0.3, debt: 0, grievance: 0,
        };
      }
    }
    this.snapshot.checkpoints = [];
    this.captureCheckpoint();
  }

  getSnapshot(): SimulationSnapshot {
    return structuredClone(this.snapshot);
  }

  getCurrentTick() {
    return this.snapshot.tick;
  }

  destroy() {
    this.coordinator.cancelAll("Simulation runtime stopped");
    this.pendingDecisions.clear();
  }

  getPendingDecisionCount() {
    return this.pendingDecisions.size;
  }

  /** Headless runners use this to yield to real local/network providers. */
  async waitForPendingDecisions() {
    const completions = [...this.pendingDecisions.values()].flatMap((pending) => pending.completion ? [pending.completion] : []);
    if (completions.length) await Promise.allSettled(completions);
  }

  getHistoricalSnapshot(targetTick: number): SimulationSnapshot {
    const boundedTick = Math.max(0, Math.min(this.snapshot.tick, Math.trunc(targetTick)));
    if (boundedTick === this.snapshot.tick) return this.getSnapshot();
    const checkpoint = [...this.snapshot.checkpoints].reverse().find((item) => item.tick <= boundedTick);
    if (!checkpoint) throw new Error(`No replay checkpoint exists before tick ${boundedTick}.`);
    const actualCheckpointDigest = stableHash(checkpoint.state);
    if (actualCheckpointDigest !== checkpoint.digest) {
      throw new Error(`Replay checkpoint mismatch at tick ${checkpoint.tick}: expected ${checkpoint.digest}, received ${actualCheckpointDigest}.`);
    }
    const activeAtCheckpoint = new Set(Object.values(checkpoint.state.activeActions).map((action) => action.decisionId));
    const checkpointDecisions = this.snapshot.decisions
      .filter((decision) => decision.tick <= checkpoint.tick)
      .map((decision) => {
        const copy = structuredClone(decision);
        if (!activeAtCheckpoint.has(copy.id)) return copy;
        copy.actionStatus = "in-progress";
        delete copy.completedAtTick;
        copy.consequences = ["Action scheduled; no consequences have been applied yet."];
        copy.resourceDelta = {};
        copy.activity = copy.route.length ? `Traveling to ${copy.selectedLabel.toLowerCase()}` : `Beginning ${copy.selectedLabel.toLowerCase()}`;
        return copy;
      });
    const restored: SimulationSnapshot = {
      schemaVersion: 6,
      seed: this.snapshot.seed,
      tick: checkpoint.tick,
      checkpoints: [],
      requests: structuredClone(this.snapshot.requests.filter((request) => request.requestedAtTick <= checkpoint.tick)),
      decisions: checkpointDecisions,
      events: structuredClone(this.snapshot.events.filter((event) => event.tick <= checkpoint.tick)),
      trends: structuredClone(this.snapshot.trends.filter((trend) => trend.tick <= checkpoint.tick)),
      ...structuredClone(checkpoint.state),
    };
    const replay = new MockSimulation(this.snapshot.seed, [], {}, restored);
    for (const action of Object.values(restored.activeActions)) {
      const expected = this.snapshot.decisions.find((decision) => decision.id === action.decisionId);
      if (expected) replay.replayExpected.set(expected.id, structuredClone(expected));
    }
    const decisions = new Map<number, DecisionRecord[]>();
    for (const decision of [...this.snapshot.decisions].reverse()) {
      if (decision.tick <= checkpoint.tick || decision.tick > boundedTick) continue;
      const atTick = decisions.get(decision.tick) ?? [];
      atTick.push(decision);
      decisions.set(decision.tick, atTick);
    }
    for (let tick = checkpoint.tick + 1; tick <= boundedTick; tick += 1) {
      const day = this.snapshot.events.find((event) => event.tick === tick)?.day ?? simulationDay(tick - 1);
      replay.replayTick(decisions.get(tick), day);
    }
    const historical = replay.getSnapshot();
    replay.destroy();
    return historical;
  }

  syncCitizens(inputs: CitizenSeed[]) {
    for (const input of inputs) {
      const existing = this.snapshot.citizens[input.id];
      if (existing) {
        existing.name = input.name;
        existing.job = input.job;
        if (input.traits?.length) existing.traits = [...input.traits];
        if (input.goal) existing.goal = input.goal;
        if (input.settlementId !== undefined) existing.settlementId = input.settlementId;
        if (input.relationshipPreset !== undefined) existing.relationshipPreset = input.relationshipPreset;
      } else {
        this.snapshot.citizens[input.id] = citizenFromSeed(this.snapshot.seed, input);
      }
    }
    syncPoliticalCitizens(this.snapshot.politics, Object.values(this.snapshot.citizens));
    const valid = new Set(inputs.map((input) => input.id));
    for (const id of Object.keys(this.snapshot.citizens).map(Number)) {
      if (!valid.has(id)) {
        const actionId = this.snapshot.citizens[id].currentActionId;
        if (actionId) this.cancelAction(actionId, "Citizen was removed from the world.");
        this.removeCitizenFromEconomy(id);
        delete this.snapshot.citizens[id];
      }
    }
  }

  private removeCitizenFromEconomy(citizenId: number) {
    const economy = this.snapshot.economy;
    const departing = this.snapshot.citizens[citizenId];
    for (const [resource, amount] of Object.entries(departing?.inventory ?? {})) this.snapshot.stock[resource] = (this.snapshot.stock[resource] ?? 0) + amount;
    for (const lot of Object.values(this.snapshot.physicalWorld.foodLots)) if (lot.owner.kind === "citizen" && lot.owner.id === citizenId) lot.owner = { kind: "stock" };
    for (const building of Object.values(this.snapshot.physicalWorld.buildings)) {
      building.residentIds = building.residentIds.filter((id) => id !== citizenId);
      if (building.owner.kind === "citizen" && building.owner.id === citizenId) building.owner = { kind: "public", id: "settlement" };
    }
    for (const project of Object.values(this.snapshot.physicalWorld.projects)) if (project.owner.kind === "citizen" && project.owner.id === citizenId) project.owner = { kind: "public", id: "settlement" };
    for (const escrow of Object.values(this.snapshot.physicalWorld.escrows)) if (escrow.payer.kind === "citizen" && escrow.payer.id === citizenId) escrow.payer = { kind: "public", id: "settlement" };
    economy.treasury += economy.wallets[citizenId] ?? 0;
    delete economy.wallets[citizenId];
    const ownedBusinessIds = new Set(Object.values(economy.businesses).filter((business) => business.ownerId === citizenId).map((business) => business.id));
    for (const [id, offer] of Object.entries(economy.offers)) {
      if (offer.sellerId === citizenId || offer.businessId && ownedBusinessIds.has(offer.businessId)) {
        if (offer.amountRemaining > 0) this.snapshot.stock[offer.resource] = (this.snapshot.stock[offer.resource] ?? 0) + offer.amountRemaining;
        delete economy.offers[id];
      }
    }
    for (const [id, contract] of Object.entries(economy.contracts)) {
      if (contract.employerId === citizenId || contract.workerId === citizenId || ownedBusinessIds.has(contract.businessId)) {
        economy.treasury += contract.escrowedWage;
        delete economy.contracts[id];
      }
    }
    for (const id of ownedBusinessIds) {
      const business = economy.businesses[id];
      economy.treasury += business?.capital ?? 0;
      for (const [resource, amount] of Object.entries(business?.inventory ?? {})) this.snapshot.stock[resource] = (this.snapshot.stock[resource] ?? 0) + amount;
      for (const lot of Object.values(this.snapshot.physicalWorld.foodLots)) if (lot.owner.kind === "business" && lot.owner.id === id) lot.owner = { kind: "stock" };
      for (const building of Object.values(this.snapshot.physicalWorld.buildings)) {
        if (building.owner.kind === "business" && building.owner.id === id) building.owner = { kind: "public", id: "settlement" };
        if (building.operatorBusinessId === id) delete building.operatorBusinessId;
      }
      delete economy.businesses[id];
    }
    for (const business of Object.values(economy.businesses)) business.employeeIds = business.employeeIds.filter((id) => id !== citizenId);
    economy.ownership = economy.ownership.filter((record) => record.ownerId !== citizenId && !ownedBusinessIds.has(record.assetId));
    if (economy.charter?.status === "open") {
      economy.charter.supporterIds = economy.charter.supporterIds.filter((id) => id !== citizenId);
      economy.charter.opponentIds = economy.charter.opponentIds.filter((id) => id !== citizenId);
    }
    delete this.snapshot.politics.citizens[citizenId];
    for (const proposal of Object.values(this.snapshot.politics.proposals)) {
      proposal.eligibleVoterIds = proposal.eligibleVoterIds.filter((id) => id !== citizenId);
      delete proposal.ballots[citizenId];
    }
    for (const faction of Object.values(this.snapshot.politics.factions)) faction.memberIds = faction.memberIds.filter((id) => id !== citizenId);
    refreshPoliticalIndicators(this.snapshot.politics);
  }

  updateTopology(seed: SimulationWorldSeed) {
    this.coordinator.cancelAll("World topology changed");
    this.pendingDecisions.clear();
    for (const actionId of Object.keys(this.snapshot.activeActions)) this.cancelAction(actionId, "A world edit invalidated the planned action.");
    if (seed.objects) {
      const previous = this.snapshot.physicalWorld;
      const refreshed = createPhysicalWorld(seed);
      refreshed.renewableStocks = structuredClone(previous.renewableStocks);
      const presentObjectIds = new Set(seed.objects.map((object) => object.uid));
      for (const node of Object.values(previous.resources)) if (presentObjectIds.has(node.objectUid)) refreshed.resources[node.id] = structuredClone(node);
      for (const project of Object.values(previous.projects)) if (presentObjectIds.has(project.objectUid)) refreshed.projects[project.id] = structuredClone(project);
      for (const building of Object.values(previous.buildings)) if (presentObjectIds.has(building.objectUid)) refreshed.buildings[String(building.objectUid)] = structuredClone(building);
      refreshed.roads = structuredClone(previous.roads);
      refreshed.mandates = structuredClone(previous.mandates);
      refreshed.escrows = Object.fromEntries(Object.entries(previous.escrows).filter(([, escrow]) => refreshed.projects[escrow.projectId]).map(([id, escrow]) => [id, structuredClone(escrow)]));
      refreshed.foodLots = structuredClone(previous.foodLots);
      for (const lot of Object.values(refreshed.foodLots)) if (lot.storageBuildingUid && !refreshed.buildings[String(lot.storageBuildingUid)]) delete lot.storageBuildingUid;
      refreshed.demolitions = structuredClone(previous.demolitions);
      refreshed.waste = previous.waste;
      refreshed.claims = structuredClone(previous.claims ?? {});
      refreshed.nextObjectUid = Math.max(refreshed.nextObjectUid, previous.nextObjectUid);
      this.snapshot.physicalWorld = refreshed;
      for (const citizen of Object.values(this.snapshot.citizens)) {
        if (citizen.homeObjectUid !== undefined && !refreshed.buildings[String(citizen.homeObjectUid)]) delete citizen.homeObjectUid;
      }
    }
    this.snapshot.topology = normalizeSpatialWorld({ ...seed, topologyRevision: Math.max(seed.topologyRevision, this.snapshot.topology.topologyRevision + 1) });
    this.snapshot.worldRevision += 1;
    this.snapshot.stateVersion += 1;
    this.captureCheckpoint();
  }

  /**
   * Advances one authoritative tick. Browser fast-forward may request an
   * internal snapshot view so several ticks can be processed before making a
   * single defensive copy for React and the renderer. The default remains a
   * detached snapshot for every external/test caller.
   */
  async step(day = 1, options: { copySnapshot?: boolean } = {}): Promise<SimulationStepResult | null> {
    const prepared = this.prepareTick(day);
    if (!prepared) return null;
    const { citizens, events } = prepared;
    const decisions = this.acceptReadyDecisions(citizens);
    const expired = await this.expireOverdueDecision(citizens);
    if (expired) decisions.push(expired);
    if (!this.providerControlsCommitments && !decisions.length) {
      const commitmentDecision = this.continueCommitment(citizens);
      if (commitmentDecision) decisions.push(commitmentDecision);
    }
    const commitmentReady = this.providerControlsCommitments
      ? new Set<number>()
      : new Set(citizens.filter((citizen) => !citizen.currentActionId && citizen.commitment?.status === "active" && this.commitmentCandidate(citizen, citizens)).map((citizen) => citizen.id));
    const issued = this.issueDecisionRequests(citizens, commitmentReady);
    if (issued.length) {
      // Give already-resolved local providers a bounded microtask turn. A slow
      // provider remains in flight and never holds up the simulation clock.
      for (let turn = 0; turn < 6 && issued.some((item) => !item.pending.resolution); turn += 1) await Promise.resolve();
      decisions.push(...this.acceptReadyDecisions(citizens));
    }
    return this.finishTick(citizens, decisions, events, options.copySnapshot ?? true);
  }

  private issueDecisionRequests(citizens: CitizenState[], excluded = new Set<number>()) {
    const issued: Array<NonNullable<ReturnType<MockSimulation["issueDecisionRequest"]>>> = [];
    const limit = this.providerControlsCommitments ? Math.max(1, this.coordinator.policy.maxInFlight ?? 4) : 1;
    while (this.pendingDecisions.size < limit) {
      const request = this.issueDecisionRequest(citizens, excluded);
      if (!request) break;
      issued.push(request);
    }
    return issued;
  }

  private issueDecisionRequest(citizens: CitizenState[], excluded = new Set<number>()) {
    if (this.pendingDecisions.size >= (this.coordinator.policy.maxInFlight ?? 4)) return undefined;
    const citizen = this.nextIdleCitizen(citizens, new Set([...this.pendingDecisions.keys(), ...excluded]), false);
    if (!citizen) return undefined;
    const availableStock = this.availableStock();
    const availableCitizen = this.availableCitizen(citizen);
    const availablePhysicalWorld = this.availablePhysicalWorld(citizen);
    const availableEconomy = this.availableEconomy();
    const context = {
      tick: this.snapshot.tick,
      stateVersion: this.snapshot.stateVersion,
      citizen: availableCitizen,
      citizens,
      stock: availableStock,
      constructionProgress: this.snapshot.constructionProgress,
      civilizationGoal: this.snapshot.civilizationGoal,
      economy: availableEconomy,
      politics: this.snapshot.politics,
      physicalWorld: availablePhysicalWorld,
      socialGroups: this.snapshot.socialGroups,
      socialPromises: this.snapshot.socialPromises,
      waterSources: this.snapshot.topology.locations.shore ?? [],
      buildSites: this.availableBuildSites(),
      roadPlans: this.availableRoadPlans(),
    };
    const candidates = this.withSpatialLegality(citizen, citizens, buildActionCandidates(context));
    const requestId = `request-${this.snapshot.tick}-${citizen.id}`;
    const freshness = {
      requestedAtTick: this.snapshot.tick,
      deadlineTick: this.snapshot.tick + DECISION_DEADLINE_TICKS,
      worldRevision: this.snapshot.worldRevision,
      npcRevision: citizen.revision,
      topologyRevision: this.snapshot.topology.topologyRevision,
      perceptionHash: stableHash({
        citizen,
        citizens: citizens.map((item) => item.id),
        stock: availableStock,
        constructionProgress: this.snapshot.constructionProgress,
        civilizationGoal: this.snapshot.civilizationGoal,
        ...(availableEconomy ? { economy: this.economyDecisionDigest(citizen.id, availableEconomy) } : {}),
        politics: this.politicsDecisionDigest(citizen.id),
        physicalWorld: availablePhysicalWorld,
      }),
      legalSetHash: stableHash(candidates.map(({ id, legal, blockedBy, intent }) => ({ id, legal, blockedBy, intent }))),
    };
    const perception = structuredClone({
      tick: context.tick,
      stateVersion: context.stateVersion,
      citizen: {
        id: citizen.id, revision: citizen.revision, name: citizen.name, job: citizen.job, traits: citizen.traits,
        goal: citizen.goal, needs: citizen.needs, happiness: citizen.happiness, inventory: citizen.inventory, toolDurability: citizen.toolDurability, position: citizen.position,
        relationships: citizen.relationships, memories: citizen.memories, currentActivity: citizen.currentActivity, skills: citizen.skills, commitment: citizen.commitment, mind: citizen.mind,
        personality: citizen.personality, physical: citizen.physical, emotions: citizen.emotions, values: citizen.values,
        socialRelationships: citizen.socialRelationships, knowledge: citizen.knowledge,
      },
      population: citizens.length,
      visibleCitizens: citizens.map(({ id, position }) => ({ id, position })),
      stock: availableStock,
      constructionProgress: context.constructionProgress,
      civilizationGoal: structuredClone(this.snapshot.civilizationGoal),
      politics: this.politicalPerception(citizen.id),
      ...(availableEconomy ? {
        economy: {
          wallet: availableEconomy.wallets[citizen.id] ?? 0,
          treasury: availableEconomy.treasury,
          policies: { ...availableEconomy.policies },
          ownedBusinessIds: Object.values(availableEconomy.businesses).filter((business) => business.ownerId === citizen.id).map((business) => business.id),
          activeOfferCount: Object.values(availableEconomy.offers).filter((offer) => offer.status === "open").length,
          offeredContractCount: Object.values(availableEconomy.contracts).filter((contract) => contract.status === "offered").length,
          productionRuns: availableEconomy.production.length,
          facilityObjectUids: Object.values(availableEconomy.businesses).filter((business) => business.ownerId === citizen.id || business.employeeIds.includes(citizen.id)).flatMap((business) => business.facilityObjectUids),
          blockers: Object.values(availableEconomy.businesses).filter((business) => business.ownerId === citizen.id).flatMap((business) => business.blockers),
        },
      } : {}),
      physicalWorld: {
        availableTrees: Object.values(availablePhysicalWorld.resources).filter((node) => node.kind === "tree" && node.status === "available").length,
        availableStone: Object.values(availablePhysicalWorld.resources).filter((node) => node.kind === "stone" && node.status === "available").length,
        harvestableCrops: Object.values(availablePhysicalWorld.resources).filter((node) => node.kind === "crop" && node.status === "available").length,
        activeProjects: Object.values(availablePhysicalWorld.projects).filter((project) => project.status !== "cancelled" && project.status !== "complete").map(({ id, buildingType, status, required, delivered, laborRequired, laborCompleted }) => ({ id, buildingType, status, required, delivered, laborRequired, laborCompleted })),
        carriedMaterials: Object.fromEntries(Object.entries(availableCitizen.inventory).filter(([resource]) => resource === "wood" || resource === "stone")),
        homeObjectUid: availableCitizen.homeObjectUid,
        homelessCitizens: citizens.filter((person) => !person.homeObjectUid).length,
        nearbyFireFuel: Object.values(availablePhysicalWorld.buildings)
          .filter((building) => building.buildingType === "campfire" && Math.abs(building.position.x - citizen.position.x) + Math.abs(building.position.y - citizen.position.y) <= 8)
          .reduce((sum, building) => sum + (building.fuel ?? 0), 0),
        knownResources: Object.values(availablePhysicalWorld.resources).map(({ id, kind, position, yield: nodeYield, status, growth, health }) => ({ id, kind, position, yield: nodeYield, status, growth, health })),
      },
    });
    const request = deepFreeze({ requestId, policyVersion: this.coordinator.policy.policyVersion, freshness, perception, candidates: structuredClone(candidates) });
    const pending: PendingDecision = { request, citizenId: citizen.id };
    this.pendingDecisions.set(citizen.id, pending);
    citizen.mind = {
      ...(citizen.mind ?? initialMindState()),
      mode: "deliberating",
      nextReviewAtTick: this.snapshot.tick,
    };
    const completion = this.coordinator.decide(request, () => this.requestIsFresh(pending)).then((resolution) => {
      if (this.pendingDecisions.get(citizen.id) === pending) pending.resolution = resolution;
    });
    pending.completion = completion;
    return { pending, completion };
  }

  private commitmentCandidate(citizen: CitizenState, citizens: CitizenState[]) {
    const commitment = citizen.commitment;
    if (!commitment || commitment.status !== "active") return undefined;
    const candidates = this.withSpatialLegality(citizen, citizens, buildActionCandidates({
      tick: this.snapshot.tick,
      stateVersion: this.snapshot.stateVersion,
      citizen: this.availableCitizen(citizen),
      citizens,
      stock: this.availableStock(),
      constructionProgress: this.snapshot.constructionProgress,
      civilizationGoal: this.snapshot.civilizationGoal,
      economy: this.availableEconomy(),
      politics: this.snapshot.politics,
      physicalWorld: this.availablePhysicalWorld(citizen),
      socialGroups: this.snapshot.socialGroups,
      socialPromises: this.snapshot.socialPromises,
      waterSources: this.snapshot.topology.locations.shore ?? [],
      buildSites: this.availableBuildSites(),
      roadPlans: this.availableRoadPlans(),
    }));
    const legal = candidates.filter((candidate) => candidate.legal && candidate.intent);
    const first = (...kinds: ActionIntent["kind"][]) => legal.find((candidate) => candidate.intent && kinds.includes(candidate.intent.kind));
    // Commitments are intentions, not suicide pacts. A critical bodily signal is
    // an explicit reconsideration boundary and temporarily pre-empts long plans.
    if ((citizen.needs.thirst ?? 0) >= 0.72) return first("drink_water", "drink_natural_water", "draw_water", "collect_water", "request_item");
    if (citizen.needs.hunger >= 0.72) return first("eat", "forage_wild_food", "catch_fish", "hunt_game", "request_item");
    if ((citizen.physical?.illness ?? 0) >= 0.35 || (citizen.physical?.injury ?? 0) >= 0.35) return first("use_medicine", "rest", "request_item");
    if (commitment.kind !== "construction" && citizen.needs.fatigue >= 0.82) return first("rest", "move_home");
    if (commitment.kind !== "construction" && (citizen.physical?.exposure ?? 0) >= 0.72) {
      const shelterAction = legal.find((candidate) => candidate.intent?.kind === "start_construction" && candidate.intent.buildingType === "shelter");
      return first("move_home", "fuel_campfire", "deliver_material", "work_construction", "gather_branches", "gather_fiber") ?? shelterAction ?? first("rest");
    }
    if (commitment.kind === "survival") {
      const objective = commitment.objective.toLowerCase();
      if (objective.includes("thirst")) return first("drink_water", "drink_natural_water", "draw_water", "collect_water")
        ?? legal.find((candidate) => candidate.intent?.kind === "craft_primitive" && candidate.intent.recipeId === "water-container")
        ?? first("gather_clay");
      if (objective.includes("hunger")) return first("eat", "forage_wild_food", "catch_fish", "hunt_game", "request_item");
      if (objective.includes("fatigue")) return first("rest", "move_home", "deliver_material", "work_construction", "start_construction");
      if (objective.includes("loneliness")) return first("socialize", "form_household");
      return first("use_medicine", "eat", "drink_water", "drink_natural_water", "fuel_campfire", "gather_branches", "rest", "forage_wild_food");
    }
    if (commitment.kind === "construction") {
      const targetId = commitment.targetId;
      const exact = legal.find((candidate) => {
        const intent = candidate.intent;
        return intent && "projectId" in intent && intent.projectId === targetId && ["deliver_material", "work_construction"].includes(intent.kind);
      });
      if (exact) return exact;
      const project = targetId ? this.snapshot.physicalWorld.projects[targetId] : undefined;
      const missing = project ? Object.entries(project.required).find(([resource, amount]) => (project.delivered[resource] ?? 0) < amount)?.[0] : undefined;
      if (missing === "branches") return first("gather_branches") ?? first("explore");
      if (missing === "fiber") return first("gather_fiber") ?? first("explore");
      if (missing === "wild_seed") return first("forage_wild_food") ?? first("explore");
      if (missing === "clay") return first("gather_clay") ?? first("explore");
      if (missing === "stone") return first("gather_loose_stone", "quarry_stone", "craft_stone_pick") ?? first("explore");
      if (missing === "wood") return first("fell_tree", "craft_hand_axe", "gather_branches") ?? first("explore");
      return first("work_construction", "deliver_material");
    }
    if (commitment.kind === "production" || commitment.kind === "enterprise") return first("operate_recipe", "transfer_good", "lease_facility", "work_job", "train_skill");
    if (commitment.kind === "learning") return first("train_skill");
    if (commitment.kind === "public-service") return first("deliver_material", "work_construction", "repair_structure");
    return undefined;
  }

  private continueCommitment(citizens: CitizenState[]) {
    const ordered = [...citizens.slice(this.snapshot.cursor), ...citizens.slice(0, this.snapshot.cursor)];
    for (const citizen of ordered) {
      if (citizen.currentActionId || this.pendingDecisions.has(citizen.id) || citizen.physical?.alive === false) continue;
      const selected = this.commitmentCandidate(citizen, citizens);
      if (!selected?.intent) continue;
      const candidates = this.withSpatialLegality(citizen, citizens, buildActionCandidates({
        tick: this.snapshot.tick,
        stateVersion: this.snapshot.stateVersion,
        citizen: this.availableCitizen(citizen),
        citizens,
        stock: this.availableStock(),
        constructionProgress: this.snapshot.constructionProgress,
        civilizationGoal: this.snapshot.civilizationGoal,
        economy: this.availableEconomy(),
        politics: this.snapshot.politics,
        physicalWorld: this.availablePhysicalWorld(citizen),
        socialGroups: this.snapshot.socialGroups,
        socialPromises: this.snapshot.socialPromises,
        waterSources: this.snapshot.topology.locations.shore ?? [],
        buildSites: this.availableBuildSites(),
        roadPlans: this.availableRoadPlans(),
      }));
      const movement = this.planMovement(citizen, selected.intent, citizens);
      const citizenIndex = citizens.findIndex((item) => item.id === citizen.id);
      if (citizenIndex >= 0) this.snapshot.cursor = (citizenIndex + 1) % citizens.length;
      const perceptionHash = stableHash({ citizen: this.availableCitizen(citizen), commitment: citizen.commitment, stock: this.availableStock(), physicalWorld: this.availablePhysicalWorld(citizen) });
      const freshness = {
        requestedAtTick: this.snapshot.tick,
        deadlineTick: this.snapshot.tick,
        worldRevision: this.snapshot.worldRevision,
        npcRevision: citizen.revision,
        topologyRevision: this.snapshot.topology.topologyRevision,
        perceptionHash,
        legalSetHash: stableHash(candidates.map(({ id, legal, blockedBy, intent }) => ({ id, legal, blockedBy, intent }))),
      };
      const decision = this.beginDecision(citizen, {
        tick: this.snapshot.tick,
        stateVersion: this.snapshot.stateVersion,
        citizenId: citizen.id,
        citizenName: citizen.name,
        provider: { kind: "mock", id: "commitment-engine", label: "Deterministic commitment executor", version: "1" },
        policyVersion: "commitment-execution-v1",
        freshness,
        resolution: "accepted",
        resolutionReason: "engine-continued-committed-strategy",
        context: {
          job: citizen.job,
          traits: [...citizen.traits],
          needs: { ...citizen.needs },
          worldStock: this.availableStock(),
          societyGoalId: this.snapshot.civilizationGoal.id,
          goalStage: this.snapshot.civilizationGoal.stage,
          wallet: this.snapshot.economy.wallets[citizen.id] ?? 0,
          economicPolicies: { ...this.snapshot.economy.policies },
          activeProposalId: this.snapshot.politics.activeProposalId,
          politicalLegitimacy: this.snapshot.politics.citizens[citizen.id]?.legitimacy,
          politicalGrievance: this.snapshot.politics.citizens[citizen.id]?.grievance,
        },
        candidates: candidates.map((candidate) => ({ ...candidate, score: null, trace: [] })),
        selected: selected.intent.kind,
        selectedCandidateId: selected.id,
        selectedIntent: structuredClone(selected.intent),
        selectedLabel: selected.label,
        target: movement.target,
        targetMode: movement.targetMode,
        interactionRadius: movement.interactionRadius,
        route: movement.route,
        targetCitizenId: movement.targetCitizenId,
      }, undefined, movement);
      if (!movement.reachable && decision.actionInstanceId) this.cancelAction(decision.actionInstanceId, movement.blockedReason ?? "The intended destination cannot be reached.");
      return decision;
    }
    return undefined;
  }

  private requestIsFresh(pending: PendingDecision) {
    const freshness = pending.request.freshness;
    return this.snapshot.citizens[pending.citizenId]?.revision === freshness.npcRevision
      && !this.snapshot.citizens[pending.citizenId]?.currentActionId
      && this.snapshot.topology.topologyRevision === freshness.topologyRevision;
  }

  private acceptReadyDecisions(citizens: CitizenState[]) {
    const decisions: DecisionRecord[] = [];
    const ready = [...this.pendingDecisions.values()]
      .sort((a, b) => a.request.freshness.requestedAtTick - b.request.freshness.requestedAtTick || a.citizenId - b.citizenId);
    for (const pending of ready) {
      if (!pending.resolution) continue;
      this.pendingDecisions.delete(pending.citizenId);
      const resolution = pending.resolution;
      if (!resolution || resolution.status === "discarded" || !this.requestIsFresh(pending)) {
        const citizen = this.snapshot.citizens[pending.citizenId];
        if (citizen && !citizen.currentActionId) {
          citizen.mind ??= initialMindState();
          citizen.mind.mode = citizen.mind.interruptReason ? "interrupted" : "idle";
        }
        continue;
      }
      const decision = this.applyResolution(pending, resolution, citizens);
      if (decision) decisions.push(decision);
    }
    return decisions;
  }

  private async expireOverdueDecision(citizens: CitizenState[]) {
    const overdue = [...this.pendingDecisions.values()]
      .filter((pending) => this.snapshot.tick >= pending.request.freshness.deadlineTick)
      .sort((a, b) => a.request.freshness.deadlineTick - b.request.freshness.deadlineTick || a.citizenId - b.citizenId)[0];
    if (!overdue) return undefined;
    this.pendingDecisions.delete(overdue.citizenId);
    this.coordinator.cancel(overdue.request.requestId, "Simulation tick deadline exceeded");
    if (!this.requestIsFresh(overdue)) return undefined;
    const resolution = await this.coordinator.forceFallback(overdue.request, "simulation-deadline", () => this.requestIsFresh(overdue));
    if (resolution.status === "discarded") return undefined;
    return this.applyResolution(overdue, resolution, citizens);
  }

  private applyResolution(pending: PendingDecision, resolution: Exclude<DecisionResolution, { status: "discarded" }>, citizens: CitizenState[]) {
    const citizen = this.snapshot.citizens[pending.citizenId];
    if (!citizen || citizen.currentActionId) return undefined;
    const currentCandidates = this.withSpatialLegality(citizen, citizens, buildActionCandidates({
      tick: this.snapshot.tick,
      stateVersion: this.snapshot.stateVersion,
      citizen: this.availableCitizen(citizen),
      citizens,
      stock: this.availableStock(),
      constructionProgress: this.snapshot.constructionProgress,
      civilizationGoal: this.snapshot.civilizationGoal,
      economy: this.availableEconomy(),
      politics: this.snapshot.politics,
      physicalWorld: this.availablePhysicalWorld(citizen),
      socialGroups: this.snapshot.socialGroups,
      socialPromises: this.snapshot.socialPromises,
      waterSources: this.snapshot.topology.locations.shore ?? [],
      buildSites: this.availableBuildSites(),
      roadPlans: this.availableRoadPlans(),
    }));
    const current = currentCandidates.find((candidate) => candidate.id === resolution.decision.selectedCandidateId);
    if (!current?.legal) return undefined;
    const { request } = pending;
    const candidates = request.candidates;
    const evaluated = resolution.decision.signals?.evaluations ?? [];
    const decisionCandidates: ActionCandidate[] = candidates.map((candidate) => {
      const evaluation = evaluated.find((item) => item.candidateId === candidate.id);
      return { ...candidate, score: evaluation?.score ?? null, trace: evaluation?.trace ? [...evaluation.trace] : [] };
    });
    const selected = decisionCandidates.find((candidate) => candidate.id === resolution.decision.selectedCandidateId);
    if (!selected?.legal) throw new Error("Coordinator accepted a missing or illegal candidate.");
    const selectedIntent = selected.intent ?? defaultIntent(selected.id as ActionId);
    const movement = this.planMovement(citizen, selectedIntent, citizens);
    const citizenIndex = citizens.findIndex((item) => item.id === citizen.id);
    if (citizenIndex >= 0) this.snapshot.cursor = (citizenIndex + 1) % citizens.length;
    const persistedSignals = resolution.decision.signals?.kind === "heuristic"
      ? { kind: "heuristic" as const, evaluations: [] }
      : resolution.decision.signals;
    const decisionBase = {
      tick: this.snapshot.tick,
      stateVersion: this.snapshot.stateVersion,
      citizenId: citizen.id,
      citizenName: citizen.name,
      provider: resolution.decision.provider,
      policyVersion: request.policyVersion,
      freshness: request.freshness,
      resolution: resolution.status,
      ...(resolution.reason ? { resolutionReason: resolution.reason } : {}),
      ...(persistedSignals ? { providerSignals: persistedSignals } : {}),
      ...(resolution.decision.provider.kind === "mock" ? {} : { latencyMs: resolution.latencyMs }),
      context: {
        job: request.perception.citizen.job,
        traits: [...request.perception.citizen.traits],
        needs: { ...request.perception.citizen.needs },
        worldStock: { ...request.perception.stock },
        societyGoalId: request.perception.civilizationGoal?.id,
        goalStage: request.perception.civilizationGoal?.stage,
        wallet: request.perception.economy?.wallet,
        economicPolicies: request.perception.economy ? { ...request.perception.economy.policies } : undefined,
        activeProposalId: request.perception.politics?.activeProposal?.id,
        politicalLegitimacy: request.perception.politics?.legitimacy,
        politicalGrievance: request.perception.politics?.grievance,
      },
      candidates: decisionCandidates,
      selected: selectedIntent.kind,
      selectedCandidateId: selected.id,
      selectedIntent,
      selectedLabel: selected.label,
      target: movement.target,
      targetMode: movement.targetMode,
      interactionRadius: movement.interactionRadius,
      route: movement.route,
      targetCitizenId: movement.targetCitizenId,
    };
    const decision = this.beginDecision(citizen, decisionBase, undefined, movement);
    if (!movement.reachable && decision.actionInstanceId) this.cancelAction(decision.actionInstanceId, movement.blockedReason ?? "The intended destination cannot be reached.");
    return decision;
  }

  replayTick(recorded: DecisionRecord | readonly DecisionRecord[] | undefined, day = 1): SimulationStepResult | null {
    const prepared = this.prepareTick(day);
    if (!prepared) return null;
    const { citizens, events } = prepared;
    const records = recorded ? Array.isArray(recorded) ? recorded : [recorded] : [];
    const decisions = records.map((item) => this.applyReplayDecision(item, citizens));
    return this.finishTick(citizens, decisions, events);
  }

  replayStep(recorded: DecisionRecord, day = 1): SimulationStepResult | null {
    while (this.snapshot.tick + 1 < recorded.tick) this.replayTick(undefined, day);
    if (this.snapshot.tick === recorded.tick) {
      const citizens = Object.values(this.snapshot.citizens).sort((a, b) => a.id - b.id);
      const decision = this.applyReplayDecision(recorded, citizens);
      return this.finishTick(citizens, [decision], []);
    }
    return this.replayTick(recorded, day);
  }

  private applyReplayDecision(recorded: DecisionRecord, citizens: CitizenState[]) {
    // External/local-brain responses can resolve in a different order than
    // the scheduler. The accepted log is authoritative during replay.
    const citizen = this.snapshot.citizens[recorded.citizenId];
    if (!citizen || citizen.physical?.alive === false || citizen.currentActionId || recorded.tick !== this.snapshot.tick || recorded.stateVersion !== this.snapshot.stateVersion) throw new Error(`Replay divergence before ${recorded.id}.`);
    const citizenIndex = citizens.findIndex((item) => item.id === citizen.id);
    if (citizenIndex >= 0) this.snapshot.cursor = (citizenIndex + 1) % citizens.length;
    this.replayExpected.set(recorded.id, structuredClone(recorded));
    const decision = this.beginDecision(citizen, {
      tick: recorded.tick,
      stateVersion: recorded.stateVersion,
      citizenId: recorded.citizenId,
      citizenName: recorded.citizenName,
      provider: recorded.provider,
      policyVersion: recorded.policyVersion,
      freshness: structuredClone(recorded.freshness),
      resolution: recorded.resolution,
      ...(recorded.resolutionReason ? { resolutionReason: recorded.resolutionReason } : {}),
      ...(recorded.providerSignals ? { providerSignals: structuredClone(recorded.providerSignals) } : {}),
      ...(recorded.latencyMs !== undefined ? { latencyMs: recorded.latencyMs } : {}),
      context: structuredClone(recorded.context),
      candidates: structuredClone(recorded.candidates),
      selected: recorded.selected,
      selectedCandidateId: recorded.selectedCandidateId ?? recorded.selected,
      selectedIntent: structuredClone(recorded.selectedIntent ?? defaultIntent(recorded.selected)),
      selectedLabel: recorded.selectedLabel,
      ...(recorded.target ? { target: structuredClone(recorded.target) } : {}),
      targetMode: recorded.targetMode,
      interactionRadius: recorded.interactionRadius,
      route: structuredClone(recorded.route),
      targetCitizenId: recorded.targetCitizenId,
    }, recorded.id, {
      targetMode: recorded.targetMode ?? inferredTargetMode(recorded.selectedIntent, recorded.targetCitizenId, recorded.route.length),
      interactionRadius: recorded.interactionRadius ?? (recorded.targetCitizenId !== undefined ? 1 : 0),
    });
    if (recorded.actionStatus === "cancelled" && recorded.completedAtTick === this.snapshot.tick && decision.actionInstanceId) {
      this.cancelAction(decision.actionInstanceId, recorded.consequences[0] ?? "The intended destination cannot be reached.");
      Object.assign(decision, structuredClone(recorded));
      this.replayExpected.delete(recorded.id);
    }
    return decision;
  }

  private prepareTick(day: number) {
    const citizens = Object.values(this.snapshot.citizens).sort((a, b) => a.id - b.id);
    if (!citizens.length) return null;
    this.snapshot.tick += 1;
    this.snapshot.stateVersion += 1;
    const survivalEvents: SimulationEvent[] = [];
    for (const citizen of citizens) {
      if (citizen.physical?.alive === false) continue;
      this.updateLocalKnowledge(citizen, citizens);
      // One villager acts per decision cycle and movement can take several ticks.
      // These rates are calibrated to that cadence so a person can stabilize needs
      // and still exercise social, civic, economic, and long-term agency.
      citizen.needs.hunger = clamp01(citizen.needs.hunger + 0.009 / LEGACY_TICK_RATIO);
      citizen.needs.fatigue = clamp01(citizen.needs.fatigue + (citizen.homeObjectUid ? 0.003 : 0.005) / LEGACY_TICK_RATIO);
      citizen.needs.loneliness = clamp01(citizen.needs.loneliness + 0.004 / LEGACY_TICK_RATIO);
      citizen.needs.thirst = clamp01((citizen.needs.thirst ?? 0.2) + 0.008 / LEGACY_TICK_RATIO);
      citizen.happiness = clamp01(0.84 - citizen.needs.hunger * 0.22 - citizen.needs.fatigue * 0.18 - citizen.needs.loneliness * 0.14 - citizen.needs.thirst * 0.2);
      citizen.memories = citizen.memories
        .filter((memory) => memory.expiresAtTick === undefined || memory.expiresAtTick > this.snapshot.tick)
        .map((memory) => ({ ...memory, salience: memory.salience === undefined ? undefined : clamp01(memory.salience - 0.0008 / LEGACY_TICK_RATIO) }))
        .filter((memory) => memory.salience === undefined || memory.salience > 0.03);
      const environment = this.snapshot.topology.environment;
      if (environment && citizen.physical && citizen.emotions) {
        const home = citizen.homeObjectUid ? this.snapshot.physicalWorld.buildings[String(citizen.homeObjectUid)] : undefined;
        const sheltered = Boolean(home && home.condition >= 0.15);
        const warm = Object.values(this.snapshot.physicalWorld.buildings).some((building) => building.buildingType === "campfire" && building.condition >= 0.15 && (building.fuel ?? 0) > 0 && Math.abs(building.position.x - citizen.position.x) + Math.abs(building.position.y - citizen.position.y) <= 6);
        const harshness = environment.harshness === "gentle" ? 0.002 : environment.harshness === "harsh" ? 0.007 : 0.004;
        const clothed = (citizen.inventory.simple_clothing ?? 0) > 0;
        citizen.physical.exposure = clamp01(citizen.physical.exposure + (sheltered ? -0.014 : warm ? -0.006 : harshness * (1.35 - citizen.physical.temperatureTolerance) * (clothed ? 0.58 : 1)) / LEGACY_TICK_RATIO);
        citizen.physical.illness = clamp01(citizen.physical.illness + (citizen.physical.exposure > 0.72 ? 0.003 : -0.002) / LEGACY_TICK_RATIO);
        const deprivation = ((citizen.needs.hunger > 0.94 ? 0.006 : 0) + ((citizen.needs.thirst ?? 0) > 0.94 ? 0.009 : 0) + (citizen.physical.exposure > 0.88 ? 0.006 : 0) + citizen.physical.illness * 0.002) / LEGACY_TICK_RATIO;
        citizen.physical.health = clamp01(citizen.physical.health - deprivation + (deprivation === 0 && sheltered ? 0.001 / LEGACY_TICK_RATIO : 0));
        citizen.emotions.safety = clamp01(citizen.emotions.safety + (sheltered || warm ? 0.006 : -0.003) / LEGACY_TICK_RATIO);
        citizen.emotions.stress = clamp01(citizen.emotions.stress + deprivation * 2 + (citizen.physical.exposure * 0.001 - citizen.emotions.safety * 0.001) / LEGACY_TICK_RATIO);
        citizen.emotions.fear = clamp01(citizen.emotions.fear + deprivation - (sheltered ? 0.002 / LEGACY_TICK_RATIO : 0));
        if (this.snapshot.tick % legacyDurationTicks(120) === citizen.id % legacyDurationTicks(120)) {
          const index = citizen.position.y * this.snapshot.topology.width + citizen.position.x;
          const hazard = environment.hazard[index] ?? 0;
          if ((Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id)) % 10_000) / 10_000 < hazard * 0.025 * (1.2 - citizen.physical.movementAbility)) {
            citizen.physical.injury = clamp01(citizen.physical.injury + 0.12 + hazard * 0.2);
            citizen.physical.health = clamp01(citizen.physical.health - 0.04 - hazard * 0.05);
            survivalEvents.push({ id: `event-injury-${this.snapshot.tick}-${citizen.id}`, tick: this.snapshot.tick, day, category: "world", title: `${citizen.name} is injured`, detail: "Difficult terrain and exposure caused a physical injury.", citizenIds: [citizen.id] });
          }
        }
        if (citizen.physical.incapacitatedSinceTick !== undefined) citizen.needs.fatigue = clamp01(citizen.needs.fatigue - 0.012 / LEGACY_TICK_RATIO);
        const collapsed = citizen.physical.health <= 0.18 || citizen.needs.fatigue >= 0.98 || citizen.physical.injury >= 0.82;
        if (collapsed && citizen.physical.incapacitatedSinceTick === undefined && citizen.physical.health > 0) {
          citizen.physical.incapacitatedSinceTick = this.snapshot.tick;
          citizen.currentActivity = "Collapsed and awaiting recovery or help";
          survivalEvents.push({ id: `event-collapse-${this.snapshot.tick}-${citizen.id}`, tick: this.snapshot.tick, day, category: "world", title: `${citizen.name} collapses`, detail: "Critical health, exhaustion, or injury left them unable to choose ordinary work. Another person may rescue them, or they may be abandoned.", citizenIds: [citizen.id] });
        } else if (citizen.physical.incapacitatedSinceTick !== undefined && citizen.physical.health >= 0.28 && citizen.needs.fatigue < 0.88 && citizen.physical.injury < 0.7) {
          delete citizen.physical.incapacitatedSinceTick;
          citizen.currentActivity = "Recovering after collapse";
          survivalEvents.push({ id: `event-recover-${this.snapshot.tick}-${citizen.id}`, tick: this.snapshot.tick, day, category: "world", title: `${citizen.name} can move again`, detail: "Rest or another person's intervention lifted the immediate incapacitation.", citizenIds: [citizen.id] });
        }
        if (citizen.physical.health <= 0 && citizen.physical.alive) {
          citizen.physical.alive = false;
          delete citizen.physical.incapacitatedSinceTick;
          citizen.currentActivity = "Dead";
          if (citizen.currentActionId) { this.release(citizen.currentActionId); delete this.snapshot.activeActions[citizen.currentActionId]; delete citizen.currentActionId; }
          for (const groupId of citizen.groupIds ?? []) {
            const group = this.snapshot.socialGroups[groupId];
            if (!group) continue;
            group.memberIds = group.memberIds.filter((id) => id !== citizen.id);
            if (group.leaderId === citizen.id) delete group.leaderId;
            if (group.memberIds.length < 2) {
              const remaining = group.memberIds[0] ? this.snapshot.citizens[group.memberIds[0]] : undefined;
              const destination = remaining?.inventory ?? this.snapshot.stock;
              for (const [resource, amount] of Object.entries(group.sharedInventory)) destination[resource] = (destination[resource] ?? 0) + amount;
              if (remaining) remaining.groupIds = (remaining.groupIds ?? []).filter((id) => id !== group.id);
              delete this.snapshot.socialGroups[group.id];
            }
          }
          citizen.groupIds = [];
          for (const [nodeId, claim] of Object.entries(this.snapshot.physicalWorld.claims)) if (claim.ownerId === citizen.id) delete this.snapshot.physicalWorld.claims[nodeId];
          for (const survivor of citizens) if (survivor.id !== citizen.id && survivor.physical?.alive !== false && (survivor.knowledge?.knownPeople.includes(citizen.id) || Math.abs(survivor.position.x - citizen.position.x) + Math.abs(survivor.position.y - citizen.position.y) <= 7)) {
            addMemory(survivor, { id: `memory-death-${this.snapshot.tick}-${survivor.id}-${citizen.id}`, tick: this.snapshot.tick, text: `${citizen.name} died after their body failed under wilderness pressure.`, tone: "negative", subjectCitizenId: citizen.id, salience: 1 });
            if (survivor.emotions) {
              survivor.emotions.stress = clamp01(survivor.emotions.stress + 0.16);
              survivor.emotions.hope = clamp01(survivor.emotions.hope - 0.12);
            }
          }
          survivalEvents.push({ id: `event-death-${this.snapshot.tick}-${citizen.id}`, tick: this.snapshot.tick, day, category: "world", title: `${citizen.name} dies`, detail: "Their health reached zero after accumulated deprivation, exposure, illness, or injury.", citizenIds: [citizen.id] });
        }
      }
    }
    const interruptionEvents = this.interruptUnsafeActions(citizens, day);
    const socialEvents = advanceSocialWorld(this.snapshot.socialPromises, this.snapshot.citizens, this.snapshot.tick, day);
    const voteEvents = resolveReadyVotes({ politics: this.snapshot.politics, economy: this.snapshot.economy, stock: this.snapshot.stock, citizens, tick: this.snapshot.tick }, day);
    const politicalEvents = [...voteEvents, ...advancePolitics(this.snapshot.politics, this.snapshot.tick, day)];
    const physicalEvents = this.advancePhysicalWorld(day);
    refreshBusinessBlockers(this.snapshot.economy, this.snapshot.physicalWorld);
    refreshCitizenCommitments(citizens, this.snapshot.economy, this.snapshot.physicalWorld, this.snapshot.tick);
    if (survivalEvents.length || interruptionEvents.length || socialEvents.length || politicalEvents.length || physicalEvents.length) this.snapshot.events = [...survivalEvents, ...interruptionEvents, ...socialEvents, ...physicalEvents, ...politicalEvents, ...this.snapshot.events].slice(0, 5_000);
    return { citizens, events: [...this.expireOffers(day), ...survivalEvents, ...interruptionEvents, ...socialEvents, ...physicalEvents, ...politicalEvents, ...this.advanceActions(citizens, day)] };
  }

  private interruptUnsafeActions(citizens: CitizenState[], day: number) {
    const events: SimulationEvent[] = [];
    for (const citizen of citizens) {
      if (!citizen.currentActionId) continue;
      const action = this.snapshot.activeActions[citizen.currentActionId];
      if (!action) continue;
      const reason = activeActionInterruptReason(this.snapshot, citizen, action);
      if (!reason) continue;
      const event = this.cancelAction(action.id, reason);
      event.day = day;
      events.push(event);
    }
    return events;
  }

  private advancePhysicalWorld(day: number) {
    const events: SimulationEvent[] = [];
    const physical = this.snapshot.physicalWorld;
    for (const stock of Object.values(physical.renewableStocks)) stock.amount = Math.min(stock.capacity, stock.amount + stock.regenerationPerTick / LEGACY_TICK_RATIO);
    for (const building of Object.values(physical.buildings)) if (building.buildingType === "campfire" && (building.fuel ?? 0) > 0) building.fuel = Math.max(0, (building.fuel ?? 0) - 1 / LEGACY_TICK_RATIO);
    for (const proposal of Object.values(this.snapshot.politics.proposals).sort((left, right) => left.id.localeCompare(right.id))) {
      if (proposal.status !== "adopted" || !proposal.projectPlan || physical.mandates[proposal.id]) continue;
      physical.mandates[proposal.id] = {
        id: proposal.id,
        proposalId: proposal.id,
        plan: structuredClone(proposal.projectPlan),
        status: "authorized",
        authorizedAtTick: proposal.resolvedAtTick ?? this.snapshot.tick,
        expiresAtTick: (proposal.resolvedAtTick ?? this.snapshot.tick) + legacyDurationTicks(240),
      };
      events.push({ id: `event-mandate-${proposal.id}`, tick: this.snapshot.tick, day, category: "civic", title: `${proposal.projectPlan.label} receives a public mandate`, detail: "The exact approved plan may now reserve treasury funds and begin.", citizenIds: [...proposal.eligibleVoterIds] });
    }
    for (const mandate of Object.values(physical.mandates)) if (mandate.status === "authorized" && mandate.expiresAtTick < this.snapshot.tick) mandate.status = "expired";

    for (const offer of Object.values(this.snapshot.economy.offers)) {
      if (offer.status !== "open" || !offer.foodLot || offer.foodLot.expiresAtTick > this.snapshot.tick) continue;
      const spoiled = offer.amountRemaining;
      offer.amountRemaining = 0;
      offer.status = "expired";
      physical.waste += spoiled;
      if (spoiled > 0) events.push({ id: `event-spoil-offer-${offer.id}`, tick: this.snapshot.tick, day, category: "world", title: `${spoiled} ${offer.resource} spoils in market escrow`, detail: "Food keeps its original freshness date while listed for sale.", citizenIds: [offer.sellerId] });
    }

    for (const lot of Object.values(physical.foodLots).sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id))) {
      if (lot.expiresAtTick > this.snapshot.tick) continue;
      const inventory = lot.owner.kind === "stock" ? this.snapshot.stock
        : lot.owner.kind === "citizen" ? this.snapshot.citizens[lot.owner.id]?.inventory
          : this.snapshot.economy.businesses[lot.owner.id]?.inventory;
      const spoiled = inventory ? Math.min(lot.amount, inventory[lot.resource] ?? 0) : 0;
      if (inventory) inventory[lot.resource] = Math.max(0, (inventory[lot.resource] ?? 0) - spoiled);
      physical.waste += spoiled;
      delete physical.foodLots[lot.id];
      if (spoiled > 0) events.push({ id: `event-spoil-${lot.id}`, tick: this.snapshot.tick, day, category: "world", title: `${spoiled} ${lot.resource} spoils`, detail: lot.storageBuildingUid ? "Even stored food eventually exceeded its safe lifetime." : "Unstored food spoiled before anyone used it.", citizenIds: lot.owner.kind === "citizen" ? [lot.owner.id] : [] });
    }

    const growingCrops = Object.values(physical.resources)
      .filter((item) => item.kind === "crop" && item.cropStage !== "ripe" && item.cropStage !== "fallow" && item.cropStage !== "withered")
      .sort((a, b) => a.objectUid - b.objectUid);
    const environment = this.snapshot.topology.environment;
    const rainCycle = this.snapshot.tick > 0 && this.snapshot.tick % legacyDurationTicks(36) === 0;
    const rainChance = environment?.harshness === "gentle" ? 0.82 : environment?.harshness === "harsh" ? 0.38 : 0.62;
    const rainRoll = (Math.abs(hashSeed(this.snapshot.seed, Math.floor(this.snapshot.tick / 36), 401)) % 10_000) / 10_000;
    const raining = rainCycle && rainRoll < rainChance;
    if (raining && growingCrops.length) {
      for (const node of growingCrops) {
        const index = node.position.y * this.snapshot.topology.width + node.position.x;
        const localMoisture = environment?.moisture[index] ?? 0.5;
        node.moisture = clamp01((node.moisture ?? 0.4) + 0.22 + localMoisture * 0.22);
      }
      events.push({ id: `event-rain-${this.snapshot.tick}`, tick: this.snapshot.tick, day, category: "world", title: "Rain reaches the cultivated plots", detail: `Deterministic weather restored moisture to ${growingCrops.length} growing crop${growingCrops.length === 1 ? "" : "s"}; no carried water was created.`, citizenIds: [] });
    }

    for (const node of growingCrops) {
      node.moisture = clamp01((node.moisture ?? 0.6) - 0.004 / LEGACY_TICK_RATIO);
      if (node.moisture < 0.16) node.health = clamp01((node.health ?? 1) - 0.012 / LEGACY_TICK_RATIO);
      // Early food crops mature in roughly two in-game weeks under survivable
      // conditions. Tending still matters: dry, damaged plots slow sharply and
      // can wither, while a tended plot can complete inside the 30-day slice.
      const growthRate = 0.008 / LEGACY_TICK_RATIO * (0.5 + (node.moisture ?? 0) * 0.5) * (node.health ?? 1);
      node.growth = clamp01((node.growth ?? 0) + growthRate);
      node.cropStage = (node.growth ?? 0) >= 0.08 ? "growing" : "sown";
      if ((node.health ?? 0) <= 0.05) {
        node.cropStage = "withered";
        node.status = "depleted";
        delete node.regrowAtTick;
        events.push({ id: `event-wither-${this.snapshot.tick}-${node.objectUid}`, tick: this.snapshot.tick, day, category: "world", title: `${node.cropType ?? "crop"} plot #${node.objectUid} withers`, detail: "The crop ran dry or went untended and must be cleared and sown again.", citizenIds: [] });
      } else if ((node.growth ?? 0) >= 1) {
        node.cropStage = "ripe";
        node.status = "available";
        delete node.depletedAtTick;
        delete node.regrowAtTick;
        events.push({ id: `event-ripen-${this.snapshot.tick}-${node.objectUid}`, tick: this.snapshot.tick, day, category: "world", title: `${node.cropType ?? "crop"} plot #${node.objectUid} ripens`, detail: "The tended crop completed its deterministic growth cycle.", citizenIds: [] });
      }
    }

    if (this.snapshot.tick % legacyDurationTicks(120) === 0) {
      for (const building of Object.values(physical.buildings)) {
        const decay = building.buildingType === "well" ? 0.025 : 0.015;
        building.condition = clamp01(building.condition - decay);
        if (building.condition < 0.4 && building.damagedAtTick === undefined) building.damagedAtTick = this.snapshot.tick;
        if (building.buildingType === "cottage" && building.condition < 0.15) {
          for (const residentId of [...building.residentIds]) {
            const resident = this.snapshot.citizens[residentId];
            if (resident) delete resident.homeObjectUid;
          }
          building.residentIds = [];
        }
      }
      for (const road of Object.values(physical.roads)) {
        road.condition = clamp01(road.condition - 0.02);
        const index = road.position.y * this.snapshot.topology.width + road.position.x;
        this.snapshot.topology.moveCost[index] = road.condition < 0.15 ? 1_000 : road.condition < 0.4 ? 750 : 450;
      }
    }
    const occupied = new Set<string>();
    for (const project of Object.values(this.snapshot.physicalWorld.projects)) {
      if (project.status === "cancelled" || project.demolishedAtTick !== undefined) continue;
      for (let dy = 0; dy < project.footprint.height; dy += 1) for (let dx = 0; dx < project.footprint.width; dx += 1) occupied.add(`${project.position.x + dx},${project.position.y + dy}`);
    }
    for (const node of Object.values(this.snapshot.physicalWorld.resources).sort((a, b) => a.objectUid - b.objectUid)) {
      if (node.kind === "crop") continue;
      if (node.status !== "depleted" || node.regrowAtTick === undefined || node.regrowAtTick > this.snapshot.tick) continue;
      if (occupied.has(`${node.position.x},${node.position.y}`)) {
        node.regrowAtTick += legacyDurationTicks(720);
        continue;
      }
      node.status = "available";
      delete node.depletedAtTick;
      delete node.regrowAtTick;
      if (node.kind === "tree") {
        const index = node.position.y * this.snapshot.topology.width + node.position.x;
        this.snapshot.topology.walkable[index] = 0;
        this.snapshot.topology.topologyRevision += 1;
      }
      this.snapshot.worldRevision += 1;
      events.push({
        id: `event-regrow-${this.snapshot.tick}-${node.objectUid}`,
        tick: this.snapshot.tick,
        day,
        category: "world",
        title: `${node.assetId} #${node.objectUid} regrows`,
        detail: "A depleted stump returned as a harvestable tree.",
        citizenIds: [],
      });
    }
    return events;
  }

  private expireOffers(day: number) {
    const events: SimulationEvent[] = [];
    for (const offer of Object.values(this.snapshot.economy.offers).sort((left, right) => left.id.localeCompare(right.id))) {
      if (offer.status !== "open" || offer.expiresAtTick > this.snapshot.tick) continue;
      offer.status = "expired";
      const inventory = offer.sourceOwnerType === "business"
        ? this.snapshot.economy.businesses[offer.sourceOwnerId]?.inventory
        : this.snapshot.citizens[Number(offer.sourceOwnerId)]?.inventory;
      if (inventory && offer.amountRemaining > 0) inventory[offer.resource] = (inventory[offer.resource] ?? 0) + offer.amountRemaining;
      if (offer.foodLot && offer.amountRemaining > 0 && offer.foodLot.expiresAtTick > this.snapshot.tick && ["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"].includes(offer.resource)) {
        const id = `food:${this.snapshot.tick}:returned:${offer.id}`;
        const owner = offer.sourceOwnerType === "business" ? { kind: "business" as const, id: offer.sourceOwnerId } : { kind: "citizen" as const, id: Number(offer.sourceOwnerId) };
        this.snapshot.physicalWorld.foodLots[id] = { id, resource: offer.resource as "berries" | "meat" | "cooked_meal" | "wheat" | "fish" | "bread" | "cabbage" | "pumpkin", amount: offer.amountRemaining, owner, producedAtTick: offer.foodLot.producedAtTick, expiresAtTick: offer.foodLot.expiresAtTick, ...(offer.foodLot.storageBuildingUid ? { storageBuildingUid: offer.foodLot.storageBuildingUid } : {}) };
      }
      const seller = this.snapshot.citizens[offer.sellerId];
      events.push({
        id: `event-offer-expired-${this.snapshot.tick}-${offer.id}`,
        tick: this.snapshot.tick,
        day,
        category: "economic",
        title: `${seller?.name ?? "A seller"}'s market offer expires`,
        detail: `${offer.amountRemaining} ${offer.resource} returned from market escrow.`,
        citizenIds: [offer.sellerId],
      });
    }
    for (const contract of Object.values(this.snapshot.economy.contracts).sort((left, right) => left.id.localeCompare(right.id))) {
      if (contract.status !== "offered" || contract.expiresAtTick > this.snapshot.tick) continue;
      contract.status = "cancelled";
      const business = this.snapshot.economy.businesses[contract.businessId];
      if (business) business.capital += contract.escrowedWage;
      contract.escrowedWage = 0;
      events.push({
        id: `event-contract-expired-${this.snapshot.tick}-${contract.id}`,
        tick: this.snapshot.tick,
        day,
        category: "economic",
        title: "A job offer expires",
        detail: `The ${contract.wage}-shell wage returned to ${business?.name ?? "the business"}.`,
        citizenIds: [contract.employerId, contract.workerId],
      });
    }
    if (events.length) this.snapshot.events = [...events, ...this.snapshot.events].slice(0, 5_000);
    return events;
  }

  private nextIdleCitizen(citizens: CitizenState[], excluded = new Set<number>(), advanceCursor = true) {
    for (let offset = 0; offset < citizens.length; offset += 1) {
      const index = (this.snapshot.cursor + offset) % citizens.length;
      const citizen = citizens[index];
      if (citizen.physical?.alive === false || citizen.physical?.incapacitatedSinceTick !== undefined || citizen.currentActionId || excluded.has(citizen.id)) continue;
      if (advanceCursor) this.snapshot.cursor = (index + 1) % citizens.length;
      return citizen;
    }
    return undefined;
  }

  private beginDecision(
    citizen: CitizenState,
    decisionBase: Omit<DecisionRecord, "id" | "consequences" | "resourceDelta" | "activity" | "actionInstanceId" | "actionStatus" | "completedAtTick">,
    decisionId = `decision-${this.snapshot.tick}-${citizen.id}`,
    movement?: Pick<PlannedMovement, "targetMode" | "interactionRadius">,
  ) {
    const actionInstanceId = `action-${decisionId}`;
    const claims = this.resourceClaims(decisionBase.selected, decisionBase.selectedIntent, citizen.id, decisionBase.context.worldStock);
    const route = decisionBase.route.map((point) => ({ ...point }));
    const workTicks = this.actionDuration(decisionBase.selected);
    const instance = {
      id: actionInstanceId,
      decisionId,
      citizenId: citizen.id,
      actionId: decisionBase.selected,
      intent: structuredClone(decisionBase.selectedIntent ?? defaultIntent(decisionBase.selected)),
      phase: route.length ? "moving" as const : "performing" as const,
      startedAtTick: this.snapshot.tick,
      target: decisionBase.target ? { ...decisionBase.target } : { ...citizen.position },
      targetMode: movement?.targetMode ?? decisionBase.targetMode ?? inferredTargetMode(decisionBase.selectedIntent, decisionBase.targetCitizenId, decisionBase.route.length),
      interactionRadius: movement?.interactionRadius ?? decisionBase.interactionRadius ?? (decisionBase.targetCitizenId !== undefined ? 1 : 0),
      route,
      routeIndex: 0,
      repathCount: 0,
      unreachableTicks: 0,
      workTicksRemaining: workTicks,
      workTicksTotal: workTicks,
      interruptible: true,
      minimumCommitmentUntilTick: this.snapshot.tick + commitmentWindowTicks(decisionBase.selected, workTicks),
      nextReviewAtTick: this.snapshot.tick + reviewIntervalTicks(citizen),
      resourceClaims: claims,
      ...(decisionBase.targetCitizenId !== undefined ? { targetCitizenId: decisionBase.targetCitizenId } : {}),
    };
    const activity = route.length ? `Traveling to ${decisionBase.selectedLabel.toLowerCase()}` : `Beginning ${decisionBase.selectedLabel.toLowerCase()}`;
    // Providers still evaluate the complete bounded legal set. The durable audit
    // record keeps a representative set plus the chosen option, preventing each
    // snapshot clone/save from repeatedly carrying dozens of redundant choices.
    const candidateAuditLimit = 24;
    const selectedCandidate = decisionBase.candidates.find((candidate) => candidate.id === decisionBase.selectedCandidateId);
    const auditedCandidates = decisionBase.candidates.length <= candidateAuditLimit
      ? decisionBase.candidates
      : decisionBase.candidates.slice(0, selectedCandidate && !decisionBase.candidates.slice(0, candidateAuditLimit).includes(selectedCandidate) ? candidateAuditLimit - 1 : candidateAuditLimit);
    if (selectedCandidate && !auditedCandidates.includes(selectedCandidate)) auditedCandidates.push(selectedCandidate);
    const decision: DecisionRecord = {
      ...decisionBase,
      candidates: auditedCandidates,
      id: decisionId,
      actionInstanceId,
      actionStatus: "in-progress",
      consequences: ["Action scheduled; no consequences have been applied yet."],
      resourceDelta: {},
      activity,
    };
    citizen.currentActionId = actionInstanceId;
    citizen.currentActivity = activity;
    citizen.lastDecisionId = decisionId;
    citizen.mind = {
      ...(citizen.mind ?? initialMindState()),
      mode: citizen.commitment?.status === "active" ? "committed" : "executing",
      lastDeliberatedAtTick: this.snapshot.tick,
      nextReviewAtTick: instance.nextReviewAtTick,
      currentIntention: {
        decisionId,
        label: decisionBase.selectedLabel,
        startedAtTick: this.snapshot.tick,
        commitmentStrength: citizen.commitment?.status === "active"
          ? 0.9
          : clamp01(0.35 + (citizen.personality?.conscientiousness ?? 0.5) * 0.45),
      },
      interruptReason: undefined,
    };
    citizen.revision += 1;
    this.snapshot.activeActions[actionInstanceId] = instance;
    this.reserve(instance);
    this.snapshot.decisions = [decision, ...this.snapshot.decisions].slice(0, 1_000);
    return decision;
  }

  private interactionDistance(left: { x: number; y: number }, right: { x: number; y: number }) {
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
  }

  private updateActionRoute(action: SimulationSnapshot["activeActions"][string], citizen: CitizenState, points: Array<{ x: number; y: number }>) {
    const ownReservationId = `location:${action.id}`;
    const reserved = new Set(Object.entries(this.snapshot.reservations)
      .filter(([id, reservation]) => id !== ownReservationId && reservation.kind === "location")
      .map(([, reservation]) => reservation.key));
    const planned = this.routeToAny(citizen.position, points.filter((point) => !reserved.has(`tile:${point.x},${point.y}`) || point.x === citizen.position.x && point.y === citizen.position.y));
    if (!planned) {
      action.unreachableTicks += 1;
      citizen.currentActivity = action.targetMode === "citizen" ? "Waiting for a reachable meeting point" : "Waiting for a route to reopen";
      return false;
    }
    action.target = { ...planned.target };
    action.route = planned.route.map((point) => ({ ...point }));
    action.routeIndex = 0;
    action.phase = action.route.length ? "moving" : "performing";
    action.repathCount += 1;
    action.unreachableTicks = 0;
    const reservation = this.snapshot.reservations[ownReservationId];
    if (reservation) {
      reservation.key = `tile:${action.target.x},${action.target.y}`;
      reservation.expiresAtTick = this.snapshot.tick + action.route.length + action.workTicksRemaining + 4;
    }
    citizen.currentActivity = action.route.length
      ? action.targetMode === "citizen" ? "Moving to meet another person" : `Traveling to ${action.actionId.replaceAll("_", " ")}`
      : `Performing ${action.actionId.replaceAll("_", " ")}`;
    return true;
  }

  private keepActionSpatiallyValid(action: SimulationSnapshot["activeActions"][string], citizen: CitizenState) {
    if (action.targetMode === "self") return { ready: true };
    if (action.targetMode === "citizen") {
      const target = action.targetCitizenId === undefined ? undefined : this.snapshot.citizens[action.targetCitizenId];
      if (!target || target.physical?.alive === false) return { ready: false, cancel: "The other person is no longer available for the meeting." };
      if (this.interactionDistance(citizen.position, target.position) <= action.interactionRadius) {
        if (action.phase === "moving") {
          action.route = [];
          action.routeIndex = 0;
          action.phase = "performing";
          citizen.currentActivity = `Meeting ${target.name}`;
        }
        return { ready: true };
      }
      const routeEndpoint = action.route.at(-1);
      if (action.phase === "moving" && action.routeIndex < action.route.length && routeEndpoint && this.interactionDistance(routeEndpoint, target.position) <= action.interactionRadius) {
        return { ready: false };
      }
      const routed = this.updateActionRoute(action, citizen, this.interactionSlots(target.position));
      if (!routed && action.unreachableTicks >= 4) return { ready: false, cancel: `${target.name} could not be reached after repeated attempts.` };
      return { ready: false };
    }
    if (this.interactionDistance(citizen.position, action.target) <= action.interactionRadius) return { ready: true };
    const routeEndpoint = action.route.at(-1);
    if (action.phase === "moving" && action.routeIndex < action.route.length && routeEndpoint && routeEndpoint.x === action.target.x && routeEndpoint.y === action.target.y) {
      return { ready: false };
    }
    const routed = this.updateActionRoute(action, citizen, [action.target]);
    if (!routed && action.unreachableTicks >= 4) return { ready: false, cancel: "The work location remained unreachable." };
    return { ready: false };
  }

  private advanceActions(citizens: CitizenState[], day: number) {
    const events: SimulationEvent[] = [];
    const actions = Object.values(this.snapshot.activeActions).sort((a, b) => a.citizenId - b.citizenId || a.id.localeCompare(b.id));
    for (const action of actions) {
      const citizen = this.snapshot.citizens[action.citizenId];
      if (!citizen) {
        this.release(action.id);
        delete this.snapshot.activeActions[action.id];
        continue;
      }
      if (citizen.physical?.incapacitatedSinceTick !== undefined) {
        events.push(this.cancelAction(action.id, "The citizen collapsed before the action could finish."));
        continue;
      }
      if (Object.values(this.snapshot.reservations).some((reservation) => reservation.actionInstanceId === action.id && reservation.expiresAtTick < this.snapshot.tick)) {
        events.push(this.cancelAction(action.id, "The action reservation expired before completion."));
        continue;
      }
      if (this.snapshot.tick >= action.nextReviewAtTick) {
        citizen.mind ??= initialMindState();
        action.nextReviewAtTick = this.snapshot.tick + reviewIntervalTicks(citizen);
        citizen.mind.nextReviewAtTick = action.nextReviewAtTick;
        citizen.mind.mode = citizen.commitment?.status === "active" ? "committed" : "executing";
      }
      const spatial = this.keepActionSpatiallyValid(action, citizen);
      if (spatial.cancel) {
        events.push(this.cancelAction(action.id, spatial.cancel));
        continue;
      }
      if (!spatial.ready && action.phase !== "moving") continue;
      const performingAtStart = action.phase === "performing";
      if (action.phase === "moving") {
        let movementBudget = MOVEMENT_BUDGET_PER_TICK;
        for (let step = 0; movementBudget > 0; step += 1) {
          const next = action.route[action.routeIndex];
          if (!next) break;
          const moveCost = this.snapshot.topology.moveCost[next.y * this.snapshot.topology.width + next.x] ?? 1_000;
          if (step > 0 && moveCost > movementBudget) break;
          movementBudget -= moveCost;
          const dx = next.x - citizen.position.x;
          const dy = next.y - citizen.position.y;
          citizen.position = { ...next };
          this.updateLocalKnowledge(citizen, citizens);
          citizen.facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
          citizen.revision += 1;
          action.routeIndex += 1;
        }
        if (action.routeIndex >= action.route.length) {
          action.phase = "performing";
          citizen.currentActivity = `Performing ${action.actionId.replaceAll("_", " ")}`;
        }
      } else if (performingAtStart) {
        action.workTicksRemaining -= 1;
      }
      if (action.phase === "performing" && action.workTicksRemaining <= 0) {
        const intent = action.intent ?? defaultIntent(action.actionId);
        const intentContext = {
          tick: this.snapshot.tick,
          stateVersion: this.snapshot.stateVersion,
          citizen,
          citizens,
          stock: this.snapshot.stock,
          constructionProgress: this.snapshot.constructionProgress,
          civilizationGoal: this.snapshot.civilizationGoal,
          economy: this.snapshot.economy,
          politics: this.snapshot.politics,
          physicalWorld: this.snapshot.physicalWorld,
          socialGroups: this.snapshot.socialGroups,
          socialPromises: this.snapshot.socialPromises,
          waterSources: this.snapshot.topology.locations.shore ?? [],
          buildSites: this.allBuildSites(false),
          roadPlans: this.availableRoadPlans(),
        };
        const blocked = economicIntentBlockReason(intent, intentContext);
        const settlementBlocked = settlementIntentBlockReason(intent, intentContext);
        const politicalBlocked = politicalIntentBlockReason(intent, intentContext);
        const physicalBlocked = physicalIntentBlockReason(intent, intentContext);
        const socialBlocked = ["request_item", "share_item", "steal_item", "barter_item", "rescue_person", "offer_project_help", "invite_project", "teach_technique", "warn_resource", "conceal_resource", "form_household", "form_group", "invite_group", "adopt_group_system", "leave_group", "exclude_member", "contribute_group_stock", "promise_item", "fulfill_promise", "forgive", "retaliate", "claim_resource", "challenge_claim"].includes(intent.kind)
          ? socialIntentBlockReason(intent as SocialIntent, intentContext)
          : undefined;
        if (CORE_ACTIONS.has(intent.kind as ActionId)) {
          const coreLegality = checkActionLegality(intent.kind as ActionId, intentContext);
          if (!coreLegality.legal) {
            events.push(this.cancelAction(action.id, coreLegality.reason ?? "The world changed before this action could finish."));
            continue;
          }
        }
        if (intent.kind.includes("market") || ["register_business", "list_good", "buy_good", "invest_business", "offer_job", "accept_job"].includes(intent.kind)) {
          if (blocked) {
            events.push(this.cancelAction(action.id, blocked));
            continue;
          }
        }
        if (["adopt_commitment", "change_occupation", "train_skill", "lease_facility", "transfer_good", "operate_recipe"].includes(intent.kind) && settlementBlocked) {
          events.push(this.cancelAction(action.id, settlementBlocked));
          continue;
        }
        if (["propose_policy", "cast_ballot", "respond_to_vote", "form_faction", "join_faction", "organize_collective_action"].includes(intent.kind) && politicalBlocked) {
          events.push(this.cancelAction(action.id, politicalBlocked));
          continue;
        }
        if (["craft_primitive", "gather_clay", "drink_natural_water", "catch_fish", "hunt_game", "use_medicine", "fuel_campfire", "cook_food", "boil_water", "explore", "fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "collect_water", "draw_water", "drink_water", "propose_public_project", "start_construction", "deliver_material", "work_construction", "cancel_project", "repair_structure", "demolish_structure", "move_home"].includes(intent.kind) && physicalBlocked) {
          events.push(this.cancelAction(action.id, physicalBlocked));
          continue;
        }
        if (socialBlocked) {
          events.push(this.cancelAction(action.id, socialBlocked));
          continue;
        }
        events.push(this.completeAction(action.id, citizens, day));
      }
    }
    return events;
  }

  private completeAction(actionId: string, citizens: CitizenState[], day: number) {
    const action = this.snapshot.activeActions[actionId];
    const citizen = this.snapshot.citizens[action.citizenId];
    const decision = this.snapshot.decisions.find((item) => item.id === action.decisionId);
    if (!citizen || !decision) throw new Error(`Active action ${actionId} lost its citizen or decision.`);
    const result = this.execute(citizen, action.actionId, citizens, action, action.intent);
    const wageResult = this.settleContractAfterWork(citizen, action.intent ?? defaultIntent(action.actionId));
    if (wageResult) result.consequences.push(wageResult);
    decision.actionStatus = "completed";
    decision.completedAtTick = this.snapshot.tick;
    decision.consequences = result.consequences;
    decision.resourceDelta = result.resourceDelta;
    decision.activity = result.activity;
    if (result.targetCitizenId !== undefined) decision.targetCitizenId = result.targetCitizenId;
    citizen.currentActivity = result.activity;
    delete citizen.currentActionId;
    citizen.mind = {
      ...(citizen.mind ?? initialMindState()),
      mode: citizen.commitment?.status === "active" ? "committed" : "idle",
      nextReviewAtTick: this.snapshot.tick,
      currentIntention: undefined,
      interruptReason: undefined,
    };
    citizen.revision += 1;
    this.snapshot.worldRevision += 1;
    this.release(actionId);
    delete this.snapshot.activeActions[actionId];
    const event: SimulationEvent = {
      id: `event-${this.snapshot.tick}-${citizen.id}`,
      tick: this.snapshot.tick,
      day,
      category: result.category,
      title: result.title,
      detail: result.consequences.join(" "),
      citizenIds: result.citizenIds,
      decisionId: decision.id,
    };
    const expected = this.replayExpected.get(decision.id);
    if (expected) {
      if (stableHash({ selected: decision.selected, consequences: decision.consequences, resourceDelta: decision.resourceDelta, activity: decision.activity, completedAtTick: decision.completedAtTick }) !== stableHash({ selected: expected.selected, consequences: expected.consequences, resourceDelta: expected.resourceDelta, activity: expected.activity, completedAtTick: expected.completedAtTick })) {
        throw new Error(`Replay consequences diverged at ${decision.id}.`);
      }
      Object.assign(decision, structuredClone(expected));
      this.replayExpected.delete(decision.id);
    }
    this.snapshot.events = [event, ...this.snapshot.events].slice(0, 5_000);
    return event;
  }

  private settleContractAfterWork(citizen: CitizenState, intent: ActionIntent) {
    const paidWork = new Set<ActionIntent["kind"]>(["work_job", "gather_food", "forage_wild_food", "catch_fish", "hunt_game", "gather_fiber", "gather_branches", "gather_loose_stone", "gather_clay", "fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "work_construction", "repair_structure", "operate_recipe"]);
    if (!paidWork.has(intent.kind)) return undefined;
    const contract = Object.values(this.snapshot.economy.contracts).find((item) => item.workerId === citizen.id && item.status === "active");
    if (!contract) return undefined;
    const wage = contract.escrowedWage;
    this.snapshot.economy.wallets[citizen.id] = (this.snapshot.economy.wallets[citizen.id] ?? 0) + wage;
    contract.escrowedWage = 0;
    contract.status = "completed";
    const business = this.snapshot.economy.businesses[contract.businessId];
    if (business) business.employeeIds = business.employeeIds.filter((id) => id !== citizen.id);
    this.snapshot.economy.transactions.unshift({ id: `transaction-wage-${this.snapshot.tick}-${citizen.id}-${contract.id}`, tick: this.snapshot.tick, kind: "wage", fromId: `contract:${contract.id}`, toId: `citizen:${citizen.id}`, money: wage, contractId: contract.id });
    refreshEconomicIndicators(this.snapshot.economy, Object.values(this.snapshot.citizens));
    assertEconomyInvariants(this.snapshot.economy, Object.values(this.snapshot.citizens), Object.values(this.snapshot.physicalWorld.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
    return `${wage} shells left contract escrow and were paid after the promised work completed.`;
  }

  private finishTick(citizens: CitizenState[], decisions: DecisionRecord[], events: SimulationEvent[], copySnapshot = true): SimulationStepResult {
    this.snapshot.requests = this.coordinator.getRequestLog();
    if (this.snapshot.civilizationGoal.id === "market-economy" && this.snapshot.tick % Math.max(1, citizens.length) === 0) {
      refreshEconomicIndicators(this.snapshot.economy, citizens);
      assertEconomyInvariants(this.snapshot.economy, citizens, Object.values(this.snapshot.physicalWorld.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
    }
    refreshPoliticalIndicators(this.snapshot.politics);
    refreshGoalDimensions(this.snapshot.civilizationGoal, this.snapshot.politics, this.snapshot.economy, this.snapshot.tick);
    assertPoliticsInvariants(this.snapshot.politics, citizens);
    assertSocialWorldInvariants(this.snapshot.socialGroups, this.snapshot.socialPromises, this.snapshot.citizens);
    if (this.snapshot.tick % Math.max(1, citizens.length) === 0 && this.snapshot.trends.at(-1)?.tick !== this.snapshot.tick) {
      const averageHappiness = citizens.reduce((total, item) => total + item.happiness, 0) / citizens.length;
      const relations = citizens.flatMap((item) => Object.values(item.relationships));
      this.snapshot.trends = [...this.snapshot.trends, {
        tick: this.snapshot.tick,
        food: (this.snapshot.stock.wheat ?? 0) + (this.snapshot.stock.fish ?? 0) + (this.snapshot.stock.bread ?? 0),
        materials: (this.snapshot.stock.wood ?? 0) + (this.snapshot.stock.stone ?? 0) + (this.snapshot.stock.ore ?? 0),
        happiness: averageHappiness,
        stability: relations.length ? relations.reduce((a, b) => a + b, 0) / relations.length : 0.5,
      }].slice(-5_000);
    }
    if (this.snapshot.tick % CHECKPOINT_INTERVAL === 0) this.captureCheckpoint();
    return {
      snapshot: copySnapshot ? this.getSnapshot() : this.snapshot,
      ...(decisions.length ? { decision: decisions[decisions.length - 1], decisions } : {}),
      events,
    };
  }

  private captureCheckpoint() {
    const state = {
      stateVersion: this.snapshot.stateVersion,
      worldRevision: this.snapshot.worldRevision,
      topology: structuredClone(this.snapshot.topology),
      cursor: this.snapshot.cursor,
      citizens: structuredClone(this.snapshot.citizens),
      stock: { ...this.snapshot.stock },
      constructionProgress: this.snapshot.constructionProgress,
      civilizationGoal: structuredClone(this.snapshot.civilizationGoal),
      economy: structuredClone(this.snapshot.economy),
      politics: structuredClone(this.snapshot.politics),
      physicalWorld: structuredClone(this.snapshot.physicalWorld),
      socialGroups: structuredClone(this.snapshot.socialGroups),
      socialPromises: structuredClone(this.snapshot.socialPromises),
      activeActions: structuredClone(this.snapshot.activeActions),
      reservations: structuredClone(this.snapshot.reservations),
    };
    const checkpoint = { tick: this.snapshot.tick, digest: stableHash(state), state };
    const previous = this.snapshot.checkpoints.filter((item) => item.tick !== checkpoint.tick);
    const origin = previous.find((item) => item.tick === 0);
    const recent = [...previous.filter((item) => item.tick !== 0), checkpoint].slice(-(MAX_LIVE_CHECKPOINTS - (origin ? 1 : 0)));
    this.snapshot.checkpoints = origin ? [origin, ...recent] : recent.slice(-MAX_LIVE_CHECKPOINTS);
  }

  private availableStock() {
    const stock = { ...this.snapshot.stock };
    for (const reservation of Object.values(this.snapshot.reservations)) {
      if ((reservation.kind === "resource" || reservation.kind === "stock") && reservation.key in stock) stock[reservation.key] = Math.max(0, (stock[reservation.key] ?? 0) - reservation.amount);
    }
    return stock;
  }

  private availablePhysicalWorld(citizen?: CitizenState) {
    const physical = structuredClone(this.snapshot.physicalWorld);
    const reservedKeys = new Set(Object.values(this.snapshot.reservations).filter((reservation) => reservation.kind === "resource").map((reservation) => reservation.key));
    for (const [id, node] of Object.entries(physical.resources)) if (reservedKeys.has(`node:${id}`)) delete physical.resources[id];
    for (const reservation of Object.values(this.snapshot.reservations)) {
      if (reservation.kind !== "resource" || !reservation.key.startsWith("natural:")) continue;
      const stock = physical.renewableStocks[reservation.key.slice("natural:".length)];
      if (stock) stock.amount = Math.max(0, stock.amount - reservation.amount);
    }
    if (citizen && this.snapshot.topology.environment) {
      const known = new Set(citizen.knowledge?.knownResources ?? []);
      for (const id of Object.keys(physical.resources)) if (!known.has(id)) delete physical.resources[id];
      for (const id of Object.keys(physical.claims)) if (!known.has(id)) delete physical.claims[id];
    }
    return physical;
  }

  private updateLocalKnowledge(citizen: CitizenState, citizens: CitizenState[]) {
    citizen.knowledge ??= { discoveredTiles: [], knownResources: [], knownPeople: [], learnedTechniques: [] };
    const radius = 4;
    // Terrain and resource visibility only changes when this person moves or a
    // new physical object is introduced. Avoid rescanning every world node for
    // every stationary person on every tick; this is the main 50–100 NPC path.
    const anchor = `${citizen.position.x},${citizen.position.y}:${this.snapshot.physicalWorld.nextObjectUid}`;
    if (this.localKnowledgeAnchors.get(citizen.id) !== anchor) {
      const discovered = new Set(citizen.knowledge.discoveredTiles);
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        const x = citizen.position.x + dx;
        const y = citizen.position.y + dy;
        if (x < 0 || y < 0 || x >= this.snapshot.topology.width || y >= this.snapshot.topology.height || dx * dx + dy * dy > radius * radius) continue;
        discovered.add(`${x},${y}`);
      }
      citizen.knowledge.discoveredTiles = [...discovered].slice(-50_000);
      const knownResources = new Set(citizen.knowledge.knownResources);
      for (const node of Object.values(this.snapshot.physicalWorld.resources)) {
        if (Math.abs(node.position.x - citizen.position.x) + Math.abs(node.position.y - citizen.position.y) <= radius) knownResources.add(node.id);
      }
      citizen.knowledge.knownResources = [...knownResources].slice(-5_000);
      this.localKnowledgeAnchors.set(citizen.id, anchor);
    }
    const knownPeople = new Set(citizen.knowledge.knownPeople);
    for (const other of citizens) if (other.id !== citizen.id && other.physical?.alive !== false && Math.abs(other.position.x - citizen.position.x) + Math.abs(other.position.y - citizen.position.y) <= 7) knownPeople.add(other.id);
    citizen.knowledge.knownPeople = [...knownPeople].slice(-5_000);
  }

  private availableBuildSites() {
    if (!this.snapshot.physicalWorld.enabled) return [];
    const reservedKeys = new Set(Object.values(this.snapshot.reservations).filter((reservation) => reservation.kind === "resource").map((reservation) => reservation.key));
    return this.allBuildSites(true).filter((site) => !reservedKeys.has(`site:${site.x},${site.y}`));
  }

  private allBuildSites(limitForDecisions: boolean) {
    if (!this.snapshot.physicalWorld.enabled) return [];
    const physical = this.snapshot.physicalWorld;
    const key = [
      this.snapshot.topology.topologyRevision,
      physical.nextObjectUid,
      ...Object.values(physical.resources).map((resource) => `${resource.objectUid}:${resource.status}`),
      ...Object.values(physical.projects).map((project) => `${project.objectUid}:${project.status}:${project.demolishedAtTick ?? ""}`),
    ].join("|");
    const cached = this.buildSiteCache?.key === key ? (limitForDecisions ? this.buildSiteCache.decision : this.buildSiteCache.validation) : undefined;
    if (cached) return cached;
    const buildingTypes = ["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot", "cottage", "storehouse", "lumbermill", "stall", "farm", "hall", "well", "bakery", "smithy", "workshop", "fishery"] as const;
    // `findBuildSites` scans the full topology regardless of the requested
    // limit. Compute the validation superset once, then derive the tiny AI
    // choice list from it instead of scanning the map a second time.
    const validation = buildingTypes.flatMap((buildingType) => findBuildSites(this.snapshot, buildingType, 12));
    const decision = buildingTypes.flatMap((buildingType) => validation.filter((site) => site.buildingType === buildingType).slice(0, buildingType === "cottage" ? 3 : 1));
    this.buildSiteCache = { key, decision, validation };
    return limitForDecisions ? decision : validation;
  }

  private availableRoadPlans() {
    if (!this.snapshot.physicalWorld.enabled) return [];
    const world = this.snapshot.topology;
    const key = `${world.topologyRevision}|${Object.values(this.snapshot.physicalWorld.roads).map((road) => `${road.id}:${road.condition.toFixed(2)}`).join("|")}`;
    if (this.roadPlanCache?.key === key) return this.roadPlanCache.plans;
    const from = world.locations.plaza?.[0] ?? { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) };
    const destinations = [...(world.locations.fields ?? []), ...(world.locations["job:miner"] ?? []), ...(world.locations.food ?? [])]
      .filter((point) => Math.abs(point.x - from.x) + Math.abs(point.y - from.y) >= 6)
      .sort((left, right) => (Math.abs(left.x - from.x) + Math.abs(left.y - from.y)) - (Math.abs(right.x - from.x) + Math.abs(right.y - from.y)) || left.y - right.y || left.x - right.x);
    const plans: Array<Array<{ x: number; y: number }>> = [];
    for (const target of destinations.slice(0, 3)) {
      const route = findPath(world, from, target)?.filter((point) => !this.snapshot.physicalWorld.roads[`road:${point.x},${point.y}`]);
      if (route?.length) plans.push(route);
    }
    this.roadPlanCache = { key, plans };
    return plans;
  }

  private availableEconomy() {
    const source = this.snapshot.economy;
    const economy = {
      ...source,
      wallets: { ...source.wallets },
      policies: { ...source.policies },
      charter: source.charter ? {
        ...source.charter,
        supporterIds: [...source.charter.supporterIds],
        opponentIds: [...source.charter.opponentIds],
      } : undefined,
      ownership: source.ownership.map((record) => ({ ...record })),
      businesses: Object.fromEntries(Object.entries(source.businesses).map(([id, business]) => [id, {
        ...business,
        inventory: { ...business.inventory },
        employeeIds: [...business.employeeIds],
        facilityObjectUids: [...business.facilityObjectUids],
        blockers: [...business.blockers],
      }])),
      offers: Object.fromEntries(Object.entries(source.offers).map(([id, offer]) => [id, { ...offer }])),
      contracts: Object.fromEntries(Object.entries(source.contracts).map(([id, contract]) => [id, { ...contract }])),
      production: source.production.map((batch) => ({ ...batch, owner: { ...batch.owner }, inputs: { ...batch.inputs }, outputs: { ...batch.outputs } })),
      indicators: { ...source.indicators },
    };
    for (const reservation of Object.values(this.snapshot.reservations)) {
      if (reservation.kind === "wallet") {
      const citizenId = Number(reservation.key);
        economy.wallets[citizenId] = Math.max(0, (economy.wallets[citizenId] ?? 0) - reservation.amount);
      }
      if (reservation.kind === "treasury") economy.treasury = Math.max(0, economy.treasury - reservation.amount);
      if (reservation.kind === "business-capital") {
        const business = economy.businesses[reservation.key];
        if (business) business.capital = Math.max(0, business.capital - reservation.amount);
      }
      if (reservation.kind === "offer") {
        const offer = economy.offers[reservation.key];
        if (offer) offer.amountRemaining = Math.max(0, offer.amountRemaining - reservation.amount);
      }
      if (reservation.kind === "inventory") {
        const [ownerType, ownerId, resource] = reservation.key.split(":");
        const inventory = ownerType === "business" ? economy.businesses[ownerId]?.inventory : undefined;
        if (inventory) inventory[resource] = Math.max(0, (inventory[resource] ?? 0) - reservation.amount);
      }
    }
    return economy;
  }

  private economyDecisionDigest(citizenId: number, economy: SimulationSnapshot["economy"]) {
    return {
      policies: economy.policies,
      charter: economy.charter,
      wallet: economy.wallets[citizenId] ?? 0,
      treasury: economy.treasury,
      citizenInventory: this.snapshot.citizens[citizenId]?.inventory,
      businesses: Object.values(economy.businesses).map(({ id, ownerId, capital, inventory, employeeIds }) => ({ id, ownerId, capital, inventory, employeeIds })),
      offers: Object.values(economy.offers).filter((offer) => offer.status === "open"),
      contracts: Object.values(economy.contracts).filter((contract) => contract.status === "offered" || contract.status === "active"),
      latestPrices: Object.fromEntries(Object.entries(economy.priceHistory).map(([resource, entries]) => [resource, entries.at(-1)])),
    };
  }

  private politicsDecisionDigest(citizenId: number) {
    const politics = this.snapshot.politics;
    const active = politics.activeProposalId ? politics.proposals[politics.activeProposalId] : undefined;
    return {
      activeProposal: active ? { id: active.id, policyId: active.policyId, status: active.status, tally: active.tally, eligibleVoterIds: active.eligibleVoterIds, ballot: active.ballots[citizenId] } : undefined,
      laws: Object.keys(politics.laws).sort(),
      citizen: politics.citizens[citizenId],
      factions: Object.values(politics.factions).map(({ id, proposalId, position, memberIds, radicalization }) => ({ id, proposalId, position, memberIds, radicalization })),
      collectiveActions: Object.values(politics.collectiveActions).filter((action) => action.status !== "resolved"),
    };
  }

  private politicalPerception(citizenId: number) {
    const politics = this.snapshot.politics;
    const citizen = politics.citizens[citizenId] ?? { legitimacy: 0.5, grievance: 0, engagement: 0.5, reactions: {} };
    const active = politics.activeProposalId ? politics.proposals[politics.activeProposalId] : undefined;
    return structuredClone({
      activeProposal: active ? { id: active.id, policyId: active.policyId, status: active.status, tally: active.tally, eligibleVoterIds: active.eligibleVoterIds } : undefined,
      laws: Object.keys(politics.laws) as import("./types").PolicyId[],
      legitimacy: citizen.legitimacy,
      grievance: citizen.grievance,
      factionId: citizen.factionId,
      reactionsPending: Boolean(active && active.status !== "voting" && !citizen.reactions[active.id]),
    });
  }

  private availableCitizen(citizen: CitizenState) {
    const available = structuredClone(citizen);
    for (const reservation of Object.values(this.snapshot.reservations)) {
      if (reservation.kind !== "inventory") continue;
      const [ownerType, ownerId, resource] = reservation.key.split(":");
      if (ownerType !== "citizen" || Number(ownerId) !== citizen.id) continue;
      available.inventory[resource] = Math.max(0, (available.inventory[resource] ?? 0) - reservation.amount);
    }
    return available;
  }

  private consumeFoodLots(owner: InventoryOwner, resource: string, amount: number) {
    let remaining = amount;
    const key = owner.kind === "stock" ? "stock" : `${owner.kind}:${owner.id}`;
    const lots = Object.values(this.snapshot.physicalWorld.foodLots)
      .filter((lot) => lot.resource === resource && (lot.owner.kind === "stock" ? "stock" : `${lot.owner.kind}:${lot.owner.id}`) === key)
      .sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id));
    for (const lot of lots) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, lot.amount);
      lot.amount -= consumed;
      remaining -= consumed;
      if (lot.amount <= 0) delete this.snapshot.physicalWorld.foodLots[lot.id];
    }
  }

  private resourceClaims(action: DecisionRecord["selected"], intent: ActionIntent | undefined, citizenId: number, stock: Record<string, number>) {
    if (action === "eat") {
      const personalKey = foodKey(this.snapshot.citizens[citizenId]?.inventory ?? {});
      if (personalKey) return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:${personalKey}`, amount: 1 }];
      const key = foodKey(stock);
      return key ? [{ kind: "resource" as const, resourceId: key, amount: 1 }] : [];
    }
    if (action === "construct") return [{ kind: "resource" as const, resourceId: "wood", amount: 2 }, { kind: "resource" as const, resourceId: "stone", amount: 1 }];
    if (action === "gather_food" && this.snapshot.citizens[citizenId]?.job === "fisher" && this.snapshot.physicalWorld.enabled) return [{ kind: "resource" as const, resourceId: "natural:fish", amount: 1 }];
    if (!intent) return [];
    if (intent.kind === "forage_wild_food" || intent.kind === "gather_fiber" || intent.kind === "gather_branches" || intent.kind === "gather_loose_stone" || intent.kind === "fell_tree" || intent.kind === "quarry_stone" || intent.kind === "harvest_crop") return [{ kind: "resource" as const, resourceId: `node:${intent.nodeId}`, amount: 1 }];
    if (intent.kind === "craft_hand_axe" || intent.kind === "craft_stone_pick") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:branches`, amount: 1 }, { kind: "inventory" as const, resourceId: `citizen:${citizenId}:stone`, amount: 1 }];
    if (intent.kind === "craft_primitive") return Object.entries(PRIMITIVE_RECIPES[intent.recipeId].inputs).map(([resource, amount]) => ({ kind: "inventory" as const, resourceId: `citizen:${citizenId}:${resource}`, amount }));
    if (intent.kind === "gather_clay") return [{ kind: "resource" as const, resourceId: "natural:clay", amount: 1 }];
    if (intent.kind === "drink_natural_water") return [{ kind: "resource" as const, resourceId: "natural:water", amount: 1 }];
    if (intent.kind === "catch_fish") return [{ kind: "resource" as const, resourceId: "natural:fish", amount: 1 }];
    if (intent.kind === "hunt_game") return [{ kind: "resource" as const, resourceId: "natural:game", amount: 1 }];
    if (intent.kind === "use_medicine") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:basic_medicine`, amount: 1 }];
    if (intent.kind === "fuel_campfire") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:branches`, amount: 1 }];
    if (intent.kind === "cook_food") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:${intent.resource}`, amount: 1 }];
    if (intent.kind === "boil_water") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:water`, amount: 1 }];
    if (intent.kind === "sow_crop") {
      const seedResource = `${intent.cropType}_seed`;
      const inventory = this.snapshot.citizens[citizenId]?.inventory ?? {};
      const carriedSeed = (inventory[seedResource] ?? 0) >= 1;
      const sharedSeed = (stock[seedResource] ?? 0) >= 1;
      const carriedFood = (inventory[intent.cropType] ?? 0) >= 1;
      const resource = carriedSeed || sharedSeed ? seedResource : intent.cropType;
      return [
        { kind: "resource" as const, resourceId: `node:${intent.nodeId}`, amount: 1 },
        carriedSeed || (!sharedSeed && carriedFood)
          ? { kind: "inventory" as const, resourceId: `citizen:${citizenId}:${resource}`, amount: 1 }
          : { kind: "stock" as const, resourceId: resource, amount: 1 },
      ];
    }
    if (intent.kind === "tend_crop") {
      const node = this.snapshot.physicalWorld.resources[intent.nodeId];
      const nearbyWell = node && Object.values(this.snapshot.physicalWorld.buildings).some((building) => building.buildingType === "well" && building.condition >= 0.15 && Math.abs(building.position.x - node.position.x) + Math.abs(building.position.y - node.position.y) <= 8);
      return [
        { kind: "resource" as const, resourceId: `node:${intent.nodeId}`, amount: 1 },
        ...(nearbyWell && (this.snapshot.physicalWorld.renewableStocks.water?.amount ?? 0) >= 1
          ? [{ kind: "resource" as const, resourceId: "natural:water", amount: 1 }]
          : (this.snapshot.citizens[citizenId]?.inventory.water ?? 0) >= 1
            ? [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:water`, amount: 1 }]
            : []),
      ];
    }
    if (intent.kind === "collect_water") return [{ kind: "resource" as const, resourceId: "natural:water", amount: 1 }];
    if (intent.kind === "draw_water") return [{ kind: "resource" as const, resourceId: `well:${intent.buildingObjectUid}`, amount: 1 }, { kind: "resource" as const, resourceId: "natural:water", amount: 2 }];
    if (intent.kind === "drink_water") return (this.snapshot.citizens[citizenId]?.inventory.water ?? 0) > 0
      ? [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:water`, amount: 1 }]
      : [{ kind: "stock" as const, resourceId: "water", amount: 1 }];
    if (intent.kind === "propose_public_project") return [{ kind: "resource" as const, resourceId: "assembly:proposal", amount: 1 }];
    if (intent.kind === "start_construction") {
      const claims: ResourceClaim[] = [{ kind: "resource", resourceId: `site:${intent.x},${intent.y}`, amount: 1 }];
      const mandate = intent.mandateId ? this.snapshot.physicalWorld.mandates[intent.mandateId] : undefined;
      const moneyCost = mandate?.plan.budget ?? (intent.owner.kind === "public" ? 0 : BUILDINGS[intent.buildingType].moneyCost);
      if (intent.owner.kind === "citizen" && moneyCost > 0) claims.push({ kind: "wallet" as const, resourceId: String(intent.owner.id), amount: moneyCost });
      if (intent.owner.kind === "business" && moneyCost > 0) claims.push({ kind: "business-capital" as const, resourceId: intent.owner.id, amount: moneyCost });
      if (intent.owner.kind === "public" && moneyCost > 0) claims.push({ kind: "treasury" as const, resourceId: "settlement", amount: moneyCost });
      return claims;
    }
    if (intent.kind === "deliver_material") return [{
      kind: intent.source === "inventory" ? "inventory" as const : "stock" as const,
      resourceId: intent.source === "inventory" ? `citizen:${citizenId}:${intent.resource}` : intent.resource,
      amount: intent.amount,
    }];
    if (intent.kind === "move_home") return [{ kind: "resource" as const, resourceId: `home:${intent.buildingObjectUid}`, amount: 1 }];
    if (intent.kind === "repair_structure") {
      const plan = intent.mandateId ? this.snapshot.physicalWorld.mandates[intent.mandateId]?.plan : undefined;
      const required = plan?.required ?? { wood: 1, stone: 1 };
      return [...Object.entries(required).map(([resource, amount]) => ({ kind: "stock" as const, resourceId: resource, amount })), { kind: "resource" as const, resourceId: `${intent.targetKind}:${intent.targetId}`, amount: 1 }, ...(plan?.budget ? [{ kind: "treasury" as const, resourceId: "settlement", amount: plan.budget }] : [])];
    }
    if (intent.kind === "demolish_structure") return [{ kind: "resource" as const, resourceId: `building:${intent.buildingObjectUid}`, amount: 1 }];
    if (intent.kind === "cancel_project") return [{ kind: "resource" as const, resourceId: `project:${intent.projectId}`, amount: 1 }];
    if (intent.kind === "register_business") return [{ kind: "wallet" as const, resourceId: String(citizenId), amount: 5 }];
    if (intent.kind === "list_good") return [{ kind: "inventory" as const, resourceId: `${intent.ownerType}:${intent.ownerId}:${intent.resource}`, amount: intent.amount }];
    if (intent.kind === "buy_good") {
      const offer = this.snapshot.economy.offers[intent.offerId];
      return offer ? [
        { kind: "wallet" as const, resourceId: String(citizenId), amount: offer.unitPrice * intent.amount },
        { kind: "offer" as const, resourceId: offer.id, amount: intent.amount },
      ] : [];
    }
    if (intent.kind === "invest_business") return [{ kind: "wallet" as const, resourceId: String(citizenId), amount: intent.amount }];
    if (intent.kind === "offer_job") return [{ kind: "business-capital" as const, resourceId: intent.businessId, amount: intent.wage }];
    if (intent.kind === "lease_facility") return [{ kind: "business-capital" as const, resourceId: intent.businessId, amount: intent.rent }, { kind: "resource" as const, resourceId: `building:${intent.buildingObjectUid}`, amount: 1 }];
    if (intent.kind === "transfer_good") {
      const key = intent.from.kind === "stock" ? intent.resource : `${intent.from.kind}:${intent.from.id}:${intent.resource}`;
      return [{ kind: intent.from.kind === "stock" ? "stock" as const : "inventory" as const, resourceId: key, amount: intent.amount }];
    }
    if (intent.kind === "operate_recipe") {
      const recipe = PRODUCTION_RECIPES[intent.recipeId];
      if (!recipe) return [];
      return [
        { kind: "resource" as const, resourceId: `building:${intent.facilityObjectUid}`, amount: 1 },
        ...Object.entries(recipe.inputs).map(([resource, amount]) => ({
          kind: intent.owner.kind === "stock" ? "stock" as const : "inventory" as const,
          resourceId: intent.owner.kind === "stock" ? resource : `${intent.owner.kind}:${intent.owner.id}:${resource}`,
          amount,
        })),
      ];
    }
    if (intent.kind === "share_item") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:${intent.resource}`, amount: intent.amount }];
    if (intent.kind === "steal_item") return [{ kind: "inventory" as const, resourceId: `citizen:${intent.targetCitizenId}:${intent.resource}`, amount: intent.amount }];
    if (intent.kind === "contribute_group_stock") return [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:${intent.resource}`, amount: intent.amount }];
    if (intent.kind === "fulfill_promise") {
      const promise = this.snapshot.socialPromises[intent.promiseId];
      return promise ? [{ kind: "inventory" as const, resourceId: `citizen:${citizenId}:${promise.resource}`, amount: promise.amount }] : [];
    }
    if (intent.kind === "claim_resource" || intent.kind === "challenge_claim") return [{ kind: "resource" as const, resourceId: `node:${intent.nodeId}`, amount: 1 }];
    return [];
  }

  private actionDuration(action: DecisionRecord["selected"]) {
    const durations: Record<ActionId, number> = {
      eat: 1, rest: 2, gather_food: 2, work_job: 2, socialize: 1, construct: 3,
      forage_wild_food: 2, gather_fiber: 2, gather_branches: 2, gather_loose_stone: 2, craft_hand_axe: 3, craft_stone_pick: 3,
      craft_primitive: 3, gather_clay: 3, drink_natural_water: 1, catch_fish: 4, hunt_game: 5, use_medicine: 1, fuel_campfire: 1, cook_food: 2, boil_water: 2, explore: 1,
      fell_tree: 4, quarry_stone: 5, harvest_crop: 3, sow_crop: 2, tend_crop: 2, collect_water: 3, draw_water: 1, drink_water: 1,
      propose_public_project: 1, start_construction: 2, deliver_material: 2, work_construction: 3, cancel_project: 1, repair_structure: 3, demolish_structure: 4, move_home: 2,
      propose_market_charter: 1, support_market_charter: 1, oppose_market_charter: 1, register_business: 2, list_good: 1, buy_good: 1, invest_business: 1, offer_job: 1, accept_job: 1,
      adopt_commitment: 1, change_occupation: 2, train_skill: 3, lease_facility: 2, transfer_good: 2, operate_recipe: 4,
      propose_policy: 1, cast_ballot: 1, respond_to_vote: 1, form_faction: 1, join_faction: 1, organize_collective_action: 2, idle: 1,
      request_item: 1, share_item: 1, steal_item: 2, barter_item: 2, rescue_person: 2, offer_project_help: 1, invite_project: 1, teach_technique: 3, warn_resource: 1, conceal_resource: 1, form_household: 2, claim_resource: 1, challenge_claim: 2,
      form_group: 2, invite_group: 2, adopt_group_system: 2, leave_group: 1, exclude_member: 2, contribute_group_stock: 2, promise_item: 1, fulfill_promise: 2, forgive: 1, retaliate: 2,
    };
    return durations[action];
  }

  private reserve(action: SimulationSnapshot["activeActions"][string]) {
    const locationKey = `tile:${action.target.x},${action.target.y}`;
    const expiresAtTick = this.snapshot.tick + action.route.length + action.workTicksRemaining + 4;
    this.snapshot.reservations[`location:${action.id}`] = { id: `location:${action.id}`, actionInstanceId: action.id, citizenId: action.citizenId, kind: "location", key: locationKey, amount: 1, createdAtTick: this.snapshot.tick, expiresAtTick };
    for (const claim of action.resourceClaims) {
      const kind = claim.kind ?? "stock";
      const id = `${kind}:${claim.resourceId}:${action.id}`;
      this.snapshot.reservations[id] = { id, actionInstanceId: action.id, citizenId: action.citizenId, kind, key: claim.resourceId, amount: claim.amount, createdAtTick: this.snapshot.tick, expiresAtTick };
    }
  }

  private release(actionId: string) {
    for (const [id, reservation] of Object.entries(this.snapshot.reservations)) if (reservation.actionInstanceId === actionId) delete this.snapshot.reservations[id];
  }

  private cancelAction(actionId: string, reason: string) {
    const action = this.snapshot.activeActions[actionId];
    if (!action) throw new Error(`Cannot cancel missing action ${actionId}.`);
    const citizen = this.snapshot.citizens[action.citizenId];
    const decision = this.snapshot.decisions.find((item) => item.id === action.decisionId);
    if (decision) {
      decision.actionStatus = "cancelled";
      decision.completedAtTick = this.snapshot.tick;
      decision.consequences = [reason];
      decision.resourceDelta = {};
      decision.activity = "Reconsidering after a world change";
    }
    if (citizen) {
      delete citizen.currentActionId;
      citizen.currentActivity = "Reconsidering after a world change";
      citizen.mind = {
        ...(citizen.mind ?? initialMindState()),
        mode: "interrupted",
        nextReviewAtTick: this.snapshot.tick,
        reconsiderations: (citizen.mind?.reconsiderations ?? 0) + 1,
        currentIntention: undefined,
        lastInterruptAtTick: this.snapshot.tick,
        interruptReason: reason,
      };
      citizen.revision += 1;
    }
    this.release(actionId);
    delete this.snapshot.activeActions[actionId];
    const event: SimulationEvent = {
      id: `event-cancel-${this.snapshot.tick}-${action.citizenId}-${action.id}`,
      tick: this.snapshot.tick,
      day: this.snapshot.events[0]?.day ?? 1,
      category: "world",
      title: `${citizen?.name ?? `Citizen ${action.citizenId}`} replans`,
      detail: reason,
      citizenIds: [action.citizenId],
      decisionId: decision?.id,
    };
    this.snapshot.events = [event, ...this.snapshot.events].slice(0, 5_000);
    return event;
  }

  private interactionSlots(position: { x: number; y: number }, footprint = { width: 1, height: 1 }) {
    const slots: Array<{ x: number; y: number }> = [];
    for (let y = position.y - 1; y <= position.y + footprint.height; y += 1) {
      for (let x = position.x - 1; x <= position.x + footprint.width; x += 1) {
        const inside = x >= position.x && x < position.x + footprint.width && y >= position.y && y < position.y + footprint.height;
        if (!inside && x >= 0 && y >= 0 && x < this.snapshot.topology.width && y < this.snapshot.topology.height && this.snapshot.topology.walkable[y * this.snapshot.topology.width + x] === 1) slots.push({ x, y });
      }
    }
    return slots.sort((left, right) => left.y - right.y || left.x - right.x);
  }

  private routeToAny(from: { x: number; y: number }, points: Array<{ x: number; y: number }>) {
    const labels = this.walkableComponentLabels();
    const fromIndex = from.y * this.snapshot.topology.width + from.x;
    const component = labels[fromIndex] ?? -1;
    const ranked = points
      .filter((point) => isWalkable(this.snapshot.topology, point) && labels[point.y * this.snapshot.topology.width + point.x] === component)
      .map((point) => ({ point, distance: Math.abs(point.x - from.x) + Math.abs(point.y - from.y) }))
      .sort((left, right) => left.distance - right.distance || left.point.y - right.point.y || left.point.x - right.point.x)
      .slice(0, 24);
    let best: { target: { x: number; y: number }; route: Array<{ x: number; y: number }>; cost: number } | undefined;
    for (const { point } of ranked) {
      const route = findPath(this.snapshot.topology, from, point);
      if (!route) continue;
      const target = route.at(-1) ?? { ...from };
      const cost = route.reduce((total, step) => total + this.snapshot.topology.moveCost[step.y * this.snapshot.topology.width + step.x], 0);
      if (!best || cost < best.cost || cost === best.cost && (target.y < best.target.y || target.y === best.target.y && target.x < best.target.x)) best = { target, route, cost };
    }
    return best;
  }

  private reachableTarget(from: { x: number; y: number }, points: Array<{ x: number; y: number }>) {
    const labels = this.walkableComponentLabels();
    const component = labels[from.y * this.snapshot.topology.width + from.x] ?? -1;
    const point = points
      .filter((candidate) => isWalkable(this.snapshot.topology, candidate) && labels[candidate.y * this.snapshot.topology.width + candidate.x] === component)
      .map((candidate) => ({ candidate, distance: Math.abs(candidate.x - from.x) + Math.abs(candidate.y - from.y) }))
      .sort((left, right) => left.distance - right.distance || left.candidate.y - right.candidate.y || left.candidate.x - right.candidate.x)[0]?.candidate;
    return point ? { target: { ...point }, route: [] as Array<{ x: number; y: number }>, cost: 0 } : undefined;
  }

  private walkableComponentLabels() {
    if (!this.componentCache || this.componentCache.revision !== this.snapshot.topology.topologyRevision) {
      this.componentCache = { revision: this.snapshot.topology.topologyRevision, labels: walkableComponents(this.snapshot.topology) };
    }
    return this.componentCache.labels;
  }

  private withSpatialLegality(citizen: CitizenState, citizens: CitizenState[], candidates: ActionCandidate[]) {
    return candidates.map((candidate) => {
      if (!candidate.legal || !candidate.intent) return candidate;
      const movement = this.planMovement(citizen, candidate.intent, citizens, true);
      return movement.reachable ? candidate : { ...candidate, legal: false, blockedBy: movement.blockedReason ?? "No reachable destination is currently available." };
    });
  }

  private planMovement(citizen: CitizenState, intent: ActionIntent, citizens: CitizenState[], reachabilityOnly = false): PlannedMovement {
    const world = this.snapshot.topology;
    const action = intent.kind;
    let points: Array<{ x: number; y: number }> = [];
    let targetCitizenId: number | undefined;
    let targetMode: PlannedMovement["targetMode"] = "self";
    let destinationRequired = false;
    let blockedReason = "The intended destination cannot be reached.";
    if (action === "socialize") {
      const others = citizens.filter((other) => other.id !== citizen.id);
      if (others.length) {
        const target = others[hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id) % others.length];
        targetCitizenId = target.id;
        targetMode = "citizen";
        destinationRequired = true;
        points = this.interactionSlots(target.position);
      }
    } else if (["request_item", "share_item", "steal_item", "barter_item", "rescue_person", "offer_project_help", "invite_project", "teach_technique", "warn_resource", "form_household", "form_group", "invite_group", "exclude_member", "promise_item", "fulfill_promise", "forgive", "retaliate"].includes(intent.kind)) {
      const social = intent as Extract<SocialIntent, { targetCitizenId: number }>;
      const target = citizens.find((other) => other.id === social.targetCitizenId);
      if (target) {
        targetCitizenId = target.id;
        targetMode = "citizen";
        destinationRequired = true;
        points = this.interactionSlots(target.position);
      }
    } else if (intent.kind === "claim_resource" || intent.kind === "challenge_claim" || intent.kind === "conceal_resource") {
      const node = this.snapshot.physicalWorld.resources[intent.nodeId];
      if (node) points = this.interactionSlots(node.position);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "forage_wild_food" || intent.kind === "gather_fiber" || intent.kind === "gather_branches" || intent.kind === "gather_loose_stone" || intent.kind === "fell_tree" || intent.kind === "quarry_stone" || intent.kind === "harvest_crop" || intent.kind === "sow_crop" || intent.kind === "tend_crop") {
      const node = this.snapshot.physicalWorld.resources[intent.nodeId];
      if (node) points = this.interactionSlots(node.position);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "collect_water" || intent.kind === "gather_clay" || intent.kind === "drink_natural_water" || intent.kind === "catch_fish") {
      points = world.locations.shore ?? [];
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "hunt_game") {
      points = Object.values(this.snapshot.physicalWorld.resources).filter((node) => node.kind === "tree").slice(0, 16).map((node) => ({ ...node.position }));
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "explore") {
      const known = new Set(citizen.knowledge?.discoveredTiles ?? []);
      const frontier = new Map<string, { x: number; y: number }>();
      for (const key of known) {
        const [x, y] = key.split(",").map(Number);
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
          const point = { x: x + dx, y: y + dy };
          const pointKey = `${point.x},${point.y}`;
          if (known.has(pointKey) || point.x < 0 || point.y < 0 || point.x >= world.width || point.y >= world.height || !world.walkable[point.y * world.width + point.x]) continue;
          frontier.set(pointKey, point);
        }
      }
      points = [...frontier.values()].sort((left, right) => left.y - right.y || left.x - right.x);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "draw_water") {
      const building = this.snapshot.physicalWorld.buildings[String(intent.buildingObjectUid)];
      if (building) points = this.interactionSlots(building.position, BUILDINGS[building.buildingType].footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "drink_water") {
      points = [{ ...citizen.position }];
    } else if (intent.kind === "propose_public_project") {
      points = this.snapshot.topology.locations.plaza ?? [];
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "start_construction") {
      const definition = BUILDINGS[intent.buildingType];
      points = this.interactionSlots({ x: intent.x, y: intent.y }, definition.footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "deliver_material" || intent.kind === "work_construction" || intent.kind === "cancel_project") {
      const project = this.snapshot.physicalWorld.projects[intent.projectId];
      if (project) points = this.interactionSlots(project.position, project.footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "repair_structure") {
      const target = intent.targetKind === "building" ? this.snapshot.physicalWorld.buildings[intent.targetId] : this.snapshot.physicalWorld.roads[intent.targetId];
      if (target) points = "buildingType" in target ? this.interactionSlots(target.position, BUILDINGS[target.buildingType].footprint) : [{ ...target.position }];
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "demolish_structure") {
      const building = this.snapshot.physicalWorld.buildings[String(intent.buildingObjectUid)];
      if (building) points = this.interactionSlots(building.position, BUILDINGS[building.buildingType].footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "move_home") {
      const building = this.snapshot.physicalWorld.buildings[String(intent.buildingObjectUid)];
      if (building) points = this.interactionSlots(building.position, BUILDINGS[building.buildingType].footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "operate_recipe" || intent.kind === "lease_facility") {
      const buildingUid = intent.kind === "operate_recipe" ? intent.facilityObjectUid : intent.buildingObjectUid;
      const building = this.snapshot.physicalWorld.buildings[String(buildingUid)];
      if (building) points = this.interactionSlots(building.position, BUILDINGS[building.buildingType].footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "buy_good") {
      const offer = this.snapshot.economy.offers[intent.offerId];
      const seller = offer ? this.snapshot.citizens[offer.sellerId] : undefined;
      if (seller) {
        targetCitizenId = seller.id;
        points = this.interactionSlots(seller.position);
      }
      targetMode = "citizen";
      destinationRequired = true;
      blockedReason = seller ? `${seller.name} cannot be reached to complete the trade.` : "The seller is no longer available.";
    } else if (intent.kind === "offer_job") {
      const worker = this.snapshot.citizens[intent.workerId];
      if (worker) {
        targetCitizenId = worker.id;
        points = this.interactionSlots(worker.position);
      }
      targetMode = "citizen";
      destinationRequired = true;
      blockedReason = worker ? `${worker.name} cannot be reached to receive the job offer.` : "The intended worker is no longer available.";
    } else if (intent.kind === "accept_job") {
      const contract = this.snapshot.economy.contracts[intent.contractId];
      const employer = contract ? this.snapshot.citizens[contract.employerId] : undefined;
      if (employer) {
        targetCitizenId = employer.id;
        points = this.interactionSlots(employer.position);
      }
      targetMode = "citizen";
      destinationRequired = true;
      blockedReason = employer ? `${employer.name} cannot be reached to accept the job.` : "The employer is no longer available.";
    } else if (intent.kind === "transfer_good") {
      const counterparty = [intent.from, intent.to].find((owner) => owner.kind === "citizen" && owner.id !== citizen.id);
      const businessId = intent.to.kind === "business" ? intent.to.id : intent.from.kind === "business" ? intent.from.id : undefined;
      const facilityUid = businessId ? this.snapshot.economy.businesses[businessId]?.facilityObjectUids[0] : undefined;
      const building = facilityUid ? this.snapshot.physicalWorld.buildings[String(facilityUid)] : undefined;
      const otherCitizen = counterparty?.kind === "citizen" ? this.snapshot.citizens[counterparty.id] : undefined;
      if (otherCitizen) {
        targetCitizenId = otherCitizen.id;
        points = this.interactionSlots(otherCitizen.position);
        targetMode = "citizen";
      } else {
        points = building ? this.interactionSlots(building.position, BUILDINGS[building.buildingType].footprint) : [{ ...citizen.position }];
        targetMode = building ? "static" : "self";
      }
      destinationRequired = Boolean(otherCitizen || building);
      if (otherCitizen) blockedReason = `${otherCitizen.name} cannot be reached for the transfer.`;
    } else if (intent.kind === "fuel_campfire" || intent.kind === "cook_food" || intent.kind === "boil_water") {
      const building = this.snapshot.physicalWorld.buildings[String(intent.buildingObjectUid)];
      if (building) points = this.interactionSlots(building.position, BUILDINGS[building.buildingType].footprint);
      targetMode = "static";
      destinationRequired = true;
    } else if (intent.kind === "craft_hand_axe" || intent.kind === "craft_stone_pick" || intent.kind === "craft_primitive" || intent.kind === "use_medicine") {
      points = [{ ...citizen.position }];
    } else if (intent.kind === "adopt_commitment" || intent.kind === "change_occupation" || intent.kind === "train_skill") {
      points = intent.kind === "train_skill" ? world.locations[`job:${citizen.job}`] ?? world.locations.plaza ?? [] : [{ ...citizen.position }];
    } else {
      const key = action === "eat" ? "food" : action === "rest" ? `home:${citizen.id}` : action === "gather_food" ? citizen.job === "fisher" ? "shore" : "fields" : action === "construct" ? "sites" : action === "work_job" ? `job:${citizen.job}` : "plaza";
      points = world.locations[key] ?? [];
      if (!points.length && action === "rest") points = world.locations.rest ?? [];
    }
    const reservedLocations = new Set(Object.values(this.snapshot.reservations).filter((reservation) => reservation.kind === "location").map((reservation) => reservation.key));
    points = points.filter((point) => !reservedLocations.has(`tile:${point.x},${point.y}`) || point.x === citizen.position.x && point.y === citizen.position.y);
    if (!points.length) {
      if (destinationRequired) return { target: { ...citizen.position }, route: [], targetCitizenId, targetMode, interactionRadius: targetMode === "citizen" ? 1 : 0, reachable: false, blockedReason };
      const radius = 1 + Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id)) % 4;
      points = [{ x: Math.max(0, Math.min(world.width - 1, citizen.position.x + (this.snapshot.tick % (radius * 2 + 1)) - radius)), y: Math.max(0, Math.min(world.height - 1, citizen.position.y + (citizen.id % (radius * 2 + 1)) - radius)) }];
    }
    let planned = reachabilityOnly ? this.reachableTarget(citizen.position, points) : this.routeToAny(citizen.position, points);
    if (intent.kind === "deliver_material" && intent.source === "stock" && planned) {
      const stores = Object.values(this.snapshot.physicalWorld.buildings)
        .filter((building) => (building.buildingType === "storage-pile" || building.buildingType === "storehouse") && building.condition >= 0.15)
        .sort((left, right) => Math.abs(left.position.x - citizen.position.x) + Math.abs(left.position.y - citizen.position.y) - (Math.abs(right.position.x - citizen.position.x) + Math.abs(right.position.y - citizen.position.y)) || left.objectUid - right.objectUid);
      const pickupPoints = stores.length
        ? stores.flatMap((store) => this.interactionSlots(store.position, BUILDINGS[store.buildingType].footprint))
        : [...(world.locations.plaza ?? [])];
      const availablePickups = pickupPoints.filter((point) => !reservedLocations.has(`tile:${point.x},${point.y}`));
      const pickup = reachabilityOnly ? this.reachableTarget(citizen.position, availablePickups) : this.routeToAny(citizen.position, availablePickups);
      if (!pickup) return { target: { ...citizen.position }, route: [], targetMode: "static", interactionRadius: 0, reachable: false, blockedReason: "No reachable common storage point holds the promised materials." };
      const delivery = reachabilityOnly ? this.reachableTarget(pickup.target, points) : this.routeToAny(pickup.target, points);
      if (!delivery) return { target: pickup.target, route: pickup.route, targetMode: "static", interactionRadius: 0, reachable: false, blockedReason };
      planned = { target: delivery.target, route: [...pickup.route, ...delivery.route], cost: pickup.cost + delivery.cost };
    }
    if (!planned) return { target: { ...citizen.position }, route: [], targetCitizenId, targetMode, interactionRadius: targetMode === "citizen" ? 1 : 0, reachable: !destinationRequired, ...(destinationRequired ? { blockedReason } : {}) };
    return { target: planned.target, route: planned.route, targetCitizenId, targetMode, interactionRadius: targetMode === "citizen" ? 1 : 0, reachable: true };
  }

  private executeEconomic(citizen: CitizenState, intent: Exclude<ActionIntent, { kind: "eat" | "rest" | "gather_food" | "work_job" | "socialize" | "construct" | "idle" }>, citizens: CitizenState[]) {
    const economy = this.snapshot.economy;
    const goal = this.snapshot.civilizationGoal;
    const transaction = (entry: EconomyState["transactions"][number]) => {
      economy.transactions = [entry, ...economy.transactions].slice(0, 5_000);
    };
    const adoptCharter = () => {
      const charter = economy.charter!;
      charter.status = "adopted";
      charter.resolvedAtTick = this.snapshot.tick;
      economy.policies = { ...economy.policies, privateProperty: true, currency: true, contracts: true };
      for (const inhabitant of citizens) {
        economy.wallets[inhabitant.id] = (economy.wallets[inhabitant.id] ?? 0) + 20;
        transaction({ id: `transaction-founding-${this.snapshot.tick}-${inhabitant.id}`, tick: this.snapshot.tick, kind: "founding-allocation", fromId: "settlement:mint", toId: `citizen:${inhabitant.id}`, money: 20 });
      }
      economy.moneySupply += citizens.length * 20;
    };
    let title = `${citizen.name} advances the market economy`;
    let consequences: string[] = [];
    let category: SimulationEvent["category"] = "economic";
    let citizenIds = [citizen.id];
    const resourceDelta: Record<string, number> = {};

    switch (intent.kind) {
      case "propose_market_charter":
        economy.charter = {
          id: `charter-${this.snapshot.tick}-${citizen.id}`,
          proposerId: citizen.id,
          supporterIds: [citizen.id],
          opponentIds: [],
          status: "open",
          createdAtTick: this.snapshot.tick,
        };
        if (citizens.length === 1) {
          adoptCharter();
          title = `${citizen.name} adopts a market charter`;
          consequences = ["The settlement's sole citizen approved private property, currency, and enforceable contracts.", "20 shells entered circulation."];
        } else {
          title = `${citizen.name} proposes a market charter`;
          consequences = ["A vote opened on private property, currency, and enforceable contracts.", `${Math.floor(citizens.length / 2) + 1} supporters are needed.`];
        }
        category = "civic";
        break;
      case "support_market_charter":
      case "oppose_market_charter": {
        const charter = economy.charter!;
        const support = intent.kind === "support_market_charter";
        (support ? charter.supporterIds : charter.opponentIds).push(citizen.id);
        const majority = Math.floor(citizens.length / 2) + 1;
        if (charter.supporterIds.length >= majority) {
          adoptCharter();
          title = "The settlement adopts a market charter";
          consequences = [`${charter.supporterIds.length} of ${citizens.length} citizens supported the charter.`, "Every citizen received 20 shells; ownership, trade, and contracts are now legal."];
          citizenIds = citizens.map((item) => item.id);
        } else if (charter.opponentIds.length >= majority) {
          charter.status = "rejected";
          charter.resolvedAtTick = this.snapshot.tick;
          title = "The settlement rejects the market charter";
          consequences = [`${charter.opponentIds.length} of ${citizens.length} citizens opposed the charter.`, "The village remains a shared-store economy."];
          citizenIds = citizens.map((item) => item.id);
        } else {
          title = `${citizen.name} ${support ? "supports" : "opposes"} the market charter`;
          consequences = [`The vote stands at ${charter.supporterIds.length} for and ${charter.opponentIds.length} against.`];
        }
        category = "civic";
        break;
      }
      case "register_business": {
        const fee = 5;
        economy.wallets[citizen.id] -= fee;
        economy.treasury += fee;
        const id = `business-${this.snapshot.tick}-${citizen.id}`;
        economy.businesses[id] = {
          id,
          name: businessName(citizen, intent.businessKind),
          kind: intent.businessKind,
          ownerId: citizen.id,
          capital: 0,
          inventory: {},
          employeeIds: [],
          organization: "sole-proprietorship",
          facilityObjectUids: [],
          blockers: ["No physical workplace is owned or leased."],
          productionRuns: 0,
          createdAtTick: this.snapshot.tick,
        };
        economy.ownership.push(
          { assetId: id, assetKind: "business", ownerId: citizen.id, acquiredAtTick: this.snapshot.tick },
          { assetId: `license-${intent.businessKind}-${citizen.id}`, assetKind: "productive-license", ownerId: citizen.id, acquiredAtTick: this.snapshot.tick },
        );
        title = `${citizen.name} registers ${economy.businesses[id].name}`;
        consequences = [`5 shells moved to the settlement treasury.`, `${citizen.name} now owns a registered ${intent.businessKind} business.`];
        break;
      }
      case "list_good": {
        const inventory = intent.ownerType === "business" ? economy.businesses[intent.ownerId]!.inventory : citizen.inventory;
        inventory[intent.resource] -= intent.amount;
        const id = `offer-${this.snapshot.tick}-${citizen.id}-${intent.resource}`;
        const businessId = intent.ownerType === "business" ? intent.ownerId : undefined;
        const hasOwnedStall = businessId !== undefined && Object.values(this.snapshot.physicalWorld.buildings).some((building) => building.buildingType === "stall" && building.condition >= 0.4 && building.owner.kind === "business" && building.owner.id === businessId);
        const listedFoodLot = Object.values(this.snapshot.physicalWorld.foodLots)
          .filter((lot) => lot.resource === intent.resource && lot.owner.kind === intent.ownerType && (lot.owner.kind === "citizen" ? String(lot.owner.id) : lot.owner.id) === intent.ownerId)
          .sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id))[0];
        if (listedFoodLot) {
          listedFoodLot.amount -= intent.amount;
          if (listedFoodLot.amount <= 0) delete this.snapshot.physicalWorld.foodLots[listedFoodLot.id];
        }
        economy.offers[id] = {
          id,
          sellerId: citizen.id,
          ...(businessId ? { businessId } : {}),
          sourceOwnerType: intent.ownerType,
          sourceOwnerId: intent.ownerId,
          resource: intent.resource,
          amountRemaining: intent.amount,
          unitPrice: intent.unitPrice,
          status: "open",
          createdAtTick: this.snapshot.tick,
          expiresAtTick: this.snapshot.tick + legacyDurationTicks(hasOwnedStall ? 48 : 24),
          ...(listedFoodLot ? { foodLot: { producedAtTick: listedFoodLot.producedAtTick, expiresAtTick: listedFoodLot.expiresAtTick, ...(listedFoodLot.storageBuildingUid ? { storageBuildingUid: listedFoodLot.storageBuildingUid } : {}) } } : {}),
        };
        title = `${citizen.name} lists ${intent.resource} for sale`;
        consequences = [`${intent.amount} ${intent.resource} entered market escrow.`, `The asking price is ${intent.unitPrice} shells each.`, ...(hasOwnedStall ? ["The business's market stall keeps this offer open twice as long."] : [])];
        break;
      }
      case "buy_good": {
        const offer = economy.offers[intent.offerId]!;
        const total = offer.unitPrice * intent.amount;
        economy.wallets[citizen.id] -= total;
        const sellingBusiness = offer.businessId ? economy.businesses[offer.businessId] : undefined;
        if (sellingBusiness) sellingBusiness.capital += total;
        else economy.wallets[offer.sellerId] = (economy.wallets[offer.sellerId] ?? 0) + total;
        citizen.inventory[offer.resource] = (citizen.inventory[offer.resource] ?? 0) + intent.amount;
        if (offer.foodLot && ["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"].includes(offer.resource)) {
          const lotId = `food:${this.snapshot.tick}:trade:${citizen.id}:${offer.id}`;
          this.snapshot.physicalWorld.foodLots[lotId] = { id: lotId, resource: offer.resource as "berries" | "meat" | "cooked_meal" | "wheat" | "fish" | "bread" | "cabbage" | "pumpkin", amount: intent.amount, owner: { kind: "citizen", id: citizen.id }, producedAtTick: offer.foodLot.producedAtTick, expiresAtTick: offer.foodLot.expiresAtTick, ...(offer.foodLot.storageBuildingUid ? { storageBuildingUid: offer.foodLot.storageBuildingUid } : {}) };
        }
        offer.amountRemaining -= intent.amount;
        if (offer.amountRemaining === 0) offer.status = "filled";
        economy.priceHistory[offer.resource] = [...(economy.priceHistory[offer.resource] ?? []), { tick: this.snapshot.tick, unitPrice: offer.unitPrice }].slice(-200);
        transaction({ id: `transaction-trade-${this.snapshot.tick}-${citizen.id}-${offer.id}`, tick: this.snapshot.tick, kind: "trade", fromId: `citizen:${citizen.id}`, toId: sellingBusiness ? `business:${sellingBusiness.id}` : `citizen:${offer.sellerId}`, money: total, resource: offer.resource, amount: intent.amount, offerId: offer.id });
        title = `${citizen.name} buys ${offer.resource}`;
        consequences = [`${total} shells moved to ${sellingBusiness ? `${sellingBusiness.name}'s capital` : "the seller"}.`, `${intent.amount} ${offer.resource} moved into ${citizen.name}'s inventory.`];
        citizenIds = [citizen.id, offer.sellerId];
        break;
      }
      case "invest_business": {
        const business = economy.businesses[intent.businessId]!;
        economy.wallets[citizen.id] -= intent.amount;
        business.capital += intent.amount;
        transaction({ id: `transaction-investment-${this.snapshot.tick}-${citizen.id}`, tick: this.snapshot.tick, kind: "investment", fromId: `citizen:${citizen.id}`, toId: `business:${business.id}`, money: intent.amount });
        title = `${citizen.name} reinvests in ${business.name}`;
        consequences = [`${intent.amount} shells moved from the owner into business capital.`];
        break;
      }
      case "offer_job": {
        const business = economy.businesses[intent.businessId]!;
        const id = `contract-${this.snapshot.tick}-${business.id}-${intent.workerId}`;
        business.capital -= intent.wage;
        economy.contracts[id] = { id, businessId: business.id, employerId: citizen.id, workerId: intent.workerId, wage: intent.wage, escrowedWage: intent.wage, status: "offered", createdAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(24) };
        const worker = this.snapshot.citizens[intent.workerId];
        title = `${citizen.name} offers ${worker.name} paid work`;
        consequences = [`${intent.wage} shells are available from ${business.name} when the offer is accepted.`];
        citizenIds = [citizen.id, worker.id];
        break;
      }
      case "accept_job": {
        const contract = economy.contracts[intent.contractId]!;
        const business = economy.businesses[contract.businessId]!;
        contract.status = "active";
        contract.acceptedAtTick = this.snapshot.tick;
        if (!business.employeeIds.includes(citizen.id)) business.employeeIds.push(citizen.id);
        title = `${citizen.name} accepts work at ${business.name}`;
        consequences = [`${contract.wage} shells remain protected in contract escrow until the promised work completes.`, "The employment contract is now active."];
        citizenIds = [citizen.id, contract.employerId];
        break;
      }
      case "adopt_commitment": {
        citizen.commitment = {
          id: `commitment-${this.snapshot.tick}-${citizen.id}`,
          kind: intent.commitmentKind,
          objective: intent.objective,
          strategy: intent.strategy,
          status: "active",
          createdAtTick: this.snapshot.tick,
          updatedAtTick: this.snapshot.tick,
          progress: 0,
          ...(intent.targetId ? { targetId: intent.targetId } : {}),
        };
        title = `${citizen.name} commits to ${intent.objective.toLowerCase()}`;
        consequences = [`Persistent objective: ${intent.objective}.`, `Chosen strategy: ${intent.strategy}`];
        category = "work";
        break;
      }
      case "change_occupation": {
        const previous = citizen.job;
        citizen.job = intent.occupation;
        citizen.goal = GOALS[intent.occupation] ?? citizen.goal;
        citizen.commitment = {
          id: `commitment-${this.snapshot.tick}-${citizen.id}`,
          kind: "learning",
          objective: `Become capable as a ${intent.occupation}`,
          strategy: intent.reason,
          status: "active",
          createdAtTick: this.snapshot.tick,
          updatedAtTick: this.snapshot.tick,
          progress: intent.occupation === "builder" ? skillLevel(citizen, "construction") : 0,
        };
        title = `${citizen.name} changes occupation`;
        consequences = [`${citizen.name} left ${previous} work and became a ${intent.occupation}.`, intent.reason];
        category = "work";
        break;
      }
      case "train_skill": {
        const level = gainSkill(citizen, intent.skill, 8);
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.05);
        if (citizen.commitment?.status === "active" && citizen.commitment.kind === "learning") {
          citizen.commitment.progress = level;
          citizen.commitment.updatedAtTick = this.snapshot.tick;
          if (level >= 0.35) citizen.commitment.status = "completed";
        }
        title = `${citizen.name} practices ${intent.skill}`;
        consequences = [`${intent.skill} skill reached ${Math.round(level * 100)}%.`, "Practice consumed time and energy but created no material resource."];
        category = "work";
        break;
      }
      case "lease_facility": {
        const business = economy.businesses[intent.businessId]!;
        const building = this.snapshot.physicalWorld.buildings[String(intent.buildingObjectUid)]!;
        business.capital -= intent.rent;
        economy.treasury += intent.rent;
        building.operatorBusinessId = business.id;
        if (!business.facilityObjectUids.includes(building.objectUid)) business.facilityObjectUids.push(building.objectUid);
        business.blockers = [];
        title = `${business.name} leases a ${building.buildingType}`;
        consequences = [`${intent.rent} shell moved from business capital to the public treasury.`, `Facility #${building.objectUid} is now physically available to ${business.name}.`];
        break;
      }
      case "transfer_good": {
        const executionContext = { stock: this.snapshot.stock, citizen, citizens, economy };
        const source = inventoryFor(intent.from, executionContext)!;
        const destination = inventoryFor(intent.to, executionContext)!;
        source[intent.resource] -= intent.amount;
        destination[intent.resource] = (destination[intent.resource] ?? 0) + intent.amount;
        const foodResources = new Set(["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"]);
        if (foodResources.has(intent.resource)) {
          let remaining = intent.amount;
          const sourceKey = intent.from.kind === "stock" ? "stock" : `${intent.from.kind}:${intent.from.id}`;
          const lots = Object.values(this.snapshot.physicalWorld.foodLots)
            .filter((lot) => lot.resource === intent.resource && (lot.owner.kind === "stock" ? "stock" : `${lot.owner.kind}:${lot.owner.id}`) === sourceKey)
            .sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id));
          for (const lot of lots) {
            if (remaining <= 0) break;
            const moved = Math.min(remaining, lot.amount);
            lot.amount -= moved;
            remaining -= moved;
            const id = `food:${this.snapshot.tick}:transfer:${citizen.id}:${lot.id}`;
            this.snapshot.physicalWorld.foodLots[id] = { ...lot, id, amount: moved, owner: structuredClone(intent.to) };
            if (lot.amount <= 0) delete this.snapshot.physicalWorld.foodLots[lot.id];
          }
        }
        title = `${citizen.name} transfers ${intent.resource}`;
        consequences = [`${intent.amount} ${intent.resource} moved from ${intent.from.kind} inventory to ${intent.to.kind} inventory.`, "No goods were created or destroyed."];
        category = "work";
        break;
      }
      case "operate_recipe": {
        const recipe = PRODUCTION_RECIPES[intent.recipeId]!;
        const executionContext = { stock: this.snapshot.stock, citizen, citizens, economy };
        const inventory = inventoryFor(intent.owner, executionContext)!;
        for (const [resource, amount] of Object.entries(recipe.inputs)) {
          if (["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"].includes(resource)) this.consumeFoodLots(intent.owner, resource, amount);
          inventory[resource] -= amount;
          resourceDelta[resource] = (resourceDelta[resource] ?? 0) - amount;
        }
        for (const [resource, amount] of Object.entries(recipe.outputs)) {
          inventory[resource] = (inventory[resource] ?? 0) + amount;
          resourceDelta[resource] = (resourceDelta[resource] ?? 0) + amount;
          if (["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"].includes(resource)) {
            const storehouse = Object.values(this.snapshot.physicalWorld.buildings).find((building) => building.buildingType === "storehouse" && building.condition >= 0.4);
            const id = `food:${this.snapshot.tick}:production:${citizen.id}:${resource}`;
            this.snapshot.physicalWorld.foodLots[id] = {
              id,
              resource: resource as "berries" | "meat" | "cooked_meal" | "wheat" | "fish" | "bread" | "cabbage" | "pumpkin",
              amount,
              owner: structuredClone(intent.owner),
              producedAtTick: this.snapshot.tick,
              expiresAtTick: this.snapshot.tick + legacyDurationTicks(storehouse ? 480 : 180),
              ...(storehouse ? { storageBuildingUid: storehouse.objectUid } : {}),
            };
          }
        }
        const building = this.snapshot.physicalWorld.buildings[String(intent.facilityObjectUid)]!;
        building.condition = clamp01(building.condition - recipe.facilityWear);
        const level = gainSkill(citizen, recipe.skill, 6);
        const business = intent.owner.kind === "business" ? economy.businesses[intent.owner.id] : undefined;
        if (business) {
          business.productionRuns += 1;
          business.blockers = [];
        }
        economy.production = [{
          id: `production-${this.snapshot.tick}-${citizen.id}-${recipe.id}`,
          recipeId: recipe.id,
          citizenId: citizen.id,
          ...(business ? { businessId: business.id } : {}),
          facilityObjectUid: building.objectUid,
          owner: structuredClone(intent.owner),
          inputs: { ...recipe.inputs },
          outputs: { ...recipe.outputs },
          completedAtTick: this.snapshot.tick,
        }, ...economy.production].slice(0, 5_000);
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.08);
        if (citizen.commitment?.status === "active" && ["production", "enterprise"].includes(citizen.commitment.kind)) {
          citizen.commitment.progress = clamp01(citizen.commitment.progress + 0.25);
          citizen.commitment.updatedAtTick = this.snapshot.tick;
          delete citizen.commitment.blocker;
          if (citizen.commitment.progress >= 1) citizen.commitment.status = "completed";
        }
        const activeContract = Object.values(economy.contracts).find((contract) => contract.workerId === citizen.id && contract.businessId === business?.id && contract.status === "active");
        if (activeContract) {
          activeContract.status = "completed";
          business!.employeeIds = business!.employeeIds.filter((id) => id !== citizen.id);
        }
        title = `${citizen.name} completes ${recipe.label.toLowerCase()}`;
        consequences = [
          `${Object.entries(recipe.inputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} were consumed from ${intent.owner.kind} inventory.`,
          `${Object.entries(recipe.outputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} entered the same owned inventory.`,
          `${recipe.skill} skill reached ${Math.round(level * 100)}%; ${building.buildingType} #${building.objectUid} incurred measurable wear.`,
        ];
        category = "work";
        break;
      }
    }

    refreshGoalProgress(goal, economy, this.snapshot.tick);
    refreshEconomicIndicators(economy, citizens);
    assertEconomyInvariants(economy, citizens, Object.values(this.snapshot.physicalWorld.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
    return { resourceDelta, activity: consequences[0], title, consequences, category, citizenIds, targetCitizenId: undefined };
  }

  private executePhysical(citizen: CitizenState, intent: Extract<ActionIntent, { kind: "forage_wild_food" | "gather_fiber" | "gather_branches" | "gather_loose_stone" | "craft_hand_axe" | "craft_stone_pick" | "craft_primitive" | "gather_clay" | "drink_natural_water" | "catch_fish" | "hunt_game" | "use_medicine" | "fuel_campfire" | "cook_food" | "boil_water" | "explore" | "fell_tree" | "quarry_stone" | "harvest_crop" | "sow_crop" | "tend_crop" | "collect_water" | "draw_water" | "drink_water" | "propose_public_project" | "start_construction" | "deliver_material" | "work_construction" | "cancel_project" | "repair_structure" | "demolish_structure" | "move_home" }>) {
    const physical = this.snapshot.physicalWorld;
    const resourceDelta: Record<string, number> = {};
    let activity = "Working in the settlement";
    let title = `${citizen.name} changes the physical world`;
    let consequences: string[] = [];
    let targetCitizenId: number | undefined;
    let category: SimulationEvent["category"] = "construction";
    citizen.toolDurability ??= {};
    const wearTool = (tool: string, amount = 1) => {
      if ((citizen.inventory[tool] ?? 0) < 1) return false;
      citizen.toolDurability![tool] = Math.max(0, (citizen.toolDurability![tool] ?? 1) - amount);
      if (citizen.toolDurability![tool] > 0) return false;
      citizen.inventory[tool] = Math.max(0, (citizen.inventory[tool] ?? 0) - 1);
      delete citizen.toolDurability![tool];
      return true;
    };

    switch (intent.kind) {
      case "forage_wild_food": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const amount = Math.max(1, Math.floor(node.yield.berries ?? 1));
        node.status = "depleted";
        node.depletedAtTick = this.snapshot.tick;
        node.regrowAtTick = this.snapshot.tick + legacyDurationTicks(180);
        citizen.inventory.berries = (citizen.inventory.berries ?? 0) + amount;
        const seeds = Math.max(0, Math.floor(node.yield.wild_seed ?? 0));
        if (seeds) citizen.inventory.wild_seed = (citizen.inventory.wild_seed ?? 0) + seeds;
        const herbs = Math.max(0, Math.floor(node.yield.herbs ?? 0));
        if (herbs) citizen.inventory.herbs = (citizen.inventory.herbs ?? 0) + herbs;
        const dryingRack = Object.values(physical.buildings).find((building) => building.buildingType === "drying-rack" && building.condition >= 0.15);
        const lotId = `food:${this.snapshot.tick}:${citizen.id}:${node.objectUid}`;
        physical.foodLots[lotId] = { id: lotId, resource: "berries", amount, owner: { kind: "citizen", id: citizen.id }, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(dryingRack ? 360 : 120), ...(dryingRack ? { storageBuildingUid: dryingRack.objectUid } : {}) };
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.04);
        gainSkill(citizen, "foraging", 2);
        citizen.knowledge!.knownResources = [...new Set([...citizen.knowledge!.knownResources, node.id])].slice(-80);
        resourceDelta.berries = amount;
        activity = `Carrying ${amount} wild berries`;
        title = `${citizen.name} forages from ${node.assetId} #${node.objectUid}`;
        consequences = [`${amount} berries entered ${citizen.name}'s inventory and will spoil if unused.`, seeds ? `${seeds} viable wild seed was kept rather than eaten.` : herbs ? `${herbs} medicinal herb was identified and kept.` : "This forage produced no viable seed.", "The wild source needs time to regrow."];
        break;
      }
      case "gather_fiber": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const amount = Math.max(1, Math.floor(node.yield.fiber ?? 1));
        node.status = "depleted";
        node.depletedAtTick = this.snapshot.tick;
        node.regrowAtTick = this.snapshot.tick + legacyDurationTicks(240);
        citizen.inventory.fiber = (citizen.inventory.fiber ?? 0) + amount;
        citizen.knowledge!.knownResources = [...new Set([...citizen.knowledge!.knownResources, node.id])].slice(-80);
        resourceDelta.fiber = amount;
        activity = `Bundling ${amount} plant fiber`;
        title = `${citizen.name} gathers reeds`;
        consequences = [`${amount} fiber entered ${citizen.name}'s inventory.`, "The reed bed needs time to recover."];
        break;
      }
      case "gather_branches": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        citizen.inventory.branches = (citizen.inventory.branches ?? 0) + 1;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.025);
        resourceDelta.branches = 1;
        activity = `Collecting fallen branches near ${node.assetId} #${node.objectUid}`;
        title = `${citizen.name} gathers a fallen branch`;
        consequences = ["1 branch entered personal inventory.", "The living tree was not damaged."];
        break;
      }
      case "gather_loose_stone": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        citizen.inventory.stone = (citizen.inventory.stone ?? 0) + 1;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.03);
        resourceDelta.stone = 1;
        activity = `Collecting loose stone near deposit #${node.objectUid}`;
        title = `${citizen.name} finds a workable stone`;
        consequences = ["1 loose stone entered personal inventory.", "The main deposit remains intact."];
        break;
      }
      case "craft_hand_axe":
      case "craft_stone_pick": {
        const tool = intent.kind === "craft_hand_axe" ? "hand_axe" : "stone_pick";
        citizen.inventory.branches = Math.max(0, (citizen.inventory.branches ?? 0) - 1);
        citizen.inventory.stone = Math.max(0, (citizen.inventory.stone ?? 0) - 1);
        citizen.inventory[tool] = (citizen.inventory[tool] ?? 0) + 1;
        citizen.toolDurability[tool] = tool === "hand_axe" ? 12 : 14;
        resourceDelta.branches = -1;
        resourceDelta.stone = -1;
        resourceDelta[tool] = 1;
        citizen.knowledge!.learnedTechniques = [...new Set([...citizen.knowledge!.learnedTechniques, intent.kind])];
        activity = `Binding a primitive ${tool.replaceAll("_", " ")}`;
        title = `${citizen.name} crafts a ${tool.replaceAll("_", " ")}`;
        consequences = ["1 branch and 1 stone were consumed.", `A ${tool.replaceAll("_", " ")} entered personal inventory with finite durability.`];
        break;
      }
      case "craft_primitive": {
        const recipe = PRIMITIVE_RECIPES[intent.recipeId];
        for (const [resource, amount] of Object.entries(recipe.inputs)) {
          citizen.inventory[resource] = Math.max(0, (citizen.inventory[resource] ?? 0) - amount);
          resourceDelta[resource] = (resourceDelta[resource] ?? 0) - amount;
          if ((citizen.inventory[resource] ?? 0) <= 0) delete citizen.toolDurability[resource];
        }
        for (const [resource, amount] of Object.entries(recipe.outputs)) {
          citizen.inventory[resource] = (citizen.inventory[resource] ?? 0) + amount;
          resourceDelta[resource] = (resourceDelta[resource] ?? 0) + amount;
          if (recipe.durability) citizen.toolDurability[resource] = recipe.durability;
        }
        citizen.knowledge!.learnedTechniques = [...new Set([...citizen.knowledge!.learnedTechniques, `craft:${intent.recipeId}`])];
        category = "work";
        activity = `Crafting ${recipe.label}`;
        title = `${citizen.name} crafts ${recipe.label}`;
        consequences = [`${Object.entries(recipe.inputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} were physically consumed.`, `${Object.entries(recipe.outputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} entered personal inventory${recipe.durability ? " with finite durability" : ""}.`];
        break;
      }
      case "gather_clay": {
        const clay = physical.renewableStocks.clay!;
        clay.amount = Math.max(0, clay.amount - 1);
        clay.lastHarvestedAtTick = this.snapshot.tick;
        citizen.inventory.clay = (citizen.inventory.clay ?? 0) + 1;
        resourceDelta.clay = 1;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.035);
        category = "work";
        activity = "Digging workable clay at the shore";
        title = `${citizen.name} gathers clay`;
        consequences = ["One clay moved from a tracked renewable bank into personal inventory.", `The clay bank now holds ${clay.amount.toFixed(1)} units.`];
        break;
      }
      case "drink_natural_water": {
        const water = physical.renewableStocks.water!;
        water.amount = Math.max(0, water.amount - 1);
        water.lastHarvestedAtTick = this.snapshot.tick;
        citizen.needs.thirst = clamp01((citizen.needs.thirst ?? 0.5) - 0.7);
        const contaminationRoll = (Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id, 97)) % 10_000) / 10_000;
        const becameIll = contaminationRoll < (this.snapshot.topology.environment?.harshness === "harsh" ? 0.18 : 0.1);
        if (becameIll) citizen.physical!.illness = clamp01(citizen.physical!.illness + 0.16);
        category = "need";
        activity = "Drinking directly from natural water";
        title = `${citizen.name} drinks at the shore`;
        consequences = [`Thirst fell to ${Math.round((citizen.needs.thirst ?? 0) * 100)}% without requiring a container.`, becameIll ? "The untreated water caused an illness." : "No immediate illness appeared, but the source was untreated."];
        break;
      }
      case "catch_fish": {
        const fish = physical.renewableStocks.fish!;
        const hasTool = (citizen.inventory.fishing_tool ?? 0) > 0;
        const roll = (Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id, 151)) % 10_000) / 10_000;
        const caught = hasTool || roll < 0.32;
        category = "work";
        activity = hasTool ? "Fishing with a crafted line" : "Trying to catch fish by hand";
        title = caught ? `${citizen.name} catches a fish` : `${citizen.name} fails to catch a fish`;
        if (caught) {
          fish.amount = Math.max(0, fish.amount - 1);
          fish.lastHarvestedAtTick = this.snapshot.tick;
          citizen.inventory.fish = (citizen.inventory.fish ?? 0) + 1;
          resourceDelta.fish = 1;
          const lotId = `food:${this.snapshot.tick}:${citizen.id}:fish`;
          physical.foodLots[lotId] = { id: lotId, resource: "fish", amount: 1, owner: { kind: "citizen", id: citizen.id }, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(Object.values(physical.buildings).some((building) => building.buildingType === "drying-rack" && building.condition >= 0.15) ? 300 : 90) };
          const broke = hasTool && wearTool("fishing_tool");
          gainSkill(citizen, "fishing", hasTool ? 4 : 6);
          consequences = ["One fish left the tracked population and entered personal inventory as a perishable lot.", broke ? "The fishing tool broke after use." : `The fish population now holds ${fish.amount.toFixed(1)}.`];
        } else {
          gainSkill(citizen, "fishing", 1);
          consequences = ["No fish left the population and no food was created.", "Fishing by hand is possible but unreliable."];
        }
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.06);
        break;
      }
      case "hunt_game": {
        const game = physical.renewableStocks.game!;
        const roll = (Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id, 211)) % 10_000) / 10_000;
        const skill = citizen.skills.fishing?.level ?? 0;
        const success = roll < 0.58 + skill * 0.2;
        const broke = wearTool("spear");
        category = "work";
        activity = "Hunting wild game with a spear";
        title = success ? `${citizen.name} brings down wild game` : `${citizen.name}'s hunt fails`;
        if (success) {
          game.amount = Math.max(0, game.amount - 1);
          game.lastHarvestedAtTick = this.snapshot.tick;
          citizen.inventory.meat = (citizen.inventory.meat ?? 0) + 2;
          resourceDelta.meat = 2;
          const lotId = `food:${this.snapshot.tick}:${citizen.id}:meat`;
          physical.foodLots[lotId] = { id: lotId, resource: "meat", amount: 2, owner: { kind: "citizen", id: citizen.id }, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(Object.values(physical.buildings).some((building) => building.buildingType === "drying-rack" && building.condition >= 0.15) ? 300 : 80) };
          gainSkill(citizen, "hunting", 5);
          consequences = ["One animal left the tracked game population and produced two perishable meat.", broke ? "The spear broke after the hunt." : `The game population now holds ${game.amount.toFixed(1)}.`];
        } else {
          gainSkill(citizen, "hunting", 2);
          const injuryRoll = (Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id, 223)) % 10_000) / 10_000;
          if (injuryRoll < 0.18) {
            citizen.physical!.injury = clamp01(citizen.physical!.injury + 0.12);
            citizen.physical!.health = clamp01(citizen.physical!.health - 0.04);
          }
          consequences = ["No animal left the population and no meat was created.", broke ? "The spear broke during the failed hunt." : "The hunt consumed energy and carried a real injury risk."];
        }
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.12);
        break;
      }
      case "use_medicine": {
        citizen.inventory.basic_medicine = Math.max(0, (citizen.inventory.basic_medicine ?? 0) - 1);
        resourceDelta.basic_medicine = -1;
        const illnessBefore = citizen.physical!.illness;
        const injuryBefore = citizen.physical!.injury;
        citizen.physical!.illness = clamp01(citizen.physical!.illness - 0.28);
        citizen.physical!.injury = clamp01(citizen.physical!.injury - 0.16);
        citizen.physical!.health = clamp01(citizen.physical!.health + 0.06);
        gainSkill(citizen, "healing", 5);
        category = "need";
        activity = "Treating illness and injury with herbal medicine";
        title = `${citizen.name} uses basic medicine`;
        consequences = [`One basic medicine was consumed; illness fell from ${Math.round(illnessBefore * 100)}% to ${Math.round(citizen.physical!.illness * 100)}%.`, `Injury fell from ${Math.round(injuryBefore * 100)}% to ${Math.round(citizen.physical!.injury * 100)}%; health improved slightly.`];
        break;
      }
      case "fuel_campfire": {
        const fire = physical.buildings[String(intent.buildingObjectUid)];
        citizen.inventory.branches = Math.max(0, (citizen.inventory.branches ?? 0) - 1);
        fire.fuel = Math.min(96, (fire.fuel ?? 0) + 24);
        resourceDelta.branches = -1;
        category = "work";
        activity = `Feeding campfire #${fire.objectUid}`;
        title = `${citizen.name} keeps the campfire burning`;
        consequences = ["One carried branch was consumed as fuel.", `The fire now has ${Math.round(fire.fuel)} ticks of warmth and cooking time.`];
        break;
      }
      case "cook_food": {
        const fire = physical.buildings[String(intent.buildingObjectUid)];
        citizen.inventory[intent.resource] = Math.max(0, (citizen.inventory[intent.resource] ?? 0) - 1);
        citizen.inventory.cooked_meal = (citizen.inventory.cooked_meal ?? 0) + 1;
        fire.fuel = Math.max(0, (fire.fuel ?? 0) - 2);
        const rawLot = Object.values(physical.foodLots)
          .filter((lot) => lot.resource === intent.resource && lot.owner.kind === "citizen" && lot.owner.id === citizen.id)
          .sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id))[0];
        if (rawLot) {
          rawLot.amount -= 1;
          if (rawLot.amount <= 0) delete physical.foodLots[rawLot.id];
        }
        const lotId = `food:${this.snapshot.tick}:${citizen.id}:cooked`;
        physical.foodLots[lotId] = { id: lotId, resource: "cooked_meal", amount: 1, owner: { kind: "citizen", id: citizen.id }, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(240) };
        resourceDelta[intent.resource] = -1;
        resourceDelta.cooked_meal = 1;
        category = "work";
        activity = `Cooking ${intent.resource} at campfire #${fire.objectUid}`;
        title = `${citizen.name} cooks a meal`;
        consequences = [`One ${intent.resource} became one cooked meal; no food was created.`, "Cooking extended its safe lifetime and consumed two ticks of fire fuel."];
        break;
      }
      case "boil_water": {
        const fire = physical.buildings[String(intent.buildingObjectUid)];
        citizen.inventory.water = Math.max(0, (citizen.inventory.water ?? 0) - 1);
        citizen.inventory.clean_water = (citizen.inventory.clean_water ?? 0) + 1;
        fire.fuel = Math.max(0, (fire.fuel ?? 0) - 2);
        resourceDelta.water = -1;
        resourceDelta.clean_water = 1;
        category = "work";
        activity = `Boiling water at campfire #${fire.objectUid}`;
        title = `${citizen.name} makes water safe`;
        consequences = ["One carried unsafe water became one clean water.", "Two ticks of fire fuel were consumed; no water was created."];
        break;
      }
      case "explore": {
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.05);
        citizen.emotions!.confidence = clamp01(citizen.emotions!.confidence + 0.025);
        gainSkill(citizen, "foraging", 1);
        category = "world";
        activity = `Exploring around ${citizen.position.x},${citizen.position.y}`;
        title = `${citizen.name} explores unfamiliar ground`;
        consequences = [`Local terrain around ${citizen.position.x},${citizen.position.y} entered ${citizen.name}'s personal knowledge.`, "Only nearby resources and people became known; the rest of the map remains unknown to them."];
        break;
      }
      case "fell_tree": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const millBonus = Object.values(physical.buildings).some((building) => building.buildingType === "lumbermill" && building.condition >= 0.4) ? 1 : 0;
        const wood = Math.max(1, Math.floor(node.yield.wood ?? 1) + millBonus);
        node.status = "depleted";
        node.depletedAtTick = this.snapshot.tick;
        node.regrowAtTick = this.snapshot.tick + legacyDurationTicks(720);
        citizen.inventory.wood = (citizen.inventory.wood ?? 0) + wood;
        gainSkill(citizen, "logging", 5);
        const axeBroke = (citizen.inventory.hand_axe ?? 0) > 0 && wearTool("hand_axe");
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.12);
        const index = node.position.y * this.snapshot.topology.width + node.position.x;
        if (index >= 0 && index < this.snapshot.topology.walkable.length) this.snapshot.topology.walkable[index] = 1;
        this.snapshot.topology.topologyRevision += 1;
        activity = `Carrying ${wood} wood from ${node.assetId} #${node.objectUid}`;
        title = `${citizen.name} fells ${node.assetId} #${node.objectUid}`;
        consequences = [`The tree became a stump.`, `${wood} wood entered ${citizen.name}'s carried inventory.`, axeBroke ? "The primitive hand axe broke after the work." : "The cleared tile became walkable."];
        break;
      }
      case "quarry_stone": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const extracted = Object.fromEntries(Object.entries(node.yield).map(([resource, amount]) => [resource, Math.max(0, Math.floor(amount))]));
        node.status = "depleted";
        node.depletedAtTick = this.snapshot.tick;
        delete node.regrowAtTick;
        for (const [resource, amount] of Object.entries(extracted)) {
          citizen.inventory[resource] = (citizen.inventory[resource] ?? 0) + amount;
          resourceDelta[resource] = (resourceDelta[resource] ?? 0) + amount;
        }
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.14);
        gainSkill(citizen, "mining", 5);
        const pickBroke = (citizen.inventory.stone_pick ?? 0) > 0 && wearTool("stone_pick");
        const index = node.position.y * this.snapshot.topology.width + node.position.x;
        if (index >= 0 && index < this.snapshot.topology.walkable.length) this.snapshot.topology.walkable[index] = 1;
        this.snapshot.topology.topologyRevision += 1;
        const yieldLabel = Object.entries(extracted).map(([resource, amount]) => `${amount} ${resource}`).join(" and ");
        activity = `Carrying ${yieldLabel} from mineral deposit #${node.objectUid}`;
        title = `${citizen.name} quarries rock #${node.objectUid}`;
        consequences = ["The selected mineral deposit was depleted.", `${yieldLabel} entered ${citizen.name}'s carried inventory.`, pickBroke ? "The primitive stone pick broke after the work." : "The cleared tile became walkable."];
        break;
      }
      case "harvest_crop": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const farmBonus = Object.values(physical.buildings).some((building) => building.buildingType === "farm" && building.condition >= 0.4) ? 1 : 0;
        const resource = node.cropType ?? "wheat";
        const tendedBonus = (node.lastTendedAtTick ?? -1) >= (node.plantedAtTick ?? 0) ? 1 : 0;
        const amount = Math.max(1, Math.floor(node.yield[resource] ?? node.yield.wheat ?? 1) + farmBonus + tendedBonus);
        node.status = "depleted";
        node.depletedAtTick = this.snapshot.tick;
        delete node.regrowAtTick;
        node.cropStage = "fallow";
        node.growth = 0;
        node.moisture = Math.max(0.2, node.moisture ?? 0.5);
        node.health = 1;
        const seedResource = `${resource}_seed`;
        const seedAmount = Math.max(1, Math.floor(amount / 2));
        citizen.inventory[resource] = (citizen.inventory[resource] ?? 0) + amount;
        citizen.inventory[seedResource] = (citizen.inventory[seedResource] ?? 0) + seedAmount;
        resourceDelta[resource] = amount;
        resourceDelta[seedResource] = seedAmount;
        gainSkill(citizen, "farming", 5);
        const storehouse = Object.values(physical.buildings).find((building) => building.buildingType === "storehouse" && building.condition >= 0.15);
        const lotId = `food:${this.snapshot.tick}:${citizen.id}:${node.objectUid}`;
        physical.foodLots[lotId] = { id: lotId, resource, amount, owner: { kind: "citizen", id: citizen.id }, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(storehouse ? 480 : 180), ...(storehouse ? { storageBuildingUid: storehouse.objectUid } : {}) };
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.08);
        activity = `Carrying ${amount} ${resource} from plot #${node.objectUid}`;
        title = `${citizen.name} harvests ${resource} plot #${node.objectUid}`;
        consequences = [`${amount} ${resource} entered ${citizen.name}'s carried inventory as a dated food lot.`, `${seedAmount} durable ${resource} seed entered inventory separately and cannot be eaten accidentally.`, "The exact plot is fallow and must be sown again."];
        break;
      }
      case "sow_crop": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const seedResource = `${intent.cropType}_seed`;
        const usesDurableSeed = (citizen.inventory[seedResource] ?? 0) + (this.snapshot.stock[seedResource] ?? 0) >= 1;
        const consumedResource = usesDurableSeed ? seedResource : intent.cropType;
        const carriedSeed = (citizen.inventory[consumedResource] ?? 0) >= 1;
        const seedOwner: InventoryOwner = carriedSeed ? { kind: "citizen", id: citizen.id } : { kind: "stock" };
        if (carriedSeed) citizen.inventory[consumedResource] = Math.max(0, (citizen.inventory[consumedResource] ?? 0) - 1);
        else this.snapshot.stock[consumedResource] = Math.max(0, (this.snapshot.stock[consumedResource] ?? 0) - 1);
        if (!usesDurableSeed) this.consumeFoodLots(seedOwner, intent.cropType, 1);
        resourceDelta[consumedResource] = -1;
        node.cropType = intent.cropType;
        node.assetId = intent.cropType;
        node.cropStage = "sown";
        node.status = "depleted";
        node.plantedAtTick = this.snapshot.tick;
        node.depletedAtTick = this.snapshot.tick;
        node.growth = 0;
        node.moisture = Math.max(0.55, node.moisture ?? 0);
        node.health = 1;
        delete node.regrowAtTick;
        gainSkill(citizen, "farming", 3);
        activity = `Sowing ${intent.cropType} on plot #${node.objectUid}`;
        title = `${citizen.name} sows ${intent.cropType}`;
        consequences = [`One conserved ${usesDurableSeed ? `${intent.cropType} seed` : intent.cropType} from ${carriedSeed ? `${citizen.name}'s inventory` : "common stores"} was sown.`, "The fallow plot entered its sown stage; growth, moisture, health, and tending are tracked explicitly."];
        break;
      }
      case "tend_crop": {
        category = "work";
        const node = physical.resources[intent.nodeId];
        const nearbyWell = Object.values(physical.buildings).some((building) => building.buildingType === "well" && building.condition >= 0.15 && Math.abs(building.position.x - node.position.x) + Math.abs(building.position.y - node.position.y) <= 8);
        const groundwater = physical.renewableStocks.water;
        const usedWellWater = nearbyWell && (groundwater?.amount ?? 0) >= 1;
        const usedCarriedWater = !usedWellWater && (citizen.inventory.water ?? 0) > 0;
        if (usedWellWater && groundwater) {
          groundwater.amount = Math.max(0, groundwater.amount - 1);
          groundwater.lastHarvestedAtTick = this.snapshot.tick;
        }
        if (usedCarriedWater) citizen.inventory.water = Math.max(0, (citizen.inventory.water ?? 0) - 1);
        node.moisture = clamp01((node.moisture ?? 0) + (usedWellWater || usedCarriedWater ? 0.55 : 0.08));
        node.health = clamp01((node.health ?? 1) + 0.18);
        node.growth = clamp01((node.growth ?? 0) + (usedWellWater || usedCarriedWater ? 0.08 : 0.04));
        node.lastTendedAtTick = this.snapshot.tick;
        node.cropStage = "growing";
        gainSkill(citizen, "farming", 2);
        activity = `Tending ${node.cropType ?? "crop"} plot #${node.objectUid}`;
        title = `${citizen.name} tends a growing crop`;
        consequences = [usedWellWater ? "The nearby well drew one unit from the tracked water table for irrigation." : usedCarriedWater ? "One carried water was used for irrigation." : "The crop was weeded and tended without irrigation.", "Crop moisture, health, and expected yield improved."];
        break;
      }
      case "collect_water": {
        category = "need";
        const groundwater = physical.renewableStocks.water!;
        groundwater.amount = Math.max(0, groundwater.amount - 1);
        groundwater.lastHarvestedAtTick = this.snapshot.tick;
        citizen.inventory.water = (citizen.inventory.water ?? 0) + 1;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.04);
        activity = "Carrying untreated water from the shore";
        title = `${citizen.name} collects water from the shore`;
        consequences = ["One untreated water moved from the tracked water table into personal inventory.", `The water table now holds ${groundwater.amount.toFixed(1)} water.`];
        break;
      }
      case "draw_water": {
        category = "work";
        const groundwater = physical.renewableStocks.water!;
        groundwater.amount = Math.max(0, groundwater.amount - 2);
        groundwater.lastHarvestedAtTick = this.snapshot.tick;
        citizen.inventory.water = (citizen.inventory.water ?? 0) + 2;
        activity = `Carrying water from well #${intent.buildingObjectUid}`;
        title = `${citizen.name} draws water`;
        consequences = ["Two water moved from the tracked water table into personal inventory.", `The water table now holds ${groundwater.amount.toFixed(1)} water.`];
        break;
      }
      case "drink_water": {
        category = "need";
        const drankCleanWater = (citizen.inventory.clean_water ?? 0) > 0;
        const drankCarriedWater = drankCleanWater || (citizen.inventory.water ?? 0) > 0;
        if (drankCleanWater) citizen.inventory.clean_water = Math.max(0, (citizen.inventory.clean_water ?? 0) - 1);
        else if (drankCarriedWater) citizen.inventory.water = Math.max(0, (citizen.inventory.water ?? 0) - 1);
        else {
          this.snapshot.stock.water = Math.max(0, (this.snapshot.stock.water ?? 0) - 1);
          resourceDelta.water = -1;
        }
        citizen.needs.thirst = clamp01((citizen.needs.thirst ?? 0.5) - 0.58);
        activity = drankCleanWater ? "Drinking boiled water" : drankCarriedWater ? "Drinking carried water" : "Drinking from the common water stores";
        title = `${citizen.name} drinks water`;
        consequences = [`One ${drankCleanWater ? "clean" : drankCarriedWater ? "carried untreated" : "shared"} water was consumed.`, `Thirst fell to ${Math.round((citizen.needs.thirst ?? 0) * 100)}%.`];
        break;
      }
      case "propose_public_project": {
        category = "civic";
        const proposalId = `proposal-project-${this.snapshot.tick}-${citizen.id}`;
        const proposalKind = intent.plan.operation === "demolish" ? "demolition" : intent.plan.operation === "repair" ? "major-repair" : "public-project";
        this.snapshot.politics.proposals[proposalId] = {
          id: proposalId,
          policyId: "settlement-expansion",
          kind: proposalKind,
          projectPlan: structuredClone(intent.plan),
          sponsorId: citizen.id,
          eligibleVoterIds: Object.keys(this.snapshot.citizens).map(Number).sort((a, b) => a - b),
          ballots: {}, status: "voting", createdAtTick: this.snapshot.tick, tally: { support: 0, oppose: 0, abstain: 0 },
        };
        this.snapshot.politics.activeProposalId = proposalId;
        activity = `Campaigning for ${intent.plan.label}`;
        title = `${citizen.name} proposes ${intent.plan.label}`;
        consequences = [`A settlement-wide vote opened for ${Object.keys(this.snapshot.citizens).length} citizens.`, `The immutable plan requests ${intent.plan.budget} shells, ${Object.entries(intent.plan.required).map(([resource, amount]) => `${amount} ${resource}`).join(", ")}, and ${intent.plan.laborRequired} labor.`];
        break;
      }
      case "start_construction": {
        const definition = BUILDINGS[intent.buildingType];
        const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
        const budget = mandate?.plan.budget ?? (intent.owner.kind === "public" ? 0 : definition.moneyCost);
        if (intent.owner.kind === "citizen" && budget > 0) this.snapshot.economy.wallets[intent.owner.id] -= budget;
        if (intent.owner.kind === "business" && budget > 0) this.snapshot.economy.businesses[intent.owner.id].capital -= budget;
        if (intent.owner.kind === "public" && budget > 0) this.snapshot.economy.treasury -= budget;
        const objectUid = physical.nextObjectUid++;
        const id = `project:${objectUid}`;
        const escrowId = `escrow:${objectUid}`;
        const required = mandate?.plan.required ?? definition.required;
        const laborRequired = mandate?.plan.laborRequired ?? definition.laborRequired;
        const project = {
          id,
          objectUid,
          buildingType: intent.buildingType,
          position: { x: intent.x, y: intent.y },
          workPosition: { x: intent.x + Math.floor(definition.footprint.width / 2), y: intent.y + definition.footprint.height },
          footprint: { ...definition.footprint },
          owner: structuredClone(intent.owner),
          requestedByCitizenId: citizen.id,
          status: "materials" as const,
          required: { ...required },
          delivered: Object.fromEntries(Object.keys(required).map((resource) => [resource, 0])),
          laborRequired,
          laborCompleted: 0,
          residentIds: [],
          capacity: definition.capacity,
          createdAtTick: this.snapshot.tick,
          escrowId,
          ...(intent.mandateId ? { mandateId: intent.mandateId } : {}),
          ...(intent.route?.length ? { roadRoute: intent.route.map((point) => ({ ...point })) } : {}),
        };
        physical.projects[id] = project;
        citizen.commitment = {
          id: `commitment-${this.snapshot.tick}-${citizen.id}`,
          kind: "construction",
          objective: `Complete ${definition.label}`,
          strategy: "Acquire missing materials, haul them, and contribute suitable labor.",
          status: "active",
          createdAtTick: this.snapshot.tick,
          updatedAtTick: this.snapshot.tick,
          progress: 0,
          targetId: id,
        };
        physical.escrows[escrowId] = { id: escrowId, projectId: id, payer: structuredClone(intent.owner), deposited: budget, balance: budget, spent: 0, refunded: 0, status: "held", payouts: [] };
        if (mandate) { mandate.status = "claimed"; mandate.projectId = id; }
        for (let dy = 0; dy < definition.footprint.height; dy += 1) for (let dx = 0; dx < definition.footprint.width; dx += 1) {
          const index = (intent.y + dy) * this.snapshot.topology.width + intent.x + dx;
          this.snapshot.topology.walkable[index] = 0;
        }
        this.snapshot.topology.topologyRevision += 1;
        activity = `Marked the ${definition.label} site at ${intent.x},${intent.y}`;
        title = `${citizen.name} establishes a ${definition.label} project`;
        consequences = [`Construction site #${objectUid} now exists on the map.`, `It requires ${Object.entries(required).map(([resource, amount]) => `${amount} ${resource}`).join(", ")} and ${laborRequired} labor.`, `${budget} shells are held in refundable project escrow.`];
        break;
      }
      case "deliver_material": {
        const project = physical.projects[intent.projectId];
        if (intent.source === "inventory") citizen.inventory[intent.resource] = Math.max(0, (citizen.inventory[intent.resource] ?? 0) - intent.amount);
        else {
          this.snapshot.stock[intent.resource] = Math.max(0, (this.snapshot.stock[intent.resource] ?? 0) - intent.amount);
          resourceDelta[intent.resource] = -intent.amount;
        }
        project.delivered[intent.resource] = (project.delivered[intent.resource] ?? 0) + intent.amount;
        const ready = Object.entries(project.required).every(([resource, amount]) => (project.delivered[resource] ?? 0) >= amount);
        if (ready) project.status = "building";
        activity = `Delivered ${intent.amount} ${intent.resource} to ${BUILDINGS[project.buildingType].label} #${project.objectUid}`;
        title = `${citizen.name} supplies a construction site`;
        const missing = Object.entries(project.required).filter(([resource, amount]) => (project.delivered[resource] ?? 0) < amount).map(([resource, amount]) => `${amount - (project.delivered[resource] ?? 0)} ${resource}`).join(", ");
        consequences = [`${intent.amount} ${intent.resource} moved into project storage.`, ready ? "All materials are ready; skilled or apprentice labor may begin." : `The project still needs ${missing}.`];
        break;
      }
      case "work_construction": {
        const project = physical.projects[intent.projectId];
        const constructionSkill = skillLevel(citizen, "construction");
        const labor = (citizen.job === "builder" || constructionSkill >= 0.45) && citizen.traits.includes("Diligent") ? 2 : 1;
        project.status = "building";
        project.laborCompleted = Math.min(project.laborRequired, project.laborCompleted + labor);
        const escrow = project.escrowId ? physical.escrows[project.escrowId] : undefined;
        const payout = Math.min(labor, escrow?.balance ?? 0);
        if (escrow && payout > 0) {
          escrow.balance -= payout;
          escrow.spent += payout;
          escrow.payouts.push({ citizenId: citizen.id, amount: payout, tick: this.snapshot.tick, reason: "labor" });
          this.snapshot.economy.wallets[citizen.id] = (this.snapshot.economy.wallets[citizen.id] ?? 0) + payout;
          this.snapshot.economy.transactions.unshift({ id: `transaction-project-wage-${project.objectUid}-${this.snapshot.tick}-${citizen.id}`, tick: this.snapshot.tick, kind: "wage", fromId: escrow.id, toId: `citizen:${citizen.id}`, money: payout });
        }
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.1);
        const learnedLevel = gainSkill(citizen, "construction", citizen.job === "builder" ? 5 : 8);
        if (citizen.commitment?.status === "active" && citizen.commitment.kind === "construction") {
          citizen.commitment.progress = project.laborCompleted / project.laborRequired;
          citizen.commitment.updatedAtTick = this.snapshot.tick;
        }
        if (project.laborCompleted >= project.laborRequired) {
          project.status = "complete";
          project.completedAtTick = this.snapshot.tick;
          if (project.buildingType === "road") {
            for (const point of project.roadRoute ?? [project.position]) {
              const roadId = `road:${point.x},${point.y}`;
              physical.roads[roadId] = { id: roadId, projectId: project.id, position: { ...point }, condition: 1, completedAtTick: this.snapshot.tick };
              const index = point.y * this.snapshot.topology.width + point.x;
              if (index >= 0 && index < this.snapshot.topology.moveCost.length) this.snapshot.topology.moveCost[index] = 450;
            }
            this.snapshot.topology.topologyRevision += 1;
          } else {
            physical.buildings[String(project.objectUid)] = {
              objectUid: project.objectUid,
              buildingType: project.buildingType,
              position: { ...project.position },
              owner: structuredClone(project.owner),
              capacity: project.capacity,
              residentIds: [],
              condition: 1,
              completedAtTick: this.snapshot.tick,
              ...(project.owner.kind === "business" ? { operatorBusinessId: project.owner.id } : {}),
            };
            if (project.buildingType === "garden-plot") {
              const cropObjectUid = physical.nextObjectUid++;
              const cropId = `crop:${cropObjectUid}`;
              const cropPosition = { x: project.position.x + 1, y: project.position.y };
              const environment = this.snapshot.topology.environment;
              const fertility = environment?.fertility[cropPosition.y * this.snapshot.topology.width + cropPosition.x] ?? 0.55;
              physical.resources[cropId] = {
                id: cropId, objectUid: cropObjectUid, assetId: "wheat", kind: "crop", position: cropPosition,
                yield: { wheat: Math.max(2, Math.round(2 + fertility * 2)) }, status: "depleted", cropType: "wheat", cropStage: "sown",
                plantedAtTick: this.snapshot.tick, depletedAtTick: this.snapshot.tick, growth: 0, moisture: Math.max(0.35, fertility), health: Math.max(0.5, fertility),
              };
            }
            if (project.owner.kind === "business") {
              const business = this.snapshot.economy.businesses[project.owner.id];
              if (business && !business.facilityObjectUids.includes(project.objectUid)) business.facilityObjectUids.push(project.objectUid);
            }
          }
          if (escrow) {
            if (escrow.balance > 0) {
              const refund = escrow.balance;
              escrow.balance = 0;
              escrow.refunded += refund;
              if (escrow.payer.kind === "public") this.snapshot.economy.treasury += refund;
              if (escrow.payer.kind === "citizen") this.snapshot.economy.wallets[escrow.payer.id] = (this.snapshot.economy.wallets[escrow.payer.id] ?? 0) + refund;
              if (escrow.payer.kind === "business" && this.snapshot.economy.businesses[escrow.payer.id]) this.snapshot.economy.businesses[escrow.payer.id].capital += refund;
            }
            escrow.status = "settled";
          }
          if (project.mandateId && physical.mandates[project.mandateId]) physical.mandates[project.mandateId].status = "fulfilled";
          for (const participant of Object.values(this.snapshot.citizens)) {
            if (participant.commitment?.status !== "active" || participant.commitment.kind !== "construction" || participant.commitment.targetId !== project.id) continue;
            participant.commitment.status = "completed";
            participant.commitment.progress = 1;
            participant.commitment.updatedAtTick = this.snapshot.tick;
          }
          if (project.buildingType === "hall") {
            for (const politicalCitizen of Object.values(this.snapshot.politics.citizens)) politicalCitizen.legitimacy = clamp01(politicalCitizen.legitimacy + 0.05);
            refreshPoliticalIndicators(this.snapshot.politics);
          }
          if (project.owner.kind !== "public") {
            const ownerId = project.owner.kind === "citizen" ? project.owner.id : this.snapshot.economy.businesses[project.owner.id]?.ownerId;
            if (ownerId !== undefined && !this.snapshot.economy.ownership.some((record) => record.assetId === `building:${project.objectUid}`)) {
              this.snapshot.economy.ownership.push({ assetId: `building:${project.objectUid}`, assetKind: "building", ownerId, acquiredAtTick: this.snapshot.tick });
            }
          }
          activity = `Completed ${BUILDINGS[project.buildingType].label} #${project.objectUid}`;
          title = `${citizen.name} completes a ${BUILDINGS[project.buildingType].label}`;
          consequences = [project.buildingType === "road" ? `${project.roadRoute?.length ?? 1} road segments now reduce travel cost.` : "The construction site became an operational building.", project.capacity ? `It can house ${project.capacity} residents.` : BUILDINGS[project.buildingType].effect, `Construction skill is now ${Math.round(learnedLevel * 100)}%.`, ...(payout ? [`${payout} shells were paid from escrow for verified labor.`] : [])];
        } else {
          const percent = Math.round(projectProgress(project) * 100);
          activity = `Building ${BUILDINGS[project.buildingType].label} #${project.objectUid}`;
          title = `${citizen.name} advances the ${BUILDINGS[project.buildingType].label}`;
          consequences = [`${labor} labor was completed.`, `The visible construction is now ${percent}% complete.`, ...(payout ? [`${payout} shells were paid from escrow.`] : [])];
        }
        break;
      }
      case "cancel_project": {
        const project = physical.projects[intent.projectId];
        const escrow = project.escrowId ? physical.escrows[project.escrowId] : undefined;
        if (escrow && escrow.balance > 0) {
          const refund = escrow.balance;
          escrow.balance = 0;
          escrow.refunded += refund;
          escrow.status = "refunded";
          if (escrow.payer.kind === "public") this.snapshot.economy.treasury += refund;
          if (escrow.payer.kind === "citizen") this.snapshot.economy.wallets[escrow.payer.id] = (this.snapshot.economy.wallets[escrow.payer.id] ?? 0) + refund;
          if (escrow.payer.kind === "business" && this.snapshot.economy.businesses[escrow.payer.id]) this.snapshot.economy.businesses[escrow.payer.id].capital += refund;
        }
        const materialOwner = project.owner.kind === "citizen" ? this.snapshot.citizens[project.owner.id]?.inventory : project.owner.kind === "business" ? this.snapshot.economy.businesses[project.owner.id]?.inventory : this.snapshot.stock;
        if (materialOwner) for (const [resource, amount] of Object.entries(project.delivered)) materialOwner[resource] = (materialOwner[resource] ?? 0) + amount;
        project.status = "cancelled";
        project.cancelledAtTick = this.snapshot.tick;
        project.cancellationReason = "The private payer cancelled the project.";
        for (let dy = 0; dy < project.footprint.height; dy += 1) for (let dx = 0; dx < project.footprint.width; dx += 1) this.snapshot.topology.walkable[(project.position.y + dy) * this.snapshot.topology.width + project.position.x + dx] = 1;
        this.snapshot.topology.topologyRevision += 1;
        activity = `Cancelled ${BUILDINGS[project.buildingType].label} #${project.objectUid}`;
        title = `${citizen.name} cancels a construction project`;
        consequences = ["Unspent escrow returned to the payer.", "Delivered materials returned to the owner while completed labor remained paid."];
        break;
      }
      case "repair_structure": {
        const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
        const required = mandate?.plan.required ?? { wood: 1, stone: 1 };
        for (const [resource, amount] of Object.entries(required)) {
          this.snapshot.stock[resource] = Math.max(0, (this.snapshot.stock[resource] ?? 0) - amount);
          resourceDelta[resource] = -amount;
        }
        if (intent.targetKind === "building") {
          const building = physical.buildings[intent.targetId];
          building.condition = clamp01(building.condition + 0.4);
          building.lastRepairedAtTick = this.snapshot.tick;
          if (building.condition >= 0.4) delete building.damagedAtTick;
        } else {
          const road = physical.roads[intent.targetId];
          road.condition = clamp01(road.condition + 0.5);
          road.lastRepairedAtTick = this.snapshot.tick;
          const index = road.position.y * this.snapshot.topology.width + road.position.x;
          this.snapshot.topology.moveCost[index] = road.condition < 0.4 ? 750 : 450;
        }
        if (mandate) {
          const payout = Math.min(mandate.plan.budget, this.snapshot.economy.treasury);
          this.snapshot.economy.treasury -= payout;
          this.snapshot.economy.wallets[citizen.id] = (this.snapshot.economy.wallets[citizen.id] ?? 0) + payout;
          mandate.status = "fulfilled";
        }
        activity = `Repairing ${intent.targetKind} ${intent.targetId}`;
        title = `${citizen.name} completes structural repairs`;
        consequences = [`${Object.entries(required).map(([resource, amount]) => `${amount} ${resource}`).join(" and ")} were consumed.`, "The target recovered condition and operational effectiveness."];
        break;
      }
      case "demolish_structure": {
        const building = physical.buildings[String(intent.buildingObjectUid)];
        const definition = BUILDINGS[building.buildingType];
        const salvageWood = Math.floor(definition.required.wood * building.condition * 0.5);
        const salvageStone = Math.floor(definition.required.stone * building.condition * 0.5);
        this.snapshot.stock.wood = (this.snapshot.stock.wood ?? 0) + salvageWood;
        this.snapshot.stock.stone = (this.snapshot.stock.stone ?? 0) + salvageStone;
        resourceDelta.wood = salvageWood;
        resourceDelta.stone = salvageStone;
        delete physical.buildings[String(building.objectUid)];
        for (const business of Object.values(this.snapshot.economy.businesses)) business.facilityObjectUids = business.facilityObjectUids.filter((uid) => uid !== building.objectUid);
        const demolitionId = `demolition:${building.objectUid}:${this.snapshot.tick}`;
        physical.demolitions[demolitionId] = {
          id: demolitionId,
          buildingObjectUid: building.objectUid,
          buildingType: building.buildingType,
          position: { ...building.position },
          owner: structuredClone(building.owner),
          conditionAtDemolition: building.condition,
          demolishedAtTick: this.snapshot.tick,
          salvaged: { wood: salvageWood, stone: salvageStone },
          ...(intent.mandateId ? { mandateId: intent.mandateId } : {}),
        };
        const sourceProject = physical.projects[`project:${building.objectUid}`];
        if (sourceProject) sourceProject.demolishedAtTick = this.snapshot.tick;
        this.snapshot.economy.ownership = this.snapshot.economy.ownership.filter((record) => record.assetId !== `building:${building.objectUid}`);
        for (let dy = 0; dy < definition.footprint.height; dy += 1) for (let dx = 0; dx < definition.footprint.width; dx += 1) this.snapshot.topology.walkable[(building.position.y + dy) * this.snapshot.topology.width + building.position.x + dx] = 1;
        this.snapshot.topology.topologyRevision += 1;
        if (intent.mandateId && physical.mandates[intent.mandateId]) physical.mandates[intent.mandateId].status = "fulfilled";
        activity = `Cleared former ${definition.label} #${building.objectUid}`;
        title = `${citizen.name} demolishes ${definition.label} #${building.objectUid}`;
        consequences = ["The exact footprint became buildable again.", `${salvageWood} wood and ${salvageStone} stone were recovered according to condition.`];
        break;
      }
      case "move_home": {
        const building = physical.buildings[String(intent.buildingObjectUid)];
        const dwelling = BUILDINGS[building.buildingType].label;
        building.residentIds.push(citizen.id);
        citizen.homeObjectUid = building.objectUid;
        citizen.happiness = clamp01(citizen.happiness + 0.12);
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue - 0.18);
        activity = `Living in ${dwelling} #${building.objectUid}`;
        title = `${citizen.name} moves into ${dwelling} #${building.objectUid}`;
        consequences = ["A previously homeless villager now has a fixed home.", "Housing improved happiness and rest."];
        targetCitizenId = citizen.id;
        break;
      }
    }
    this.snapshot.constructionProgress = constructionSummary(physical);
    assertPhysicalWorldInvariants(physical, Object.values(this.snapshot.citizens), this.snapshot.economy);
    refreshEconomicIndicators(this.snapshot.economy, Object.values(this.snapshot.citizens));
    assertEconomyInvariants(this.snapshot.economy, Object.values(this.snapshot.citizens), Object.values(physical.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
    return { resourceDelta, activity, title, consequences, category, citizenIds: [citizen.id], targetCitizenId };
  }

  private executeSocial(citizen: CitizenState, intent: SocialIntent, citizens: CitizenState[]) {
    const resourceDelta: Record<string, number> = {};
    const relation = (from: CitizenState, to: CitizenState) => {
      from.socialRelationships ??= {};
      return from.socialRelationships[to.id] ??= {
        trust: from.relationships[to.id] ?? 0.5,
        affection: 0.5,
        fear: 0,
        respect: 0.5,
        debt: 0,
        grievance: 0,
      };
    };
    const remember = (person: CitizenState, text: string, tone: MemoryRecord["tone"], subjectCitizenId?: number, salience = 0.65) => addMemory(person, {
      id: `memory-social-${this.snapshot.tick}-${person.id}-${person.memories.length}`,
      tick: this.snapshot.tick,
      text,
      tone,
      ...(subjectCitizenId === undefined ? {} : { subjectCitizenId }),
      salience,
      expiresAtTick: this.snapshot.tick + legacyDurationTicks(Math.max(120, Math.round(1_200 * salience))),
    });
    const transfer = (from: CitizenState, to: CitizenState, resource: string, amount: number) => {
      if ((from.inventory[resource] ?? 0) < amount) throw new Error(`${from.name} no longer carries enough ${resource}.`);
      from.inventory[resource] = Math.max(0, (from.inventory[resource] ?? 0) - amount);
      to.inventory[resource] = (to.inventory[resource] ?? 0) + amount;
      resourceDelta[`citizen:${from.id}:${resource}`] = -amount;
      resourceDelta[`citizen:${to.id}:${resource}`] = amount;
      let remaining = amount;
      const lots = Object.values(this.snapshot.physicalWorld.foodLots)
        .filter((lot) => lot.resource === resource && lot.owner.kind === "citizen" && lot.owner.id === from.id)
        .sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id));
      for (const lot of lots) {
        if (remaining <= 0) break;
        const moved = Math.min(remaining, lot.amount);
        lot.amount -= moved;
        remaining -= moved;
        const movedId = `food:${this.snapshot.tick}:social:${from.id}:${to.id}:${lot.id}`;
        this.snapshot.physicalWorld.foodLots[movedId] = { ...lot, id: movedId, amount: moved, owner: { kind: "citizen", id: to.id } };
        if (lot.amount <= 0) delete this.snapshot.physicalWorld.foodLots[lot.id];
      }
    };
    const target = "targetCitizenId" in intent ? citizens.find((other) => other.id === intent.targetCitizenId) : undefined;
    let title = `${citizen.name} reaches out`;
    let activity = "Negotiating with another survivor";
    let consequences: string[] = [];
    let citizenIds = target ? [citizen.id, target.id] : [citizen.id];
    let targetCitizenId = target?.id;
    const dissolveGroupIfTooSmall = (group: SimulationSnapshot["socialGroups"][string]) => {
      if (group.memberIds.length >= 2) return false;
      const remaining = group.memberIds[0] ? this.snapshot.citizens[group.memberIds[0]] : undefined;
      const destination = remaining?.inventory ?? this.snapshot.stock;
      for (const [resource, amount] of Object.entries(group.sharedInventory)) {
        destination[resource] = (destination[resource] ?? 0) + amount;
        resourceDelta[`${remaining ? `citizen:${remaining.id}` : "stock"}:${resource}`] = (resourceDelta[`${remaining ? `citizen:${remaining.id}` : "stock"}:${resource}`] ?? 0) + amount;
      }
      for (const memberId of group.memberIds) {
        const member = this.snapshot.citizens[memberId];
        if (member) member.groupIds = (member.groupIds ?? []).filter((id) => id !== group.id);
      }
      delete this.snapshot.socialGroups[group.id];
      return true;
    };

    switch (intent.kind) {
      case "request_item": {
        if (!target) throw new Error("The requested person no longer exists.");
        const targetView = relation(target, citizen);
        const willingness = (target.personality?.generosity ?? 0.5) * 0.42
          + (target.personality?.empathy ?? 0.5) * 0.28
          + targetView.trust * 0.24
          + (target.values?.community ?? 0.5) * 0.18
          - target.needs.hunger * 0.34
          - (target.personality?.acquisitiveness ?? 0.5) * 0.16;
        const accepts = (target.inventory[intent.resource] ?? 0) >= intent.amount && willingness >= 0.43;
        title = `${citizen.name} asks ${target.name} for ${intent.resource}`;
        activity = `Asking ${target.name} for ${intent.amount} ${intent.resource}`;
        if (accepts) {
          transfer(target, citizen, intent.resource, intent.amount);
          const requesterView = relation(citizen, target);
          requesterView.trust = clamp01(requesterView.trust + 0.1);
          requesterView.affection = clamp01(requesterView.affection + 0.06);
          requesterView.debt += intent.amount;
          citizen.relationships[target.id] = requesterView.trust;
          citizen.emotions!.gratitude = clamp01(citizen.emotions!.gratitude + 0.18);
          remember(citizen, `${target.name} gave me ${intent.amount} ${intent.resource} when I asked.`, "positive", target.id, 0.85);
          remember(target, `I chose to give ${citizen.name} ${intent.amount} ${intent.resource}.`, "positive", citizen.id, 0.55);
          consequences = [`${target.name} agreed and transferred ${intent.amount} ${intent.resource}.`, `${citizen.name} now feels indebted to ${target.name}.`];
        } else {
          const requesterView = relation(citizen, target);
          requesterView.trust = clamp01(requesterView.trust - 0.035);
          requesterView.grievance = clamp01(requesterView.grievance + 0.04);
          citizen.relationships[target.id] = requesterView.trust;
          citizen.emotions!.resentment = clamp01(citizen.emotions!.resentment + 0.05);
          remember(citizen, `${target.name} refused my request for ${intent.resource}.`, "negative", target.id, 0.55);
          consequences = [`${target.name} refused the request based on their needs, trust, and disposition.`, "No item changed hands."];
        }
        break;
      }
      case "share_item": {
        if (!target) throw new Error("The intended recipient no longer exists.");
        transfer(citizen, target, intent.resource, intent.amount);
        const recipientView = relation(target, citizen);
        recipientView.trust = clamp01(recipientView.trust + 0.11);
        recipientView.affection = clamp01(recipientView.affection + 0.07);
        recipientView.debt += intent.amount;
        target.relationships[citizen.id] = recipientView.trust;
        target.emotions!.gratitude = clamp01(target.emotions!.gratitude + 0.2);
        citizen.emotions!.hope = clamp01(citizen.emotions!.hope + 0.04);
        title = `${citizen.name} shares with ${target.name}`;
        activity = `Giving ${target.name} ${intent.amount} ${intent.resource}`;
        consequences = [`${intent.amount} ${intent.resource} moved between personal inventories.`, `${target.name}'s trust and sense of debt toward ${citizen.name} increased.`];
        remember(target, `${citizen.name} freely gave me ${intent.amount} ${intent.resource}.`, "positive", citizen.id, 0.88);
        remember(citizen, `I shared ${intent.amount} ${intent.resource} with ${target.name}.`, "positive", target.id, 0.62);
        break;
      }
      case "barter_item": {
        if (!target) throw new Error("The barter partner no longer exists.");
        const targetView = relation(target, citizen);
        const accepts = (target.inventory[intent.requestResource] ?? 0) >= intent.amount
          && ((target.inventory[intent.offerResource] ?? 0) < 1 || targetView.trust >= 0.46 || (target.values?.fairness ?? 0.5) >= 0.62);
        title = `${citizen.name} offers ${target.name} a barter`;
        activity = `Offering ${intent.amount} ${intent.offerResource} for ${intent.amount} ${intent.requestResource}`;
        if (accepts) {
          transfer(citizen, target, intent.offerResource, intent.amount);
          transfer(target, citizen, intent.requestResource, intent.amount);
          gainSkill(citizen, "trading", 4);
          gainSkill(target, "trading", 2);
          relation(citizen, target).trust = clamp01(relation(citizen, target).trust + 0.04);
          targetView.trust = clamp01(targetView.trust + 0.04);
          consequences = [`${intent.amount} ${intent.offerResource} and ${intent.amount} ${intent.requestResource} changed owners simultaneously.`, "No currency or public market was required."];
          remember(citizen, `${target.name} honored our barter.`, "positive", target.id, 0.68);
          remember(target, `${citizen.name} honored our barter.`, "positive", citizen.id, 0.68);
        } else {
          consequences = [`${target.name} declined the proposed exchange.`, "No inventory changed."];
          remember(citizen, `${target.name} declined my barter offer.`, "neutral", target.id, 0.42);
        }
        break;
      }
      case "rescue_person": {
        if (!target) throw new Error("The endangered person no longer exists.");
        const beforeHealth = target.physical!.health;
        const beforeExposure = target.physical!.exposure;
        target.needs.fatigue = clamp01(target.needs.fatigue - 0.28);
        target.physical!.health = clamp01(target.physical!.health + 0.12);
        target.physical!.exposure = clamp01(target.physical!.exposure - 0.14);
        target.physical!.lastRescuedAtTick = this.snapshot.tick;
        if (target.physical!.health > 0.18 && target.needs.fatigue < 0.96 && target.physical!.injury < 0.82) delete target.physical!.incapacitatedSinceTick;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.08);
        const carriedFood = foodKey(citizen.inventory);
        if (carriedFood && target.needs.hunger >= 0.72) transfer(citizen, target, carriedFood, 1);
        const carriedWater = (citizen.inventory.clean_water ?? 0) > 0 ? "clean_water" : (citizen.inventory.water ?? 0) > 0 ? "water" : undefined;
        if (carriedWater && (target.needs.thirst ?? 0) >= 0.72) transfer(citizen, target, carriedWater, 1);
        const rescuedView = relation(target, citizen);
        rescuedView.trust = clamp01(rescuedView.trust + 0.18);
        rescuedView.affection = clamp01(rescuedView.affection + 0.12);
        rescuedView.debt += 1;
        target.relationships[citizen.id] = rescuedView.trust;
        target.emotions!.gratitude = clamp01(target.emotions!.gratitude + 0.3);
        citizen.emotions!.hope = clamp01(citizen.emotions!.hope + 0.08);
        title = `${citizen.name} rescues ${target.name}`;
        activity = `Stabilizing ${target.name} after a collapse`;
        consequences = [`${target.name}'s health rose from ${Math.round(beforeHealth * 100)}% to ${Math.round(target.physical!.health * 100)}% and exposure fell from ${Math.round(beforeExposure * 100)}% to ${Math.round(target.physical!.exposure * 100)}%.`, carriedFood && target.needs.hunger >= 0.72 ? `One ${carriedFood} was physically transferred for recovery.` : "No food was created during the rescue.", carriedWater && (target.needs.thirst ?? 0) >= 0.72 ? `One ${carriedWater} was physically transferred.` : "No water was created during the rescue.", `${target.name} remembers who stopped to help.`];
        remember(target, `${citizen.name} stopped to rescue me when I could not keep going.`, "positive", citizen.id, 1);
        remember(citizen, `I chose to rescue ${target.name} instead of leaving them.`, "positive", target.id, 0.9);
        break;
      }
      case "offer_project_help": {
        if (!target) throw new Error("The project requester no longer exists.");
        const project = this.snapshot.physicalWorld.projects[intent.projectId];
        citizen.commitment = { id: `commitment-${this.snapshot.tick}-${citizen.id}`, kind: "construction", objective: `Help complete ${project.buildingType}`, strategy: "Gather missing material, deliver it, and contribute labor.", status: "active", createdAtTick: this.snapshot.tick, updatedAtTick: this.snapshot.tick, progress: projectProgress(project), targetId: project.id };
        const sharedProjectKnowledge = [...new Set([...(citizen.knowledge?.knownResources ?? []), ...(target.knowledge?.knownResources ?? [])])];
        citizen.knowledge!.knownResources = sharedProjectKnowledge.slice(-5_000);
        target.knowledge!.knownResources = sharedProjectKnowledge.slice(-5_000);
        const requesterView = relation(target, citizen);
        requesterView.trust = clamp01(requesterView.trust + 0.08);
        requesterView.respect = clamp01(requesterView.respect + 0.06);
        target.relationships[citizen.id] = requesterView.trust;
        title = `${citizen.name} offers practical help to ${target.name}`;
        activity = `Joining the ${project.buildingType} project voluntarily`;
        consequences = [`${citizen.name} adopted a persistent commitment to project ${project.id}.`, "They exchanged the resource locations each had personally discovered so the help can be practical.", `${target.name} remembers that the help was volunteered.`];
        remember(target, `${citizen.name} volunteered to help with my ${project.buildingType} project.`, "positive", citizen.id, 0.8);
        break;
      }
      case "invite_project": {
        if (!target) throw new Error("The invited helper no longer exists.");
        const project = this.snapshot.physicalWorld.projects[intent.projectId];
        const view = relation(target, citizen);
        const acceptance = view.trust * 0.32 + (target.personality?.industriousness ?? 0.5) * 0.3 + (target.values?.community ?? 0.5) * 0.24 - target.needs.fatigue * 0.18;
        title = `${citizen.name} asks ${target.name} to join a project`;
        activity = `Inviting help with the ${project.buildingType}`;
        if (acceptance >= 0.35) {
          target.commitment = { id: `commitment-${this.snapshot.tick}-${target.id}`, kind: "construction", objective: `Help complete ${project.buildingType}`, strategy: "Gather missing material, deliver it, and contribute labor.", status: "active", createdAtTick: this.snapshot.tick, updatedAtTick: this.snapshot.tick, progress: projectProgress(project), targetId: project.id };
          const sharedProjectKnowledge = [...new Set([...(citizen.knowledge?.knownResources ?? []), ...(target.knowledge?.knownResources ?? [])])];
          citizen.knowledge!.knownResources = sharedProjectKnowledge.slice(-5_000);
          target.knowledge!.knownResources = sharedProjectKnowledge.slice(-5_000);
          consequences = [`${target.name} accepted and adopted a persistent construction commitment.`, "They exchanged personally known resource locations; the invitation itself created no material or labor."];
          remember(citizen, `${target.name} agreed to help with my ${project.buildingType} project.`, "positive", target.id, 0.78);
          remember(target, `I agreed to help ${citizen.name} finish a ${project.buildingType}.`, "positive", citizen.id, 0.72);
        } else {
          consequences = [`${target.name} declined based on trust, fatigue, community values, and industriousness.`, "The project remains voluntary."];
          remember(citizen, `${target.name} declined my request for project help.`, "neutral", target.id, 0.45);
        }
        break;
      }
      case "steal_item": {
        if (!target) throw new Error("The intended victim no longer exists.");
        transfer(target, citizen, intent.resource, intent.amount);
        const detection = (Math.abs(hashSeed(this.snapshot.seed, this.snapshot.tick, citizen.id, target.id)) % 1_000) / 1_000;
        const noticed = detection < 0.45 + (target.personality?.emotionalSensitivity ?? 0.5) * 0.25;
        title = noticed ? `${target.name} catches ${citizen.name} stealing` : `${citizen.name} steals unnoticed`;
        activity = `Taking ${intent.amount} ${intent.resource} from ${target.name}`;
        consequences = [`${intent.amount} ${intent.resource} moved from ${target.name} to ${citizen.name}.`];
        remember(citizen, `I stole ${intent.amount} ${intent.resource} from ${target.name}${noticed ? " and was seen" : " without being seen"}.`, "negative", target.id, 0.8);
        if (noticed) {
          const victimView = relation(target, citizen);
          victimView.trust = clamp01(victimView.trust - 0.28);
          victimView.fear = clamp01(victimView.fear + 0.1);
          victimView.grievance = clamp01(victimView.grievance + 0.34);
          target.relationships[citizen.id] = victimView.trust;
          target.emotions!.anger = clamp01(target.emotions!.anger + 0.3);
          target.emotions!.resentment = clamp01(target.emotions!.resentment + 0.24);
          remember(target, `${citizen.name} stole ${intent.amount} ${intent.resource} from me.`, "negative", citizen.id, 1);
          consequences.push(`${target.name} noticed; trust collapsed and a grievance formed.`);
        } else consequences.push(`${target.name} did not identify the thief.`);
        break;
      }
      case "teach_technique": {
        if (!target) throw new Error("The intended student no longer exists.");
        target.knowledge ??= { discoveredTiles: [], knownResources: [], knownPeople: [], learnedTechniques: [] };
        target.knowledge.learnedTechniques = [...new Set([...target.knowledge.learnedTechniques, intent.technique])];
        const studentView = relation(target, citizen);
        studentView.trust = clamp01(studentView.trust + 0.07);
        studentView.respect = clamp01(studentView.respect + 0.12);
        target.relationships[citizen.id] = studentView.trust;
        title = `${citizen.name} teaches ${target.name}`;
        activity = `Teaching ${intent.technique.replaceAll("-", " ")}`;
        consequences = [`${target.name} learned ${intent.technique.replaceAll("-", " ")}.`, `Respect for ${citizen.name} increased.`];
        remember(target, `${citizen.name} taught me how to ${intent.technique.replaceAll("-", " ")}.`, "positive", citizen.id, 0.78);
        remember(citizen, `I taught ${target.name} how to ${intent.technique.replaceAll("-", " ")}.`, "positive", target.id, 0.5);
        break;
      }
      case "warn_resource": {
        if (!target) throw new Error("The intended listener no longer exists.");
        target.knowledge ??= { discoveredTiles: [], knownResources: [], knownPeople: [], learnedTechniques: [] };
        target.knowledge.knownResources = [...new Set([...target.knowledge.knownResources, intent.nodeId])];
        target.knowledge.knownPeople = [...new Set([...target.knowledge.knownPeople, citizen.id])];
        relation(target, citizen).trust = clamp01(relation(target, citizen).trust + 0.035);
        target.relationships[citizen.id] = relation(target, citizen).trust;
        title = `${citizen.name} shares local knowledge`;
        activity = `Warning ${target.name} about ${intent.nodeId}`;
        consequences = [`${target.name} now knows the reported resource location.`, "The report is remembered as coming from a specific person."];
        remember(target, `${citizen.name} told me where to find ${intent.nodeId}.`, "neutral", citizen.id, 0.62);
        break;
      }
      case "conceal_resource": {
        title = `${citizen.name} keeps a discovery secret`;
        activity = `Concealing the location of ${intent.nodeId}`;
        consequences = [`${intent.nodeId} remained only in ${citizen.name}'s local knowledge.`, "No other person's knowledge was magically erased; this records a deliberate choice not to disclose it."];
        remember(citizen, `I chose to keep ${intent.nodeId} secret from the others.`, "neutral", undefined, 0.62);
        break;
      }
      case "form_household": {
        if (!target) throw new Error("The invited person no longer exists.");
        const targetView = relation(target, citizen);
        const acceptance = targetView.trust * 0.35 + (target.values?.family ?? 0.5) * 0.26 + (target.values?.community ?? 0.5) * 0.22 + (target.personality?.sociability ?? 0.5) * 0.2 - (target.personality?.independence ?? 0.5) * 0.18;
        title = `${citizen.name} asks ${target.name} to share a household`;
        activity = `Discussing a household with ${target.name}`;
        if (acceptance >= 0.38) {
          const householdId = `household-${this.snapshot.tick}-${Math.min(citizen.id, target.id)}-${Math.max(citizen.id, target.id)}`;
          citizen.householdId = householdId;
          target.householdId = householdId;
          relation(citizen, target).trust = clamp01(relation(citizen, target).trust + 0.08);
          targetView.trust = clamp01(targetView.trust + 0.08);
          citizen.relationships[target.id] = relation(citizen, target).trust;
          target.relationships[citizen.id] = targetView.trust;
          consequences = [`${target.name} accepted. Household ${householdId} now has two members.`, "This is a personal association, not a government-created unit."];
          remember(citizen, `${target.name} agreed to form a household with me.`, "positive", target.id, 0.9);
          remember(target, `I agreed to form a household with ${citizen.name}.`, "positive", citizen.id, 0.9);
        } else {
          consequences = [`${target.name} declined based on trust, family values, sociability, and independence.`, "Both remain without a household."];
          remember(citizen, `${target.name} declined my household invitation.`, "negative", target.id, 0.52);
        }
        break;
      }
      case "form_group": {
        if (!target) throw new Error("The invited person no longer exists.");
        const targetView = relation(target, citizen);
        const acceptance = targetView.trust * 0.38 + (target.values?.community ?? 0.5) * 0.28 + (target.personality?.sociability ?? 0.5) * 0.2 - (target.personality?.independence ?? 0.5) * 0.16;
        title = `${citizen.name} invites ${target.name} to form a group`;
        activity = `Discussing persistent cooperation with ${target.name}`;
        if (acceptance >= 0.4) {
          const groupId = `group-${this.snapshot.tick}-${Math.min(citizen.id, target.id)}-${Math.max(citizen.id, target.id)}`;
          this.snapshot.socialGroups[groupId] = { id: groupId, name: `${citizen.name}–${target.name} camp`, founderId: citizen.id, memberIds: [citizen.id, target.id], sharedInventory: {}, norms: ["membership-by-consent"], decisionSystem: "informal", createdAtTick: this.snapshot.tick };
          citizen.groupIds = [...new Set([...(citizen.groupIds ?? []), groupId])];
          target.groupIds = [...new Set([...(target.groupIds ?? []), groupId])];
          targetView.trust = clamp01(targetView.trust + 0.07);
          relation(citizen, target).trust = clamp01(relation(citizen, target).trust + 0.07);
          consequences = [`${target.name} accepted; ${groupId} now has two voluntary members.`, "The group begins informally with no automatic government or ownership law."];
          remember(citizen, `${target.name} agreed to form a persistent camp group with me.`, "positive", target.id, 0.86);
          remember(target, `I agreed to form a persistent camp group with ${citizen.name}.`, "positive", citizen.id, 0.86);
        } else {
          consequences = [`${target.name} declined the invitation.`, "No group was created."];
          remember(citizen, `${target.name} declined my invitation to form a group.`, "negative", target.id, 0.48);
        }
        break;
      }
      case "invite_group": {
        if (!target) throw new Error("The invited person no longer exists.");
        const group = this.snapshot.socialGroups[intent.groupId];
        const targetView = relation(target, citizen);
        const acceptance = targetView.trust * 0.34 + (target.values?.community ?? 0.5) * 0.3 + (target.personality?.sociability ?? 0.5) * 0.2 - (target.personality?.independence ?? 0.5) * 0.18;
        title = `${citizen.name} invites ${target.name} into ${group.name}`;
        activity = `Discussing membership in ${group.name}`;
        if (acceptance >= 0.37) {
          group.memberIds = [...new Set([...group.memberIds, target.id])];
          target.groupIds = [...new Set([...(target.groupIds ?? []), group.id])];
          targetView.trust = clamp01(targetView.trust + 0.06);
          target.relationships[citizen.id] = targetView.trust;
          consequences = [`${target.name} accepted; ${group.name} now has ${group.memberIds.length} members.`, "Membership expanded through invitation and consent."];
          remember(target, `I chose to join ${group.name} after ${citizen.name} invited me.`, "positive", citizen.id, 0.82);
        } else {
          consequences = [`${target.name} declined membership in ${group.name}.`, "The group could not add them by force."];
          remember(citizen, `${target.name} declined my invitation to ${group.name}.`, "negative", target.id, 0.42);
        }
        break;
      }
      case "adopt_group_system": {
        const group = this.snapshot.socialGroups[intent.groupId];
        const members = group.memberIds.map((id) => this.snapshot.citizens[id]).filter((member): member is CitizenState => Boolean(member));
        const preference = (member: CitizenState) => {
          if (intent.system === "consensus") return (member.values?.equality ?? 0.5) * 0.35 + (member.values?.community ?? 0.5) * 0.3 + (member.personality?.empathy ?? 0.5) * 0.2 + (1 - (member.personality?.dominance ?? 0.5)) * 0.15;
          if (intent.system === "majority") return (member.values?.fairness ?? 0.5) * 0.4 + (member.personality?.conformity ?? 0.5) * 0.3 + (member.values?.community ?? 0.5) * 0.15 + (1 - (member.personality?.independence ?? 0.5)) * 0.15;
          if (intent.system === "leader") return (member.values?.security ?? 0.5) * 0.3 + (member.personality?.conformity ?? 0.5) * 0.25 + (member.socialRelationships?.[citizen.id]?.trust ?? member.relationships[citizen.id] ?? 0.5) * 0.25 + (citizen.personality?.dominance ?? 0.5) * 0.2;
          return (member.values?.fairness ?? 0.5) * 0.3 + (member.values?.community ?? 0.5) * 0.3 + (member.values?.status ?? 0.5) * 0.2 + (1 - (member.personality?.dominance ?? 0.5)) * 0.2;
        };
        const support = members.length ? members.reduce((sum, member) => sum + preference(member), 0) / members.length : 0;
        const accepted = support >= 0.5;
        title = `${citizen.name} proposes ${intent.system} rule for ${group.name}`;
        activity = `Founding ${intent.system} decision-making in ${group.name}`;
        if (accepted) {
          group.decisionSystem = intent.system;
          if (intent.system === "leader") group.leaderId = citizen.id;
          else delete group.leaderId;
          group.norms = [...new Set([...group.norms, `decisions-by-${intent.system}`])];
          consequences = [`The members' combined preferences produced ${Math.round(support * 100)}% support, so ${group.name} adopted ${intent.system} decision-making.`, intent.system === "leader" ? `${citizen.name} became the recognized leader.` : "No single person received automatic command."];
          for (const member of members) remember(member, `${group.name} adopted ${intent.system} decision-making after a founding discussion.`, "neutral", citizen.id, 0.78);
        } else {
          consequences = [`Combined member support was only ${Math.round(support * 100)}%; the proposal failed.`, `${group.name} remains informal.`];
          for (const member of members) remember(member, `${citizen.name}'s proposal for ${intent.system} rule did not gain enough support.`, "neutral", citizen.id, 0.48);
        }
        citizenIds = group.memberIds.slice();
        break;
      }
      case "leave_group": {
        const group = this.snapshot.socialGroups[intent.groupId];
        group.memberIds = group.memberIds.filter((id) => id !== citizen.id);
        citizen.groupIds = (citizen.groupIds ?? []).filter((id) => id !== group.id);
        if (group.leaderId === citizen.id) delete group.leaderId;
        const dissolved = dissolveGroupIfTooSmall(group);
        title = `${citizen.name} leaves ${group.name}`;
        activity = `Leaving ${group.name}`;
        consequences = [dissolved ? "The group dissolved because persistent membership fell below two people; its shared goods passed to the last member." : `${group.memberIds.length} members remain.`, "Membership changed by personal choice, not an engine assignment."];
        break;
      }
      case "exclude_member": {
        if (!target) throw new Error("The intended member no longer exists.");
        const group = this.snapshot.socialGroups[intent.groupId];
        group.memberIds = group.memberIds.filter((id) => id !== target.id);
        target.groupIds = (target.groupIds ?? []).filter((id) => id !== group.id);
        const targetView = relation(target, citizen);
        targetView.trust = clamp01(targetView.trust - 0.22);
        targetView.grievance = clamp01(targetView.grievance + 0.3);
        target.relationships[citizen.id] = targetView.trust;
        target.emotions!.resentment = clamp01(target.emotions!.resentment + 0.22);
        const dissolved = dissolveGroupIfTooSmall(group);
        title = `${citizen.name} excludes ${target.name} from ${group.name}`;
        activity = `Enforcing exclusion from ${group.name}`;
        consequences = [`${target.name} was removed from the group's membership list.`, dissolved ? "The remaining shared goods passed to the last member as the group dissolved." : "The excluded person formed a strong grievance and remembers who acted."];
        remember(target, `${citizen.name} excluded me from ${group.name}.`, "negative", citizen.id, 0.94);
        break;
      }
      case "contribute_group_stock": {
        const group = this.snapshot.socialGroups[intent.groupId];
        citizen.inventory[intent.resource] = Math.max(0, (citizen.inventory[intent.resource] ?? 0) - intent.amount);
        group.sharedInventory[intent.resource] = (group.sharedInventory[intent.resource] ?? 0) + intent.amount;
        resourceDelta[`citizen:${citizen.id}:${intent.resource}`] = -intent.amount;
        resourceDelta[`group:${group.id}:${intent.resource}`] = intent.amount;
        title = `${citizen.name} contributes to ${group.name}`;
        activity = `Placing ${intent.amount} ${intent.resource} in group stores`;
        consequences = [`${intent.amount} ${intent.resource} moved from personal inventory into an explicit group inventory.`, "The contribution may build respect but remains physically conserved."];
        for (const memberId of group.memberIds) if (memberId !== citizen.id) {
          const member = this.snapshot.citizens[memberId];
          if (member) relation(member, citizen).respect = clamp01(relation(member, citizen).respect + 0.025);
        }
        break;
      }
      case "promise_item": {
        if (!target) throw new Error("The promise recipient no longer exists.");
        const id = `promise-${this.snapshot.tick}-${citizen.id}-${target.id}-${intent.resource}`;
        this.snapshot.socialPromises[id] = { id, fromCitizenId: citizen.id, toCitizenId: target.id, resource: intent.resource, amount: intent.amount, promisedAtTick: this.snapshot.tick, dueTick: intent.dueTick, status: "open" };
        title = `${citizen.name} makes a promise to ${target.name}`;
        activity = `Promising ${intent.amount} ${intent.resource} by tick ${intent.dueTick}`;
        consequences = [`A dated personal obligation now exists from ${citizen.name} to ${target.name}.`, "No resource was created or transferred by the promise itself."];
        remember(target, `${citizen.name} promised me ${intent.amount} ${intent.resource} by tick ${intent.dueTick}.`, "neutral", citizen.id, 0.72);
        break;
      }
      case "fulfill_promise": {
        if (!target) throw new Error("The promise recipient no longer exists.");
        const promise = this.snapshot.socialPromises[intent.promiseId];
        transfer(citizen, target, promise.resource, promise.amount);
        promise.status = "fulfilled";
        promise.resolvedAtTick = this.snapshot.tick;
        const targetView = relation(target, citizen);
        targetView.trust = clamp01(targetView.trust + 0.14);
        targetView.respect = clamp01(targetView.respect + 0.08);
        target.relationships[citizen.id] = targetView.trust;
        title = `${citizen.name} keeps a promise to ${target.name}`;
        activity = `Delivering promised ${promise.resource}`;
        consequences = [`${promise.amount} ${promise.resource} moved between personal inventories.`, `${target.name}'s trust in ${citizen.name} increased because the obligation was fulfilled.`];
        remember(target, `${citizen.name} kept the promise to give me ${promise.amount} ${promise.resource}.`, "positive", citizen.id, 0.94);
        break;
      }
      case "forgive": {
        if (!target) throw new Error("The other person no longer exists.");
        const view = relation(citizen, target);
        const before = view.grievance;
        view.grievance = clamp01(view.grievance - 0.28);
        view.trust = clamp01(view.trust + 0.025);
        citizen.emotions!.resentment = clamp01(citizen.emotions!.resentment - 0.2);
        citizen.relationships[target.id] = view.trust;
        const forgivenPromise = Object.values(this.snapshot.socialPromises)
          .filter((promise) => promise.fromCitizenId === target.id && promise.toCitizenId === citizen.id && promise.status === "broken")
          .sort((left, right) => (right.resolvedAtTick ?? 0) - (left.resolvedAtTick ?? 0))[0];
        if (forgivenPromise) {
          forgivenPromise.status = "forgiven";
          forgivenPromise.resolvedAtTick = this.snapshot.tick;
        }
        title = `${citizen.name} forgives ${target.name}`;
        activity = `Letting go of a grievance against ${target.name}`;
        consequences = [`Grievance fell from ${Math.round(before * 100)}% to ${Math.round(view.grievance * 100)}%.`, forgivenPromise ? "The most recent broken promise was explicitly forgiven, though its historical memory remains." : "Forgiveness reduced resentment but did not erase the historical memory."];
        remember(citizen, `I chose to forgive ${target.name}, though I still remember what happened.`, "positive", target.id, 0.76);
        break;
      }
      case "retaliate": {
        if (!target) throw new Error("The retaliation target no longer exists.");
        const targetView = relation(target, citizen);
        const actorView = relation(citizen, target);
        actorView.grievance = clamp01(actorView.grievance - 0.08);
        targetView.trust = clamp01(targetView.trust - 0.16);
        targetView.fear = clamp01(targetView.fear + 0.18);
        targetView.grievance = clamp01(targetView.grievance + 0.22);
        target.relationships[citizen.id] = targetView.trust;
        const violent = (citizen.personality?.aggression ?? 0.5) >= 0.72;
        if (violent) {
          target.physical!.injury = clamp01(target.physical!.injury + 0.08);
          target.physical!.health = clamp01(target.physical!.health - 0.025);
        }
        title = `${citizen.name} retaliates against ${target.name}`;
        activity = `Confronting ${target.name} over a grievance`;
        consequences = [violent ? `${target.name} suffered a minor physical injury.` : "The retaliation remained a hostile confrontation.", "Fear and reciprocal grievance increased, allowing conflict to escalate rather than reset."];
        remember(target, `${citizen.name} retaliated against me.`, "negative", citizen.id, 0.96);
        remember(citizen, `I retaliated against ${target.name}.`, "negative", target.id, 0.82);
        break;
      }
      case "claim_resource": {
        this.snapshot.physicalWorld.claims[intent.nodeId] = {
          nodeId: intent.nodeId,
          ownerId: citizen.id,
          strength: clamp01(0.35 + (citizen.personality?.dominance ?? 0.5) * 0.35 + (citizen.personality?.acquisitiveness ?? 0.5) * 0.2),
          createdAtTick: this.snapshot.tick,
          challengedByIds: [],
        };
        title = `${citizen.name} claims a resource`;
        activity = `Marking a claim on ${intent.nodeId}`;
        consequences = [`${citizen.name} publicly asserted personal control over ${intent.nodeId}.`, "The claim exists socially and can be ignored or challenged; it does not magically prevent access."];
        remember(citizen, `I claimed ${intent.nodeId}.`, "neutral", undefined, 0.7);
        break;
      }
      case "challenge_claim": {
        const claim = this.snapshot.physicalWorld.claims[intent.nodeId];
        const owner = citizens.find((other) => other.id === claim.ownerId);
        claim.challengedByIds = [...new Set([...claim.challengedByIds, citizen.id])];
        const challengerForce = (citizen.personality?.dominance ?? 0.5) * 0.34 + (citizen.personality?.aggression ?? 0.5) * 0.24 + (citizen.physical?.strength ?? 0.5) * 0.24 + (citizen.needs.hunger * 0.18);
        const ownerForce = claim.strength * 0.48 + (owner?.personality?.dominance ?? 0.5) * 0.26 + (owner?.physical?.strength ?? 0.5) * 0.26;
        const succeeds = challengerForce > ownerForce;
        title = `${citizen.name} challenges ${owner?.name ?? "another survivor"}'s claim`;
        activity = `Contesting control of ${intent.nodeId}`;
        targetCitizenId = owner?.id;
        citizenIds = owner ? [citizen.id, owner.id] : [citizen.id];
        if (succeeds) {
          claim.ownerId = citizen.id;
          claim.strength = clamp01(0.3 + challengerForce * 0.45);
          consequences = [`The challenge succeeded; ${citizen.name} is now the recognized claimant.`, "The former owner formed a grievance."];
        } else {
          claim.strength = clamp01(claim.strength + 0.04);
          consequences = [`The challenge failed; the existing claim became slightly stronger.`, `${citizen.name} remembers the refusal of access.`];
        }
        if (owner) {
          const ownerView = relation(owner, citizen);
          ownerView.trust = clamp01(ownerView.trust - 0.13);
          ownerView.grievance = clamp01(ownerView.grievance + (succeeds ? 0.24 : 0.13));
          owner.relationships[citizen.id] = ownerView.trust;
          owner.emotions!.anger = clamp01(owner.emotions!.anger + 0.16);
          remember(owner, `${citizen.name} challenged my claim to ${intent.nodeId}${succeeds ? " and took it" : " but failed"}.`, "negative", citizen.id, 0.86);
        }
        remember(citizen, `I challenged the claim on ${intent.nodeId}${succeeds ? " and won" : " and lost"}.`, succeeds ? "positive" : "negative", owner?.id, 0.82);
        break;
      }
    }

    // Social need is satisfied by completed, face-to-face connective behavior,
    // not by merely holding a group/household label. Hostile and secret actions
    // intentionally do not provide this benefit.
    if (target && CONNECTIVE_SOCIAL_INTENTS.has(intent.kind)) {
      citizen.needs.loneliness = clamp01(citizen.needs.loneliness - 0.22);
      target.needs.loneliness = clamp01(target.needs.loneliness - 0.12);
    }

    return { resourceDelta, activity, title, consequences, category: "social" as const, citizenIds, targetCitizenId };
  }

  private execute(citizen: CitizenState, action: DecisionRecord["selected"], citizens: CitizenState[], instance?: SimulationSnapshot["activeActions"][string], providedIntent?: ActionIntent) {
    const intent = providedIntent ?? defaultIntent(action);
    if (["request_item", "share_item", "steal_item", "barter_item", "rescue_person", "offer_project_help", "invite_project", "teach_technique", "warn_resource", "conceal_resource", "form_household", "form_group", "invite_group", "adopt_group_system", "leave_group", "exclude_member", "contribute_group_stock", "promise_item", "fulfill_promise", "forgive", "retaliate", "claim_resource", "challenge_claim"].includes(intent.kind)) {
      return this.executeSocial(citizen, intent as SocialIntent, citizens);
    }
    if (["forage_wild_food", "gather_fiber", "gather_branches", "gather_loose_stone", "craft_hand_axe", "craft_stone_pick", "craft_primitive", "gather_clay", "drink_natural_water", "catch_fish", "hunt_game", "use_medicine", "fuel_campfire", "cook_food", "boil_water", "explore", "fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "collect_water", "draw_water", "drink_water", "propose_public_project", "start_construction", "deliver_material", "work_construction", "cancel_project", "repair_structure", "demolish_structure", "move_home"].includes(intent.kind)) {
      return this.executePhysical(citizen, intent as Extract<ActionIntent, { kind: "forage_wild_food" | "gather_fiber" | "gather_branches" | "gather_loose_stone" | "craft_hand_axe" | "craft_stone_pick" | "craft_primitive" | "gather_clay" | "drink_natural_water" | "catch_fish" | "hunt_game" | "use_medicine" | "fuel_campfire" | "cook_food" | "boil_water" | "explore" | "fell_tree" | "quarry_stone" | "harvest_crop" | "sow_crop" | "tend_crop" | "collect_water" | "draw_water" | "drink_water" | "propose_public_project" | "start_construction" | "deliver_material" | "work_construction" | "cancel_project" | "repair_structure" | "demolish_structure" | "move_home" }>);
    }
    if (["propose_policy", "cast_ballot", "respond_to_vote", "form_faction", "join_faction", "organize_collective_action"].includes(intent.kind)) {
      const result = executePoliticalIntent(intent as Extract<ActionIntent, { kind: "propose_policy" | "cast_ballot" | "respond_to_vote" | "form_faction" | "join_faction" | "organize_collective_action" }>, {
        tick: this.snapshot.tick,
        citizen,
        citizens,
        politics: this.snapshot.politics,
        economy: this.snapshot.economy,
        civilizationGoal: this.snapshot.civilizationGoal,
        stock: this.snapshot.stock,
      });
      refreshGoalProgress(this.snapshot.civilizationGoal, this.snapshot.economy, this.snapshot.tick);
      refreshEconomicIndicators(this.snapshot.economy, citizens);
      assertEconomyInvariants(this.snapshot.economy, citizens, Object.values(this.snapshot.physicalWorld.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
      return result;
    }
    if (!["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"].includes(intent.kind)) {
      return this.executeEconomic(citizen, intent as Exclude<ActionIntent, { kind: "eat" | "rest" | "gather_food" | "work_job" | "socialize" | "construct" | "idle" }>, citizens);
    }
    const legality = checkActionLegality(action, {
      tick: this.snapshot.tick,
      stateVersion: this.snapshot.stateVersion,
      citizen,
      citizens,
      stock: this.snapshot.stock,
      constructionProgress: this.snapshot.constructionProgress,
      physicalWorld: this.snapshot.physicalWorld,
    });
    if (!legality.legal) throw new Error(`Illegal action ${action}: ${legality.reason ?? "unknown reason"}`);
    const resourceDelta: Record<string, number> = {};
    let activity = "Taking a quiet moment";
    let title = `${citizen.name} pauses`;
    let consequences = ["No world resource changed."];
    let category: SimulationEvent["category"] = "need";
    let citizenIds = [citizen.id];
    let targetCitizenId: number | undefined;

    const change = (key: string, amount: number) => {
      this.snapshot.stock[key] = Math.max(0, (this.snapshot.stock[key] ?? 0) + amount);
      resourceDelta[key] = (resourceDelta[key] ?? 0) + amount;
    };
    const privateMarketActive = this.snapshot.economy.policies.privateProperty;
    const activeContract = Object.values(this.snapshot.economy.contracts).find((contract) => contract.workerId === citizen.id && contract.status === "active");
    const ownedBusiness = Object.values(this.snapshot.economy.businesses).find((business) => business.ownerId === citizen.id);
    const productionBusiness = activeContract ? this.snapshot.economy.businesses[activeContract.businessId] : ownedBusiness;
    const addProducedGood = (key: string, amount: number) => {
      if (!privateMarketActive) {
        change(key, amount);
        if (["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"].includes(key)) {
          const storehouse = Object.values(this.snapshot.physicalWorld.buildings).find((building) => building.buildingType === "storehouse" && building.condition >= 0.15);
          const id = `food:${this.snapshot.tick}:stock:${citizen.id}:${key}`;
          this.snapshot.physicalWorld.foodLots[id] = { id, resource: key as "berries" | "meat" | "cooked_meal" | "wheat" | "fish" | "bread" | "cabbage" | "pumpkin", amount, owner: { kind: "stock" }, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(storehouse ? 480 : 240), ...(storehouse ? { storageBuildingUid: storehouse.objectUid } : {}) };
        }
        return "shared stores";
      }
      const inventory = productionBusiness?.inventory ?? citizen.inventory;
      inventory[key] = (inventory[key] ?? 0) + amount;
      if (["berries", "meat", "cooked_meal", "wheat", "fish", "bread", "cabbage", "pumpkin"].includes(key)) {
        const owner = productionBusiness ? { kind: "business" as const, id: productionBusiness.id } : { kind: "citizen" as const, id: citizen.id };
        const id = `food:${this.snapshot.tick}:${owner.kind}:${owner.id}:${key}`;
        this.snapshot.physicalWorld.foodLots[id] = { id, resource: key as "berries" | "meat" | "cooked_meal" | "wheat" | "fish" | "bread" | "cabbage" | "pumpkin", amount, owner, producedAtTick: this.snapshot.tick, expiresAtTick: this.snapshot.tick + legacyDurationTicks(180) };
      }
      return productionBusiness ? productionBusiness.name : `${citizen.name}'s inventory`;
    };

    switch (action) {
      case "eat": {
        const personalKey = foodKey(citizen.inventory);
        const key = personalKey ?? instance?.resourceClaims.find((claim) => (claim.kind ?? "resource") === "resource" || claim.kind === "stock")?.resourceId ?? foodKey(this.snapshot.stock);
        if (!key) throw new Error("Action legality changed before eat executed.");
        if (personalKey) citizen.inventory[key] = Math.max(0, (citizen.inventory[key] ?? 0) - 1);
        else change(key, -1);
        const ownerKind = personalKey ? "citizen" : "stock";
        const lot = Object.values(this.snapshot.physicalWorld.foodLots)
          .filter((item) => item.resource === key && item.owner.kind === ownerKind && (item.owner.kind !== "citizen" || item.owner.id === citizen.id))
          .sort((left, right) => left.expiresAtTick - right.expiresAtTick || left.id.localeCompare(right.id))[0];
        if (lot) {
          lot.amount -= 1;
          if (lot.amount <= 0) delete this.snapshot.physicalWorld.foodLots[lot.id];
        }
        citizen.needs.hunger = clamp01(citizen.needs.hunger - 0.48);
        citizen.happiness = clamp01(citizen.happiness + 0.07);
        activity = `Eating a meal of ${key}`;
        title = `${citizen.name} eats ${personalKey ? "their own food" : "from the common stores"}`;
        consequences = [`1 ${key} was consumed from ${personalKey ? "personal inventory" : "common stores"}.`, `${citizen.name}'s hunger fell to ${Math.round(citizen.needs.hunger * 100)}%.`];
        break;
      }
      case "rest":
        {
        const home = citizen.homeObjectUid ? this.snapshot.physicalWorld.buildings[String(citizen.homeObjectUid)] : undefined;
        const sheltered = Boolean(home && home.condition >= 0.15);
        const warm = Object.values(this.snapshot.physicalWorld.buildings).some((building) => building.buildingType === "campfire" && building.condition >= 0.15 && (building.fuel ?? 0) > 0 && Math.abs(building.position.x - citizen.position.x) + Math.abs(building.position.y - citizen.position.y) <= 6);
        const recovery = sheltered ? 0.5 : warm ? 0.36 : 0.22;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue - recovery);
        if (citizen.physical && !sheltered && !warm) citizen.physical.exposure = clamp01(citizen.physical.exposure + 0.025);
        activity = sheltered ? "Resting under shelter" : warm ? "Resting beside the fire" : "Resting exposed on the ground";
        title = `${citizen.name} takes a needed rest`;
        consequences = [`Fatigue fell to ${Math.round(citizen.needs.fatigue * 100)}%.`, sheltered ? "Shelter made the rest safe and restorative." : warm ? "Nearby fire reduced the exposure penalty." : "Sleeping exposed recovered less energy and increased exposure risk."];
        }
        break;
      case "gather_food": {
        const key = citizen.job === "fisher" ? "fish" : "wheat";
        if (this.snapshot.physicalWorld.enabled && key === "fish") {
          const fishStock = this.snapshot.physicalWorld.renewableStocks.fish;
          if (!fishStock || fishStock.amount < 1) throw new Error("Action legality changed before fishing completed.");
          fishStock.amount -= 1;
          fishStock.lastHarvestedAtTick = this.snapshot.tick;
        }
        const farmBonus = Object.values(this.snapshot.physicalWorld.buildings).some((building) => building.buildingType === "farm" && building.condition >= 0.4) ? 1 : 0;
        const amount = this.snapshot.physicalWorld.enabled && key === "fish" ? 1 : (citizen.traits.includes("Diligent") ? 3 : 2) + farmBonus;
        const destination = addProducedGood(key, amount);
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.08);
        activity = key === "fish" ? "Bringing in the morning catch" : "Gathering food for the village";
        title = `${citizen.name} adds to the food stores`;
        consequences = [`${amount} ${key} entered ${destination}.`, key === "fish" && this.snapshot.physicalWorld.enabled ? `The renewable fish stock fell to ${(this.snapshot.physicalWorld.renewableStocks.fish?.amount ?? 0).toFixed(1)}.` : "The work caused a little fatigue."];
        category = "work";
        break;
      }
      case "work_job": {
        const output: Record<string, string> = this.snapshot.physicalWorld.enabled ? {} : { woodcutter: "wood", miner: "stone", smith: "ore", baker: "bread", farmer: "wheat", fisher: "fish" };
        const key = output[citizen.job];
        const destination = key ? addProducedGood(key, 1) : undefined;
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue + 0.06);
        activity = `Working as the village ${citizen.job}`;
        title = `${citizen.name} works as ${citizen.job}`;
        consequences = key ? [`1 ${key} was added to ${destination}.`] : ["Their occupation advanced without changing a tracked resource."];
        category = "work";
        break;
      }
      case "socialize": {
        const others = citizens.filter((other) => other.id !== citizen.id);
        const target = citizens.find((other) => other.id === instance?.targetCitizenId) ?? others[hashSeed(this.snapshot.seed, instance?.startedAtTick ?? this.snapshot.tick, citizen.id) % others.length];
        citizen.needs.loneliness = clamp01(citizen.needs.loneliness - 0.38);
        target.needs.loneliness = clamp01(target.needs.loneliness - 0.16);
        citizen.relationships[target.id] = clamp01((citizen.relationships[target.id] ?? 0.5) + 0.06);
        target.relationships[citizen.id] = clamp01((target.relationships[citizen.id] ?? 0.5) + 0.04);
        citizen.socialRelationships ??= {};
        target.socialRelationships ??= {};
        const citizenView = citizen.socialRelationships[target.id] ?? { trust: 0.5, affection: 0.5, fear: 0, respect: 0.5, debt: 0, grievance: 0 };
        const targetView = target.socialRelationships[citizen.id] ?? { trust: 0.5, affection: 0.5, fear: 0, respect: 0.5, debt: 0, grievance: 0 };
        citizenView.trust = clamp01(citizenView.trust + 0.06);
        citizenView.affection = clamp01(citizenView.affection + 0.04);
        targetView.trust = clamp01(targetView.trust + 0.04);
        targetView.affection = clamp01(targetView.affection + 0.03);
        citizen.socialRelationships[target.id] = citizenView;
        target.socialRelationships[citizen.id] = targetView;
        citizen.relationships[target.id] = citizenView.trust;
        target.relationships[citizen.id] = targetView.trust;
        activity = `Catching up with ${target.name}`;
        title = `${citizen.name} seeks out ${target.name}`;
        consequences = [`Trust with ${target.name} rose to ${Math.round(citizen.relationships[target.id] * 100)}%.`, "Both villagers feel less isolated."];
        category = "social";
        citizenIds = [citizen.id, target.id];
        targetCitizenId = target.id;
        addMemory(target, { id: `memory-${this.snapshot.tick}-${target.id}`, tick: this.snapshot.tick, text: `${citizen.name} made time to talk.`, tone: "positive" });
        break;
      }
      case "construct":
        if ((this.snapshot.stock.wood ?? 0) < 2 || (this.snapshot.stock.stone ?? 0) < 1) throw new Error("Action legality changed before construction executed.");
        change("wood", -2);
        change("stone", -1);
        this.snapshot.constructionProgress = clamp01(this.snapshot.constructionProgress + 0.16);
        activity = "Shaping the settlement's common hall";
        title = `${citizen.name} advances the common hall`;
        consequences = ["Construction used 2 wood and 1 stone.", `The common hall is ${Math.round(this.snapshot.constructionProgress * 100)}% planned and built.`];
        category = "construction";
        break;
      case "idle":
        citizen.needs.fatigue = clamp01(citizen.needs.fatigue - 0.08);
        activity = "Watching the life of the village";
        consequences = ["A calm moment lowered fatigue slightly."];
        break;
    }

    addMemory(citizen, {
      id: `memory-${this.snapshot.tick}-${citizen.id}`,
      tick: this.snapshot.tick,
      text: consequences[0],
      tone: action === "eat" || action === "socialize" ? "positive" : "neutral",
    });

    return { resourceDelta, activity, title, consequences, category, citizenIds, targetCitizenId };
  }
}
