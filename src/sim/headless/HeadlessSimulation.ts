import { MockSimulation } from "../MockSimulation";
import { generatedWorldSeed } from "../generatedWorldSeed";
import { snapshotDigest } from "../snapshotDigest";
import type { BrainExperienceRecord } from "../learning/contracts";
import { BrainExperienceTracker } from "../learning/BrainExperienceTracker";
import type { CitizenSeed, SimulationSnapshot } from "../types";
import { citizenEpisodeResult, episodeMetrics } from "./episodeMetrics";
import type { EpisodeProgress, EpisodeResult, ExperimentConfig } from "./experimentTypes";
import { SIM_TICKS_PER_DAY, simulationDay } from "../time";

const ENGINE_VERSION = "freewill-sim-v7-integrity";

export function createExperimentCitizens(config: Pick<ExperimentConfig, "seed" | "population" | "brainIds">, spawn: { x: number; y: number }): CitizenSeed[] {
  return Array.from({ length: config.population }, (_, index) => ({
    id: index + 1,
    name: `Person ${index + 1}`,
    job: "unassigned",
    traits: [],
    goal: "",
    inventory: {},
    position: { x: spawn.x + index % 5 - 2, y: spawn.y + Math.floor(index / 5) - Math.floor(config.population / 10) },
    initialNeeds: { hunger: 0.28, fatigue: 0.18, loneliness: 0.25, thirst: 0.28 },
  }));
}

export class HeadlessSimulation {
  private readonly engine: MockSimulation;
  private readonly brainIds: string[];
  private readonly experienceTracker: BrainExperienceTracker;
  private readonly experiences: BrainExperienceRecord[] = [];
  private drainedExperienceCount = 0;
  private cancelled = false;
  private startedAt = performance.now();
  private terminalReason: EpisodeResult["terminalReason"] = "maximum-days";

  constructor(readonly config: ExperimentConfig) {
    if (config.population < 1 || config.population > 100) throw new Error("Headless population must be between 1 and 100.");
    if (config.maximumDays < 1 || config.maximumDays > 10_000) throw new Error("Headless maximum days must be between 1 and 10,000.");
    const world = generatedWorldSeed(config.seed, config.width ?? 64, config.height ?? 48, config.harshness ?? "balanced");
    const spawn = world.environment!.spawn;
    this.brainIds = config.brainIds ?? Array.from({ length: config.population }, (_, index) => `${config.experimentId}-g0-brain-${index + 1}`);
    if (this.brainIds.length !== config.population) throw new Error("The number of brain IDs must match the population.");
    this.experienceTracker = new BrainExperienceTracker(config.episodeId, (citizenId) => this.brainIds[citizenId - 1]);
    this.engine = new MockSimulation(config.seed, createExperimentCitizens(config, spawn), {}, undefined, config.provider, {
      timeoutMs: 15_000,
      policyVersion: "local-evolution-v1",
      maxInFlight: 32,
      fallbackMode: "wait",
    }, world, { societyGoal: "none" });
  }

  getSnapshot() {
    return this.engine.getSnapshot();
  }

  cancel() {
    this.cancelled = true;
    this.terminalReason = "cancelled";
    this.engine.destroy();
  }

  /** Returns each completed transition once so a local brain can learn during, not after, a lifetime. */
  drainExperiences() {
    const pending = this.experiences.slice(this.drainedExperienceCount);
    this.drainedExperienceCount = this.experiences.length;
    return structuredClone(pending);
  }

  async step() {
    if (this.cancelled) return null;
    const before = this.engine.getSnapshot();
    const day = simulationDay(before.tick);
    // A headless episode owns its engine and only publishes a detached result
    // at the end. Cloning the entire growing decision/event history every tick
    // turns long experiments into quadratic work.
    const result = await this.engine.step(day, { copySnapshot: false });
    if (!result) return null;
    if (this.engine.getPendingDecisionCount() >= Math.min(this.config.population, 8)) await this.engine.waitForPendingDecisions();
    this.collect(result.snapshot);
    return result;
  }

  async run(onProgress?: (progress: EpisodeProgress) => void | Promise<void>): Promise<EpisodeResult> {
    this.startedAt = performance.now();
    const maximumTicks = this.config.maximumDays * SIM_TICKS_PER_DAY;
    while (!this.cancelled && this.engine.getSnapshot().tick < maximumTicks) {
      const result = await this.step();
      if (!result) break;
      const snapshot = result.snapshot;
      const survivors = Object.values(snapshot.citizens).filter((citizen) => citizen.physical?.alive !== false).length;
      if (snapshot.tick % SIM_TICKS_PER_DAY === 0) await onProgress?.({ episodeId: this.config.episodeId, tick: snapshot.tick, day: Math.ceil(snapshot.tick / SIM_TICKS_PER_DAY), maximumDays: this.config.maximumDays, survivors, decisions: snapshot.decisions.length });
      // Orchestrated experiments expose progress and live observation. Yield
      // once per simulated day so the HTTP server can answer those reads; a
      // directly-driven engine keeps its original scheduling semantics.
      if (onProgress && snapshot.tick % SIM_TICKS_PER_DAY === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (survivors === 0) {
        this.terminalReason = "extinction";
        break;
      }
    }
    const snapshot = this.engine.getSnapshot();
    this.collect(snapshot);
    const result = this.result(snapshot);
    this.engine.destroy();
    return result;
  }

  private collect(snapshot: SimulationSnapshot) {
    this.experiences.push(...this.experienceTracker.collect(snapshot));
  }

  private result(snapshot: SimulationSnapshot): EpisodeResult {
    return {
      experimentId: this.config.experimentId,
      episodeId: this.config.episodeId,
      seed: this.config.seed,
      engineVersion: ENGINE_VERSION,
      terminalReason: this.cancelled ? "cancelled" : this.terminalReason,
      durationMs: performance.now() - this.startedAt,
      ticks: snapshot.tick,
      digest: snapshotDigest(snapshot),
      metrics: episodeMetrics(snapshot, this.config.maximumDays),
      citizens: Object.values(snapshot.citizens).sort((left, right) => left.id - right.id).map((citizen) => citizenEpisodeResult(snapshot, citizen, this.brainIds[citizen.id - 1], this.config.maximumDays)),
      experiences: structuredClone(this.experiences),
      snapshot,
    };
  }
}

