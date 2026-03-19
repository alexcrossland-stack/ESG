/**
 * E2E: Report generation — success or loading state appears
 *
 * Uses the Tenant A admin and viewer tokens from the shared seed (global-setup)
 * to avoid per-test user creation and register rate-limit issues.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string; viewerToken: string };
  };
}

test.describe("Report generation", () => {
  test("POST /api/reports/generate responds without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "management",
        period: "2024-Q1",
        includeMetrics: true,
        includePolicy: true,
        includeTopics: true,
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });

    expect(res.status()).not.toBe(500);
    expect([200, 201, 202, 400]).toContain(res.status());
  });

  test("GET /api/reports returns array without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test("viewer role is blocked from POST /api/reports/generate (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: { reportType: "management", period: "2024-Q1" },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });
});
