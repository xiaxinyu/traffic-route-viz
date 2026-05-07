const { expect, test } = require("@playwright/test");

test("smoke: loads app and can refresh topology", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Traffic Route Viz")).toBeVisible();
  await expect(page.getByTestId("import-dropzone")).toBeVisible();
  await expect(page.getByTestId("yaml-textarea")).toBeVisible();

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.getByTestId("react-flow")).toBeVisible();

  await page.getByTestId("diagram-actions-toggle").click();
  await expect(page.getByTestId("export-png")).toBeVisible();
  await expect(page.getByTestId("save-diagram")).toBeVisible();
});

