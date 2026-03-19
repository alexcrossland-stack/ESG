/**
 * E2E: First metric entry — raw-data input flow
 *
 * Uses the Tenant A admin token from the shared seed (global-setup) to
 * submit and retrieve metric values without per-test user creation.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
  };
}

test.describe("Metric entry flow", () => {
  test("admin can submit a metric value and retrieve it", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);

    const metricId = metrics[0].id;

    const submitRes = await request.post("/api/data-entry", {
      data: {
        metricId,
        period: "2024-Q1",
        value: 42.5,
        notes: "E2E test entry",
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });

    expect(submitRes.status()).not.toBe(500);
    expect([200, 201]).toContain(submitRes.status());
    const submitted = await submitRes.json();
    expect(submitted.id).toBeTruthy();
    expect(submitted.metricId).toBe(metricId);

    const valuesRes = await request.get(`/api/metrics/${metricId}/values`, {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(valuesRes.status()).toBe(200);
    const values = await valuesRes.json();
    const our = (values as Array<{ period: string; value: number }>).find((v) => v.period === "2024-Q1");
    expect(our).toBeTruthy();
  });

  test("missing period returns 400 with error field", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    const metrics = await metricsRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const res = await request.post("/api/data-entry", {
      data: { metricId, value: 100 },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
