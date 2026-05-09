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

  // Regression guard: global UI scale should not break edge SVG layer visibility/interactions.
  await page.getByTitle("缩小侧栏与拓扑（含文字）").click();
  await page.getByTitle("放大侧栏与拓扑（含文字）").click();

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

  // Toolbar actions are first-level controls and should be visible without expanding a menu.
  await expect(page.getByTestId("delete-selected-elements")).toBeVisible();

  const allNodes = page.locator(".react-flow__node:not(.parent)");
  const before = await allNodes.count();
  expect(before).toBeGreaterThan(0);

  let nodeLocator = null;
  for (let i = 0; i < before; i += 1) {
    const candidate = allNodes.nth(i);
    const box = await candidate.boundingBox();
    if (box && box.x > 420 && box.y > 130) {
      nodeLocator = candidate;
      break;
    }
  }
  if (!nodeLocator) throw new Error("No clickable graph node found in the visible canvas area");

  await nodeLocator.click();
  await expect(nodeLocator).toHaveClass(/selected/);
  await expect(page.getByTestId("diagram-selection-count")).toContainText("已选 1 节点");
  await page.getByTestId("delete-selected-elements").click();

  await expect
    .poll(async () => await page.locator(".react-flow__node:not(.parent)").count(), {
      timeout: 5000,
    })
    .toBeLessThan(before);
});
