/**
 * E2E: First metric entry — navigate, submit, verify persists
 *
 * Flow 7 of the ten release-critical flows.
 * Verifies that a freshly-submitted metric value is retrievable after
 * re-fetching from the server (persistence round-trip).
 *
 * @group regression
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(
    fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")
  ) as {
    tenantA: {
      adminToken: string;
      contributorToken: string;
      viewerToken: string;
    };
  };
}

test.describe("REGR-FM: First metric entry and persistence", () => {
  let sharedMetricId: string | null = null;
  const period = `2025-Q${Date.now() % 4 + 1}`;

  test("GET /api/metrics returns at least one metric for admin", async ({ request }) => {
    const { tenantA } = readSeedInfo();
    const res = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as Array<{ id: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    sharedMetricId = body[0].id;
  });

  test("admin can submit a metric value via POST /api/data-entry", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Get metricId if not yet set
    if (!sharedMetricId) {
      const metricsRes = await request.get("/api/metrics", {
        headers: { Authorization: `Bearer ${tenantA.adminToken}` },
      });
      const metrics = await metricsRes.json() as Array<{ id: string }>;
      sharedMetricId = metrics[0]?.id ?? null;
    }
    expect(sharedMetricId, "metricId must be available").toBeTruthy();

    const res = await request.post("/api/data-entry", {
      data: {
        metricId: sharedMetricId,
        period,
        value: 77.3,
        notes: "first-metric E2E test",
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 201]).toContain(res.status());
    const body = await res.json() as { id?: string; metricId?: string };
    expect(body.id).toBeTruthy();
    expect(body.metricId).toBe(sharedMetricId);
  });

  test("submitted value persists and is retrievable via /api/metrics/:id/values", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    if (!sharedMetricId) {
      const metricsRes = await request.get("/api/metrics", {
        headers: { Authorization: `Bearer ${tenantA.adminToken}` },
      });
      const metrics = await metricsRes.json() as Array<{ id: string }>;
      sharedMetricId = metrics[0]?.id ?? null;
    }

    if (!sharedMetricId) { test.skip(); return; }

    // Re-fetch values from the server to confirm persistence
    const valuesRes = await request.get(`/api/metrics/${sharedMetricId}/values`, {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(valuesRes.status()).toBe(200);
    const values = await valuesRes.json() as Array<{ period: string; value: string | number }>;
    expect(Array.isArray(values)).toBe(true);
    // The value submitted above must appear in the list
    const found = values.find(v => v.period === period);
    expect(found, `period=${period} must appear in persisted values`).toBeTruthy();
  });

  test("contributor can also submit a metric value", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    if (!sharedMetricId) {
      const metricsRes = await request.get("/api/metrics", {
        headers: { Authorization: `Bearer ${tenantA.adminToken}` },
      });
      const metrics = await metricsRes.json() as Array<{ id: string }>;
      sharedMetricId = metrics[0]?.id ?? null;
    }

    if (!sharedMetricId) { test.skip(); return; }

    const res = await request.post("/api/data-entry", {
      data: {
        metricId: sharedMetricId,
        period: `2025-contrib-${Date.now()}`,
        value: 55,
        notes: "contributor first-metric test",
      },
      headers: { Authorization: `Bearer ${tenantA.contributorToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 201]).toContain(res.status());
  });

  test("viewer cannot submit a metric value (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    if (!sharedMetricId) {
      const metricsRes = await request.get("/api/metrics", {
        headers: { Authorization: `Bearer ${tenantA.adminToken}` },
      });
      const metrics = await metricsRes.json() as Array<{ id: string }>;
      sharedMetricId = metrics[0]?.id ?? null;
    }

    if (!sharedMetricId) { test.skip(); return; }

    const res = await request.post("/api/data-entry", {
      data: { metricId: sharedMetricId, period: "2025-viewer-block", value: 1 },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test("missing period field returns 400", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    if (!sharedMetricId) {
      const metricsRes = await request.get("/api/metrics", {
        headers: { Authorization: `Bearer ${tenantA.adminToken}` },
      });
      const metrics = await metricsRes.json() as Array<{ id: string }>;
      sharedMetricId = metrics[0]?.id ?? null;
    }

    if (!sharedMetricId) { test.skip(); return; }

    const res = await request.post("/api/data-entry", {
      data: { metricId: sharedMetricId, value: 42 },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeTruthy();
  });
});
