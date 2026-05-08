const { expect, test } = require("@playwright/test");

test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  // Make e2e deterministic regardless of local /config.json credentials.
  await page.addInitScript(() => {
    localStorage.setItem(
      "trv.auth.session",
      JSON.stringify({ expMs: Date.now() + 8 * 60 * 60 * 1000 }),
    );
  });
});

test("export png: can download full-graph image", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.locator(".react-flow").first()).toBeVisible();
  await page.getByTestId("diagram-actions-toggle").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-png").click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^traffic-route-viz-\d+\.png$/);
});
