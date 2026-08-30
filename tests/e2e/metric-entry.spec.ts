/**
 * E2E: First metric entry — raw-data input flow
 *
 * Uses the Tenant A admin token from the shared seed (global-setup) to
 * submit and retrieve metric values without per-test user creation.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
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
      name: `Metric-entry fixture ${Date.now()}`,
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

test.describe("Metric entry flow", () => {
  test("admin can submit a metric value and retrieve it", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);

    const submitRes = await request.post("/api/data-entry", {
      data: {
        metricId,
        period: "2024-01",
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
    const our = (values as Array<{ period: string; value: number }>).find((v) => v.period === "2024-01");
    expect(our).toBeTruthy();
  });

  test("missing period returns 400 with error field", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricId = await getOrCreateEditableMetricId(request, tenantA.adminToken);

    const res = await request.post("/api/data-entry", {
      data: { metricId, value: 100 },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
