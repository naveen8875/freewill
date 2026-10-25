import type {
  ActionCandidate,
  ActionIntent,
  CitizenState,
  CivilizationGoalState,
  DecisionContext,
  EconomyState,
  GoalMilestone,
  GoalDimension,
  SocietyGoalId,
} from "./types.js";
import { PRODUCTION_RECIPES } from "./settlementSystems.js";

const MILESTONES: Array<Pick<GoalMilestone, "id" | "label">> = [
  { id: "charter", label: "Adopt a market charter" },
  { id: "currency", label: "Put a shared currency into circulation" },
  { id: "property", label: "Register the first productive property" },
  { id: "market", label: "Complete the first voluntary trade" },
  { id: "business", label: "Register the first business" },
  { id: "employment", label: "Form the first employment contract" },
  { id: "investment", label: "Reinvest private capital" },
];

const BASE_PRICES: Record<string, number> = {
  wheat: 3,
  fish: 4,
  bread: 5,
  wood: 4,
  stone: 5,
  ore: 6,
};

const DIMENSIONS: Record<GoalDimension["id"], string> = {
  prosperity: "Prosperity",
  equality: "Equality",
  freedom: "Freedom",
  stability: "Stability",
  survival: "Survival",
  sustainability: "Sustainability",
  democracy: "Democratic participation",
  expansion: "Expansion",
};

function goalDimensions(id: SocietyGoalId, prompt: string): GoalDimension[] {
  const normalized = prompt.toLowerCase();
  const weights: Partial<Record<GoalDimension["id"], number>> = {};
  if (id === "market-economy" || /market|capital|business|trade|wealth|prosper/.test(normalized)) weights.prosperity = 1;
  if (/equal|fair|redistribut|nobody.*starv|no one.*starv/.test(normalized)) weights.equality = 1;
  if (/free|liberty|individual|autonom/.test(normalized)) weights.freedom = 1;
  if (/peace|stable|order|safe/.test(normalized)) weights.stability = 1;
  if (/surviv|food|hunger|starv|self-suff/.test(normalized)) weights.survival = 1;
  if (/sustain|nature|climate|renew/.test(normalized)) weights.sustainability = 1;
  if (/democ|vote|representation/.test(normalized)) weights.democracy = 1;
  if (/expand|empire|colon|grow|moon/.test(normalized)) weights.expansion = 1;
  if (!Object.keys(weights).length && id !== "none") weights.stability = 0.6;
  return Object.entries(weights).map(([dimensionId, weight]) => ({ id: dimensionId as GoalDimension["id"], label: DIMENSIONS[dimensionId as GoalDimension["id"]], weight, progress: 0 }));
}

export function inferSocietyGoal(prompt: string): SocietyGoalId {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return "none";
  return /market|capital|business|trade/.test(normalized) ? "market-economy" : "custom";
}

export function createCivilizationGoal(id: SocietyGoalId = "none", requestedPrompt?: string): CivilizationGoalState {
  const prompt = requestedPrompt?.trim() || (id === "market-economy" ? "Build a market economy" : id === "custom" ? "Build a society around the shared objective" : "Let the village develop without a shared objective");
  return {
    id,
    prompt,
    stage: id === "market-economy" ? "founding" : id === "custom" ? "experiment" : "inactive",
    milestones: id === "market-economy" ? MILESTONES.map((milestone) => ({ ...milestone })) : id === "custom" ? [{ id: "shared-direction", label: "Establish a shared direction" }] : [],
    dimensions: goalDimensions(id, prompt),
  };
}

export function createEconomyState(): EconomyState {
  return {
    currency: { id: "shell", label: "Shells" },
    wallets: {},
    treasury: 0,
    moneySupply: 0,
    policies: { privateProperty: false, currency: false, contracts: false, taxRate: 0, publicFoodReserve: false },
    ownership: [],
    businesses: {},
    offers: {},
    contracts: {},
    transactions: [],
    production: [],
    priceHistory: {},
    indicators: { tradeVolume: 0, medianWealth: 0, wealthConcentration: 0, employedCitizens: 0, activeBusinesses: 0, activeOffers: 0, charterSupport: 0, citizensWithSevereNeeds: 0 },
  };
}

function candidate(id: string, label: string, intent: ActionIntent): ActionCandidate {
  return { id, label, intent, legal: true, score: null, trace: [] };
}

function ownedBusinesses(context: DecisionContext) {
  return Object.values(context.economy?.businesses ?? {}).filter((business) => business.ownerId === context.citizen.id);
}

function activeContractFor(citizenId: number, context: DecisionContext) {
  return Object.values(context.economy?.contracts ?? {}).find((contract) => contract.workerId === citizenId && (contract.status === "offered" || contract.status === "active"));
}

function listableInventory(context: DecisionContext) {
  const business = ownedBusinesses(context)[0];
  const inventory = business?.inventory ?? context.citizen.inventory;
  return {
    ownerType: business ? "business" as const : "citizen" as const,
    ownerId: business?.id ?? String(context.citizen.id),
    inventory,
  };
}

export function buildEconomicCandidates(context: DecisionContext): ActionCandidate[] {
  const { economy, citizen, citizens } = context;
  if (!economy) return [];
  const results: ActionCandidate[] = [];
  const charter = economy.charter;

  if (context.politics) {
    if (!context.politics.laws["market-charter"]) return results;
  } else {
    if (!charter || charter.status === "rejected") {
      results.push(candidate("propose-market-charter", charter ? "Propose a revised market charter" : "Propose a market charter", { kind: "propose_market_charter" }));
      return results;
    }

    if (charter.status === "open" && ![...charter.supporterIds, ...charter.opponentIds].includes(citizen.id)) {
      results.push(candidate(`support-charter-${charter.id}`, "Support the market charter", { kind: "support_market_charter", proposalId: charter.id }));
      results.push(candidate(`oppose-charter-${charter.id}`, "Oppose the market charter", { kind: "oppose_market_charter", proposalId: charter.id }));
      return results;
    }

    if (charter.status !== "adopted") return results;
  }

  const businesses = ownedBusinesses(context);
  if (!businesses.length && citizen.job !== "kid" && citizen.job !== "wanderer" && (economy.wallets[citizen.id] ?? 0) >= 5) {
    results.push(candidate(`register-business-${citizen.id}`, `Register a ${citizen.job} business`, { kind: "register_business", businessKind: citizen.job }));
  }

  const source = listableInventory(context);
  const alreadyListed = new Set(Object.values(economy.offers).filter((offer) => offer.status === "open" && offer.sellerId === citizen.id).map((offer) => offer.resource));
  for (const [resource, amount] of Object.entries(source.inventory).sort(([left], [right]) => left.localeCompare(right)).slice(0, 4)) {
    const sourceBusiness = source.ownerType === "business" ? economy.businesses[source.ownerId] : undefined;
    const productionReserve = sourceBusiness ? Math.max(0, ...Object.values(PRODUCTION_RECIPES).filter((recipe) => recipe.businessKinds.includes(sourceBusiness.kind)).map((recipe) => recipe.inputs[resource] ?? 0)) : 0;
    if (amount <= productionReserve || alreadyListed.has(resource)) continue;
    const previous = economy.priceHistory[resource]?.at(-1)?.unitPrice;
    const foodPressure = ["wheat", "fish", "bread"].includes(resource) && citizens.reduce((total, item) => total + item.needs.hunger, 0) / Math.max(1, citizens.length) >= 0.6 ? 1 : 0;
    const competingOffers = Object.values(economy.offers).filter((offer) => offer.status === "open" && offer.resource === resource).length;
    const referencePrice = Math.max(1, (previous ?? BASE_PRICES[resource] ?? 3) + foodPressure - (competingOffers >= 2 ? 1 : 0));
    const priceChoices = [...new Set([Math.max(1, referencePrice - 1), referencePrice, referencePrice + 1])];
    for (const unitPrice of priceChoices) {
      const strategy = unitPrice < referencePrice ? "quick sale" : unitPrice > referencePrice ? "premium" : "market price";
      results.push(candidate(`list-${source.ownerId}-${resource}-${unitPrice}`, `List 1 ${resource} for ${unitPrice} shells · ${strategy}`, {
        kind: "list_good", ownerType: source.ownerType, ownerId: source.ownerId, resource, amount: 1, unitPrice,
      }));
    }
  }

  const wallet = economy.wallets[citizen.id] ?? 0;
  for (const offer of Object.values(economy.offers)
    .filter((item) => item.status === "open" && item.sellerId !== citizen.id && item.amountRemaining > 0 && item.unitPrice <= wallet)
    .sort((left, right) => left.unitPrice - right.unitPrice || left.createdAtTick - right.createdAtTick || left.id.localeCompare(right.id))
    .slice(0, 4)) {
    const seller = citizens.find((item) => item.id === offer.sellerId);
    results.push(candidate(`buy-${offer.id}-${citizen.id}`, `Buy 1 ${offer.resource}${seller ? ` from ${seller.name}` : ""} for ${offer.unitPrice} shells`, { kind: "buy_good", offerId: offer.id, amount: 1 }));
  }

  const business = businesses[0];
  if (business && wallet >= 5) {
    results.push(candidate(`invest-${business.id}`, `Invest 5 shells in ${business.name}`, { kind: "invest_business", businessId: business.id, amount: 5 }));
  }

  if (business && economy.policies.contracts && business.capital >= 3) {
    const worker = citizens
      .filter((item) => item.id !== citizen.id && !activeContractFor(item.id, context))
      .sort((left, right) => left.id - right.id)[0];
    if (worker) results.push(candidate(`offer-job-${business.id}-${worker.id}`, `Offer ${worker.name} a 3-shell job`, { kind: "offer_job", businessId: business.id, workerId: worker.id, wage: 3 }));
  }

  const offered = Object.values(economy.contracts).find((contract) => contract.workerId === citizen.id && contract.status === "offered");
  if (offered) {
    const businessName = economy.businesses[offered.businessId]?.name ?? "the business";
    results.push(candidate(`accept-job-${offered.id}`, `Accept a ${offered.wage}-shell job at ${businessName}`, { kind: "accept_job", contractId: offered.id }));
  }

  return results;
}

export function economicIntentBlockReason(intent: ActionIntent, context: DecisionContext): string | null {
  const { economy, citizen, citizens } = context;
  if (!economy) return "This world has no economic state.";
  const wallet = economy.wallets[citizen.id] ?? 0;
  switch (intent.kind) {
    case "propose_market_charter":
      return economy.charter && economy.charter.status !== "rejected" ? "A market charter has already been proposed." : null;
    case "support_market_charter":
    case "oppose_market_charter": {
      const charter = economy.charter;
      if (!charter || charter.id !== intent.proposalId || charter.status !== "open") return "The charter vote is no longer open.";
      return [...charter.supporterIds, ...charter.opponentIds].includes(citizen.id) ? "This citizen has already voted." : null;
    }
    case "register_business":
      if (!economy.policies.privateProperty) return "Private property has not been adopted.";
      if (intent.businessKind !== citizen.job) return "A business registration must match the citizen's occupation.";
      if (Object.values(economy.businesses).some((business) => business.ownerId === citizen.id)) return "This citizen already owns a business.";
      return wallet < 5 ? "Registration requires 5 shells." : null;
    case "list_good": {
      if (!economy.policies.privateProperty || !economy.policies.currency) return "The market institutions are not active.";
      if (!Number.isInteger(intent.amount) || intent.amount <= 0 || !Number.isInteger(intent.unitPrice) || intent.unitPrice <= 0) return "Offer amount and price must be positive whole numbers.";
      if (intent.ownerType === "citizen" && intent.ownerId !== String(citizen.id)) return "Citizens may list only their own inventory.";
      const business = intent.ownerType === "business" ? economy.businesses[intent.ownerId] : undefined;
      if (intent.ownerType === "business" && (!business || business.ownerId !== citizen.id)) return "Citizens may list goods only from a business they own.";
      const inventory = business?.inventory ?? citizen.inventory;
      if (!inventory || (inventory[intent.resource] ?? 0) < intent.amount) return "The seller no longer owns enough of this good.";
      return Object.values(economy.offers).some((offer) => offer.status === "open" && offer.sellerId === citizen.id && offer.resource === intent.resource) ? "This seller already has an open offer for that good." : null;
    }
    case "buy_good": {
      if (!economy.policies.currency) return "Currency has not been adopted.";
      if (!Number.isInteger(intent.amount) || intent.amount <= 0) return "Purchase amount must be a positive whole number.";
      const offer = economy.offers[intent.offerId];
      if (!offer || offer.status !== "open" || offer.amountRemaining < intent.amount) return "The offer is no longer available.";
      if (offer.sellerId === citizen.id) return "Citizens cannot buy their own offer.";
      return wallet < offer.unitPrice * intent.amount ? "The buyer cannot afford this offer." : null;
    }
    case "invest_business": {
      const business = economy.businesses[intent.businessId];
      if (!business || business.ownerId !== citizen.id) return "Only the owner can invest in this business.";
      return !Number.isInteger(intent.amount) || intent.amount <= 0 || wallet < intent.amount ? "The owner lacks the proposed investment." : null;
    }
    case "offer_job": {
      const business = economy.businesses[intent.businessId];
      if (!economy.policies.contracts || !business || business.ownerId !== citizen.id) return "This citizen cannot offer work for that business.";
      if (!Number.isInteger(intent.wage) || business.capital < intent.wage || intent.wage <= 0) return "The business cannot reserve that wage.";
      if (!citizens.some((item) => item.id === intent.workerId)) return "The intended worker is unavailable.";
      if (intent.workerId === citizen.id) return "A business owner cannot accept their own job offer.";
      return activeContractFor(intent.workerId, context) ? "The intended worker already has a contract." : null;
    }
    case "accept_job": {
      if (!economy.policies.contracts) return "Contracts have not been adopted.";
      const contract = economy.contracts[intent.contractId];
      return !contract || contract.workerId !== citizen.id || contract.status !== "offered" ? "The job offer is no longer available." : null;
    }
    default:
      return null;
  }
}

function completeMilestone(goal: CivilizationGoalState, id: GoalMilestone["id"], tick: number) {
  const milestone = goal.milestones.find((item) => item.id === id);
  if (milestone && milestone.completedAtTick === undefined) milestone.completedAtTick = tick;
}

export function refreshGoalProgress(goal: CivilizationGoalState, economy: EconomyState, tick: number) {
  if (goal.id !== "market-economy") return;
  if (economy.charter?.status === "adopted") {
    completeMilestone(goal, "charter", economy.charter.resolvedAtTick ?? tick);
    completeMilestone(goal, "currency", economy.charter.resolvedAtTick ?? tick);
  }
  if (economy.ownership.length) completeMilestone(goal, "property", tick);
  if (Object.keys(economy.businesses).length) completeMilestone(goal, "business", tick);
  if (economy.transactions.some((transaction) => transaction.kind === "trade")) completeMilestone(goal, "market", tick);
  if (Object.values(economy.contracts).some((contract) => contract.status === "completed")) completeMilestone(goal, "employment", tick);
  if (economy.transactions.some((transaction) => transaction.kind === "investment")) completeMilestone(goal, "investment", tick);

  const completed = new Set(goal.milestones.filter((item) => item.completedAtTick !== undefined).map((item) => item.id));
  goal.stage = !completed.has("charter")
    ? "founding"
    : !completed.has("property")
      ? "property-rights"
      : !completed.has("market")
        ? "active-market"
        : !completed.has("employment")
          ? "enterprise"
          : !completed.has("investment")
            ? "enterprise"
            : "capital-formation";
}

export function refreshEconomicIndicators(economy: EconomyState, citizens: CitizenState[]) {
  const businessWealth = new Map<number, number>();
  for (const business of Object.values(economy.businesses)) businessWealth.set(business.ownerId, (businessWealth.get(business.ownerId) ?? 0) + business.capital);
  const wealth = citizens.map((citizen) => (economy.wallets[citizen.id] ?? 0) + (businessWealth.get(citizen.id) ?? 0)).sort((left, right) => left - right);
  const totalWealth = wealth.reduce((total, amount) => total + amount, 0) + economy.treasury + Object.values(economy.contracts).reduce((total, contract) => total + contract.escrowedWage, 0);
  const richest = wealth.at(-1) ?? 0;
  const middle = wealth.length ? wealth.length % 2 ? wealth[Math.floor(wealth.length / 2)] : (wealth[wealth.length / 2 - 1] + wealth[wealth.length / 2]) / 2 : 0;
  economy.indicators = {
    tradeVolume: economy.transactions.filter((entry) => entry.kind === "trade").reduce((total, entry) => total + entry.money, 0),
    medianWealth: Number(middle.toFixed(2)),
    wealthConcentration: totalWealth > 0 ? Number((richest / totalWealth).toFixed(4)) : 0,
    employedCitizens: new Set(Object.values(economy.contracts).filter((contract) => contract.status === "active").map((contract) => contract.workerId)).size,
    activeBusinesses: Object.keys(economy.businesses).length,
    activeOffers: Object.values(economy.offers).filter((offer) => offer.status === "open").length,
    charterSupport: citizens.length ? (economy.charter?.supporterIds.length ?? 0) / citizens.length : 0,
    citizensWithSevereNeeds: citizens.filter((citizen) => Object.values(citizen.needs).some((need) => need >= 0.8)).length,
  };
}

export function assertEconomyInvariants(economy: EconomyState, citizens: CitizenState[], externalEscrowBalance = 0) {
  const nonNegativeFinite = (value: number) => Number.isFinite(value) && value >= 0;
  if (!nonNegativeFinite(economy.treasury)) throw new Error("Economy invariant failed: treasury must be finite and non-negative.");
  if (!nonNegativeFinite(economy.moneySupply)) throw new Error("Economy invariant failed: money supply must be finite and non-negative.");
  if (Object.values(economy.wallets).some((amount) => !nonNegativeFinite(amount))) throw new Error("Economy invariant failed: wallet balance must be finite and non-negative.");
  const owners = new Set<string>();
  for (const record of economy.ownership) {
    if (owners.has(record.assetId)) throw new Error(`Economy invariant failed: ${record.assetId} has multiple owners.`);
    owners.add(record.assetId);
    if (!citizens.some((citizen) => citizen.id === record.ownerId)) throw new Error(`Economy invariant failed: ownership references missing citizen ${record.ownerId}.`);
  }
  for (const business of Object.values(economy.businesses)) {
    if (!nonNegativeFinite(business.capital)) throw new Error(`Economy invariant failed: ${business.id} has invalid capital.`);
    if (Object.values(business.inventory).some((amount) => !nonNegativeFinite(amount))) throw new Error(`Economy invariant failed: ${business.id} has invalid inventory.`);
    if (!citizens.some((citizen) => citizen.id === business.ownerId)) throw new Error(`Economy invariant failed: ${business.id} has no valid owner.`);
    if (new Set(business.facilityObjectUids).size !== business.facilityObjectUids.length) throw new Error(`Economy invariant failed: ${business.id} contains duplicate facilities.`);
    if (!Number.isInteger(business.productionRuns) || business.productionRuns < 0) throw new Error(`Economy invariant failed: ${business.id} has invalid production totals.`);
  }
  for (const batch of economy.production) {
    if (!citizens.some((citizen) => citizen.id === batch.citizenId)) throw new Error(`Economy invariant failed: ${batch.id} references a missing producer.`);
    if (Object.values(batch.inputs).some((amount) => !nonNegativeFinite(amount)) || Object.values(batch.outputs).some((amount) => !nonNegativeFinite(amount))) throw new Error(`Economy invariant failed: ${batch.id} has invalid material totals.`);
  }
  for (const offer of Object.values(economy.offers)) {
    if (!nonNegativeFinite(offer.amountRemaining) || !nonNegativeFinite(offer.unitPrice)) throw new Error(`Economy invariant failed: ${offer.id} has invalid quantity or price.`);
    if (!citizens.some((citizen) => citizen.id === offer.sellerId)) throw new Error(`Economy invariant failed: ${offer.id} has no valid seller.`);
    if (offer.sourceOwnerType === "citizen" && offer.sourceOwnerId !== String(offer.sellerId)) throw new Error(`Economy invariant failed: ${offer.id} references another citizen's inventory.`);
    if (offer.sourceOwnerType === "business") {
      const business = economy.businesses[offer.sourceOwnerId];
      if (!business || offer.businessId !== business.id || business.ownerId !== offer.sellerId) throw new Error(`Economy invariant failed: ${offer.id} has invalid business ownership.`);
    }
  }
  for (const contract of Object.values(economy.contracts)) {
    if (!economy.businesses[contract.businessId]) throw new Error(`Economy invariant failed: ${contract.id} references a missing business.`);
    if (!citizens.some((citizen) => citizen.id === contract.employerId) || !citizens.some((citizen) => citizen.id === contract.workerId)) throw new Error(`Economy invariant failed: ${contract.id} references a missing citizen.`);
    if (!nonNegativeFinite(contract.wage)) throw new Error(`Economy invariant failed: ${contract.id} has an invalid wage.`);
    if (!nonNegativeFinite(contract.escrowedWage)) throw new Error(`Economy invariant failed: ${contract.id} has invalid wage escrow.`);
  }
  const accountedMoney = economy.treasury
    + Object.values(economy.wallets).reduce((total, amount) => total + amount, 0)
    + Object.values(economy.businesses).reduce((total, business) => total + business.capital, 0)
    + Object.values(economy.contracts).reduce((total, contract) => total + contract.escrowedWage, 0)
    + externalEscrowBalance;
  if (Math.abs(accountedMoney - economy.moneySupply) > 1e-9) throw new Error(`Economy invariant failed: ${accountedMoney} shells are accounted for, expected ${economy.moneySupply}.`);
}

export function businessName(citizen: CitizenState, kind: string) {
  const suffix: Record<string, string> = { farmer: "Fields", fisher: "Catch", baker: "Bakery", woodcutter: "Timber", builder: "Works", merchant: "Market", miner: "Quarry", smith: "Forge" };
  return `${citizen.name}'s ${suffix[kind] ?? "Workshop"}`;
}

