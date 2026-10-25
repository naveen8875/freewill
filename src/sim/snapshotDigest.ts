import type { SimulationSnapshot } from "./types";
import { stableHash } from "./stableHash";

export function snapshotDigest(snapshot: SimulationSnapshot) {
  const decisions = snapshot.decisions.map(({ latencyMs: _latencyMs, ...decision }) => decision);
  const replayRelevant = {
    schemaVersion: snapshot.schemaVersion,
    seed: snapshot.seed,
    tick: snapshot.tick,
    stateVersion: snapshot.stateVersion,
    worldRevision: snapshot.worldRevision,
    topology: snapshot.topology,
    activeActions: snapshot.activeActions,
    reservations: snapshot.reservations,
    cursor: snapshot.cursor,
    citizens: snapshot.citizens,
    stock: snapshot.stock,
    constructionProgress: snapshot.constructionProgress,
    civilizationGoal: snapshot.civilizationGoal,
    economy: snapshot.economy,
    politics: snapshot.politics,
    physicalWorld: snapshot.physicalWorld,
    decisions,
    events: snapshot.events,
    trends: snapshot.trends,
  };
  return stableHash(replayRelevant);
}
