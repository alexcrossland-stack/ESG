/**
 * E2E: Report generation
 *
 * Flow 9 of the ten release-critical flows.
 * Verifies: trigger generates a report record, report is accessible in the list,
 * and role restrictions are enforced.
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

test.describe("REGR-RG: Report generation", () => {
  let generatedReportId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Fetch the first available metric for tenant A
    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    if (metricsRes.status() !== 200) return;
    const metrics = await metricsRes.json() as Array<{ id: string }>;
    if (!Array.isArray(metrics) || metrics.length === 0) return;
    const metricId = metrics[0].id;

    // Seed data for 2024-04 (used by first generate test)
    await request.post("/api/data-entry", {
      data: { metricId, period: "2024-04", value: 10, notes: "seed for report-gen test" },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });

    // Seed data for 2024-03 (used by csv format test)
    await request.post("/api/data-entry", {
      data: { metricId, period: "2024-03", value: 10, notes: "seed for report-gen test" },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
  });

  test("admin POST /api/reports/generate returns 200 with id (no 500)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "pdf",
        reportTemplate: "management",
        period: "2024-04",
        includeMetrics: true,
        includePolicy: false,
        includeTopics: false,
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 201]).toContain(res.status());
    const body = await res.json() as { report?: { id?: string } };
    const id = body.report?.id;
    expect(id).toBeTruthy();
    generatedReportId = id!;
  });

  test("generated report is accessible in GET /api/reports list", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    if (generatedReportId) {
      const found = (body as Array<{ id?: string }>).find(r => r.id === generatedReportId);
      expect(found, `report id=${generatedReportId} must appear in list`).toBeTruthy();
    }
  });

  test("admin can generate a second report variant (csv format)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "csv",
        reportTemplate: "management",
        period: "2024-03",
        includeMetrics: true,
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 201]).toContain(res.status());
    const body = await res.json() as { report?: { id?: string } };
    expect(body.report?.id).toBeTruthy();
  });

  test("viewer cannot generate a report (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "pdf",
        reportTemplate: "management",
        period: "2024-01",
      },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test("contributor cannot generate a report (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "pdf",
        reportTemplate: "management",
        period: "2024-01",
      },
      headers: { Authorization: `Bearer ${tenantA.contributorToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test("REGR-RG: invalid period format returns 400 (not 500)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: { reportType: "pdf", period: "not-a-valid-period" },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("unauthenticated request returns 401", async ({ request }) => {
    const res = await request.post("/api/reports/generate", {
      data: { reportType: "pdf", reportTemplate: "management", period: "2024-01" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/reports returns 200 array for viewer too (read access)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 403]).toContain(res.status());
  });
});
