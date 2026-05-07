import { test, expect } from "@playwright/test";
import { ADMIN_STATE_FILE } from "./global-setup.js";
import fs from "fs";
import { apiMultipartRequest, apiRequest } from "../fixtures/seed.js";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: {
      adminToken: string;
      companyId: string;
    };
  };
}

test.describe("Evidence audit workflow", () => {
  test("data entry attaches evidence in-row and evidence page filters audit records", async ({ browser }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    expect(metricsRes.status).toBe(200);
    const metrics = JSON.parse(metricsRes.body) as Array<{ id: string; name: string }>;
    expect(metrics.length).toBeGreaterThan(1);

    const auditMetricA = metrics[0];
    const auditMetricB = metrics[1];
    const auditPeriodA = `2026-02-${String((Date.now() % 20) + 1).padStart(2, "0")}`;
    const auditPeriodB = `2026-03-${String((Date.now() % 20) + 1).padStart(2, "0")}`;
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

    await page.goto("/data-entry");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/auth") || page.url().includes("/onboarding")) {
      test.skip(true, "Admin auth state not fully persisted for browser flow");
      await context.close();
      return;
    }

    await page.getByTestId("tab-manual-entry").click();
    const editableRow = page.locator('[data-testid^="manual-row-"]')
      .filter({ has: page.locator('[data-testid^="button-save-manual-"]') })
      .filter({ has: page.locator('[data-testid^="input-manual-"]:not(:disabled)') })
      .first();
    await expect(editableRow).toBeVisible({ timeout: 10000 });

    const metricName = (await editableRow.locator("label.text-sm.font-medium").first().innerText()).trim();
    const inRowFilename = `browser-row-${Date.now()}.txt`;

    await editableRow.locator('[data-testid^="input-manual-"]').first().fill("77");
    await editableRow.locator('[data-testid^="button-attach-evidence-"]').click();
    await editableRow.locator('[data-testid^="input-evidence-files-"]').setInputFiles({
      name: inRowFilename,
      mimeType: "text/plain",
      buffer: Buffer.from("browser metric row evidence"),
    });

    await expect(editableRow.getByText("Ready to upload")).toBeVisible();
    await expect(editableRow.getByText(inRowFilename)).toBeVisible();

    await editableRow.locator('[data-testid^="button-save-manual-"]').click();
    await expect(editableRow.getByText("Attached to this metric")).toBeVisible({ timeout: 10000 });
    await expect(editableRow.getByText(inRowFilename)).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByTestId("tab-manual-entry").click();
    const refreshedRow = page.locator('[data-testid^="manual-row-"]').filter({
      hasText: metricName,
    }).first();
    await expect(refreshedRow.getByText(inRowFilename)).toBeVisible({ timeout: 10000 });

    await page.goto("/evidence");
    await page.waitForLoadState("networkidle");
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
});
