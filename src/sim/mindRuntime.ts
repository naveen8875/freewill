import type { ActionInstance, CitizenMindState, CitizenState, SimulationSnapshot } from "./types";

const THIRST_ACTIONS = new Set(["drink_water", "drink_natural_water", "draw_water", "collect_water", "request_item"]);
const FOOD_ACTIONS = new Set(["eat", "forage_wild_food", "catch_fish", "hunt_game", "request_item"]);
const RECOVERY_ACTIONS = new Set(["rest", "use_medicine", "rescue_person", "move_home"]);
const WARMTH_ACTIONS = new Set(["move_home", "fuel_campfire", "start_construction", "deliver_material", "work_construction", "gather_branches", "gather_fiber"]);

export function initialMindState(): CitizenMindState {
  return { mode: "idle", lastDeliberatedAtTick: 0, nextReviewAtTick: 0, reconsiderations: 0 };
}

/**
 * A commitment window prevents a responsive brain from thrashing between
 * equally attractive actions. It never blocks genuine survival interrupts.
 */
export function commitmentWindowTicks(action: ActionInstance["actionId"], duration: number) {
  if (["rest", "work_construction", "fell_tree", "quarry_stone", "hunt_game", "operate_recipe"].includes(action)) return Math.max(1, Math.ceil(duration * 0.5));
  return Math.max(1, Math.ceil(duration * 0.25));
}

export function reviewIntervalTicks(citizen: CitizenState) {
  const patience = citizen.personality?.patience ?? 0.5;
  const conscientiousness = citizen.personality?.conscientiousness ?? 0.5;
  return Math.max(1, Math.round(1 + patience + conscientiousness));
}

/** Returns only event-level reasons. Ordinary preference changes wait for the review boundary. */
export function activeActionInterruptReason(snapshot: SimulationSnapshot, citizen: CitizenState, action: ActionInstance) {
  if (!action.interruptible) return undefined;
  if (citizen.physical?.incapacitatedSinceTick !== undefined) return "Their body can no longer continue the current intention.";
  if ((citizen.needs.thirst ?? 0) >= 0.98 && !THIRST_ACTIONS.has(action.actionId)) return "Critical thirst forced an immediate reconsideration.";
  if (citizen.needs.hunger >= 0.98 && !FOOD_ACTIONS.has(action.actionId)) return "Critical hunger forced an immediate reconsideration.";
  if ((citizen.physical?.illness ?? 0) >= 0.85 && !RECOVERY_ACTIONS.has(action.actionId)) return "Worsening illness interrupted the current plan.";
  if ((citizen.physical?.injury ?? 0) >= 0.85 && !RECOVERY_ACTIONS.has(action.actionId)) return "A serious injury interrupted the current plan.";
  if ((citizen.physical?.exposure ?? 0) >= 0.98 && !WARMTH_ACTIONS.has(action.actionId)) return "Dangerous exposure forced a search for warmth or shelter.";

  const intent = action.intent;
  if (intent?.kind === "fell_tree" || intent?.kind === "quarry_stone" || intent?.kind === "harvest_crop" || intent?.kind === "sow_crop" || intent?.kind === "tend_crop") {
    const node = snapshot.physicalWorld.resources[intent.nodeId];
    if (!node || intent.kind !== "sow_crop" && node.status !== "available" && intent.kind !== "tend_crop") return "The intended resource is no longer available.";
  }
  if (intent && "projectId" in intent && intent.projectId) {
    const project = snapshot.physicalWorld.projects[intent.projectId];
    if (!project || project.status === "cancelled" || project.demolishedAtTick !== undefined) return "The intended project is no longer available.";
  }
  if (action.targetCitizenId !== undefined && snapshot.citizens[action.targetCitizenId]?.physical?.alive === false) return "The person involved in this intention is no longer alive.";
  return undefined;
}
