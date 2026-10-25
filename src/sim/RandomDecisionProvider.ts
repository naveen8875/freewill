import { stableHash } from "./stableHash";
import type { DecisionProvider, DecisionRequest, ProviderDecision } from "./types";

/** Deterministic random legal-choice control used by learning experiments. */
export class RandomDecisionProvider implements DecisionProvider {
  readonly descriptor = { kind: "test-delayed", id: "random-legal-control", label: "Random legal control", version: "1" } as const;

  constructor(private readonly seed: number) {}

  async decide(request: DecisionRequest): Promise<ProviderDecision> {
    const legal = request.candidates.filter((candidate) => candidate.legal);
    if (!legal.length) throw new Error("Random control received no legal candidates.");
    const value = Number.parseInt(stableHash({ seed: this.seed, requestId: request.requestId, hash: request.freshness.legalSetHash }).slice(0, 8), 16);
    const selected = legal[value % legal.length];
    return {
      requestId: request.requestId,
      selectedCandidateId: selected.id,
      provider: this.descriptor,
      signals: { kind: "heuristic", evaluations: legal.map((candidate) => ({ candidateId: candidate.id, probability: 1 / legal.length })) },
    };
  }
}
