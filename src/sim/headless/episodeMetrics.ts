import type { CitizenState, DecisionRecord, SimulationSnapshot } from "../types";
import type { CitizenEpisodeResult, EpisodeMetrics } from "./experimentTypes";
import { SIM_TICKS_PER_DAY } from "../time";

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const FOOD_RESOURCES = new Set(["berries", "wheat", "fish", "meat", "bread", "cooked_meal", "cabbage", "pumpkin"]);
const RENEWABLE_FOOD_ACTIONS = new Set(["forage_wild_food", "catch_fish", "hunt_game", "harvest_crop"]);

function sumInventory(inventory: Record<string, number>) {
  return Object.values(inventory).reduce((sum, value) => sum + value, 0);
}

function sumSkills(citizen: CitizenState) {
  return Object.values(citizen.skills).reduce((sum, skill) => sum + skill.level, 0);
}

function actionDistribution(decisions: DecisionRecord[], citizenId?: number) {
  return decisions.filter((decision) => citizenId === undefined || decision.citizenId === citizenId).reduce<Record<string, number>>((counts, decision) => {
    const family = decision.selectedIntent?.kind ?? decision.selected;
    counts[family] = (counts[family] ?? 0) + 1;
    return counts;
  }, {});
}

export function episodeMetrics(snapshot: SimulationSnapshot, maximumDays: number): EpisodeMetrics {
  const citizens = Object.values(snapshot.citizens);
  const living = citizens.filter((citizen) => citizen.physical?.alive !== false);
  const completed = snapshot.decisions.filter((decision) => decision.actionStatus === "completed");
  const cancelled = snapshot.decisions.filter((decision) => decision.actionStatus === "cancelled");
  const critical = citizens.filter((citizen) => Math.max(citizen.needs.hunger, citizen.needs.thirst ?? 0, citizen.needs.fatigue, citizen.physical?.injury ?? 0, citizen.physical?.illness ?? 0, citizen.physical?.exposure ?? 0) >= 0.8).length;
  const unreachable = cancelled.filter((decision) => decision.consequences.some((item) => /cannot be reached|unreachable|no reachable|route/i.test(item))).length;
  const criticalInterruptions = cancelled.filter((decision) => decision.consequences.some((item) => /critical (?:hunger|thirst)|body can no longer/i.test(item))).length;
  const collapses = snapshot.events.filter((event) => / collapses$/i.test(event.title)).length;
  const rescues = snapshot.events.filter((event) => / rescues /i.test(event.title)).length;
  const daysElapsed = Math.min(maximumDays, Math.max(1, Math.ceil(snapshot.tick / SIM_TICKS_PER_DAY)));
  const renewableFoodProduced = completed
    .filter((decision) => RENEWABLE_FOOD_ACTIONS.has(decision.selectedIntent?.kind ?? decision.selected))
    .reduce((sum, decision) => sum + Object.entries(decision.resourceDelta).reduce((food, [key, value]) => food + (value > 0 && FOOD_RESOURCES.has(key.split(":").at(-1) ?? key) ? value : 0), 0), 0);
  const spoiledFood = snapshot.events.reduce((sum, event) => {
    const match = event.title.match(/^(\d+)\s+.+\s+spoils$/i);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  const campfires = Object.values(snapshot.physicalWorld.buildings).filter((building) => building.buildingType === "campfire");
  const causesOfDeath = snapshot.events.filter((event) => /died|death/i.test(`${event.title} ${event.detail}`)).reduce<Record<string, number>>((causes, event) => {
    const cause = /dehydrat/i.test(event.detail) ? "dehydration" : /starv|hunger/i.test(event.detail) ? "starvation" : /expos|cold/i.test(event.detail) ? "exposure" : /ill/i.test(event.detail) ? "illness" : /injur/i.test(event.detail) ? "injury" : "other";
    causes[cause] = (causes[cause] ?? 0) + 1;
    return causes;
  }, {});
  return {
    daysElapsed,
    survivors: living.length,
    deaths: citizens.length - living.length,
    averageHealth: living.length ? living.reduce((sum, citizen) => sum + (citizen.physical?.health ?? 0), 0) / living.length : 0,
    averageLoneliness: living.length ? living.reduce((sum, citizen) => sum + citizen.needs.loneliness, 0) / living.length : 0,
    criticalNeedFraction: citizens.length ? critical / citizens.length : 0,
    completedActions: completed.length,
    cancelledActions: cancelled.length,
    successfulActionFraction: completed.length + cancelled.length ? completed.length / (completed.length + cancelled.length) : 0,
    unreachableActions: unreachable,
    unreachableActionFraction: completed.length + cancelled.length ? unreachable / (completed.length + cancelled.length) : 0,
    criticalNeedInterruptions: criticalInterruptions,
    collapses,
    rescues,
    collapsesPerHundredPersonDays: citizens.length ? collapses / (citizens.length * daysElapsed) * 100 : 0,
    renewableFoodProduced,
    spoiledFood,
    knownTiles: citizens.reduce((sum, citizen) => sum + (citizen.knowledge?.discoveredTiles.length ?? 0), 0),
    learnedSkill: citizens.reduce((sum, citizen) => sum + sumSkills(citizen), 0),
    buildings: Object.keys(snapshot.physicalWorld.buildings).length,
    cropPlots: Object.values(snapshot.physicalWorld.buildings).filter((building) => building.buildingType === "garden-plot" || building.buildingType === "farm").length,
    campfires: campfires.length,
    fueledCampfires: campfires.filter((building) => (building.fuel ?? 0) > 0).length,
    unfueledCampfireFraction: campfires.length ? campfires.filter((building) => (building.fuel ?? 0) <= 0).length / campfires.length : 0,
    groups: Object.keys(snapshot.socialGroups).length,
    households: new Set(citizens.flatMap((citizen) => citizen.householdId ? [citizen.householdId] : [])).size,
    actionDistribution: actionDistribution(snapshot.decisions),
    causesOfDeath,
  };
}

export function citizenEpisodeResult(snapshot: SimulationSnapshot, citizen: CitizenState, brainId: string, maximumDays: number): CitizenEpisodeResult {
  const decisions = snapshot.decisions.filter((decision) => decision.citizenId === citizen.id);
  const completed = decisions.filter((decision) => decision.actionStatus === "completed").length;
  const cancelled = decisions.filter((decision) => decision.actionStatus === "cancelled").length;
  const alive = citizen.physical?.alive !== false;
  const needs = [citizen.needs.hunger, citizen.needs.thirst ?? 0, citizen.needs.fatigue, citizen.physical?.exposure ?? 0, citizen.physical?.injury ?? 0, citizen.physical?.illness ?? 0];
  const collapses = snapshot.events.filter((event) => / collapses$/i.test(event.title) && event.citizenIds.includes(citizen.id)).length;
  const collapseBurden = clamp(collapses / Math.max(1, maximumDays));
  const physiologicalStability = clamp(1 - needs.reduce((sum, value) => sum + clamp(value), 0) / needs.length - collapseBurden * 0.35);
  const competence = (completed + cancelled) ? completed / (completed + cancelled) : 0;
  const adaptability = clamp((citizen.emotions?.hope ?? .5) * .35 + (citizen.emotions?.confidence ?? .5) * .35 + competence * .3);
  const values = citizen.values;
  const social = Object.values(citizen.socialRelationships ?? {});
  const valueAlignment = clamp((values?.autonomy ?? .5) * .15 + (values?.security ?? .5) * physiologicalStability * .25 + (values?.community ?? .5) * (social.length ? social.reduce((sum, relationship) => sum + relationship.trust, 0) / social.length : .5) * .2 + (values?.exploration ?? .5) * clamp((citizen.knowledge?.discoveredTiles.length ?? 0) / 100) * .2 + (values?.nature ?? .5) * .2);
  const resourceEfficiency = clamp((sumInventory(citizen.inventory) + sumSkills(citizen) * .5) / Math.max(1, decisions.length));
  const actionTypes = Object.keys(actionDistribution(decisions));
  const novelty = clamp(actionTypes.length / 16);
  return {
    citizenId: citizen.id,
    brainId,
    alive,
    daysAlive: alive ? maximumDays : Math.max(0, Math.ceil((citizen.physical?.incapacitatedSinceTick ?? snapshot.tick) / SIM_TICKS_PER_DAY)),
    fitness: [alive ? 1 : clamp((citizen.physical?.incapacitatedSinceTick ?? snapshot.tick) / Math.max(1, maximumDays * SIM_TICKS_PER_DAY)), physiologicalStability, competence, adaptability, valueAlignment, resourceEfficiency, novelty],
    actionDistribution: actionDistribution(decisions),
  };
}

