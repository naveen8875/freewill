import { describe, expect, it } from "vitest";
import { ExperimentManager } from "../../server/experimentManager";

const endpoint = process.env.FREEWILL_BRAIN_INTEGRATION_URL;

describe.skipIf(!endpoint)("ExperimentManager integration", () => {
  it("trains and evaluates every required phase-one control cohort", async () => {
    let activeEpisodes = 0;
    let peakActiveEpisodes = 0;
    const trackingFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (response.ok && init?.method === "POST") {
        if (url.pathname === "/v1/episodes") {
          activeEpisodes += 1;
          peakActiveEpisodes = Math.max(peakActiveEpisodes, activeEpisodes);
        } else if (/\/v1\/episodes\/[^/]+\/finish$/.test(url.pathname)) {
          activeEpisodes -= 1;
        }
      }
      return response;
    };
    const manager = new ExperimentManager(null, { brainServiceUrl: endpoint, brainToken: process.env.FREEWILL_BRAIN_INTEGRATION_TOKEN, fetchImpl: trackingFetch });
    const created = await manager.create({ name: "integration", population: 4, days: 1, generations: 1, replicates: 1, trainingSeeds: [701, 703], heldOutSeeds: [702], harshness: "balanced", width: 48, height: 36, profile: "balanced" });
    await expect(manager.create({ name: "duplicate", population: 4, days: 1, generations: 1, replicates: 1, trainingSeeds: [711], heldOutSeeds: [712], harshness: "balanced", width: 48, height: 36, profile: "balanced" })).rejects.toThrow(/already running/);
    let observatory = await manager.observatory(created.id);
    const observatoryDeadline = Date.now() + 5_000;
    while ((!observatory?.episodes.length || observatory.episodes.length < 2 || observatory.episodes.some((episode) => !episode.snapshot.decisions.length)) && Date.now() < observatoryDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      observatory = await manager.observatory(created.id);
    }
    expect(observatory?.episodes).toHaveLength(2);
    expect(observatory?.episodes.every((episode) => episode.live)).toBe(true);
    expect(observatory?.episodes.every((episode) => episode.snapshot.citizens.length === 4)).toBe(true);
    expect(observatory?.episodes.every((episode) => episode.snapshot.decisions.length > 0)).toBe(true);
    const observedEpisode = observatory!.episodes[0];
    const replay = await manager.observatory(created.id, { episodeId: observedEpisode.episodeId, tick: 0 });
    expect(replay?.episodes.find((episode) => episode.episodeId === observedEpisode.episodeId)?.snapshot.tick).toBe(0);
    expect(replay?.episodes.find((episode) => episode.episodeId === observedEpisode.episodeId)?.replay.maximumTick).toBeGreaterThan(0);
    const intermediateTick = Math.max(1, observedEpisode.replay.maximumTick - 1);
    const intermediate = await manager.observatory(created.id, { episodeId: observedEpisode.episodeId, tick: intermediateTick });
    expect(intermediate?.episodes.find((episode) => episode.episodeId === observedEpisode.episodeId)?.snapshot.tick).toBe(intermediateTick);
    let state = await manager.get(created.id);
    const deadline = Date.now() + 20_000;
    while (state && ["queued", "running"].includes(state.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      state = await manager.get(created.id);
    }
    expect(state?.status).toBe("completed");
    expect(state?.generations).toHaveLength(1);
    expect(new Set(state?.evaluations.map((episode) => episode.cohort))).toEqual(new Set(["random-control", "heuristic-control", "unevolved-control", "evolved-evaluation"]));
    expect(state?.progress.completedEpisodes).toBe(state?.progress.totalEpisodes);
    expect(peakActiveEpisodes).toBe(2);
    expect(activeEpisodes).toBe(0);
  }, 30_000);
});
