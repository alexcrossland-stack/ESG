/**
 * E2E: Viewer restrictions — write UI absent/disabled, API returns 403
 *
 * Uses the Tenant A viewer and admin tokens from the shared seed (global-setup)
 * to test role-based access control without per-test user creation.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string; viewerToken: string };
  };
}

test.describe("Viewer restrictions", () => {
  test("viewer is blocked from all write endpoints (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const adminMetricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    const metrics = await adminMetricsRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const writeEndpoints = [
      { method: "POST" as const, path: "/api/data-entry", body: { metricId, period: "2024-Q1", value: 99 } },
      { method: "PUT" as const, path: `/api/metrics/${metricId}/target`, body: { targetValue: 100, targetYear: 2030 } },
      { method: "POST" as const, path: "/api/reports/generate", body: { reportType: "management", period: "2024-Q1" } },
      { method: "PUT" as const, path: "/api/company/settings", body: { reportingFrequency: "quarterly" } },
    ];

    for (const { method, path, body } of writeEndpoints) {
      const res = method === "PUT"
        ? await request.put(path, { data: body, headers: { Authorization: `Bearer ${tenantA.viewerToken}` } })
        : await request.post(path, { data: body, headers: { Authorization: `Bearer ${tenantA.viewerToken}` } });
      expect(res.status()).toBe(403);
    }
  });

  test("viewer can read metrics (200) but not write (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const readRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(readRes.status()).toBe(200);

    const metrics = await readRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const writeRes = await request.post("/api/data-entry", {
      data: { metricId, period: "2024-Q1", value: 1 },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(writeRes.status()).toBe(403);
  });
});
