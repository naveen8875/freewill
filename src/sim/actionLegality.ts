import type { ActionId, DecisionContext } from "./types";

export interface ActionLegality {
  legal: boolean;
  reason?: string;
}

export function checkActionLegality(action: ActionId, context: DecisionContext): ActionLegality {
  const { citizen, citizens, stock } = context;
  switch (action) {
    case "eat":
      if (citizen.needs.hunger < 0.35) return { legal: false, reason: "This citizen is not hungry enough to consume scarce food." };
      return ["berries", "meat", "cooked_meal", "bread", "fish", "wheat", "cabbage", "pumpkin"]
        .some((resource) => (citizen.inventory[resource] ?? 0) + (stock[resource] ?? 0) > 0)
        ? { legal: true }
        : { legal: false, reason: "Neither this citizen nor the common stores have food." };
    case "rest":
      return { legal: true };
    case "gather_food":
      if (context.physicalWorld?.enabled && citizen.job !== "fisher") return { legal: false, reason: citizen.job === "farmer" ? "Farmers must choose a ripe crop plot." : "Food must come from an exact crop plot, renewable fish stock, inventory, or trade." };
      if (context.physicalWorld?.enabled && (context.physicalWorld.renewableStocks.fish?.amount ?? 0) < 1) return { legal: false, reason: "The local fish stock is depleted and needs time to recover." };
      return { legal: true };
    case "idle":
      return { legal: true };
    case "work_job":
      if (context.physicalWorld?.enabled && citizen.job === "woodcutter") return { legal: false, reason: "Woodcutters must choose and reserve a specific tree." };
      if (context.physicalWorld?.enabled && citizen.job === "miner") return { legal: false, reason: "Miners must choose and reserve a specific rock." };
      if (context.physicalWorld?.enabled && ["baker", "smith"].includes(citizen.job)) return { legal: false, reason: "This occupation must use a physical facility and a material-conserving recipe." };
      return citizen.job !== "kid" && citizen.job !== "wanderer" && citizen.job !== "unassigned"
        ? { legal: true }
        : { legal: false, reason: "This citizen has no assigned occupation." };
    case "socialize":
      return citizens.some((other) => other.id !== citizen.id)
        ? { legal: true }
        : { legal: false, reason: "Nobody else is available." };
    case "construct":
      if (citizen.job !== "builder") return { legal: false, reason: "Only builders may lead construction." };
      return (stock.wood ?? 0) >= 2 && (stock.stone ?? 0) >= 1
        ? { legal: true }
        : { legal: false, reason: "Construction needs 2 wood and 1 stone." };
    case "fell_tree":
    case "forage_wild_food":
    case "gather_fiber":
    case "gather_branches":
    case "gather_loose_stone":
    case "craft_hand_axe":
    case "craft_stone_pick":
    case "craft_primitive":
    case "gather_clay":
    case "drink_natural_water":
    case "catch_fish":
    case "hunt_game":
    case "use_medicine":
    case "fuel_campfire":
    case "cook_food":
    case "boil_water":
    case "explore":
    case "quarry_stone":
    case "harvest_crop":
    case "sow_crop":
    case "tend_crop":
    case "collect_water":
    case "draw_water":
    case "drink_water":
    case "propose_public_project":
    case "start_construction":
    case "deliver_material":
    case "work_construction":
    case "cancel_project":
    case "repair_structure":
    case "demolish_structure":
    case "move_home":
      return { legal: false, reason: "This physical action requires a validated target." };
    case "propose_market_charter":
    case "support_market_charter":
    case "oppose_market_charter":
    case "register_business":
    case "list_good":
    case "buy_good":
    case "invest_business":
    case "offer_job":
    case "accept_job":
    case "adopt_commitment":
    case "change_occupation":
    case "train_skill":
    case "lease_facility":
    case "transfer_good":
    case "operate_recipe":
    case "propose_policy":
    case "cast_ballot":
    case "respond_to_vote":
    case "form_faction":
    case "join_faction":
    case "organize_collective_action":
    case "request_item":
    case "share_item":
    case "steal_item":
    case "rescue_person":
    case "barter_item":
    case "offer_project_help":
    case "invite_project":
    case "teach_technique":
    case "warn_resource":
    case "conceal_resource":
    case "form_household":
    case "form_group":
    case "invite_group":
    case "adopt_group_system":
    case "leave_group":
    case "exclude_member":
    case "contribute_group_stock":
    case "promise_item":
    case "fulfill_promise":
    case "forgive":
    case "retaliate":
    case "claim_resource":
    case "challenge_claim":
      return { legal: false, reason: "This economic action requires a validated parameterized intent." };
  }
}
