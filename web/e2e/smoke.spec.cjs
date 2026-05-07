const { expect, test } = require("@playwright/test");

test("smoke: loads app and can refresh topology", async ({ page }) => {
  await page.goto("/");
  const loginBtn = page.getByRole("button", { name: "登录" });
  if (await loginBtn.count()) {
    const inputs = page.locator("input");
    await inputs.nth(0).fill("admin");
    await inputs.nth(1).fill("change-me");
    await loginBtn.click();
  }

  await expect(page.getByText("Traffic Route Viz")).toBeVisible();
  await expect(page.getByTestId("import-dropzone")).toBeVisible();
  await expect(page.getByTestId("top-status-strip")).toBeVisible();

  await page.getByRole("textbox", { name: "搜索节点" }).fill("rbac");
  await page.getByRole("button", { name: "下一个" }).click();

  await page.getByRole("button", { name: /Service/ }).first().click();
  await page.getByRole("button", { name: "YAML", exact: true }).first().click();
  await expect(page.getByTestId("yaml-textarea")).toBeVisible();

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.locator(".react-flow").first()).toBeVisible();

  await page.getByTestId("diagram-actions-toggle").click();
  await expect(page.getByTestId("export-png")).toBeVisible();
  await expect(page.getByTestId("save-diagram")).toBeVisible();
  await expect(page.getByTestId("delete-selected-edges")).toBeVisible();
});
