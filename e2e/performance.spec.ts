import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_FREEWILL_BROWSER_BENCHMARK !== "1", "Run through pnpm benchmark:browser");

test("profiles a 50-citizen viewer, long tasks, and save latency", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open world library" }).click();
  await page.getByRole("button", { name: "+ Generate a new world" }).click();
  await page.getByLabel("Starting population").fill("50");
  await page.getByLabel("Decision mind").selectOption("mock");
  await page.getByRole("button", { name: "Generate wilderness" }).click();
  await expect(page.getByText(/50 villagers/).first()).toBeVisible();
  await page.getByRole("button", { name: "Start world" }).click();
  const render = await page.evaluate(async () => {
    let frames = 0;
    let longTasks = 0;
    const observer = new PerformanceObserver((list) => { longTasks += list.getEntries().length; });
    try { observer.observe({ type: "longtask", buffered: true }); } catch { /* unsupported browser */ }
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const frame = () => {
        frames += 1;
        if (performance.now() - start >= 2_000) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    observer.disconnect();
    return { fps: frames / ((performance.now() - start) / 1_000), longTasks };
  });
  await page.getByRole("button", { name: "Open world library" }).click();
  const saveStart = Date.now();
  await page.getByRole("button", { name: "Save now" }).click();
  await expect(page.getByText(/Saved (locally|to PostgreSQL)/)).toBeVisible();
  const saveMs = Date.now() - saveStart;
  console.info("FREEWILL_BROWSER_BENCHMARK", JSON.stringify({ ...render, saveMs }));
  expect(render.fps).toBeGreaterThan(45);
  expect(saveMs).toBeLessThan(1_000);
});
