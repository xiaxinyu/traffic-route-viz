const { expect, test } = require("@playwright/test");

test("export png: can download full-graph image", async ({ page }) => {
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
  await page.getByTestId("diagram-actions-toggle").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-png").click(),
  ]);

  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^traffic-route-viz-\d+\.png$/);
});
