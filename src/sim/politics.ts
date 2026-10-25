import type {
  ActionCandidate,
  ActionIntent,
  BallotChoice,
  CitizenState,
  CivilizationGoalState,
  CollectiveActionKind,
  DecisionContext,
  EconomyState,
  FactionState,
  MarketCharterProposal,
  PolicyId,
  PoliticalCitizenState,
  PoliticsState,
  SimulationEvent,
  VoteReaction,
} from "./types.js";
import { legacyDurationTicks } from "./time.js";

export interface PolicyDefinition {
  id: PolicyId;
  label: string;
  description: string;
  category: "founding" | "economy" | "welfare" | "governance";
  dimensions: Array<CivilizationGoalState["dimensions"][number]["id"]>;
}

export const POLICY_DEFINITIONS: Record<PolicyId, PolicyDefinition> = {
  "market-charter": {
    id: "market-charter",
    label: "Market charter",
    description: "Recognize private property, shared currency, and enforceable contracts.",
    category: "founding",
    dimensions: ["prosperity", "freedom"],
  },
  "wealth-tax": {
    id: "wealth-tax",
    label: "Common treasury contribution",
    description: "Collect ten percent of private shell balances for the settlement treasury.",
    category: "economy",
    dimensions: ["equality", "stability"],
  },
  "public-food-reserve": {
    id: "public-food-reserve",
    label: "Public food reserve",
    description: "Ask every household with food to place one unit into the common stores.",
    category: "welfare",
    dimensions: ["survival", "equality", "stability"],
  },
  "civil-liberties": {
    id: "civil-liberties",
    label: "Civil liberties compact",
    description: "Protect speech, peaceful assembly, belief, and personal movement from collective interference.",
    category: "governance",
    dimensions: ["freedom", "democracy"],
  },
  "community-watch": {
    id: "community-watch",
    label: "Community watch",
    description: "Create a rotating civilian watch accountable to the public assembly.",
    category: "governance",
    dimensions: ["stability", "survival"],
  },
  "conservation-code": {
    id: "conservation-code",
    label: "Conservation code",
    description: "Limit destructive extraction and preserve renewable land.",
    category: "governance",
    dimensions: ["sustainability", "survival"],
  },
  "assembly-charter": {
    id: "assembly-charter",
    label: "Assembly charter",
    description: "Guarantee one public ballot per villager on every settlement-wide law.",
    category: "governance",
    dimensions: ["democracy", "freedom"],
  },
  "settlement-expansion": {
    id: "settlement-expansion",
    label: "Settlement expansion mandate",
    description: "Authorize new districts and direct shared labor toward expansion.",
    category: "governance",
    dimensions: ["expansion", "prosperity"],
  },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function politicalCitizen(seed = 0): PoliticalCitizenState {
  const offset = ((Math.abs(seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.16;
  return {
    legitimacy: clamp01(0.58 + offset),
    grievance: clamp01(0.12 - offset / 2),
    engagement: clamp01(0.52 + offset),
    reactions: {},
  };
}

export function createPoliticsState(citizenIds: number[] = [], institutionStage: PoliticsState["institutionStage"] = "formal"): PoliticsState {
  return {
    institutionStage,
    constitution: {
      system: "direct-majority",
      ballot: "one-person-one-vote",
      threshold: "simple-majority",
      tieRule: "status-quo",
    },
    administration: { form: "public-assembly", changedAtTick: 0 },
    proposals: {},
    laws: {},
    citizens: Object.fromEntries(citizenIds.map((id) => [id, politicalCitizen(id)])),
    factions: {},
    collectiveActions: {},
    indicators: { turnout: 0, averageLegitimacy: 0.58, unrest: 0.12, factionCount: 0, rebellionActive: false },
  };
}

export function politicsFromLegacy(charter: MarketCharterProposal | undefined, citizenIds: number[]): PoliticsState {
  const state = createPoliticsState(citizenIds);
  if (!charter) return state;
  const ballots = Object.fromEntries([
    ...charter.supporterIds.map((citizenId) => [citizenId, { citizenId, choice: "support" as const, castAtTick: charter.resolvedAtTick ?? charter.createdAtTick, decisionId: `legacy-ballot-${charter.id}-${citizenId}` }]),
    ...charter.opponentIds.map((citizenId) => [citizenId, { citizenId, choice: "oppose" as const, castAtTick: charter.resolvedAtTick ?? charter.createdAtTick, decisionId: `legacy-ballot-${charter.id}-${citizenId}` }]),
  ]);
  state.proposals[charter.id] = {
    id: charter.id,
    policyId: "market-charter",
    sponsorId: charter.proposerId,
    eligibleVoterIds: [...citizenIds],
    ballots,
    status: charter.status === "open" ? "voting" : charter.status,
    createdAtTick: charter.createdAtTick,
    resolvedAtTick: charter.resolvedAtTick,
    tally: { support: charter.supporterIds.length, oppose: charter.opponentIds.length, abstain: 0 },
  };
  if (charter.status === "open") state.activeProposalId = charter.id;
  if (charter.status === "adopted") {
    state.laws["market-charter"] = {
      policyId: "market-charter",
      proposalId: charter.id,
      enactedAtTick: charter.resolvedAtTick ?? charter.createdAtTick,
      support: charter.supporterIds.length,
      oppose: charter.opponentIds.length,
    };
  }
  refreshPoliticalIndicators(state);
  return state;
}

export function syncPoliticalCitizens(politics: PoliticsState, citizens: CitizenState[]) {
  const live = new Set(citizens.map((citizen) => citizen.id));
  for (const citizen of citizens) politics.citizens[citizen.id] ??= politicalCitizen(citizen.id);
  for (const id of Object.keys(politics.citizens).map(Number)) if (!live.has(id)) delete politics.citizens[id];
  for (const proposal of Object.values(politics.proposals)) {
    if (proposal.status === "voting") proposal.eligibleVoterIds = proposal.eligibleVoterIds.filter((id) => live.has(id));
    for (const id of Object.keys(proposal.ballots).map(Number)) if (!live.has(id)) delete proposal.ballots[id];
    proposal.tally = tally(proposal.ballots);
  }
  for (const faction of Object.values(politics.factions)) faction.memberIds = faction.memberIds.filter((id) => live.has(id));
  const active = activeProposal(politics);
  if (active && active.status !== "voting" && active.eligibleVoterIds.every((id) => Boolean(politics.citizens[id]?.reactions[active.id]))) politics.activeProposalId = undefined;
  refreshPoliticalIndicators(politics);
}

function candidate(id: string, label: string, intent: ActionIntent): ActionCandidate {
  return { id, label, intent, legal: true, score: null, trace: [] };
}

function activeProposal(politics: PoliticsState | undefined) {
  return politics?.activeProposalId ? politics.proposals[politics.activeProposalId] : undefined;
}

export function proposalLabel(proposal: PoliticsState["proposals"][string]) {
  return proposal.projectPlan?.label ?? POLICY_DEFINITIONS[proposal.policyId].label;
}

function latestProposalFor(policyId: PolicyId, politics: PoliticsState) {
  return Object.values(politics.proposals)
    .filter((proposal) => proposal.policyId === policyId && !proposal.projectPlan)
    .sort((left, right) => right.createdAtTick - left.createdAtTick)[0];
}

function nextPolicy(context: DecisionContext): PolicyId | undefined {
  const { politics, economy, civilizationGoal, tick } = context;
  if (!politics || politics.institutionStage !== "formal") return undefined;
  const available = (policyId: PolicyId) => {
    if (politics.laws[policyId]) return false;
    const previous = latestProposalFor(policyId, politics);
    return !previous || previous.status === "rejected" && tick - (previous.resolvedAtTick ?? previous.createdAtTick) >= legacyDurationTicks(12);
  };
  const exchangePressure = context.citizens.filter((person) => Object.values(person.socialRelationships ?? {}).some((relationship) => relationship.debt >= 1)).length >= 2
    || Object.keys(context.physicalWorld?.claims ?? {}).length >= 2;
  if (available("market-charter") && (exchangePressure || civilizationGoal?.id === "market-economy" || /market|capital|trade|business|prosper/i.test(civilizationGoal?.prompt ?? ""))) return "market-charter";
  if (economy && available("public-food-reserve") && economy.indicators.citizensWithSevereNeeds > 0) return "public-food-reserve";
  if (economy && available("wealth-tax") && economy.indicators.wealthConcentration >= 0.38) return "wealth-tax";
  const dimensions = [...(civilizationGoal?.dimensions ?? [])].sort((left, right) => right.weight * (1 - right.progress) - left.weight * (1 - left.progress));
  for (const dimension of dimensions) {
    const policy = Object.values(POLICY_DEFINITIONS).find((definition) => definition.dimensions.includes(dimension.id) && available(definition.id));
    if (policy) return policy.id;
  }
  return undefined;
}

export function buildPoliticalCandidates(context: DecisionContext): ActionCandidate[] {
  const { politics, citizen } = context;
  if (!politics) return [];
  const civic = politics.citizens[citizen.id] ?? politicalCitizen(citizen.id);
  const proposal = activeProposal(politics);
  if (politics.institutionStage === "none" && !proposal) {
    const socialBasis = context.citizens.length >= 3 && (Boolean(citizen.householdId)
      || Boolean(citizen.groupIds?.some((groupId) => (context.socialGroups?.[groupId]?.memberIds.length ?? 0) >= 3))
      || Object.values(citizen.socialRelationships ?? {}).filter((relationship) => relationship.trust >= 0.62 && relationship.affection >= 0.52).length >= 2);
    return socialBasis ? [candidate(`propose-assembly-charter-${citizen.id}`, "Suggest a shared assembly and majority voting", { kind: "propose_policy", policyId: "assembly-charter" })] : [];
  }
  if (proposal?.status === "voting" && proposal.eligibleVoterIds.includes(citizen.id) && !proposal.ballots[citizen.id]) {
    const label = proposalLabel(proposal);
    return [
      candidate(`ballot-support-${proposal.id}-${citizen.id}`, `Vote for ${label}`, { kind: "cast_ballot", proposalId: proposal.id, choice: "support" }),
      candidate(`ballot-oppose-${proposal.id}-${citizen.id}`, `Vote against ${label}`, { kind: "cast_ballot", proposalId: proposal.id, choice: "oppose" }),
      candidate(`ballot-abstain-${proposal.id}-${citizen.id}`, `Abstain from the ${label} vote`, { kind: "cast_ballot", proposalId: proposal.id, choice: "abstain" }),
    ];
  }
  if (proposal && proposal.status !== "voting" && proposal.eligibleVoterIds.includes(citizen.id) && !civic.reactions[proposal.id]) {
    const ballot = proposal.ballots[citizen.id]?.choice ?? "abstain";
    const won = proposal.status === "adopted" ? ballot === "support" : ballot === "oppose";
    const results = [
      candidate(`reaction-accept-${proposal.id}-${citizen.id}`, "Accept the public result", { kind: "respond_to_vote", proposalId: proposal.id, response: "accept" }),
      candidate(`reaction-reluctant-${proposal.id}-${citizen.id}`, "Comply despite reservations", { kind: "respond_to_vote", proposalId: proposal.id, response: "reluctant-compliance" }),
    ];
    if (!won) {
      results.push(
        candidate(`reaction-protest-${proposal.id}-${citizen.id}`, "Publicly protest the result", { kind: "respond_to_vote", proposalId: proposal.id, response: "protest" }),
        candidate(`reaction-organize-${proposal.id}-${citizen.id}`, "Organize an opposition faction", { kind: "respond_to_vote", proposalId: proposal.id, response: "organize" }),
      );
      if (civic.grievance >= 0.35 || citizen.traits.includes("Bold")) {
        results.push(candidate(`reaction-rebel-${proposal.id}-${citizen.id}`, "Call for open rebellion", { kind: "respond_to_vote", proposalId: proposal.id, response: "rebel" }));
      }
    }
    return results;
  }

  const results: ActionCandidate[] = [];
  if (!proposal) {
    const policyId = nextPolicy(context);
    if (policyId) results.push(candidate(`propose-${policyId}-${citizen.id}`, `Propose ${POLICY_DEFINITIONS[policyId].label.toLowerCase()}`, { kind: "propose_policy", policyId }));
  }
  const faction = civic.factionId ? politics.factions[civic.factionId] : undefined;
  const hasActiveCollectiveAction = faction && Object.values(politics.collectiveActions).some((action) => action.factionId === faction.id && action.status !== "resolved");
  if (faction && !hasActiveCollectiveAction && faction.memberIds.includes(citizen.id)) {
    const actions: CollectiveActionKind[] = ["petition", "protest", "strike"];
    if (faction.radicalization >= 0.55 || civic.grievance >= 0.7) actions.push("civil-disobedience", "rebellion");
    for (const action of actions) results.push(candidate(`collective-${action}-${faction.id}`, `Organize ${action.replaceAll("-", " ")}`, { kind: "organize_collective_action", factionId: faction.id, action }));
  }
  return results;
}

export function politicalIntentBlockReason(intent: ActionIntent, context: DecisionContext): string | null {
  const politics = context.politics;
  if (!politics) return intent.kind === "propose_policy" || intent.kind === "cast_ballot" || intent.kind === "respond_to_vote" || intent.kind === "form_faction" || intent.kind === "join_faction" || intent.kind === "organize_collective_action"
    ? "This world has no political state."
    : null;
  switch (intent.kind) {
    case "propose_policy":
      if (politics.activeProposalId) return "Another public proposal is already active.";
      if (politics.institutionStage === "none" && intent.policyId !== "assembly-charter") return "No shared decision institution exists yet.";
      if (politics.institutionStage === "founding") return "The founding decision is still unresolved.";
      if (politics.laws[intent.policyId]) return "That policy is already law.";
      return null;
    case "cast_ballot": {
      const proposal = politics.proposals[intent.proposalId];
      if (!proposal || proposal.status !== "voting") return "That vote is no longer open.";
      if (!proposal.eligibleVoterIds.includes(context.citizen.id)) return "This citizen is not eligible to vote on the proposal.";
      return proposal.ballots[context.citizen.id] ? "This citizen has already voted." : null;
    }
    case "respond_to_vote": {
      const proposal = politics.proposals[intent.proposalId];
      if (!proposal || proposal.status === "voting") return "That vote has not produced a result.";
      if (!proposal.eligibleVoterIds.includes(context.citizen.id)) return "This citizen was not part of that vote.";
      return politics.citizens[context.citizen.id]?.reactions[proposal.id] ? "This citizen has already responded to the result." : null;
    }
    case "form_faction": {
      const proposal = politics.proposals[intent.proposalId];
      if (!proposal || proposal.status === "voting") return "A faction needs a completed public vote.";
      if (!proposal.eligibleVoterIds.includes(context.citizen.id)) return "This citizen was not part of that vote.";
      return politics.citizens[context.citizen.id]?.factionId ? "This citizen already belongs to a faction." : null;
    }
    case "join_faction":
      return !politics.factions[intent.factionId] ? "That faction no longer exists." : politics.citizens[context.citizen.id]?.factionId ? "This citizen already belongs to a faction." : null;
    case "organize_collective_action": {
      const faction = politics.factions[intent.factionId];
      if (!faction || !faction.memberIds.includes(context.citizen.id)) return "This citizen cannot act for that faction.";
      return Object.values(politics.collectiveActions).some((action) => action.factionId === faction.id && action.status !== "resolved") ? "That faction already has an active collective action." : null;
    }
    default:
      return null;
  }
}

function tally(ballots: Record<number, { choice: BallotChoice }>) {
  const result = { support: 0, oppose: 0, abstain: 0 };
  for (const ballot of Object.values(ballots)) result[ballot.choice] += 1;
  return result;
}

function syncLegacyCharter(proposal: PoliticsState["proposals"][string], economy: EconomyState) {
  if (proposal.policyId !== "market-charter" || proposal.projectPlan) return;
  economy.charter = {
    id: proposal.id,
    proposerId: proposal.sponsorId,
    supporterIds: Object.values(proposal.ballots).filter((ballot) => ballot.choice === "support").map((ballot) => ballot.citizenId),
    opponentIds: Object.values(proposal.ballots).filter((ballot) => ballot.choice === "oppose").map((ballot) => ballot.citizenId),
    status: proposal.status === "voting" ? "open" : proposal.status,
    createdAtTick: proposal.createdAtTick,
    resolvedAtTick: proposal.resolvedAtTick,
  };
}

type PolicyEnactmentContext = Pick<PoliticalExecutionContext, "citizens" | "economy" | "stock" | "tick" | "politics">;

function enactPolicy(policyId: PolicyId, context: PolicyEnactmentContext) {
  const { citizens, economy, stock, tick } = context;
  const resourceDelta: Record<string, number> = {};
  if (policyId === "market-charter") {
    economy.policies.privateProperty = true;
    economy.policies.currency = true;
    economy.policies.contracts = true;
    if (economy.moneySupply === 0) {
      for (const citizen of citizens) {
        economy.wallets[citizen.id] = (economy.wallets[citizen.id] ?? 0) + 20;
        economy.transactions.unshift({ id: `transaction-founding-${tick}-${citizen.id}`, tick, kind: "founding-allocation", fromId: "settlement:mint", toId: `citizen:${citizen.id}`, money: 20 });
      }
      economy.moneySupply += citizens.length * 20;
    }
  }
  if (policyId === "wealth-tax") {
    economy.policies.taxRate = 0.1;
    for (const citizen of citizens) {
      const contribution = Math.floor((economy.wallets[citizen.id] ?? 0) * economy.policies.taxRate);
      economy.wallets[citizen.id] = (economy.wallets[citizen.id] ?? 0) - contribution;
      economy.treasury += contribution;
    }
  }
  if (policyId === "public-food-reserve") {
    economy.policies.publicFoodReserve = true;
    for (const citizen of citizens) {
      const food = ["bread", "fish", "wheat"].find((resource) => (citizen.inventory[resource] ?? 0) > 0);
      if (!food) continue;
      citizen.inventory[food] -= 1;
      stock[food] = (stock[food] ?? 0) + 1;
      resourceDelta[food] = (resourceDelta[food] ?? 0) + 1;
    }
  }
  if (policyId === "civil-liberties") {
    for (const state of Object.values(context.politics.citizens)) state.legitimacy = clamp01(state.legitimacy + 0.04);
  }
  if (policyId === "community-watch") {
    for (const state of Object.values(context.politics.citizens)) state.grievance = clamp01(state.grievance - 0.04);
  }
  if (policyId === "assembly-charter") {
    context.politics.institutionStage = "formal";
    for (const state of Object.values(context.politics.citizens)) state.engagement = clamp01(state.engagement + 0.08);
  }
  return resourceDelta;
}

export function refreshGoalDimensions(goal: CivilizationGoalState, politics: PoliticsState, economy: EconomyState, tick: number) {
  if (goal.id === "none") return;
  const laws = new Set(Object.keys(politics.laws) as PolicyId[]);
  for (const dimension of goal.dimensions) {
    const matching = Object.values(POLICY_DEFINITIONS).filter((definition) => definition.dimensions.includes(dimension.id));
    const institutional = matching.length ? matching.filter((definition) => laws.has(definition.id)).length / matching.length : 0;
    let observed = 0;
    if (dimension.id === "prosperity") observed = Math.min(1, (economy.indicators.activeBusinesses ? 0.34 : 0) + (economy.indicators.tradeVolume ? 0.33 : 0) + (economy.transactions.some((entry) => entry.kind === "investment") ? 0.33 : 0));
    if (dimension.id === "equality") observed = 1 - Math.min(1, economy.indicators.wealthConcentration * 2);
    if (dimension.id === "stability") observed = 1 - politics.indicators.unrest;
    if (dimension.id === "survival") observed = economy.indicators.citizensWithSevereNeeds === 0 ? 1 : 0;
    if (dimension.id === "democracy") observed = politics.indicators.turnout;
    dimension.progress = Number(Math.min(1, institutional * 0.7 + observed * 0.3).toFixed(3));
  }
  if (goal.id === "custom") {
    const direction = goal.milestones.find((milestone) => milestone.id === "shared-direction");
    if (direction && direction.completedAtTick === undefined && laws.size) direction.completedAtTick = tick;
    const weight = goal.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0) || 1;
    const progress = goal.dimensions.reduce((sum, dimension) => sum + dimension.progress * dimension.weight, 0) / weight;
    goal.stage = progress >= 0.85 ? "complete" : "experiment";
  }
}

export function advancePolitics(politics: PoliticsState, tick: number, day: number): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const population = Math.max(1, Object.keys(politics.citizens).length);
  const durations: Record<CollectiveActionKind, number> = { petition: 4, protest: 6, strike: 8, "civil-disobedience": 10, rebellion: 12 };
  for (const action of Object.values(politics.collectiveActions).sort((left, right) => left.id.localeCompare(right.id))) {
    const faction = politics.factions[action.factionId];
    if (!faction || action.status === "resolved") continue;
    if (action.status === "organizing" && tick - action.startedAtTick >= 2) {
      action.status = "active";
      action.activatedAtTick = tick;
      events.push({
        id: `event-${action.id}-active`, tick, day, category: "civic",
        title: `${faction.name} takes collective action`,
        detail: `${action.participantIds.length} villagers begin ${action.kind.replaceAll("-", " ")}.`,
        citizenIds: [...action.participantIds],
      });
      continue;
    }
    if (action.status !== "active" || tick - (action.activatedAtTick ?? action.startedAtTick) < durations[action.kind]) continue;
    const support = action.participantIds.length / population;
    const pressure = support * (0.7 + faction.radicalization * 0.3);
    action.status = "resolved";
    action.resolvedAtTick = tick;
    if (action.kind === "rebellion" && support > 0.5) {
      action.outcome = "administration-changed";
      politics.administration = { form: "faction-council", governingFactionId: faction.id, changedAtTick: tick };
      for (const [citizenId, citizen] of Object.entries(politics.citizens)) {
        citizen.legitimacy = clamp01(citizen.legitimacy - 0.08);
        citizen.grievance = clamp01(citizen.grievance + (faction.memberIds.includes(Number(citizenId)) ? -0.25 : 0.15));
      }
    } else if (pressure >= 0.25) {
      action.outcome = "conceded";
      for (const id of action.participantIds) politics.citizens[id].grievance = clamp01(politics.citizens[id].grievance - 0.18);
    } else {
      action.outcome = action.kind === "rebellion" ? "contained" : "dissipated";
      for (const id of action.participantIds) politics.citizens[id].grievance = clamp01(politics.citizens[id].grievance + 0.08);
    }
    events.push({
      id: `event-${action.id}-resolved`, tick, day, category: "civic",
      title: action.outcome === "administration-changed" ? `${faction.name} displaces the administration` : `${faction.name}'s ${action.kind.replaceAll("-", " ")} ends`,
      detail: action.outcome === "conceded" ? "Public pressure wins concessions without overturning the assembly's voting rules." : action.outcome === "administration-changed" ? "A faction council takes administration, while settlement-wide laws still require a public majority vote." : "The movement fails to win enough public support.",
      citizenIds: [...action.participantIds],
    });
  }
  refreshPoliticalIndicators(politics);
  return events;
}

export function resolveReadyVotes(context: Omit<PoliticalExecutionContext, "citizen" | "civilizationGoal">, day: number): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  for (const proposal of Object.values(context.politics.proposals)) {
    if (proposal.status !== "voting") continue;
    proposal.tally = tally(proposal.ballots);
    if (proposal.eligibleVoterIds.length && !proposal.eligibleVoterIds.every((id) => Boolean(proposal.ballots[id]))) continue;
    proposal.status = proposal.tally.support > proposal.tally.oppose ? "adopted" : "rejected";
    proposal.resolvedAtTick = context.tick;
    if (proposal.status === "adopted") {
      if (!proposal.projectPlan) {
        context.politics.laws[proposal.policyId] = { policyId: proposal.policyId, proposalId: proposal.id, enactedAtTick: context.tick, support: proposal.tally.support, oppose: proposal.tally.oppose };
        enactPolicy(proposal.policyId, context);
      }
    }
    syncLegacyCharter(proposal, context.economy);
    if (!proposal.eligibleVoterIds.length && context.politics.activeProposalId === proposal.id) context.politics.activeProposalId = undefined;
    const label = proposalLabel(proposal);
    events.push({
      id: `event-${proposal.id}-electorate-updated`, tick: context.tick, day, category: "civic",
      title: `${label} is ${proposal.status}`,
      detail: `The electorate changed before the final count. ${proposal.tally.support} supported, ${proposal.tally.oppose} opposed, and ${proposal.tally.abstain} abstained.`,
      citizenIds: [...proposal.eligibleVoterIds],
    });
  }
  refreshPoliticalIndicators(context.politics);
  return events;
}

function factionForResponse(context: PoliticalExecutionContext, proposalId: string, position: "support" | "oppose") {
  const existing = Object.values(context.politics.factions).find((faction) => faction.proposalId === proposalId && faction.position === position);
  if (existing) return existing;
  const proposal = context.politics.proposals[proposalId];
  const label = proposalLabel(proposal);
  const id = `faction-${proposalId}-${position}`;
  const faction: FactionState = {
    id,
    name: position === "oppose" ? `${label} opposition` : `${label} coalition`,
    founderId: context.citizen.id,
    proposalId,
    position,
    memberIds: [],
    influence: 0,
    radicalization: 0.15,
    createdAtTick: context.tick,
  };
  context.politics.factions[id] = faction;
  return faction;
}

function joinFaction(citizenId: number, faction: FactionState, politics: PoliticsState) {
  if (!faction.memberIds.includes(citizenId)) faction.memberIds.push(citizenId);
  politics.citizens[citizenId].factionId = faction.id;
  faction.influence = faction.memberIds.length / Math.max(1, Object.keys(politics.citizens).length);
  faction.radicalization = clamp01(faction.memberIds.reduce((sum, id) => sum + (politics.citizens[id]?.grievance ?? 0), 0) / Math.max(1, faction.memberIds.length));
}

export interface PoliticalExecutionContext {
  tick: number;
  citizen: CitizenState;
  citizens: CitizenState[];
  politics: PoliticsState;
  economy: EconomyState;
  civilizationGoal: CivilizationGoalState;
  stock: Record<string, number>;
}

export interface PoliticalExecutionResult {
  resourceDelta: Record<string, number>;
  activity: string;
  title: string;
  consequences: string[];
  category: SimulationEvent["category"];
  citizenIds: number[];
  targetCitizenId?: number;
}

export function executePoliticalIntent(intent: Extract<ActionIntent, { kind: "propose_policy" | "cast_ballot" | "respond_to_vote" | "form_faction" | "join_faction" | "organize_collective_action" }>, context: PoliticalExecutionContext): PoliticalExecutionResult {
  const { citizen, citizens, politics, economy, tick } = context;
  syncPoliticalCitizens(politics, citizens);
  const civic = politics.citizens[citizen.id];
  let title = `${citizen.name} takes a public position`;
  let consequences: string[] = [];
  let citizenIds = [citizen.id];
  let resourceDelta: Record<string, number> = {};

  if (intent.kind === "propose_policy") {
    const id = `proposal-${intent.policyId}-${tick}-${citizen.id}`;
    const policy = POLICY_DEFINITIONS[intent.policyId];
    politics.proposals[id] = {
      id,
      policyId: intent.policyId,
      sponsorId: citizen.id,
      eligibleVoterIds: citizens.map((item) => item.id).sort((a, b) => a - b),
      ballots: {},
      status: "voting",
      createdAtTick: tick,
      tally: { support: 0, oppose: 0, abstain: 0 },
    };
    politics.activeProposalId = id;
    if (intent.policyId === "assembly-charter" && politics.institutionStage === "none") politics.institutionStage = "founding";
    syncLegacyCharter(politics.proposals[id], economy);
    title = `${citizen.name} proposes ${policy.label.toLowerCase()}`;
    consequences = [`A settlement-wide vote opened for ${citizens.length} citizens.`, policy.description];
  } else if (intent.kind === "cast_ballot") {
    const proposal = politics.proposals[intent.proposalId];
    proposal.ballots[citizen.id] = { citizenId: citizen.id, choice: intent.choice, castAtTick: tick, decisionId: citizen.lastDecisionId ?? `decision-${tick}-${citizen.id}` };
    proposal.tally = tally(proposal.ballots);
    syncLegacyCharter(proposal, economy);
    const received = Object.keys(proposal.ballots).length;
    const complete = proposal.eligibleVoterIds.every((id) => Boolean(proposal.ballots[id]));
    title = `${citizen.name} ${intent.choice === "abstain" ? "abstains" : `votes ${intent.choice}`}`;
    consequences = [`${received} of ${proposal.eligibleVoterIds.length} ballots are in.`];
    if (complete) {
      proposal.status = proposal.tally.support > proposal.tally.oppose ? "adopted" : "rejected";
      proposal.resolvedAtTick = tick;
      if (proposal.status === "adopted") {
        if (!proposal.projectPlan) {
          politics.laws[proposal.policyId] = { policyId: proposal.policyId, proposalId: proposal.id, enactedAtTick: tick, support: proposal.tally.support, oppose: proposal.tally.oppose };
          resourceDelta = enactPolicy(proposal.policyId, context);
        }
      }
      if (proposal.policyId === "assembly-charter" && proposal.status === "rejected") politics.institutionStage = "none";
      syncLegacyCharter(proposal, economy);
      const label = proposalLabel(proposal);
      title = `${label} is ${proposal.status === "adopted" ? "adopted" : "rejected"}`;
      consequences = [
        `${proposal.tally.support} supported, ${proposal.tally.oppose} opposed, and ${proposal.tally.abstain} abstained.`,
        proposal.status === "adopted" ? "The result is now formal policy; every citizen must decide how to respond." : "The status quo remains; every citizen must decide how to respond.",
      ];
      citizenIds = [...proposal.eligibleVoterIds];
    }
  } else if (intent.kind === "respond_to_vote") {
    const proposal = politics.proposals[intent.proposalId];
    civic.reactions[proposal.id] = intent.response;
    const ballot = proposal.ballots[citizen.id]?.choice ?? "abstain";
    const won = proposal.status === "adopted" ? ballot === "support" : ballot === "oppose";
    const changes: Record<VoteReaction, [number, number]> = {
      accept: [0.08, -0.12],
      "reluctant-compliance": [0.01, 0.04],
      protest: [-0.12, 0.18],
      organize: [-0.16, 0.28],
      rebel: [-0.25, 0.42],
    };
    civic.legitimacy = clamp01(civic.legitimacy + changes[intent.response][0]);
    civic.grievance = clamp01(civic.grievance + changes[intent.response][1] + (won ? -0.04 : 0.06));
    if (intent.response === "organize" || intent.response === "rebel") {
      const position = proposal.status === "adopted" ? "oppose" : "support";
      const faction = factionForResponse(context, proposal.id, position);
      joinFaction(citizen.id, faction, politics);
      if (intent.response === "rebel" && !Object.values(politics.collectiveActions).some((action) => action.factionId === faction.id && action.status !== "resolved")) {
        const actionId = `collective-rebellion-${tick}-${faction.id}`;
        politics.collectiveActions[actionId] = { id: actionId, factionId: faction.id, kind: "rebellion", participantIds: [...faction.memberIds], status: "organizing", startedAtTick: tick };
      }
    }
    title = `${citizen.name} ${reactionLabel(intent.response)}`;
    consequences = [`Legitimacy is now ${Math.round(civic.legitimacy * 100)}%; grievance is ${Math.round(civic.grievance * 100)}%.`];
    const allReacted = proposal.eligibleVoterIds.every((id) => Boolean(politics.citizens[id]?.reactions[proposal.id]));
    if (allReacted && politics.activeProposalId === proposal.id) politics.activeProposalId = undefined;
  } else if (intent.kind === "form_faction") {
    const faction = factionForResponse(context, intent.proposalId, intent.position);
    joinFaction(citizen.id, faction, politics);
    title = `${citizen.name} forms ${faction.name}`;
    consequences = ["A new political faction entered public life."];
  } else if (intent.kind === "join_faction") {
    const faction = politics.factions[intent.factionId];
    joinFaction(citizen.id, faction, politics);
    title = `${citizen.name} joins ${faction.name}`;
    consequences = [`The faction now has ${faction.memberIds.length} members.`];
  } else {
    const faction = politics.factions[intent.factionId];
    const id = `collective-${intent.action}-${tick}-${faction.id}`;
    politics.collectiveActions[id] = { id, factionId: faction.id, kind: intent.action, participantIds: [...faction.memberIds], status: "organizing", startedAtTick: tick };
    faction.radicalization = clamp01(faction.radicalization + collectiveEscalation(intent.action));
    title = `${faction.name} begins ${article(intent.action)} ${intent.action.replaceAll("-", " ")}`;
    consequences = [`${faction.memberIds.length} members are associated with the action.`, intent.action === "rebellion" ? "The settlement has entered open rebellion." : "The action may change legitimacy and future votes."];
    citizenIds = [...faction.memberIds];
  }

  refreshPoliticalIndicators(politics);
  assertPoliticsInvariants(politics, citizens);
  return { resourceDelta, activity: consequences[0] ?? title, title, consequences, category: "civic", citizenIds };
}

function reactionLabel(response: VoteReaction) {
  return ({
    accept: "accepts the public result",
    "reluctant-compliance": "complies despite reservations",
    protest: "protests the public result",
    organize: "organizes political opposition",
    rebel: "calls for rebellion",
  } satisfies Record<VoteReaction, string>)[response];
}

function collectiveEscalation(action: CollectiveActionKind) {
  return ({ petition: 0, protest: 0.04, strike: 0.08, "civil-disobedience": 0.14, rebellion: 0.3 } satisfies Record<CollectiveActionKind, number>)[action];
}

function article(action: CollectiveActionKind) {
  return /^[aeiou]/.test(action) ? "an" : "a";
}

export function refreshPoliticalIndicators(politics: PoliticsState) {
  const citizens = Object.values(politics.citizens);
  const active = activeProposal(politics);
  politics.indicators = {
    turnout: active ? Object.keys(active.ballots).length / Math.max(1, active.eligibleVoterIds.length) : politics.indicators.turnout,
    averageLegitimacy: citizens.length ? citizens.reduce((sum, citizen) => sum + citizen.legitimacy, 0) / citizens.length : 0.5,
    unrest: citizens.length ? citizens.reduce((sum, citizen) => sum + citizen.grievance, 0) / citizens.length : 0,
    factionCount: Object.keys(politics.factions).length,
    rebellionActive: Object.values(politics.collectiveActions).some((action) => action.kind === "rebellion" && action.status !== "resolved"),
  };
}

export function assertPoliticsInvariants(politics: PoliticsState, citizens: CitizenState[]) {
  const citizenIds = new Set(citizens.map((citizen) => citizen.id));
  if (politics.activeProposalId && !politics.proposals[politics.activeProposalId]) throw new Error("Politics invariant failed: the active proposal does not exist.");
  if (Object.keys(politics.citizens).some((id) => !citizenIds.has(Number(id)))) throw new Error("Politics invariant failed: political state references an unavailable citizen.");
  for (const proposal of Object.values(politics.proposals)) {
    if (new Set(proposal.eligibleVoterIds).size !== proposal.eligibleVoterIds.length) throw new Error("Politics invariant failed: a proposal has duplicate eligible voters.");
    if (proposal.eligibleVoterIds.some((id) => !citizenIds.has(id))) throw new Error("Politics invariant failed: a proposal references an unavailable voter.");
    for (const [id, ballot] of Object.entries(proposal.ballots)) {
      if (Number(id) !== ballot.citizenId || !proposal.eligibleVoterIds.includes(ballot.citizenId)) throw new Error("Politics invariant failed: an invalid ballot was recorded.");
    }
    const expected = tally(proposal.ballots);
    if (expected.support !== proposal.tally.support || expected.oppose !== proposal.tally.oppose || expected.abstain !== proposal.tally.abstain) throw new Error("Politics invariant failed: a proposal tally does not match its ballots.");
    if (proposal.status !== "voting" && proposal.eligibleVoterIds.some((id) => !proposal.ballots[id])) throw new Error("Politics invariant failed: a vote resolved before every eligible citizen returned a ballot.");
  }
  for (const faction of Object.values(politics.factions)) {
    if (!politics.proposals[faction.proposalId]) throw new Error("Politics invariant failed: a faction references a missing proposal.");
    if (new Set(faction.memberIds).size !== faction.memberIds.length || faction.memberIds.some((id) => !citizenIds.has(id))) throw new Error("Politics invariant failed: a faction has invalid membership.");
  }
  for (const law of Object.values(politics.laws)) {
    const proposal = law && politics.proposals[law.proposalId];
    if (!proposal || proposal.status !== "adopted" || proposal.policyId !== law.policyId) throw new Error("Politics invariant failed: a law does not reference an adopted proposal.");
  }
  for (const action of Object.values(politics.collectiveActions)) {
    const faction = politics.factions[action.factionId];
    if (!faction || action.participantIds.some((id) => !faction.memberIds.includes(id))) throw new Error("Politics invariant failed: collective action has invalid participants.");
  }
}
