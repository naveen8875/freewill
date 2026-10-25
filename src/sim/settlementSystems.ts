import type {
  ActionCandidate,
  ActionIntent,
  BuildingType,
  BusinessState,
  CitizenState,
  DecisionContext,
  EconomyState,
  InventoryOwner,
  PhysicalWorldState,
  SkillId,
  SkillState,
} from "./types.js";

export interface ProductionRecipe {
  id: string;
  label: string;
  businessKinds: string[];
  facility: BuildingType;
  skill: SkillId;
  minimumSkill: number;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  laborTicks: number;
  facilityWear: number;
}

export const PRODUCTION_RECIPES: Record<string, ProductionRecipe> = {
  "bake-bread": {
    id: "bake-bread",
    label: "Bake a batch of bread",
    businessKinds: ["baker", "innkeeper"],
    facility: "bakery",
    skill: "baking",
    minimumSkill: 0.2,
    inputs: { wheat: 2, water: 1, wood: 1 },
    outputs: { bread: 4 },
    laborTicks: 4,
    facilityWear: 0.004,
  },
  "forge-tools": {
    id: "forge-tools",
    label: "Forge a set of tools",
    businessKinds: ["smith"],
    facility: "smithy",
    skill: "smithing",
    minimumSkill: 0.2,
    inputs: { ore: 2, wood: 1 },
    outputs: { tools: 1 },
    laborTicks: 5,
    facilityWear: 0.006,
  },
  "saw-planks": {
    id: "saw-planks",
    label: "Saw timber into planks",
    businessKinds: ["woodcutter", "builder"],
    facility: "lumbermill",
    skill: "logging",
    minimumSkill: 0.18,
    inputs: { wood: 2 },
    outputs: { planks: 3 },
    laborTicks: 3,
    facilityWear: 0.004,
  },
  "craft-furniture": {
    id: "craft-furniture",
    label: "Craft a piece of furniture",
    businessKinds: ["builder", "carpenter"],
    facility: "workshop",
    skill: "construction",
    minimumSkill: 0.3,
    inputs: { planks: 2 },
    outputs: { furniture: 1 },
    laborTicks: 5,
    facilityWear: 0.005,
  },
};

const JOB_SKILL: Record<string, SkillId> = {
  builder: "construction",
  farmer: "farming",
  baker: "baking",
  innkeeper: "baking",
  smith: "smithing",
  woodcutter: "logging",
  miner: "mining",
  fisher: "fishing",
  hunter: "hunting",
  gatherer: "foraging",
  healer: "healing",
  merchant: "trading",
};

export function initialSkills(job: string): Record<string, SkillState> {
  const primary = JOB_SKILL[job];
  return primary ? { [primary]: { level: 0.35, experience: 35 } } : {};
}

export function skillLevel(citizen: Pick<CitizenState, "skills">, skill: SkillId) {
  return citizen.skills?.[skill]?.level ?? 0;
}

export function gainSkill(citizen: CitizenState, skill: SkillId, experience: number) {
  const current = citizen.skills[skill] ?? { level: 0, experience: 0 };
  current.experience += experience;
  current.level = Math.min(1, Math.sqrt(current.experience / 100));
  citizen.skills[skill] = current;
  return current.level;
}

export function ownerKey(owner: InventoryOwner) {
  return owner.kind === "stock" ? "stock" : `${owner.kind}:${owner.id}`;
}

export function inventoryFor(owner: InventoryOwner, context: Pick<DecisionContext, "stock" | "citizen" | "citizens" | "economy">) {
  if (owner.kind === "stock") return context.stock;
  if (owner.kind === "citizen") return context.citizens.find((citizen) => citizen.id === owner.id)?.inventory;
  return context.economy?.businesses[owner.id]?.inventory;
}

export function businessCanUseFacility(business: BusinessState, building: { objectUid: number; owner: { kind: string; id: unknown }; operatorBusinessId?: string }) {
  return business.facilityObjectUids.includes(building.objectUid)
    && (building.owner.kind === "business" && building.owner.id === business.id || building.operatorBusinessId === business.id);
}

export function refreshBusinessBlockers(economy: EconomyState, physical: PhysicalWorldState) {
  for (const business of Object.values(economy.businesses)) {
    const blockers: string[] = [];
    const recipes = Object.values(PRODUCTION_RECIPES).filter((recipe) => recipe.businessKinds.includes(business.kind));
    if (recipes.length) {
      const viableFacility = business.facilityObjectUids
        .map((uid) => physical.buildings[String(uid)])
        .find((building) => building && building.condition >= 0.4 && recipes.some((recipe) => recipe.facility === building.buildingType));
      if (!viableFacility) blockers.push(`Needs an owned or leased ${[...new Set(recipes.map((recipe) => recipe.facility))].join(" or ")}.`);
      const missing = new Set<string>();
      for (const recipe of recipes) for (const [resource, amount] of Object.entries(recipe.inputs)) if ((business.inventory[resource] ?? 0) < amount) missing.add(`${amount} ${resource}`);
      if (missing.size) blockers.push(`Missing recipe inputs: ${[...missing].join(", ")}.`);
    }
    business.blockers = blockers;
  }
}

export function refreshCitizenCommitments(citizens: CitizenState[], economy: EconomyState, physical: PhysicalWorldState, tick: number) {
  for (const citizen of citizens) {
    const commitment = citizen.commitment;
    if (!commitment || commitment.status !== "active") continue;
    commitment.updatedAtTick = tick;
    delete commitment.blocker;
    if (commitment.kind === "survival") {
      const worstNeed = Math.max(...Object.values(citizen.needs));
      commitment.progress = Math.max(commitment.progress, Math.max(0, Math.min(1, (0.7 - worstNeed) / 0.45)));
      if (worstNeed <= 0.3) commitment.status = "completed";
      continue;
    }
    if (commitment.kind === "enterprise") {
      const business = commitment.targetId ? economy.businesses[commitment.targetId] : undefined;
      if (!business) {
        commitment.status = "blocked";
        commitment.blocker = "The target enterprise no longer exists.";
        continue;
      }
      commitment.progress = Math.max(commitment.progress, Math.min(1, business.productionRuns / 4));
      if (business.blockers.length) commitment.blocker = business.blockers.join(" ");
      if (business.productionRuns >= 4) commitment.status = "completed";
      continue;
    }
    if (commitment.kind === "production") {
      const matchingRuns = economy.production.filter((batch) => batch.recipeId === commitment.targetId && batch.citizenId === citizen.id && batch.completedAtTick >= commitment.createdAtTick).length;
      commitment.progress = Math.max(commitment.progress, Math.min(1, matchingRuns / 3));
      if (matchingRuns >= 3) commitment.status = "completed";
      else if (!Object.values(PRODUCTION_RECIPES).some((recipe) => recipe.id === commitment.targetId)) {
        commitment.status = "blocked";
        commitment.blocker = "The target production process no longer exists.";
      }
      continue;
    }
    if (commitment.kind === "construction") {
      const project = commitment.targetId ? physical.projects[commitment.targetId] : undefined;
      if (!project) {
        commitment.status = "blocked";
        commitment.blocker = "The target project no longer exists.";
        continue;
      }
      const materialTotal = Object.values(project.required).reduce((sum, amount) => sum + amount, 0);
      const delivered = Object.entries(project.required).reduce((sum, [resource, amount]) => sum + Math.min(amount, project.delivered[resource] ?? 0), 0);
      const materialProgress = materialTotal ? delivered / materialTotal : 1;
      const laborProgress = project.laborRequired ? project.laborCompleted / project.laborRequired : 1;
      commitment.progress = Math.max(commitment.progress, Math.min(1, materialProgress * 0.3 + laborProgress * 0.7));
      if (project.status === "complete") commitment.status = "completed";
      else if (project.status === "cancelled") commitment.status = "abandoned";
    }
  }
}

export function recipeBlockers(recipe: ProductionRecipe, citizen: CitizenState, owner: InventoryOwner, context: DecisionContext, facilityObjectUid: number) {
  const blockers: string[] = [];
  const building = context.physicalWorld?.buildings[String(facilityObjectUid)];
  const business = owner.kind === "business" ? context.economy?.businesses[owner.id] : undefined;
  if (!building || building.buildingType !== recipe.facility) blockers.push(`requires an operational ${recipe.facility}`);
  else if (building.condition < 0.4) blockers.push(`${recipe.facility} condition is too low`);
  if (owner.kind === "business") {
    if (!business) blockers.push("the operating business no longer exists");
    else {
      const actorMayWork = business.ownerId === citizen.id || business.employeeIds.includes(citizen.id);
      if (!actorMayWork) blockers.push(`is not authorized to work for ${business.name}`);
      if (!recipe.businessKinds.includes(business.kind)) blockers.push(`${business.name} is not organized for this recipe`);
      if (building && !businessCanUseFacility(business, building)) blockers.push(`${business.name} does not own or lease this ${recipe.facility}`);
    }
  } else if (owner.kind === "citizen" && owner.id !== citizen.id) blockers.push("cannot produce into another citizen's inventory");
  else if (owner.kind === "stock" && context.economy?.policies.privateProperty && building?.owner.kind !== "public") blockers.push("private facilities cannot consume communal inventory");
  const level = skillLevel(citizen, recipe.skill);
  if (level < recipe.minimumSkill) blockers.push(`needs ${Math.round(recipe.minimumSkill * 100)}% ${recipe.skill} skill; currently ${Math.round(level * 100)}%`);
  const inventory = inventoryFor(owner, context);
  if (!inventory) blockers.push("the production inventory is unavailable");
  else for (const [resource, amount] of Object.entries(recipe.inputs)) {
    if ((inventory[resource] ?? 0) < amount) blockers.push(`needs ${amount} ${resource}; has ${inventory[resource] ?? 0}`);
  }
  return blockers;
}

function candidate(id: string, label: string, intent: ActionIntent, legal = true, blockedBy?: string): ActionCandidate {
  return { id, label, intent, legal, ...(blockedBy ? { blockedBy } : {}), score: null, trace: [] };
}

function commitmentCandidates(context: DecisionContext) {
  const { citizen } = context;
  if (citizen.commitment?.status === "active") return [];
  const results: ActionCandidate[] = [];
  const severeNeed = Object.entries(citizen.needs).sort((a, b) => b[1] - a[1])[0];
  if (severeNeed?.[1] >= 0.68) results.push(candidate(
    `commit-survival-${citizen.id}-${severeNeed[0]}`,
    `Commit to stabilizing ${severeNeed[0]}`,
    { kind: "adopt_commitment", commitmentKind: "survival", objective: `Stabilize ${severeNeed[0]}`, strategy: "Secure the required resource without abandoning other obligations." },
  ));
  const owned = Object.values(context.economy?.businesses ?? {}).find((business) => business.ownerId === citizen.id);
  if (owned) results.push(candidate(
    `commit-enterprise-${owned.id}`,
    `Commit to making ${owned.name} physically operational`,
    { kind: "adopt_commitment", commitmentKind: "enterprise", objective: `Operate ${owned.name}`, strategy: "Secure a facility, inputs, workers, and customers.", targetId: owned.id },
  ));
  const activeProject = Object.values(context.physicalWorld?.projects ?? {}).find((project) => project.status !== "complete" && project.status !== "cancelled");
  if (activeProject) results.push(candidate(
    `commit-project-${activeProject.id}-${citizen.id}`,
    `Commit to completing the ${activeProject.buildingType}`,
    { kind: "adopt_commitment", commitmentKind: "construction", objective: `Complete ${activeProject.buildingType}`, strategy: "Acquire missing materials, haul them, and contribute suitable labor.", targetId: activeProject.id },
  ));
  const roleRecipe = Object.values(PRODUCTION_RECIPES).find((recipe) => recipe.businessKinds.includes(citizen.job));
  if (roleRecipe) results.push(candidate(
    `commit-production-${roleRecipe.id}-${citizen.id}`,
    `Commit to a real ${roleRecipe.label.toLowerCase()} production chain`,
    { kind: "adopt_commitment", commitmentKind: "production", objective: roleRecipe.label, strategy: "Secure a workplace and inputs, then produce and distribute the output.", targetId: roleRecipe.id },
  ));
  return results.slice(0, 3);
}

export function buildSettlementCandidates(context: DecisionContext): ActionCandidate[] {
  if (!context.physicalWorld?.enabled) return [];
  const results: ActionCandidate[] = [...commitmentCandidates(context)];
  const { citizen } = context;
  const primarySkill = JOB_SKILL[citizen.job];
  if (primarySkill && skillLevel(citizen, primarySkill) < 0.55) results.push(candidate(
    `train-${primarySkill}-${citizen.id}`,
    `Practice ${primarySkill} before taking on harder work`,
    { kind: "train_skill", skill: primarySkill },
  ));
  if (citizen.job === "unassigned") {
    const emergentRoles: Array<[SkillId, string]> = [
      ["foraging", "gatherer"], ["farming", "farmer"], ["fishing", "fisher"], ["hunting", "hunter"],
      ["logging", "woodcutter"], ["mining", "miner"], ["construction", "builder"], ["healing", "healer"],
    ];
    for (const [skill, occupation] of emergentRoles) if (skillLevel(citizen, skill) >= 0.2) results.push(candidate(
      `recognize-${occupation}-${citizen.id}`,
      `Recognize repeated ${skill} work as the ${occupation} role`,
      { kind: "change_occupation", occupation, reason: `Repeated successful ${skill} work created practical skill and a visible role.` },
    ));
  }

  const activeProjects = Object.values(context.physicalWorld.projects).filter((project) => project.status !== "complete" && project.status !== "cancelled");
  const skilledBuilders = context.citizens.filter((person) => skillLevel(person, "construction") >= 0.2);
  if (activeProjects.length && !skilledBuilders.length && citizen.job !== "kid" && citizen.job !== "builder") {
    results.push(candidate(
      `change-builder-${citizen.id}`,
      "Take up building work to unblock the settlement",
      { kind: "change_occupation", occupation: "builder", reason: "Active construction has no skilled builder." },
      skillLevel(citizen, "construction") >= 0.1,
      skillLevel(citizen, "construction") >= 0.1 ? undefined : "Practice construction before changing occupation.",
    ));
    if (skillLevel(citizen, "construction") < 0.2) results.push(candidate(
      `train-construction-${citizen.id}`,
      "Apprentice in basic construction",
      { kind: "train_skill", skill: "construction" },
    ));
  }

  const economy = context.economy;
  if (!economy) return results;
  const businesses = Object.values(economy.businesses).filter((business) => business.ownerId === citizen.id || business.employeeIds.includes(citizen.id));
  for (const business of businesses.slice(0, 2)) {
    if (business.ownerId === citizen.id) {
      for (const [resource, available] of Object.entries(citizen.inventory).filter(([, amount]) => amount > 0).sort(([left], [right]) => left.localeCompare(right)).slice(0, 4)) {
        const amount = Math.min(3, Math.floor(available));
        if (amount > 0) results.push(candidate(
          `stock-${business.id}-${resource}-${citizen.id}`,
          `Move ${amount} ${resource} into ${business.name}'s accountable inventory`,
          { kind: "transfer_good", resource, amount, from: { kind: "citizen", id: citizen.id }, to: { kind: "business", id: business.id } },
        ));
      }
    }
    const recipes = Object.values(PRODUCTION_RECIPES).filter((recipe) => recipe.businessKinds.includes(business.kind));
    for (const recipe of recipes) {
      const linkedFacilities = business.facilityObjectUids
        .map((uid) => context.physicalWorld!.buildings[String(uid)])
        .filter((building) => building?.buildingType === recipe.facility && building.condition >= 0.4);
      if (!linkedFacilities.length && business.ownerId === citizen.id) {
        const leasable = Object.values(context.physicalWorld.buildings).find((building) => building.buildingType === recipe.facility && building.condition >= 0.4 && building.owner.kind === "public" && !building.operatorBusinessId);
        if (leasable) results.push(candidate(
          `lease-${business.id}-${leasable.objectUid}`,
          `Lease ${recipe.facility} #${leasable.objectUid} for ${business.name}`,
          { kind: "lease_facility", businessId: business.id, buildingObjectUid: leasable.objectUid, rent: 1 },
          business.capital >= 1,
          business.capital >= 1 ? undefined : `${business.name} needs 1 shell of capital for the lease.`,
        ));
      }
      const owner: InventoryOwner = { kind: "business", id: business.id };
      for (const [resource, required] of Object.entries(recipe.inputs)) {
        const missing = Math.max(0, required - (business.inventory[resource] ?? 0));
        const personal = citizen.inventory[resource] ?? 0;
        if (business.ownerId === citizen.id && missing > 0 && personal > 0) {
          const amount = Math.min(missing, personal);
          results.push(candidate(
            `supply-${business.id}-${resource}-${citizen.id}`,
            `Supply ${amount} ${resource} from personal inventory to ${business.name}`,
            { kind: "transfer_good", resource, amount, from: { kind: "citizen", id: citizen.id }, to: owner },
          ));
        }
      }
      for (const building of linkedFacilities.slice(0, 1)) {
        const blockers = recipeBlockers(recipe, citizen, owner, context, building.objectUid);
        results.push(candidate(
          `operate-${recipe.id}-${business.id}-${building.objectUid}-${citizen.id}`,
          `${recipe.label} at ${business.name} · ${Object.entries(recipe.inputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")} → ${Object.entries(recipe.outputs).map(([resource, amount]) => `${amount} ${resource}`).join(" + ")}`,
          { kind: "operate_recipe", recipeId: recipe.id, facilityObjectUid: building.objectUid, owner },
          blockers.length === 0,
          blockers[0],
        ));
      }
    }
  }

  if (!economy.policies.privateProperty) {
    for (const recipe of Object.values(PRODUCTION_RECIPES).filter((item) => item.businessKinds.includes(citizen.job)).slice(0, 1)) {
      const facility = Object.values(context.physicalWorld.buildings).find((building) => building.buildingType === recipe.facility && building.owner.kind === "public" && building.condition >= 0.4);
      if (!facility) continue;
      const owner: InventoryOwner = { kind: "stock" };
      const blockers = recipeBlockers(recipe, citizen, owner, context, facility.objectUid);
      results.push(candidate(`operate-commons-${recipe.id}-${facility.objectUid}-${citizen.id}`, `${recipe.label} for the common stores`, { kind: "operate_recipe", recipeId: recipe.id, facilityObjectUid: facility.objectUid, owner }, blockers.length === 0, blockers[0]));
    }
  }
  return results.slice(0, 12);
}

export function settlementIntentBlockReason(intent: ActionIntent, context: DecisionContext): string | null {
  switch (intent.kind) {
    case "adopt_commitment":
      return context.citizen.commitment?.status === "active" ? "This citizen already has an active commitment." : null;
    case "change_occupation":
      if (context.citizen.job === "kid") return "Children cannot take a full occupation.";
      if (context.citizen.commitment?.status === "active") return "The citizen must finish or abandon their active commitment before changing occupations.";
      if (intent.occupation === "builder" && skillLevel(context.citizen, "construction") < 0.1) return "The citizen needs basic construction practice first.";
      return null;
    case "train_skill":
      if (context.citizen.commitment?.status === "active" && context.citizen.commitment.kind !== "learning") {
        const commitment = context.citizen.commitment;
        const business = commitment.kind === "enterprise" && commitment.targetId ? context.economy?.businesses[commitment.targetId] : undefined;
        const productionRecipe = commitment.kind === "production" && commitment.targetId ? PRODUCTION_RECIPES[commitment.targetId] : undefined;
        const related = commitment.kind === "construction" && intent.skill === "construction"
          || Boolean(business && Object.values(PRODUCTION_RECIPES).some((recipe) => recipe.businessKinds.includes(business.kind) && recipe.skill === intent.skill))
          || productionRecipe?.skill === intent.skill;
        if (!related) return "The citizen's active commitment currently takes priority over unrelated practice.";
      }
      return skillLevel(context.citizen, intent.skill) >= 1 ? "This skill is already mastered." : null;
    case "lease_facility": {
      const business = context.economy?.businesses[intent.businessId];
      const building = context.physicalWorld?.buildings[String(intent.buildingObjectUid)];
      if (!business || business.ownerId !== context.citizen.id) return "Only the business owner can lease this facility.";
      if (!building || building.owner.kind !== "public" || building.operatorBusinessId) return "That public facility is not available for lease.";
      if (!Number.isInteger(intent.rent) || intent.rent < 0 || business.capital < intent.rent) return "The business cannot fund this lease.";
      const compatible = Object.values(PRODUCTION_RECIPES).some((recipe) => recipe.businessKinds.includes(business.kind) && recipe.facility === building.buildingType);
      return compatible ? null : "This facility cannot support the business's production.";
    }
    case "transfer_good": {
      if (!Number.isInteger(intent.amount) || intent.amount <= 0) return "A transfer must use a positive whole amount.";
      const source = inventoryFor(intent.from, context);
      const destination = inventoryFor(intent.to, context);
      if (!source || !destination || (source[intent.resource] ?? 0) < intent.amount) return "The source inventory no longer contains the promised goods.";
      if (intent.from.kind === "citizen" && intent.from.id !== context.citizen.id) return "A citizen cannot transfer someone else's inventory.";
      if (intent.from.kind === "business" && context.economy?.businesses[intent.from.id]?.ownerId !== context.citizen.id) return "Only the owner can transfer business inventory.";
      if (intent.to.kind === "business" && context.economy?.businesses[intent.to.id]?.ownerId !== context.citizen.id) return "Only the owner can supply this business directly.";
      return null;
    }
    case "operate_recipe": {
      const recipe = PRODUCTION_RECIPES[intent.recipeId];
      if (!recipe) return "The selected production recipe does not exist.";
      return recipeBlockers(recipe, context.citizen, intent.owner, context, intent.facilityObjectUid)[0] ?? null;
    }
    default:
      return null;
  }
}

