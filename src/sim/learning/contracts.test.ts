import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildActionCandidates } from "../actionCandidates";
import type { CitizenState, DecisionRequest } from "../types";
import { stableHash } from "../stableHash";
import { encodeDecisionRequest } from "./encodeDecisionRequest";
import { CANDIDATE_DIMENSION, LEARNING_SCHEMA_VERSION, OBSERVATION_DIMENSION } from "./contracts";
import { LEARNING_ACTION_FAMILIES } from "./learningVocabulary";

function citizen(id = 1): CitizenState {
  return {
    id, revision: 1, name: `Person ${id}`, job: "unassigned", traits: [], goal: "", inventory: { branches: 2 },
    position: { x: 5, y: 5 }, facing: "down", needs: { hunger: 0.6, fatigue: 0.2, loneliness: 0.3, thirst: 0.5 }, happiness: 0.5,
    relationships: { 2: 0.7 }, memories: [], currentActivity: "Observing", skills: {}, toolDurability: {},
    personality: { empathy: .5, sociability: .5, industriousness: .5, openness: .5, conscientiousness: .5, extraversion: .5, agreeableness: .5, emotionalSensitivity: .5, riskTolerance: .5, patience: .5, generosity: .5, dominance: .5, curiosity: .5, conformity: .5, aggression: .5, acquisitiveness: .5, independence: .5 },
    physical: { strength: .5, endurance: .5, health: .9, injury: 0, exposure: .1, age: 25, movementAbility: 1, temperatureTolerance: .5, illness: 0, alive: true },
    emotions: { fear: .1, anger: 0, hope: .5, contentment: .4, stress: .2, gratitude: 0, resentment: 0, confidence: .5, safety: .4 },
    values: { autonomy: .5, security: .5, community: .5, fairness: .5, status: .5, tradition: .5, equality: .5, wealth: .5, exploration: .5, family: .5, nature: .5 },
    socialRelationships: { 2: { trust: .7, affection: .4, fear: 0, respect: .3, debt: 0, grievance: 0 } },
    knowledge: { discoveredTiles: ["5,5"], knownResources: [], knownPeople: [2], learnedTechniques: [] },
  };
}

function request(): DecisionRequest {
  const first = citizen();
  const second = citizen(2);
  second.position = { x: 7, y: 5 };
  const candidates = buildActionCandidates({ tick: 1, stateVersion: 1, citizen: first, citizens: [first, second], stock: {}, constructionProgress: 0 });
  return {
    requestId: "request-1-1", policyVersion: "brain-v1",
    freshness: { requestedAtTick: 1, deadlineTick: 5, worldRevision: 1, npcRevision: 1, topologyRevision: 1, perceptionHash: "p", legalSetHash: "l" },
    perception: { tick: 1, stateVersion: 1, citizen: first, population: 2, visibleCitizens: [{ id: 1, position: first.position }, { id: 2, position: second.position }], stock: {}, constructionProgress: 0 },
    candidates,
  };
}

describe("phase-one learning contract", () => {
  it("keeps the cross-language golden decision fixture valid", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/decision-v1.json", import.meta.url), "utf8"));
    expect(fixture.schemaVersion).toBe(LEARNING_SCHEMA_VERSION);
    expect(fixture.decisions[0].observation).toHaveLength(OBSERVATION_DIMENSION);
    expect(fixture.decisions[0].observationMask).toHaveLength(OBSERVATION_DIMENSION);
    expect(fixture.decisions[0].candidates[0].features).toHaveLength(CANDIDATE_DIMENSION);
  });
  it("freezes exactly forty learning action families", () => {
    expect(LEARNING_ACTION_FAMILIES).toHaveLength(40);
    expect(new Set(LEARNING_ACTION_FAMILIES).size).toBe(40);
  });

  it("emits fixed finite vectors and masks", () => {
    const encoded = encodeDecisionRequest(request());
    expect(encoded.observation).toHaveLength(OBSERVATION_DIMENSION);
    expect(encoded.observationMask).toHaveLength(OBSERVATION_DIMENSION);
    expect(encoded.candidates.length).toBeGreaterThan(0);
    expect(encoded.candidates.every((candidate) => candidate.features.length === CANDIDATE_DIMENSION)).toBe(true);
    expect([...encoded.observation, ...encoded.observationMask, ...encoded.candidates.flatMap((candidate) => candidate.features)].every(Number.isFinite)).toBe(true);
  });

  it("does not encode unknown people from the provider's global visible list", () => {
    const base = request();
    const encoded = encodeDecisionRequest(base);
    const leaked = structuredClone(base);
    leaked.perception.visibleCitizens.push({ id: 99, position: { x: 6, y: 6 } });
    expect(stableHash(encodeDecisionRequest(leaked).observation)).toBe(stableHash(encoded.observation));
  });

  it("encodes only citizen-known resource slots and masks absent slots", () => {
    const input = request();
    input.perception.physicalWorld = {
      availableTrees: 1, availableStone: 0, harvestableCrops: 0, activeProjects: [], carriedMaterials: {}, homelessCitizens: 2, nearbyFireFuel: 0,
      knownResources: [{ id: "tree-known", kind: "tree", position: { x: 6, y: 5 }, yield: { wood: 4 }, status: "available", health: .8 }],
    };
    const encoded = encodeDecisionRequest(input);
    expect(encoded.observation.slice(101, 107).some((value) => value !== 0)).toBe(true);
    expect(encoded.observationMask.slice(107, 131).every((value) => value === 0)).toBe(true);
  });

  it("keeps exact candidates distinct within one action family", () => {
    const input = request();
    const original = input.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
    input.candidates = [{ ...original, id: "explore-a" }, { ...original, id: "explore-b" }];
    const encoded = encodeDecisionRequest(input);
    expect(encoded.candidates.map((candidate) => candidate.family)).toEqual(["idle", "idle"]);
    expect(encoded.candidates[0].features).not.toEqual(encoded.candidates[1].features);
  });
});
