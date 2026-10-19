// playwright.no-db.config.js
//
// Slim config for Playwright specs that don't need a backend database.
// Omits globalSetup so specs can run on workstations without docker
// (eg Bazzite/podman where the docker compose container name differs).
//
// Specs using this config must mock all backend API calls via page.route().
//
// Requires the Vite dev server to be running on http://localhost:3000:
//   cd frontend && npm run dev
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["line"],
  ],
  outputDir: "test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: null,
});
