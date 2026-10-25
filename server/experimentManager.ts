import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { HeadlessSimulation } from "../src/sim/headless/HeadlessSimulation.js";
import { MockSimulation } from "../src/sim/MockSimulation.js";
import type { EpisodeResult } from "../src/sim/headless/experimentTypes.js";
import { LocalBrainDecisionProvider } from "../src/sim/LocalBrainDecisionProvider.js";
import { MockDecisionProvider } from "../src/sim/MockDecisionProvider.js";
import { RandomDecisionProvider } from "../src/sim/RandomDecisionProvider.js";
import type { DecisionProvider } from "../src/sim/types.js";
import type {
  BrainGenerationSummary,
  BrainMutationSummary,
  BrainSpeciesSummary,
  BrainTopologySummary,
  ExperimentCohort,
  ExperimentEpisodeSummary,
  LearningExperimentConfig,
  LearningExperimentState,
} from "../src/experiments/types.js";
import { compactObservatorySnapshot, type ExperimentObservatoryPayload, type ObservatoryEpisode } from "../src/experiments/observatoryTypes.js";
import { LEARNING_SCHEMA_VERSION, type BrainExperienceBatch } from "../src/sim/learning/contracts.js";
import { SIM_TICKS_PER_DAY, simulationDay } from "../src/sim/time.js";

interface EvolutionResponse {
  experimentId: string;
  generation: number;
  children: Array<{
    brainId: string;
    parentId: string | null;
    parentIds: string[];
    kind: "elite" | "mutation" | "crossover" | "immigrant";
    artifactHash: string;
    magnitude: number;
    speciesId: string;
    mutations: BrainMutationSummary[];
    topology: BrainTopologySummary;
  }>;
  species: BrainSpeciesSummary[];
  ranking: string[];
}

interface EvolutionAnalysis {
  experimentId: string;
  generation: number;
  species: BrainSpeciesSummary[];
  ranking: string[];
}

interface StoredEpisodeReplay {
  id: string;
  generation: number;
  cohort: ExperimentCohort;
  seed: number;
  result: { snapshot?: EpisodeResult["snapshot"] };
}

interface ReplayCursor {
  engine: MockSimulation;
  tick: number;
  decisions: Map<number, EpisodeResult["snapshot"]["decisions"]>;
  source: EpisodeResult["snapshot"];
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function episodeIdentity(episodeId: string) {
  const match = episodeId.match(/-g(\d+)-(training|random-control|heuristic-control|unevolved-control|evolved-evaluation)-s(\d+)-r(\d+)$/);
  return match ? {
    generation: Number(match[1]),
    cohort: match[2] as ExperimentCohort,
    seed: Number(match[3]),
    replicate: Number(match[4]),
  } : { generation: 0, cohort: "training" as const, seed: 0, replicate: 0 };
}

function snapshotAtTick(snapshot: EpisodeResult["snapshot"], requestedTick?: number) {
  const minimumTick = snapshot.checkpoints.some((checkpoint) => checkpoint.tick === 0)
    ? 0
    : Math.min(snapshot.tick, ...snapshot.checkpoints.map((checkpoint) => checkpoint.tick));
  const displayTick = requestedTick === undefined
    ? snapshot.tick
    : Math.max(minimumTick, Math.min(snapshot.tick, Math.trunc(requestedTick)));
  if (displayTick === snapshot.tick) return { snapshot, minimumTick, displayTick };
  const replay = new MockSimulation(snapshot.seed, [], {}, snapshot);
  try {
    return { snapshot: replay.getHistoricalSnapshot(displayTick), minimumTick, displayTick };
  } finally {
    replay.destroy();
  }
}

function validateConfig(input: Partial<LearningExperimentConfig>): LearningExperimentConfig {
  const uniqueSeeds = (values: unknown, fallback: number[]) => Array.isArray(values)
    ? [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 2_147_483_647))]
    : fallback;
  const config: LearningExperimentConfig = {
    name: String(input.name ?? "Local evolution experiment").trim().slice(0, 160) || "Local evolution experiment",
    population: Math.trunc(Number(input.population ?? 20)),
    days: Math.trunc(Number(input.days ?? 30)),
    generations: Math.trunc(Number(input.generations ?? 3)),
    replicates: Math.trunc(Number(input.replicates ?? 2)),
    trainingSeeds: uniqueSeeds(input.trainingSeeds, [2_610, 4_217, 8_031, 9_901]),
    heldOutSeeds: uniqueSeeds(input.heldOutSeeds, [13_337, 44_021]),
    harshness: ["gentle", "balanced", "harsh"].includes(String(input.harshness)) ? input.harshness! : "balanced",
    width: Math.trunc(Number(input.width ?? 64)),
    height: Math.trunc(Number(input.height ?? 48)),
    profile: ["eco", "balanced", "demo"].includes(String(input.profile)) ? input.profile! : "balanced",
  };
  if (config.population < 4 || config.population > 100) throw new Error("Experiment population must be between 4 and 100.");
  if (config.days < 1 || config.days > 100) throw new Error("Experiment days must be between 1 and 100.");
  if (config.generations < 1 || config.generations > 50) throw new Error("Experiment generations must be between 1 and 50.");
  if (config.replicates < 1 || config.replicates > 10) throw new Error("Experiment replicates must be between 1 and 10.");
  if (!config.trainingSeeds.length || config.trainingSeeds.length > 20) throw new Error("Provide between 1 and 20 training seeds.");
  if (!config.heldOutSeeds.length || config.heldOutSeeds.length > 10) throw new Error("Provide between 1 and 10 held-out seeds.");
  if (config.trainingSeeds.some((seed) => config.heldOutSeeds.includes(seed))) throw new Error("Training and held-out seeds must be disjoint.");
  if (config.width < 32 || config.width > 192 || config.height < 24 || config.height > 192) throw new Error("Experiment dimensions are out of range.");
  return config;
}

export class ExperimentManager {
  private readonly experiments = new Map<string, LearningExperimentState>();
  private readonly active = new Map<string, Map<string, HeadlessSimulation>>();
  private readonly cancelled = new Set<string>();
  private readonly lineageMemory = new Map<string, EvolutionResponse["children"]>();
  private readonly completedEpisodeReplay = new Map<string, StoredEpisodeReplay>();
  private readonly replayCursors = new Map<string, ReplayCursor>();
  private readonly fetchImpl: typeof fetch;
  private readonly brainServiceUrl: string;
  private readonly brainToken?: string;
  private creating = false;

  constructor(private readonly pool: Pool | null, options: { fetchImpl?: typeof fetch; brainServiceUrl?: string; brainToken?: string } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.brainServiceUrl = (options.brainServiceUrl ?? process.env.BRAIN_SERVICE_URL ?? "http://127.0.0.1:8008").replace(/\/$/, "");
    this.brainToken = options.brainToken ?? process.env.FREEWILL_BRAIN_TOKEN;
  }

  private rememberCompletedEpisode(experimentId: string, episode: StoredEpisodeReplay) {
    this.completedEpisodeReplay.delete(experimentId);
    this.completedEpisodeReplay.set(experimentId, episode);
    while (this.completedEpisodeReplay.size > 6) {
      const oldest = this.completedEpisodeReplay.keys().next().value;
      if (!oldest) break;
      this.completedEpisodeReplay.delete(oldest);
      for (const [key, cursor] of this.replayCursors) {
        if (!key.startsWith(`${oldest}:`)) continue;
        cursor.engine.destroy();
        this.replayCursors.delete(key);
      }
    }
  }

  private completedSnapshotAtTick(experimentId: string, episodeId: string, source: EpisodeResult["snapshot"], requestedTick?: number) {
    if (requestedTick === undefined) return snapshotAtTick(source);
    const minimumTick = source.checkpoints.some((checkpoint) => checkpoint.tick === 0)
      ? 0
      : Math.min(source.tick, ...source.checkpoints.map((checkpoint) => checkpoint.tick));
    const displayTick = Math.max(minimumTick, Math.min(source.tick, Math.trunc(requestedTick)));
    const key = `${experimentId}:${episodeId}`;
    const cursor = this.replayCursors.get(key);
    if (cursor && displayTick > cursor.tick && displayTick - cursor.tick <= 24) {
      for (let tick = cursor.tick + 1; tick <= displayTick; tick += 1) {
        const day = source.events.find((event) => event.tick === tick)?.day ?? simulationDay(tick - 1);
        cursor.engine.replayTick(cursor.decisions.get(tick), day);
      }
      cursor.tick = displayTick;
      return { snapshot: cursor.engine.getSnapshot(), minimumTick, displayTick };
    }
    const historical = snapshotAtTick(source, displayTick);
    cursor?.engine.destroy();
    const decisions = new Map<number, EpisodeResult["snapshot"]["decisions"]>();
    for (const decision of [...source.decisions].reverse()) {
      const atTick = decisions.get(decision.tick) ?? [];
      atTick.push(decision);
      decisions.set(decision.tick, atTick);
    }
    this.replayCursors.set(key, {
      engine: new MockSimulation(source.seed, [], {}, historical.snapshot),
      tick: displayTick,
      decisions,
      source,
    });
    return historical;
  }

  async recoverInterrupted() {
    if (!this.pool) return 0;
    const message = "Interrupted by an app restart. The saved configuration can be retried safely.";
    const result = await this.pool.query("UPDATE learning_experiments SET status='failed', error=$1, progress=jsonb_set(jsonb_set(progress,'{stage}','\"failed\"'::jsonb),'{message}',to_jsonb($1::text)), updated_at=now() WHERE status IN ('queued','running') RETURNING id", [message]);
    const episodes = await this.pool.query<{ id: string }>("UPDATE learning_episodes SET status='failed', result=$1::jsonb, completed_at=now() WHERE status='running' RETURNING id", [JSON.stringify({ error: message })]);
    await Promise.allSettled(episodes.rows.map((episode) => this.brainRequest(`/v1/episodes/${encodeURIComponent(episode.id)}/finish`, { saveCheckpoint: false })));
    return result.rowCount ?? 0;
  }

  async create(input: Partial<LearningExperimentConfig>) {
    if (this.creating) throw new Error("Another evolution experiment is already starting.");
    this.creating = true;
    try {
      const inMemory = [...this.experiments.values()].find((experiment) => experiment.status === "queued" || experiment.status === "running");
      const inDatabase = !inMemory && this.pool
        ? (await this.pool.query<{ id: string }>("SELECT id FROM learning_experiments WHERE status IN ('queued','running') ORDER BY created_at LIMIT 1")).rows[0]
        : undefined;
      const activeId = inMemory?.id ?? inDatabase?.id;
      if (activeId) throw new Error(`Evolution experiment ${activeId} is already running. Cancel it before starting another.`);
      const config = validateConfig(input);
      const id = randomUUID();
      const totalEpisodes = (config.generations * config.trainingSeeds.length + config.heldOutSeeds.length * 4) * config.replicates;
      const now = Date.now();
      const state: LearningExperimentState = {
        id,
        name: config.name,
        status: "queued",
        config,
        progress: { stage: "queued", generation: 0, totalGenerations: config.generations, completedEpisodes: 0, totalEpisodes, message: "Waiting to start" },
        generations: [],
        evaluations: [],
        createdAt: now,
        updatedAt: now,
      };
      this.experiments.set(id, state);
      await this.persistState(state);
      void this.run(state);
      return structuredClone(state);
    } finally {
      this.creating = false;
    }
  }

  async list() {
    if (!this.pool) return [...this.experiments.values()].sort((left, right) => right.updatedAt - left.updatedAt).map((item) => structuredClone(item));
    const rows = await this.pool.query<{ id: string; name: string; status: LearningExperimentState["status"]; config: LearningExperimentConfig; progress: LearningExperimentState["progress"]; error?: string; created_at_ms: string; updated_at_ms: string }>(`
      SELECT id, name, status, config, progress, error,
        (extract(epoch FROM created_at) * 1000)::bigint AS created_at_ms,
        (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_ms
      FROM learning_experiments ORDER BY updated_at DESC LIMIT 100
    `);
    return rows.rows.map((row) => this.experiments.get(row.id) ?? ({ id: row.id, name: row.name, status: row.status, config: row.config, progress: row.progress, generations: [], evaluations: [], createdAt: Number(row.created_at_ms), updatedAt: Number(row.updated_at_ms), error: row.error }));
  }

  async get(id: string) {
    const memory = this.experiments.get(id);
    if (memory) return structuredClone(memory);
    if (!this.pool) return null;
    const result = await this.pool.query<{ id: string; name: string; status: LearningExperimentState["status"]; config: LearningExperimentConfig; progress: LearningExperimentState["progress"]; error?: string; created_at_ms: string; updated_at_ms: string }>(`
      SELECT id, name, status, config, progress, error,
        (extract(epoch FROM created_at) * 1000)::bigint AS created_at_ms,
        (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at_ms
      FROM learning_experiments WHERE id = $1
    `, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const generations = await this.pool.query<{ summary: BrainGenerationSummary }>("SELECT summary FROM learning_generations WHERE experiment_id = $1 ORDER BY generation", [id]);
    const episodes = await this.pool.query<{ result: { summary?: ExperimentEpisodeSummary }; cohort: ExperimentCohort }>("SELECT result, cohort FROM learning_episodes WHERE experiment_id = $1 AND cohort <> 'training' AND status = 'completed' ORDER BY created_at", [id]);
    return { id: row.id, name: row.name, status: row.status, config: row.config, progress: row.progress, generations: generations.rows.map((item) => item.summary), evaluations: episodes.rows.flatMap((item) => item.result?.summary ? [item.result.summary] : []), createdAt: Number(row.created_at_ms), updatedAt: Number(row.updated_at_ms), error: row.error } satisfies LearningExperimentState;
  }

  /** A bounded, read-only view of live headless worlds for the observatory UI. */
  async observatory(id: string, options: { episodeId?: string; tick?: number } = {}): Promise<ExperimentObservatoryPayload | null> {
    const state = await this.get(id);
    if (!state) return null;
    const activeEpisodes = this.active.get(id);
    let episodes: ObservatoryEpisode[] = [];
    if (activeEpisodes?.size) {
      episodes = [...activeEpisodes.entries()].map(([episodeId, simulation]) => {
        const sourceSnapshot = simulation.getSnapshot();
        const historical = episodeId === options.episodeId ? snapshotAtTick(sourceSnapshot, options.tick) : snapshotAtTick(sourceSnapshot);
        const snapshot = historical.snapshot;
        const identity = episodeIdentity(episodeId);
        return {
          episodeId,
          ...identity,
          day: Math.min(state.config.days, Math.ceil(snapshot.tick / SIM_TICKS_PER_DAY)),
          maximumDays: state.config.days,
          survivors: Object.values(snapshot.citizens).filter((citizen) => citizen.physical?.alive !== false).length,
          live: true,
          replay: { minimumTick: historical.minimumTick, maximumTick: sourceSnapshot.tick, displayTick: historical.displayTick, checkpointTicks: sourceSnapshot.checkpoints.map((checkpoint) => checkpoint.tick) },
          snapshot: compactObservatorySnapshot(snapshot),
        };
      }).sort((left, right) => left.episodeId.localeCompare(right.episodeId));
    } else if (this.pool) {
      let episode = this.completedEpisodeReplay.get(id);
      if (!episode || (options.episodeId && episode.id !== options.episodeId)) {
        const stored = await this.pool.query<StoredEpisodeReplay>(`
          SELECT id,generation,cohort,seed,result FROM learning_episodes
          WHERE experiment_id=$1 AND status='completed' AND result ? 'snapshot'
          ORDER BY completed_at DESC LIMIT 1
        `, [id]);
        episode = stored.rows[0];
        if (episode) this.rememberCompletedEpisode(id, episode);
      }
      if (episode?.result.snapshot) {
        const identity = episodeIdentity(episode.id);
        const sourceSnapshot = episode.result.snapshot;
        const historical = !options.episodeId || episode.id === options.episodeId
          ? this.completedSnapshotAtTick(id, episode.id, sourceSnapshot, options.tick)
          : snapshotAtTick(sourceSnapshot);
        const snapshot = historical.snapshot;
        episodes = [{
          episodeId: episode.id,
          generation: episode.generation,
          cohort: episode.cohort,
          seed: episode.seed,
          replicate: identity.replicate,
          day: Math.min(state.config.days, Math.ceil(snapshot.tick / SIM_TICKS_PER_DAY)),
          maximumDays: state.config.days,
          survivors: Object.values(snapshot.citizens).filter((citizen) => citizen.physical?.alive !== false).length,
          live: false,
          replay: { minimumTick: historical.minimumTick, maximumTick: sourceSnapshot.tick, displayTick: historical.displayTick, checkpointTicks: sourceSnapshot.checkpoints.map((checkpoint) => checkpoint.tick) },
          snapshot: compactObservatorySnapshot(snapshot),
        }];
      }
    }
    return {
      experiment: { id: state.id, name: state.name, status: state.status, progress: state.progress },
      episodes,
      sampledAt: Date.now(),
    };
  }

  async cancel(id: string) {
    const state = this.experiments.get(id);
    if (!state) return false;
    this.cancelled.add(id);
    for (const simulation of this.active.get(id)?.values() ?? []) simulation.cancel();
    state.status = "cancelled";
    state.progress = { ...state.progress, stage: "cancelled", message: "Cancelled by the observer" };
    state.updatedAt = Date.now();
    await this.persistState(state);
    return true;
  }

  async retry(id: string) {
    const previous = await this.get(id);
    if (!previous) return null;
    if (previous.status !== "failed" && previous.status !== "cancelled") throw new Error("Only failed or cancelled experiments can be retried.");
    return this.create({ ...previous.config, name: `${previous.name} retry` });
  }

  async lineage(id: string) {
    if (!this.pool) {
      const state = this.experiments.get(id);
      const children = this.lineageMemory.get(id) ?? [];
      const initial = state?.generations[0]?.brainIds ?? [];
      return {
        nodes: [
          ...initial.map((brainId) => ({ brainId, generation: 0, artifactHash: null, kind: "founder" })),
          ...children.map((child) => ({ brainId: child.brainId, generation: Number(child.brainId.match(/-g(\d+)-/)?.[1] ?? 0), artifactHash: child.artifactHash, kind: child.kind, speciesId: child.speciesId, mutations: child.mutations, topology: child.topology, parentIds: child.parentIds })),
        ],
        edges: children.flatMap((child) => child.parentIds.map((parentId) => ({ parentId, childId: child.brainId, kind: child.kind, magnitude: child.magnitude }))),
      };
    }
    const [nodes, edges] = await Promise.all([
      this.pool.query<{ brain_id: string; generation: number; artifact_hash: string | null; kind: string | null; metadata: Record<string, unknown> }>(`
        SELECT g.id AS brain_id, g.generation, g.artifact_hash, g.metadata, m.mutation_kind AS kind
        FROM brain_genomes g LEFT JOIN brain_mutations m ON m.child_id = g.id
        WHERE g.id LIKE $1 OR m.experiment_id = $2 ORDER BY g.generation, g.id
      `, [`${id}%`, id]),
      this.pool.query<{ parent_id: string; child_id: string; mutation_kind: string; magnitude: number }>(`
        SELECT e.parent_id,e.child_id,e.mutation_kind,e.magnitude
        FROM brain_lineage_edges e JOIN brain_mutations m ON m.child_id=e.child_id
        WHERE m.experiment_id=$1 ORDER BY e.generation,e.child_id
      `, [id]),
    ]);
    return {
      nodes: nodes.rows.map((row) => ({ brainId: row.brain_id, generation: row.generation, artifactHash: row.artifact_hash, kind: row.kind ?? "founder", ...row.metadata })),
      edges: edges.rows.map((row) => ({ parentId: row.parent_id, childId: row.child_id, kind: row.mutation_kind, magnitude: row.magnitude })),
    };
  }

  async export(id: string) {
    const experiment = await this.get(id);
    if (!experiment) return null;
    return {
      format: "freewill-brain-experiment",
      schemaVersion: LEARNING_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      experiment,
      lineage: await this.lineage(id),
      artifactPolicy: "Content-addressed Safetensors remain in the local brain volume; artifact hashes make the bundle verifiable.",
    };
  }

  private async run(state: LearningExperimentState) {
    try {
      state.status = "running";
      state.progress = { ...state.progress, stage: "training", message: "Evaluating generation 0" };
      await this.persistState(state);
      const initialBrainIds = Array.from({ length: state.config.population }, (_, index) => `${state.id}-g0-brain-${index + 1}`);
      let brainIds = initialBrainIds;
      let previousResults: EpisodeResult[] | undefined;
      for (let generation = 0; generation < state.config.generations; generation += 1) {
        if (this.cancelled.has(state.id)) return;
        const trainingTasks: Array<() => Promise<EpisodeResult>> = [];
        for (const seed of state.config.trainingSeeds) {
          for (let replicate = 0; replicate < state.config.replicates; replicate += 1) {
            trainingTasks.push(() => this.runEpisode(state, generation, seed, replicate, "training", brainIds));
          }
        }
        const results = await this.runEpisodeTasks(state, trainingTasks);
        if (this.cancelled.has(state.id)) return;
        const fitness = brainIds.map((brainId, index) => ({
          brainId,
          fitness: Array.from({ length: 7 }, (_, dimension) => median(results.map((result) => result.citizens[index]?.fitness[dimension] ?? 0))),
          novelty: median(results.map((result) => result.citizens[index]?.fitness[6] ?? 0)),
        }));
        const evolutionBody = { experimentId: state.id, generation, seed: (state.config.trainingSeeds[0] + generation * 97) >>> 0, populationSize: state.config.population, members: fitness };
        const analysis = await this.brainRequest<EvolutionAnalysis>("/v1/evolution/analyze", evolutionBody);
        const summary = this.summarizeGeneration(generation, brainIds, results, previousResults);
        summary.species = analysis.species;
        summary.ranking = analysis.ranking;
        state.generations.push(summary);
        await this.persistGeneration(state.id, summary);
        if (generation < state.config.generations - 1) {
          state.progress = { ...state.progress, stage: "evolving", generation, message: `Selecting and mutating generation ${generation + 1}` };
          await this.persistState(state);
          const evolved = await this.brainRequest<EvolutionResponse>("/v1/evolution/jobs", evolutionBody);
          brainIds = evolved.children.map((child) => child.brainId);
          await this.persistChildren(state.id, evolved.children, evolved.generation);
        }
        previousResults = results;
      }

      state.progress = { ...state.progress, stage: "evaluating", generation: state.config.generations - 1, message: "Running held-out controls" };
      await this.persistState(state);
      const evaluationTasks: Array<() => Promise<EpisodeResult>> = [];
      for (const seed of state.config.heldOutSeeds) {
        for (let replicate = 0; replicate < state.config.replicates; replicate += 1) {
          const providerSeed = (seed + replicate * 1_000_003) >>> 0;
          evaluationTasks.push(
            () => this.runEpisode(state, 0, seed, replicate, "random-control", initialBrainIds, new RandomDecisionProvider(providerSeed)),
            () => this.runEpisode(state, 0, seed, replicate, "heuristic-control", initialBrainIds, new MockDecisionProvider(providerSeed)),
            () => this.runEpisode(state, 0, seed, replicate, "unevolved-control", initialBrainIds),
            () => this.runEpisode(state, state.config.generations - 1, seed, replicate, "evolved-evaluation", brainIds),
          );
        }
      }
      await this.runEpisodeTasks(state, evaluationTasks);
      if (this.cancelled.has(state.id)) return;
      const cohortOrder: ExperimentCohort[] = ["random-control", "heuristic-control", "unevolved-control", "evolved-evaluation"];
      state.evaluations.sort((left, right) => left.seed - right.seed || left.replicate - right.replicate || cohortOrder.indexOf(left.cohort) - cohortOrder.indexOf(right.cohort));
      state.status = "completed";
      state.progress = { ...state.progress, stage: "complete", currentEpisodeId: undefined, currentDay: undefined, survivors: undefined, completedEpisodes: state.progress.totalEpisodes, message: "Experiment complete" };
      state.updatedAt = Date.now();
      await this.persistState(state);
    } catch (cause) {
      if (this.cancelled.has(state.id)) return;
      state.status = "failed";
      state.error = cause instanceof Error ? cause.message : "Experiment failed.";
      state.progress = { ...state.progress, stage: "failed", message: state.error };
      state.updatedAt = Date.now();
      await this.persistState(state);
    } finally {
      this.active.delete(state.id);
    }
  }

  private provider(state: LearningExperimentState, episodeId: string, brainIds: string[]) {
    return new LocalBrainDecisionProvider({
      episodeId,
      endpoint: `${this.brainServiceUrl}/v1/decide-batch`,
      fetchImpl: this.authorizedFetch.bind(this),
      brainIdForCitizen: (citizenId) => brainIds[citizenId - 1],
      batchWindowMs: state.config.profile === "eco" ? 1 : 0,
    });
  }

  /**
   * Balanced mode evaluates two independent islands at once. Results retain
   * task order, so concurrency changes wall-clock time without changing the
   * generation's deterministic seed/replicate ordering.
   */
  private async runEpisodeTasks(state: LearningExperimentState, tasks: Array<() => Promise<EpisodeResult>>) {
    const results = new Array<EpisodeResult>(tasks.length);
    const concurrency = state.config.profile === "balanced" ? 2 : 1;
    let nextIndex = 0;
    let failure: unknown;
    let failed = false;
    const worker = async () => {
      while (!failed && !this.cancelled.has(state.id)) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= tasks.length) return;
        try {
          results[index] = await tasks[index]();
        } catch (cause) {
          if (!failed) {
            failed = true;
            failure = cause;
            for (const simulation of this.active.get(state.id)?.values() ?? []) simulation.cancel();
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
    if (failed) throw failure;
    return results.slice(0, nextIndex);
  }

  private async runEpisode(state: LearningExperimentState, generation: number, seed: number, replicate: number, cohort: ExperimentCohort, brainIds: string[], overrideProvider?: DecisionProvider) {
    const episodeId = `${state.id}-g${generation}-${cohort}-s${seed}-r${replicate}`;
    state.progress = { ...state.progress, stage: cohort === "training" ? "training" : "evaluating", generation, currentEpisodeId: episodeId, currentSeed: seed, currentDay: 0, maximumDay: state.config.days, message: `${cohort.replaceAll("-", " ")} · seed ${seed}` };
    await this.persistState(state);
    const usesLocalBrain = overrideProvider === undefined;
    let created = false;
    let simulation: HeadlessSimulation | undefined;
    await this.persistEpisodeStart(state.id, episodeId, generation, cohort, seed);
    try {
      const createdEpisode = usesLocalBrain
        ? await this.brainRequest<{ brains?: Array<{ brainId: string; artifactHash: string; topology?: BrainTopologySummary }> }>("/v1/episodes", { episodeId, brainIds })
        : undefined;
      created = usesLocalBrain;
      const artifacts = new Map(createdEpisode?.brains?.map((brain) => [brain.brainId, { artifactHash: brain.artifactHash, topology: brain.topology }]) ?? []);
      simulation = new HeadlessSimulation({
        experimentId: state.id, episodeId, seed, width: state.config.width, height: state.config.height,
        harshness: state.config.harshness, population: state.config.population, maximumDays: state.config.days,
        provider: overrideProvider ?? this.provider(state, episodeId, brainIds), brainIds,
      });
      const activeEpisodes = this.active.get(state.id) ?? new Map<string, HeadlessSimulation>();
      activeEpisodes.set(episodeId, simulation);
      this.active.set(state.id, activeEpisodes);
      const result = await simulation.run(async (progress) => {
        state.progress = {
          ...state.progress,
          currentEpisodeId: episodeId,
          currentSeed: seed,
          currentDay: progress.day,
          survivors: progress.survivors,
          message: `${cohort.replaceAll("-", " ")} · seed ${seed}${activeEpisodes.size > 1 ? ` · ${activeEpisodes.size} islands active` : ""}`,
        };
        state.updatedAt = Date.now();
        if (cohort === "training") await this.sendExperiences(episodeId, simulation!.drainExperiences());
      });
      if (cohort === "training") await this.sendExperiences(episodeId, simulation.drainExperiences());
      let lifetime: { checkpoint?: { artifactHash?: string } } | undefined;
      if (usesLocalBrain) lifetime = await this.brainRequest(`/v1/episodes/${encodeURIComponent(episodeId)}/finish`, { saveCheckpoint: true });
      created = false;
      const summary: ExperimentEpisodeSummary = { episodeId, generation, cohort, seed, replicate, durationMs: result.durationMs, digest: result.digest, metrics: result.metrics };
      if (cohort !== "training") state.evaluations.push(summary);
      state.progress = { ...state.progress, completedEpisodes: state.progress.completedEpisodes + 1 };
      state.updatedAt = Date.now();
      await this.persistEpisodeResult(result, summary, generation, cohort, artifacts);
      if (lifetime?.checkpoint?.artifactHash) await this.persistLifetimeCheckpoint(result, lifetime.checkpoint.artifactHash);
      await this.persistState(state);
      return result;
    } catch (cause) {
      simulation?.cancel();
      const message = this.errorMessage(cause);
      if (created) await this.brainRequest(`/v1/episodes/${encodeURIComponent(episodeId)}/finish`, { saveCheckpoint: false }).catch(() => undefined);
      await this.persistEpisodeFailure(episodeId, message);
      throw new Error(`${cohort.replaceAll("-", " ")} episode failed at day ${state.progress.currentDay ?? 0}: ${message}`);
    } finally {
      const activeEpisodes = this.active.get(state.id);
      activeEpisodes?.delete(episodeId);
      if (!activeEpisodes?.size) this.active.delete(state.id);
    }
  }

  private async sendExperiences(episodeId: string, experiences: BrainExperienceBatch["experiences"]) {
    if (!experiences.length) return;
    await this.brainRequest("/v1/experience-batch", { schemaVersion: LEARNING_SCHEMA_VERSION, episodeId, experiences } satisfies BrainExperienceBatch);
  }

  private summarizeGeneration(generation: number, brainIds: string[], results: EpisodeResult[], previousResults?: EpisodeResult[]): BrainGenerationSummary {
    const dimensions = Array.from({ length: 7 }, (_, dimension) => median(results.flatMap((result) => result.citizens.map((citizen) => citizen.fitness[dimension]))));
    const distributions = results.flatMap((result) => result.citizens.map((citizen) => Object.keys(citizen.actionDistribution).sort().join("|")));
    return {
      generation,
      brainIds: [...brainIds],
      episodes: results.map((result) => ({ episodeId: result.episodeId, generation, cohort: "training", seed: result.seed, replicate: Number(result.episodeId.match(/-r(\d+)$/)?.[1] ?? 0), durationMs: result.durationMs, digest: result.digest, metrics: result.metrics })),
      medianFitness: dimensions,
      diversity: distributions.length ? new Set(distributions).size / distributions.length : 0,
      behaviorShift: previousResults ? this.behaviorShift(previousResults, results) : 0,
    };
  }

  private behaviorShift(previous: EpisodeResult[], current: EpisodeResult[]) {
    const distribution = (episodes: EpisodeResult[]) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const episode of episodes) for (const citizen of episode.citizens) for (const [family, count] of Object.entries(citizen.actionDistribution)) {
        counts.set(family, (counts.get(family) ?? 0) + count);
        total += count;
      }
      return { counts, total: Math.max(1, total) };
    };
    const before = distribution(previous);
    const after = distribution(current);
    const families = new Set([...before.counts.keys(), ...after.counts.keys()]);
    return [...families].reduce((distance, family) => distance + Math.abs((before.counts.get(family) ?? 0) / before.total - (after.counts.get(family) ?? 0) / after.total), 0) / 2;
  }

  private async authorizedFetch(input: string | URL | Request, init: RequestInit = {}) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const response = await this.fetchImpl(input, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), ...(this.brainToken ? { Authorization: `Bearer ${this.brainToken}` } : {}) }, signal: init.signal ?? AbortSignal.timeout(120_000) });
        if (![408, 425, 429, 502, 503, 504].includes(response.status) || attempt === 4) return response;
        await response.body?.cancel().catch(() => undefined);
        lastError = new Error(`Local brain temporarily returned ${response.status}.`);
      } catch (cause) {
        lastError = cause;
        if (attempt === 4 || (cause instanceof DOMException && cause.name === "AbortError")) throw cause;
      }
      await new Promise((resolve) => setTimeout(resolve, 120 * 2 ** (attempt - 1)));
    }
    throw lastError instanceof Error ? lastError : new Error("Local brain request failed after retries.");
  }

  private async brainRequest<T = unknown>(pathname: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.authorizedFetch(`${this.brainServiceUrl}${pathname}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (cause) {
      throw new Error(`Could not reach the local brain at ${pathname} after 4 attempts: ${this.errorMessage(cause)}`);
    }
    const payload = await response.json().catch(() => null) as (T & { detail?: string; error?: string }) | null;
    if (!response.ok || !payload) throw new Error(payload?.detail ?? payload?.error ?? `Local brain returned ${response.status}.`);
    return payload;
  }

  private errorMessage(cause: unknown) {
    if (!(cause instanceof Error)) return "unknown error";
    const nested = (cause as Error & { cause?: unknown }).cause;
    if (nested instanceof Error) return `${cause.message} (${nested.message})`;
    if (nested && typeof nested === "object" && "code" in nested) return `${cause.message} (${String((nested as { code: unknown }).code)})`;
    return cause.message;
  }

  private async persistState(state: LearningExperimentState) {
    state.updatedAt = Date.now();
    if (!this.pool) return;
    await this.pool.query(`
      INSERT INTO learning_experiments (id, name, status, config, progress, error, created_at, updated_at)
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,to_timestamp($7/1000.0),to_timestamp($8/1000.0))
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, progress=EXCLUDED.progress, error=EXCLUDED.error, updated_at=EXCLUDED.updated_at
    `, [state.id, state.name, state.status, JSON.stringify(state.config), JSON.stringify(state.progress), state.error ?? null, state.createdAt, state.updatedAt]);
  }

  private async persistGeneration(experimentId: string, summary: BrainGenerationSummary) {
    if (!this.pool) return;
    await this.pool.query(`INSERT INTO learning_generations (experiment_id,generation,summary,selected_brain_ids) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (experiment_id,generation) DO UPDATE SET summary=EXCLUDED.summary,selected_brain_ids=EXCLUDED.selected_brain_ids`, [experimentId, summary.generation, JSON.stringify(summary), summary.brainIds]);
    await this.pool.query("DELETE FROM learning_metric_series WHERE experiment_id=$1 AND generation=$2", [experimentId, summary.generation]);
    for (const [index, value] of summary.medianFitness.entries()) await this.pool.query("INSERT INTO learning_metric_series (experiment_id,generation,metric,value) VALUES ($1,$2,$3,$4)", [experimentId, summary.generation, `fitness-${index}`, value]);
    await this.pool.query("INSERT INTO learning_metric_series (experiment_id,generation,metric,value) VALUES ($1,$2,'behavior-shift',$3)", [experimentId, summary.generation, summary.behaviorShift ?? 0]);
    for (const species of summary.species ?? []) for (const brainId of species.memberIds) {
      await this.pool.query("UPDATE brain_genomes SET metadata = metadata || $2::jsonb WHERE id=$1", [brainId, JSON.stringify({ speciesId: species.speciesId })]);
    }
  }

  private async persistEpisodeStart(experimentId: string, episodeId: string, generation: number, cohort: ExperimentCohort, seed: number) {
    if (!this.pool) return;
    await this.pool.query("INSERT INTO learning_episodes (id,experiment_id,generation,cohort,seed,status) VALUES ($1,$2,$3,$4,$5,'running') ON CONFLICT (id) DO NOTHING", [episodeId, experimentId, generation, cohort, seed]);
  }

  private async persistEpisodeFailure(episodeId: string, error: string) {
    if (!this.pool) return;
    await this.pool.query("UPDATE learning_episodes SET status='failed', result=$2::jsonb, completed_at=now() WHERE id=$1", [episodeId, JSON.stringify({ error })]);
  }

  private async persistEpisodeResult(result: EpisodeResult, summary: ExperimentEpisodeSummary, generation: number, cohort: ExperimentCohort, artifacts = new Map<string, { artifactHash: string; topology?: BrainTopologySummary }>()) {
    if (!this.pool) return;
    const stored = { summary, terminalReason: result.terminalReason, ticks: result.ticks, engineVersion: result.engineVersion, snapshot: result.snapshot };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE learning_episodes SET status=$2,result=$3::jsonb,completed_at=now() WHERE id=$1", [result.episodeId, result.terminalReason === "cancelled" ? "cancelled" : "completed", JSON.stringify(stored)]);
      for (const citizen of result.citizens) {
        const checkpoint = result.snapshot.decisions.find((decision) => decision.citizenId === citizen.citizenId && decision.provider.kind === "local-brain" && decision.providerSignals?.kind === "external" && decision.providerSignals.checkpointVersion)?.providerSignals;
        const artifact = artifacts.get(citizen.brainId);
        const artifactHash = artifact?.artifactHash ?? (checkpoint?.kind === "external" ? checkpoint.checkpointVersion : undefined) ?? null;
        await client.query("INSERT INTO brain_genomes (id,generation,artifact_hash,metadata) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (id) DO UPDATE SET artifact_hash=coalesce(brain_genomes.artifact_hash,EXCLUDED.artifact_hash), metadata=brain_genomes.metadata || EXCLUDED.metadata", [citizen.brainId, generation, artifactHash, JSON.stringify({ cohort, ...(artifact?.topology ? { topology: artifact.topology } : {}) })]);
        await client.query(`INSERT INTO brain_episode_results (episode_id,brain_id,citizen_id,alive,days_alive,fitness,action_distribution) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT (episode_id,brain_id) DO UPDATE SET alive=EXCLUDED.alive,days_alive=EXCLUDED.days_alive,fitness=EXCLUDED.fitness,action_distribution=EXCLUDED.action_distribution`, [result.episodeId, citizen.brainId, citizen.citizenId, citizen.alive, citizen.daysAlive, JSON.stringify(citizen.fitness), JSON.stringify(citizen.actionDistribution)]);
      }
      await client.query("COMMIT");
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  private async persistChildren(experimentId: string, children: EvolutionResponse["children"], generation: number) {
    this.lineageMemory.set(experimentId, [...(this.lineageMemory.get(experimentId) ?? []), ...children]);
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const child of children) {
        await client.query("INSERT INTO brain_genomes (id,generation,artifact_hash,metadata) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (id) DO UPDATE SET metadata=EXCLUDED.metadata", [child.brainId, generation, child.artifactHash, JSON.stringify({ kind: child.kind, speciesId: child.speciesId, parentIds: child.parentIds, mutations: child.mutations, topology: child.topology })]);
        for (const parentId of child.parentIds) await client.query("INSERT INTO brain_lineage_edges (parent_id,child_id,mutation_kind,magnitude,generation) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [parentId, child.brainId, child.kind, child.magnitude, generation]);
        await client.query("INSERT INTO brain_mutations (child_id,parent_id,experiment_id,generation,mutation_kind,magnitude) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (child_id) DO NOTHING", [child.brainId, child.parentId, experimentId, generation, child.kind, child.magnitude]);
      }
      await client.query("COMMIT");
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  private async persistLifetimeCheckpoint(result: EpisodeResult, artifactHash: string) {
    if (!this.pool) return;
    for (const citizen of result.citizens) await this.pool.query(`
      INSERT INTO brain_lifetime_checkpoints (id,brain_id,episode_id,tick,artifact_hash,metadata)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (id) DO NOTHING
    `, [`${result.episodeId}:${citizen.brainId}`, citizen.brainId, result.episodeId, result.ticks, artifactHash, JSON.stringify({ terminalReason: result.terminalReason })]);
  }
}

