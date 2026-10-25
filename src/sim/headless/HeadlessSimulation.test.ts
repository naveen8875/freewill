import { describe, expect, it } from "vitest";
import { MockDecisionProvider } from "../MockDecisionProvider";
import { MockSimulation } from "../MockSimulation";
import { generatedWorldSeed } from "../generatedWorldSeed";
import { snapshotDigest } from "../snapshotDigest";
import { SIM_TICKS_PER_DAY, simulationDay } from "../time";
import { createExperimentCitizens, HeadlessSimulation } from "./HeadlessSimulation";

describe("HeadlessSimulation", () => {
  it("runs without a DOM and emits explainable experience records", async () => {
    const simulation = new HeadlessSimulation({ experimentId: "test", episodeId: "test-seed-41", seed: 41, width: 48, height: 36, harshness: "balanced", population: 4, maximumDays: 3, provider: new MockDecisionProvider(41) });
    const result = await simulation.run();
    expect(result.ticks).toBeGreaterThan(0);
    expect(result.metrics.survivors + result.metrics.deaths).toBe(4);
    expect(result.metrics.completedActions).toBeGreaterThan(0);
    expect(result.experiences.length).toBeGreaterThan(0);
    expect(result.experiences.every((experience) => experience.tickCompleted >= experience.tickStarted && experience.consequences.length > 0)).toBe(true);
    expect(result.citizens).toHaveLength(4);
    expect(result.citizens.every((citizen) => citizen.fitness.length === 7 && citizen.fitness.every(Number.isFinite))).toBe(true);
    expect(result.metrics.unreachableActionFraction).toBeGreaterThanOrEqual(0);
    expect(result.metrics.collapsesPerHundredPersonDays).toBeGreaterThanOrEqual(0);
    expect(result.metrics.renewableFoodProduced).toBeGreaterThanOrEqual(0);
    expect(result.metrics.unfueledCampfireFraction).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("is deterministic for the same engine seed and provider", async () => {
    const config = { experimentId: "det", seed: 77, width: 48, height: 36, population: 4, maximumDays: 2 } as const;
    const first = await new HeadlessSimulation({ ...config, episodeId: "det-a", provider: new MockDecisionProvider(12) }).run();
    const second = await new HeadlessSimulation({ ...config, episodeId: "det-b", provider: new MockDecisionProvider(12) }).run();
    expect(second.digest).toBe(first.digest);
  }, 30_000);

  it("matches a directly-driven authoritative engine for the same seed", async () => {
    const config = { experimentId: "parity", episodeId: "parity-1", seed: 91, width: 48, height: 36, harshness: "balanced", population: 4, maximumDays: 2 } as const;
    const headless = await new HeadlessSimulation({ ...config, provider: new MockDecisionProvider(33) }).run();
    const world = generatedWorldSeed(config.seed, config.width, config.height, config.harshness);
    const direct = new MockSimulation(config.seed, createExperimentCitizens(config, world.environment!.spawn), {}, undefined, new MockDecisionProvider(33), {
      timeoutMs: 15_000, policyVersion: "local-evolution-v1", maxInFlight: 32, fallbackMode: "wait",
    }, world, { societyGoal: "none" });
    for (let tick = 0; tick < config.maximumDays * SIM_TICKS_PER_DAY; tick += 1) {
      await direct.step(simulationDay(tick), { copySnapshot: false });
      await Promise.resolve();
      if (direct.getPendingDecisionCount() >= Math.min(config.population, 8)) await direct.waitForPendingDecisions();
      if ((tick + 1) % SIM_TICKS_PER_DAY === 0) await Promise.resolve();
    }
    const directSnapshot = direct.getSnapshot();
    expect(snapshotDigest(directSnapshot)).toBe(headless.digest);
    direct.destroy();
  }, 30_000);
});
