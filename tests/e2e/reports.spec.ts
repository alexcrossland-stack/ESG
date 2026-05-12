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

type MockRole = "admin" | "contributor" | "viewer";

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
      trendSummary: {
        currentPeriod: "2024-01",
        previousPeriod: "2023-12",
        currentPeriodLabel: "January 2024",
        previousPeriodLabel: "December 2023",
        comparisonLabel: "Compared with previous month",
        improvements: [{ metricId: "value-1" }],
        worsening: [],
        metrics: [{
          metricId: "value-1",
          metricName: "Electricity Consumption",
          unit: "kWh",
          currentValue: 123.45,
          previousValue: 150,
          absoluteDelta: -26.55,
          percentageDelta: -17.7,
          direction: "improved",
          changeLabel: "Improved",
          reason: "ok",
        }],
        unavailable: [{
          metricId: "value-2",
          metricName: "Water Consumption",
          reason: "missing_previous",
        }],
        notes: ["Water Consumption: No prior-period data available"],
      },
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
      trendSummary: {
        currentPeriod: "2024-02",
        previousPeriod: "2024-01",
        currentPeriodLabel: "February 2024",
        previousPeriodLabel: "January 2024",
        comparisonLabel: "Compared with previous month",
        improvements: [],
        worsening: [],
        metrics: [],
        unavailable: [{
          metricId: "value-1",
          metricName: "Electricity Consumption",
          reason: "missing_current",
        }],
        notes: ["Electricity Consumption: Trend unavailable"],
      },
    },
  },
];

function cloneMockReports() {
  return JSON.parse(JSON.stringify(mockedReports)) as typeof mockedReports;
}

function getMockedLibraryResponse(url: URL, reports: typeof mockedReports) {
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const template = url.searchParams.get("reportTemplate") || "all";
  const status = url.searchParams.get("status") || "all";
  const generatedBy = (url.searchParams.get("generatedBy") || "").toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), 100);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
  const filtered = reports.filter((report) => {
    if (template !== "all" && report.reportTemplate !== template) return false;
    if (status === "available" || status === "unavailable") {
      if (report.fileAvailability !== status) return false;
    } else if (status !== "all" && report.workflowStatus !== status) {
      return false;
    }
    if (generatedBy && !report.generatedByName.toLowerCase().includes(generatedBy)) return false;
    if (!search) return true;
    return [
      report.reportData.reportTitle,
      report.reportTemplate,
      report.period,
      report.companyName,
      report.generatedByName,
      report.latestFilename,
    ].join(" ").toLowerCase().includes(search);
  });
  return {
    reports: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
    hasMore: offset + limit < filtered.length,
  };
}

async function mockReportsPageApis(page: Page, options?: {
  role?: MockRole;
  failAvailableDownloadOnce?: boolean;
  onGenerateFile?: (reportId: string, format: string) => void;
}) {
  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
  let reports = cloneMockReports();
  let failedAvailableDownload = false;

  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/reports/library") return json(getMockedLibraryResponse(url, reports));
    if (url.pathname === "/api/reports") return json(reports);
    if (url.pathname === "/api/reports/generate") {
      return json({
        report: { id: "report-generated" },
        data: {
          company: { id: "company-a", name: "Mock Co" },
          reportTitle: "New Generated Report",
          reportTemplate: "management",
          period: "2026-05",
          generatedAt: "2026-05-11T09:00:00.000Z",
          generatedBy: "Mock Admin",
          values: [{
            id: "generated-value-1",
            metricName: "Generated Electricity",
            category: "environmental",
            value: "456.78",
            unit: "kWh",
          }],
          metricsByCategory: {
            environmental: [{
              id: "generated-value-1",
              metricName: "Generated Electricity",
              category: "environmental",
              value: "456.78",
              unit: "kWh",
            }],
          },
          factorMethodology: { factorYear: 2024, source: "UK DEFRA" },
          dataQualityFlags: { approvalRate: 0, evidenceRate: 0, missingCount: 0 },
          trendSummary: {
            currentPeriod: "2026-05",
            previousPeriod: "2026-04",
            currentPeriodLabel: "May 2026",
            previousPeriodLabel: "April 2026",
            comparisonLabel: "Compared with previous month",
            improvements: [],
            worsening: [{ metricId: "generated-value-1" }],
            metrics: [{
              metricId: "generated-value-1",
              metricName: "Generated Electricity",
              unit: "kWh",
              currentValue: 456.78,
              previousValue: 400,
              absoluteDelta: 56.78,
              percentageDelta: 14.2,
              direction: "worsened",
              changeLabel: "Worsened",
              reason: "ok",
            }],
            unavailable: [],
            notes: [],
          },
        },
      });
    }
    if (url.pathname === "/api/reports/report-generated/generate-file") {
      const body = JSON.parse(route.request().postData() || "{}") as { format?: string };
      options?.onGenerateFile?.("report-generated", body.format || "");
      return json({
        fileId: "file-generated",
        filename: "New_Generated_Report.pdf",
        fileType: body.format || "pdf",
        downloadUrl: "/api/reports/report-generated/download/file-generated",
      });
    }
    if (url.pathname === "/api/reports/report-generated/download/file-generated") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "content-disposition": 'attachment; filename="New_Generated_Report.pdf"' },
        body: "%PDF-1.4\n% generated mock report\n",
      });
    }
    if (url.pathname === "/api/reports/report-unavailable/generate-file") {
      const body = JSON.parse(route.request().postData() || "{}") as { format?: string };
      const fileType = body.format || "pdf";
      options?.onGenerateFile?.("report-unavailable", fileType);
      reports = reports.map((report) => report.id === "report-unavailable"
        ? {
            ...report,
            latestFileId: "file-regenerated",
            latestFilename: `Expired_Historical_Report.${fileType}`,
            latestFileType: fileType,
            latestFileSize: 8192,
            latestDownloadUrl: "/api/reports/report-unavailable/download/file-regenerated",
            fileAvailability: "available",
            fileUnavailableReason: null,
          }
        : report);
      return json({
        fileId: "file-regenerated",
        filename: `Expired_Historical_Report.${fileType}`,
        fileType,
        downloadUrl: "/api/reports/report-unavailable/download/file-regenerated",
      });
    }
    if (url.pathname === "/api/reports/report-unavailable/download/file-regenerated") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "content-disposition": 'attachment; filename="Expired_Historical_Report.pdf"' },
        body: "%PDF-1.4\n% regenerated historical report\nTrend Summary\nMetric Trends\nTrend Notes\n",
      });
    }
    const reportDetail = reports.find((report) => url.pathname === `/api/reports/${report.id}`);
    if (reportDetail) return json(reportDetail);
    if (url.pathname === "/api/reports/report-available/download/file-available") {
      if (options?.failAvailableDownloadOnce && !failedAvailableDownload) {
        failedAvailableDownload = true;
        reports = reports.map((report) => report.id === "report-available"
          ? {
              ...report,
              latestFileId: null,
              latestFilename: null,
              latestFileType: null,
              latestFileSize: null,
              latestDownloadUrl: null,
              fileAvailability: "unavailable",
              fileUnavailableReason: "expired",
            }
          : report);
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "File not found" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "content-disposition": 'attachment; filename="Management_Report_2024-01.pdf"' },
        body: "%PDF-1.4\n% mock report\n",
      });
    }
    if (url.pathname === "/api/auth/me") {
      return json({
        user: { id: `user-${options?.role || "admin"}`, role: options?.role || "admin", username: `Mock ${options?.role || "Admin"}` },
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
    await expect(page.getByTestId("text-report-library-count")).toContainText("1-2 of 2 reports");
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
    await expect(page.getByTestId("historical-report-preview").getByTestId("section-trend-summary")).toContainText("Trend Summary");
    await expect(page.getByTestId("historical-report-preview").getByTestId("section-metric-trends")).toContainText("Electricity Consumption");
    await expect(page.getByTestId("historical-report-preview").getByTestId("section-trend-notes")).toContainText("No prior-period data available");
    await expect(page.getByTestId("historical-report-preview")).toContainText("Electricity Consumption");
    await expect(page.getByTestId("empty-state-report-preview")).toBeVisible();

    await expect(page.getByTestId("report-history-report-unavailable")).toBeVisible();
    await expect(page.getByTestId("badge-report-file-unavailable-report-unavailable")).toHaveText("Unavailable");
    await expect(page.getByTestId("button-download-report-file-report-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("report-file-status-report-unavailable")).toContainText("expired");

    const downloadRequest = page.waitForRequest("**/api/reports/report-available/download/file-available");
    await page.getByTestId("button-download-report-file-report-available").click();
    expect((await downloadRequest).url()).toContain("/api/reports/report-available/download/file-available");

    await page.getByTestId("input-report-library-search").fill("Expired");
    await expect(page.getByTestId("report-history-report-available")).toHaveCount(0);
    await expect(page.getByTestId("report-history-report-unavailable")).toBeVisible();
    await expect(page.getByTestId("text-report-library-count")).toContainText("1-1 of 1 reports");

    await page.getByTestId("button-report-library-clear-filters").click();
    await expect(page.getByTestId("report-history-report-available")).toBeVisible();
    await page.getByTestId("select-report-library-status").click();
    await page.getByRole("option", { name: "Unavailable files" }).click();
    await expect(page.getByTestId("report-history-report-available")).toHaveCount(0);
    await expect(page.getByTestId("report-history-report-unavailable")).toBeVisible();
  });

  for (const role of ["contributor", "viewer"] as const) {
    test(`Report Library remains browsable for ${role} users without generation controls`, async ({ page }) => {
      await mockReportsPageApis(page, { role });

      await page.goto("/reports");
      await expect(page.getByTestId("heading-report-library")).toHaveText("Report Library");
      await expect(page.getByTestId("report-history-report-available")).toBeVisible();
      await expect(page.getByTestId("button-generate-report")).toHaveCount(0);
      await expect(page.getByTestId("permission-banner")).toBeVisible();

      await page.getByTestId("button-view-report-report-available").click();
      await expect(page.getByTestId("card-report-library-detail")).toBeVisible();
      await expect(page.getByTestId("historical-report-preview")).toContainText("Mock Historical Report");

      const downloadRequest = page.waitForRequest("**/api/reports/report-available/download/file-available");
      await page.getByTestId("button-download-report-file-report-available").click();
      expect((await downloadRequest).url()).toContain("/api/reports/report-available/download/file-available");
    });
  }

  test("Report Library refreshes stale availability after a historical file disappears", async ({ page }) => {
    await mockReportsPageApis(page, { failAvailableDownloadOnce: true });

    await page.goto("/reports");
    await expect(page.getByTestId("button-download-report-file-report-available")).toBeVisible();

    await page.getByTestId("button-download-report-file-report-available").click();
    await expect(page.getByTestId("badge-report-file-unavailable-report-available")).toHaveText("Unavailable");
    await expect(page.getByTestId("button-download-report-file-report-available")).toHaveCount(0);
    await expect(page.getByTestId("report-file-status-report-available")).toContainText("expired");
  });

  test("Report Library detail generates a file from a saved historical snapshot without an attached file", async ({ page }) => {
    const generatedFiles: Array<{ reportId: string; format: string }> = [];
    await mockReportsPageApis(page, {
      onGenerateFile: (reportId, format) => generatedFiles.push({ reportId, format }),
    });

    await page.goto("/reports");
    await page.getByTestId("button-view-report-report-unavailable").click();
    await expect(page.getByTestId("card-report-library-detail")).toBeVisible();
    await expect(page.getByTestId("panel-library-detail-file-actions")).toContainText("No generated file attached");
    await expect(page.getByTestId("panel-library-detail-file-actions")).toContainText("historical report snapshot");
    await expect(page.getByTestId("historical-report-preview").getByTestId("section-trend-summary")).toContainText("Trend Summary");
    await expect(page.getByTestId("historical-report-preview").getByTestId("section-trend-notes")).toContainText("Trend unavailable");

    const generateRequest = page.waitForRequest("**/api/reports/report-unavailable/generate-file");
    const downloadRequest = page.waitForRequest("**/api/reports/report-unavailable/download/file-regenerated");
    await page.getByTestId("button-library-detail-generate-pdf").click();
    expect((await generateRequest).postDataJSON()).toEqual({ format: "pdf" });
    expect((await downloadRequest).url()).toContain("/api/reports/report-unavailable/download/file-regenerated");
    await expect.poll(() => generatedFiles).toEqual([{ reportId: "report-unavailable", format: "pdf" }]);
    await expect(page.getByTestId("button-library-detail-download")).toBeVisible();
  });

  test("Report file generation targets the newly generated report, not the filtered library row", async ({ page }) => {
    const generatedFiles: Array<{ reportId: string; format: string }> = [];
    await mockReportsPageApis(page, {
      onGenerateFile: (reportId, format) => generatedFiles.push({ reportId, format }),
    });

    await page.goto("/reports");
    await page.getByTestId("input-report-library-search").fill("Expired");
    await expect(page.getByTestId("report-history-report-unavailable")).toBeVisible();
    await expect(page.getByTestId("report-history-report-available")).toHaveCount(0);

    await page.getByTestId("button-generate-report").click();
    await expect(page.getByTestId("report-preview")).toContainText("New Generated Report");
    await expect(page.getByTestId("report-preview").getByTestId("section-trend-summary")).toContainText("Trend Summary");
    await expect(page.getByTestId("report-preview").getByTestId("text-report-trend-comparison")).toContainText("Compared with previous month");
    await expect(page.getByTestId("report-preview").getByTestId("section-metric-trends")).toContainText("Generated Electricity");

    await page.getByTestId("button-download-pdf").click();
    await expect.poll(() => generatedFiles).toEqual([{ reportId: "report-generated", format: "pdf" }]);
  });
});
