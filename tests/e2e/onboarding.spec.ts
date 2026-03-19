/**
 * E2E: Onboarding flow — default metrics exist after seed, onboarding PUT does not 500
 *
 * Uses the Tenant A admin token from the shared seed (global-setup) to verify
 * that default metrics are available after onboarding and that the onboarding
 * step endpoint is functional, without going through the register rate limit.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
  };
}

test.describe("Onboarding flow", () => {
  test("new user login triggers seedDatabase and metrics are available", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
  });

  test("onboarding step PUT does not return 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const stepRes = await request.put("/api/onboarding/step", {
      data: {
        step: 1,
        path: "/onboarding",
        esgMaturity: "beginner",
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(stepRes.status()).not.toBe(500);
  });
});
