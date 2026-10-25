import { createSeededRandom, hashSeed } from "./random";
import type { ActionCandidate, ActionIntent, DecisionProvider, DecisionRequest, ProviderDecision } from "./types";

export const MOCK_PROVIDER = {
  kind: "mock",
  id: "mock-heuristic",
  label: "Mock heuristic provider",
  version: "1",
} as const;

export class MockDecisionProvider implements DecisionProvider {
  readonly descriptor = MOCK_PROVIDER;

  constructor(private readonly seed: number) {}

  async decide(request: DecisionRequest, signal: AbortSignal): Promise<ProviderDecision> {
    if (signal.aborted) throw new DOMException("Decision request was aborted.", "AbortError");
    const { perception } = request;
    const { citizen, stock, tick } = perception;
    const rng = createSeededRandom(hashSeed(this.seed, tick, citizen.id));
    const food = (stock.berries ?? 0) + (stock.meat ?? 0) + (stock.bread ?? 0) + (stock.fish ?? 0) + (stock.wheat ?? 0);
    const builder = citizen.job === "builder";
    const foodWorker = citizen.job === "farmer" || citizen.job === "fisher" || citizen.job === "baker";
    const diligent = citizen.traits.includes("Diligent") ? 0.14 : 0;
    const sociable = citizen.traits.includes("Sociable") ? 0.18 : 0;
    const patient = citizen.traits.includes("Patient") ? 0.08 : 0;
    const bold = citizen.traits.includes("Bold") ? 0.14 : 0;
    const curious = citizen.traits.includes("Curious") ? 0.1 : 0;
    const frugal = citizen.traits.includes("Frugal") ? 0.12 : 0;
    const goalAlignment = perception.civilizationGoal?.id === "market-economy"
      ? perception.civilizationGoal.stage === "founding" ? 0.65 : 0.26
      : citizen.goal.toLowerCase().includes("shared objective") || citizen.goal.toLowerCase().includes("market")
        ? 0.18
        : 0;
    const jitter = () => Number((rng() * 0.06).toFixed(3));
    const base = Object.fromEntries(request.candidates.map((candidate) => [candidate.id, candidate])) as Record<ActionCandidate["id"], ActionCandidate>;
    const evaluated = (id: ActionCandidate["id"], entries: Array<[string, number]>): ActionCandidate | undefined => {
      const option = base[id];
      if (!option) return undefined;
      return {
        ...option,
        score: option.legal ? entries.reduce((total, [, value]) => total + value, 0) : null,
        trace: entries.map(([rule, contribution]) => ({ rule, contribution })),
      };
    };

    const coreCandidates = [
      evaluated("eat", [["base utility", 0.08], ["hunger urgency", citizen.needs.hunger * 1.35], ["seeded tie-break", jitter()]]),
      evaluated("rest", [["base utility", 0.12], ["fatigue urgency", citizen.needs.fatigue * 1.15], ["exposed rest penalty", perception.physicalWorld?.homeObjectUid || (perception.physicalWorld?.nearbyFireFuel ?? 0) > 0 ? 0 : -(citizen.physical?.exposure ?? 0) * 0.65], ["patient trait", patient], ["seeded tie-break", jitter()]]),
      evaluated("gather_food", [["base utility", 0.2], ["settlement food pressure", food < perception.population * 2 ? 0.5 : 0.05], ["occupation affinity", foodWorker ? 0.42 : 0], ["diligent trait", diligent], ["seeded tie-break", jitter()]]),
      evaluated("work_job", [["base utility", 0.24], ["occupation responsibility", 0.32], ["diligent trait", diligent], ["fatigue penalty", -citizen.needs.fatigue * 0.32], ["seeded tie-break", jitter()]]),
      evaluated("socialize", [["base utility", 0.12], ["loneliness urgency", citizen.needs.loneliness * 0.9], ["sociable trait", sociable], ["seeded tie-break", jitter()]]),
      evaluated("construct", [["base utility", 0.18], ["builder occupation", builder ? 0.58 : 0], ["unfinished settlement project", perception.constructionProgress < 1 ? 0.26 : -0.3], ["diligent trait", diligent], ["seeded tie-break", jitter()]]),
      evaluated("idle", [["base utility", 0.1], ["low-pressure bonus", Math.max(0, 0.2 - citizen.needs.hunger - citizen.needs.fatigue)], ["seeded tie-break", jitter()]]),
    ].filter((candidate): candidate is ActionCandidate => Boolean(candidate));
    const economicCandidates = request.candidates.filter((candidate) => candidate.intent && !["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"].includes(candidate.id)).map((candidate) => {
      const intent = candidate.intent!;
      const kind = intent.kind;
      const foodPurchase = kind === "buy_good" && /\b(wheat|fish|bread)\b/i.test(candidate.label);
      const entries: Array<[string, number]> = [["base utility", 0.16], ["society goal alignment", goalAlignment], ["seeded tie-break", jitter()]];
      if (kind === "propose_market_charter") entries.push(["institutional initiative", 0.34 + bold + curious]);
      if (kind === "support_market_charter") entries.push(["charter support", 0.4 + (citizen.job === "merchant" ? 0.22 : 0) + curious]);
      if (kind === "oppose_market_charter") entries.push(["institutional caution", 0.2 + patient * 3 + frugal * 2]);
      if (kind === "register_business") entries.push(["enterprise opportunity", 0.42 + bold + (citizen.job === "merchant" ? 0.2 : 0)]);
      if (kind === "list_good") {
        const prices = request.candidates.flatMap((option) => option.intent?.kind === "list_good" && option.intent.resource === intent.resource ? [option.intent.unitPrice] : []);
        const low = Math.min(...prices);
        const high = Math.max(...prices);
        const premiumPosition = high === low ? 0.5 : (intent.unitPrice - low) / (high - low);
        entries.push(["owned surplus", 0.42], ["frugal premium preference", frugal * premiumPosition], ["sociable quick-sale preference", sociable * (1 - premiumPosition)]);
      }
      if (kind === "buy_good") {
        const askingPrice = Number(candidate.label.match(/for (\d+) shells/i)?.[1] ?? 0);
        const buyPrices = request.candidates.flatMap((option) => option.intent?.kind === "buy_good" ? [Number(option.label.match(/for (\d+) shells/i)?.[1] ?? 0)] : []).filter((price) => price > 0);
        const low = Math.min(...buyPrices);
        const high = Math.max(...buyPrices);
        const pricePosition = high === low ? 0.5 : (askingPrice - low) / (high - low);
        entries.push(
          ["purchase need", foodPurchase ? citizen.needs.hunger * 0.85 : 0.22],
          ["wallet available", (perception.economy?.wallet ?? 0) > 0 ? 0.08 : -0.5],
          ["lower asking price", (0.08 + frugal) * (1 - pricePosition)],
        );
      }
      if (kind === "invest_business") entries.push(["capital formation", 0.32 + bold - frugal * 0.5]);
      if (kind === "offer_job") entries.push(["business expansion", 0.3 + sociable]);
      if (kind === "accept_job") entries.push(["income opportunity", 0.42 + diligent]);
      if (kind === "adopt_commitment") entries.push(["persistent personal direction", citizen.commitment?.status === "active" ? -1 : 0.38 + curious]);
      if (kind === "change_occupation") entries.push(["respond to a settlement labor shortage", 0.52 + curious + bold]);
      if (kind === "train_skill") entries.push(["build real capability", 0.42 + diligent + patient]);
      if (kind === "lease_facility") entries.push(["unlock physical production", 0.98 + bold]);
      if (kind === "transfer_good") entries.push(["supply a committed production chain", 0.78 + diligent]);
      if (kind === "operate_recipe") entries.push(["convert conserved inputs into useful output", 1.02 + diligent], ["honor active commitment", citizen.commitment?.status === "active" ? 0.18 : 0]);
      if (kind === "forage_wild_food") entries.push(["immediate food survival", citizen.needs.hunger * 1.18], ["known edible resource", 0.32], ["foraging experience", (citizen.skills?.foraging?.level ?? 0) * 0.18]);
      if (kind === "gather_branches") entries.push(["primitive fire and shelter material", 0.46], ["empty-handed usefulness", (citizen.inventory.branches ?? 0) < 4 ? 0.24 : -0.18], ["unfueled fire urgency", (perception.physicalWorld?.nearbyFireFuel ?? 0) <= 0 ? (citizen.physical?.exposure ?? 0) * 0.72 : 0], ["industriousness", (citizen.personality?.industriousness ?? 0.5) * 0.12]);
      if (kind === "gather_loose_stone") entries.push(["primitive tool and hearth material", 0.42], ["empty-handed usefulness", (citizen.inventory.stone ?? 0) < 3 ? 0.22 : -0.16], ["industriousness", (citizen.personality?.industriousness ?? 0.5) * 0.1]);
      if (kind === "gather_fiber") entries.push(["shelter and clothing material", 0.38], ["exposure pressure", (citizen.physical?.exposure ?? 0) * 0.34], ["material shortage", (citizen.inventory.fiber ?? 0) < 3 ? 0.2 : -0.12]);
      if (kind === "craft_hand_axe" || kind === "craft_stone_pick") entries.push(["unlock physical work", 0.54], ["curiosity", (citizen.personality?.curiosity ?? 0.5) * 0.1]);
      if (kind === "fell_tree") entries.push(["woodcutter experience", citizen.job === "woodcutter" ? 0.48 : (citizen.skills?.logging?.level ?? 0) * 0.28], ["physical material production", 0.34 + diligent]);
      if (kind === "quarry_stone") entries.push(["miner experience", citizen.job === "miner" ? 0.48 : (citizen.skills?.mining?.level ?? 0) * 0.28], ["physical material production", 0.34 + diligent]);
      if (kind === "harvest_crop") entries.push(["farming experience", citizen.job === "farmer" ? 0.5 : (citizen.skills?.farming?.level ?? 0) * 0.34], ["food pressure", food < perception.population * 2 ? 0.72 : 0.18], ["physical harvest", 0.34 + diligent]);
      if (kind === "sow_crop") entries.push(["farming experience", citizen.job === "farmer" ? 0.46 : (citizen.skills?.farming?.level ?? 0) * 0.3], ["future food supply", 0.62 + diligent], ["hunger makes renewal urgent", citizen.needs.hunger * 0.32]);
      if (kind === "tend_crop") entries.push(["farming experience", citizen.job === "farmer" ? 0.46 : (citizen.skills?.farming?.level ?? 0) * 0.3], ["protect growing crop", 0.66 + diligent], ["hunger makes renewal urgent", citizen.needs.hunger * 0.24]);
      if (kind === "collect_water") entries.push(["thirst survival", (citizen.needs.thirst ?? 0) * 1.45], ["slow untreated source", -0.08]);
      if (kind === "drink_natural_water") entries.push(["immediate thirst survival", (citizen.needs.thirst ?? 0) * 1.7], ["untreated illness risk", -0.12]);
      if (kind === "gather_clay") entries.push(["container material", (citizen.inventory.water_container ?? 0) > 0 ? -0.55 : 0.46], ["industriousness", (citizen.personality?.industriousness ?? 0.5) * 0.12]);
      if (kind === "craft_primitive") {
        const urgency = intent.recipeId === "water-container" ? (citizen.needs.thirst ?? 0) * 0.52
          : intent.recipeId === "simple-clothing" ? (citizen.physical?.exposure ?? 0) * 0.5
            : intent.recipeId === "basic-medicine" ? ((citizen.physical?.illness ?? 0) + (citizen.physical?.injury ?? 0)) * 0.4
              : intent.recipeId === "spear" || intent.recipeId === "fishing-tool" ? citizen.needs.hunger * 0.32 : 0.18;
        entries.push(["useful primitive capability", 0.28 + urgency], ["curiosity", (citizen.personality?.curiosity ?? 0.5) * 0.12]);
      }
      if (kind === "catch_fish") entries.push(["food pressure", citizen.needs.hunger * 0.9], ["renewable food", 0.24], ["proper tool", (citizen.inventory.fishing_tool ?? 0) > 0 ? 0.24 : -0.08]);
      if (kind === "hunt_game") entries.push(["food pressure", citizen.needs.hunger * 0.74], ["risk tolerance", (citizen.personality?.riskTolerance ?? 0.5) * 0.22], ["nature restraint", -(citizen.values?.nature ?? 0.5) * 0.14]);
      if (kind === "use_medicine") entries.push(["illness treatment", (citizen.physical?.illness ?? 0) * 1.1], ["injury treatment", (citizen.physical?.injury ?? 0) * 0.82], ["security value", (citizen.values?.security ?? 0.5) * 0.16]);
      if (kind === "fuel_campfire") entries.push(["keep warmth physically available", 0.7 + (citizen.physical?.exposure ?? 0) * 0.62], ["safety value", (citizen.values?.security ?? 0.5) * 0.2]);
      if (kind === "cook_food") entries.push(["preserve a real meal", 0.64 + citizen.needs.hunger * 0.3], ["avoid raw-food illness", 0.16]);
      if (kind === "boil_water") entries.push(["make carried water safe", 0.72 + (citizen.needs.thirst ?? 0) * 0.34], ["avoid waterborne illness", 0.18]);
      if (kind === "explore") entries.push(["curiosity", (citizen.personality?.curiosity ?? 0.5) * 0.45], ["exploration value", (citizen.values?.exploration ?? 0.5) * 0.34], ["fear restraint", -(citizen.emotions?.fear ?? 0.2) * 0.25], ["fatigue restraint", -citizen.needs.fatigue * 0.2]);
      if (kind === "draw_water") entries.push(["water supply", 0.38 + Math.max(0, (citizen.needs.thirst ?? 0) - 0.2)]);
      if (kind === "drink_water") entries.push(["thirst urgency", (citizen.needs.thirst ?? 0) * 1.35]);
      if (kind === "propose_public_project") entries.push(["public works initiative", 0.48 + bold + curious], ["builder planning", builder ? 0.34 : 0]);
      if (kind === "start_construction") {
        const primitive = ["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot"].includes(intent.buildingType);
        const homelessPressure = (perception.physicalWorld?.homelessCitizens ?? 0) / Math.max(1, perception.population);
        const survivalPriority = intent.buildingType === "garden-plot" ? 0.58 + citizen.needs.hunger * 0.48
          : intent.buildingType === "campfire" ? 0.92 + (citizen.physical?.exposure ?? 0) * 0.58
            : intent.buildingType === "shelter" ? 0.78 + (citizen.physical?.exposure ?? 0) * 0.64 + homelessPressure * 0.28
              : 0.48;
        entries.push([primitive ? "primitive survival infrastructure" : "housing initiative", primitive ? survivalPriority + (citizen.values?.security ?? 0.5) * 0.14 : (perception.physicalWorld?.homelessCitizens ?? 0) > 0 ? 0.86 : -0.6], ["builder occupation", primitive ? 0 : builder ? 0.38 : -1]);
      }
      if (kind === "deliver_material") entries.push(["active project supply need", 0.88], ["carried material", (perception.physicalWorld?.carriedMaterials[intent.resource] ?? 0) > 0 ? 0.3 : 0]);
      if (kind === "work_construction") entries.push(["ready physical project", 1.02], ["builder occupation", builder ? 0.42 : 0], ["industriousness", (citizen.personality?.industriousness ?? 0.5) * 0.18]);
      if (kind === "cancel_project") entries.push(["recover genuinely abandoned capital", -0.12 + frugal]);
      if (kind === "repair_structure") entries.push(["protect settlement asset", 0.72], ["builder occupation", builder ? 0.35 : -1]);
      if (kind === "demolish_structure") entries.push(["clear unsafe structure", 0.64], ["builder occupation", builder ? 0.35 : -1]);
      if (kind === "move_home") entries.push(["housing need", perception.physicalWorld?.homeObjectUid ? -1 : 1.08], ["fatigue relief", citizen.needs.fatigue * 0.3]);
      if (kind === "propose_policy") entries.push(["public initiative", 0.3 + bold + curious + (perception.politics?.legitimacy ?? 0.5) * 0.12]);
      if (kind === "cast_ballot") {
        const marketCharter = perception.politics?.activeProposal?.policyId === "market-charter";
        const securityConcern = /secure|home|tradition|stability/i.test(citizen.goal) ? 0.16 : 0;
        if (intent.choice === "support") entries.push(["shared-goal alignment", 0.46 + goalAlignment * 0.45 + bold + curious + (marketCharter && citizen.job === "merchant" ? 0.28 : 0)]);
        if (intent.choice === "oppose") entries.push(["institutional caution", 0.25 + patient * 6 + frugal * 5 + securityConcern + (perception.politics?.grievance ?? 0) * 0.4]);
        if (intent.choice === "abstain") entries.push(["political disengagement", 0.08 + Math.max(0, 0.4 - (perception.politics?.legitimacy ?? 0.5))]);
      }
      if (kind === "respond_to_vote") {
        const grievance = perception.politics?.grievance ?? 0;
        if (intent.response === "accept") entries.push(["accept majority legitimacy", 0.55 + (perception.politics?.legitimacy ?? 0.5) * 0.45 + patient]);
        if (intent.response === "reluctant-compliance") entries.push(["cautious compliance", 0.34 + patient + grievance * 0.22]);
        if (intent.response === "protest") entries.push(["public dissent", 0.2 + bold + grievance * 0.6]);
        if (intent.response === "organize") entries.push(["collective opposition", 0.16 + sociable + bold + grievance * 0.72]);
        if (intent.response === "rebel") entries.push(["open defiance", 0.04 + bold * 1.8 + grievance]);
      }
      if (kind === "form_faction" || kind === "join_faction") entries.push(["political organization", 0.22 + sociable + (perception.politics?.grievance ?? 0) * 0.5]);
      if (kind === "organize_collective_action") entries.push(["collective pressure", 0.2 + bold + sociable + (perception.politics?.grievance ?? 0) * (intent.action === "rebellion" ? 0.95 : 0.55)]);
      if (kind === "request_item") entries.push(["survival need", citizen.needs.hunger * 0.82], ["willingness to depend on others", (1 - (citizen.personality?.independence ?? 0.5)) * 0.22]);
      if (kind === "share_item") entries.push(["empathy", (citizen.personality?.empathy ?? 0.5) * 0.42], ["generosity", (citizen.personality?.generosity ?? 0.5) * 0.46], ["community value", (citizen.values?.community ?? 0.5) * 0.24], ["personal hunger penalty", -citizen.needs.hunger * 0.25]);
      if (kind === "steal_item") entries.push(["critical survival pressure", citizen.needs.hunger * 0.78], ["acquisitiveness", (citizen.personality?.acquisitiveness ?? 0.5) * 0.3], ["aggression", (citizen.personality?.aggression ?? 0.5) * 0.2], ["fairness restraint", -(citizen.values?.fairness ?? 0.5) * 0.48], ["empathy restraint", -(citizen.personality?.empathy ?? 0.5) * 0.35]);
      if (kind === "barter_item") entries.push(["obtain a missing good", 0.44], ["fair exchange", (citizen.values?.fairness ?? 0.5) * 0.24], ["trading aptitude", (citizen.skills?.trading?.level ?? 0) * 0.28]);
      if (kind === "rescue_person") entries.push(["life-threatening emergency", 0.88], ["empathy", (citizen.personality?.empathy ?? 0.5) * 0.62], ["community value", (citizen.values?.community ?? 0.5) * 0.28], ["personal fear restraint", -(citizen.emotions?.fear ?? 0) * 0.12]);
      if (kind === "offer_project_help") entries.push(["voluntary practical help", 0.42], ["empathy", (citizen.personality?.empathy ?? 0.5) * 0.26], ["industriousness", (citizen.personality?.industriousness ?? 0.5) * 0.32]);
      if (kind === "invite_project") entries.push(["seek trusted collaborator", 0.4], ["community value", (citizen.values?.community ?? 0.5) * 0.28], ["sociability", (citizen.personality?.sociability ?? 0.5) * 0.18]);
      if (kind === "teach_technique") entries.push(["empathy", (citizen.personality?.empathy ?? 0.5) * 0.26], ["sociability", (citizen.personality?.sociability ?? 0.5) * 0.25], ["community value", (citizen.values?.community ?? 0.5) * 0.22]);
      if (kind === "warn_resource") entries.push(["protect another person", (citizen.personality?.empathy ?? 0.5) * 0.32], ["social connection", (citizen.personality?.sociability ?? 0.5) * 0.2]);
      if (kind === "conceal_resource") entries.push(["protect private advantage", (citizen.personality?.acquisitiveness ?? 0.5) * 0.5], ["independence", (citizen.personality?.independence ?? 0.5) * 0.28], ["community restraint", -(citizen.values?.community ?? 0.5) * 0.32]);
      if (kind === "form_household") entries.push(["family value", (citizen.values?.family ?? 0.5) * 0.38], ["sociability", (citizen.personality?.sociability ?? 0.5) * 0.28], ["loneliness", citizen.needs.loneliness * 0.35], ["independence restraint", -(citizen.personality?.independence ?? 0.5) * 0.18]);
      if (kind === "form_group") entries.push(["community value", (citizen.values?.community ?? 0.5) * 0.36], ["sociability", (citizen.personality?.sociability ?? 0.5) * 0.28], ["loneliness", citizen.needs.loneliness * 0.22], ["independence restraint", -(citizen.personality?.independence ?? 0.5) * 0.2]);
      if (kind === "invite_group") entries.push(["grow trusted cooperation", 0.28], ["community value", (citizen.values?.community ?? 0.5) * 0.32], ["sociability", (citizen.personality?.sociability ?? 0.5) * 0.22]);
      if (kind === "adopt_group_system") {
        if (intent.system === "consensus") entries.push(["equality preference", (citizen.values?.equality ?? 0.5) * 0.52], ["community preference", (citizen.values?.community ?? 0.5) * 0.38], ["dominance restraint", -(citizen.personality?.dominance ?? 0.5) * 0.22]);
        if (intent.system === "majority") entries.push(["fair procedure", (citizen.values?.fairness ?? 0.5) * 0.48], ["conformity", (citizen.personality?.conformity ?? 0.5) * 0.28]);
        if (intent.system === "leader") entries.push(["personal dominance", (citizen.personality?.dominance ?? 0.5) * 0.58], ["security preference", (citizen.values?.security ?? 0.5) * 0.32], ["autonomy restraint", -(citizen.values?.autonomy ?? 0.5) * 0.24]);
        if (intent.system === "council") entries.push(["distributed leadership", (citizen.values?.community ?? 0.5) * 0.36], ["status preference", (citizen.values?.status ?? 0.5) * 0.24], ["fairness", (citizen.values?.fairness ?? 0.5) * 0.32]);
      }
      if (kind === "leave_group") entries.push(["independence", (citizen.personality?.independence ?? 0.5) * 0.46], ["resentment", (citizen.emotions?.resentment ?? 0) * 0.42], ["community restraint", -(citizen.values?.community ?? 0.5) * 0.24]);
      if (kind === "exclude_member") entries.push(["unresolved grievance", (citizen.socialRelationships?.[intent.targetCitizenId]?.grievance ?? 0) * 0.62], ["dominance", (citizen.personality?.dominance ?? 0.5) * 0.2], ["fairness restraint", -(citizen.values?.fairness ?? 0.5) * 0.18]);
      if (kind === "contribute_group_stock") entries.push(["community value", (citizen.values?.community ?? 0.5) * 0.34], ["generosity", (citizen.personality?.generosity ?? 0.5) * 0.24], ["shared resilience", 0.22]);
      if (kind === "promise_item") entries.push(["empathy", (citizen.personality?.empathy ?? 0.5) * 0.24], ["conscientiousness", (citizen.personality?.conscientiousness ?? 0.5) * 0.2], ["social reassurance", 0.14]);
      if (kind === "fulfill_promise") entries.push(["honor explicit obligation", 0.86], ["conscientiousness", (citizen.personality?.conscientiousness ?? 0.5) * 0.28], ["fairness value", (citizen.values?.fairness ?? 0.5) * 0.18]);
      if (kind === "forgive") entries.push(["empathy", (citizen.personality?.empathy ?? 0.5) * 0.38], ["community repair", (citizen.values?.community ?? 0.5) * 0.28], ["anger restraint", -(citizen.emotions?.anger ?? 0) * 0.12]);
      if (kind === "retaliate") entries.push(["anger", (citizen.emotions?.anger ?? 0) * 0.5], ["aggression", (citizen.personality?.aggression ?? 0.5) * 0.36], ["grievance", (citizen.socialRelationships?.[intent.targetCitizenId]?.grievance ?? 0) * 0.4], ["empathy restraint", -(citizen.personality?.empathy ?? 0.5) * 0.28]);
      if (kind === "claim_resource") entries.push(["acquisitiveness", (citizen.personality?.acquisitiveness ?? 0.5) * 0.4], ["wealth value", (citizen.values?.wealth ?? 0.5) * 0.25], ["dominance", (citizen.personality?.dominance ?? 0.5) * 0.22], ["equality restraint", -(citizen.values?.equality ?? 0.5) * 0.22]);
      if (kind === "challenge_claim") entries.push(["independence", (citizen.personality?.independence ?? 0.5) * 0.3], ["survival pressure", citizen.needs.hunger * 0.34], ["aggression", (citizen.personality?.aggression ?? 0.5) * 0.2], ["risk restraint", -(1 - (citizen.personality?.riskTolerance ?? 0.5)) * 0.18]);
      const criticalPressure = Math.max(citizen.needs.hunger, citizen.needs.thirst ?? 0, citizen.needs.fatigue, citizen.physical?.exposure ?? 0, citizen.physical?.illness ?? 0, citizen.physical?.injury ?? 0);
      const urgentKinds: ActionIntent["kind"][] = ["eat", "rest", "forage_wild_food", "catch_fish", "hunt_game", "drink_natural_water", "drink_water", "draw_water", "collect_water", "use_medicine", "gather_branches", "gather_fiber", "fuel_campfire", "cook_food", "boil_water", "request_item", "rescue_person", "deliver_material", "work_construction", "start_construction", "move_home"];
      if (criticalPressure >= 0.78 && !urgentKinds.includes(kind)) entries.push(["critical needs force reconsideration", -0.75 - (criticalPressure - 0.78) * 2.5]);
      return evaluated(candidate.id, entries)!;
    });
    const candidates = [...coreCandidates, ...economicCandidates];

    const selected = candidates.filter((candidate) => candidate.legal).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))[0];
    if (!selected) throw new Error("The decision request has no legal candidates.");
    return {
      requestId: request.requestId,
      selectedCandidateId: selected.id,
      provider: this.descriptor,
      signals: {
        kind: "heuristic",
        evaluations: candidates.map((candidate) => ({ candidateId: candidate.id, score: candidate.score ?? undefined, trace: candidate.trace })),
      },
    };
  }
}
