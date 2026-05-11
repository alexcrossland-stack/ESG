/**
 * Browser regression: tenant audit-log UI/access hardening
 *
 * Covers Settings -> Administration -> Audit Log access, server-backed
 * filtering, tenant isolation, and limit enforcement.
 */

import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "fs";
import { Client } from "pg";
import { ADMIN_STATE_FILE, SEED_INFO_FILE, VIEWER_STATE_FILE } from "./global-setup.js";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync(SEED_INFO_FILE, "utf-8")) as {
    tenantA: {
      adminToken: string;
      viewerToken: string;
      contributorToken: string;
      companyId: string;
    };
    tenantB: {
      adminToken: string;
      companyId: string;
    };
  };
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function prepareTenant(request: APIRequestContext, companyId: string, token: string, period: string, value: number) {
  await withDb(async (client) => {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
    await client.query("UPDATE metrics SET enabled = true WHERE company_id = $1", [companyId]);
  });

  const metricsRes = await request.get("/api/metrics", { headers: { Authorization: `Bearer ${token}` } });
  expect(metricsRes.status()).toBe(200);
  const metrics = await metricsRes.json() as Array<{ id: string }>;
  expect(metrics[0]?.id).toBeTruthy();

  const saveRes = await request.post("/api/data-entry", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      metricId: metrics[0].id,
      period,
      value,
      notes: "audit log UI access seed",
      dataSourceType: "manual",
      siteId: null,
    },
  });
  expect(saveRes.status()).toBe(200);
}

async function seedExportAuditEvents(request: APIRequestContext) {
  const { tenantA, tenantB } = readSeedInfo();
  const periodA = "2099-11";
  const periodB = "2099-12";

  await prepareTenant(request, tenantA.companyId, tenantA.adminToken, periodA, 12.34);
  await prepareTenant(request, tenantB.companyId, tenantB.adminToken, periodB, 56.78);

  const successA = await request.post("/api/reports/export/esg_metrics_summary", {
    headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    data: { format: "pdf", period: periodA, siteId: "__org__" },
  });
  expect(successA.status()).toBe(200);

  const failureA = await request.post("/api/reports/export/esg_metrics_summary", {
    headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    data: { format: "csv", period: periodA, siteId: "__org__" },
  });
  expect(failureA.status()).toBe(400);

  const successB = await request.post("/api/reports/export/esg_metrics_summary", {
    headers: { Authorization: `Bearer ${tenantB.adminToken}` },
    data: { format: "pdf", period: periodB, siteId: "__org__" },
  });
  expect(successB.status()).toBe(200);

  return { periodA, periodB };
}

async function openSettingsAudit(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
  const page = await context.newPage();
  await page.goto("/settings");
  await expect(page.getByRole("main")).toBeVisible();
  await page.getByTestId("tab-admin").click();
  await page.getByTestId("admin-section-audit").click();
  await expect(page.getByTestId("card-admin-audit")).toBeVisible();
  return { context, page };
}

function isAuditLogResponseFor(url: URL, expected: Record<string, string>) {
  if (url.pathname !== "/api/audit-logs") return false;
  return Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
}

test.describe("Audit-log UI/access hardening", () => {
  test("admin audit UI reads own tenant logs and sends server-backed filters", async ({ browser, request }) => {
    const { tenantA, tenantB } = readSeedInfo();
    const { periodA, periodB } = await seedExportAuditEvents(request);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    // Date-only filters are parsed at midnight; keep this stable near UTC/local day boundaries.
    const tomorrow = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const { context, page } = await openSettingsAudit(browser);

    await expect(page.locator("[data-testid^='audit-log-']").first()).toBeVisible();

    const actionResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return isAuditLogResponseFor(url, { action: "export_report" });
    });
    await page.getByTestId("input-audit-action-filter").fill("export_report");
    const actionResponse = await actionResponsePromise;
    const actionLogs = await actionResponse.json() as Array<{ companyId: string; action: string; details: any }>;
    expect(actionLogs.length).toBeGreaterThan(0);
    expect(actionLogs.every((log) => log.companyId === tenantA.companyId)).toBe(true);
    expect(actionLogs.every((log) => log.action === "export_report")).toBe(true);
    expect(JSON.stringify(actionLogs)).not.toContain(tenantB.companyId);

    await page.getByTestId("select-audit-outcome-filter").click();
    await page.getByRole("option", { name: "Failure" }).click();
    await page.getByTestId("input-audit-entity-filter").fill("report");
    await page.getByTestId("input-audit-date-from").fill(yesterday);
    await page.getByTestId("input-audit-date-to").fill(tomorrow);

    const filteredResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return isAuditLogResponseFor(url, {
        action: "export_report",
        outcome: "failure",
        entityType: "report",
        dateFrom: yesterday,
        dateTo: tomorrow,
        limit: "1",
      });
    });
    await page.getByTestId("input-audit-limit").fill("1");
    const filteredResponse = await filteredResponsePromise;
    const filteredLogs = await filteredResponse.json() as Array<{ companyId: string; action: string; entityType: string; details: any }>;
    expect(filteredLogs.length).toBeLessThanOrEqual(1);
    expect(filteredLogs.every((log) => log.companyId === tenantA.companyId)).toBe(true);
    expect(filteredLogs.every((log) => log.action === "export_report")).toBe(true);
    expect(filteredLogs.every((log) => log.entityType === "report")).toBe(true);
    expect(filteredLogs.every((log) => log.details?.outcome === "failure")).toBe(true);
    expect(JSON.stringify(filteredLogs)).toContain(periodA);
    expect(JSON.stringify(filteredLogs)).not.toContain(periodB);

    await expect(page.locator("[data-testid^='audit-log-']")).toHaveCount(filteredLogs.length);
    if (filteredLogs.length > 0) {
      await expect(page.locator("[data-testid^='audit-log-']").first()).toContainText("export_report");
      await expect(page.locator("[data-testid^='audit-log-']").first()).toContainText("failure");
    }

    await context.close();
  });

  test("viewer and contributor cannot access audit-log UI or data", async ({ browser }) => {
    const { tenantA } = readSeedInfo();

    const viewerContext = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto("/settings");
    await expect(viewerPage.getByRole("main")).toBeVisible();
    await expect(viewerPage.getByTestId("tab-admin")).toHaveCount(0);
    await expect(viewerPage.getByTestId("card-admin-audit")).toHaveCount(0);
    const viewerApi = await viewerPage.evaluate(async (token) => {
      const res = await fetch("/api/audit-logs", { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    }, tenantA.viewerToken);
    expect(viewerApi).toBe(403);
    await viewerContext.close();

    const contributorContext = await browser.newContext();
    await contributorContext.addInitScript((token) => window.localStorage.setItem("auth_token", token), tenantA.contributorToken);
    const contributorPage = await contributorContext.newPage();
    await contributorPage.goto("/settings");
    await expect(contributorPage.getByRole("main")).toBeVisible();
    await expect(contributorPage.getByTestId("tab-admin")).toHaveCount(0);
    await expect(contributorPage.getByTestId("card-admin-audit")).toHaveCount(0);
    const contributorApi = await contributorPage.evaluate(async (token) => {
      const res = await fetch("/api/audit-logs", { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    }, tenantA.contributorToken);
    expect(contributorApi).toBe(403);
    await contributorContext.close();
  });
});
