const { expect, test } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  // Make e2e deterministic regardless of local /config.json credentials.
  await page.addInitScript(() => {
    localStorage.setItem(
      "trv.auth.session",
      JSON.stringify({ expMs: Date.now() + 8 * 60 * 60 * 1000 }),
    );
  });
});

test("edge editing: auto edge can be selected and deleted", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.locator(".react-flow").first()).toBeVisible();

  const edges = page.locator(".react-flow__edge");
  const before = await edges.count();
  expect(before).toBeGreaterThan(0);

  await page.locator(".react-flow__edge-path").first().click({ force: true });
  await expect(page.locator(".react-flow__edgeupdater").first()).toBeVisible();

  await page.keyboard.press("Delete");
  await expect
    .poll(async () => await page.locator(".react-flow__edge").count(), { timeout: 5000 })
    .toBeLessThan(before);
});

test("element editing: selected node can be deleted from toolbar", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.locator(".react-flow").first()).toBeVisible();

  // Open toolbar first so clicking it doesn't clear selection.
  await page.getByTestId("diagram-actions-toggle").click();
  await expect(page.getByTestId("delete-selected-elements")).toBeVisible();

  const nodeLocator = page.locator(".react-flow__node:not(.parent)").first();
  const before = await page.locator(".react-flow__node:not(.parent)").count();
  expect(before).toBeGreaterThan(0);
  await nodeLocator.click({ force: true });
  await expect(nodeLocator).toHaveClass(/selected/);
  await page.getByTestId("delete-selected-elements").click();

  await expect
    .poll(async () => await page.locator(".react-flow__node:not(.parent)").count(), {
      timeout: 5000,
    })
    .toBeLessThan(before);
});
