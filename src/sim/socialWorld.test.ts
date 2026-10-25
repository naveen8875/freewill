import { describe, expect, it } from "vitest";
import { MockSimulation } from "./MockSimulation";
import { advanceSocialWorld, assertSocialWorldInvariants, buildSocialCandidates } from "./socialWorld";
import type { DecisionContext, DecisionProvider, PersonalityProfile } from "./types";
import type { SimulationWorldSeed } from "./spatial";

const descriptor = { kind: "test-delayed" as const, id: "social-life", label: "Social life fixture", version: "1" };

function personality(overrides: Partial<PersonalityProfile> = {}): PersonalityProfile {
  return {
    empathy: 0.5, sociability: 0.5, industriousness: 0.5, openness: 0.5, conscientiousness: 0.5,
    extraversion: 0.5, agreeableness: 0.5, emotionalSensitivity: 0.5, riskTolerance: 0.5,
    patience: 0.5, generosity: 0.5, dominance: 0.5, curiosity: 0.5, conformity: 0.5,
    aggression: 0.5, acquisitiveness: 0.5, independence: 0.5, ...overrides,
  };
}

function socialSeed(): SimulationWorldSeed {
  const width = 12;
  const height = 10;
  return {
    width, height, topologyRevision: 1,
    walkable: Array.from({ length: width * height }, () => 1),
    locations: { plaza: [{ x: 2, y: 2 }], rest: [{ x: 2, y: 2 }] },
    nextObjectUid: 20,
    objects: [{ uid: 19, assetId: "bush", x: 5, y: 4, build: 1, age: 0, footprint: { width: 1, height: 1 }, category: "nature", tree: false, homeCapacity: 0, wildResource: "wild-food" }],
  };
}

function providerFor(...wantedKinds: string[]): DecisionProvider {
  return {
    descriptor,
    decide: async (request) => {
      const selected = wantedKinds.map((kind) => request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === kind)).find(Boolean)
        ?? request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")
        ?? request.candidates.find((candidate) => candidate.legal);
      if (!selected) throw new Error("Social fixture received no legal action.");
      return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
    },
  };
}

describe("emergent social life", () => {
  it("repaths to a moving person and only completes the rescue while adjacent", async () => {
    const seedValue = 8_010;
    const people = [
      { id: 1, name: "Mara", job: "unassigned", position: { x: 2, y: 2 }, personality: personality({ empathy: 0.98 }) },
      { id: 2, name: "Tao", job: "unassigned", position: { x: 3, y: 2 }, personality: personality() },
    ];
    const initial = new MockSimulation(seedValue, people, {}, undefined, undefined, undefined, socialSeed()).getSnapshot();
    initial.citizens[2].physical!.health = 0.18;
    initial.citizens[2].physical!.exposure = 0.8;
    initial.citizens[2].physical!.incapacitatedSinceTick = initial.tick;
    const started = new MockSimulation(seedValue, people, {}, initial, providerFor("rescue_person"));
    await started.step(1);
    const moved = started.getSnapshot();
    moved.citizens[2].position = { x: 9, y: 7 };
    const simulation = new MockSimulation(seedValue, people, {}, moved, providerFor("rescue_person"));
    let completedAtDistance = Number.POSITIVE_INFINITY;
    for (let tick = 0; tick < 24; tick += 1) {
      const result = await simulation.step(1, { copySnapshot: false });
      const decision = result?.snapshot.decisions.find((item) => item.selectedIntent?.kind === "rescue_person" && item.actionStatus === "completed");
      if (!decision || !result) continue;
      const rescuer = result.snapshot.citizens[decision.citizenId];
      const target = result.snapshot.citizens[decision.targetCitizenId!];
      completedAtDistance = Math.max(Math.abs(rescuer.position.x - target.position.x), Math.abs(rescuer.position.y - target.position.y));
      break;
    }
    const snapshot = simulation.getSnapshot();
    expect(completedAtDistance).toBeLessThanOrEqual(1);
    expect(snapshot.decisions.find((decision) => decision.selectedIntent?.kind === "rescue_person" && decision.actionStatus === "completed")).toBeDefined();
    expect(snapshot.citizens[1].position).not.toEqual({ x: 2, y: 2 });
  });

  it("does not offer an unreachable social action as a legal brain choice", async () => {
    const seed = socialSeed();
    for (let y = 0; y < seed.height; y += 1) seed.walkable[y * seed.width + 5] = 0;
    let inspected: import("./types").ActionCandidate | undefined;
    const provider: DecisionProvider = {
      descriptor,
      decide: async (request) => {
        inspected = request.candidates.find((candidate) => candidate.intent?.kind === "share_item");
        const selected = request.candidates.find((candidate) => candidate.legal && candidate.intent?.kind === "idle")!;
        return { requestId: request.requestId, selectedCandidateId: selected.id, provider: descriptor };
      },
    };
    const simulation = new MockSimulation(8_012, [
      { id: 1, name: "Mika", job: "unassigned", position: { x: 2, y: 2 }, inventory: { berries: 3 }, personality: personality({ generosity: 0.9 }) },
      { id: 2, name: "Sol", job: "unassigned", position: { x: 8, y: 2 }, inventory: {}, initialNeeds: { hunger: 0.85 } },
    ], {}, undefined, provider, undefined, seed);
    await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(inspected).toMatchObject({ legal: false, blockedBy: "The intended destination cannot be reached." });
    expect(snapshot.decisions.some((item) => item.selectedIntent?.kind === "share_item")).toBe(false);
    expect(snapshot.citizens[1].inventory.berries).toBe(3);
    expect(snapshot.citizens[2].inventory.berries ?? 0).toBe(0);
  });

  it("moves a freely shared item without creating resources and forms a salient memory", async () => {
    const simulation = new MockSimulation(801, [
      { id: 1, name: "Mika", job: "unassigned", position: { x: 2, y: 2 }, inventory: { berries: 3 }, initialNeeds: { loneliness: 0.9 }, personality: personality({ empathy: 0.9, generosity: 0.9 }) },
      { id: 2, name: "Sol", job: "unassigned", position: { x: 3, y: 2 }, inventory: {}, initialNeeds: { hunger: 0.85, loneliness: 0.9 } },
    ], {}, undefined, providerFor("share_item"), undefined, socialSeed());
    for (let tick = 0; tick < 24 && !simulation.getSnapshot().decisions.some((decision) => decision.selectedIntent?.kind === "share_item" && decision.actionStatus === "completed"); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect((snapshot.citizens[1].inventory.berries ?? 0) + (snapshot.citizens[2].inventory.berries ?? 0)).toBe(3);
    expect(snapshot.citizens[2].inventory.berries).toBe(1);
    expect(snapshot.citizens[1].needs.loneliness).toBeLessThan(0.75);
    expect(snapshot.citizens[2].needs.loneliness).toBeLessThan(0.82);
    expect(snapshot.citizens[2].socialRelationships?.[1]).toMatchObject({ debt: 1 });
    expect(snapshot.citizens[2].memories).toEqual(expect.arrayContaining([expect.objectContaining({ subjectCitizenId: 1, tone: "positive", salience: 0.88 })]));
  });

  it("lets an empathic survivor rescue a collapsed person without inventing supplies", async () => {
    const seed = 8_011;
    const people = [
      { id: 1, name: "Mara", job: "unassigned", position: { x: 2, y: 2 }, inventory: {}, personality: personality({ empathy: 0.98 }) },
      { id: 2, name: "Tao", job: "unassigned", position: { x: 3, y: 2 }, inventory: {}, personality: personality() },
    ];
    const baseline = new MockSimulation(seed, people, {}, undefined, undefined, undefined, socialSeed()).getSnapshot();
    baseline.citizens[2].physical!.health = 0.18;
    baseline.citizens[2].physical!.exposure = 0.8;
    baseline.citizens[2].physical!.incapacitatedSinceTick = baseline.tick;
    const simulation = new MockSimulation(seed, people, {}, baseline, providerFor("rescue_person"));
    for (let tick = 0; tick < 16 && !simulation.getSnapshot().decisions.some((decision) => decision.selectedIntent?.kind === "rescue_person" && decision.actionStatus === "completed"); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[2].physical!.health).toBeGreaterThan(0.18);
    expect(snapshot.citizens[2].physical!.exposure).toBeLessThan(0.8);
    expect(snapshot.citizens[2].memories).toEqual(expect.arrayContaining([expect.objectContaining({ subjectCitizenId: 1, tone: "positive", salience: 1 })]));
    expect(Object.values(snapshot.citizens).reduce((sum, person) => sum + Object.values(person.inventory).reduce((total, amount) => total + amount, 0), 0)).toBe(0);
  });

  it("barters owned goods directly before any currency or market exists", async () => {
    const simulation = new MockSimulation(8_013, [
      { id: 1, name: "Uma", job: "unassigned", position: { x: 2, y: 2 }, inventory: { branches: 2 } },
      { id: 2, name: "Vik", job: "unassigned", position: { x: 3, y: 2 }, inventory: { stone: 1 }, initialRelationships: { 1: 0.8 } },
    ], {}, undefined, providerFor("barter_item"), undefined, socialSeed());
    for (let tick = 0; tick < 20 && !simulation.getSnapshot().decisions.some((decision) => decision.selectedIntent?.kind === "barter_item" && decision.actionStatus === "completed"); tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[1].inventory).toMatchObject({ branches: 1, stone: 1 });
    expect(snapshot.citizens[2].inventory).toMatchObject({ branches: 1, stone: 0 });
    expect(snapshot.economy.policies.currency).toBe(false);
    expect(snapshot.economy.transactions).toHaveLength(0);
  });

  it("turns offered project help into a persistent voluntary commitment", async () => {
    const seedValue = 8_014;
    const people = [
      { id: 1, name: "Wes", job: "unassigned", position: { x: 2, y: 2 }, inventory: {} },
      { id: 2, name: "Yara", job: "unassigned", position: { x: 3, y: 2 }, inventory: {}, personality: personality({ empathy: 0.9, industriousness: 0.9 }) },
    ];
    const baseline = new MockSimulation(seedValue, people, {}, undefined, undefined, undefined, socialSeed()).getSnapshot();
    baseline.physicalWorld.projects["project:20"] = { id: "project:20", objectUid: 20, buildingType: "campfire", position: { x: 4, y: 4 }, workPosition: { x: 4, y: 5 }, footprint: { width: 1, height: 1 }, owner: { kind: "citizen", id: 1 }, requestedByCitizenId: 1, status: "materials", required: { branches: 1 }, delivered: { branches: 0 }, laborRequired: 1, laborCompleted: 0, residentIds: [], capacity: 0, createdAtTick: 1 };
    baseline.physicalWorld.nextObjectUid = 21;
    const simulation = new MockSimulation(seedValue, people, {}, baseline, providerFor("offer_project_help"));
    for (let tick = 0; tick < 20 && simulation.getSnapshot().citizens[2].commitment?.targetId !== "project:20"; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[2].commitment).toMatchObject({ kind: "construction", status: "active", targetId: "project:20" });
    expect(snapshot.citizens[1].memories).toEqual(expect.arrayContaining([expect.objectContaining({ subjectCitizenId: 2, tone: "positive" })]));
  });

  it("allows trusted people to create a household through mutual disposition rather than a global goal", async () => {
    const simulation = new MockSimulation(802, [
      { id: 1, name: "Ines", job: "unassigned", position: { x: 2, y: 2 }, initialRelationships: { 2: 0.8 }, personality: personality({ sociability: 0.9 }) },
      { id: 2, name: "Paz", job: "unassigned", position: { x: 3, y: 2 }, initialRelationships: { 1: 0.8 }, personality: personality({ sociability: 0.9, independence: 0.2 }) },
    ], {}, undefined, providerFor("form_household"), undefined, socialSeed());
    for (let tick = 0; tick < 24 && !simulation.getSnapshot().citizens[1].householdId; tick += 1) await simulation.step(1);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.citizens[1].householdId).toBeTruthy();
    expect(snapshot.citizens[2].householdId).toBe(snapshot.citizens[1].householdId);
    expect(snapshot.civilizationGoal.id).toBe("none");
  });

  it("creates contestable social claims without removing the physical resource", async () => {
    const simulation = new MockSimulation(803, [
      { id: 1, name: "Wren", job: "unassigned", position: { x: 4, y: 4 }, personality: personality({ acquisitiveness: 0.95, dominance: 0.35 }) },
      { id: 2, name: "Noor", job: "unassigned", position: { x: 4, y: 5 }, initialNeeds: { hunger: 0.9 }, personality: personality({ independence: 0.95, aggression: 0.8, dominance: 0.8 }) },
    ], {}, undefined, providerFor("challenge_claim", "claim_resource"), undefined, socialSeed());
    for (let tick = 0; tick < 48; tick += 1) {
      await simulation.step(1);
      const claim = simulation.getSnapshot().physicalWorld.claims["wild-food:19"];
      if (claim?.challengedByIds.includes(2)) break;
    }
    const snapshot = simulation.getSnapshot();
    expect(snapshot.physicalWorld.resources["wild-food:19"]).toBeDefined();
    expect(snapshot.physicalWorld.claims["wild-food:19"].challengedByIds).toContain(2);
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toEqual(expect.arrayContaining(["claim_resource", "challenge_claim"]));
  });

  it("forms a voluntary group and conserves a personal contribution in explicit shared stores", async () => {
    const simulation = new MockSimulation(804, [
      { id: 1, name: "Ari", job: "unassigned", position: { x: 2, y: 2 }, inventory: { branches: 3 }, initialRelationships: { 2: 0.86 }, personality: personality({ sociability: 0.9, generosity: 0.85, independence: 0.2 }) },
      { id: 2, name: "Bea", job: "unassigned", position: { x: 3, y: 2 }, inventory: {}, initialRelationships: { 1: 0.86 }, personality: personality({ sociability: 0.9, independence: 0.15 }) },
    ], {}, undefined, providerFor("form_group", "contribute_group_stock"), undefined, socialSeed());
    for (let tick = 0; tick < 32; tick += 1) {
      await simulation.step(1);
      if (Object.values(simulation.getSnapshot().socialGroups)[0]?.sharedInventory.branches) break;
    }
    const snapshot = simulation.getSnapshot();
    const group = Object.values(snapshot.socialGroups)[0];
    expect(group.memberIds).toEqual([1, 2]);
    expect(group.sharedInventory.branches).toBe(1);
    expect((snapshot.citizens[1].inventory.branches ?? 0) + (group.sharedInventory.branches ?? 0)).toBe(3);
    expect(snapshot.citizens[1].groupIds).toContain(group.id);
    expect(snapshot.citizens[2].groupIds).toContain(group.id);
    expect(() => assertSocialWorldInvariants(snapshot.socialGroups, snapshot.socialPromises, snapshot.citizens)).not.toThrow();
  });

  it("expands a two-person camp only when a third person accepts an invitation", async () => {
    const simulation = new MockSimulation(8_041, [
      { id: 1, name: "Ari", job: "unassigned", position: { x: 2, y: 2 }, initialRelationships: { 2: 0.9, 3: 0.86 }, personality: personality({ sociability: 0.92, independence: 0.1, dominance: 0.95 }) },
      { id: 2, name: "Bea", job: "unassigned", position: { x: 3, y: 2 }, initialRelationships: { 1: 0.9 }, personality: personality({ sociability: 0.9, independence: 0.1, conformity: 0.9 }) },
      { id: 3, name: "Cy", job: "unassigned", position: { x: 4, y: 2 }, initialRelationships: { 1: 0.86 }, personality: personality({ sociability: 0.9, independence: 0.08, conformity: 0.9 }) },
    ], {}, undefined, providerFor("adopt_group_system", "invite_group", "form_group"), undefined, socialSeed());
    for (let tick = 0; tick < 64; tick += 1) {
      await simulation.step(1);
      const group = Object.values(simulation.getSnapshot().socialGroups)[0];
      if (group?.memberIds.length === 3 && group.decisionSystem !== "informal") break;
    }
    const snapshot = simulation.getSnapshot();
    const group = Object.values(snapshot.socialGroups)[0];
    expect(group.memberIds).toEqual([1, 2, 3]);
    expect(group.decisionSystem).not.toBe("informal");
    expect(snapshot.citizens[3].groupIds).toContain(group.id);
    expect(snapshot.decisions.map((decision) => decision.selectedIntent?.kind)).toEqual(expect.arrayContaining(["form_group", "invite_group", "adopt_group_system"]));
  });

  it("turns an overdue promise into remembered mistrust and a grievance", () => {
    const simulation = new MockSimulation(805, [
      { id: 1, name: "Cato", job: "unassigned", personality: personality({ conscientiousness: 0.2 }) },
      { id: 2, name: "Dara", job: "unassigned", personality: personality({ emotionalSensitivity: 0.8 }) },
    ], {}, undefined, undefined, undefined, socialSeed());
    const snapshot = simulation.getSnapshot();
    snapshot.socialPromises["promise-test"] = { id: "promise-test", fromCitizenId: 1, toCitizenId: 2, resource: "berries", amount: 1, promisedAtTick: 2, dueTick: 4, status: "open" };
    const before = snapshot.citizens[2].socialRelationships?.[1]?.trust ?? snapshot.citizens[2].relationships[1] ?? 0.5;
    const events = advanceSocialWorld(snapshot.socialPromises, snapshot.citizens, 5, 1);
    expect(snapshot.socialPromises["promise-test"]).toMatchObject({ status: "broken", resolvedAtTick: 5 });
    expect(snapshot.citizens[2].socialRelationships?.[1].trust).toBeLessThan(before);
    expect(snapshot.citizens[2].socialRelationships?.[1].grievance).toBeGreaterThan(0.2);
    expect(snapshot.citizens[2].memories[0]).toMatchObject({ subjectCitizenId: 1, tone: "negative", salience: 0.96 });
    expect(events[0].title).toMatch(/breaks a promise/i);
  });

  it("offers forgiveness to empathic people and retaliation to angry aggressive people", () => {
    const forgiving = new MockSimulation(806, [
      { id: 1, name: "Eli", job: "unassigned", personality: personality({ empathy: 0.95, aggression: 0.05 }) },
      { id: 2, name: "Fox", job: "unassigned" },
    ], {}, undefined, undefined, undefined, socialSeed()).getSnapshot();
    forgiving.citizens[1].values!.community = 0.9;
    forgiving.citizens[1].socialRelationships![2] = { trust: 0.3, affection: 0.3, fear: 0, respect: 0.3, debt: 0, grievance: 0.5 };
    const contextFor = (snapshot: typeof forgiving): DecisionContext => ({ tick: snapshot.tick, stateVersion: snapshot.stateVersion, citizen: snapshot.citizens[1], citizens: Object.values(snapshot.citizens), stock: snapshot.stock, constructionProgress: snapshot.constructionProgress, physicalWorld: snapshot.physicalWorld, socialGroups: snapshot.socialGroups, socialPromises: snapshot.socialPromises });
    expect(buildSocialCandidates(contextFor(forgiving)).some((candidate) => candidate.intent?.kind === "forgive")).toBe(true);
    expect(buildSocialCandidates(contextFor(forgiving)).some((candidate) => candidate.intent?.kind === "retaliate")).toBe(false);

    forgiving.citizens[1].personality!.empathy = 0.05;
    forgiving.citizens[1].personality!.aggression = 0.95;
    forgiving.citizens[1].emotions!.anger = 0.9;
    forgiving.citizens[1].values!.community = 0.1;
    expect(buildSocialCandidates(contextFor(forgiving)).some((candidate) => candidate.intent?.kind === "retaliate")).toBe(true);
    expect(buildSocialCandidates(contextFor(forgiving)).some((candidate) => candidate.intent?.kind === "forgive")).toBe(false);
  });
});
