import type { BrainExperienceRecord } from "./contracts";
import type { CitizenState, DecisionRecord, SimulationSnapshot } from "../types";

interface DecisionBaseline {
  citizen: CitizenState;
  probability?: number;
}

function total(values: Record<string, number>) {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function skillTotal(citizen: CitizenState) {
  return Object.values(citizen.skills).reduce((sum, skill) => sum + skill.level, 0);
}

function relationshipTotal(citizen: CitizenState) {
  return Object.values(citizen.socialRelationships ?? {}).reduce((sum, relationship) => sum + relationship.trust + relationship.affection - relationship.grievance, 0);
}

/**
 * Converts completed engine actions into bounded learning transitions.
 * Evolutionary genomes are never modified here; these records update only the
 * episode-local action values owned by the brain service.
 */
export class BrainExperienceTracker {
  private readonly baselines = new Map<string, DecisionBaseline>();
  private readonly emitted = new Set<string>();

  constructor(
    private readonly episodeId: string,
    private readonly brainIdForCitizen: (citizenId: number) => string,
  ) {}

  collect(snapshot: SimulationSnapshot): BrainExperienceRecord[] {
    const experiences: BrainExperienceRecord[] = [];
    const retainedDecisionIds = new Set(snapshot.decisions.map((decision) => decision.id));
    for (const decisionId of this.emitted) if (!retainedDecisionIds.has(decisionId)) this.emitted.delete(decisionId);
    for (const decisionId of this.baselines.keys()) if (!retainedDecisionIds.has(decisionId)) this.baselines.delete(decisionId);
    for (const decision of snapshot.decisions) {
      const citizen = snapshot.citizens[decision.citizenId];
      if (!citizen) continue;
      if (!this.baselines.has(decision.id)) {
        const evaluation = decision.providerSignals?.evaluations.find((item) => item.candidateId === decision.selectedCandidateId);
        this.baselines.set(decision.id, { citizen: structuredClone(citizen), probability: evaluation?.probability });
      }
      if (decision.actionStatus === "in-progress" || this.emitted.has(decision.id)) continue;
      experiences.push(this.toExperience(decision, this.baselines.get(decision.id)!, citizen, snapshot.tick));
      this.emitted.add(decision.id);
      this.baselines.delete(decision.id);
    }
    return experiences;
  }

  private toExperience(decision: DecisionRecord, baseline: DecisionBaseline, citizen: CitizenState, currentTick: number): BrainExperienceRecord {
    const previous = baseline.citizen;
    return {
      experienceId: `${this.episodeId}:${decision.id}`,
      episodeId: this.episodeId,
      brainId: this.brainIdForCitizen(decision.citizenId),
      citizenId: decision.citizenId,
      decisionId: decision.id,
      tickStarted: decision.tick,
      tickCompleted: decision.completedAtTick ?? currentTick,
      selectedCandidateId: decision.selectedCandidateId,
      actionFamily: decision.selectedIntent?.kind ?? decision.selected,
      probability: baseline.probability,
      outcome: decision.actionStatus === "completed" ? "completed" : citizen.physical?.alive === false ? "death" : "cancelled",
      reason: decision.resolutionReason,
      deltas: {
        hunger: previous.needs.hunger - citizen.needs.hunger,
        thirst: (previous.needs.thirst ?? 0) - (citizen.needs.thirst ?? 0),
        fatigue: previous.needs.fatigue - citizen.needs.fatigue,
        loneliness: previous.needs.loneliness - citizen.needs.loneliness,
        health: (citizen.physical?.health ?? 0) - (previous.physical?.health ?? 0),
        injury: (previous.physical?.injury ?? 0) - (citizen.physical?.injury ?? 0),
        illness: (previous.physical?.illness ?? 0) - (citizen.physical?.illness ?? 0),
        exposure: (previous.physical?.exposure ?? 0) - (citizen.physical?.exposure ?? 0),
        inventory: total(citizen.inventory) - total(previous.inventory),
        relationships: relationshipTotal(citizen) - relationshipTotal(previous),
        skills: skillTotal(citizen) - skillTotal(previous),
        knowledge: (citizen.knowledge?.discoveredTiles.length ?? 0) - (previous.knowledge?.discoveredTiles.length ?? 0),
      },
      consequences: [...decision.consequences],
      terminal: citizen.physical?.alive === false,
    };
  }
}
