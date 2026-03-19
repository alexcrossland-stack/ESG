/**
 * E2E: Dashboard — empty states and CTA navigation
 *
 * Uses the Tenant A admin token from the shared seed (global-setup) to
 * avoid per-test user creation and register rate-limit issues.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
  };
}

test.describe("Dashboard API", () => {
  test("GET /api/dashboard/enhanced returns valid structure without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const dashRes = await request.get("/api/dashboard/enhanced", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(dashRes.status()).not.toBe(500);
    expect([200, 404]).toContain(dashRes.status());
    if (dashRes.status() === 200) {
      const body = await dashRes.json();
      expect(body).toBeTruthy();
    }
  });

  test("GET /api/metrics returns array after seedDatabase", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/topics returns array after seedDatabase", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/topics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test("unauthenticated GET /api/dashboard/enhanced returns 401", async ({ request }) => {
    const res = await request.get("/api/dashboard/enhanced");
    expect(res.status()).toBe(401);
  });
});
