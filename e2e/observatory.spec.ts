import { expect, test } from "@playwright/test";

test("shows a live island and genuine brain candidate scores", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const width = 48;
  const height = 36;
  const citizens = [
    { id: 1, name: "Asha", position: { x: 21, y: 17 }, action: "gather_wood" },
    { id: 2, name: "Milo", position: { x: 24, y: 18 }, action: "forage_food" },
  ].map(({ action, ...citizen }) => ({
    ...citizen,
    facing: "down",
    traits: ["curious", "social"],
    needs: { hunger: .24, fatigue: .18, loneliness: .12, thirst: .16 },
    happiness: .72,
    inventory: { wood: 2, food: 3 },
    currentActivity: action,
    currentActionId: action,
    groupIds: ["camp"],
    physical: { health: .92, alive: true },
    knowledge: { discoveredTiles: 64, knownResources: 7, knownPeople: 1, learnedTechniques: [] },
    memories: [{ id: `memory-${citizen.id}`, tick: 20, day: 2, type: "experience", tone: "positive", importance: .5, text: "Found a useful place near the eastern grove." }],
  }));
  const decisions = citizens.map((citizen) => ({
    id: `decision-${citizen.id}`,
    tick: 38,
    citizenId: citizen.id,
    provider: { kind: "local-brain", label: "Local evolving brain" },
    candidates: [{ id: "gather_wood", label: "Gather wood" }, { id: "forage_food", label: "Forage food" }, { id: "rest", label: "Rest" }],
    selectedCandidateId: citizen.currentActionId,
    selected: citizen.currentActionId,
    selectedLabel: citizen.currentActivity,
    providerSignals: { kind: "external", confidence: .58, responseModel: `local:field-g2-brain-${citizen.id}`, evaluations: [{ candidateId: "gather_wood", probability: .58 }, { candidateId: "forage_food", probability: .27 }, { candidateId: "rest", probability: .15 }] },
  }));
  const snapshot = {
    tick: 48, width, height,
    walkable: Array(width * height).fill(1),
    biomes: Array.from({ length: width * height }, (_, index) => index % width < 4 ? "ocean" : index % 11 < 3 ? "forest" : "grassland"),
    hazards: Array(width * height).fill(0),
    citizens,
    resources: [{ id: "tree", kind: "tree", position: { x: 22, y: 16 }, status: "available", yield: { wood: 8 } }],
    projects: [], buildings: [],
    actions: citizens.map((citizen) => ({ citizenId: citizen.id, actionId: citizen.currentActionId, phase: "travel", route: [citizen.position, { x: citizen.position.x + 1, y: citizen.position.y }], routeIndex: 0, workTicksRemaining: 3 })),
    decisions,
    events: [{ id: "event-1", tick: 46, day: 4, title: "Asha gathered wood", detail: "Two wood are moving toward the shared shelter.", category: "work", citizenIds: [1] }],
    groups: [{ id: "camp", name: "Eastern camp", memberIds: [1, 2] }],
  };
  const episode = { episodeId: "qa-g2-training-s8031-r0", generation: 2, cohort: "training", seed: 8031, replicate: 0, day: 4, maximumDays: 30, survivors: 2, live: true, replay: { minimumTick: 0, maximumTick: 48, displayTick: 48, checkpointTicks: [0] }, snapshot };
  const payload = { experiment: { id: "qa", name: "Island evolution 01", status: "running", progress: { stage: "training", generation: 2, totalGenerations: 3, completedEpisodes: 20, totalEpisodes: 40, message: "training" } }, episodes: [episode, { ...episode, episodeId: "qa-g2-training-s8031-r1", replicate: 1 }], sampledAt: Date.now() };

  await page.route("**/api/experiments/qa/observatory*", (route) => {
    const requested = new URL(route.request().url()).searchParams.get("tick");
    const displayTick = requested === null ? 48 : Number(requested);
    const replayPayload = { ...payload, episodes: payload.episodes.map((item, index) => index ? item : { ...item, replay: { ...item.replay, displayTick }, snapshot: { ...item.snapshot, tick: displayTick } }) };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(replayPayload) });
  });
  const baseUrl = process.env.OBSERVATORY_BASE_URL ?? "http://127.0.0.1:5173";
  await page.goto(`${baseUrl}/observatory?experiment=qa`);
  await expect(page.getByText("What the brain considered")).toBeVisible();
  await expect(page.getByText("58%").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay episode" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Replay timeline" })).toHaveValue("48");
  await page.getByRole("slider", { name: "Replay timeline" }).fill("12");
  await expect(page.getByText("tick 12 of 48")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to live" })).toBeVisible();
  await expect(page.locator(".observatory-episodes button")).toHaveCount(2);
  await expect(page.locator(".observatory-roster button")).toHaveCount(2);
  if (process.env.OBSERVATORY_SCREENSHOT) await page.screenshot({ path: process.env.OBSERVATORY_SCREENSHOT, fullPage: true });
  expect(errors).toEqual([]);
});
