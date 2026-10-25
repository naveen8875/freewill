import { checkActionLegality } from "./actionLegality";
import { buildEconomicCandidates } from "./economy";
import { buildPoliticalCandidates } from "./politics";
import { buildPhysicalCandidates } from "./physicalWorld";
import { buildSettlementCandidates } from "./settlementSystems";
import { buildSocialCandidates } from "./socialWorld";
import type { ActionCandidate, ActionId, ActionIntent, DecisionContext, TraditionalCoreActionId } from "./types";

export const ACTION_LABELS: Record<ActionId, string> = {
  eat: "Eat from the common stores",
  rest: "Rest and recover",
  gather_food: "Gather food",
  work_job: "Work their occupation",
  socialize: "Spend time with a neighbor",
  construct: "Help with construction",
  forage_wild_food: "Forage from a known wild food source",
  gather_fiber: "Gather useful plant fiber",
  gather_branches: "Collect fallen branches",
  gather_loose_stone: "Collect loose stone",
  craft_hand_axe: "Craft a primitive hand axe",
  craft_stone_pick: "Craft a primitive stone pick",
  craft_primitive: "Craft a primitive survival item",
  gather_clay: "Gather workable clay",
  drink_natural_water: "Drink directly from natural water",
  catch_fish: "Catch fish from a renewable population",
  hunt_game: "Hunt tracked wild game",
  use_medicine: "Use basic medicine",
  fuel_campfire: "Feed branches into a campfire",
  cook_food: "Cook food over a campfire",
  boil_water: "Boil unsafe carried water",
  explore: "Explore beyond known ground",
  fell_tree: "Fell a specific tree",
  quarry_stone: "Quarry a specific rock",
  harvest_crop: "Harvest a specific crop plot",
  sow_crop: "Sow a specific crop plot",
  tend_crop: "Tend a growing crop",
  collect_water: "Collect untreated water from the shore",
  draw_water: "Draw water from a working well",
  drink_water: "Drink carried water",
  propose_public_project: "Propose an exact public project",
  start_construction: "Establish a construction site",
  deliver_material: "Deliver construction material",
  work_construction: "Work on a construction project",
  cancel_project: "Cancel and refund a project",
  repair_structure: "Repair a damaged structure",
  demolish_structure: "Demolish an authorized structure",
  move_home: "Move into an available home",
  propose_market_charter: "Propose a market charter",
  support_market_charter: "Support the market charter",
  oppose_market_charter: "Oppose the market charter",
  register_business: "Register a business",
  list_good: "List a good for sale",
  buy_good: "Buy a listed good",
  invest_business: "Invest in a business",
  offer_job: "Offer paid work",
  accept_job: "Accept paid work",
  adopt_commitment: "Adopt a persistent objective",
  change_occupation: "Change occupation",
  train_skill: "Practice a skill",
  lease_facility: "Lease a physical workplace",
  transfer_good: "Transfer owned goods",
  operate_recipe: "Operate a production recipe",
  propose_policy: "Propose a public policy",
  cast_ballot: "Cast a public ballot",
  respond_to_vote: "Respond to a public result",
  form_faction: "Form a political faction",
  join_faction: "Join a political faction",
  organize_collective_action: "Organize collective action",
  request_item: "Request an item",
  share_item: "Share an item",
  steal_item: "Steal an item",
  rescue_person: "Rescue an incapacitated person",
  barter_item: "Offer a direct barter",
  offer_project_help: "Offer help on a project",
  invite_project: "Invite someone into a project",
  teach_technique: "Teach a technique",
  warn_resource: "Share resource knowledge",
  conceal_resource: "Keep a resource location secret",
  form_household: "Form a household",
  form_group: "Form a persistent group",
  invite_group: "Invite someone into a group",
  adopt_group_system: "Adopt a group decision system",
  leave_group: "Leave a group",
  exclude_member: "Exclude a group member",
  contribute_group_stock: "Contribute to group stores",
  promise_item: "Promise future repayment",
  fulfill_promise: "Fulfill a promise",
  forgive: "Forgive a grievance",
  retaliate: "Retaliate for a grievance",
  claim_resource: "Claim a resource",
  challenge_claim: "Challenge a resource claim",
  idle: "Take a quiet moment",
};

const CORE_ACTION_IDS: TraditionalCoreActionId[] = ["eat", "rest", "gather_food", "work_job", "socialize", "construct", "idle"];

export function buildActionCandidates(context: DecisionContext): ActionCandidate[] {
  const political = buildPoliticalCandidates(context);
  if (political.some((candidate) => candidate.intent?.kind === "cast_ballot" || candidate.intent?.kind === "respond_to_vote")) return political;
  const core = CORE_ACTION_IDS.filter((id) => !context.physicalWorld?.enabled || !["gather_food", "work_job", "construct"].includes(id)).map((id) => {
    const result = checkActionLegality(id, context);
    return {
      id,
      label: ACTION_LABELS[id],
      legal: result.legal,
      blockedBy: result.reason,
      score: null,
      trace: [],
      intent: { kind: id },
    };
  });
  const all = [...core, ...buildPhysicalCandidates(context), ...buildSocialCandidates(context), ...buildSettlementCandidates(context), ...political, ...buildEconomicCandidates(context)];
  // Candidate payloads are intentionally bounded, so preserve the actions that
  // can satisfy an active plan or an urgent physical/social boundary before
  // trimming ambient opportunities such as distant gathering sites.
  const priorityKinds = new Set<ActionIntent["kind"]>([
    "eat", "rest", "drink_water", "drink_natural_water", "use_medicine", "rescue_person",
    "fuel_campfire", "cook_food", "boil_water", "harvest_crop", "sow_crop", "tend_crop",
    "start_construction", "deliver_material", "work_construction", "move_home",
    "adopt_commitment", "change_occupation", "train_skill", "lease_facility", "transfer_good", "operate_recipe",
    "offer_project_help", "invite_project", "adopt_group_system", "cast_ballot", "respond_to_vote",
  ]);
  return [...all.filter((candidate) => candidate.intent && priorityKinds.has(candidate.intent.kind)), ...all.filter((candidate) => !candidate.intent || !priorityKinds.has(candidate.intent.kind))].slice(0, 50);
}
