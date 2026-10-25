import type { SimulationWorldSeed } from "./spatial.js";
import type {
  ActionCandidate,
  ActionIntent,
  AssetOwner,
  BuildingType,
  ConstructionProjectState,
  DecisionContext,
  EconomyState,
  PhysicalWorldState,
  PrimitiveRecipeId,
  PublicProjectPlan,
  SimulationSnapshot,
} from "./types.js";
import { skillLevel } from "./settlementSystems.js";
import { legacyDurationTicks } from "./time.js";

export interface BuildingDefinition {
  assetId: string;
  label: string;
  effect: string;
  moneyCost: number;
  footprint: { width: number; height: number };
  required: Record<string, number>;
  laborRequired: number;
  capacity: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  campfire: { assetId: "campfire", label: "campfire", effect: "Provides warmth, safety, cooking, and a social focus.", moneyCost: 0, footprint: { width: 1, height: 1 }, required: { branches: 2, stone: 2 }, laborRequired: 2, capacity: 0 },
  shelter: { assetId: "leanto", label: "sleeping shelter", effect: "Protects one person from exposure and improves rest.", moneyCost: 0, footprint: { width: 1, height: 1 }, required: { branches: 3, fiber: 2 }, laborRequired: 4, capacity: 1 },
  "storage-pile": { assetId: "logpile", label: "storage pile", effect: "Provides a visible shared place for early materials.", moneyCost: 0, footprint: { width: 1, height: 1 }, required: { branches: 2, fiber: 1 }, laborRequired: 3, capacity: 0 },
  "drying-rack": { assetId: "rack", label: "drying rack", effect: "Extends the life of fish, berries, and harvested plants.", moneyCost: 0, footprint: { width: 1, height: 1 }, required: { branches: 3, fiber: 2 }, laborRequired: 4, capacity: 0 },
  "garden-plot": { assetId: "stake", label: "first garden plot", effect: "Turns a conserved wild seed into the first cultivated crop.", moneyCost: 0, footprint: { width: 2, height: 1 }, required: { branches: 1, wild_seed: 1 }, laborRequired: 3, capacity: 0 },
  cottage: { assetId: "cottage", label: "cottage", effect: "Houses two villagers and improves rest.", moneyCost: 4, footprint: { width: 2, height: 2 }, required: { wood: 6, stone: 2 }, laborRequired: 8, capacity: 2 },
  storehouse: { assetId: "storehouse", label: "storehouse", effect: "Raises each construction delivery from three materials to five.", moneyCost: 0, footprint: { width: 2, height: 2 }, required: { wood: 8, stone: 4 }, laborRequired: 10, capacity: 0 },
  lumbermill: { assetId: "lumbermill", label: "lumber mill", effect: "Adds one wood to every successful tree harvest.", moneyCost: 8, footprint: { width: 3, height: 2 }, required: { wood: 12, stone: 4 }, laborRequired: 14, capacity: 0 },
  stall: { assetId: "stall", label: "market stall", effect: "Doubles the lifetime of its business's market offers.", moneyCost: 6, footprint: { width: 2, height: 1 }, required: { wood: 5, stone: 0 }, laborRequired: 6, capacity: 0 },
  farm: { assetId: "field", label: "farm plot", effect: "Adds one food to every successful harvest.", moneyCost: 6, footprint: { width: 3, height: 3 }, required: { wood: 2, stone: 0 }, laborRequired: 5, capacity: 0 },
  hall: { assetId: "hall", label: "town hall", effect: "Completing it raises confidence in public institutions.", moneyCost: 0, footprint: { width: 4, height: 3 }, required: { wood: 18, stone: 12 }, laborRequired: 24, capacity: 0 },
  well: { assetId: "well", label: "well", effect: "Provides reliable water for villagers and nearby crops.", moneyCost: 8, footprint: { width: 1, height: 1 }, required: { wood: 4, stone: 6 }, laborRequired: 10, capacity: 0 },
  road: { assetId: "sign", label: "road", effect: "Cuts movement cost along its completed route.", moneyCost: 10, footprint: { width: 1, height: 1 }, required: { wood: 0, stone: 6 }, laborRequired: 12, capacity: 0 },
  bakery: { assetId: "bakery", label: "bakery", effect: "Turns owned wheat, water, and fuel into conserved bread batches.", moneyCost: 10, footprint: { width: 2, height: 2 }, required: { wood: 8, stone: 5 }, laborRequired: 12, capacity: 0 },
  smithy: { assetId: "blacksmith", label: "smithy", effect: "Turns owned ore and fuel into durable tools.", moneyCost: 12, footprint: { width: 2, height: 2 }, required: { wood: 8, stone: 10 }, laborRequired: 16, capacity: 0 },
  workshop: { assetId: "storehouse", label: "workshop", effect: "Turns processed materials into finished goods.", moneyCost: 9, footprint: { width: 2, height: 2 }, required: { wood: 10, stone: 4 }, laborRequired: 13, capacity: 0 },
  fishery: { assetId: "fishhut", label: "fishery", effect: "Supports accountable fishing work from a physical waterfront facility.", moneyCost: 7, footprint: { width: 2, height: 2 }, required: { wood: 7, stone: 2 }, laborRequired: 9, capacity: 0 },
};

export interface PrimitiveRecipeDefinition {
  label: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  durability?: number;
  requiresCampfire?: boolean;
}

export const PRIMITIVE_RECIPES: Record<PrimitiveRecipeId, PrimitiveRecipeDefinition> = {
  "sharp-stone": { label: "sharp stone", inputs: { stone: 1 }, outputs: { sharp_stone: 1 }, durability: 5 },
  "fire-starter": { label: "fire starter", inputs: { branches: 1, fiber: 1 }, outputs: { fire_starter: 1 }, durability: 8 },
  basket: { label: "woven basket", inputs: { fiber: 2 }, outputs: { basket: 1 }, durability: 16 },
  "water-container": { label: "fired-clay water container", inputs: { clay: 2 }, outputs: { water_container: 1 }, durability: 20, requiresCampfire: true },
  spear: { label: "stone-tipped spear", inputs: { branches: 1, fiber: 1, sharp_stone: 1 }, outputs: { spear: 1 }, durability: 12 },
  "fishing-tool": { label: "fishing line and hook", inputs: { branches: 1, fiber: 2, sharp_stone: 1 }, outputs: { fishing_tool: 1 }, durability: 10 },
  "simple-clothing": { label: "simple fiber clothing", inputs: { fiber: 3 }, outputs: { simple_clothing: 1 }, durability: 30 },
  "basic-medicine": { label: "basic herbal medicine", inputs: { herbs: 1, fiber: 1 }, outputs: { basic_medicine: 1 } },
};

const TREE_YIELD: Record<string, number> = { oak: 4, pine: 3, palm: 3, elder: 5 };
const MINERAL_YIELD: Record<string, Record<string, number>> = {
  rock: { stone: 3, ore: 1 },
  stones: { stone: 2 },
  mine: { stone: 1, ore: 3 },
};
const BUILDING_TYPE_BY_ASSET: Partial<Record<string, BuildingType>> = {
  campfire: "campfire",
  leanto: "shelter",
  logpile: "storage-pile",
  rack: "drying-rack",
  stake: "garden-plot",
  cottage: "cottage",
  tent: "cottage",
  hut: "cottage",
  storehouse: "storehouse",
  lumbermill: "lumbermill",
  stall: "stall",
  field: "farm",
  hall: "hall",
  courthouse: "hall",
  parliament: "hall",
  well: "well",
  bakery: "bakery",
  blacksmith: "smithy",
  fishhut: "fishery",
};

export function createPhysicalWorld(seed?: Partial<SimulationWorldSeed>): PhysicalWorldState {
  const resources: PhysicalWorldState["resources"] = {};
  const buildings: PhysicalWorldState["buildings"] = {};
  for (const object of seed?.objects ?? []) {
    if (object.tree) {
      const id = `tree:${object.uid}`;
      resources[id] = {
        id,
        objectUid: object.uid,
        assetId: object.assetId,
        kind: "tree",
        position: { x: object.x, y: object.y },
        yield: { wood: TREE_YIELD[object.assetId] ?? 3 },
        status: object.assetId === "stump" ? "depleted" : "available",
      };
    }
    if (object.assetId in MINERAL_YIELD) {
      const id = `stone:${object.uid}`;
      resources[id] = {
        id,
        objectUid: object.uid,
        assetId: object.assetId,
        kind: "stone",
        position: { x: object.x, y: object.y },
        yield: { ...MINERAL_YIELD[object.assetId] },
        status: "available",
      };
    }
    if (object.wildResource === "wild-food") {
      const id = `wild-food:${object.uid}`;
      resources[id] = { id, objectUid: object.uid, assetId: object.assetId, kind: "wild-food", position: { x: object.x, y: object.y }, yield: { berries: object.assetId === "bush" ? 3 : 1, ...(object.assetId === "bush" ? { wild_seed: 1 } : { herbs: 1 }) }, status: "available" };
    }
    if (object.wildResource === "fiber") {
      const id = `fiber:${object.uid}`;
      resources[id] = { id, objectUid: object.uid, assetId: object.assetId, kind: "fiber", position: { x: object.x, y: object.y }, yield: { fiber: 2 }, status: "available" };
    }
    if (object.crop || object.category === "crop") {
      const id = `crop:${object.uid}`;
      const ripe = object.age >= 95;
      resources[id] = {
        id,
        objectUid: object.uid,
        assetId: object.assetId,
        kind: "crop",
        position: { x: object.x, y: object.y },
        yield: { wheat: 2 },
        status: ripe ? "available" : "depleted",
        cropType: object.assetId === "cabbage" || object.assetId === "pumpkin" ? object.assetId : "wheat",
        cropStage: ripe ? "ripe" : "growing",
        plantedAtTick: 0,
        growth: ripe ? 1 : Math.max(0, Math.min(0.94, object.age / 100)),
        moisture: 0.7,
        health: 1,
        ...(!ripe ? { depletedAtTick: 0, regrowAtTick: legacyDurationTicks(Math.max(1, Math.ceil((95 - object.age) * 2.5))) } : {}),
      };
    }
    const buildingType = BUILDING_TYPE_BY_ASSET[object.assetId] ?? (object.homeCapacity > 0 ? "cottage" : undefined);
    if (buildingType && object.build >= 1) {
      buildings[String(object.uid)] = {
        objectUid: object.uid,
        buildingType,
        position: { x: object.x, y: object.y },
        owner: { kind: "public", id: "settlement" },
        capacity: buildingType === "cottage" ? object.homeCapacity : BUILDINGS[buildingType].capacity,
        residentIds: [],
        condition: 1,
        completedAtTick: 0,
      };
    }
  }
  return {
    enabled: seed?.objects !== undefined,
    nextObjectUid: Math.max(seed?.nextObjectUid ?? 1, ...[...(seed?.objects ?? [])].map((object) => object.uid + 1)),
    resources,
    renewableStocks: seed?.objects !== undefined ? {
      fish: { id: "fish", resource: "fish", amount: 24, capacity: 24, regenerationPerTick: 0.035 },
      game: { id: "game", resource: "game", amount: 12, capacity: 12, regenerationPerTick: 0.012 },
      clay: { id: "clay", resource: "clay", amount: 40, capacity: 40, regenerationPerTick: 0.01 },
      water: { id: "water", resource: "water", amount: 120, capacity: 120, regenerationPerTick: 0.2 },
    } : {},
    projects: {},
    buildings,
    roads: {},
    mandates: {},
    escrows: {},
    foodLots: {},
    demolitions: {},
    waste: 0,
    claims: {},
  };
}

function candidate(id: string, label: string, intent: ActionIntent, legal = true, blockedBy?: string): ActionCandidate {
  return { id, label, legal, ...(blockedBy ? { blockedBy } : {}), score: null, trace: [], intent };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function projectProgress(project: ConstructionProjectState) {
  const materialTotal = Object.values(project.required).reduce((sum, amount) => sum + amount, 0);
  const deliveredTotal = Object.entries(project.required).reduce((sum, [resource, amount]) => sum + Math.min(amount, project.delivered[resource] ?? 0), 0);
  const materialProgress = materialTotal ? deliveredTotal / materialTotal : 1;
  const laborProgress = project.laborRequired ? project.laborCompleted / project.laborRequired : 1;
  return Math.min(1, materialProgress * 0.3 + laborProgress * 0.7);
}

export function buildPhysicalCandidates(context: DecisionContext): ActionCandidate[] {
  const physical = context.physicalWorld;
  if (!physical?.enabled) return [];
  const results: ActionCandidate[] = [];
  const { citizen } = context;
  const formalGovernment = context.politics?.institutionStage === "formal";
  if ((citizen.knowledge?.discoveredTiles.length ?? 0) < 1 || (citizen.knowledge?.discoveredTiles.length ?? 0) < 4_096) {
    results.push(candidate(`explore-${citizen.id}-${context.tick}`, "Explore beyond personally known ground", { kind: "explore" }));
  }
  const hasExecutableMandate = (plan: PublicProjectPlan) => Object.values(physical.mandates).some((mandate) =>
    (mandate.status === "authorized" || mandate.status === "claimed")
    && JSON.stringify(mandate.plan) === JSON.stringify(plan));
  const availableTrees = Object.values(physical.resources)
    .filter((node) => node.kind === "tree" && node.status === "available")
    .sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
  const availableStone = Object.values(physical.resources)
    .filter((node) => node.kind === "stone" && node.status === "available")
    .sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
  const harvestableCrops = Object.values(physical.resources)
    .filter((node) => node.kind === "crop" && node.status === "available")
    .sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
  const wildFood = Object.values(physical.resources).filter((node) => node.kind === "wild-food" && node.status === "available").sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
  for (const node of wildFood.slice(0, 3)) results.push(candidate(`forage-${node.objectUid}`, `Forage ${node.yield.berries ?? 1} food from ${node.assetId} #${node.objectUid}`, { kind: "forage_wild_food", nodeId: node.id }));
  const fibers = Object.values(physical.resources).filter((node) => node.kind === "fiber" && node.status === "available").sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
  for (const node of fibers.slice(0, 2)) results.push(candidate(`gather-fiber-${node.objectUid}`, `Gather fiber from ${node.assetId} #${node.objectUid}`, { kind: "gather_fiber", nodeId: node.id }));
  for (const node of availableTrees.slice(0, 2)) results.push(candidate(`branches-${node.objectUid}`, `Collect fallen branches near ${node.assetId} #${node.objectUid}`, { kind: "gather_branches", nodeId: node.id }));
  for (const node of availableStone.slice(0, 2)) results.push(candidate(`loose-stone-${node.objectUid}`, `Collect loose stone near deposit #${node.objectUid}`, { kind: "gather_loose_stone", nodeId: node.id }));
  const primitiveMaterials = (citizen.inventory.branches ?? 0) >= 1 && (citizen.inventory.stone ?? 0) >= 1;
  if ((citizen.inventory.hand_axe ?? 0) < 1) results.push(candidate(`craft-hand-axe-${citizen.id}`, "Bind a sharp stone to a branch as a hand axe", { kind: "craft_hand_axe" }, primitiveMaterials, primitiveMaterials ? undefined : "Requires 1 branch and 1 loose stone."));
  if ((citizen.inventory.stone_pick ?? 0) < 1) results.push(candidate(`craft-stone-pick-${citizen.id}`, "Bind a stone head to a branch as a digging pick", { kind: "craft_stone_pick" }, primitiveMaterials, primitiveMaterials ? undefined : "Requires 1 branch and 1 loose stone."));
  const nearbyCampfire = Object.values(physical.buildings).find((building) => building.buildingType === "campfire" && building.condition >= 0.15 && distance(building.position, citizen.position) <= 8);
  const hasCampfire = Boolean(nearbyCampfire && (nearbyCampfire.fuel ?? 0) > 0);
  if (nearbyCampfire) {
    if ((citizen.inventory.branches ?? 0) >= 1 && (nearbyCampfire.fuel ?? 0) < 48) results.push(candidate(`fuel-campfire-${nearbyCampfire.objectUid}-${citizen.id}`, `Add one branch to campfire #${nearbyCampfire.objectUid}`, { kind: "fuel_campfire", buildingObjectUid: nearbyCampfire.objectUid }));
    if ((nearbyCampfire.fuel ?? 0) > 0) {
      const raw = (["meat", "fish", "berries"] as const).find((resource) => (citizen.inventory[resource] ?? 0) >= 1);
      if (raw) results.push(candidate(`cook-${raw}-${nearbyCampfire.objectUid}-${citizen.id}`, `Cook one ${raw} over campfire #${nearbyCampfire.objectUid}`, { kind: "cook_food", buildingObjectUid: nearbyCampfire.objectUid, resource: raw }));
      if ((citizen.inventory.water ?? 0) >= 1) results.push(candidate(`boil-water-${nearbyCampfire.objectUid}-${citizen.id}`, `Boil one carried water at campfire #${nearbyCampfire.objectUid}`, { kind: "boil_water", buildingObjectUid: nearbyCampfire.objectUid }));
    }
  }
  for (const [recipeId, recipe] of Object.entries(PRIMITIVE_RECIPES) as Array<[PrimitiveRecipeId, PrimitiveRecipeDefinition]>) {
    const alreadyHasDurableOutput = Object.keys(recipe.outputs).some((resource) => (citizen.inventory[resource] ?? 0) > 0 && recipe.durability);
    if (alreadyHasDurableOutput) continue;
    const missing = Object.entries(recipe.inputs).filter(([resource, amount]) => (citizen.inventory[resource] ?? 0) < amount);
    const campfireMissing = Boolean(recipe.requiresCampfire && !hasCampfire);
    const blockedBy = campfireMissing ? "The clay vessel must be fired at a nearby campfire." : missing.length ? `Requires ${missing.map(([resource, amount]) => `${amount} ${resource}`).join(", ")}.` : undefined;
    results.push(candidate(`craft-${recipeId}-${citizen.id}`, `Craft ${recipe.label}`, { kind: "craft_primitive", recipeId }, !blockedBy, blockedBy));
  }
  if (citizen.job === "woodcutter" || citizen.job === "unassigned") {
    const protectedForest = Boolean(context.politics?.laws["conservation-code"] && availableTrees.length <= 8);
    const legacyProfessional = citizen.job === "woodcutter" && !citizen.knowledge?.learnedTechniques.includes("craft_hand_axe");
    for (const node of availableTrees.slice(0, 3)) {
      results.push(candidate(
        `fell-tree-${node.objectUid}`,
        `Cut ${node.assetId} #${node.objectUid} for ${node.yield.wood ?? 0} wood`,
        { kind: "fell_tree", nodeId: node.id },
        !protectedForest && (legacyProfessional || (citizen.inventory.hand_axe ?? 0) >= 1),
        protectedForest ? "The conservation code protects the settlement's last trees." : !legacyProfessional && (citizen.inventory.hand_axe ?? 0) < 1 ? "A hand axe must be crafted first." : undefined,
      ));
    }
  }
  if (citizen.job === "miner" || citizen.job === "unassigned") {
    const legacyProfessional = citizen.job === "miner" && !citizen.knowledge?.learnedTechniques.includes("craft_stone_pick");
    for (const node of availableStone.slice(0, 3)) {
      const yieldLabel = Object.entries(node.yield).map(([resource, amount]) => `${amount} ${resource}`).join(" and ");
      results.push(candidate(
        `quarry-stone-${node.objectUid}`,
        `Work mineral deposit #${node.objectUid} for ${yieldLabel}`,
        { kind: "quarry_stone", nodeId: node.id },
        legacyProfessional || (citizen.inventory.stone_pick ?? 0) >= 1,
        !legacyProfessional && (citizen.inventory.stone_pick ?? 0) < 1 ? "A stone pick must be crafted first." : undefined,
      ));
    }
  }
  if (citizen.job === "farmer" || citizen.job === "unassigned") {
    for (const node of harvestableCrops.slice(0, 3)) {
      results.push(candidate(
        `harvest-crop-${node.objectUid}`,
        `Harvest ${node.assetId} plot #${node.objectUid}`,
        { kind: "harvest_crop", nodeId: node.id },
      ));
    }
    const fallow = Object.values(physical.resources)
      .filter((node) => node.kind === "crop" && (node.cropStage === "fallow" || node.cropStage === "withered"))
      .sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
    for (const node of fallow.slice(0, 2)) for (const cropType of ["wheat", "cabbage", "pumpkin"] as const) {
      const seedResource = `${cropType}_seed`;
      const seedSource = (citizen.inventory[seedResource] ?? 0) >= 1 ? "carried seed"
        : (context.stock[seedResource] ?? 0) >= 1 ? "common seed"
          : (citizen.inventory[cropType] ?? 0) >= 1 ? "carried food reserved as seed"
            : (context.stock[cropType] ?? 0) >= 1 ? "common food reserved as seed" : undefined;
      results.push(candidate(
        `sow-${cropType}-${node.objectUid}`,
        `Sow ${cropType} from ${seedSource ?? "unavailable seed"} on plot #${node.objectUid}`,
        { kind: "sow_crop", nodeId: node.id, cropType },
        Boolean(seedSource),
        seedSource ? undefined : `Sowing requires one conserved ${cropType} as seed.`,
      ));
    }
    const tending = Object.values(physical.resources)
      .filter((node) => node.kind === "crop" && (node.cropStage === "sown" || node.cropStage === "growing") && ((node.moisture ?? 0) < 0.45 || context.tick - (node.lastTendedAtTick ?? node.plantedAtTick ?? 0) >= 24))
      .sort((a, b) => distance(citizen.position, a.position) - distance(citizen.position, b.position) || a.objectUid - b.objectUid);
    for (const node of tending.slice(0, 3)) results.push(candidate(`tend-crop-${node.objectUid}`, `Tend ${node.cropType ?? "wheat"} plot #${node.objectUid}`, { kind: "tend_crop", nodeId: node.id }));
  }

  const workingWells = Object.values(physical.buildings).filter((building) => building.buildingType === "well" && building.condition >= 0.15);
  const groundwater = physical.renewableStocks.water?.amount ?? 0;
  if ((citizen.needs.thirst ?? 0) >= 0.35 && groundwater >= 1 && context.waterSources?.length) {
    results.push(candidate(`drink-natural-water-${citizen.id}`, "Drink directly from a natural water source", { kind: "drink_natural_water" }));
  }
  if ((physical.renewableStocks.clay?.amount ?? 0) >= 1 && context.waterSources?.length && (citizen.inventory.clay ?? 0) < 2) {
    results.push(candidate(`gather-clay-${citizen.id}`, "Gather workable clay from the shore", { kind: "gather_clay" }));
  }
  if (!workingWells.length && groundwater >= 1 && (citizen.needs.thirst ?? 0) >= 0.45 && (citizen.inventory.water ?? 0) < 1 && (context.stock.water ?? 0) < 1 && context.waterSources?.length && (citizen.inventory.water_container ?? 0) > 0) {
    results.push(candidate(`collect-water-${citizen.id}`, "Collect one untreated water from the shore (slow; a well is safer and faster)", { kind: "collect_water" }));
  }
  if (groundwater >= 2 && (citizen.inventory.water ?? 0) < 2 && (citizen.inventory.water_container ?? 0) > 0) for (const well of workingWells.slice(0, 2)) {
    results.push(candidate(`draw-water-${well.objectUid}-${citizen.id}`, `Draw water from well #${well.objectUid}`, { kind: "draw_water", buildingObjectUid: well.objectUid }));
  }
  if ((citizen.needs.thirst ?? 0) >= 0.35 && (citizen.inventory.water ?? 0) + (context.stock.water ?? 0) > 0) {
    results.push(candidate(`drink-water-${citizen.id}`, (citizen.inventory.water ?? 0) > 0 ? "Drink carried water" : "Drink water from the common stores", { kind: "drink_water" }));
  }
  if ((physical.renewableStocks.fish?.amount ?? 0) >= 1 && context.waterSources?.length) {
    const tool = (citizen.inventory.fishing_tool ?? 0) > 0;
    results.push(candidate(`catch-fish-${citizen.id}`, tool ? "Catch fish with a crafted fishing tool" : "Try to catch fish by hand", { kind: "catch_fish" }));
  }
  if ((physical.renewableStocks.game?.amount ?? 0) >= 1) {
    const armed = (citizen.inventory.spear ?? 0) > 0;
    results.push(candidate(`hunt-game-${citizen.id}`, "Hunt tracked wild game", { kind: "hunt_game" }, armed, armed ? undefined : "Hunting requires a crafted spear."));
  }
  if ((citizen.inventory.basic_medicine ?? 0) > 0 && ((citizen.physical?.illness ?? 0) > 0.08 || (citizen.physical?.injury ?? 0) > 0.08)) {
    results.push(candidate(`use-medicine-${citizen.id}`, "Use basic herbal medicine", { kind: "use_medicine" }));
  }

  const projects = Object.values(physical.projects).filter((project) => project.status !== "complete" && project.status !== "cancelled").sort((a, b) => a.createdAtTick - b.createdAtTick || a.id.localeCompare(b.id));
  const storehouse = Object.values(physical.buildings).find((building) => building.buildingType === "storehouse" && building.condition >= 0.15);
  const deliveryCapacity = storehouse ? storehouse.condition >= 0.4 ? 5 : 4 : 3;
  for (const project of projects.slice(0, 4)) {
    for (const resource of Object.keys(project.required).sort()) {
      const missing = Math.max(0, project.required[resource] - project.delivered[resource]);
      if (!missing) continue;
      const personal = Math.min(missing, Math.floor(citizen.inventory[resource] ?? 0), deliveryCapacity);
      const shared = Math.min(missing, Math.floor(context.stock[resource] ?? 0), deliveryCapacity);
      if (personal > 0) results.push(candidate(
        `deliver-${resource}-${project.id}-inventory-${citizen.id}`,
        `Carry ${personal} ${resource} to the ${BUILDINGS[project.buildingType].label} site`,
        { kind: "deliver_material", projectId: project.id, resource, amount: personal, source: "inventory" },
      ));
      else if (shared > 0) results.push(candidate(
        `deliver-${resource}-${project.id}-stock-${citizen.id}`,
        `Deliver ${shared} shared ${resource} to the ${BUILDINGS[project.buildingType].label} site`,
        { kind: "deliver_material", projectId: project.id, resource, amount: shared, source: "stock" },
      ));
    }
    const materialsReady = Object.entries(project.required).every(([resource, amount]) => (project.delivered[resource] ?? 0) >= amount);
    if ((citizen.job === "builder" || skillLevel(citizen, "construction") >= 0.1 || ["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot"].includes(project.buildingType)) && materialsReady) results.push(candidate(
      `work-project-${project.id}`,
      `Build the ${BUILDINGS[project.buildingType].label} · ${project.laborCompleted}/${project.laborRequired} labor`,
      { kind: "work_construction", projectId: project.id },
    ));
    const mayCancel = project.owner.kind === "citizen" && project.owner.id === citizen.id
      || project.owner.kind === "business" && context.economy?.businesses[project.owner.id]?.ownerId === citizen.id;
    if (mayCancel) results.push(candidate(`cancel-${project.id}-${citizen.id}`, `Cancel ${BUILDINGS[project.buildingType].label} #${project.objectUid} and refund the balance`, { kind: "cancel_project", projectId: project.id }));
  }

  // A visible unfinished survival site is already a real opportunity to help.
  // Do not offer every nearby person a duplicate campfire/shelter while it exists;
  // they may contribute to it, ignore it, or later cancel their own project.
  const activePrimitiveTypes = new Set(projects.filter((project) => ["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot"].includes(project.buildingType)).map((project) => project.buildingType));
  if (citizen.job === "unassigned") {
    const livingPopulation = context.citizens.filter((person) => person.physical?.alive !== false).length;
    const gardenCount = Object.values(physical.buildings).filter((building) => building.buildingType === "garden-plot" && building.condition >= 0.15).length;
    const targetGardens = Math.max(1, Math.ceil(livingPopulation / 4));
    const wanted: BuildingType[] = [
      ...(!activePrimitiveTypes.has("campfire") && !Object.values(physical.buildings).some((building) => building.buildingType === "campfire" && distance(building.position, citizen.position) <= 10) ? ["campfire" as const] : []),
      ...(!activePrimitiveTypes.has("garden-plot") && (citizen.inventory.wild_seed ?? 0) >= 1 && gardenCount < targetGardens ? ["garden-plot" as const] : []),
      ...(!activePrimitiveTypes.has("shelter") && !citizen.homeObjectUid && !Object.values(physical.buildings).some((building) => building.buildingType === "shelter" && building.residentIds.includes(citizen.id)) ? ["shelter" as const] : []),
    ];
    for (const buildingType of wanted) {
      const site = (context.buildSites ?? []).find((item) => item.buildingType === buildingType);
      if (site) results.push(candidate(`start-${buildingType}-${site.x}-${site.y}-${citizen.id}`, `Mark a ${BUILDINGS[buildingType].label} site at ${site.x},${site.y}`, { kind: "start_construction", buildingType, x: site.x, y: site.y, owner: { kind: "citizen", id: citizen.id } }));
    }
  }

  if (citizen.job === "builder" || skillLevel(citizen, "construction") >= 0.2) {
    for (const mandate of Object.values(physical.mandates).filter((item) => item.status === "authorized" && item.expiresAtTick >= context.tick).slice(0, 2)) {
      const plan = mandate.plan;
      if (plan.operation === "build" || plan.operation === "road") {
        const position = plan.position ?? plan.route?.[0];
        if (plan.buildingType && position) results.push(candidate(
          `start-mandate-${mandate.id}`,
          `Begin approved ${plan.label}`,
          { kind: "start_construction", buildingType: plan.buildingType, x: position.x, y: position.y, owner: { kind: "public", id: "settlement" }, mandateId: mandate.id, route: plan.route },
          (context.economy?.treasury ?? 0) >= plan.budget,
          (context.economy?.treasury ?? 0) >= plan.budget ? undefined : `The treasury lacks the approved ${plan.budget}-shell budget.`,
        ));
      }
      if (plan.operation === "repair" && plan.targetKind && plan.targetId) {
        const funded = (context.economy?.treasury ?? 0) >= plan.budget;
        results.push(candidate(`repair-mandate-${mandate.id}`, `Carry out approved repairs to ${plan.label}`, { kind: "repair_structure", targetKind: plan.targetKind, targetId: plan.targetId, mandateId: mandate.id }, funded, funded ? undefined : `The treasury lacks the approved ${plan.budget}-shell repair budget.`));
      }
      if (plan.operation === "demolish" && plan.targetId) results.push(candidate(`demolish-mandate-${mandate.id}`, `Carry out approved demolition of ${plan.label}`, { kind: "demolish_structure", buildingObjectUid: Number(plan.targetId), mandateId: mandate.id }));
    }
  }

  const homeless = context.citizens.filter((person) => !person.homeObjectUid);
  if ((citizen.job === "builder" || skillLevel(citizen, "construction") >= 0.2) && projects.length === 0) {
    const completedTypes = new Set(Object.values(physical.buildings).map((building) => building.buildingType));
    const food = (context.stock.wheat ?? 0) + (context.stock.fish ?? 0) + (context.stock.bread ?? 0);
    const publicWorksAuthorized = Boolean(context.politics?.laws["settlement-expansion"]);
    const hasTimberBusiness = Object.values(context.economy?.businesses ?? {}).some((business) => business.kind === "woodcutter");
    const hasMerchantBusiness = Object.values(context.economy?.businesses ?? {}).some((business) => business.kind === "merchant");
    const hasFarmBusiness = Object.values(context.economy?.businesses ?? {}).some((business) => business.kind === "farmer");
    const hasBakeryBusiness = Object.values(context.economy?.businesses ?? {}).some((business) => business.kind === "baker");
    const hasSmithBusiness = Object.values(context.economy?.businesses ?? {}).some((business) => business.kind === "smith");
    const recommended: BuildingType[] = homeless.length > 0
      ? ["cottage"]
      : hasBakeryBusiness && !completedTypes.has("bakery")
        ? ["bakery"]
        : hasSmithBusiness && !completedTypes.has("smithy")
          ? ["smithy"]
      : publicWorksAuthorized && !completedTypes.has("storehouse")
        ? ["storehouse"]
        : (publicWorksAuthorized || hasFarmBusiness) && food < context.citizens.length * 2 && !completedTypes.has("farm")
          ? ["farm"]
          : (publicWorksAuthorized || hasTimberBusiness) && !completedTypes.has("lumbermill") && availableTrees.length > 0
            ? ["lumbermill"]
            : (publicWorksAuthorized || hasMerchantBusiness) && context.economy?.policies.privateProperty && !completedTypes.has("stall")
              ? ["stall"]
              : publicWorksAuthorized && !completedTypes.has("hall")
                ? ["hall"]
                : [];
    for (const buildingType of recommended) {
      const businessKind = buildingType === "lumbermill" ? "woodcutter" : buildingType === "stall" ? "merchant" : buildingType === "farm" ? "farmer" : buildingType === "bakery" ? "baker" : buildingType === "smithy" ? "smith" : undefined;
      const commissioningBusiness = businessKind ? Object.values(context.economy?.businesses ?? {}).find((business) => business.kind === businessKind) : undefined;
      const owner: AssetOwner = commissioningBusiness
        ? { kind: "business", id: commissioningBusiness.id }
        : buildingType === "cottage" && context.economy?.policies.privateProperty
          ? { kind: "citizen", id: homeless[0].id }
          : { kind: "public", id: "settlement" };
      const definition = BUILDINGS[buildingType];
      const availableFunding = owner.kind === "citizen" ? context.economy?.wallets[owner.id] ?? 0
        : owner.kind === "business" ? context.economy?.businesses[owner.id]?.capital ?? 0
          : Number.POSITIVE_INFINITY;
      const funded = availableFunding >= definition.moneyCost;
      for (const site of (context.buildSites ?? []).filter((item) => item.buildingType === buildingType).slice(0, buildingType === "cottage" ? 3 : 1)) {
        const beneficiary = buildingType === "cottage" ? ` for ${homeless[0].name}` : owner.kind === "business" ? ` for ${commissioningBusiness?.name}` : "";
        const price = owner.kind === "public" ? "" : ` · ${definition.moneyCost} shells`;
        if (owner.kind === "public" && buildingType !== "cottage") {
          if (!formalGovernment) continue;
          const plan: PublicProjectPlan = { operation: "build", buildingType, position: { x: site.x, y: site.y }, budget: context.economy?.policies.currency ? definition.moneyCost : 0, required: { ...definition.required }, laborRequired: definition.laborRequired, label: `${definition.label} at ${site.x},${site.y}` };
          if (!hasExecutableMandate(plan)) results.push(candidate(`propose-${buildingType}-${site.x}-${site.y}`, `Put a ${definition.label} at ${site.x},${site.y} to a public vote`, { kind: "propose_public_project", plan }, !context.politics?.activeProposalId, context.politics?.activeProposalId ? "Another public vote is already active." : undefined));
          continue;
        }
        results.push(candidate(
          `start-${buildingType}-${site.x}-${site.y}`,
          `Plan a ${definition.label} at ${site.x},${site.y}${beneficiary}${price}`,
          { kind: "start_construction", buildingType, x: site.x, y: site.y, owner },
          funded,
          funded ? undefined : `${owner.kind === "business" ? "The business" : "The owner"} lacks the ${definition.moneyCost}-shell construction escrow.`,
        ));
      }
    }
    if (formalGovernment && !context.politics?.activeProposalId && !completedTypes.has("well")) {
      const site = (context.buildSites ?? []).find((item) => item.buildingType === "well");
      if (site) {
        const definition = BUILDINGS.well;
        const plan: PublicProjectPlan = { operation: "build", buildingType: "well", position: { x: site.x, y: site.y }, budget: context.economy?.policies.currency ? definition.moneyCost : 0, required: { ...definition.required }, laborRequired: definition.laborRequired, label: `well at ${site.x},${site.y}` };
        if (!hasExecutableMandate(plan)) results.push(candidate(`propose-well-${site.x}-${site.y}`, `Put a public well at ${site.x},${site.y} to a vote`, { kind: "propose_public_project", plan }));
      }
    }
    if (formalGovernment && !context.politics?.activeProposalId && !Object.keys(physical.roads).length) {
      const route = context.roadPlans?.[0]?.slice(0, 16);
      if (route?.length) {
        const required = { wood: 0, stone: Math.max(2, Math.ceil(route.length / 3)) };
        const laborRequired = Math.max(4, route.length);
        const budget = context.economy?.policies.currency ? Math.max(4, Math.ceil(route.length / 2)) : 0;
        const plan: PublicProjectPlan = { operation: "road", buildingType: "road", position: { ...route[0] }, route: route.map((point) => ({ ...point })), budget, required, laborRequired, label: `${route.length}-tile road` };
        if (!hasExecutableMandate(plan)) results.push(candidate(`propose-road-${route[0].x}-${route[0].y}-${route.length}`, `Put a ${route.length}-tile road to a public vote`, { kind: "propose_public_project", plan }));
      }
    }
  }

  if (citizen.job === "builder" || skillLevel(citizen, "construction") >= 0.2) {
    for (const building of Object.values(physical.buildings).filter((item) => item.condition < 0.75).sort((a, b) => a.condition - b.condition).slice(0, 2)) {
      const publicAsset = building.owner.kind === "public";
      const targetId = String(building.objectUid);
      const major = building.condition < 0.4;
      if (publicAsset && major && formalGovernment && !context.politics?.activeProposalId) {
        const plan: PublicProjectPlan = { operation: "repair", targetKind: "building", targetId, budget: 3, required: { wood: 1, stone: 1 }, laborRequired: 1, label: `${BUILDINGS[building.buildingType].label} #${building.objectUid}` };
        if (!hasExecutableMandate(plan)) results.push(candidate(`propose-repair-${targetId}`, `Put major repairs for ${plan.label} to a vote`, { kind: "propose_public_project", plan }));
      } else if (!publicAsset || !major) results.push(candidate(`repair-building-${targetId}`, `Repair ${BUILDINGS[building.buildingType].label} #${building.objectUid}`, { kind: "repair_structure", targetKind: "building", targetId }));
    }
    for (const road of Object.values(physical.roads).filter((item) => item.condition < 0.75).sort((a, b) => a.condition - b.condition).slice(0, 2)) {
      if (road.condition < 0.4 && formalGovernment && !context.politics?.activeProposalId) {
        const plan: PublicProjectPlan = { operation: "repair", targetKind: "road", targetId: road.id, budget: 2, required: { wood: 1, stone: 1 }, laborRequired: 1, label: `road at ${road.position.x},${road.position.y}` };
        if (!hasExecutableMandate(plan)) results.push(candidate(`propose-repair-${road.id}`, `Put major repairs for ${plan.label} to a vote`, { kind: "propose_public_project", plan }));
      } else if (road.condition >= 0.4) results.push(candidate(`repair-road-${road.id}`, `Repair road at ${road.position.x},${road.position.y}`, { kind: "repair_structure", targetKind: "road", targetId: road.id }));
    }
    for (const building of Object.values(physical.buildings).filter((item) => item.condition < 0.15 && item.residentIds.length === 0).sort((a, b) => a.condition - b.condition).slice(0, 1)) {
      if (building.owner.kind === "public") {
        if (formalGovernment && !context.politics?.activeProposalId) {
          const plan: PublicProjectPlan = { operation: "demolish", targetKind: "building", targetId: String(building.objectUid), budget: 2, required: { wood: 0, stone: 0 }, laborRequired: 3, label: `${BUILDINGS[building.buildingType].label} #${building.objectUid}` };
          if (!hasExecutableMandate(plan)) results.push(candidate(`propose-demolition-${building.objectUid}`, `Put demolition of ${plan.label} to a vote`, { kind: "propose_public_project", plan }));
        }
      } else {
        const owns = building.owner.kind === "citizen" && building.owner.id === citizen.id
          || building.owner.kind === "business" && context.economy?.businesses[building.owner.id]?.ownerId === citizen.id;
        if (owns) results.push(candidate(`demolish-building-${building.objectUid}`, `Demolish unsafe ${BUILDINGS[building.buildingType].label} #${building.objectUid}`, { kind: "demolish_structure", buildingObjectUid: building.objectUid }));
      }
    }
  }

  if (!citizen.homeObjectUid) {
    for (const building of Object.values(physical.buildings)
      .filter((item) => (item.buildingType === "cottage" || item.buildingType === "shelter") && item.residentIds.length < item.capacity)
      .sort((a, b) => a.objectUid - b.objectUid).slice(0, 2)) {
      results.push(candidate(
        `move-home-${building.objectUid}-${citizen.id}`,
        `Move into ${BUILDINGS[building.buildingType].label} #${building.objectUid}`,
        { kind: "move_home", buildingObjectUid: building.objectUid },
      ));
    }
  }
  return results;
}

export function constructionSummary(physical: PhysicalWorldState) {
  const projects = Object.values(physical.projects).filter((project) => project.status !== "cancelled");
  if (!projects.length) return 0;
  return projects.reduce((total, project) => total + projectProgress(project), 0) / projects.length;
}

export function findBuildSites(snapshot: Pick<SimulationSnapshot, "topology" | "physicalWorld">, buildingType: BuildingType, limit = 3) {
  const definition = BUILDINGS[buildingType];
  const { topology } = snapshot;
  const centers = topology.locations.plaza?.length ? topology.locations.plaza : [{ x: Math.floor(topology.width / 2), y: Math.floor(topology.height / 2) }];
  const occupied = new Set<string>();
  for (const resource of Object.values(snapshot.physicalWorld.resources)) {
    if (resource.status === "available" || resource.kind === "crop") occupied.add(`${resource.position.x},${resource.position.y}`);
  }
  for (const project of Object.values(snapshot.physicalWorld.projects)) {
    if (project.status === "cancelled" || project.demolishedAtTick !== undefined) continue;
    for (let dy = 0; dy < project.footprint.height; dy += 1) for (let dx = 0; dx < project.footprint.width; dx += 1) occupied.add(`${project.position.x + dx},${project.position.y + dy}`);
  }
  const candidates: Array<{ buildingType: BuildingType; x: number; y: number; score: number }> = [];
  for (let y = 1; y < topology.height - definition.footprint.height; y += 1) {
    for (let x = 1; x < topology.width - definition.footprint.width; x += 1) {
      let valid = true;
      for (let dy = 0; dy < definition.footprint.height && valid; dy += 1) for (let dx = 0; dx < definition.footprint.width; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (!topology.walkable[py * topology.width + px] || occupied.has(`${px},${py}`)) valid = false;
      }
      const work = { x: x + Math.floor(definition.footprint.width / 2), y: y + definition.footprint.height };
      if (!valid || work.y >= topology.height || !topology.walkable[work.y * topology.width + work.x]) continue;
      const centerDistance = Math.min(...centers.map((center) => distance(center, work)));
      const candidate = { buildingType, x, y, score: centerDistance * 10 + y * 0.01 + x * 0.0001 };
      // A world can expose thousands of legal tiles, but callers only need a
      // handful of the best ones. Keep that bounded set ordered while scanning
      // instead of allocating and sorting every legal tile each simulation tick.
      const insertionIndex = candidates.findIndex((item) => candidate.score < item.score);
      if (insertionIndex >= 0) {
        candidates.splice(insertionIndex, 0, candidate);
        if (candidates.length > limit) candidates.pop();
      } else if (candidates.length < limit) {
        candidates.push(candidate);
      }
    }
  }
  return candidates.map(({ score: _score, ...site }) => site);
}

export function assertPhysicalWorldInvariants(physical: PhysicalWorldState, citizens?: Array<{ id: number; homeObjectUid?: number }>, economy?: EconomyState) {
  const objectIds = new Set<number>();
  for (const [id, node] of Object.entries(physical.resources)) {
    if (id !== node.id) throw new Error(`Physical resource key ${id} does not match its identity ${node.id}.`);
    if (node.objectUid < 1 || objectIds.has(node.objectUid)) throw new Error(`Physical resource object ${node.objectUid} is duplicated or invalid.`);
    objectIds.add(node.objectUid);
    if (node.objectUid >= physical.nextObjectUid) throw new Error(`Physical resource ${node.id} exceeds the physical object allocator.`);
    if (!Object.values(node.yield).every((amount) => Number.isFinite(amount) && amount >= 0)) throw new Error(`Physical resource ${node.id} has invalid yield.`);
    if (node.kind === "crop" && node.status === "depleted" && !node.cropStage && node.regrowAtTick === undefined) throw new Error(`Crop ${node.id} has neither lifecycle stage nor next ripening tick.`);
  }
  for (const [id, stock] of Object.entries(physical.renewableStocks)) {
    if (id !== stock.id || stock.amount < 0 || stock.amount > stock.capacity || stock.capacity <= 0 || stock.regenerationPerTick < 0) throw new Error(`Renewable stock ${id} is invalid.`);
  }
  for (const [id, project] of Object.entries(physical.projects)) {
    if (id !== project.id || id !== `project:${project.objectUid}`) throw new Error(`Construction project key ${id} does not match its object identity.`);
    if (project.objectUid < 1 || objectIds.has(project.objectUid)) throw new Error(`Construction object ${project.objectUid} is duplicated or invalid.`);
    objectIds.add(project.objectUid);
    if (project.objectUid >= physical.nextObjectUid) throw new Error(`Construction project ${project.id} exceeds the physical object allocator.`);
    for (const [resource, required] of Object.entries(project.required)) {
      const delivered = project.delivered[resource] ?? 0;
      if (required < 0 || delivered < 0 || delivered > required) throw new Error(`Construction project ${project.id} has invalid ${resource} totals.`);
    }
    if (project.laborCompleted < 0 || project.laborCompleted > project.laborRequired) throw new Error(`Construction project ${project.id} has invalid labor totals.`);
    if (project.status === "complete" && project.buildingType !== "road" && !project.demolishedAtTick && !physical.buildings[String(project.objectUid)]) throw new Error(`Completed project ${project.id} has no operational building.`);
    if (project.status === "complete" && project.buildingType === "road" && !Object.values(physical.roads).some((road) => road.projectId === project.id)) throw new Error(`Completed road project ${project.id} has no road segments.`);
    if (project.escrowId && !physical.escrows[project.escrowId]) throw new Error(`Project ${project.id} references missing escrow ${project.escrowId}.`);
  }
  for (const [id, road] of Object.entries(physical.roads)) {
    if (id !== road.id || road.condition < 0 || road.condition > 1) throw new Error(`Road ${id} is invalid.`);
    if (!physical.projects[road.projectId] || physical.projects[road.projectId].buildingType !== "road") throw new Error(`Road ${id} has no completed road project.`);
  }
  for (const [id, escrow] of Object.entries(physical.escrows)) {
    if (id !== escrow.id || escrow.deposited < 0 || escrow.balance < 0 || escrow.spent < 0 || escrow.refunded < 0) throw new Error(`Escrow ${id} is invalid.`);
    if (Math.abs(escrow.deposited - escrow.balance - escrow.spent - escrow.refunded) > 0.0001) throw new Error(`Escrow ${id} does not conserve money.`);
    if (!physical.projects[escrow.projectId]) throw new Error(`Escrow ${id} references missing project.`);
  }
  for (const lot of Object.values(physical.foodLots)) {
    if (lot.amount <= 0 || lot.expiresAtTick <= lot.producedAtTick) throw new Error(`Food lot ${lot.id} is invalid.`);
  }
  for (const demolition of Object.values(physical.demolitions)) {
    if (physical.buildings[String(demolition.buildingObjectUid)]) throw new Error(`Demolished building ${demolition.buildingObjectUid} is still operational.`);
    if (Object.values(demolition.salvaged).some((amount) => amount < 0 || !Number.isFinite(amount))) throw new Error(`Demolition ${demolition.id} has invalid salvage.`);
  }
  for (const [nodeId, claim] of Object.entries(physical.claims)) {
    if (nodeId !== claim.nodeId || !physical.resources[nodeId]) throw new Error(`Resource claim ${nodeId} references a missing resource.`);
    if (claim.strength < 0 || claim.strength > 1 || !Number.isFinite(claim.strength)) throw new Error(`Resource claim ${nodeId} has invalid strength.`);
    if (new Set(claim.challengedByIds).size !== claim.challengedByIds.length) throw new Error(`Resource claim ${nodeId} contains duplicate challengers.`);
  }
  for (const [id, building] of Object.entries(physical.buildings)) {
    if (id !== String(building.objectUid)) throw new Error(`Building key ${id} does not match object ${building.objectUid}.`);
    const project = physical.projects[`project:${building.objectUid}`];
    if (objectIds.has(building.objectUid) && !project) throw new Error(`Building object ${building.objectUid} collides with another physical object.`);
    if (!objectIds.has(building.objectUid)) objectIds.add(building.objectUid);
    if (project && project.status !== "complete") throw new Error(`Building ${building.objectUid} exists before its project is complete.`);
    if (building.residentIds.length > building.capacity) throw new Error(`Building ${building.objectUid} exceeds resident capacity.`);
    if (building.objectUid >= physical.nextObjectUid) throw new Error(`Building ${building.objectUid} exceeds the physical object allocator.`);
    if (building.fuel !== undefined && (!Number.isFinite(building.fuel) || building.fuel < 0)) throw new Error(`Building ${building.objectUid} has invalid fuel.`);
  }
  if (citizens) {
    const homes = new Set(Object.values(physical.buildings).map((building) => building.objectUid));
    const citizensById = new Map(citizens.map((citizen) => [citizen.id, citizen]));
    for (const citizen of citizens) {
      if (citizen.homeObjectUid !== undefined && !homes.has(citizen.homeObjectUid)) throw new Error(`Citizen ${citizen.id} references a missing home.`);
      if (citizen.homeObjectUid !== undefined && !physical.buildings[String(citizen.homeObjectUid)]?.residentIds.includes(citizen.id)) throw new Error(`Citizen ${citizen.id} is not listed by their home.`);
    }
    for (const building of Object.values(physical.buildings)) for (const residentId of building.residentIds) {
      if (citizensById.get(residentId)?.homeObjectUid !== building.objectUid) throw new Error(`Building ${building.objectUid} contains an inconsistent resident.`);
    }
    const validateOwner = (owner: AssetOwner, label: string) => {
      if (owner.kind === "citizen" && !citizensById.has(owner.id)) throw new Error(`${label} references missing citizen owner ${owner.id}.`);
      if (owner.kind === "business" && economy && !economy.businesses[owner.id]) throw new Error(`${label} references missing business owner ${owner.id}.`);
    };
    for (const project of Object.values(physical.projects)) validateOwner(project.owner, `Project ${project.id}`);
    for (const building of Object.values(physical.buildings)) validateOwner(building.owner, `Building ${building.objectUid}`);
    for (const claim of Object.values(physical.claims)) {
      if (!citizensById.has(claim.ownerId)) throw new Error(`Resource claim ${claim.nodeId} references missing citizen owner ${claim.ownerId}.`);
      if (claim.challengedByIds.some((id) => !citizensById.has(id))) throw new Error(`Resource claim ${claim.nodeId} references a missing challenger.`);
    }
    if (economy) {
      for (const building of Object.values(physical.buildings)) {
        if (building.operatorBusinessId && !economy.businesses[building.operatorBusinessId]) throw new Error(`Building ${building.objectUid} references missing operator ${building.operatorBusinessId}.`);
      }
      for (const business of Object.values(economy.businesses)) for (const uid of business.facilityObjectUids) {
        const building = physical.buildings[String(uid)];
        if (!building || building.operatorBusinessId !== business.id && !(building.owner.kind === "business" && building.owner.id === business.id)) throw new Error(`Business ${business.id} references unavailable facility ${uid}.`);
      }
    }
  }
}

export function physicalIntentBlockReason(intent: ActionIntent, context: DecisionContext) {
  const physical = context.physicalWorld;
  if (!physical) return "Physical world state is unavailable.";
  switch (intent.kind) {
    case "craft_primitive": {
      const recipe = PRIMITIVE_RECIPES[intent.recipeId];
      if (!recipe) return "The primitive recipe is unknown.";
      const missing = Object.entries(recipe.inputs).filter(([resource, amount]) => (context.citizen.inventory[resource] ?? 0) < amount);
      if (missing.length) return `Crafting requires ${missing.map(([resource, amount]) => `${amount} ${resource}`).join(", ")}.`;
      if (recipe.requiresCampfire && !Object.values(physical.buildings).some((building) => building.buildingType === "campfire" && building.condition >= 0.15 && distance(building.position, context.citizen.position) <= 8)) return "The clay vessel requires a nearby working campfire.";
      return undefined;
    }
    case "gather_clay":
      if (!context.waterSources?.length) return "No reachable shore contains workable clay.";
      return (physical.renewableStocks.clay?.amount ?? 0) >= 1 ? undefined : "The nearby clay bank is exhausted.";
    case "drink_natural_water":
      if (!context.waterSources?.length) return "No reachable natural water source is available.";
      return (physical.renewableStocks.water?.amount ?? 0) >= 1 ? undefined : "The local water source is depleted.";
    case "catch_fish":
      if (!context.waterSources?.length) return "No reachable fishing water is available.";
      return (physical.renewableStocks.fish?.amount ?? 0) >= 1 ? undefined : "The fish population is depleted.";
    case "hunt_game":
      if ((context.citizen.inventory.spear ?? 0) < 1) return "Hunting requires a crafted spear.";
      return (physical.renewableStocks.game?.amount ?? 0) >= 1 ? undefined : "The local game population is depleted.";
    case "use_medicine":
      if ((context.citizen.inventory.basic_medicine ?? 0) < 1) return "No basic medicine remains.";
      if ((context.citizen.physical?.illness ?? 0) <= 0.08 && (context.citizen.physical?.injury ?? 0) <= 0.08) return "There is no significant illness or injury to treat.";
      return undefined;
    case "fuel_campfire": {
      const building = physical.buildings[String(intent.buildingObjectUid)];
      if (!building || building.buildingType !== "campfire" || building.condition < 0.15) return "That campfire is not usable.";
      return (context.citizen.inventory.branches ?? 0) >= 1 ? undefined : "Fueling the fire requires one carried branch.";
    }
    case "cook_food": {
      const building = physical.buildings[String(intent.buildingObjectUid)];
      if (!building || building.buildingType !== "campfire" || building.condition < 0.15 || (building.fuel ?? 0) <= 0) return "Cooking requires a nearby burning campfire.";
      return (context.citizen.inventory[intent.resource] ?? 0) >= 1 ? undefined : "The selected raw food is no longer carried.";
    }
    case "boil_water": {
      const building = physical.buildings[String(intent.buildingObjectUid)];
      if (!building || building.buildingType !== "campfire" || building.condition < 0.15 || (building.fuel ?? 0) <= 0) return "Boiling water requires a nearby burning campfire.";
      return (context.citizen.inventory.water ?? 0) >= 1 ? undefined : "No unsafe carried water remains to boil.";
    }
    case "explore":
      return undefined;
    case "fell_tree": {
      const node = physical.resources[intent.nodeId];
      if (!node || node.kind !== "tree" || node.status !== "available") return "The selected tree is no longer available.";
      const legacyProfessional = context.citizen.job === "woodcutter" && !context.citizen.knowledge?.learnedTechniques.includes("craft_hand_axe");
      if (!legacyProfessional && (context.citizen.inventory.hand_axe ?? 0) < 1) return "Felling a tree requires a usable hand axe.";
      if (context.politics?.laws["conservation-code"] && Object.values(physical.resources).filter((item) => item.kind === "tree" && item.status === "available").length <= 8) return "The conservation code protects the settlement's last trees.";
      return undefined;
    }
    case "quarry_stone": {
      const node = physical.resources[intent.nodeId];
      if (!node || node.kind !== "stone" || node.status !== "available") return "The selected rock is no longer available.";
      const legacyProfessional = context.citizen.job === "miner" && !context.citizen.knowledge?.learnedTechniques.includes("craft_stone_pick");
      if (!legacyProfessional && (context.citizen.inventory.stone_pick ?? 0) < 1) return "Quarrying requires a usable stone pick.";
      return undefined;
    }
    case "harvest_crop": {
      const node = physical.resources[intent.nodeId];
      if (!node || node.kind !== "crop" || node.status !== "available") return "The selected crop plot is not ripe.";
      if (context.citizen.job !== "farmer" && context.citizen.job !== "unassigned") return "Only a practiced farmer or an unaffiliated grower may harvest this crop plot.";
      return undefined;
    }
    case "sow_crop": {
      const node = physical.resources[intent.nodeId];
      if (!node || node.kind !== "crop" || !["fallow", "withered"].includes(node.cropStage ?? "")) return "The selected plot is not ready for sowing.";
      if (context.citizen.job !== "farmer" && context.citizen.job !== "unassigned") return "Only a practiced farmer or an unaffiliated grower may sow this crop plot.";
      const seedResource = `${intent.cropType}_seed`;
      if ((context.citizen.inventory[seedResource] ?? 0) + (context.stock[seedResource] ?? 0) + (context.citizen.inventory[intent.cropType] ?? 0) + (context.stock[intent.cropType] ?? 0) < 1) return `Sowing requires one conserved ${intent.cropType} seed.`;
      return undefined;
    }
    case "tend_crop": {
      const node = physical.resources[intent.nodeId];
      if (!node || node.kind !== "crop" || !["sown", "growing"].includes(node.cropStage ?? "")) return "The selected crop does not need tending.";
      if (context.citizen.job !== "farmer" && context.citizen.job !== "unassigned") return "Only a practiced farmer or an unaffiliated grower may tend this crop plot.";
      return undefined;
    }
    case "collect_water":
      if (!context.waterSources?.length) return "No reachable natural water source is available.";
      if ((context.citizen.inventory.water_container ?? 0) < 1) return "Carrying water requires a crafted container.";
      return (physical.renewableStocks.water?.amount ?? 0) >= 1 ? undefined : "The local water table is temporarily depleted.";
    case "draw_water": {
      const building = physical.buildings[String(intent.buildingObjectUid)];
      if (building?.buildingType !== "well" || building.condition < 0.15) return "That well is not operational.";
      if ((context.citizen.inventory.water_container ?? 0) < 1) return "Carrying water requires a crafted container.";
      return (physical.renewableStocks.water?.amount ?? 0) >= 2 ? undefined : "The local water table cannot currently supply two water.";
    }
    case "drink_water":
      return (context.citizen.inventory.clean_water ?? 0) + (context.citizen.inventory.water ?? 0) + (context.stock.water ?? 0) > 0 ? undefined : "Neither this citizen nor the common stores have water.";
    case "propose_public_project": {
      if (context.politics?.institutionStage !== "formal") return "No public decision institution exists yet.";
      if (context.politics?.activeProposalId) return "Another public proposal is already active.";
      if (!intent.plan.label || intent.plan.budget < 0 || intent.plan.laborRequired < 1) return "The public plan is incomplete.";
      if (intent.plan.operation === "build") {
        if (!intent.plan.buildingType || !intent.plan.position || !(context.buildSites ?? []).some((site) => site.buildingType === intent.plan.buildingType && site.x === intent.plan.position!.x && site.y === intent.plan.position!.y)) return "The proposed building site is no longer valid.";
      }
      if (intent.plan.operation === "road") {
        const routeKey = JSON.stringify(intent.plan.route ?? []);
        if (!(context.roadPlans ?? []).some((route) => JSON.stringify(route.slice(0, 16)) === routeKey)) return "The proposed road route is no longer valid.";
      }
      if (intent.plan.operation === "repair") {
        const target = intent.plan.targetKind === "building" ? physical.buildings[intent.plan.targetId ?? ""] : physical.roads[intent.plan.targetId ?? ""];
        if (!target || target.condition >= 0.4) return "That target no longer needs a major public repair vote.";
      }
      if (intent.plan.operation === "demolish") {
        const building = physical.buildings[intent.plan.targetId ?? ""];
        if (!building || building.owner.kind !== "public" || building.residentIds.length) return "That public building is not eligible for demolition.";
      }
      return undefined;
    }
    case "start_construction": {
      const primitive = ["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot"].includes(intent.buildingType);
      if (!primitive && context.citizen.job !== "builder" && skillLevel(context.citizen, "construction") < 0.2) return "Establishing a construction site requires basic construction skill.";
      if (intent.buildingType !== "road" && !(context.buildSites ?? []).some((site) => site.buildingType === intent.buildingType && site.x === intent.x && site.y === intent.y)) return "The selected construction site is no longer valid.";
      if (intent.owner.kind === "public" && intent.buildingType !== "cottage") {
        if (context.politics?.institutionStage !== "formal") return "No public institution exists to own this project.";
        const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
        if (!mandate || mandate.status !== "authorized" || mandate.expiresAtTick < context.tick) return "This exact public project has no active majority mandate.";
        if (mandate.plan.buildingType !== intent.buildingType || mandate.plan.position?.x !== intent.x || mandate.plan.position?.y !== intent.y) return "The construction request differs from the approved public plan.";
        if ((context.economy?.treasury ?? 0) < mandate.plan.budget) return "The treasury cannot fund the approved project escrow.";
      }
      if (intent.owner.kind === "citizen") {
        if (!primitive && !context.economy?.policies.privateProperty) return "Private construction requires adopted property rights.";
        if (!context.citizens.some((citizen) => citizen.id === intent.owner.id)) return "The intended private owner no longer exists.";
        if (!primitive && intent.buildingType !== "cottage") return "Citizens may directly commission cottages; productive buildings must belong to a registered business.";
      }
      if (intent.owner.kind === "business") {
        if (!context.economy?.policies.privateProperty) return "Business construction requires adopted property rights.";
        const business = context.economy.businesses[intent.owner.id];
        if (!business) return "The commissioning business no longer exists.";
        const compatible = intent.buildingType === "lumbermill" ? business.kind === "woodcutter"
          : intent.buildingType === "stall" ? business.kind === "merchant"
            : intent.buildingType === "farm" ? business.kind === "farmer"
              : intent.buildingType === "bakery" ? business.kind === "baker" || business.kind === "innkeeper"
                : intent.buildingType === "smithy" ? business.kind === "smith"
                  : intent.buildingType === "workshop" ? business.kind === "builder" || business.kind === "carpenter"
                    : intent.buildingType === "fishery" ? business.kind === "fisher"
                      : false;
        if (!compatible) return "That business is not licensed for this building type.";
      }
      const moneyCost = BUILDINGS[intent.buildingType].moneyCost;
      if (intent.owner.kind === "citizen" && (context.economy?.wallets[intent.owner.id] ?? 0) < moneyCost) return `The private owner cannot fund the ${moneyCost}-shell construction escrow.`;
      if (intent.owner.kind === "business" && (context.economy?.businesses[intent.owner.id]?.capital ?? 0) < moneyCost) return `The business cannot fund the ${moneyCost}-shell construction escrow.`;
      return undefined;
    }
    case "deliver_material": {
      const project = physical.projects[intent.projectId];
      if (!project || project.status === "complete" || project.status === "cancelled") return "The construction project is no longer accepting materials.";
      const missing = (project.required[intent.resource] ?? 0) - (project.delivered[intent.resource] ?? 0);
      const available = intent.source === "inventory" ? context.citizen.inventory[intent.resource] ?? 0 : context.stock[intent.resource] ?? 0;
      return intent.amount > 0 && intent.amount <= missing && intent.amount <= available ? undefined : "The promised construction material is no longer available or needed.";
    }
    case "work_construction": {
      const project = physical.projects[intent.projectId];
      if (!project || project.status === "complete" || project.status === "cancelled") return "The construction project is no longer active.";
      if (!["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot"].includes(project.buildingType) && context.citizen.job !== "builder" && skillLevel(context.citizen, "construction") < 0.1) return "Construction labor requires basic skill or apprenticeship.";
      if (!Object.entries(project.required).every(([resource, amount]) => (project.delivered[resource] ?? 0) >= amount)) return "The project is still waiting for materials.";
      return undefined;
    }
    case "cancel_project": {
      const project = physical.projects[intent.projectId];
      if (!project || project.status === "complete" || project.status === "cancelled") return "That project cannot be cancelled.";
      const owner = project.owner;
      const authorized = owner.kind === "citizen" && owner.id === context.citizen.id
        || owner.kind === "business" && context.economy?.businesses[owner.id]?.ownerId === context.citizen.id;
      return authorized ? undefined : "Only the private payer may cancel this project directly.";
    }
    case "repair_structure": {
      if (context.citizen.job !== "builder" && skillLevel(context.citizen, "construction") < 0.2) return "Structural repairs require construction skill.";
      if (intent.targetKind === "building") {
        const building = physical.buildings[intent.targetId];
        if (!building || building.condition >= 1) return "That building does not need repairs.";
        if (building.owner.kind === "public" && building.condition < 0.4) {
          const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
          if (!mandate || mandate.status !== "authorized" || mandate.plan.operation !== "repair" || mandate.plan.targetKind !== "building" || mandate.plan.targetId !== intent.targetId) return "Major public repairs require a majority mandate for this exact building.";
        }
      } else {
        const road = physical.roads[intent.targetId];
        if (!road || road.condition >= 1) return "That road segment does not need repairs.";
        if (road.condition < 0.4) {
          const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
          if (!mandate || mandate.status !== "authorized" || mandate.plan.operation !== "repair" || mandate.plan.targetKind !== "road" || mandate.plan.targetId !== intent.targetId) return "Major road repairs require a majority mandate for this exact segment.";
        }
      }
      const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
      const required = mandate?.plan.required ?? { wood: 1, stone: 1 };
      if (Object.entries(required).some(([resource, amount]) => (context.stock[resource] ?? 0) < amount)) return `Repairs require ${Object.entries(required).map(([resource, amount]) => `${amount} shared ${resource}`).join(" and ")}.`;
      if (mandate && (context.economy?.treasury ?? 0) < mandate.plan.budget) return "The treasury no longer holds the approved repair budget.";
      return undefined;
    }
    case "demolish_structure": {
      const building = physical.buildings[String(intent.buildingObjectUid)];
      if (!building) return "That building no longer exists.";
      if (building.residentIds.length) return "Residents must leave before demolition.";
      if (building.owner.kind === "public") {
        const mandate = intent.mandateId ? physical.mandates[intent.mandateId] : undefined;
        if (!mandate || mandate.status !== "authorized" || mandate.plan.operation !== "demolish" || mandate.plan.targetId !== String(building.objectUid)) return "Public demolition requires a majority mandate for this exact building.";
      }
      return context.citizen.job === "builder" || skillLevel(context.citizen, "construction") >= 0.2 ? undefined : "Demolition requires construction skill.";
    }
    case "move_home": {
      const building = physical.buildings[String(intent.buildingObjectUid)];
      if (context.citizen.homeObjectUid) return "This citizen already has a home.";
      if (!building || !["cottage", "shelter"].includes(building.buildingType) || building.residentIds.length >= building.capacity) return "The selected dwelling is no longer available.";
      return undefined;
    }
    default:
      return undefined;
  }
}
