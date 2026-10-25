import type { ActionIntent } from "../types";

/**
 * Phase-one learning vocabulary. Targets and recipe/building parameters remain
 * candidate features; the model never generates an ActionIntent itself.
 */
export const LEARNING_ACTION_FAMILIES = [
  "idle",
  "explore",
  "rest",
  "eat",
  "drink_natural_water",
  "collect_water",
  "drink_water",
  "forage_wild_food",
  "gather_fiber",
  "gather_branches",
  "gather_loose_stone",
  "gather_clay",
  "catch_fish",
  "hunt_game",
  "use_medicine",
  "craft_hand_axe",
  "craft_stone_pick",
  "craft_primitive",
  "fuel_campfire",
  "cook_food",
  "boil_water",
  "fell_tree",
  "quarry_stone",
  "sow_crop",
  "tend_crop",
  "harvest_crop",
  "start_construction",
  "deliver_material",
  "work_construction",
  "repair_structure",
  "move_home",
  "request_item",
  "share_item",
  "steal_item",
  "barter_item",
  "rescue_person",
  "offer_project_help",
  "teach_technique",
  "form_household",
  "form_group",
] as const satisfies readonly ActionIntent["kind"][];

export type LearningActionFamily = typeof LEARNING_ACTION_FAMILIES[number];

const FAMILY_INDEX = new Map<string, number>(LEARNING_ACTION_FAMILIES.map((kind, index) => [kind, index]));

export function learningActionIndex(kind: string | undefined) {
  if (!kind) return -1;
  return FAMILY_INDEX.get(kind) ?? -1;
}

export function isLearningAction(kind: string | undefined): kind is LearningActionFamily {
  return learningActionIndex(kind) >= 0;
}

