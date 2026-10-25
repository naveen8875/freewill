import { expect, test, type Page } from "@playwright/test";

async function startCivilization(page: Page) {
  const start = page.getByRole("button", { name: "Start world" });
  await expect(start).toBeVisible();
  await start.click();
}

test("runs deterministic decisions and exposes a single-step control", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("freewill");
  await expect(page.getByRole("button", { name: "Open world library" }).getByText("freewill", { exact: true })).toBeVisible();
  await expect(page.getByText(/First Light · 12 villagers/)).toBeVisible();
  const initialPositions = await page.evaluate(() => JSON.stringify((window as unknown as { world: { entities: Array<{ kind: string; x: number; y: number }> } }).world.entities.filter((entity) => entity.kind === "villager").map(({ x, y }) => [x, y])));
  await expect(page.getByRole("button", { name: "Start world" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run at 1 times speed" })).toBeDisabled();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => JSON.stringify((window as unknown as { world: { entities: Array<{ kind: string; x: number; y: number }> } }).world.entities.filter((entity) => entity.kind === "villager").map(({ x, y }) => [x, y])))).toBe(initialPositions);
  expect(await page.evaluate(() => (window as unknown as { game: { externalDecisions: boolean } }).game.externalDecisions)).toBe(true);
  await page.getByRole("button", { name: /Local brains|Brains thinking/ }).click();
  await startCivilization(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const step = page.getByRole("button", { name: "Advance one simulation decision" });
  await expect(step).toBeVisible();
  for (let index = 0; index < 12; index += 1) await step.click();
  await page.getByRole("button", { name: "Decisions" }).click();
  await expect(page.getByText("Mock heuristic provider · accepted")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How we got here" })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByLabel("How this decision happened")).toContainText("What mattered most");
  await expect(page.getByLabel("How this decision happened")).toContainText("Paths the world allowed");
  await expect(page.getByLabel("How this decision happened")).toContainText("What changed in the world");
  const historyNodes = page.getByLabel("Recent decision history").getByRole("button");
  await expect(historyNodes.first()).toBeVisible();
  await historyNodes.first().click();
  await expect(historyNodes.first()).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Inspect the evidence").click();
  await expect(page.getByText("Legal candidates & provider signals")).toBeVisible();
  await expect(page.getByText("Legal candidates & provider signals")).toBeVisible();
});

test("enters a visibly read-only historical replay and returns to the live snapshot", async ({ page }) => {
  await page.goto("/");
  await startCivilization(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const step = page.getByRole("button", { name: "Advance one simulation decision" });
  for (let index = 0; index < 13; index += 1) await step.click();
  await page.getByRole("button", { name: "Chronicle" }).click();
  const slider = page.getByLabel("Historical simulation tick");
  await expect(slider).toBeVisible();
  await slider.fill("0");
  await expect(page.getByText(/Historical view · tick 0/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Build", exact: true }).first()).toBeDisabled();
  await page.getByRole("button", { name: "Return to present" }).first().click();
  await expect(page.getByText(/Historical view/)).toHaveCount(0);
});

test("replays a saved world from its first recorded tick without changing the save", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "+ Generate a new world" }).click();
  await page.getByLabel("World name").fill("Replay Test");
  await page.getByLabel("Decision mind").selectOption("mock");
  await page.getByRole("button", { name: "Generate wilderness" }).click();
  await startCivilization(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const step = page.getByRole("button", { name: "Advance one simulation decision" });
  for (let index = 0; index < 40; index += 1) await step.click();

  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "Save now" }).click();
  await expect(page.getByText(/Saved (locally|to PostgreSQL)/)).toBeVisible();
  const savedWorld = page.locator(".saved-world-list article").filter({ hasText: "Replay Test" }).first();
  await expect(savedWorld.getByRole("button", { name: "Replay Replay Test" })).toBeVisible();
  await savedWorld.getByRole("button", { name: "Replay Replay Test" }).click();

  await expect(page.getByRole("heading", { name: "Village chronicle" })).toBeVisible();
  await expect(page.getByText(/Historical view · tick/)).toBeVisible();
  await page.getByRole("button", { name: "Pause replay" }).click();
  const slider = page.getByLabel("Historical simulation tick");
  const replayTick = Number(await slider.inputValue());
  const savedTick = Number(await slider.getAttribute("max"));
  expect(replayTick).toBeLessThan(savedTick);

  await page.getByRole("button", { name: "Open world library" }).click();
  await expect(page.getByRole("button", { name: "Save now" })).toBeDisabled();
  await page.getByRole("button", { name: "Return to present" }).click();
  await expect(page.getByText(/Historical view/)).toHaveCount(0);
  await page.getByRole("button", { name: "Chronicle" }).click();
  await expect(page.getByLabel("Historical simulation tick")).toHaveValue(String(savedTick));
});

test("keeps primary controls keyboard reachable with visible semantic labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas.world-canvas")).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim());
  expect(focusedLabel).toBeTruthy();
  await expect(page.getByRole("navigation", { name: "World workspace" })).toBeVisible();
});

test("loads a preset and saves a versioned world to the active backend", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: /Open Meadow An empty plot/ }).click();
  await expect(page.getByText(/Open Meadow · 3 villagers/)).toBeVisible();
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "Save now" }).click();
  await expect(page.getByText(/Saved (locally|to PostgreSQL)/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Meadow meadow · seed 7/ }).first()).toBeVisible();
});

test("opens the real recording studio with social layouts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Frame this little world" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cinematic world/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Vertical social/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
});

test("creates an empty-handed wilderness experiment from structured inputs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "+ Generate a new world" }).click();
  await page.getByLabel("World name").fill("Juniper Vale");
  await page.getByLabel("Starting population").fill("9");
  await page.getByLabel("Environmental harshness").selectOption("gentle");
  const decisionMind = page.getByLabel("Decision mind");
  await expect(decisionMind.locator('option[value="local-brain"]')).toHaveText("Local evolving neural brains");
  await decisionMind.selectOption("local-brain");
  await page.getByRole("button", { name: "Generate wilderness" }).click();
  await expect(page.getByText(/Juniper Vale · 9 villagers/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start world" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Local brains|Brains thinking/ })).toBeVisible();
  await page.getByRole("button", { name: "People" }).click();
  await expect(page.getByRole("button", { name: /Rowan unassigned/ })).toBeVisible();
  await page.getByRole("button", { name: /Rowan unassigned/ }).click();
  await expect(page.getByText("Survive, learn this place, and choose a life")).toBeVisible();
  await expect(page.getByText("Empty pockets")).toBeVisible();
  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
});

test("loads the economy art pack and exposes the live causal ledger", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: /Copperfield Five villagers/ }).click();
  await expect(page.getByText(/Copperfield · 5 villagers/)).toBeVisible();
  await page.getByRole("button", { name: "Society", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Copperfield ledger" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Economy ledger views" })).toBeVisible();
  await expect(page.getByLabel("Market economy milestones")).toContainText("charter");
  await page.getByRole("button", { name: "Decision map" }).click();
  const map = page.getByRole("dialog", { name: "How this society came to be" });
  await expect(map).toBeVisible();
  await expect(map.getByLabel("Civilization decision map")).toContainText("Build a market economy");
  await map.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Build", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Property Stake", exact: true })).toBeVisible();
});

test("generates a sized world and exposes brush and fill terrain tools", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "+ Generate a new world" }).click();
  await page.getByLabel("World name").fill("Pocket Basin");
  await page.getByLabel("World dimensions").selectOption("64x64");
  await page.getByLabel("Starting population").fill("5");
  await page.getByRole("button", { name: "Generate wilderness" }).click();
  await expect(page.getByText(/Pocket Basin · 5 villagers/)).toBeVisible();
  expect(await page.evaluate(() => {
    const world = (window as unknown as { world: { w: number; h: number } }).world;
    return [world.w, world.h];
  })).toEqual([64, 64]);
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await expect(page.getByRole("button", { name: "5 × 5" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fill region" })).toBeVisible();
});

test("advances a generated wilderness through the rendered client", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The long autonomous physical-world smoke runs once in Chromium.");
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "+ Generate a new world" }).click();
  await page.getByLabel("World name").fill("Timber Test");
  await page.getByLabel("World dimensions").selectOption("64x64");
  await page.getByLabel("Starting population").fill("3");
  await page.getByLabel("Decision mind").selectOption("mock");
  await page.getByRole("button", { name: "Generate wilderness" }).click();
  await startCivilization(page);
  await page.getByRole("button", { name: "Run at 5 times speed" }).click();
  await page.waitForTimeout(3_000);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.getByRole("button", { name: "Chronicle" }).click();
  const slider = page.getByLabel("Historical simulation tick");
  await expect(slider).toBeVisible();
  expect(Number(await slider.getAttribute("max"))).toBeGreaterThan(0);
  await expect(page.locator(".chronicle-list li").first()).toBeVisible();
});

test("exposes relationship provenance and filterable timeline details", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Relations" }).click();
  await expect(page.getByRole("heading", { name: "Relationship map" })).toBeVisible();
  await expect(page.getByText(/No relationship is generated solely for presentation/)).toBeVisible();
  await page.getByRole("button", { name: "Chronicle" }).click();
  await expect(page.getByRole("button", { name: "social", exact: true })).toBeVisible();
  await page.locator(".chronicle-list li > button").first().click();
  await expect(page.locator(".event-detail")).toBeVisible();
});

test("commits a real editor placement and reverses it with undo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: /Open Meadow An empty plot/ }).click();
  const before = await page.evaluate(() => (window as unknown as { world: { objects: unknown[] } }).world.objects.length);
  await page.getByRole("button", { name: "Build", exact: true }).first().click();
  await page.getByRole("button", { name: "Cottage", exact: true }).click();
  await page.waitForTimeout(250);
  const position = await page.evaluate(() => {
    const scope = window as unknown as { world: { w: number; h: number; canPlace(id: string, x: number, y: number): boolean }; game: { cam: { x: number; y: number; z: number } }; LW: { Assets: { T: number; get(id: string): { foot: [number, number] } } } };
    const { world, game } = scope;
    const tile = scope.LW.Assets.T;
    for (let y = 2; y < world.h - 4; y += 1) for (let x = 2; x < world.w - 4; x += 1) {
      if (!world.canPlace("cottage", x, y)) continue;
      const foot = scope.LW.Assets.get("cottage").foot;
      const hoverX = x + ((foot[0] - 1) >> 1);
      const hoverY = y + foot[1] - 1;
      const sx = ((hoverX + 0.5) * tile - game.cam.x) * game.cam.z;
      const sy = ((hoverY + 0.5) * tile - game.cam.y) * game.cam.z;
      if (sx > 120 && sx < 950 && sy > 120 && sy < 690) return { x: sx, y: sy };
    }
    throw new Error("No visible cottage placement was available.");
  });
  await page.locator("canvas.world-canvas").click({ position });
  await expect.poll(() => page.evaluate(() => (window as unknown as { world: { objects: unknown[] } }).world.objects.length)).toBe(before + 1);
  const undo = page.getByRole("button", { name: /Undo/ });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { world: { objects: unknown[] } }).world.objects.length)).toBe(before);
  const redo = page.getByRole("button", { name: /Redo/ });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { world: { objects: unknown[] } }).world.objects.length)).toBe(before + 1);
});
