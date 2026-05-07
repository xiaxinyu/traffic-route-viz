// CommonJS config to support Node 18.17 (no ESM loader requirement).
// Keep this file in sync with the TS config if you edit settings.
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "corepack pnpm run build && corepack pnpm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...require("@playwright/test").devices["Desktop Chrome"] },
    },
  ],
};

module.exports = config;

