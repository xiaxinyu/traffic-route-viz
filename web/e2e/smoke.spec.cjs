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

test("smoke: loads app and can refresh topology", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Traffic Route Viz")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("import-dropzone")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("top-status-strip")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("textbox", { name: "搜索节点" }).fill("rbac");
  await page.getByRole("button", { name: "下一个" }).click();

  await page.locator("#node-type-filter").selectOption("service");
  await page.getByRole("button", { name: "YAML", exact: true }).first().click();
  await expect(page.getByTestId("yaml-textarea")).toBeVisible();

  await page.getByRole("button", { name: "刷新拓扑" }).click();
  await expect(page.locator(".react-flow").first()).toBeVisible();

  await expect(page.getByTestId("diagram-toolbar")).toBeVisible();
  await expect(page.getByTestId("export-png")).toBeVisible();
  await expect(page.getByTestId("save-diagram")).toBeVisible();
  await expect(page.getByTestId("delete-selected-edges")).toBeVisible();
  await expect(page.getByTestId("open-diagram")).toBeVisible();
  await expect(page.getByTestId("diagram-selection-count")).toContainText("已选 0 节点 / 0 边");
});

test("yaml popout: open edit close syncs content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Traffic Route Viz")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "YAML", exact: true }).first().click();
  await expect(page.getByTestId("yaml-textarea")).toBeVisible();
  await page.getByTestId("yaml-popout-open").click();
  await expect(page.getByTestId("yaml-popout")).toBeVisible();

  const marker = `# popout-test-${Date.now()}`;
  await page
    .getByTestId("yaml-popout")
    .locator("textarea")
    .fill(`apiVersion: v1\nkind: Pod\nmetadata:\n  name: test\n${marker}\n`);
  await page.getByTestId("yaml-popout-close").click();
  await expect(page.getByTestId("yaml-popout")).toHaveCount(0);

  await expect(page.getByTestId("yaml-textarea")).toContainText(marker);
});

test("yaml editor: inline actions expose parse clear and restore", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Traffic Route Viz")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "YAML", exact: true }).first().click();
  await expect(page.getByTestId("yaml-editor-stats")).toContainText("文档");

  await page.getByTestId("yaml-clear").click();
  await expect(page.getByTestId("yaml-textarea")).toHaveValue("");
  await expect(page.getByTestId("yaml-inline-refresh")).toBeDisabled();

  await page.getByTestId("yaml-restore-sample").click();
  await expect(page.getByTestId("yaml-textarea")).toContainText("kind: Ingress");
  await expect(page.getByTestId("yaml-inline-refresh")).toBeEnabled();
});
