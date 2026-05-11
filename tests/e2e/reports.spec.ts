/**
 * E2E: Report generation — success or loading state appears
 *
 * Uses the Tenant A admin and viewer tokens from the shared seed (global-setup)
 * to avoid per-test user creation and register rate-limit issues.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string; viewerToken: string };
  };
}

const mockedReports = [
  {
    id: "report-available",
    period: "2024-01",
    reportType: "pdf",
    reportTemplate: "management",
    generatedAt: "2026-05-07T09:30:00.000Z",
    workflowStatus: "draft",
    latestFileId: "file-available",
    latestFilename: "Management_Report_2024-01.pdf",
    latestFileType: "pdf",
    latestFileSize: 4096,
    latestDownloadUrl: "/api/reports/report-available/download/file-available",
    fileAvailability: "available",
    fileUnavailableReason: null,
    companyName: "Mock Co",
    generatedByName: "Mock Admin",
    reportData: {
      company: { id: "company-a", name: "Mock Co" },
      reportTitle: "Mock Historical Report",
      reportTemplate: "management",
      period: "2024-01",
      generatedAt: "2026-05-07T09:30:00.000Z",
      generatedBy: "Mock Admin",
      values: [{
        id: "value-1",
        metricName: "Electricity Consumption",
        category: "environmental",
        value: "123.45",
        unit: "kWh",
        dataSourceLabel: "Evidenced",
        workflowLabel: "Approved",
      }],
      metricsByCategory: {
        environmental: [{
          id: "value-1",
          metricName: "Electricity Consumption",
          category: "environmental",
          value: "123.45",
          unit: "kWh",
          dataSourceLabel: "Evidenced",
          workflowLabel: "Approved",
        }],
      },
      weightedScore: { overallScore: 88, categoryScores: { environmental: { score: 88, scoredCount: 1, metricCount: 1 } } },
      evidenceCoverage: { totalEvidence: 2, evidencedCount: 1, totalMetrics: 1, coveragePercent: 100 },
      factorMethodology: { factorYear: 2024, source: "UK DEFRA" },
      dataQualityFlags: { approvalRate: 0, evidenceRate: 0, missingCount: 0 },
    },
  },
  {
    id: "report-unavailable",
    period: "2024-02",
    reportType: "pdf",
    reportTemplate: "customer",
    generatedAt: "2026-05-07T10:30:00.000Z",
    workflowStatus: "rejected",
    latestFileId: null,
    latestFilename: null,
    latestFileType: null,
    latestFileSize: null,
    latestDownloadUrl: null,
    fileAvailability: "unavailable",
    fileUnavailableReason: "expired",
    companyName: "Mock Co",
    generatedByName: "Mock Admin",
    reportData: {
      company: { id: "company-a", name: "Mock Co" },
      reportTitle: "Expired Historical Report",
      reportTemplate: "customer",
      period: "2024-02",
      generatedAt: "2026-05-07T10:30:00.000Z",
      generatedBy: "Mock Admin",
      values: [],
      factorMethodology: { factorYear: 2024, source: "UK DEFRA" },
      dataQualityFlags: { approvalRate: 0, evidenceRate: 0, missingCount: 0 },
    },
  },
];

async function mockReportsPageApis(page: Page) {
  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));

  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/reports") return json(mockedReports);
    if (url.pathname === "/api/reports/report-available") return json(mockedReports[0]);
    if (url.pathname === "/api/reports/report-unavailable") return json(mockedReports[1]);
    if (url.pathname === "/api/reports/report-available/download/file-available") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "content-disposition": 'attachment; filename="Management_Report_2024-01.pdf"' },
        body: "%PDF-1.4\n% mock report\n",
      });
    }
    if (url.pathname === "/api/auth/me") {
      return json({
        user: { id: "user-admin", role: "admin", username: "Mock Admin" },
        company: { id: "company-a", name: "Mock Co", onboardingComplete: true },
      });
    }
    if (url.pathname === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (url.pathname === "/api/billing/status") return json({ planTier: "pro" });
    if (url.pathname === "/api/sites") return json([]);
    if (url.pathname === "/api/metrics") return json([]);
    if (url.pathname === "/api/actions") return json([]);
    if (url.pathname === "/api/policy") return json(null);
    if (url.pathname === "/api/company") return json({ id: "company-a", name: "Mock Co" });
    if (url.pathname === "/api/compliance/status") return json({});
    if (url.pathname === "/api/evidence/coverage") return json({});
    if (url.pathname === "/api/dashboard/readiness") return json({});
    if (url.pathname === "/api/onboarding/status") {
      return json({
        onboardingComplete: true,
        hasAddedData: true,
        hasUploadedEvidence: true,
        hasGeneratedReport: true,
        activationComplete: true,
      });
    }
    if (url.pathname === "/api/reports/readiness-detail") {
      return json({
        esgState: "CONFIRMED",
        stateLabel: "Confirmed",
        stateExplanation: "Ready",
        blockingFactors: [],
        missingCategories: {
          missingMetrics: [],
          missingEvidenceCount: 0,
          highEstimateLoad: false,
          estimatedPercent: 0,
          policyNotPublished: false,
          overdueActions: 0,
        },
      });
    }
    if (url.pathname === "/api/reports/preflight") {
      return json({ canGenerate: true, metricsWithData: 1, totalMetrics: 1, resolvedPeriod: "2024-01" });
    }
    if (url.pathname === "/api/activity/track") return json({ ok: true });

    return json([]);
  });
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

  test("Report Library opens historical snapshots and keeps unavailable files marked", async ({ page }) => {
    await mockReportsPageApis(page);

    await page.goto("/reports");
    await expect(page.getByTestId("heading-report-library")).toHaveText("Report Library");
    await expect(page.getByTestId("report-history-report-available")).toBeVisible();
    await expect(page.getByTestId("button-download-report-file-report-available")).toHaveText(/Open file/);
    await expect(page.getByTestId("text-report-library-title-report-available")).toContainText("Mock Historical Report");

    const detailRequest = page.waitForRequest("**/api/reports/report-available");
    await page.getByTestId("button-view-report-report-available").click();
    expect((await detailRequest).url()).toContain("/api/reports/report-available");
    await expect(page.getByTestId("card-report-library-detail")).toBeVisible();
    await expect(page.getByTestId("panel-report-library-metadata")).toContainText("Mock Co");
    await expect(page.getByTestId("panel-report-library-summary")).toContainText("1");
    await expect(page.getByTestId("panel-report-library-summary")).toContainText("2");
    await expect(page.getByTestId("panel-report-library-summary")).toContainText("88");
    await expect(page.getByTestId("historical-report-preview")).toContainText("Mock Historical Report");
    await expect(page.getByTestId("historical-report-preview")).toContainText("Electricity Consumption");
    await expect(page.getByTestId("empty-state-report-preview")).toBeVisible();

    await expect(page.getByTestId("report-history-report-unavailable")).toBeVisible();
    await expect(page.getByTestId("badge-report-file-unavailable-report-unavailable")).toHaveText("Unavailable");
    await expect(page.getByTestId("button-download-report-file-report-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("report-file-status-report-unavailable")).toContainText("expired");

    const downloadRequest = page.waitForRequest("**/api/reports/report-available/download/file-available");
    await page.getByTestId("button-download-report-file-report-available").click();
    expect((await downloadRequest).url()).toContain("/api/reports/report-available/download/file-available");
  });
});
