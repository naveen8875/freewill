import { z } from "zod";
import type { SimulationSnapshot } from "../sim/types.js";
import type { LegacyEntity, LegacyWorld, LegacyWorldObject } from "../types/legacy.js";
import { stableHash } from "../sim/stableHash.js";
import { assertEconomyInvariants, createCivilizationGoal, createEconomyState } from "../sim/economy.js";
import { assertPoliticsInvariants, createPoliticsState, politicsFromLegacy } from "../sim/politics.js";
import type { SocietyGoalId } from "../sim/types.js";
import { assertPhysicalWorldInvariants, createPhysicalWorld } from "../sim/physicalWorld.js";
import { initialSkills } from "../sim/settlementSystems.js";
import { initialMindState } from "../sim/mindRuntime.js";

export interface PersistedObject {
  uid: number;
  id: string;
  x: number;
  y: number;
  opts: Record<string, unknown>;
  build: number;
  age: number;
}

export interface PersistedEntity {
  uid: number;
  kind: string;
  x: number;
  y: number;
  name: string;
  job: string;
  look?: number[];
  homeUid?: number;
  v?: number;
  trait?: string;
  goal?: string;
  inventory?: Record<string, number>;
  initialNeeds?: { hunger: number; fatigue: number; loneliness: number; thirst?: number };
  settlementId?: string;
  relationshipPreset?: "strained" | "neutral" | "friendly";
}

export interface WorldDocument {
  schemaVersion: 6;
  config: {
    name: string;
    presetId: string;
    seed: number;
    era: number;
    chapter: number;
    government: "council" | "kingdom" | "republic";
    societyGoal: SocietyGoalId;
    goalPrompt: string;
    decisionMode?: "mock" | "local-brain";
    brainDeployment?: { experimentId: string; generation: number; label: string; brainIds: string[]; speciesIds: string[] };
    weather: string;
  };
  world: {
    width: number;
    height: number;
    day: number;
    time: number;
    season: number;
    stock: Record<string, number>;
    tiles: number[];
    objects: PersistedObject[];
    entities: PersistedEntity[];
  };
  editor: {
    layers: Record<"terrain" | "objects" | "people", { visible: boolean; locked: boolean }>;
    settlementByCitizen: Record<string, string>;
    commandLog: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
  };
  simulation: SimulationSnapshot | null;
}

const boundedText = z.string().max(500);
const resourceAmount = z.number().finite().min(0);
const needsSchema = z.object({ hunger: z.number().min(0).max(1), fatigue: z.number().min(0).max(1), loneliness: z.number().min(0).max(1), thirst: z.number().min(0).max(1).optional() });
const memorySchema = z.object({ id: z.string().max(120), tick: z.number().int().min(0), text: boundedText, tone: z.enum(["positive", "neutral", "negative"]), salience: z.number().min(0).max(1).optional(), subjectCitizenId: z.number().int().optional(), expiresAtTick: z.number().int().min(0).optional() });
const personalitySchema = z.object({ empathy: z.number().min(0).max(1).default(0.5), sociability: z.number().min(0).max(1).default(0.5), industriousness: z.number().min(0).max(1).default(0.5), openness: z.number().min(0).max(1), conscientiousness: z.number().min(0).max(1), extraversion: z.number().min(0).max(1), agreeableness: z.number().min(0).max(1), emotionalSensitivity: z.number().min(0).max(1), riskTolerance: z.number().min(0).max(1), patience: z.number().min(0).max(1), generosity: z.number().min(0).max(1), dominance: z.number().min(0).max(1), curiosity: z.number().min(0).max(1), conformity: z.number().min(0).max(1).default(0.5), aggression: z.number().min(0).max(1).default(0.5), acquisitiveness: z.number().min(0).max(1).default(0.5), independence: z.number().min(0).max(1).default(0.5) });
const physicalProfileSchema = z.object({ strength: z.number().min(0).max(1), endurance: z.number().min(0).max(1), health: z.number().min(0).max(1), injury: z.number().min(0).max(1), exposure: z.number().min(0).max(1), age: z.number().int().min(0).max(140), movementAbility: z.number().min(0).max(1).default(0.5), temperatureTolerance: z.number().min(0).max(1).default(0.5), illness: z.number().min(0).max(1).default(0), alive: z.boolean(), incapacitatedSinceTick: z.number().int().min(0).optional(), lastRescuedAtTick: z.number().int().min(0).optional() });
const emotionalStateSchema = z.object({ fear: z.number().min(0).max(1), anger: z.number().min(0).max(1), hope: z.number().min(0).max(1), contentment: z.number().min(0).max(1), stress: z.number().min(0).max(1), gratitude: z.number().min(0).max(1).default(0), resentment: z.number().min(0).max(1).default(0), confidence: z.number().min(0).max(1).default(0.5), safety: z.number().min(0).max(1).default(0.5) });
const valueProfileSchema = z.object({ autonomy: z.number().min(0).max(1), security: z.number().min(0).max(1), community: z.number().min(0).max(1), fairness: z.number().min(0).max(1), status: z.number().min(0).max(1), tradition: z.number().min(0).max(1), equality: z.number().min(0).max(1).default(0.5), wealth: z.number().min(0).max(1).default(0.5), exploration: z.number().min(0).max(1).default(0.5), family: z.number().min(0).max(1).default(0.5), nature: z.number().min(0).max(1).default(0.5) });
const socialRelationshipSchema = z.object({ trust: z.number().min(0).max(1), affection: z.number().min(0).max(1), fear: z.number().min(0).max(1), respect: z.number().min(0).max(1), debt: z.number(), grievance: z.number().min(0).max(1) });
const mindStateSchema = z.object({
  mode: z.enum(["idle", "deliberating", "executing", "committed", "interrupted"]),
  lastDeliberatedAtTick: z.number().int().min(0), nextReviewAtTick: z.number().int().min(0), reconsiderations: z.number().int().min(0),
  currentIntention: z.object({ decisionId: z.string().max(160), label: boundedText, startedAtTick: z.number().int().min(0), commitmentStrength: z.number().min(0).max(1) }).optional(),
  lastInterruptAtTick: z.number().int().min(0).optional(), interruptReason: boundedText.optional(),
});
const citizenSchema = z.object({
  id: z.number().int(), name: z.string().min(1).max(100), job: z.string().max(60), traits: z.array(z.string().max(60)).max(12),
  revision: z.number().int().min(0).optional(), position: z.object({ x: z.number().int(), y: z.number().int() }).optional(), facing: z.enum(["up", "down", "left", "right"]).optional(),
  goal: boundedText, needs: needsSchema, happiness: z.number().min(0).max(1), inventory: z.record(z.string().max(80), resourceAmount),
  toolDurability: z.record(z.string().max(80), resourceAmount).optional(),
  relationships: z.record(z.string(), z.number().min(0).max(1)), memories: z.array(memorySchema).max(100), currentActivity: boundedText,
  skills: z.record(z.string().max(80), z.object({ level: z.number().min(0).max(1), experience: resourceAmount })).optional(),
  commitment: z.object({ id: z.string().max(200), kind: z.enum(["survival", "enterprise", "construction", "production", "public-service", "learning"]), objective: boundedText, strategy: boundedText, status: z.enum(["active", "blocked", "completed", "abandoned"]), createdAtTick: z.number().int().min(0), updatedAtTick: z.number().int().min(0), progress: z.number().min(0).max(1), targetId: z.string().max(200).optional(), blocker: boundedText.optional() }).optional(),
  mind: mindStateSchema.optional(),
  lastDecisionId: z.string().max(120).optional(), currentActionId: z.string().max(160).optional(),
  initialNeeds: needsSchema.partial().optional(), settlementId: z.string().max(80).optional(), relationshipPreset: z.enum(["strained", "neutral", "friendly"]).optional(),
  initialRelationships: z.record(z.string(), z.number().min(0).max(1)).optional(),
  homeObjectUid: z.number().int().positive().optional(),
  personality: personalitySchema.optional(), physical: physicalProfileSchema.optional(), emotions: emotionalStateSchema.optional(), values: valueProfileSchema.optional(),
  socialRelationships: z.record(z.string(), socialRelationshipSchema).optional(),
  knowledge: z.object({ discoveredTiles: z.array(z.string().max(40)).max(50_000), knownResources: z.array(z.string().max(160)).max(5_000), knownPeople: z.array(z.number().int()).max(5_000), learnedTechniques: z.array(z.string().max(120)).max(500) }).optional(),
  householdId: z.string().max(160).optional(), groupIds: z.array(z.string().max(160)).max(100).optional(),
});
const policyIdSchema = z.enum(["market-charter", "wealth-tax", "public-food-reserve", "civil-liberties", "community-watch", "conservation-code", "assembly-charter", "settlement-expansion"]);
const ballotChoiceSchema = z.enum(["support", "oppose", "abstain"]);
const voteReactionSchema = z.enum(["accept", "reluctant-compliance", "protest", "organize", "rebel"]);
const collectiveActionKindSchema = z.enum(["petition", "protest", "strike", "civil-disobedience", "rebellion"]);
const actionIdSchema = z.enum(["eat", "rest", "gather_food", "work_job", "socialize", "construct", "forage_wild_food", "gather_fiber", "gather_branches", "gather_loose_stone", "craft_hand_axe", "craft_stone_pick", "craft_primitive", "gather_clay", "drink_natural_water", "catch_fish", "hunt_game", "use_medicine", "fuel_campfire", "cook_food", "boil_water", "explore", "fell_tree", "quarry_stone", "harvest_crop", "sow_crop", "tend_crop", "collect_water", "draw_water", "drink_water", "propose_public_project", "start_construction", "deliver_material", "work_construction", "cancel_project", "repair_structure", "demolish_structure", "move_home", "propose_market_charter", "support_market_charter", "oppose_market_charter", "register_business", "list_good", "buy_good", "invest_business", "offer_job", "accept_job", "adopt_commitment", "change_occupation", "train_skill", "lease_facility", "transfer_good", "operate_recipe", "propose_policy", "cast_ballot", "respond_to_vote", "form_faction", "join_faction", "organize_collective_action", "request_item", "share_item", "steal_item", "barter_item", "rescue_person", "offer_project_help", "invite_project", "teach_technique", "warn_resource", "conceal_resource", "form_household", "form_group", "invite_group", "adopt_group_system", "leave_group", "exclude_member", "contribute_group_stock", "promise_item", "fulfill_promise", "forgive", "retaliate", "claim_resource", "challenge_claim", "idle"]);
const buildingTypeSchema = z.enum(["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot", "cottage", "storehouse", "lumbermill", "stall", "farm", "hall", "well", "road", "bakery", "smithy", "workshop", "fishery"]);
const skillIdSchema = z.enum(["construction", "farming", "baking", "smithing", "logging", "mining", "fishing", "hunting", "foraging", "healing", "trading", "hauling"]);
const pointSchema = z.object({ x: z.number().int(), y: z.number().int() });
const environmentSchema = z.object({
  seed: z.number().int(), harshness: z.enum(["gentle", "balanced", "harsh"]), spawn: pointSchema,
  biomes: z.array(z.string().max(40)).max(512 * 512), elevation: z.array(z.number().min(0).max(1)).max(512 * 512),
  moisture: z.array(z.number().min(0).max(1)).max(512 * 512), fertility: z.array(z.number().min(0).max(1)).max(512 * 512), hazard: z.array(z.number().min(0).max(1)).max(512 * 512),
});
const assetOwnerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("public"), id: z.literal("settlement") }),
  z.object({ kind: z.literal("citizen"), id: z.number().int() }),
  z.object({ kind: z.literal("business"), id: z.string().max(160) }),
]);
const inventoryOwnerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stock") }),
  z.object({ kind: z.literal("citizen"), id: z.number().int() }),
  z.object({ kind: z.literal("business"), id: z.string().max(160) }),
]);
const publicProjectPlanSchema = z.object({
  operation: z.enum(["build", "road", "repair", "demolish"]), buildingType: buildingTypeSchema.optional(), position: pointSchema.optional(),
  route: z.array(pointSchema).max(512).optional(), targetKind: z.enum(["building", "road"]).optional(), targetId: z.string().max(160).optional(),
  budget: resourceAmount, required: z.record(z.string().max(80), resourceAmount), laborRequired: z.number().int().positive(), label: z.string().min(1).max(160),
});
const actionIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"]) }),
  z.object({ kind: z.enum(["forage_wild_food", "gather_fiber"]), nodeId: z.string().max(160) }),
  z.object({ kind: z.enum(["gather_branches", "gather_loose_stone"]), nodeId: z.string().max(160) }),
  z.object({ kind: z.enum(["craft_hand_axe", "craft_stone_pick"]) }),
  z.object({ kind: z.literal("craft_primitive"), recipeId: z.enum(["sharp-stone", "fire-starter", "basket", "water-container", "spear", "fishing-tool", "simple-clothing", "basic-medicine"]) }),
  z.object({ kind: z.enum(["gather_clay", "drink_natural_water", "catch_fish", "hunt_game", "use_medicine", "explore"]) }),
  z.object({ kind: z.literal("fuel_campfire"), buildingObjectUid: z.number().int().positive() }),
  z.object({ kind: z.literal("cook_food"), buildingObjectUid: z.number().int().positive(), resource: z.enum(["berries", "fish", "meat"]) }),
  z.object({ kind: z.literal("boil_water"), buildingObjectUid: z.number().int().positive() }),
  z.object({ kind: z.literal("fell_tree"), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("quarry_stone"), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("harvest_crop"), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("sow_crop"), nodeId: z.string().max(160), cropType: z.enum(["wheat", "cabbage", "pumpkin"]) }),
  z.object({ kind: z.literal("tend_crop"), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("collect_water") }),
  z.object({ kind: z.literal("draw_water"), buildingObjectUid: z.number().int().positive() }),
  z.object({ kind: z.literal("drink_water") }),
  z.object({ kind: z.literal("propose_public_project"), plan: publicProjectPlanSchema }),
  z.object({ kind: z.literal("start_construction"), buildingType: buildingTypeSchema, x: z.number().int(), y: z.number().int(), owner: assetOwnerSchema, mandateId: z.string().max(200).optional(), route: z.array(pointSchema).max(512).optional() }),
  z.object({ kind: z.literal("deliver_material"), projectId: z.string().max(160), resource: z.string().max(80), amount: z.number().int().positive(), source: z.enum(["inventory", "stock"]) }),
  z.object({ kind: z.literal("work_construction"), projectId: z.string().max(160) }),
  z.object({ kind: z.literal("cancel_project"), projectId: z.string().max(160) }),
  z.object({ kind: z.literal("repair_structure"), targetKind: z.enum(["building", "road"]), targetId: z.string().max(160), mandateId: z.string().max(200).optional() }),
  z.object({ kind: z.literal("demolish_structure"), buildingObjectUid: z.number().int().positive(), mandateId: z.string().max(200).optional() }),
  z.object({ kind: z.literal("move_home"), buildingObjectUid: z.number().int().positive() }),
  z.object({ kind: z.literal("propose_market_charter") }),
  z.object({ kind: z.enum(["support_market_charter", "oppose_market_charter"]), proposalId: z.string().max(160) }),
  z.object({ kind: z.literal("register_business"), businessKind: z.string().max(80) }),
  z.object({ kind: z.literal("list_good"), ownerType: z.enum(["citizen", "business"]), ownerId: z.string().max(160), resource: z.string().max(80), amount: z.number().int().positive(), unitPrice: z.number().int().positive() }),
  z.object({ kind: z.literal("buy_good"), offerId: z.string().max(200), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("invest_business"), businessId: z.string().max(160), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("offer_job"), businessId: z.string().max(160), workerId: z.number().int(), wage: z.number().int().positive() }),
  z.object({ kind: z.literal("accept_job"), contractId: z.string().max(200) }),
  z.object({ kind: z.literal("adopt_commitment"), commitmentKind: z.enum(["survival", "enterprise", "construction", "production", "public-service", "learning"]), objective: boundedText, strategy: boundedText, targetId: z.string().max(200).optional() }),
  z.object({ kind: z.literal("change_occupation"), occupation: z.string().max(80), reason: boundedText }),
  z.object({ kind: z.literal("train_skill"), skill: skillIdSchema }),
  z.object({ kind: z.literal("lease_facility"), businessId: z.string().max(160), buildingObjectUid: z.number().int().positive(), rent: resourceAmount }),
  z.object({ kind: z.literal("transfer_good"), resource: z.string().max(80), amount: z.number().int().positive(), from: inventoryOwnerSchema, to: inventoryOwnerSchema }),
  z.object({ kind: z.literal("operate_recipe"), recipeId: z.string().max(160), facilityObjectUid: z.number().int().positive(), owner: inventoryOwnerSchema }),
  z.object({ kind: z.literal("propose_policy"), policyId: policyIdSchema }),
  z.object({ kind: z.literal("cast_ballot"), proposalId: z.string().max(200), choice: ballotChoiceSchema }),
  z.object({ kind: z.literal("respond_to_vote"), proposalId: z.string().max(200), response: voteReactionSchema }),
  z.object({ kind: z.literal("form_faction"), proposalId: z.string().max(200), position: z.enum(["support", "oppose"]) }),
  z.object({ kind: z.literal("join_faction"), factionId: z.string().max(200) }),
  z.object({ kind: z.literal("organize_collective_action"), factionId: z.string().max(200), action: collectiveActionKindSchema }),
  z.object({ kind: z.literal("request_item"), targetCitizenId: z.number().int(), resource: z.string().max(80), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("share_item"), targetCitizenId: z.number().int(), resource: z.string().max(80), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("steal_item"), targetCitizenId: z.number().int(), resource: z.string().max(80), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("barter_item"), targetCitizenId: z.number().int(), offerResource: z.string().max(80), requestResource: z.string().max(80), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("rescue_person"), targetCitizenId: z.number().int() }),
  z.object({ kind: z.enum(["offer_project_help", "invite_project"]), targetCitizenId: z.number().int(), projectId: z.string().max(160) }),
  z.object({ kind: z.literal("teach_technique"), targetCitizenId: z.number().int(), technique: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("warn_resource"), targetCitizenId: z.number().int(), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("conceal_resource"), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("form_household"), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("form_group"), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("invite_group"), groupId: z.string().max(160), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("adopt_group_system"), groupId: z.string().max(160), system: z.enum(["consensus", "majority", "leader", "council"]) }),
  z.object({ kind: z.literal("leave_group"), groupId: z.string().max(160) }),
  z.object({ kind: z.literal("exclude_member"), groupId: z.string().max(160), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("contribute_group_stock"), groupId: z.string().max(160), resource: z.string().max(80), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("promise_item"), targetCitizenId: z.number().int(), resource: z.string().max(80), amount: z.number().int().positive(), dueTick: z.number().int().min(0) }),
  z.object({ kind: z.literal("fulfill_promise"), promiseId: z.string().max(200), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("forgive"), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("retaliate"), targetCitizenId: z.number().int() }),
  z.object({ kind: z.literal("claim_resource"), nodeId: z.string().max(160) }),
  z.object({ kind: z.literal("challenge_claim"), nodeId: z.string().max(160), ownerId: z.number().int() }),
]);
const candidateSchema = z.object({
  id: z.string().max(240), label: z.string().max(160), legal: z.boolean(), blockedBy: boundedText.optional(), score: z.number().nullable(),
  trace: z.array(z.object({ rule: z.string().max(160), contribution: z.number() })).max(50), intent: actionIntentSchema.optional(),
});
const providerSchema = z.object({
  kind: z.enum(["mock", "test-delayed", "local-brain"]).catch("local-brain"), id: z.string().min(1).max(120), label: z.string().min(1).max(160), version: z.string().min(1).max(80),
});
const evaluationSchema = z.object({
  candidateId: z.string().max(240), score: z.number().optional(), probability: z.number().min(0).max(1).optional(),
  trace: z.array(z.object({ rule: z.string().max(160), contribution: z.number() })).max(30).optional(),
});
const providerSignalsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heuristic"), evaluations: z.array(evaluationSchema).max(30) }),
  z.object({ kind: z.literal("external"), evaluations: z.array(evaluationSchema).max(50), confidence: z.number().min(0).max(1).optional(), responseModel: z.string().max(240).optional(), inputTokens: z.number().int().min(0).optional(), costUsd: z.number().min(0).optional(), entropy: z.number().min(0).optional(), checkpointVersion: z.string().max(128).optional() }),
]);
const freshnessSchema = z.object({
  requestedAtTick: z.number().int().min(0), deadlineTick: z.number().int().min(0), worldRevision: z.number().int().min(0),
  npcRevision: z.number().int().min(0), topologyRevision: z.number().int().min(0), perceptionHash: z.string().max(120), legalSetHash: z.string().max(120),
});
const decisionSchema = z.object({
  id: z.string().max(120), tick: z.number().int().min(0), stateVersion: z.number().int().min(0), citizenId: z.number().int(), citizenName: z.string().max(100),
  provider: z.union([z.literal("mock-heuristic-v1"), providerSchema]), policyVersion: z.string().max(80).optional(), freshness: freshnessSchema.optional(),
  resolution: z.enum(["accepted", "fallback"]).optional(), resolutionReason: boundedText.optional(), providerSignals: providerSignalsSchema.optional(), latencyMs: z.number().min(0).max(3_600_000).optional(),
  context: z.object({
    job: z.string().max(60), traits: z.array(z.string().max(60)).max(12), needs: needsSchema, worldStock: z.record(z.string().max(80), z.number()),
    societyGoalId: z.enum(["none", "market-economy", "custom"]).optional(), goalStage: z.enum(["inactive", "experiment", "founding", "property-rights", "active-market", "enterprise", "capital-formation", "complete"]).optional(),
    wallet: resourceAmount.optional(), economicPolicies: z.object({ privateProperty: z.boolean(), currency: z.boolean(), contracts: z.boolean(), taxRate: z.number().min(0).max(1).default(0), publicFoodReserve: z.boolean().default(false) }).optional(),
    activeProposalId: z.string().max(200).optional(), politicalLegitimacy: z.number().min(0).max(1).optional(), politicalGrievance: z.number().min(0).max(1).optional(),
  }),
  candidates: z.array(candidateSchema).max(50), selected: actionIdSchema, selectedCandidateId: z.string().max(240).optional(), selectedIntent: actionIntentSchema.optional(), selectedLabel: z.string().max(160), consequences: z.array(boundedText).max(30),
  resourceDelta: z.record(z.string().max(80), z.number().finite()), activity: boundedText, targetCitizenId: z.number().int().optional(),
  target: z.object({ x: z.number().int(), y: z.number().int() }).optional(), targetMode: z.enum(["self", "static", "citizen"]).optional(), interactionRadius: z.number().int().min(0).max(8).optional(), route: z.array(z.object({ x: z.number().int(), y: z.number().int() })).max(10_000).optional(),
  actionInstanceId: z.string().max(160).optional(), actionStatus: z.enum(["in-progress", "completed", "cancelled"]).optional(), completedAtTick: z.number().int().min(0).optional(),
});
const eventSchema = z.object({
  id: z.string().max(120), tick: z.number().int().min(0), day: z.number().int().min(1), category: z.enum(["work", "need", "social", "construction", "economic", "civic", "world"]),
  title: z.string().max(200), detail: z.string().max(1500), citizenIds: z.array(z.number().int()).max(100), decisionId: z.string().max(120).optional(),
});
const trendSchema = z.object({ tick: z.number().int(), food: z.number(), materials: z.number(), happiness: z.number(), stability: z.number() });
const actionInstanceSchema = z.object({
  id: z.string().max(160), decisionId: z.string().max(120), citizenId: z.number().int(), actionId: actionIdSchema, intent: actionIntentSchema.optional(),
  phase: z.enum(["moving", "performing"]), startedAtTick: z.number().int().min(0), target: z.object({ x: z.number().int(), y: z.number().int() }),
  targetMode: z.enum(["self", "static", "citizen"]).optional(), interactionRadius: z.number().int().min(0).max(8).optional(),
  route: z.array(z.object({ x: z.number().int(), y: z.number().int() })).max(10_000), routeIndex: z.number().int().min(0), workTicksRemaining: z.number().int().min(0),
  repathCount: z.number().int().min(0).optional(), unreachableTicks: z.number().int().min(0).optional(),
  workTicksTotal: z.number().int().min(1).optional(), interruptible: z.boolean().optional(), minimumCommitmentUntilTick: z.number().int().min(0).optional(), nextReviewAtTick: z.number().int().min(0).optional(),
  resourceClaims: z.array(z.object({ kind: z.enum(["resource", "stock", "wallet", "treasury", "inventory", "offer", "business-capital"]).optional(), resourceId: z.string().max(200), amount: z.number().int().min(0) })).max(30), targetCitizenId: z.number().int().optional(),
});
const reservationSchema = z.object({
  id: z.string().max(240), actionInstanceId: z.string().max(160), citizenId: z.number().int(), kind: z.enum(["location", "resource", "stock", "wallet", "treasury", "inventory", "offer", "business-capital"]),
  key: z.string().max(160), amount: z.number().int().min(0), createdAtTick: z.number().int().min(0), expiresAtTick: z.number().int().min(0).optional(),
});
const goalMilestoneSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().max(160), completedAtTick: z.number().int().min(0).optional(),
});
const civilizationGoalSchema = z.object({
  id: z.enum(["none", "market-economy", "custom"]),
  prompt: boundedText.default(""),
  stage: z.enum(["inactive", "experiment", "founding", "property-rights", "active-market", "enterprise", "capital-formation", "complete"]),
  milestones: z.array(goalMilestoneSchema).max(20),
  dimensions: z.array(z.object({ id: z.enum(["prosperity", "equality", "freedom", "stability", "survival", "sustainability", "democracy", "expansion"]), label: z.string().max(120), weight: z.number().min(0).max(1), progress: z.number().min(0).max(1) })).max(8).default([]),
});
const economySchema = z.object({
  currency: z.object({ id: z.literal("shell"), label: z.literal("Shells") }),
  wallets: z.record(z.string(), resourceAmount), treasury: resourceAmount, moneySupply: resourceAmount,
  policies: z.object({ privateProperty: z.boolean(), currency: z.boolean(), contracts: z.boolean(), taxRate: z.number().min(0).max(1).default(0), publicFoodReserve: z.boolean().default(false) }),
  charter: z.object({
    id: z.string().max(160), proposerId: z.number().int(), supporterIds: z.array(z.number().int()).max(5_000), opponentIds: z.array(z.number().int()).max(5_000),
    status: z.enum(["open", "adopted", "rejected"]), createdAtTick: z.number().int().min(0), resolvedAtTick: z.number().int().min(0).optional(),
  }).optional(),
  ownership: z.array(z.object({ assetId: z.string().max(200), assetKind: z.enum(["productive-license", "business", "building"]), ownerId: z.number().int(), acquiredAtTick: z.number().int().min(0) })).max(20_000),
  businesses: z.record(z.string(), z.object({
    id: z.string().max(160), name: z.string().max(160), kind: z.string().max(80), ownerId: z.number().int(), capital: resourceAmount,
    inventory: z.record(z.string().max(80), resourceAmount), employeeIds: z.array(z.number().int()).max(5_000), createdAtTick: z.number().int().min(0),
    organization: z.enum(["sole-proprietorship", "partnership", "cooperative", "public-enterprise", "household"]).optional(),
    facilityObjectUids: z.array(z.number().int().positive()).max(1_000).optional(), blockers: z.array(boundedText).max(50).optional(), productionRuns: z.number().int().min(0).optional(),
  })),
  offers: z.record(z.string(), z.object({
    id: z.string().max(200), sellerId: z.number().int(), businessId: z.string().max(160).optional(), sourceOwnerType: z.enum(["citizen", "business"]), sourceOwnerId: z.string().max(160),
    resource: z.string().max(80), amountRemaining: resourceAmount, unitPrice: resourceAmount, status: z.enum(["open", "filled", "cancelled", "expired"]),
    createdAtTick: z.number().int().min(0), expiresAtTick: z.number().int().min(0), foodLot: z.object({ producedAtTick: z.number().int().min(0), expiresAtTick: z.number().int().min(0), storageBuildingUid: z.number().int().positive().optional() }).optional(),
  })),
  contracts: z.record(z.string(), z.object({
    id: z.string().max(200), businessId: z.string().max(160), employerId: z.number().int(), workerId: z.number().int(), wage: resourceAmount, escrowedWage: resourceAmount,
    status: z.enum(["offered", "active", "completed", "cancelled"]), createdAtTick: z.number().int().min(0), expiresAtTick: z.number().int().min(0), acceptedAtTick: z.number().int().min(0).optional(),
  })),
  transactions: z.array(z.object({
    id: z.string().max(240), tick: z.number().int().min(0), kind: z.enum(["trade", "investment", "wage", "founding-allocation"]),
    fromId: z.string().max(200), toId: z.string().max(200), money: resourceAmount, resource: z.string().max(80).optional(), amount: resourceAmount.optional(), offerId: z.string().max(200).optional(), contractId: z.string().max(200).optional(),
  })).max(5_000),
  production: z.array(z.object({
    id: z.string().max(240), recipeId: z.string().max(160), citizenId: z.number().int(), businessId: z.string().max(160).optional(), facilityObjectUid: z.number().int().positive(), owner: inventoryOwnerSchema,
    inputs: z.record(z.string().max(80), resourceAmount), outputs: z.record(z.string().max(80), resourceAmount), completedAtTick: z.number().int().min(0),
  })).max(5_000).optional(),
  priceHistory: z.record(z.string().max(80), z.array(z.object({ tick: z.number().int().min(0), unitPrice: resourceAmount })).max(200)),
  indicators: z.object({
    tradeVolume: resourceAmount, medianWealth: resourceAmount, wealthConcentration: z.number().min(0).max(1), employedCitizens: z.number().int().min(0),
    activeBusinesses: z.number().int().min(0), activeOffers: z.number().int().min(0), charterSupport: z.number().min(0).max(1), citizensWithSevereNeeds: z.number().int().min(0),
  }),
});
const ballotSchema = z.object({ citizenId: z.number().int(), choice: ballotChoiceSchema, castAtTick: z.number().int().min(0), decisionId: z.string().max(160) });
const proposalSchema = z.object({
  id: z.string().max(200), policyId: policyIdSchema, sponsorId: z.number().int(), eligibleVoterIds: z.array(z.number().int()).max(5_000),
  kind: z.enum(["policy", "public-project", "demolition", "major-repair"]).optional(), projectPlan: publicProjectPlanSchema.optional(),
  ballots: z.record(z.string(), ballotSchema), status: z.enum(["voting", "adopted", "rejected"]), createdAtTick: z.number().int().min(0), resolvedAtTick: z.number().int().min(0).optional(),
  tally: z.object({ support: z.number().int().min(0), oppose: z.number().int().min(0), abstain: z.number().int().min(0) }),
});
const politicalCitizenSchema = z.object({
  legitimacy: z.number().min(0).max(1), grievance: z.number().min(0).max(1), engagement: z.number().min(0).max(1), factionId: z.string().max(200).optional(),
  reactions: z.record(z.string(), voteReactionSchema),
});
const factionSchema = z.object({
  id: z.string().max(200), name: z.string().max(160), founderId: z.number().int(), proposalId: z.string().max(200), position: z.enum(["support", "oppose"]),
  memberIds: z.array(z.number().int()).max(5_000), influence: z.number().min(0).max(1), radicalization: z.number().min(0).max(1), createdAtTick: z.number().int().min(0),
});
const collectiveActionSchema = z.object({
  id: z.string().max(220), factionId: z.string().max(200), kind: collectiveActionKindSchema, participantIds: z.array(z.number().int()).max(5_000),
  status: z.enum(["organizing", "active", "resolved"]), startedAtTick: z.number().int().min(0), activatedAtTick: z.number().int().min(0).optional(), resolvedAtTick: z.number().int().min(0).optional(),
  outcome: z.enum(["conceded", "contained", "administration-changed", "dissipated"]).optional(),
});
const politicsSchema = z.object({
  institutionStage: z.enum(["none", "founding", "formal"]).default("formal"),
  constitution: z.object({ system: z.literal("direct-majority"), ballot: z.literal("one-person-one-vote"), threshold: z.literal("simple-majority"), tieRule: z.literal("status-quo") }),
  administration: z.object({ form: z.enum(["public-assembly", "faction-council"]), governingFactionId: z.string().max(200).optional(), changedAtTick: z.number().int().min(0) }).default({ form: "public-assembly", changedAtTick: 0 }),
  activeProposalId: z.string().max(200).optional(), proposals: z.record(z.string(), proposalSchema),
  laws: z.record(z.string(), z.object({ policyId: policyIdSchema, proposalId: z.string().max(200), enactedAtTick: z.number().int().min(0), support: z.number().int().min(0), oppose: z.number().int().min(0) })),
  citizens: z.record(z.string(), politicalCitizenSchema), factions: z.record(z.string(), factionSchema), collectiveActions: z.record(z.string(), collectiveActionSchema),
  indicators: z.object({ turnout: z.number().min(0).max(1), averageLegitimacy: z.number().min(0).max(1), unrest: z.number().min(0).max(1), factionCount: z.number().int().min(0), rebellionActive: z.boolean() }),
});
const resourceNodeSchema = z.object({
  id: z.string().max(160), objectUid: z.number().int().positive(), assetId: z.string().max(80), kind: z.enum(["tree", "stone", "crop", "wild-food", "fiber"]),
  position: z.object({ x: z.number().int(), y: z.number().int() }), yield: z.record(z.string().max(80), resourceAmount), status: z.enum(["available", "depleted"]),
  depletedAtTick: z.number().int().min(0).optional(), regrowAtTick: z.number().int().min(0).optional(),
  cropType: z.enum(["wheat", "cabbage", "pumpkin"]).optional(), cropStage: z.enum(["fallow", "sown", "growing", "ripe", "withered"]).optional(),
  plantedAtTick: z.number().int().min(0).optional(), growth: z.number().min(0).max(1).optional(), moisture: z.number().min(0).max(1).optional(), health: z.number().min(0).max(1).optional(), lastTendedAtTick: z.number().int().min(0).optional(),
});
const constructionProjectSchema = z.object({
  id: z.string().max(160), objectUid: z.number().int().positive(), buildingType: buildingTypeSchema,
  position: z.object({ x: z.number().int(), y: z.number().int() }), workPosition: z.object({ x: z.number().int(), y: z.number().int() }),
  footprint: z.object({ width: z.number().int().positive().max(12), height: z.number().int().positive().max(12) }), owner: assetOwnerSchema,
  requestedByCitizenId: z.number().int(), status: z.enum(["materials", "building", "complete", "cancelled"]),
  required: z.record(z.string().max(80), resourceAmount), delivered: z.record(z.string().max(80), resourceAmount),
  laborRequired: z.number().int().positive(), laborCompleted: z.number().int().min(0), residentIds: z.array(z.number().int()).max(100), capacity: z.number().int().min(0).max(100),
  createdAtTick: z.number().int().min(0), completedAtTick: z.number().int().min(0).optional(), mandateId: z.string().max(200).optional(), escrowId: z.string().max(200).optional(),
  roadRoute: z.array(pointSchema).max(512).optional(), cancelledAtTick: z.number().int().min(0).optional(), cancellationReason: boundedText.optional(), demolishedAtTick: z.number().int().min(0).optional(),
});
const buildingSchema = z.object({
  objectUid: z.number().int().positive(), buildingType: buildingTypeSchema, position: z.object({ x: z.number().int(), y: z.number().int() }), owner: assetOwnerSchema,
  capacity: z.number().int().min(0).max(100), residentIds: z.array(z.number().int()).max(100), condition: z.number().min(0).max(1), completedAtTick: z.number().int().min(0), operatorBusinessId: z.string().max(160).optional(), damagedAtTick: z.number().int().min(0).optional(), lastRepairedAtTick: z.number().int().min(0).optional(), fuel: resourceAmount.optional(),
});
const physicalWorldSchema = z.object({
  enabled: z.boolean(), nextObjectUid: z.number().int().positive(), resources: z.record(z.string(), resourceNodeSchema), projects: z.record(z.string(), constructionProjectSchema), buildings: z.record(z.string(), buildingSchema),
  renewableStocks: z.record(z.string(), z.object({ id: z.string().max(160), resource: z.string().max(80), amount: resourceAmount, capacity: z.number().positive(), regenerationPerTick: resourceAmount, lastHarvestedAtTick: z.number().int().min(0).optional() })).optional(),
  roads: z.record(z.string(), z.object({ id: z.string().max(160), projectId: z.string().max(160), position: pointSchema, condition: z.number().min(0).max(1), completedAtTick: z.number().int().min(0), lastRepairedAtTick: z.number().int().min(0).optional() })).optional(),
  mandates: z.record(z.string(), z.object({ id: z.string().max(200), proposalId: z.string().max(200), plan: publicProjectPlanSchema, status: z.enum(["authorized", "claimed", "fulfilled", "expired"]), authorizedAtTick: z.number().int().min(0), expiresAtTick: z.number().int().min(0), projectId: z.string().max(160).optional() })).optional(),
  escrows: z.record(z.string(), z.object({ id: z.string().max(200), projectId: z.string().max(160), payer: assetOwnerSchema, deposited: resourceAmount, balance: resourceAmount, spent: resourceAmount, refunded: resourceAmount, status: z.enum(["held", "settled", "refunded"]), payouts: z.array(z.object({ citizenId: z.number().int(), amount: resourceAmount, tick: z.number().int().min(0), reason: z.literal("labor") })).max(10_000) })).optional(),
  foodLots: z.record(z.string(), z.object({ id: z.string().max(200), resource: z.enum(["berries", "wheat", "fish", "meat", "cooked_meal", "bread", "cabbage", "pumpkin"]), amount: resourceAmount, owner: z.union([z.object({ kind: z.literal("stock") }), z.object({ kind: z.literal("citizen"), id: z.number().int() }), z.object({ kind: z.literal("business"), id: z.string().max(160) })]), producedAtTick: z.number().int().min(0), expiresAtTick: z.number().int().min(0), storageBuildingUid: z.number().int().positive().optional() })).optional(),
  demolitions: z.record(z.string(), z.object({ id: z.string().max(200), buildingObjectUid: z.number().int().positive(), buildingType: buildingTypeSchema, position: pointSchema, owner: assetOwnerSchema, conditionAtDemolition: z.number().min(0).max(1), demolishedAtTick: z.number().int().min(0), salvaged: z.record(z.string().max(80), resourceAmount), mandateId: z.string().max(200).optional() })).optional(),
  waste: resourceAmount.optional(),
  claims: z.record(z.string(), z.object({ nodeId: z.string().max(160), ownerId: z.number().int(), strength: z.number().min(0).max(1), createdAtTick: z.number().int().min(0), challengedByIds: z.array(z.number().int()).max(5_000) })).optional(),
});
const socialGroupSchema = z.object({
  id: z.string().max(160), name: z.string().max(120), founderId: z.number().int(), memberIds: z.array(z.number().int()).max(5_000),
  sharedInventory: z.record(z.string().max(80), resourceAmount), norms: z.array(z.string().max(160)).max(100),
  decisionSystem: z.enum(["informal", "consensus", "majority", "leader", "council"]), leaderId: z.number().int().optional(), createdAtTick: z.number().int().min(0),
});
const socialPromiseSchema = z.object({
  id: z.string().max(200), fromCitizenId: z.number().int(), toCitizenId: z.number().int(), resource: z.string().max(80), amount: z.number().int().positive(),
  promisedAtTick: z.number().int().min(0), dueTick: z.number().int().min(0), status: z.enum(["open", "fulfilled", "broken", "forgiven"]), resolvedAtTick: z.number().int().min(0).optional(),
});
const checkpointSchema = z.object({
  tick: z.number().int().min(0), digest: z.string().max(120), state: z.object({
    stateVersion: z.number().int().min(0), worldRevision: z.number().int().min(0), cursor: z.number().int().min(0),
    topology: z.object({
      width: z.number().int().min(1).max(512), height: z.number().int().min(1).max(512), topologyRevision: z.number().int().min(0),
      walkable: z.array(z.number().int().min(0).max(1)).max(512 * 512), moveCost: z.array(z.number().int().min(1)).max(512 * 512),
      locations: z.record(z.string().max(120), z.array(z.object({ x: z.number().int(), y: z.number().int() })).max(20_000)),
      environment: environmentSchema.optional(),
    }).optional(),
    citizens: z.record(z.string(), citizenSchema), stock: z.record(z.string().max(80), resourceAmount), constructionProgress: z.number().min(0).max(1),
    civilizationGoal: civilizationGoalSchema.optional(), economy: economySchema.optional(), politics: politicsSchema.optional(),
    physicalWorld: physicalWorldSchema.optional(),
    socialGroups: z.record(z.string(), socialGroupSchema).default({}), socialPromises: z.record(z.string(), socialPromiseSchema).default({}),
    activeActions: z.record(z.string(), actionInstanceSchema), reservations: z.record(z.string(), reservationSchema),
  }),
});
const requestLogSchema = z.object({
  requestId: z.string().max(160), citizenId: z.number().int(), requestedAtTick: z.number().int().min(0), deadlineTick: z.number().int().min(0),
  status: z.enum(["queued", "in-flight", "accepted", "discarded", "timed-out", "cancelled", "fallback"]), providerId: z.string().max(120), reason: boundedText.optional(),
});
const simulationSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), seed: z.number().int(), tick: z.number().int().min(0), stateVersion: z.number().int().min(0), worldRevision: z.number().int().min(0).optional(), cursor: z.number().int().min(0),
  topology: z.object({
    width: z.number().int().min(1).max(512), height: z.number().int().min(1).max(512), topologyRevision: z.number().int().min(0),
    walkable: z.array(z.number().int().min(0).max(1)).max(512 * 512), moveCost: z.array(z.number().int().min(1)).max(512 * 512),
    locations: z.record(z.string().max(120), z.array(z.object({ x: z.number().int(), y: z.number().int() })).max(20_000)),
    environment: environmentSchema.optional(),
  }).optional(),
  activeActions: z.record(z.string(), actionInstanceSchema).optional(),
  reservations: z.record(z.string(), reservationSchema).optional(),
  checkpoints: z.array(checkpointSchema).max(64).optional(),
  requests: z.array(requestLogSchema).max(500).optional(),
  citizens: z.record(z.string(), citizenSchema), stock: z.record(z.string().max(80), resourceAmount), decisions: z.array(decisionSchema).max(1000),
  events: z.array(eventSchema).max(5000), trends: z.array(trendSchema).max(5000),
  constructionProgress: z.number().min(0).max(1),
  civilizationGoal: civilizationGoalSchema.optional(), economy: economySchema.optional(), politics: politicsSchema.optional(),
  physicalWorld: physicalWorldSchema.optional(),
  socialGroups: z.record(z.string(), socialGroupSchema).default({}), socialPromises: z.record(z.string(), socialPromiseSchema).default({}),
});

const documentSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  config: z.object({
    name: z.string().min(1).max(100),
    presetId: z.string().min(1),
    seed: z.number().int(),
    era: z.number().int(),
    chapter: z.number().int(),
    government: z.enum(["council", "kingdom", "republic"]),
    societyGoal: z.enum(["none", "market-economy", "custom"]).optional(), goalPrompt: boundedText.optional(), decisionMode: z.enum(["mock", "local-brain"]).catch("local-brain").optional(),
    brainDeployment: z.object({ experimentId: z.string().max(200), generation: z.number().int().min(0), label: z.string().max(200), brainIds: z.array(z.string().max(200)).min(1).max(1000), speciesIds: z.array(z.string().max(200)).max(1000) }).optional(),
    weather: z.string(),
  }),
  world: z.object({
    width: z.number().int().min(8).max(512),
    height: z.number().int().min(8).max(512),
    day: z.number().int().min(1),
    time: z.number().min(0),
    season: z.number().int().min(0).max(3),
    stock: z.record(z.string(), resourceAmount),
    tiles: z.array(z.number().int().min(0).max(255)).max(512 * 512),
    objects: z.array(z.object({
      uid: z.number().int(), id: z.string(), x: z.number().int(), y: z.number().int(),
      opts: z.record(z.string(), z.unknown()), build: z.number(), age: z.number(),
    })).max(20_000),
    entities: z.array(z.object({
      uid: z.number().int(), kind: z.string(), x: z.number().finite(), y: z.number().finite(), name: z.string(), job: z.string(),
      look: z.array(z.number()).optional(), homeUid: z.number().int().optional(), v: z.number().optional(),
      trait: z.string().optional(), goal: z.string().optional(), inventory: z.record(z.string(), z.number()).optional(),
      initialNeeds: needsSchema.optional(), settlementId: z.string().max(80).optional(), relationshipPreset: z.enum(["strained", "neutral", "friendly"]).optional(),
    })).max(5_000),
  }),
  editor: z.object({
    layers: z.object({
      terrain: z.object({ visible: z.boolean(), locked: z.boolean() }),
      objects: z.object({ visible: z.boolean(), locked: z.boolean() }),
      people: z.object({ visible: z.boolean(), locked: z.boolean() }),
    }),
    settlementByCitizen: z.record(z.string(), z.string().max(80)),
    commandLog: z.array(z.object({ id: z.string().max(160), type: z.string().max(80), payload: z.record(z.string(), z.unknown()) })).max(500),
  }).optional(),
  simulation: simulationSchema.nullable(),
});

interface SerializableObject extends LegacyWorldObject {
  opts: Record<string, unknown>; age: number;
}

interface SerializableEntity extends LegacyEntity {
  look?: number[]; home?: SerializableObject; v?: number;
}

export interface SerializableWorld extends LegacyWorld {
  preset: string;
  day: number;
  time: number;
  season: number;
  tiles: Uint8Array;
  uid: number;
  objects: SerializableObject[];
  entities: SerializableEntity[];
  remove(object: SerializableObject): void;
}

function physicalWorldFromDocument(world: { objects: PersistedObject[] }) {
  const footprints: Record<string, [number, number]> = {
    cottage: [2, 2], tent: [2, 2], hut: [2, 2], fishhut: [2, 2], bakery: [2, 2], blacksmith: [2, 2], storehouse: [2, 2], lumbermill: [3, 2], stall: [2, 1], field: [3, 3], hall: [4, 3], courthouse: [3, 2], parliament: [4, 3],
  };
  const homeCapacity: Record<string, number> = { cottage: 2, tent: 2, hut: 2, fishhut: 1 };
  const trees = new Set(["oak", "pine", "palm", "elder"]);
  const crops = new Set(["wheat", "cabbage", "pumpkin"]);
  return createPhysicalWorld({
    nextObjectUid: Math.max(1, ...world.objects.map((object) => object.uid + 1)),
    objects: world.objects.map((object) => ({
      uid: object.uid,
      assetId: object.id,
      x: object.x,
      y: object.y,
      build: object.build,
      age: object.age,
      footprint: { width: footprints[object.id]?.[0] ?? 1, height: footprints[object.id]?.[1] ?? 1 },
      category: footprints[object.id] ? "building" : crops.has(object.id) ? "crop" : trees.has(object.id) || object.id === "rock" ? "nature" : "prop",
      tree: trees.has(object.id),
      crop: crops.has(object.id),
      homeCapacity: homeCapacity[object.id] ?? 0,
    })),
  });
}

export function parseWorldDocument(value: unknown): WorldDocument {
  const parsed = documentSchema.parse(value);
  const sourceDocumentVersion = parsed.schemaVersion;
  const sourceSimulationVersion = parsed.simulation?.schemaVersion;
  const legacySimulation = sourceDocumentVersion < 3 || sourceSimulationVersion !== undefined && sourceSimulationVersion < 3;
  const legacyPolitics = sourceDocumentVersion < 4 || sourceSimulationVersion !== undefined && sourceSimulationVersion < 4;
  const legacyPhysicalWorld = sourceDocumentVersion < 5 || sourceSimulationVersion !== undefined && sourceSimulationVersion < 5;
  const legacyLivingWorld = sourceDocumentVersion < 6 || sourceSimulationVersion !== undefined && sourceSimulationVersion < 6;
  const legacySettlementSystems = Boolean(parsed.simulation && (
    parsed.simulation.economy?.production === undefined
    || parsed.simulation.physicalWorld?.renewableStocks === undefined
    || parsed.simulation.physicalWorld?.enabled && parsed.simulation.physicalWorld.renewableStocks?.water === undefined
    || Object.values(parsed.simulation.citizens).some((citizen) => citizen.skills === undefined)
    || Object.values(parsed.simulation.economy?.businesses ?? {}).some((business) => business.organization === undefined || business.facilityObjectUids === undefined || business.blockers === undefined || business.productionRuns === undefined)
  ));
  if (sourceDocumentVersion === 3 && parsed.config.societyGoal === undefined) throw new Error("Schema v3 world config is missing its civilization goal.");
  if (sourceDocumentVersion === 4 && (parsed.config.societyGoal === undefined || parsed.config.goalPrompt === undefined)) throw new Error("Schema v4 world config is missing its civilization goal or prompt.");
  parsed.config.societyGoal ??= "none";
  parsed.config.goalPrompt ??= createCivilizationGoal(parsed.config.societyGoal).prompt;
  parsed.config.decisionMode ??= "local-brain";
  parsed.editor ??= {
    layers: { terrain: { visible: true, locked: false }, objects: { visible: true, locked: false }, people: { visible: true, locked: false } },
    settlementByCitizen: {},
    commandLog: [],
  };
  if (parsed.simulation) {
    if (!legacySimulation && (!parsed.simulation.civilizationGoal || !parsed.simulation.economy)) throw new Error("Schema v3+ simulation is missing civilization goal or economy state.");
    if (!legacyPolitics && !parsed.simulation.politics) throw new Error("Schema v4 simulation is missing political state.");
    if (!legacyPhysicalWorld && !parsed.simulation.physicalWorld) throw new Error("Schema v5 simulation is missing physical world state.");
    parsed.simulation.worldRevision ??= parsed.simulation.stateVersion;
    parsed.simulation.topology ??= {
      width: parsed.world.width,
      height: parsed.world.height,
      topologyRevision: 0,
      walkable: parsed.world.tiles.map((tile) => tile >= 2 ? 1 : 0),
      moveCost: parsed.world.tiles.map(() => 1_000),
      locations: {},
    };
    parsed.simulation.activeActions ??= {};
    for (const action of Object.values(parsed.simulation.activeActions)) {
      action.intent ??= { kind: action.actionId } as NonNullable<typeof action.intent>;
      action.workTicksTotal ??= Math.max(1, action.workTicksRemaining);
      action.interruptible ??= true;
      action.minimumCommitmentUntilTick ??= action.startedAtTick;
      action.nextReviewAtTick ??= action.startedAtTick + 1;
      action.targetMode ??= action.targetCitizenId !== undefined ? "citizen" : "static";
      action.interactionRadius ??= action.targetCitizenId !== undefined ? 1 : 0;
      action.repathCount ??= 0;
      action.unreachableTicks ??= 0;
    }
    parsed.simulation.reservations ??= {};
    for (const reservation of Object.values(parsed.simulation.reservations)) reservation.expiresAtTick ??= reservation.createdAtTick + 10_000;
    parsed.simulation.checkpoints ??= [];
    parsed.simulation.civilizationGoal ??= createCivilizationGoal(parsed.config.societyGoal, parsed.config.goalPrompt);
    if (!parsed.simulation.civilizationGoal.prompt) parsed.simulation.civilizationGoal.prompt = parsed.config.goalPrompt;
    if (!parsed.simulation.civilizationGoal.dimensions.length) parsed.simulation.civilizationGoal.dimensions = createCivilizationGoal(parsed.config.societyGoal, parsed.config.goalPrompt).dimensions;
    parsed.simulation.economy ??= createEconomyState();
    const upgradeEconomy = (economy: NonNullable<typeof parsed.simulation>["economy"]) => {
      if (!economy) return;
      economy.production ??= [];
      for (const business of Object.values(economy.businesses)) {
        business.organization ??= "sole-proprietorship";
        business.facilityObjectUids ??= [];
        business.blockers ??= [];
        business.productionRuns ??= 0;
      }
    };
    upgradeEconomy(parsed.simulation.economy);
    parsed.simulation.politics ??= politicsFromLegacy(parsed.simulation.economy.charter, Object.keys(parsed.simulation.citizens).map(Number));
    parsed.simulation.physicalWorld ??= physicalWorldFromDocument(parsed.world);
    const upgradePhysicalWorld = (physical: NonNullable<typeof parsed.simulation>["physicalWorld"]) => {
      if (!physical) return;
      physical.roads ??= {};
      physical.renewableStocks ??= physical.enabled ? {
        fish: { id: "fish", resource: "fish", amount: 24, capacity: 24, regenerationPerTick: 0.035 },
        water: { id: "water", resource: "water", amount: 120, capacity: 120, regenerationPerTick: 0.2 },
      } : {};
      if (physical.enabled) physical.renewableStocks.water ??= { id: "water", resource: "water", amount: 120, capacity: 120, regenerationPerTick: 0.2 };
      physical.mandates ??= {};
      physical.escrows ??= {};
      physical.foodLots ??= {};
      physical.demolitions ??= {};
      physical.waste ??= 0;
      physical.claims ??= {};
      for (const node of Object.values(physical.resources)) if (node.kind === "crop") {
        node.cropType ??= node.assetId === "cabbage" || node.assetId === "pumpkin" ? node.assetId : "wheat";
        node.cropStage ??= node.status === "available" ? "ripe" : "growing";
        node.plantedAtTick ??= node.depletedAtTick ?? 0;
        node.growth ??= node.status === "available" ? 1 : 0.5;
        node.moisture ??= 0.7;
        node.health ??= 1;
      }
    };
    upgradePhysicalWorld(parsed.simulation.physicalWorld);
    for (const building of Object.values(parsed.simulation.physicalWorld.buildings)) {
      const businessId = building.operatorBusinessId ?? (building.owner.kind === "business" ? building.owner.id : undefined);
      const business = businessId ? parsed.simulation.economy.businesses[businessId] : undefined;
      if (business && !(business.facilityObjectUids ??= []).includes(building.objectUid)) business.facilityObjectUids.push(building.objectUid);
    }
    for (const proposal of Object.values(parsed.simulation.politics.proposals)) proposal.kind ??= proposal.projectPlan ? proposal.projectPlan.operation === "demolish" ? "demolition" : proposal.projectPlan.operation === "repair" ? "major-repair" : "public-project" : "policy";
    for (const checkpoint of parsed.simulation.checkpoints) {
      const missingV3State = !checkpoint.state.topology || !checkpoint.state.civilizationGoal || !checkpoint.state.economy;
      const missingV4State = !checkpoint.state.politics;
      const missingV5State = !checkpoint.state.physicalWorld;
      if (!legacySimulation && missingV3State) throw new Error(`Schema v3 checkpoint at tick ${checkpoint.tick} is incomplete.`);
      if (!legacyPolitics && missingV4State) throw new Error(`Schema v4 checkpoint at tick ${checkpoint.tick} is incomplete.`);
      if (!legacyPhysicalWorld && missingV5State) throw new Error(`Schema v5 checkpoint at tick ${checkpoint.tick} is incomplete.`);
      if (!checkpoint.state.topology) {
        checkpoint.state.topology = structuredClone(parsed.simulation.topology);
      }
      checkpoint.state.civilizationGoal ??= structuredClone(parsed.simulation.civilizationGoal);
      checkpoint.state.economy ??= structuredClone(parsed.simulation.economy);
      upgradeEconomy(checkpoint.state.economy);
      checkpoint.state.politics ??= politicsFromLegacy(checkpoint.state.economy.charter, Object.keys(checkpoint.state.citizens).map(Number));
      checkpoint.state.physicalWorld ??= structuredClone(parsed.simulation.physicalWorld);
      upgradePhysicalWorld(checkpoint.state.physicalWorld);
      for (const building of Object.values(checkpoint.state.physicalWorld.buildings)) {
        const businessId = building.operatorBusinessId ?? (building.owner.kind === "business" ? building.owner.id : undefined);
        const business = businessId ? checkpoint.state.economy.businesses[businessId] : undefined;
        if (business && !(business.facilityObjectUids ??= []).includes(building.objectUid)) business.facilityObjectUids.push(building.objectUid);
      }
      for (const citizen of Object.values(checkpoint.state.citizens)) {
        citizen.needs.thirst ??= 0.2;
        citizen.skills ??= initialSkills(citizen.job);
        citizen.mind ??= initialMindState();
      }
      for (const action of Object.values(checkpoint.state.activeActions ?? {})) {
        action.workTicksTotal ??= Math.max(1, action.workTicksRemaining);
        action.interruptible ??= true;
        action.minimumCommitmentUntilTick ??= action.startedAtTick;
        action.nextReviewAtTick ??= action.startedAtTick + 1;
        action.targetMode ??= action.targetCitizenId !== undefined ? "citizen" : "static";
        action.interactionRadius ??= action.targetCitizenId !== undefined ? 1 : 0;
        action.repathCount ??= 0;
        action.unreachableTicks ??= 0;
      }
      for (const proposal of Object.values(checkpoint.state.politics.proposals)) proposal.kind ??= proposal.projectPlan ? proposal.projectPlan.operation === "demolish" ? "demolition" : proposal.projectPlan.operation === "repair" ? "major-repair" : "public-project" : "policy";
      const digest = stableHash(checkpoint.state);
      if (legacySimulation || legacyPolitics || legacyPhysicalWorld || legacyLivingWorld || legacySettlementSystems || missingV3State || missingV4State || missingV5State) checkpoint.digest = digest;
      else if (checkpoint.digest !== digest) throw new Error(`Simulation checkpoint mismatch at tick ${checkpoint.tick}.`);
    }
    parsed.simulation.requests ??= [];
    const entityHomes = new Map(parsed.world.entities.map((entity) => [entity.uid, entity.homeUid]));
    parsed.simulation.citizens = Object.fromEntries(Object.entries(parsed.simulation.citizens).map(([id, citizen], index) => [id, {
      ...citizen,
      revision: citizen.revision ?? 1,
      position: citizen.position ?? { x: 2 + (index * 3) % Math.max(3, parsed.world.width - 2), y: 2 + (index * 5) % Math.max(3, parsed.world.height - 2) },
      facing: citizen.facing ?? "down",
      needs: { ...citizen.needs, thirst: citizen.needs.thirst ?? 0.2 },
      skills: citizen.skills ?? initialSkills(citizen.job),
      mind: citizen.mind ?? initialMindState(),
      homeObjectUid: citizen.homeObjectUid ?? entityHomes.get(Number(id)),
    }]));
    if (legacyPhysicalWorld) {
      for (const citizen of Object.values(parsed.simulation.citizens)) {
        if (citizen.homeObjectUid === undefined) continue;
        const building = parsed.simulation.physicalWorld.buildings[String(citizen.homeObjectUid)];
        if (building && !building.residentIds.includes(citizen.id) && building.residentIds.length < building.capacity) building.residentIds.push(citizen.id);
      }
      for (const checkpoint of parsed.simulation.checkpoints) {
        for (const citizen of Object.values(checkpoint.state.citizens)) {
          citizen.needs.thirst ??= 0.2;
          citizen.homeObjectUid ??= entityHomes.get(citizen.id);
          if (citizen.homeObjectUid === undefined) continue;
          const building = checkpoint.state.physicalWorld!.buildings[String(citizen.homeObjectUid)];
          if (building && !building.residentIds.includes(citizen.id) && building.residentIds.length < building.capacity) building.residentIds.push(citizen.id);
        }
        checkpoint.digest = stableHash(checkpoint.state);
      }
    }
    parsed.simulation.decisions = parsed.simulation.decisions.map((decision) => ({
      ...decision,
      provider: typeof decision.provider === "string" ? { kind: "mock" as const, id: "mock-heuristic", label: "Mock heuristic provider", version: "1" } : decision.provider,
      policyVersion: decision.policyVersion ?? "legacy-v1",
      freshness: decision.freshness ?? {
        requestedAtTick: decision.tick,
        deadlineTick: decision.tick,
        worldRevision: decision.stateVersion,
        npcRevision: decision.stateVersion,
        topologyRevision: 0,
        perceptionHash: "legacy",
        legalSetHash: "legacy",
      },
      resolution: decision.resolution ?? "accepted",
      selectedCandidateId: decision.selectedCandidateId ?? decision.selected,
      selectedIntent: decision.selectedIntent ?? { kind: decision.selected },
      candidates: decision.candidates.map((candidate) => ({ ...candidate, intent: candidate.intent ?? { kind: candidate.id } })),
      route: decision.route ?? [],
      actionInstanceId: decision.actionInstanceId ?? `action-${decision.id}`,
      actionStatus: decision.actionStatus ?? "completed",
    })) as WorldDocument["simulation"] extends infer _T ? NonNullable<WorldDocument["simulation"]>["decisions"] : never;
  }
  parsed.schemaVersion = 6;
  if (parsed.simulation) parsed.simulation.schemaVersion = 6;
  const result = parsed as unknown as WorldDocument;
  if (result.world.tiles.length !== result.world.width * result.world.height) {
    throw new Error("World tile data does not match its dimensions.");
  }
  const inWorld = (point: { x: number; y: number }, width = result.world.width, height = result.world.height) => point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
  if (result.world.objects.some((item) => !inWorld(item)) || result.world.entities.some((item) => !inWorld(item))) throw new Error("World contains an invalid object or entity coordinate.");
  if (result.simulation) {
    const { width, height } = result.simulation.topology;
    if (result.simulation.topology.walkable.length !== width * height || result.simulation.topology.moveCost.length !== width * height) throw new Error("Simulation topology arrays do not match their dimensions.");
    if (Object.values(result.simulation.citizens).some((citizen) => !inWorld(citizen.position, width, height))) throw new Error("Simulation contains an invalid citizen coordinate.");
    if (result.simulation.decisions.some((decision) => decision.route.some((point) => !inWorld(point, width, height)))) throw new Error("Simulation contains an invalid route coordinate.");
    if (result.simulation.civilizationGoal.id !== result.config.societyGoal) throw new Error("World config and simulation civilization goals do not match.");
    const citizens = Object.values(result.simulation.citizens);
    assertEconomyInvariants(result.simulation.economy, citizens, Object.values(result.simulation.physicalWorld.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
    assertPoliticsInvariants(result.simulation.politics, citizens);
    assertPhysicalWorldInvariants(result.simulation.physicalWorld, citizens, result.simulation.economy);
    if (Object.values(result.simulation.physicalWorld.resources).some((node) => !inWorld(node.position, width, height))) throw new Error("Physical world contains an invalid resource coordinate.");
    if (Object.values(result.simulation.physicalWorld.projects).some((project) => !inWorld(project.position, width, height) || !inWorld(project.workPosition, width, height))) throw new Error("Physical world contains an invalid construction coordinate.");
    for (const checkpoint of result.simulation.checkpoints) {
      const checkpointCitizens = Object.values(checkpoint.state.citizens);
      assertEconomyInvariants(checkpoint.state.economy, checkpointCitizens, Object.values(checkpoint.state.physicalWorld.escrows).reduce((sum, escrow) => sum + escrow.balance, 0));
      assertPoliticsInvariants(checkpoint.state.politics, checkpointCitizens);
      assertPhysicalWorldInvariants(checkpoint.state.physicalWorld, checkpointCitizens, checkpoint.state.economy);
    }
  }
  return result;
}
