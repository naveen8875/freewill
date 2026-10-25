import { stableHash } from "../stableHash";
import type { CharacterPerception, DecisionRequest } from "../types";
import { OBSERVATION_DIMENSION } from "./contracts";
import { SIM_TICKS_PER_DAY } from "../time";

const PERSONALITY_KEYS = ["empathy", "sociability", "industriousness", "openness", "conscientiousness", "extraversion", "agreeableness", "emotionalSensitivity", "riskTolerance", "patience", "generosity", "dominance", "curiosity", "conformity", "aggression", "acquisitiveness", "independence"] as const;
const VALUE_KEYS = ["autonomy", "security", "community", "fairness", "status", "tradition", "equality", "wealth", "exploration", "family", "nature"] as const;
const EMOTION_KEYS = ["fear", "anger", "hope", "contentment", "stress", "gratitude", "resentment", "confidence", "safety"] as const;
const PHYSICAL_KEYS = ["strength", "endurance", "health", "injury", "exposure", "movementAbility", "temperatureTolerance", "illness"] as const;
const INVENTORY_KEYS = ["berries", "fish", "meat", "cooked_meal", "water", "unsafe_water", "wild_seed", "wheat_seed", "branches", "wood", "stone", "fiber", "clay", "medicine", "hand_axe", "stone_pick", "spear", "fishing_tool", "water_container", "simple_clothing"] as const;
const SKILL_KEYS = ["foraging", "fishing", "hunting", "logging", "mining", "farming", "building", "cooking", "medicine", "trading"] as const;
const RESOURCE_KINDS = ["tree", "stone", "crop", "wild-food", "fiber"] as const;

function clamp(value: number, low = 0, high = 1) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(low, Math.min(high, value));
}

function boundedAmount(value: number | undefined, scale = 10) {
  return clamp(Math.log1p(Math.max(0, value ?? 0)) / Math.log1p(scale));
}

function hash01(value: unknown) {
  return Number.parseInt(stableHash(value).slice(0, 8), 16) / 0xffff_ffff;
}

class VectorWriter {
  readonly values: number[] = [];
  readonly mask: number[] = [];

  push(value: number | undefined, available = value !== undefined) {
    this.values.push(available ? clamp(value ?? 0, -1, 1) : 0);
    this.mask.push(available ? 1 : 0);
  }

  pad() {
    while (this.values.length < OBSERVATION_DIMENSION) {
      this.values.push(0);
      this.mask.push(0);
    }
    if (this.values.length !== OBSERVATION_DIMENSION) throw new Error(`Observation encoder produced ${this.values.length} values; expected ${OBSERVATION_DIMENSION}.`);
  }
}

function encodeKnownPeople(writer: VectorWriter, perception: CharacterPerception) {
  const citizen = perception.citizen;
  const known = new Set(citizen.knowledge?.knownPeople ?? []);
  const people = perception.visibleCitizens
    .filter((person) => person.id !== citizen.id && known.has(person.id))
    .map((person) => ({
      ...person,
      distance: Math.abs(person.position.x - citizen.position.x) + Math.abs(person.position.y - citizen.position.y),
      relationship: citizen.socialRelationships?.[person.id],
    }))
    .sort((left, right) => left.distance - right.distance || left.id - right.id)
    .slice(0, 6);
  for (let slot = 0; slot < 6; slot += 1) {
    const person = people[slot];
    if (!person) {
      for (let feature = 0; feature < 10; feature += 1) writer.push(undefined, false);
      continue;
    }
    writer.push(clamp((person.position.x - citizen.position.x) / 24, -1, 1));
    writer.push(clamp((person.position.y - citizen.position.y) / 24, -1, 1));
    writer.push(clamp(person.distance / 48));
    writer.push(person.relationship?.trust ?? citizen.relationships[person.id] ?? 0.5);
    writer.push(person.relationship?.affection ?? 0);
    writer.push(person.relationship?.fear ?? 0);
    writer.push(person.relationship?.respect ?? 0);
    writer.push(clamp((person.relationship?.debt ?? 0) / 10));
    writer.push(clamp((person.relationship?.grievance ?? 0) / 10));
    writer.push(hash01(person.id) * 2 - 1);
  }
}

function encodeKnownResources(writer: VectorWriter, perception: CharacterPerception) {
  const citizen = perception.citizen;
  const resources = [...(perception.physicalWorld?.knownResources ?? [])]
    .map((resource) => ({
      ...resource,
      distance: Math.abs(resource.position.x - citizen.position.x) + Math.abs(resource.position.y - citizen.position.y),
    }))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))
    .slice(0, 5);
  for (let slot = 0; slot < 5; slot += 1) {
    const resource = resources[slot];
    if (!resource) {
      for (let feature = 0; feature < 6; feature += 1) writer.push(undefined, false);
      continue;
    }
    writer.push(clamp((resource.position.x - citizen.position.x) / 24, -1, 1));
    writer.push(clamp((resource.position.y - citizen.position.y) / 24, -1, 1));
    writer.push(clamp(resource.distance / 48));
    writer.push((RESOURCE_KINDS.indexOf(resource.kind) + 1) / RESOURCE_KINDS.length);
    writer.push(boundedAmount(Object.values(resource.yield).reduce((sum, amount) => sum + amount, 0), 20));
    writer.push(resource.status === "available" ? clamp(resource.health ?? resource.growth ?? 1) : 0);
  }
}

/** Encodes only the citizen-scoped provider perception. */
export function encodeObservation(request: Pick<DecisionRequest, "perception">) {
  const { perception } = request;
  const citizen = perception.citizen;
  const writer = new VectorWriter();

  writer.push(citizen.needs.hunger);
  writer.push(citizen.needs.thirst);
  writer.push(citizen.needs.fatigue);
  writer.push(citizen.needs.loneliness);
  writer.push(citizen.happiness);

  for (const key of PHYSICAL_KEYS) writer.push(citizen.physical?.[key]);
  writer.push(citizen.physical?.alive === false ? 0 : 1, citizen.physical !== undefined);
  writer.push(citizen.physical ? clamp((citizen.physical.age - 12) / 70) : undefined);
  for (const key of EMOTION_KEYS) writer.push(citizen.emotions?.[key]);
  for (const key of PERSONALITY_KEYS) writer.push(citizen.personality?.[key]);
  for (const key of VALUE_KEYS) writer.push(citizen.values?.[key]);
  for (const key of INVENTORY_KEYS) writer.push(boundedAmount(citizen.inventory[key]), true);
  for (const key of SKILL_KEYS) writer.push(citizen.skills[key] ? clamp(citizen.skills[key].level / 10) : undefined);

  writer.push(clamp((citizen.knowledge?.discoveredTiles.length ?? 0) / 512), citizen.knowledge !== undefined);
  writer.push(clamp((citizen.knowledge?.knownResources.length ?? 0) / 64), citizen.knowledge !== undefined);
  writer.push(clamp((citizen.knowledge?.knownPeople.length ?? 0) / 24), citizen.knowledge !== undefined);
  writer.push(clamp((citizen.knowledge?.learnedTechniques.length ?? 0) / 20), citizen.knowledge !== undefined);
  writer.push(clamp(citizen.memories.length / 8));
  writer.push(citizen.commitment?.status === "active" ? 1 : 0);
  const mindMode = ["idle", "deliberating", "executing", "committed", "interrupted"].indexOf(citizen.mind?.mode ?? "");
  writer.push(mindMode >= 0 ? mindMode / 4 : citizen.currentActivity ? hash01(citizen.currentActivity) * 2 - 1 : undefined);

  const world = perception.physicalWorld;
  writer.push(world ? clamp(world.availableTrees / 32) : undefined);
  writer.push(world ? clamp(world.availableStone / 32) : undefined);
  writer.push(world ? clamp(world.harvestableCrops / 16) : undefined);
  writer.push(world ? clamp(world.activeProjects.length / 8) : undefined);
  writer.push(world ? clamp(world.homelessCitizens / Math.max(1, perception.population)) : undefined);
  writer.push(world ? clamp(world.nearbyFireFuel / 20) : undefined);

  writer.push(clamp((perception.tick % SIM_TICKS_PER_DAY) / (SIM_TICKS_PER_DAY - 1)));
  writer.push(clamp((Math.floor(perception.tick / SIM_TICKS_PER_DAY) % 30) / 29));
  writer.push(clamp(perception.population / 100));
  writer.push(perception.politics ? perception.politics.legitimacy : undefined);
  writer.push(perception.politics ? clamp(perception.politics.grievance) : undefined);
  writer.push(perception.economy ? boundedAmount(perception.economy.wallet, 100) : undefined);

  encodeKnownResources(writer, perception);
  encodeKnownPeople(writer, perception);
  writer.pad();
  return { observation: writer.values, observationMask: writer.mask };
}

