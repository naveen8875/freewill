import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import { snapshotDigest } from "./snapshotDigest";
import type { ActionId, DecisionProvider } from "./types";

const citizens = [
  { id: 1, name: "Rowan", job: "farmer" },
  { id: 2, name: "Mika", job: "builder" },
  { id: 3, name: "Sol", job: "woodcutter" },
];

async function run(seed: number, count: number) {
  const simulation = new MockSimulation(seed, citizens, { wheat: 3, fish: 0, bread: 0, wood: 6, stone: 4, ore: 0 });
  for (let index = 0; index < count; index += 1) await simulation.step(1 + Math.floor(index / 20));
  return simulation.getSnapshot();
}

function selecting(action: ActionId): DecisionProvider {
  const descriptor = { kind: "test-delayed" as const, id: `select-${action}`, label: `Select ${action}`, version: "1" };
  return {
    descriptor,
    decide: async (request) => ({ requestId: request.requestId, selectedCandidateId: action, provider: descriptor }),
  };
}

describe("MockSimulation", () => {
  it("is reproducible for the same seed and inputs", async () => {
    expect(await run(41, 40)).toEqual(await run(41, 40));
  });

  it("only selects legal actions and records actual traces", async () => {
    const state = await run(12, 24);
    for (const decision of state.decisions) {
      const selected = decision.candidates.find((candidate) => candidate.id === decision.selected);
      expect(selected?.legal).toBe(true);
      expect(selected?.trace.length).toBeGreaterThan(0);
      expect(decision.consequences.length).toBeGreaterThan(0);
    }
  });

  it("updates needs, resources, relationships, events, and trends", async () => {
    const state = await run(7, 90);
    expect(state.events.length).toBeGreaterThan(1);
    expect(state.trends.length).toBeGreaterThan(0);
    expect(Object.values(state.citizens).some((citizen) => citizen.memories.length > 0)).toBe(true);
    expect(state.stock).not.toEqual({ wheat: 3, fish: 0, bread: 0, wood: 6, stone: 4, ore: 0 });
  });

  it("continues identically after a midpoint snapshot is restored", async () => {
    const uninterrupted = new MockSimulation(91, citizens, { wheat: 5, fish: 1, bread: 0, wood: 8, stone: 5, ore: 0 });
    for (let index = 0; index < 36; index += 1) await uninterrupted.step(1 + Math.floor(index / 12));
    const midpoint = uninterrupted.getSnapshot();
    const restored = new MockSimulation(91, citizens, {}, midpoint);
    for (let index = 36; index < 120; index += 1) {
      const day = 1 + Math.floor(index / 12);
      await uninterrupted.step(day);
      await restored.step(day);
    }
    expect(snapshotDigest(restored.getSnapshot())).toBe(snapshotDigest(uninterrupted.getSnapshot()));
  });

  it("keeps a stable ten-day fixture digest", async () => {
    const state = await run(17, 240);
    expect(snapshotDigest(state)).toBe("e84f2f89");
  });

  it("batches every idle local brain into the same decision opportunity", async () => {
    let calls = 0;
    const descriptor = { kind: "local-brain" as const, id: "batched-local-test", label: "Batched local test", version: "1" };
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        calls += 1;
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle");
        if (!selected) throw new Error("Expected an idle candidate.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const population = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Person ${index + 1}`, job: "unassigned" }));
    const simulation = new MockSimulation(404, population, {}, undefined, provider, { timeoutMs: 1_000, policyVersion: "batch-test", maxInFlight: 8 });
    const result = await simulation.step(1);
    expect(calls).toBe(8);
    expect(result?.decisions).toHaveLength(8);
    expect(new Set(result?.decisions?.map((decision) => decision.tick))).toEqual(new Set([1]));
    expect(Object.keys(result?.snapshot.activeActions ?? {})).toHaveLength(8);
  });

  it("interrupts a durative intention when a survival boundary is crossed", async () => {
    let calls = 0;
    const descriptor = { kind: "test-delayed" as const, id: "interrupt-test", label: "Interrupt test", version: "1" };
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        calls += 1;
        if (calls > 1) return new Promise(() => undefined);
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "construct");
        if (!selected) throw new Error("Expected construction to be legal.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(405, [{ id: 1, name: "Mika", job: "builder", initialNeeds: { thirst: 0.979 } }], { wood: 4, stone: 2 }, undefined, provider);
    await simulation.step(1);
    const firstDecisionId = simulation.getSnapshot().decisions[0].id;
    await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.decisions.find((decision) => decision.id === firstDecisionId)).toMatchObject({
      actionStatus: "cancelled",
      consequences: ["Critical thirst forced an immediate reconsideration."],
    });
    expect(snapshot.citizens[1].mind).toMatchObject({ mode: "deliberating", reconsiderations: 1 });
  });

  it("replays recorded decisions without consulting a provider", async () => {
    const stock = { wheat: 3, fish: 1, bread: 0, wood: 6, stone: 4, ore: 0 };
    const original = new MockSimulation(23, citizens, stock);
    for (let index = 0; index < 72; index += 1) await original.step(1 + Math.floor(index / 12));
    const expected = original.getSnapshot();
    const provider = { descriptor: { kind: "test-delayed" as const, id: "throwing", label: "Throwing provider", version: "1" }, decide: async () => { throw new Error("Replay called the provider."); } };
    const replay = new MockSimulation(23, citizens, stock, undefined, provider);
    for (const decision of [...expected.decisions].reverse()) replay.replayStep(decision, 1 + Math.floor((decision.tick - 1) / 12));
    while (replay.getSnapshot().tick < expected.tick) replay.replayTick(undefined, 1 + Math.floor(replay.getSnapshot().tick / 12));
    expect(snapshotDigest(replay.getSnapshot())).toBe(snapshotDigest(expected));
  });

  it("reserves resources and applies consequences only after travel and work complete", async () => {
    const simulation = new MockSimulation(31, [{ id: 1, name: "Mika", job: "builder", position: { x: 2, y: 2 } }], { wheat: 2, wood: 3, stone: 1 }, undefined, selecting("construct"));
    await simulation.step(1);
    const started = simulation.getSnapshot();
    expect(started.stock).toMatchObject({ wood: 3, stone: 1 });
    expect(Object.values(started.activeActions)).toHaveLength(1);
    expect(Object.values(started.reservations).filter((item) => item.kind === "resource")).toHaveLength(2);
    expect(started.decisions[0].actionStatus).toBe("in-progress");
    const firstDecisionId = started.decisions[0].id;
    const firstActionId = started.decisions[0].actionInstanceId;
    for (let index = 0; index < 12 && simulation.getSnapshot().decisions.find((item) => item.id === firstDecisionId)?.actionStatus !== "completed"; index += 1) await simulation.step(1);
    const completed = simulation.getSnapshot();
    const firstDecision = completed.decisions.find((item) => item.id === firstDecisionId);
    expect(completed.stock).toMatchObject({ wood: 1, stone: 0 });
    expect(Object.values(completed.reservations).some((item) => item.actionInstanceId === firstActionId)).toBe(false);
    expect(firstDecision).toMatchObject({ actionStatus: "completed", resourceDelta: { wood: -2, stone: -1 } });
    expect(firstDecision?.completedAtTick).toBeGreaterThan(firstDecision?.tick ?? 0);
  });

  it("lets the provider choose an objective once while the engine plans and advances its route", async () => {
    let providerCalls = 0;
    const descriptor = { kind: "test-delayed" as const, id: "objective-provider", label: "Objective provider", version: "1" };
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        providerCalls += 1;
        const selected = request.candidates.find((candidate) => candidate.intent?.kind === "collect_water");
        if (!selected) throw new Error("Expected a legal water objective.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const width = 32;
    const height = 8;
    const simulation = new MockSimulation(
      32,
      [{ id: 1, name: "Mika", job: "farmer", position: { x: 2, y: 2 }, initialNeeds: { thirst: 0.95 } }],
      { wheat: 2 },
      undefined,
      provider,
      undefined,
      {
        width,
        height,
        topologyRevision: 1,
        walkable: Array.from({ length: width * height }, () => 1),
        locations: { shore: [{ x: 28, y: 2 }, { x: 10, y: 2 }] },
        objects: [],
      },
    );
    await simulation.step(1);
    const started = Object.values(simulation.getSnapshot().activeActions)[0];
    expect(providerCalls).toBe(1);
    expect(started.target).toEqual({ x: 10, y: 2 });
    expect(started.route).toHaveLength(8);

    await simulation.step(1);
    const moving = Object.values(simulation.getSnapshot().activeActions)[0];
    expect(providerCalls).toBe(1);
    expect(moving.routeIndex).toBeGreaterThan(0);
    expect(moving.routeIndex).toBeLessThanOrEqual(moving.route.length);
  });

  it("finds a farther reachable destination instead of rejecting the nearest disconnected candidates", async () => {
    const width = 12;
    const height = 30;
    const walkable = Array.from({ length: width * height }, () => 1);
    for (let y = 0; y < height; y += 1) walkable[y * width + 5] = 0;
    const unreachableShore = Array.from({ length: 60 }, (_, index) => ({ x: 6 + index % 6, y: Math.floor(index / 6) }));
    const provider: DecisionProvider = {
      descriptor: { kind: "test-delayed", id: "reachable-shore", label: "Reachable shore", version: "1" },
      decide: async (request) => {
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "collect_water");
        if (!selected) throw new Error("Expected a reachable water candidate.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: { kind: "test-delayed", id: "reachable-shore", label: "Reachable shore", version: "1" } };
      },
    };
    const simulation = new MockSimulation(320, [{ id: 1, name: "Mika", job: "unassigned", position: { x: 2, y: 2 }, initialNeeds: { thirst: 0.9 } }], {}, undefined, provider, undefined, {
      width, height, topologyRevision: 1, walkable, locations: { shore: [...unreachableShore, { x: 2, y: 28 }] }, objects: [],
    });
    await simulation.step(1);
    const action = Object.values(simulation.getSnapshot().activeActions)[0];
    expect(action.target).toEqual({ x: 2, y: 28 });
    expect(action.route.length).toBeGreaterThan(0);
  });

  it("lets the provider choose a commitment once while the engine executes legal substeps", async () => {
    let providerCalls = 0;
    const descriptor = { kind: "test-delayed" as const, id: "commitment-provider", label: "Commitment provider", version: "1" };
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        providerCalls += 1;
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "adopt_commitment" && candidate.intent.commitmentKind === "survival");
        if (!selected) throw new Error("Expected a survival commitment.");
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const width = 12;
    const height = 10;
    const simulation = new MockSimulation(321, [{ id: 1, name: "Mika", job: "unassigned", position: { x: 2, y: 2 }, initialNeeds: { hunger: 0.82 } }], {}, undefined, provider, undefined, {
      width, height, topologyRevision: 1, walkable: Array.from({ length: width * height }, () => 1), locations: { plaza: [{ x: 2, y: 2 }], shore: [{ x: 1, y: 2 }] }, nextObjectUid: 11,
      objects: [{ uid: 10, assetId: "bush", x: 3, y: 2, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: false, homeCapacity: 0, wildResource: "wild-food" }],
    });
    for (let tick = 0; tick < 32 && !simulation.getSnapshot().decisions.some((decision) => decision.provider.id === "commitment-engine" && decision.actionStatus === "completed"); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(providerCalls).toBe(1);
    expect(snapshot.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ selected: "adopt_commitment", provider: descriptor }),
      expect.objectContaining({ provider: expect.objectContaining({ id: "commitment-engine" }), resolutionReason: "engine-continued-committed-strategy" }),
    ]));
    expect(snapshot.citizens[1].inventory.berries ?? 0).toBeGreaterThan(0);
  });

  it("does not recreate authoritative inventory from a stale renderer seed", async () => {
    const input = { id: 1, name: "Mika", job: "farmer", position: { x: 2, y: 2 }, inventory: { wheat: 1 } };
    const simulation = new MockSimulation(37, [input], {}, undefined, selecting("eat"));
    for (let tick = 0; tick < 60 && (simulation.getSnapshot().citizens[1].inventory.wheat ?? 0) > 0; tick += 1) await simulation.step(1);
    expect(simulation.getSnapshot().citizens[1].inventory.wheat).toBe(0);
    simulation.syncCitizens([input]);
    expect(simulation.getSnapshot().citizens[1].inventory.wheat).toBe(0);
  });

  it("continues an in-progress action identically after save and restore", async () => {
    const seed = 53;
    const inputs = [{ id: 1, name: "Mika", job: "builder", position: { x: 2, y: 2 } }];
    const original = new MockSimulation(seed, inputs, { wheat: 2, wood: 8, stone: 4 }, undefined, selecting("construct"));
    await original.step(1);
    await original.step(1);
    const midpoint = original.getSnapshot();
    expect(Object.keys(midpoint.activeActions)).toHaveLength(1);
    const restored = new MockSimulation(seed, inputs, {}, midpoint, selecting("construct"));
    for (let index = 0; index < 18; index += 1) {
      await original.step(1);
      await restored.step(1);
    }
    expect(snapshotDigest(restored.getSnapshot())).toBe(snapshotDigest(original.getSnapshot()));
  });

  it("prevents two actions from reserving the same scarce construction materials", async () => {
    const simulation = new MockSimulation(71, [
      { id: 1, name: "Mika", job: "builder", position: { x: 2, y: 2 } },
      { id: 2, name: "Ines", job: "builder", position: { x: 4, y: 2 } },
    ], { wheat: 2, wood: 2, stone: 1 }, undefined, selecting("construct"));
    await simulation.step(1);
    await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(Object.values(snapshot.activeActions).filter((action) => action.actionId === "construct")).toHaveLength(1);
    expect(Object.values(snapshot.reservations).filter((item) => item.kind === "resource" && item.key === "wood").reduce((total, item) => total + item.amount, 0)).toBe(2);
  });

  it("captures bounded checkpoints and reconstructs an exact historical tick", async () => {
    const simulation = new MockSimulation(83, citizens, { wheat: 4, fish: 1, bread: 0, wood: 7, stone: 5, ore: 0 });
    let atTwentyFour = simulation.getSnapshot();
    for (let index = 0; index < 36; index += 1) {
      await simulation.step(1 + Math.floor(index / 12));
      if (index === 23) atTwentyFour = simulation.getSnapshot();
    }
    expect(simulation.getSnapshot().checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0]);
    expect(snapshotDigest(simulation.getHistoricalSnapshot(24))).toBe(snapshotDigest(atTwentyFour));
  });

  it("rejects a corrupt replay checkpoint with a precise tick diagnostic", async () => {
    const simulation = new MockSimulation(97, citizens, { wheat: 4, wood: 7, stone: 5 });
    for (let index = 0; index < 61; index += 1) await simulation.step(1 + Math.floor(index / 12));
    const corrupted = simulation.getSnapshot();
    corrupted.checkpoints[1].state.stock.wheat = 999;
    const restored = new MockSimulation(97, citizens, {}, corrupted);
    expect(() => restored.getHistoricalSnapshot(60)).toThrow(/checkpoint mismatch at tick 60/i);
  });

  it("replays a thirty-day fixture with zero provider access and matching checkpoint digests", async () => {
    const stock = { wheat: 8, fish: 2, bread: 0, wood: 12, stone: 8, ore: 0 };
    const original = new MockSimulation(131, citizens, stock);
    for (let tick = 0; tick < 360; tick += 1) await original.step(1 + Math.floor(tick / 12));
    const expected = original.getSnapshot();
    const throwing: DecisionProvider = { descriptor: { kind: "test-delayed", id: "must-not-run", label: "Must not run", version: "1" }, decide: async () => { throw new Error("Recorded replay accessed a provider."); } };
    const replay = new MockSimulation(131, citizens, stock, undefined, throwing);
    for (const decision of [...expected.decisions].reverse()) replay.replayStep(decision, 1 + Math.floor((decision.tick - 1) / 12));
    while (replay.getSnapshot().tick < expected.tick) replay.replayTick(undefined, 30);
    const actual = replay.getSnapshot();
    expect(snapshotDigest(actual)).toBe(snapshotDigest(expected));
    expect(actual.checkpoints.map(({ tick, digest }) => ({ tick, digest }))).toEqual(expected.checkpoints.map(({ tick, digest }) => ({ tick, digest })));
  }, 15_000);

  it("cancels actions at an edit transaction and replays from the edit checkpoint", async () => {
    const simulation = new MockSimulation(151, [{ id: 1, name: "Mika", job: "builder", position: { x: 2, y: 2 } }], { wood: 8, stone: 4 }, undefined, selecting("construct"));
    await simulation.step(1);
    expect(simulation.getSnapshot().decisions[0].actionStatus).toBe("in-progress");
    const topology = simulation.getSnapshot().topology;
    simulation.updateTopology({ ...topology, topologyRevision: topology.topologyRevision + 1, walkable: [...topology.walkable] });
    expect(simulation.getSnapshot().decisions[0].actionStatus).toBe("cancelled");
    let atTwelve = simulation.getSnapshot();
    while (simulation.getSnapshot().tick < 24) {
      await simulation.step(1 + Math.floor(simulation.getSnapshot().tick / 12));
      if (simulation.getSnapshot().tick === 12) atTwelve = simulation.getSnapshot();
    }
    expect(snapshotDigest(simulation.getHistoricalSnapshot(12))).toBe(snapshotDigest(atTwelve));
    expect(simulation.getSnapshot().events.some((event) => /world edit invalidated/i.test(event.detail))).toBe(true);
  });

  it("accepts a still-legal delayed choice after another villager changes the world", async () => {
    const descriptor = { kind: "test-delayed" as const, id: "async-policy-shape", label: "Async policy shape", version: "1" };
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        const selected = request.candidates.find((candidate) => candidate.id === (request.perception.citizen.id === 1 ? "work_job" : "idle")) ?? request.candidates.find((candidate) => candidate.legal)!;
        if (request.perception.citizen.id === 2) await new Promise((resolve) => setTimeout(resolve, 15));
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(171, [
      { id: 1, name: "Mika", job: "farmer" },
      { id: 2, name: "Sol", job: "builder" },
    ], { wheat: 4, wood: 4 }, undefined, provider, { timeoutMs: 1_000, policyVersion: "async-v1", maxInFlight: 2, fallbackMode: "wait" });
    await simulation.step(1);
    await simulation.step(1);
    await simulation.step(1);
    await simulation.step(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await simulation.step(1);
    expect(simulation.getSnapshot().decisions.some((decision) => decision.citizenId === 2 && decision.provider.id === descriptor.id)).toBe(true);
  });

  it("keeps a deterministic thirty-day digest while a hostile provider injects failures", async () => {
    const descriptor = { kind: "test-delayed" as const, id: "chaos", label: "Chaos fixture", version: "1" };
    const chaos: DecisionProvider = {
      descriptor,
      decide: async (request, signal) => {
        const mode = request.freshness.requestedAtTick % 6;
        const legal = request.candidates.find((candidate) => candidate.legal)!;
        if (mode === 1) throw new Error("transient fixture failure");
        if (mode === 2) return { requestId: request.requestId, selectedCandidateId: "not-real" as ActionId, provider: descriptor };
        if (mode === 3) return { requestId: "duplicate-old-request", selectedCandidateId: legal.id, provider: descriptor };
        if (mode === 4) return { requestId: request.requestId, selectedCandidateId: legal.id, provider: descriptor, signals: { kind: "external", evaluations: [{ candidateId: legal.id, probability: Number.NaN }] } };
        if (mode === 5) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
        return { requestId: request.requestId, selectedCandidateId: legal.id, provider: descriptor, signals: { kind: "external", evaluations: [{ candidateId: legal.id, probability: 1 }] } };
      },
    };
    const runChaos = async () => {
      const simulation = new MockSimulation(181, citizens, { wheat: 8, wood: 12, stone: 8 }, undefined, chaos, { timeoutMs: 10_000, policyVersion: "chaos-v1", maxInFlight: 4 });
      for (let tick = 0; tick < 360; tick += 1) await simulation.step(1 + Math.floor(tick / 12));
      const snapshot = simulation.getSnapshot();
      simulation.destroy();
      return snapshot;
    };
    const first = await runChaos();
    const second = await runChaos();
    expect(snapshotDigest(first)).toBe(snapshotDigest(second));
    expect(first.decisions.some((decision) => decision.resolution === "fallback")).toBe(true);
    expect(Object.values(first.stock).every((amount) => amount >= 0 && Number.isFinite(amount))).toBe(true);
  }, 15_000);
});
