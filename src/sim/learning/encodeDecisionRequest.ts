import type { DecisionRequest } from "../types";
import { stableHash } from "../stableHash";
import type { EncodedBrainDecision } from "./contracts";
import { encodeCandidates } from "./candidateEncoder";
import { encodeObservation } from "./observationEncoder";

export function encodeDecisionRequest(request: DecisionRequest, brainId = `brain-${request.perception.citizen.id}`): EncodedBrainDecision {
  const candidates = encodeCandidates(request);
  if (!candidates.length) throw new Error("The local brain received no legal phase-one learning candidates.");
  const { observation, observationMask } = encodeObservation(request);
  return {
    requestId: request.requestId,
    citizenId: request.perception.citizen.id,
    brainId,
    observation,
    observationMask,
    candidates,
    samplingSeed: Number.parseInt(stableHash({ requestId: request.requestId, freshness: request.freshness }).slice(0, 8), 16) >>> 0,
  };
}

