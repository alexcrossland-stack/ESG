import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5000",
    trace: "on-first-retry",
    actionTimeout: 15000,
    navigationTimeout: 30000,
    // Use API testing mode (APIRequestContext) — no browser required
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
  projects: [
    {
      name: "api",
      use: {},
    },
  ],
});
