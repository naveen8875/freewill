import { describe, expect, it } from "vitest";
import { HeadlessSimulation } from "../headless/HeadlessSimulation";
import { LocalBrainDecisionProvider } from "../LocalBrainDecisionProvider";
import { LEARNING_SCHEMA_VERSION } from "./contracts";

const endpoint = process.env.FREEWILL_BRAIN_INTEGRATION_URL;

describe.skipIf(!endpoint)("local brain service integration", () => {
  it("runs a real headless episode, learns from experience, and evolves children", async () => {
    const token = process.env.FREEWILL_BRAIN_INTEGRATION_TOKEN;
    const fetchImpl: typeof fetch = (input, init = {}) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const episodeId = `integration-${Date.now()}`;
    const brainIds = Array.from({ length: 4 }, (_, index) => `${episodeId}-brain-${index + 1}`);
    const provider = new LocalBrainDecisionProvider({ episodeId, endpoint: `${endpoint}/v1/decide-batch`, fetchImpl, brainIdForCitizen: (id) => brainIds[id - 1], batchWindowMs: 0 });
    try {
      const result = await new HeadlessSimulation({ experimentId: episodeId, episodeId, seed: 515, width: 48, height: 36, population: 4, maximumDays: 2, provider, brainIds }).run();
      expect(result.experiences.length).toBeGreaterThan(0);
      expect(result.snapshot.decisions.some((decision) => decision.provider.kind === "local-brain")).toBe(true);
      const experience = await fetchImpl(`${endpoint}/v1/experience-batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: LEARNING_SCHEMA_VERSION, episodeId, experiences: result.experiences }) });
      expect(experience.ok).toBe(true);
      const evolved = await fetchImpl(`${endpoint}/v1/evolution/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experimentId: episodeId, generation: 0, seed: 99, populationSize: 4, members: result.citizens.map((citizen) => ({ brainId: citizen.brainId, fitness: citizen.fitness, novelty: citizen.fitness[6] })) }) });
      expect(evolved.ok).toBe(true);
      const payload = await evolved.json() as { children: Array<{ brainId: string; kind: string; artifactHash: string }> };
      expect(payload.children).toHaveLength(4);
      expect(payload.children.every((child) => child.artifactHash.length === 64)).toBe(true);
    } finally {
      await provider.finish(false);
    }
  }, 30_000);
});
