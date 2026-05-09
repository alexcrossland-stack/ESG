/**
 * Browser-connected regression: login -> scoped data entry -> evidence -> dashboard/profile/report.
 *
 * This intentionally uses API setup for deterministic tenant data, then verifies the
 * connected UI paths that read and persist those records.
 *
 * Run: npx playwright test tests/e2e/connected-core-flow.browser.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";
import { apiMultipartRequest, apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };

const TEST_PASSWORD = "Test1234!";

function parseJson<T>(res: ApiResponse, context: string): T {
  expect(res.status, `${context} body=${res.body.slice(0, 500)}`).toBeGreaterThanOrEqual(200);
  expect(res.status, `${context} body=${res.body.slice(0, 500)}`).toBeLessThan(300);
  return JSON.parse(res.body) as T;
}

function currentUiPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(period: string): { startDate: string; endDate: string } {
  const [year, month] = period.split("-").map(Number);
  const end = new Date(year, month, 0).getDate();
  return {
    startDate: `${period}-01`,
    endDate: `${period}-${String(end).padStart(2, "0")}`,
  };
}

async function createReportingPeriod(token: string, period: string): Promise<string> {
  const { startDate, endDate } = periodBounds(period);
  const res = await apiRequest("POST", "/api/reporting-periods", {
    name: period,
    periodType: "monthly",
    startDate,
    endDate,
  }, token);
  return parseJson<{ id: string }>(res, "POST /api/reporting-periods").id;
}

async function createSite(token: string, name: string, country: string): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office", country }, token);
  return parseJson<{ id: string }>(res, "POST /api/sites").id;
}

async function createMetric(token: string, name: string): Promise<string> {
  const res = await apiRequest("POST", "/api/metrics", {
    name,
    category: "environmental",
    unit: "kWh",
    enabled: true,
    metricType: "manual",
    direction: "higher_is_better",
    displayOrder: 9900,
  }, token);
  return parseJson<{ id: string }>(res, "POST /api/metrics").id;
}

async function attachMetricEvidence(opts: {
  token: string;
  metricId: string;
  period: string;
  value: number;
  siteId: string | null;
  filename: string;
}): Promise<string> {
  const form = new FormData();
  form.append("metricId", opts.metricId);
  form.append("period", opts.period);
  form.append("value", String(opts.value));
  form.append("notes", `browser-connected seeded evidence ${opts.filename}`);
  form.append("dataSourceType", "manual");
  form.append("siteId", opts.siteId ?? "__org__");
  form.append("attachments", new Blob([`evidence for ${opts.filename}`], { type: "text/plain" }), opts.filename);
  const res = await apiMultipartRequest("POST", "/api/data-entry", form, opts.token);
  const body = parseJson<{ newlyCreatedAttachments?: Array<{ id?: string }> }>(res, "POST /api/data-entry multipart");
  const evidenceId = body.newlyCreatedAttachments?.[0]?.id;
  expect(evidenceId, "created evidence id").toBeTruthy();
  return evidenceId!;
}

async function getDataEntryValues(token: string, period: string, siteId: string | null | undefined) {
  const qs = siteId === undefined ? "" : `?siteId=${encodeURIComponent(siteId ?? "null")}`;
  const res = await apiRequest("GET", `/api/data-entry/${encodeURIComponent(period)}${qs}`, undefined, token);
  return parseJson<{
    values?: Array<{ metricId: string; value: string | null; siteId?: string | null; attachments?: Array<{ id?: string }> }>;
  }>(res, "GET /api/data-entry/:period").values || [];
}

async function getReportExportValues(token: string, period: string, siteId: string | null | "__all__") {
  const qs = new URLSearchParams({ period, siteId: siteId === null ? "null" : siteId });
  const res = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?${qs.toString()}`, undefined, token);
  return parseJson<{ values?: Array<{ metricId: string; value: string | null; siteId?: string | null }> }>(
    res,
    "GET /api/reports/export-data/esg_metrics_summary",
  ).values || [];
}

async function getDashboardMetric(token: string, reportingPeriodId: string, metricId: string) {
  const qs = new URLSearchParams({ reportingPeriodId });
  const res = await apiRequest("GET", `/api/dashboard/enhanced?${qs.toString()}`, undefined, token);
  const body = parseJson<{ latestPeriod?: string; metricSummaries?: Array<{ id: string; latestValue?: number | null }> }>(
    res,
    "GET /api/dashboard/enhanced",
  );
  return body.metricSummaries?.find((metric) => metric.id === metricId) ?? null;
}

async function chooseOption(page: Page, triggerTestId: string, option: string | RegExp) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole("option", { name: option }).click();
}

async function loginViaUi(page: Page, email: string) {
  await page.goto("/auth");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(TEST_PASSWORD);
  await page.getByTestId("button-login").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15000 });
  await expect(page.getByTestId("text-dashboard-title")).toBeVisible({ timeout: 15000 });
}

function evidenceFilename(page: Page, filename: string) {
  return page.getByTestId(/^text-evidence-filename-/).filter({ hasText: filename });
}

test.describe("Browser-connected core ESG flow", () => {
  test("keeps metric values, evidence, profile, dashboard, and reports scoped across UI and API", async ({ page }) => {
    const { tenantA } = await seedTestTenants();
    const suffix = Date.now().toString();
    const period = currentUiPeriod();
    const reportingPeriodId = await createReportingPeriod(tenantA.adminToken, period);
    const siteAName = `Browser Site A ${suffix}`;
    const siteBName = `Browser Site B ${suffix}`;
    const metricName = `Browser Connected Energy ${suffix}`;
    const siteAValue = 202.5;
    const siteBValue = 303.25;
    const orgValue = 101.75;
    const expectedAggregate = siteAValue + siteBValue + orgValue;

    const siteAId = await createSite(tenantA.adminToken, siteAName, "United Kingdom");
    const siteBId = await createSite(tenantA.adminToken, siteBName, "Ireland");
    const metricId = await createMetric(tenantA.adminToken, metricName);
    const orgEvidenceFilename = `browser-org-${suffix}.txt`;
    const siteBEvidenceFilename = `browser-site-b-${suffix}.txt`;
    const siteAEvidenceFilename = `browser-site-a-ui-${suffix}.txt`;

    const orgEvidenceId = await attachMetricEvidence({
      token: tenantA.adminToken,
      metricId,
      period,
      value: orgValue,
      siteId: null,
      filename: orgEvidenceFilename,
    });
    const siteBEvidenceId = await attachMetricEvidence({
      token: tenantA.adminToken,
      metricId,
      period,
      value: siteBValue,
      siteId: siteBId,
      filename: siteBEvidenceFilename,
    });

    await loginViaUi(page, tenantA.adminEmail);

    await page.goto("/data-entry");
    await expect(page.getByTestId("data-entry-site-scope-panel")).toBeVisible({ timeout: 15000 });
    await chooseOption(page, "select-data-entry-site-scope", siteAName);
    await page.getByTestId("tab-manual-entry").click();

    const metricRow = page.getByTestId(`manual-row-${metricId}`);
    await expect(metricRow).toBeVisible({ timeout: 15000 });
    await expect(metricRow.getByText(metricName)).toBeVisible();

    await page.getByTestId(`input-manual-${metricId}`).fill(String(siteAValue));
    await page.getByTestId(`input-evidence-files-${metricId}`).setInputFiles({
      name: siteAEvidenceFilename,
      mimeType: "text/plain",
      buffer: Buffer.from("browser UI evidence for Site A"),
    });
    await expect(page.getByTestId(`pending-evidence-${metricId}-0`)).toContainText(siteAEvidenceFilename);

    const saveResponse = page.waitForResponse((res) =>
      res.url().endsWith("/api/data-entry")
      && res.request().method() === "POST"
      && res.status() >= 200
      && res.status() < 300,
    );
    await page.getByTestId(`button-save-manual-${metricId}`).click();
    const saveBody = await (await saveResponse).json() as { newlyCreatedAttachments?: Array<{ id?: string }> };
    const siteAEvidenceId = saveBody.newlyCreatedAttachments?.[0]?.id;
    expect(siteAEvidenceId, "Site A UI evidence id").toBeTruthy();
    await expect(page.getByText(siteAEvidenceFilename)).toBeVisible({ timeout: 15000 });

    await chooseOption(page, "select-data-entry-site-scope", siteBName);
    await expect(page.getByTestId(`input-manual-${metricId}`)).toHaveValue(String(siteBValue), { timeout: 15000 });
    await expect(page.getByText(siteAEvidenceFilename)).toHaveCount(0);
    await expect(page.getByText(siteBEvidenceFilename)).toBeVisible({ timeout: 15000 });

    await chooseOption(page, "select-data-entry-site-scope", "Organisation-wide");
    await expect(page.getByTestId(`input-manual-${metricId}`)).toHaveValue(String(orgValue), { timeout: 15000 });
    await expect(page.getByText(siteAEvidenceFilename)).toHaveCount(0);
    await expect(page.getByText(siteBEvidenceFilename)).toHaveCount(0);
    await expect(page.getByText(orgEvidenceFilename)).toBeVisible({ timeout: 15000 });

    await chooseOption(page, "select-data-entry-site-scope", siteAName);
    await expect(page.getByTestId(`input-manual-${metricId}`)).toHaveValue(String(siteAValue), { timeout: 15000 });
    await expect(page.getByText(siteAEvidenceFilename)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(siteBEvidenceFilename)).toHaveCount(0);
    await expect(page.getByText(orgEvidenceFilename)).toHaveCount(0);

    const siteARows = (await getDataEntryValues(tenantA.adminToken, period, siteAId)).filter((row) => row.metricId === metricId);
    const siteBRows = (await getDataEntryValues(tenantA.adminToken, period, siteBId)).filter((row) => row.metricId === metricId);
    const orgRows = (await getDataEntryValues(tenantA.adminToken, period, null)).filter((row) => row.metricId === metricId);
    expect(siteARows).toHaveLength(1);
    expect(Number(siteARows[0].value)).toBe(siteAValue);
    expect(siteARows[0].siteId).toBe(siteAId);
    expect(siteARows[0].attachments?.some((file) => file.id === siteAEvidenceId)).toBe(true);
    expect(siteBRows).toHaveLength(1);
    expect(Number(siteBRows[0].value)).toBe(siteBValue);
    expect(siteBRows[0].siteId).toBe(siteBId);
    expect(siteBRows[0].attachments?.some((file) => file.id === siteBEvidenceId)).toBe(true);
    expect(orgRows).toHaveLength(1);
    expect(Number(orgRows[0].value)).toBe(orgValue);
    expect(orgRows[0].siteId ?? null).toBeNull();
    expect(orgRows[0].attachments?.some((file) => file.id === orgEvidenceId)).toBe(true);

    await page.goto("/evidence");
    await expect(page.getByTestId("text-evidence-title")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("tab-evidence-files")).toBeVisible();
    await expect(page.getByTestId("trigger-evidence-site-filter")).toBeVisible({ timeout: 15000 });
    await expect(evidenceFilename(page, siteAEvidenceFilename)).toBeVisible({ timeout: 15000 });
    await expect(evidenceFilename(page, siteBEvidenceFilename)).toHaveCount(0);
    await expect(evidenceFilename(page, orgEvidenceFilename)).toHaveCount(0);

    await chooseOption(page, "trigger-evidence-site-filter", siteBName);
    await expect(evidenceFilename(page, siteBEvidenceFilename)).toBeVisible({ timeout: 15000 });
    await expect(evidenceFilename(page, siteAEvidenceFilename)).toHaveCount(0);
    await expect(evidenceFilename(page, orgEvidenceFilename)).toHaveCount(0);

    await chooseOption(page, "trigger-evidence-site-filter", "Organisation-wide");
    await expect(evidenceFilename(page, orgEvidenceFilename)).toBeVisible({ timeout: 15000 });
    await expect(evidenceFilename(page, siteAEvidenceFilename)).toHaveCount(0);
    await expect(evidenceFilename(page, siteBEvidenceFilename)).toHaveCount(0);

    await chooseOption(page, "trigger-evidence-site-filter", "All scopes");
    await expect(evidenceFilename(page, siteAEvidenceFilename)).toBeVisible({ timeout: 15000 });
    await expect(evidenceFilename(page, siteBEvidenceFilename)).toBeVisible();
    await expect(evidenceFilename(page, orgEvidenceFilename)).toBeVisible();

    const allScopeEvidence = await apiRequest("GET", `/api/evidence?period=${encodeURIComponent(period)}`, undefined, tenantA.adminToken);
    const allScopeEvidenceBody = parseJson<Array<{ id: string }>>(allScopeEvidence, "GET /api/evidence all scopes");
    const allScopeEvidenceIds = new Set(allScopeEvidenceBody.map((file) => file.id));
    expect(allScopeEvidenceIds.has(siteAEvidenceId!)).toBe(true);
    expect(allScopeEvidenceIds.has(siteBEvidenceId)).toBe(true);
    expect(allScopeEvidenceIds.has(orgEvidenceId)).toBe(true);

    await page.goto("/");
    await expect(page.getByTestId("text-dashboard-title")).toBeVisible({ timeout: 15000 });
    await chooseOption(page, "select-dashboard-period", period);
    await expect(page.getByTestId("badge-latest-period")).toContainText(period, { timeout: 15000 });
    await expect(page.getByTestId("stat-submission-rate")).toBeVisible();
    await expect(page.getByTestId("stat-evidence-coverage")).toBeVisible();
    const dashboardMetric = await getDashboardMetric(tenantA.adminToken, reportingPeriodId, metricId);
    expect(dashboardMetric, "seeded metric should appear in dashboard enhanced summaries").toBeTruthy();
    expect(dashboardMetric?.latestValue).toBe(expectedAggregate);

    await page.goto("/esg-profile");
    await expect(page.getByTestId("text-profile-title")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("text-profile-reporting-period")).toContainText(period, { timeout: 15000 });
    await expect(page.getByText(`Values shown for ${period}`)).toBeVisible();
    const profileMetricCard = page.locator('[data-testid^="metric-card-"]').filter({ hasText: metricName }).first();
    await expect(profileMetricCard).toBeVisible({ timeout: 15000 });
    await expect(profileMetricCard).toContainText("202.50");
    await expect(profileMetricCard).not.toContainText("303.25");
    await expect(profileMetricCard).not.toContainText("101.75");

    await page.goto("/reports");
    await chooseOption(page, "select-report-scope", siteAName);
    await expect(page.getByTestId("text-readiness-scope")).toContainText(`Site: ${siteAName}`, { timeout: 15000 });
    await expect(page.getByTestId("text-completeness-percent")).toBeVisible();
    await page.getByTestId("button-generate-report").click();
    await expect(page.getByTestId("report-preview")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("section-metrics")).toContainText(metricName);
    await expect(page.getByTestId("section-metrics")).toContainText(/202\.5/);
    await expect(page.getByTestId("section-metrics")).not.toContainText(/303\.25/);
    await expect(page.getByTestId("section-metrics")).not.toContainText(/101\.75/);

    await chooseOption(page, "select-report-scope", /All scopes/);
    await expect(page.getByTestId("text-readiness-scope")).toContainText("All scopes", { timeout: 15000 });

    const exportSiteA = (await getReportExportValues(tenantA.adminToken, period, siteAId)).filter((row) => row.metricId === metricId);
    const exportSiteB = (await getReportExportValues(tenantA.adminToken, period, siteBId)).filter((row) => row.metricId === metricId);
    const exportOrg = (await getReportExportValues(tenantA.adminToken, period, null)).filter((row) => row.metricId === metricId);
    const exportAll = (await getReportExportValues(tenantA.adminToken, period, "__all__")).filter((row) => row.metricId === metricId);
    expect(exportSiteA.map((row) => Number(row.value))).toEqual([siteAValue]);
    expect(exportSiteA[0].siteId).toBe(siteAId);
    expect(exportSiteB.map((row) => Number(row.value))).toEqual([siteBValue]);
    expect(exportSiteB[0].siteId).toBe(siteBId);
    expect(exportOrg.map((row) => Number(row.value))).toEqual([orgValue]);
    expect(exportOrg[0].siteId ?? null).toBeNull();
    expect(exportAll.map((row) => Number(row.value)).sort((a, b) => a - b)).toEqual([orgValue, siteAValue, siteBValue]);
  });
});
