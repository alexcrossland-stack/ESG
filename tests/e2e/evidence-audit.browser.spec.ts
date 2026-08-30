import { test, expect } from "@playwright/test";
import { ADMIN_STATE_FILE, VIEWER_STATE_FILE } from "./global-setup.js";
import fs from "fs";
import { apiMultipartRequest, apiRequest } from "../fixtures/seed.js";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: {
      adminToken: string;
      contributorToken: string;
      companyId: string;
    };
  };
}

test.describe("Evidence audit workflow", () => {
  test("Measure evidence focus attaches in-row, shows assurance states, and keeps the audit view available", async ({ browser }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    expect(metricsRes.status).toBe(200);
    const metrics = JSON.parse(metricsRes.body) as Array<{
      id: string;
      name: string;
      enabled?: boolean;
      metricType?: string;
    }>;
    const editableMetrics = metrics.filter((metric) => metric.enabled === true && metric.metricType === "manual");
    expect(editableMetrics.length, "two enabled manual metrics are required for evidence entry fixtures").toBeGreaterThan(1);

    const auditMetricA = editableMetrics[0]!;
    const auditMetricB = editableMetrics[1]!;
    const auditPeriodA = "2026-02";
    const auditPeriodB = "2026-03";
    const auditFileA = `audit-metric-a-${Date.now()}.txt`;
    const auditFileB = `audit-metric-b-${Date.now()}.txt`;
    const centralFile = `audit-central-${Date.now()}.txt`;

    const seedMetricEvidence = async (metricId: string, period: string, filename: string) => {
      const form = new FormData();
      form.append("metricId", metricId);
      form.append("period", period);
      form.append("value", "42");
      form.append("notes", `Seeded ${filename}`);
      form.append("attachments", new Blob([filename], { type: "text/plain" }), filename);
      const res = await apiMultipartRequest("POST", "/api/data-entry", form, tenantA.adminToken);
      expect([200, 201]).toContain(res.status);
    };

    await seedMetricEvidence(auditMetricA.id, auditPeriodA, auditFileA);
    await seedMetricEvidence(auditMetricB.id, auditPeriodB, auditFileB);

    const centralForm = new FormData();
    centralForm.append("metricId", auditMetricA.id);
    centralForm.append("period", auditPeriodA);
    centralForm.append("notes", "Central evidence upload for audit view");
    centralForm.append("file", new Blob([centralFile], { type: "text/plain" }), centralFile);
    const centralRes = await apiMultipartRequest("POST", "/api/evidence", centralForm, tenantA.adminToken);
    expect(centralRes.status).toBe(200);

    const companyRes = await apiRequest("GET", "/api/auth/me", undefined, tenantA.adminToken);
    expect(companyRes.status).toBe(200);
    const companyName = (JSON.parse(companyRes.body) as { company?: { name?: string } }).company?.name;
    expect(companyName).toBeTruthy();

    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/data-entry?focus=evidence");
    await page.waitForLoadState("domcontentloaded");

    if (page.url().includes("/auth") || page.url().includes("/onboarding")) {
      test.skip(true, "Admin auth state not fully persisted for browser flow");
      await context.close();
      return;
    }

    await expect(page.getByTestId("panel-measure-evidence-focus")).toBeVisible();
    await expect(page.getByTestId("panel-manual-metric-entry")).toBeVisible();
    await expect(page).toHaveURL(/\/data-entry\?focus=evidence$/);
    const editableRow = page.locator('[data-testid^="manual-row-"]')
      .filter({ has: page.locator('[data-testid^="button-save-manual-"]') })
      .filter({ has: page.locator('[data-testid^="input-manual-"]:not(:disabled)') })
      .first();
    await expect(editableRow).toBeVisible({ timeout: 10000 });

    const metricName = (await editableRow.locator("label.text-sm.font-medium").first().innerText()).trim();
    const inRowFilename = `browser-row-${Date.now()}.txt`;

    await editableRow.locator('[data-testid^="input-manual-"]').first().fill("77");
    await expect(editableRow.getByTestId(/^badge-inline-evidence-/)).toHaveText("Evidence needed");
    await expect(editableRow).toHaveAttribute("data-evidence-focus", "true");
    await editableRow.locator('[data-testid^="button-attach-evidence-"]').click();
    await editableRow.locator('[data-testid^="input-evidence-files-"]').setInputFiles({
      name: inRowFilename,
      mimeType: "text/plain",
      buffer: Buffer.from("browser metric row evidence"),
    });

    await expect(editableRow.getByText("Ready to upload")).toBeVisible();
    await expect(editableRow.getByText(inRowFilename)).toBeVisible();

    const saveResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith("/api/data-entry")
      && response.request().method() === "POST"
      && response.status() >= 200
      && response.status() < 300
    ));
    await editableRow.locator('[data-testid^="button-save-manual-"]').click();
    const saveResponse = await saveResponsePromise;
    const saveBody = await saveResponse.json() as { newlyCreatedAttachments?: Array<{ id?: string }> };
    const inRowEvidenceId = saveBody.newlyCreatedAttachments?.[0]?.id;
    expect(inRowEvidenceId, "inline evidence id").toBeTruthy();
    await expect(editableRow.getByText("Attached to this metric")).toBeVisible({ timeout: 10000 });
    await expect(editableRow.getByText(inRowFilename)).toBeVisible({ timeout: 10000 });
    await expect(editableRow.getByTestId(/^badge-inline-evidence-/)).toHaveText("Source linked");

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("panel-manual-metric-entry")).toBeVisible();
    const refreshedRow = page.locator('[data-testid^="manual-row-"]').filter({
      hasText: metricName,
    }).first();
    await expect(refreshedRow.getByText(inRowFilename)).toBeVisible({ timeout: 10000 });
    await expect(refreshedRow.getByTestId(/^badge-inline-evidence-/)).toHaveText("Source linked");

    const reviewRes = await apiRequest("PUT", `/api/evidence/${inRowEvidenceId}`, { evidenceStatus: "reviewed" }, tenantA.adminToken);
    expect(reviewRes.status).toBe(200);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const reviewedRow = page.locator('[data-testid^="manual-row-"]').filter({ hasText: metricName }).first();
    await expect(reviewedRow.getByTestId(/^badge-inline-evidence-/)).toHaveText("Reviewed", { timeout: 10000 });

    const approveRes = await apiRequest("PUT", `/api/evidence/${inRowEvidenceId}`, { evidenceStatus: "approved" }, tenantA.adminToken);
    expect(approveRes.status).toBe(200);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const backedRow = page.locator('[data-testid^="manual-row-"]').filter({ hasText: metricName }).first();
    await expect(backedRow.getByTestId(/^badge-inline-evidence-/)).toHaveText("Evidence-backed", { timeout: 10000 });

    await page.goto("/evidence");
    await page.waitForLoadState("domcontentloaded");
    const evidenceFilename = (filename: string) => page
      .getByTestId(/^text-evidence-filename-/)
      .filter({ hasText: filename });
    const evidenceCard = (filename: string) => page
      .locator('[data-testid^="card-evidence-"]')
      .filter({ has: evidenceFilename(filename) });

    await expect(page.getByTestId("tab-evidence-files")).toContainText("Audit View");
    await expect(evidenceFilename(auditFileA)).toBeVisible({ timeout: 10000 });
    await expect(evidenceCard(auditFileA).getByText(auditMetricA.name)).toBeVisible();
    await expect(evidenceCard(auditFileA).getByText(auditPeriodA)).toBeVisible();
    await expect(evidenceCard(auditFileA).getByText(companyName!)).toBeVisible();

    await page.getByTestId("trigger-evidence-period-filter").click();
    await page.getByRole("option", { name: auditPeriodA }).click();
    await expect(evidenceFilename(auditFileA)).toBeVisible();
    await expect(evidenceFilename(auditFileB)).toHaveCount(0);

    await page.getByTestId("trigger-evidence-metric-filter").click();
    await page.getByRole("option", { name: auditMetricA.name }).click();
    await expect(evidenceFilename(auditFileA)).toBeVisible();

    await page.getByTestId("trigger-evidence-company-filter").click();
    await page.getByRole("option", { name: companyName! }).click();
    await expect(evidenceFilename(auditFileA)).toBeVisible();
    await expect(evidenceFilename(centralFile)).toBeVisible();

    await page.getByTestId("trigger-evidence-link-status-filter").click();
    await page.getByRole("option", { name: "Orphaned only" }).click();
    await expect(evidenceFilename(auditFileA)).toHaveCount(0);
    await expect(evidenceFilename(centralFile)).toHaveCount(0);

    await context.close();
  });

  test("Measure evidence focus remains read-only for viewers", async ({ browser }) => {
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/data-entry?focus=evidence");
    await page.waitForLoadState("domcontentloaded");

    if (page.url().includes("/auth") || page.url().includes("/onboarding")) {
      test.skip(true, "Viewer auth state not fully persisted for browser flow");
      await context.close();
      return;
    }

    await expect(page.getByTestId("panel-measure-evidence-focus")).toContainText("read-only");
    await expect(page.getByTestId("panel-manual-metric-entry")).toBeVisible();
    await expect(page.getByTestId("banner-data-entry-permission")).toBeVisible();
    await expect(page.locator('[data-testid^="button-attach-evidence-"]').first()).toBeDisabled();
    await expect(page.getByTestId("button-lock-period-header")).toHaveCount(0);
    await expect(page).toHaveURL(/\/data-entry\?focus=evidence$/);

    await page.goto("/evidence");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid^="button-review-evidence-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-approve-evidence-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-delete-evidence-"]')).toHaveCount(0);

    await context.close();
  });

  test("contributors can upload evidence without seeing review, approval, or deletion controls", async ({ browser }) => {
    const { tenantA } = readSeedInfo();
    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    expect(metricsRes.status).toBe(200);
    const metric = (JSON.parse(metricsRes.body) as Array<{ id: string; enabled?: boolean }>)
      .find((candidate) => candidate.enabled !== false);
    expect(metric?.id).toBeTruthy();

    const filename = `contributor-permissions-${Date.now()}.txt`;
    const form = new FormData();
    form.append("metricId", metric!.id);
    form.append("period", "2026-06");
    form.append("notes", "Contributor evidence-control visibility fixture");
    form.append("file", new Blob([filename], { type: "text/plain" }), filename);
    const upload = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    expect(upload.status).toBe(200);

    const origin = process.env.BASE_URL || "http://localhost:5000";
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [{
          origin,
          localStorage: [{ name: "auth_token", value: tenantA.contributorToken }],
        }],
      },
    });
    const page = await context.newPage();
    await page.goto("/evidence");
    await page.waitForLoadState("domcontentloaded");

    if (page.url().includes("/auth") || page.url().includes("/onboarding")) {
      test.skip(true, "Contributor auth state not available for evidence controls");
      await context.close();
      return;
    }

    await expect(page.getByTestId(/^text-evidence-filename-/).filter({ hasText: filename })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("button-upload-evidence")).toBeVisible();
    await expect(page.locator('[data-testid^="button-review-evidence-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-approve-evidence-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-delete-evidence-"]')).toHaveCount(0);

    await context.close();
  });
});
