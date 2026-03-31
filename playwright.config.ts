import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5000",
    trace: "on-first-retry",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "api",
      testMatch: /^(?!.*\.browser\.spec\.ts$).*\.spec\.ts$/,
      use: {
        extraHTTPHeaders: { "Content-Type": "application/json" },
      },
    },
    {
      name: "chromium",
      testMatch: /.*\.browser\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
      },
    },
  ],
});
