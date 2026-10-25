import { stableHash } from "../stableHash";
import type { ActionCandidate, ActionIntent, DecisionRequest } from "../types";
import { CANDIDATE_DIMENSION, type EncodedBrainCandidate } from "./contracts";
import { learningActionIndex } from "./learningVocabulary";

const RESOURCE_KEYS = ["berries", "fish", "meat", "water", "unsafe_water", "wild_seed", "wheat_seed", "branches", "wood", "stone", "fiber", "clay", "medicine"];
const BUILDING_KEYS = ["campfire", "shelter", "storage-pile", "drying-rack", "garden-plot", "cottage", "well", "road", "workshop"];

function clamp(value: number, low = 0, high = 1) {
  return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : 0;
}

function hashBucket(value: unknown, buckets: number) {
  return Number.parseInt(stableHash(value).slice(0, 8), 16) % buckets;
}

function intentParameter(intent: ActionIntent | undefined, key: string): unknown {
  if (!intent || !(key in intent)) return undefined;
  return (intent as unknown as Record<string, unknown>)[key];
}

export function encodeCandidate(request: DecisionRequest, candidate: ActionCandidate): EncodedBrainCandidate {
  const features = Array.from({ length: CANDIDATE_DIMENSION }, () => 0);
  const family = candidate.intent?.kind ?? candidate.id;
  const familyIndex = learningActionIndex(family);
  if (familyIndex >= 0) features[familyIndex] = 1;
  features[40] = candidate.legal ? 1 : 0;
  features[41] = 1;

  const amount = Number(intentParameter(candidate.intent, "amount") ?? 0);
  features[42] = clamp(Math.log1p(Math.max(0, amount)) / Math.log(21));
  const x = Number(intentParameter(candidate.intent, "x"));
  const y = Number(intentParameter(candidate.intent, "y"));
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const dx = x - request.perception.citizen.position.x;
    const dy = y - request.perception.citizen.position.y;
    features[43] = clamp(Math.hypot(dx, dy) / 64);
    features[44] = clamp(dx / 64, -1, 1);
    features[45] = clamp(dy / 64, -1, 1);
  }

  const resource = String(intentParameter(candidate.intent, "resource") ?? intentParameter(candidate.intent, "offerResource") ?? "");
  const resourceIndex = RESOURCE_KEYS.indexOf(resource);
  features[46] = resourceIndex < 0 ? 0 : (resourceIndex + 1) / RESOURCE_KEYS.length;
  const building = String(intentParameter(candidate.intent, "buildingType") ?? "");
  const buildingIndex = BUILDING_KEYS.indexOf(building);
  features[47] = buildingIndex < 0 ? 0 : (buildingIndex + 1) / BUILDING_KEYS.length;

  const targetCitizenId = Number(intentParameter(candidate.intent, "targetCitizenId"));
  if (Number.isFinite(targetCitizenId)) {
    const relation = request.perception.citizen.socialRelationships?.[targetCitizenId];
    features[48] = relation?.trust ?? request.perception.citizen.relationships[targetCitizenId] ?? 0.5;
    features[49] = clamp((relation?.grievance ?? 0) / 10);
    features[50] = clamp((relation?.debt ?? 0) / 10);
  }

  const projectId = String(intentParameter(candidate.intent, "projectId") ?? "");
  const project = request.perception.physicalWorld?.activeProjects.find((item) => item.id === projectId);
  if (project) {
    features[51] = clamp(project.laborCompleted / Math.max(1, project.laborRequired));
    const required = Object.values(project.required).reduce((sum, value) => sum + value, 0);
    const delivered = Object.values(project.delivered).reduce((sum, value) => sum + value, 0);
    features[52] = clamp(delivered / Math.max(1, required));
  }

  // Eight deterministic identity buckets let the scorer distinguish exact
  // targets without giving semantic meaning to database or entity IDs.
  features[53 + hashBucket(candidate.id, 8)] = 1;
  features[61] = candidate.blockedBy ? 1 : 0;
  features[62] = familyIndex < 0 ? 1 : 0;
  features[63] = Number.parseInt(stableHash(candidate.intent ?? candidate.id).slice(0, 8), 16) / 0xffff_ffff;
  return { candidateId: candidate.id, family, features };
}

export function encodeCandidates(request: DecisionRequest) {
  return request.candidates.filter((candidate) => candidate.legal && learningActionIndex(candidate.intent?.kind) >= 0).map((candidate) => encodeCandidate(request, candidate));
}

