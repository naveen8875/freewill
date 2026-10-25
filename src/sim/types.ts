export type NeedId = "hunger" | "fatigue" | "loneliness";

export type TraditionalCoreActionId =
  | "eat"
  | "rest"
  | "gather_food"
  | "work_job"
  | "socialize"
  | "construct"
  | "idle";

export type PhysicalActionId =
  | "forage_wild_food"
  | "gather_fiber"
  | "gather_branches"
  | "gather_loose_stone"
  | "craft_hand_axe"
  | "craft_stone_pick"
  | "craft_primitive"
  | "gather_clay"
  | "drink_natural_water"
  | "catch_fish"
  | "hunt_game"
  | "use_medicine"
  | "fuel_campfire"
  | "cook_food"
  | "boil_water"
  | "explore"
  | "fell_tree"
  | "quarry_stone"
  | "harvest_crop"
  | "sow_crop"
  | "tend_crop"
  | "collect_water"
  | "draw_water"
  | "drink_water"
  | "propose_public_project"
  | "start_construction"
  | "deliver_material"
  | "work_construction"
  | "cancel_project"
  | "repair_structure"
  | "demolish_structure"
  | "move_home";

export type CoreActionId = TraditionalCoreActionId | PhysicalActionId;

export type EconomicActionId =
  | "propose_market_charter"
  | "support_market_charter"
  | "oppose_market_charter"
  | "register_business"
  | "list_good"
  | "buy_good"
  | "invest_business"
  | "offer_job"
  | "accept_job"
  | "adopt_commitment"
  | "change_occupation"
  | "train_skill"
  | "lease_facility"
  | "transfer_good"
  | "operate_recipe";

export type CivicActionId =
  | "propose_policy"
  | "cast_ballot"
  | "respond_to_vote"
  | "form_faction"
  | "join_faction"
  | "organize_collective_action";

export type SocialActionId = "request_item" | "share_item" | "steal_item" | "barter_item" | "rescue_person" | "offer_project_help" | "invite_project" | "teach_technique" | "warn_resource" | "conceal_resource" | "form_household" | "form_group" | "invite_group" | "adopt_group_system" | "leave_group" | "exclude_member" | "contribute_group_stock" | "promise_item" | "fulfill_promise" | "forgive" | "retaliate" | "claim_resource" | "challenge_claim";

export type ActionId = CoreActionId | EconomicActionId | CivicActionId | SocialActionId;

export type SocietyGoalId = "none" | "market-economy" | "custom";
export type PolicyId =
  | "market-charter"
  | "wealth-tax"
  | "public-food-reserve"
  | "civil-liberties"
  | "community-watch"
  | "conservation-code"
  | "assembly-charter"
  | "settlement-expansion";
export type BallotChoice = "support" | "oppose" | "abstain";
export type VoteReaction = "accept" | "reluctant-compliance" | "protest" | "organize" | "rebel";
export type CollectiveActionKind = "petition" | "protest" | "strike" | "civil-disobedience" | "rebellion";

export type ActionIntent =
  | { kind: TraditionalCoreActionId }
  | { kind: "forage_wild_food"; nodeId: string }
  | { kind: "gather_fiber"; nodeId: string }
  | { kind: "gather_branches"; nodeId: string }
  | { kind: "gather_loose_stone"; nodeId: string }
  | { kind: "craft_hand_axe" | "craft_stone_pick" }
  | { kind: "craft_primitive"; recipeId: PrimitiveRecipeId }
  | { kind: "gather_clay" }
  | { kind: "drink_natural_water" }
  | { kind: "catch_fish" }
  | { kind: "hunt_game" }
  | { kind: "use_medicine" }
  | { kind: "fuel_campfire"; buildingObjectUid: number }
  | { kind: "cook_food"; buildingObjectUid: number; resource: "berries" | "fish" | "meat" }
  | { kind: "boil_water"; buildingObjectUid: number }
  | { kind: "explore" }
  | { kind: "fell_tree"; nodeId: string }
  | { kind: "quarry_stone"; nodeId: string }
  | { kind: "harvest_crop"; nodeId: string }
  | { kind: "sow_crop"; nodeId: string; cropType: CropType }
  | { kind: "tend_crop"; nodeId: string }
  | { kind: "collect_water" }
  | { kind: "draw_water"; buildingObjectUid: number }
  | { kind: "drink_water" }
  | { kind: "propose_public_project"; plan: PublicProjectPlan }
  | { kind: "start_construction"; buildingType: BuildingType; x: number; y: number; owner: AssetOwner; mandateId?: string; route?: Array<{ x: number; y: number }> }
  | { kind: "deliver_material"; projectId: string; resource: string; amount: number; source: "inventory" | "stock" }
  | { kind: "work_construction"; projectId: string }
  | { kind: "cancel_project"; projectId: string }
  | { kind: "repair_structure"; targetKind: "building" | "road"; targetId: string; mandateId?: string }
  | { kind: "demolish_structure"; buildingObjectUid: number; mandateId?: string }
  | { kind: "move_home"; buildingObjectUid: number }
  | { kind: "propose_market_charter" }
  | { kind: "support_market_charter" | "oppose_market_charter"; proposalId: string }
  | { kind: "register_business"; businessKind: string }
  | { kind: "list_good"; ownerType: "citizen" | "business"; ownerId: string; resource: string; amount: number; unitPrice: number }
  | { kind: "buy_good"; offerId: string; amount: number }
  | { kind: "invest_business"; businessId: string; amount: number }
  | { kind: "offer_job"; businessId: string; workerId: number; wage: number }
  | { kind: "accept_job"; contractId: string }
  | { kind: "adopt_commitment"; commitmentKind: CommitmentKind; objective: string; strategy: string; targetId?: string }
  | { kind: "change_occupation"; occupation: string; reason: string }
  | { kind: "train_skill"; skill: SkillId }
  | { kind: "lease_facility"; businessId: string; buildingObjectUid: number; rent: number }
  | { kind: "transfer_good"; resource: string; amount: number; from: InventoryOwner; to: InventoryOwner }
  | { kind: "operate_recipe"; recipeId: string; facilityObjectUid: number; owner: InventoryOwner }
  | { kind: "propose_policy"; policyId: PolicyId }
  | { kind: "cast_ballot"; proposalId: string; choice: BallotChoice }
  | { kind: "respond_to_vote"; proposalId: string; response: VoteReaction }
  | { kind: "form_faction"; proposalId: string; position: "support" | "oppose" }
  | { kind: "join_faction"; factionId: string }
  | { kind: "organize_collective_action"; factionId: string; action: CollectiveActionKind }
  | { kind: "request_item" | "share_item" | "steal_item"; targetCitizenId: number; resource: string; amount: number }
  | { kind: "rescue_person"; targetCitizenId: number }
  | { kind: "barter_item"; targetCitizenId: number; offerResource: string; requestResource: string; amount: number }
  | { kind: "offer_project_help" | "invite_project"; targetCitizenId: number; projectId: string }
  | { kind: "teach_technique"; targetCitizenId: number; technique: string }
  | { kind: "warn_resource"; targetCitizenId: number; nodeId: string }
  | { kind: "conceal_resource"; nodeId: string }
  | { kind: "form_household"; targetCitizenId: number }
  | { kind: "form_group"; targetCitizenId: number }
  | { kind: "invite_group"; groupId: string; targetCitizenId: number }
  | { kind: "adopt_group_system"; groupId: string; system: "consensus" | "majority" | "leader" | "council" }
  | { kind: "leave_group"; groupId: string }
  | { kind: "exclude_member"; groupId: string; targetCitizenId: number }
  | { kind: "contribute_group_stock"; groupId: string; resource: string; amount: number }
  | { kind: "promise_item"; targetCitizenId: number; resource: string; amount: number; dueTick: number }
  | { kind: "fulfill_promise"; promiseId: string; targetCitizenId: number }
  | { kind: "forgive"; targetCitizenId: number }
  | { kind: "retaliate"; targetCitizenId: number }
  | { kind: "claim_resource"; nodeId: string }
  | { kind: "challenge_claim"; nodeId: string; ownerId: number };

export interface GoalMilestone {
  id: string;
  label: string;
  completedAtTick?: number;
}

export interface GoalDimension {
  id: "prosperity" | "equality" | "freedom" | "stability" | "survival" | "sustainability" | "democracy" | "expansion";
  label: string;
  weight: number;
  progress: number;
}

export interface CivilizationGoalState {
  id: SocietyGoalId;
  prompt: string;
  stage: "inactive" | "experiment" | "founding" | "property-rights" | "active-market" | "enterprise" | "capital-formation" | "complete";
  milestones: GoalMilestone[];
  dimensions: GoalDimension[];
}

export interface EconomicPolicyState {
  privateProperty: boolean;
  currency: boolean;
  contracts: boolean;
  taxRate: number;
  publicFoodReserve: boolean;
}

export interface BallotRecord {
  citizenId: number;
  choice: BallotChoice;
  castAtTick: number;
  decisionId: string;
}

export interface CivicProposal {
  id: string;
  policyId: PolicyId;
  kind?: "policy" | "public-project" | "demolition" | "major-repair";
  projectPlan?: PublicProjectPlan;
  sponsorId: number;
  eligibleVoterIds: number[];
  ballots: Record<number, BallotRecord>;
  status: "voting" | "adopted" | "rejected";
  createdAtTick: number;
  resolvedAtTick?: number;
  tally: { support: number; oppose: number; abstain: number };
}

export interface CivicLaw {
  policyId: PolicyId;
  proposalId: string;
  enactedAtTick: number;
  support: number;
  oppose: number;
}

export interface PoliticalCitizenState {
  legitimacy: number;
  grievance: number;
  engagement: number;
  factionId?: string;
  reactions: Record<string, VoteReaction>;
}

export interface FactionState {
  id: string;
  name: string;
  founderId: number;
  proposalId: string;
  position: "support" | "oppose";
  memberIds: number[];
  influence: number;
  radicalization: number;
  createdAtTick: number;
}

export interface CollectiveActionState {
  id: string;
  factionId: string;
  kind: CollectiveActionKind;
  participantIds: number[];
  status: "organizing" | "active" | "resolved";
  startedAtTick: number;
  activatedAtTick?: number;
  resolvedAtTick?: number;
  outcome?: "conceded" | "contained" | "administration-changed" | "dissipated";
}

export interface PoliticsState {
  institutionStage: "none" | "founding" | "formal";
  constitution: {
    system: "direct-majority";
    ballot: "one-person-one-vote";
    threshold: "simple-majority";
    tieRule: "status-quo";
  };
  administration: {
    form: "public-assembly" | "faction-council";
    governingFactionId?: string;
    changedAtTick: number;
  };
  activeProposalId?: string;
  proposals: Record<string, CivicProposal>;
  laws: Partial<Record<PolicyId, CivicLaw>>;
  citizens: Record<number, PoliticalCitizenState>;
  factions: Record<string, FactionState>;
  collectiveActions: Record<string, CollectiveActionState>;
  indicators: {
    turnout: number;
    averageLegitimacy: number;
    unrest: number;
    factionCount: number;
    rebellionActive: boolean;
  };
}

export interface MarketCharterProposal {
  id: string;
  proposerId: number;
  supporterIds: number[];
  opponentIds: number[];
  status: "open" | "adopted" | "rejected";
  createdAtTick: number;
  resolvedAtTick?: number;
}

export interface OwnershipRecord {
  assetId: string;
  assetKind: "productive-license" | "business" | "building";
  ownerId: number;
  acquiredAtTick: number;
}

export interface BusinessState {
  id: string;
  name: string;
  kind: string;
  ownerId: number;
  capital: number;
  inventory: Record<string, number>;
  employeeIds: number[];
  organization: "sole-proprietorship" | "partnership" | "cooperative" | "public-enterprise" | "household";
  facilityObjectUids: number[];
  blockers: string[];
  productionRuns: number;
  createdAtTick: number;
}

export type SkillId = "construction" | "farming" | "baking" | "smithing" | "logging" | "mining" | "fishing" | "hunting" | "foraging" | "healing" | "trading" | "hauling";

export interface SkillState {
  level: number;
  experience: number;
}

export type CommitmentKind = "survival" | "enterprise" | "construction" | "production" | "public-service" | "learning";

export interface CitizenCommitmentState {
  id: string;
  kind: CommitmentKind;
  objective: string;
  strategy: string;
  status: "active" | "blocked" | "completed" | "abandoned";
  createdAtTick: number;
  updatedAtTick: number;
  progress: number;
  targetId?: string;
  blocker?: string;
}

export interface CitizenMindState {
  mode: "idle" | "deliberating" | "executing" | "committed" | "interrupted";
  lastDeliberatedAtTick: number;
  nextReviewAtTick: number;
  reconsiderations: number;
  currentIntention?: {
    decisionId: string;
    label: string;
    startedAtTick: number;
    commitmentStrength: number;
  };
  lastInterruptAtTick?: number;
  interruptReason?: string;
}

export type InventoryOwner =
  | { kind: "stock" }
  | { kind: "citizen"; id: number }
  | { kind: "business"; id: string };

export interface ProductionBatchState {
  id: string;
  recipeId: string;
  citizenId: number;
  businessId?: string;
  facilityObjectUid: number;
  owner: InventoryOwner;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  completedAtTick: number;
}

export interface MarketOffer {
  id: string;
  sellerId: number;
  businessId?: string;
  sourceOwnerType: "citizen" | "business";
  sourceOwnerId: string;
  resource: string;
  amountRemaining: number;
  unitPrice: number;
  status: "open" | "filled" | "cancelled" | "expired";
  createdAtTick: number;
  expiresAtTick: number;
  foodLot?: { producedAtTick: number; expiresAtTick: number; storageBuildingUid?: number };
}

export interface EmploymentContract {
  id: string;
  businessId: string;
  employerId: number;
  workerId: number;
  wage: number;
  escrowedWage: number;
  status: "offered" | "active" | "completed" | "cancelled";
  createdAtTick: number;
  expiresAtTick: number;
  acceptedAtTick?: number;
}

export interface EconomicTransaction {
  id: string;
  tick: number;
  kind: "trade" | "investment" | "wage" | "founding-allocation";
  fromId: string;
  toId: string;
  money: number;
  resource?: string;
  amount?: number;
  offerId?: string;
  contractId?: string;
}

export interface EconomicIndicators {
  tradeVolume: number;
  medianWealth: number;
  wealthConcentration: number;
  employedCitizens: number;
  activeBusinesses: number;
  activeOffers: number;
  charterSupport: number;
  citizensWithSevereNeeds: number;
}

export interface EconomyState {
  currency: { id: "shell"; label: "Shells" };
  wallets: Record<number, number>;
  treasury: number;
  moneySupply: number;
  policies: EconomicPolicyState;
  charter?: MarketCharterProposal;
  ownership: OwnershipRecord[];
  businesses: Record<string, BusinessState>;
  offers: Record<string, MarketOffer>;
  contracts: Record<string, EmploymentContract>;
  transactions: EconomicTransaction[];
  production: ProductionBatchState[];
  priceHistory: Record<string, Array<{ tick: number; unitPrice: number }>>;
  indicators: EconomicIndicators;
}

export type ProviderKind = "mock" | "test-delayed" | "local-brain";

export interface ProviderDescriptor {
  kind: ProviderKind;
  id: string;
  label: string;
  version: string;
}

export interface DecisionFreshness {
  requestedAtTick: number;
  deadlineTick: number;
  worldRevision: number;
  npcRevision: number;
  topologyRevision: number;
  perceptionHash: string;
  legalSetHash: string;
}

export interface CitizenSeed {
  id: number;
  name: string;
  job: string;
  traits?: string[];
  goal?: string;
  inventory?: Record<string, number>;
  position?: { x: number; y: number };
  initialNeeds?: Partial<Record<NeedId | "thirst", number>>;
  settlementId?: string;
  relationshipPreset?: "strained" | "neutral" | "friendly";
  initialRelationships?: Record<number, number>;
  homeObjectUid?: number;
  personality?: PersonalityProfile;
}

export interface PersonalityProfile {
  empathy: number;
  sociability: number;
  industriousness: number;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  emotionalSensitivity: number;
  riskTolerance: number;
  patience: number;
  generosity: number;
  dominance: number;
  curiosity: number;
  conformity: number;
  aggression: number;
  acquisitiveness: number;
  independence: number;
}

export interface PhysicalProfile {
  strength: number;
  endurance: number;
  health: number;
  injury: number;
  exposure: number;
  age: number;
  movementAbility: number;
  temperatureTolerance: number;
  illness: number;
  alive: boolean;
  incapacitatedSinceTick?: number;
  lastRescuedAtTick?: number;
}

export interface EmotionalState {
  fear: number;
  anger: number;
  hope: number;
  contentment: number;
  stress: number;
  gratitude: number;
  resentment: number;
  confidence: number;
  safety: number;
}

export interface ValueProfile {
  autonomy: number;
  security: number;
  community: number;
  fairness: number;
  status: number;
  tradition: number;
  equality: number;
  wealth: number;
  exploration: number;
  family: number;
  nature: number;
}

export interface SocialRelationshipState {
  trust: number;
  affection: number;
  fear: number;
  respect: number;
  debt: number;
  grievance: number;
}

export interface SocialGroupState {
  id: string;
  name: string;
  founderId: number;
  memberIds: number[];
  sharedInventory: Record<string, number>;
  norms: string[];
  decisionSystem: "informal" | "consensus" | "majority" | "leader" | "council";
  leaderId?: number;
  createdAtTick: number;
}

export interface SocialPromiseState {
  id: string;
  fromCitizenId: number;
  toCitizenId: number;
  resource: string;
  amount: number;
  promisedAtTick: number;
  dueTick: number;
  status: "open" | "fulfilled" | "broken" | "forgiven";
  resolvedAtTick?: number;
}

export interface LocalKnowledgeState {
  discoveredTiles: string[];
  knownResources: string[];
  knownPeople: number[];
  learnedTechniques: string[];
}

export interface CitizenState extends CitizenSeed {
  revision: number;
  position: { x: number; y: number };
  facing: "up" | "down" | "left" | "right";
  traits: string[];
  goal: string;
  needs: Record<NeedId, number> & { thirst?: number };
  happiness: number;
  inventory: Record<string, number>;
  toolDurability?: Record<string, number>;
  relationships: Record<number, number>;
  memories: MemoryRecord[];
  currentActivity: string;
  skills: Record<string, SkillState>;
  commitment?: CitizenCommitmentState;
  mind?: CitizenMindState;
  personality?: PersonalityProfile;
  physical?: PhysicalProfile;
  emotions?: EmotionalState;
  values?: ValueProfile;
  socialRelationships?: Record<number, SocialRelationshipState>;
  knowledge?: LocalKnowledgeState;
  householdId?: string;
  groupIds?: string[];
  lastDecisionId?: string;
  currentActionId?: string;
}

export type BuildingType = "campfire" | "shelter" | "storage-pile" | "drying-rack" | "garden-plot" | "cottage" | "storehouse" | "lumbermill" | "stall" | "farm" | "hall" | "well" | "road" | "bakery" | "smithy" | "workshop" | "fishery";
export type CropType = "wheat" | "cabbage" | "pumpkin";
export type PrimitiveRecipeId = "sharp-stone" | "fire-starter" | "basket" | "water-container" | "spear" | "fishing-tool" | "simple-clothing" | "basic-medicine";

export type AssetOwner =
  | { kind: "public"; id: "settlement" }
  | { kind: "citizen"; id: number }
  | { kind: "business"; id: string };

export interface ResourceNodeState {
  id: string;
  objectUid: number;
  assetId: string;
  kind: "tree" | "stone" | "crop" | "wild-food" | "fiber";
  position: { x: number; y: number };
  yield: Record<string, number>;
  status: "available" | "depleted";
  depletedAtTick?: number;
  regrowAtTick?: number;
  cropType?: CropType;
  cropStage?: "fallow" | "sown" | "growing" | "ripe" | "withered";
  plantedAtTick?: number;
  growth?: number;
  moisture?: number;
  health?: number;
  lastTendedAtTick?: number;
}

export interface RenewableResourceState {
  id: string;
  resource: string;
  amount: number;
  capacity: number;
  regenerationPerTick: number;
  lastHarvestedAtTick?: number;
}

export interface PublicProjectPlan {
  operation: "build" | "road" | "repair" | "demolish";
  buildingType?: BuildingType;
  position?: { x: number; y: number };
  route?: Array<{ x: number; y: number }>;
  targetKind?: "building" | "road";
  targetId?: string;
  budget: number;
  required: Record<string, number>;
  laborRequired: number;
  label: string;
}

export interface ProjectMandateState {
  id: string;
  proposalId: string;
  plan: PublicProjectPlan;
  status: "authorized" | "claimed" | "fulfilled" | "expired";
  authorizedAtTick: number;
  expiresAtTick: number;
  projectId?: string;
}

export interface ProjectEscrowState {
  id: string;
  projectId: string;
  payer: AssetOwner;
  deposited: number;
  balance: number;
  spent: number;
  refunded: number;
  status: "held" | "settled" | "refunded";
  payouts: Array<{ citizenId: number; amount: number; tick: number; reason: "labor" }>;
}

export interface FoodLotState {
  id: string;
  resource: "berries" | "wheat" | "fish" | "meat" | "cooked_meal" | "bread" | "cabbage" | "pumpkin";
  amount: number;
  owner: { kind: "stock" } | { kind: "citizen"; id: number } | { kind: "business"; id: string };
  producedAtTick: number;
  expiresAtTick: number;
  storageBuildingUid?: number;
}

export interface RoadSegmentState {
  id: string;
  projectId: string;
  position: { x: number; y: number };
  condition: number;
  completedAtTick: number;
  lastRepairedAtTick?: number;
}

export interface DemolitionRecordState {
  id: string;
  buildingObjectUid: number;
  buildingType: BuildingType;
  position: { x: number; y: number };
  owner: AssetOwner;
  conditionAtDemolition: number;
  demolishedAtTick: number;
  salvaged: Record<string, number>;
  mandateId?: string;
}

export interface ConstructionProjectState {
  id: string;
  objectUid: number;
  buildingType: BuildingType;
  position: { x: number; y: number };
  workPosition: { x: number; y: number };
  footprint: { width: number; height: number };
  owner: AssetOwner;
  requestedByCitizenId: number;
  status: "materials" | "building" | "complete" | "cancelled";
  required: Record<string, number>;
  delivered: Record<string, number>;
  laborRequired: number;
  laborCompleted: number;
  residentIds: number[];
  capacity: number;
  createdAtTick: number;
  completedAtTick?: number;
  mandateId?: string;
  escrowId?: string;
  roadRoute?: Array<{ x: number; y: number }>;
  cancelledAtTick?: number;
  cancellationReason?: string;
  demolishedAtTick?: number;
}

export interface BuildingState {
  objectUid: number;
  buildingType: BuildingType;
  position: { x: number; y: number };
  owner: AssetOwner;
  capacity: number;
  residentIds: number[];
  condition: number;
  completedAtTick: number;
  operatorBusinessId?: string;
  damagedAtTick?: number;
  lastRepairedAtTick?: number;
  fuel?: number;
}

export interface PhysicalWorldState {
  enabled: boolean;
  nextObjectUid: number;
  resources: Record<string, ResourceNodeState>;
  renewableStocks: Record<string, RenewableResourceState>;
  projects: Record<string, ConstructionProjectState>;
  buildings: Record<string, BuildingState>;
  roads: Record<string, RoadSegmentState>;
  mandates: Record<string, ProjectMandateState>;
  escrows: Record<string, ProjectEscrowState>;
  foodLots: Record<string, FoodLotState>;
  demolitions: Record<string, DemolitionRecordState>;
  waste: number;
  claims: Record<string, { nodeId: string; ownerId: number; strength: number; createdAtTick: number; challengedByIds: number[] }>;
}

export interface ResourceClaim {
  kind?: "resource" | "stock" | "wallet" | "treasury" | "inventory" | "offer" | "business-capital";
  resourceId: string;
  amount: number;
}

export interface ActionInstance {
  id: string;
  decisionId: string;
  citizenId: number;
  actionId: ActionId;
  intent?: ActionIntent;
  phase: "moving" | "performing";
  startedAtTick: number;
  target: { x: number; y: number };
  targetMode: "self" | "static" | "citizen";
  interactionRadius: number;
  route: Array<{ x: number; y: number }>;
  routeIndex: number;
  repathCount: number;
  unreachableTicks: number;
  workTicksRemaining: number;
  workTicksTotal: number;
  interruptible: boolean;
  minimumCommitmentUntilTick: number;
  nextReviewAtTick: number;
  resourceClaims: ResourceClaim[];
  targetCitizenId?: number;
}

export interface ReservationRecord {
  id: string;
  actionInstanceId: string;
  citizenId: number;
  kind: "location" | "stock" | "wallet" | "treasury" | "inventory" | "offer" | "business-capital" | "resource";
  key: string;
  amount: number;
  createdAtTick: number;
  expiresAtTick: number;
}

export interface MemoryRecord {
  id: string;
  tick: number;
  text: string;
  tone: "positive" | "neutral" | "negative";
  salience?: number;
  subjectCitizenId?: number;
  expiresAtTick?: number;
}

export interface ActionCandidate {
  id: string;
  label: string;
  legal: boolean;
  blockedBy?: string;
  score: number | null;
  trace: Array<{ rule: string; contribution: number }>;
  intent?: ActionIntent;
}

export interface CandidateEvaluation {
  candidateId: string;
  score?: number;
  probability?: number;
  trace?: Array<{ rule: string; contribution: number }>;
}

export type ProviderSignals =
  | { kind: "heuristic"; evaluations: CandidateEvaluation[] }
  | { kind: "external"; evaluations: CandidateEvaluation[]; confidence?: number; responseModel?: string; inputTokens?: number; costUsd?: number; entropy?: number; checkpointVersion?: string };

export interface DecisionRequest {
  requestId: string;
  policyVersion: string;
  freshness: DecisionFreshness;
  perception: CharacterPerception;
  candidates: readonly ActionCandidate[];
}

export interface CharacterPerception {
  tick: number;
  stateVersion: number;
  citizen: Pick<CitizenState, "id" | "revision" | "name" | "job" | "traits" | "goal" | "needs" | "happiness" | "inventory" | "toolDurability" | "position" | "relationships" | "memories" | "currentActivity" | "skills" | "commitment" | "mind" | "personality" | "physical" | "emotions" | "values" | "socialRelationships" | "knowledge">;
  population: number;
  visibleCitizens: Array<Pick<CitizenState, "id" | "position">>;
  visibleToPlayer?: boolean;
  stock: Readonly<Record<string, number>>;
  constructionProgress: number;
  civilizationGoal?: CivilizationGoalState;
  politics?: {
    activeProposal?: Pick<CivicProposal, "id" | "policyId" | "status" | "tally" | "eligibleVoterIds">;
    laws: PolicyId[];
    legitimacy: number;
    grievance: number;
    factionId?: string;
    reactionsPending: boolean;
  };
  economy?: {
    wallet: number;
    treasury: number;
    policies: EconomicPolicyState;
    ownedBusinessIds: string[];
    activeOfferCount: number;
    offeredContractCount: number;
    productionRuns: number;
    facilityObjectUids: number[];
    blockers: string[];
  };
  physicalWorld?: {
    availableTrees: number;
    availableStone: number;
    harvestableCrops: number;
    activeProjects: Array<Pick<ConstructionProjectState, "id" | "buildingType" | "status" | "required" | "delivered" | "laborRequired" | "laborCompleted">>;
    carriedMaterials: Record<string, number>;
    homeObjectUid?: number;
    homelessCitizens: number;
    nearbyFireFuel: number;
    /** Citizen-known nodes only. The learning encoder never receives the global resource map. */
    knownResources?: Array<Pick<ResourceNodeState, "id" | "kind" | "position" | "yield" | "status" | "growth" | "health">>;
  };
}

export interface ProviderDecision {
  requestId: string;
  selectedCandidateId: string;
  provider: ProviderDescriptor;
  signals?: ProviderSignals;
}

export type DecisionRequestStatus = "queued" | "in-flight" | "accepted" | "discarded" | "timed-out" | "cancelled" | "fallback";

export interface DecisionRequestLog {
  requestId: string;
  citizenId: number;
  requestedAtTick: number;
  deadlineTick: number;
  status: DecisionRequestStatus;
  providerId: string;
  reason?: string;
}

export interface DecisionRecord {
  id: string;
  tick: number;
  stateVersion: number;
  citizenId: number;
  citizenName: string;
  provider: ProviderDescriptor;
  policyVersion: string;
  freshness: DecisionFreshness;
  resolution: "accepted" | "fallback";
  resolutionReason?: string;
  providerSignals?: ProviderSignals;
  latencyMs?: number;
  context: {
    job: string;
    traits: string[];
    needs: Record<NeedId, number> & { thirst?: number };
    worldStock: Record<string, number>;
    societyGoalId?: SocietyGoalId;
    goalStage?: CivilizationGoalState["stage"];
    wallet?: number;
    economicPolicies?: EconomicPolicyState;
    activeProposalId?: string;
    politicalLegitimacy?: number;
    politicalGrievance?: number;
  };
  candidates: ActionCandidate[];
  selected: ActionId;
  selectedCandidateId?: string;
  selectedIntent?: ActionIntent;
  selectedLabel: string;
  consequences: string[];
  resourceDelta: Record<string, number>;
  activity: string;
  targetCitizenId?: number;
  target?: { x: number; y: number };
  targetMode?: "self" | "static" | "citizen";
  interactionRadius?: number;
  route: Array<{ x: number; y: number }>;
  actionInstanceId: string;
  actionStatus: "in-progress" | "completed" | "cancelled";
  completedAtTick?: number;
}

export interface SimulationEvent {
  id: string;
  tick: number;
  day: number;
  category: "work" | "need" | "social" | "construction" | "economic" | "civic" | "world";
  title: string;
  detail: string;
  citizenIds: number[];
  decisionId?: string;
}

export interface TrendPoint {
  tick: number;
  food: number;
  materials: number;
  happiness: number;
  stability: number;
}

export interface SimulationCheckpoint {
  tick: number;
  digest: string;
  state: {
    stateVersion: number;
    worldRevision: number;
    topology: SimulationSnapshot["topology"];
    cursor: number;
    citizens: Record<number, CitizenState>;
    stock: Record<string, number>;
    constructionProgress: number;
    civilizationGoal: CivilizationGoalState;
    economy: EconomyState;
    politics: PoliticsState;
    physicalWorld: PhysicalWorldState;
    socialGroups: Record<string, SocialGroupState>;
    socialPromises: Record<string, SocialPromiseState>;
    activeActions: Record<string, ActionInstance>;
    reservations: Record<string, ReservationRecord>;
  };
}

export interface SimulationSnapshot {
  schemaVersion: 6;
  seed: number;
  tick: number;
  stateVersion: number;
  worldRevision: number;
  topology: {
    width: number;
    height: number;
    topologyRevision: number;
    walkable: number[];
    moveCost: number[];
    locations: Record<string, Array<{ x: number; y: number }>>;
    environment?: {
      seed: number;
      harshness: "gentle" | "balanced" | "harsh";
      spawn: { x: number; y: number };
      biomes: string[];
      elevation: number[];
      moisture: number[];
      fertility: number[];
      hazard: number[];
    };
  };
  activeActions: Record<string, ActionInstance>;
  reservations: Record<string, ReservationRecord>;
  checkpoints: SimulationCheckpoint[];
  requests: DecisionRequestLog[];
  cursor: number;
  citizens: Record<number, CitizenState>;
  stock: Record<string, number>;
  decisions: DecisionRecord[];
  events: SimulationEvent[];
  trends: TrendPoint[];
  constructionProgress: number;
  civilizationGoal: CivilizationGoalState;
  economy: EconomyState;
  politics: PoliticsState;
  physicalWorld: PhysicalWorldState;
  socialGroups: Record<string, SocialGroupState>;
  socialPromises: Record<string, SocialPromiseState>;
}

export interface DecisionContext {
  tick: number;
  stateVersion: number;
  citizen: CitizenState;
  citizens: CitizenState[];
  stock: Record<string, number>;
  constructionProgress: number;
  civilizationGoal?: CivilizationGoalState;
  economy?: EconomyState;
  politics?: PoliticsState;
  physicalWorld?: PhysicalWorldState;
  socialGroups?: Record<string, SocialGroupState>;
  socialPromises?: Record<string, SocialPromiseState>;
  waterSources?: Array<{ x: number; y: number }>;
  buildSites?: Array<{ buildingType: BuildingType; x: number; y: number }>;
  roadPlans?: Array<Array<{ x: number; y: number }>>;
}

export interface DecisionProvider {
  readonly descriptor: ProviderDescriptor;
  decide(request: DecisionRequest, signal: AbortSignal): Promise<ProviderDecision>;
}

export interface SimulationStepResult {
  snapshot: SimulationSnapshot;
  decision?: DecisionRecord;
  decisions?: DecisionRecord[];
  events: SimulationEvent[];
}
