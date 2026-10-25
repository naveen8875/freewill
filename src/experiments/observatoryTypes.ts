import type {
  ActionInstance,
  BuildingState,
  ConstructionProjectState,
  DecisionRecord,
  MemoryRecord,
  PhysicalProfile,
  ResourceNodeState,
  SimulationEvent,
  SimulationSnapshot,
  SocialGroupState,
} from "../sim/types";
import type { ExperimentCohort, ExperimentProgressState, ExperimentStatus } from "./types";

export interface ObservatoryCitizen {
  id: number;
  name: string;
  position: { x: number; y: number };
  facing: "up" | "down" | "left" | "right";
  traits: string[];
  needs: { hunger: number; fatigue: number; loneliness: number; thirst?: number };
  happiness: number;
  inventory: Record<string, number>;
  currentActivity: string;
  currentActionId?: string;
  lastDecisionId?: string;
  groupIds: string[];
  householdId?: string;
  physical?: PhysicalProfile;
  knowledge: { discoveredTiles: number; knownResources: number; knownPeople: number; learnedTechniques: string[] };
  memories: MemoryRecord[];
}

export interface ObservatorySnapshot {
  tick: number;
  width: number;
  height: number;
  walkable: number[];
  biomes: string[];
  hazards: number[];
  citizens: ObservatoryCitizen[];
  resources: ResourceNodeState[];
  projects: ConstructionProjectState[];
  buildings: BuildingState[];
  actions: ActionInstance[];
  decisions: DecisionRecord[];
  events: SimulationEvent[];
  groups: SocialGroupState[];
}

export interface ObservatoryEpisode {
  episodeId: string;
  generation: number;
  cohort: ExperimentCohort;
  seed: number;
  replicate: number;
  day: number;
  maximumDays: number;
  survivors: number;
  live: boolean;
  replay: {
    minimumTick: number;
    maximumTick: number;
    displayTick: number;
    checkpointTicks: number[];
  };
  snapshot: ObservatorySnapshot;
}

export interface ExperimentObservatoryPayload {
  experiment: {
    id: string;
    name: string;
    status: ExperimentStatus;
    progress: ExperimentProgressState;
  };
  episodes: ObservatoryEpisode[];
  sampledAt: number;
}

export function compactObservatorySnapshot(snapshot: SimulationSnapshot): ObservatorySnapshot {
  const latestDecisionByCitizen = new Map<number, DecisionRecord>();
  for (let index = snapshot.decisions.length - 1; index >= 0; index -= 1) {
    const decision = snapshot.decisions[index];
    if (!latestDecisionByCitizen.has(decision.citizenId)) latestDecisionByCitizen.set(decision.citizenId, decision);
  }
  return {
    tick: snapshot.tick,
    width: snapshot.topology.width,
    height: snapshot.topology.height,
    walkable: snapshot.topology.walkable,
    biomes: snapshot.topology.environment?.biomes ?? [],
    hazards: snapshot.topology.environment?.hazard ?? [],
    citizens: Object.values(snapshot.citizens).sort((left, right) => left.id - right.id).map((citizen) => ({
      id: citizen.id,
      name: citizen.name,
      position: citizen.position,
      facing: citizen.facing,
      traits: citizen.traits,
      needs: citizen.needs,
      happiness: citizen.happiness,
      inventory: citizen.inventory,
      currentActivity: citizen.currentActivity,
      currentActionId: citizen.currentActionId,
      lastDecisionId: citizen.lastDecisionId,
      groupIds: citizen.groupIds ?? [],
      householdId: citizen.householdId,
      physical: citizen.physical,
      knowledge: {
        discoveredTiles: citizen.knowledge?.discoveredTiles.length ?? 0,
        knownResources: citizen.knowledge?.knownResources.length ?? 0,
        knownPeople: citizen.knowledge?.knownPeople.length ?? 0,
        learnedTechniques: citizen.knowledge?.learnedTechniques ?? [],
      },
      memories: citizen.memories.slice(-4),
    })),
    resources: Object.values(snapshot.physicalWorld.resources),
    projects: Object.values(snapshot.physicalWorld.projects),
    buildings: Object.values(snapshot.physicalWorld.buildings),
    actions: Object.values(snapshot.activeActions),
    decisions: [...latestDecisionByCitizen.values()].sort((left, right) => right.tick - left.tick),
    events: snapshot.events.slice(-40),
    groups: Object.values(snapshot.socialGroups),
  };
}
