// playwright.config.js
// IMPORTANT: All Playwright test files, results, and reports must be placed in the 'testing' directory.
// Do not create or use test files or results outside 'testing' to keep the workspace organized.
// This applies to all team members and Playwright MCP automation.
import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run tests sequentially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Retry once locally for flaky tests
  workers: 1, // Run one test at a time for database consistency
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["line"],
  ],
  outputDir: "test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Set global action timeout to 30 seconds for slower operations
    actionTimeout: 30000,
    // Set navigation timeout to 30 seconds
    navigationTimeout: 30000,
  },

  // Set test timeout to 60 seconds
  timeout: 60000,

  // Global setup to ensure database has test users
  globalSetup: path.resolve(__dirname, './global-setup.js'),
  globalTeardown: undefined,

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Application is already running via Docker Compose
  // webServer configuration commented out since services are running
  webServer: null,
});
