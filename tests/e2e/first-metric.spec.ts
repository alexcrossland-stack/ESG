/**
 * E2E: First metric entry — navigate, submit, verify persists
 *
 * Flow 7 of the ten release-critical flows.
 * Verifies that a freshly-submitted metric value is retrievable after
 * re-fetching from the server (persistence round-trip).
 *
 * @group regression
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
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

type EditableMetric = {
  id: string;
  enabled?: boolean | null;
  metricType?: string | null;
  frequency?: string | null;
};

async function getOrCreateEditableMetricId(request: APIRequestContext, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };
  const metricsRes = await request.get("/api/metrics", { headers });
  expect(metricsRes.status()).toBe(200);
  const metrics = await metricsRes.json() as EditableMetric[];
  const existing = metrics.find((metric) =>
    metric.enabled !== false
    && (!metric.metricType || metric.metricType === "manual")
    && (!metric.frequency || metric.frequency === "monthly"));
  if (existing) return existing.id;

  const createRes = await request.post("/api/metrics", {
    headers,
    data: {
      name: `Release fixture manual metric ${Date.now()}`,
      description: "Editable metric for first-entry release coverage",
      category: "environmental",
      unit: "kWh",
      frequency: "monthly",
      enabled: true,
      metricType: "manual",
    },
  });
  expect(createRes.status()).toBe(200);
  const created = await createRes.json() as { id?: string };
  expect(created.id).toBeTruthy();
  return created.id!;
}

test.describe("REGR-FM: First metric entry and persistence", () => {
  let sharedMetricId: string | null = null;
  const period = `2025-${String(Date.now() % 12 + 1).padStart(2, "0")}`;

  test("GET /api/metrics returns at least one metric for admin", async ({ request }) => {
    const { tenantA } = readSeedInfo();
    const res = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as EditableMetric[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    sharedMetricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);
  });

  test("admin can submit a metric value via POST /api/data-entry", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Get metricId if not yet set
    if (!sharedMetricId) {
      sharedMetricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);
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
      sharedMetricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);
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
      sharedMetricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);
    }

    if (!sharedMetricId) { test.skip(); return; }

    const res = await request.post("/api/data-entry", {
      data: {
        metricId: sharedMetricId,
        period: "2098-02",
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
      sharedMetricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);
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
      sharedMetricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);
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
