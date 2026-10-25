import { describe, expect, it } from "vitest";
import { LocalBrainDecisionProvider } from "../LocalBrainDecisionProvider";
import { HeadlessSimulation } from "./HeadlessSimulation";

const enabled = process.env.RUN_FREEWILL_BRAIN_BENCHMARKS === "1";
const service = (process.env.FREEWILL_BRAIN_INTEGRATION_URL ?? "http://127.0.0.1:8008").replace(/\/$/, "");
const token = process.env.FREEWILL_BRAIN_INTEGRATION_TOKEN;

async function request(pathname: string, body: unknown) {
  const response = await fetch(`${service}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Brain benchmark request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function runScale(population: number, maximumDays: number, seed: number) {
  const episodeId = `phase1-scale-${population}-${maximumDays}-${Date.now()}`;
  const brainIds = Array.from({ length: population }, (_, index) => `${episodeId}-brain-${index + 1}`);
  await request("/v1/episodes", { episodeId, brainIds });
  const fetchImpl: typeof fetch = (input, init = {}) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const provider = new LocalBrainDecisionProvider({ episodeId, endpoint: `${service}/v1/decide-batch`, fetchImpl, brainIdForCitizen: (id) => brainIds[id - 1], batchWindowMs: 0 });
  const simulation = new HeadlessSimulation({ experimentId: episodeId, episodeId, seed, population, maximumDays, provider, brainIds, width: 64, height: 48, harshness: "balanced" });
  const result = await simulation.run();
  await request(`/v1/episodes/${episodeId}/finish`, { saveCheckpoint: false });
  console.info("FREEWILL_PHASE1_SCALE", JSON.stringify({ population, maximumDays, durationMs: result.durationMs, ticks: result.ticks, decisions: result.metrics.completedActions + result.metrics.cancelledActions, survivors: result.metrics.survivors, digest: result.digest }));
  return result;
}

describe.runIf(enabled)("phase-one local-brain scale gates", () => {
  it("runs 20 NPCs for 30 days within the M3 Air acceptance ceiling", async () => {
    const result = await runScale(20, 30, 20_030);
    expect(result.durationMs).toBeLessThan(60_000);
    expect(result.ticks).toBeGreaterThan(0);
  }, 70_000);

  it("completes the 50 NPC by 100 day invariant gate", async () => {
    const result = await runScale(50, 100, 50_100);
    expect(result.terminalReason).toMatch(/maximum-days|extinction/);
    expect(result.citizens).toHaveLength(50);
    expect(result.citizens.every((citizen) => citizen.fitness.every(Number.isFinite))).toBe(true);
  }, 180_000);
});
