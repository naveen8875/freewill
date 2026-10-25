import { useEffect, useRef } from "react";
import { useAppStore } from "../state/appStore";
import { MockSimulation } from "./MockSimulation";
import { LocalBrainDecisionProvider } from "./LocalBrainDecisionProvider";
import { BrainExperienceTracker } from "./learning/BrainExperienceTracker";
import { simulationCadence } from "./runtimeCadence";
import { simulationDay } from "./time";
import type { BrainExperienceRecord } from "./learning/contracts";
import type { DecisionRecord } from "./types";
import type { LegacyEntity } from "../types/legacy";

function citizenSeed(person: LegacyEntity) {
  return {
    id: person.uid, name: person.name, job: person.job, traits: person.trait ? [person.trait] : undefined,
    goal: person.goal, inventory: person.inventory, position: { x: Math.floor(person.x), y: Math.floor(person.y) },
    initialNeeds: person.initialNeeds, settlementId: person.settlementId, relationshipPreset: person.relationshipPreset,
    homeObjectUid: person.home?.uid,
  };
}

export function useSimulationRuntime() {
  const renderer = useAppStore((state) => state.renderer);
  const revision = useAppStore((state) => state.worldRevision);
  const speed = useAppStore((state) => state.speed);
  const seed = useAppStore((state) => state.seed);
  const societyGoal = useAppStore((state) => state.societyGoal);
  const goalPrompt = useAppStore((state) => state.goalPrompt);
  const decisionMode = useAppStore((state) => state.decisionMode);
  const brainDeployment = useAppStore((state) => state.brainDeployment);
  const setSimulation = useAppStore((state) => state.setSimulation);
  const setStepSimulation = useAppStore((state) => state.setStepSimulation);
  const setViewSimulationTick = useAppStore((state) => state.setViewSimulationTick);
  const setInvalidateSimulation = useAppStore((state) => state.setInvalidateSimulation);
  const setRuntimePerformance = useAppStore((state) => state.setRuntimePerformance);
  const historicalTick = useAppStore((state) => state.historicalTick);
  const replayPlaying = useAppStore((state) => state.replayPlaying);
  const replayStartRequested = useAppStore((state) => state.replayStartRequested);
  const setReplayPlaying = useAppStore((state) => state.setReplayPlaying);
  const setReplayStartRequested = useAppStore((state) => state.setReplayStartRequested);
  const runtime = useRef<{ engine: MockSimulation; localProvider?: LocalBrainDecisionProvider; experienceTracker?: BrainExperienceTracker } | null>(null);

  useEffect(() => {
    if (!renderer) return;
    const people = renderer.getPeople().map(citizenSeed);
    const stock = renderer.getStatus()?.stock ?? {};
    const restored = useAppStore.getState().simulation;
    const deployedBrainByCitizen = new Map(people.map((person, index) => [
      person.id,
      brainDeployment?.brainIds[index] ?? `live-${seed}-brain-${person.id}`,
    ]));
    const brainIdForCitizen = (citizenId: number) => deployedBrainByCitizen.get(citizenId) ?? `live-${seed}-brain-${citizenId}`;
    const localEpisodeId = `live-${useAppStore.getState().currentSaveId ?? seed}${brainDeployment ? `-${brainDeployment.experimentId}-g${brainDeployment.generation}` : ""}`;
    let localProvider: LocalBrainDecisionProvider | undefined;
    const decisionProvider = decisionMode === "local-brain"
      ? (localProvider = new LocalBrainDecisionProvider({
            episodeId: localEpisodeId,
            // World entity IDs are stable database identifiers (often 300+),
            // not dense array indexes. Bind the deployed population to the
            // actual initial citizen order once when this runtime is created.
            brainIdForCitizen,
          }))
      : undefined;
    const policy = decisionProvider
      ? { timeoutMs: 12_000, policyVersion: "local-evolution-v1", maxInFlight: 32, fallbackMode: "wait" as const }
      : undefined;
    const engine = new MockSimulation(seed, people, stock, restored?.seed === seed ? restored : undefined, decisionProvider, policy, renderer.getSimulationWorldSeed(), { societyGoal, goalPrompt });
    const experienceTracker = localProvider ? new BrainExperienceTracker(localEpisodeId, brainIdForCitizen) : undefined;
    runtime.current = { engine, localProvider, experienceTracker };
    setSimulation(engine.getSnapshot());
    return () => {
      engine.destroy();
      void localProvider?.finish(true).catch(() => undefined);
      if (runtime.current?.engine === engine) runtime.current = null;
    };
  }, [renderer, revision, seed, societyGoal, goalPrompt, decisionMode, brainDeployment, setSimulation]);

  useEffect(() => {
    if (!renderer || speed <= 0) return;
    const cadence = simulationCadence(speed);
    renderer.setSpeed(cadence.visualSpeed);
    renderer.setPlaybackCadence(cadence.intervalMs);
    let advancing = false;
    let disposed = false;
    const advance = async () => {
      if (advancing) return;
      if (useAppStore.getState().historicalTick !== null) return;
      const active = runtime.current;
      if (!active) return;
      const { engine } = active;
      advancing = true;
      try {
        const cycleStarted = performance.now();
        const people = renderer.getPeople();
        engine.syncCitizens(people.map(citizenSeed));
        const experiences: BrainExperienceRecord[] = [];
        let latestDecision: DecisionRecord | undefined;
        let completedTicks = 0;
        const engineStarted = performance.now();
        for (let index = 0; index < cadence.ticksPerCycle; index += 1) {
          const day = simulationDay(engine.getCurrentTick());
          const step = await engine.step(day, { copySnapshot: false });
          if (!step) break;
          completedTicks += 1;
          latestDecision = step.decision ?? latestDecision;
          if (active.localProvider && active.experienceTracker) experiences.push(...active.experienceTracker.collect(step.snapshot));
        }
        const engineMs = performance.now() - engineStarted;
        if (!completedTicks || disposed) return;
        if (active.localProvider && experiences.length) void active.localProvider.experience(experiences).catch(() => undefined);
        const snapshotStarted = performance.now();
        const snapshot = engine.getSnapshot();
        const snapshotMs = performance.now() - snapshotStarted;
        const rendererStarted = performance.now();
        renderer.applySimulation(snapshot, latestDecision);
        const rendererMs = performance.now() - rendererStarted;
        const publishStarted = performance.now();
        setSimulation(snapshot);
        const publishMs = performance.now() - publishStarted;
        const pendingBrains = snapshot.requests.filter((request) => request.status === "queued" || request.status === "in-flight").length;
        setRuntimePerformance({
          tick: snapshot.tick,
          speed,
          ticksPerCycle: completedTicks,
          budgetMs: cadence.intervalMs,
          engineMs,
          snapshotMs,
          rendererMs,
          publishMs,
          totalMs: performance.now() - cycleStarted,
          ...(latestDecision?.latencyMs !== undefined ? { brainLatencyMs: latestDecision.latencyMs } : {}),
          pendingBrains,
        });
      } catch (cause) {
        useAppStore.getState().setReplayError(cause instanceof Error ? `Simulation paused: ${cause.message}` : "Simulation paused after an invariant failure.");
        useAppStore.getState().setSpeed(0);
        renderer.setSpeed(0);
      } finally {
        advancing = false;
      }
    };
    const interval = window.setInterval(() => { void advance(); }, cadence.intervalMs);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [renderer, speed, revision, setRuntimePerformance, setSimulation]);

  useEffect(() => {
    if (!renderer) {
      setStepSimulation(null);
      return;
    }
    let advancing = false;
    let disposed = false;
    const advance = async () => {
      if (advancing) return;
      if (useAppStore.getState().historicalTick !== null) return;
      const active = runtime.current;
      if (!active) return;
      const { engine } = active;
      advancing = true;
      try {
        const people = renderer.getPeople();
        engine.syncCitizens(people.map(citizenSeed));
        const step = await engine.step(simulationDay(engine.getCurrentTick()));
        if (!step || disposed) return;
        if (active.localProvider && active.experienceTracker) void active.localProvider.experience(active.experienceTracker.collect(step.snapshot)).catch(() => undefined);
        renderer.applySimulation(step.snapshot, step.decision);
        setSimulation(step.snapshot);
      } catch (cause) {
        useAppStore.getState().setReplayError(cause instanceof Error ? `Simulation step failed: ${cause.message}` : "Simulation step failed.");
      } finally {
        advancing = false;
      }
    };
    setStepSimulation(() => { void advance(); });
    return () => {
      disposed = true;
      setStepSimulation(null);
    };
  }, [renderer, revision, setSimulation, setStepSimulation]);

  useEffect(() => {
    if (!renderer) {
      setViewSimulationTick(null);
      return;
    }
    const view = (tick: number | null) => {
      const engine = runtime.current?.engine;
      if (!engine) return;
      try {
        const snapshot = tick === null ? engine.getSnapshot() : engine.getHistoricalSnapshot(tick);
        if (tick !== null) {
          renderer.setTool("watch");
          useAppStore.getState().setTool("watch");
        }
        renderer.applySimulation(snapshot);
        useAppStore.getState().setHistoricalSimulation(snapshot, tick === null ? null : snapshot.tick);
        useAppStore.getState().setReplayError(null);
      } catch (cause) {
        useAppStore.getState().setReplayError(cause instanceof Error ? cause.message : "Historical replay failed.");
      }
    };
    setViewSimulationTick(view);
    if (replayStartRequested) {
      view(0);
      setReplayStartRequested(false);
    }
    return () => setViewSimulationTick(null);
  }, [renderer, revision, replayStartRequested, setReplayStartRequested, setViewSimulationTick]);

  useEffect(() => {
    if (!replayPlaying || historicalTick === null) return;
    const finalTick = useAppStore.getState().liveSimulation?.tick ?? 0;
    if (historicalTick >= finalTick) {
      setReplayPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState();
      const current = state.historicalTick;
      const end = state.liveSimulation?.tick ?? 0;
      if (current === null || current >= end) {
        state.setReplayPlaying(false);
        return;
      }
      state.viewSimulationTick?.(Math.min(current + 1, end));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [historicalTick, replayPlaying, revision, setReplayPlaying]);

  useEffect(() => {
    if (!renderer) {
      setInvalidateSimulation(null);
      return;
    }
    const invalidate = () => {
      const engine = runtime.current?.engine;
      if (!engine) return;
      engine.updateTopology(renderer.getSimulationWorldSeed());
      const snapshot = engine.getSnapshot();
      renderer.applySimulation(snapshot);
      setSimulation(snapshot);
    };
    setInvalidateSimulation(invalidate);
    return () => setInvalidateSimulation(null);
  }, [renderer, revision, setInvalidateSimulation, setSimulation]);
}
