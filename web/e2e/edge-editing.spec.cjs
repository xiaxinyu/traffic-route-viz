const { expect, test } = require("@playwright/test");

test("edge editing: auto edge can be selected and deleted", async ({ page }) => {
  await page.goto("/");
  const loginBtn = page.getByRole("button", { name: "登录" });
  if (await loginBtn.count()) {
    const inputs = page.locator("input");
    await inputs.nth(0).fill("admin");
    await inputs.nth(1).fill("change-me");
    await loginBtn.click();
  }

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
  const loginBtn = page.getByRole("button", { name: "登录" });
  if (await loginBtn.count()) {
    const inputs = page.locator("input");
    await inputs.nth(0).fill("admin");
    await inputs.nth(1).fill("change-me");
    await loginBtn.click();
  }

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.locator(".react-flow").first()).toBeVisible();

  const nodeLocator = page.locator(".react-flow__node:not(.parent)").first();
  const before = await page.locator(".react-flow__node:not(.parent)").count();
  expect(before).toBeGreaterThan(0);
  await nodeLocator.click({ force: true });

  await page.getByTestId("diagram-actions-toggle").click();
  await page.getByTestId("delete-selected-elements").click();

  await expect
    .poll(async () => await page.locator(".react-flow__node:not(.parent)").count(), { timeout: 5000 })
    .toBeLessThan(before);
});
