/**
 * API regression: report export audit-log visibility
 *
 * Covers tenant-admin visibility, role restrictions, tenant isolation, and
 * action/outcome filtering for report export and generated-file audit events.
 *
 * Run: npx tsx tests/api/report-export-audit-visibility.test.ts
 */

import { Client } from "pg";
import bcrypt from "bcryptjs";
import { apiRequest, apiRequestRaw, loginAndGetToken, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

const TEST_PASSWORD = "Test1234!";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string | void> | string | void) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

function parseJson<T>(res: { status: number; body: string }, context: string): T {
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 500)}`);
  return JSON.parse(res.body) as T;
}

function expectStatus(res: { status: number; body: string } | { status: number; body: Buffer }, expected: number | number[], context: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  const body = Buffer.isBuffer(res.body) ? res.body.toString("utf8") : res.body;
  assert(allowed.includes(res.status), `${context} expected=${allowed.join("/")} got=${res.status} body=${body.slice(0, 500)}`);
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

async function prepareTenant(companyId: string, token: string, period: string) {
  await withDb(async (client) => {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
    await client.query("UPDATE metrics SET enabled = true WHERE company_id = $1", [companyId]);
  });

  const metricsRes = await apiRequest("GET", "/api/metrics", undefined, token);
  const metrics = parseJson<Array<{ id: string }>>(metricsRes, "GET /api/metrics");
  const metricId = metrics[0]?.id;
  assert(metricId, "seeded metric missing");

  const dataEntryRes = await apiRequest("POST", "/api/data-entry", {
    metricId,
    period,
    value: 42.42,
    notes: "report export audit visibility seed",
    dataSourceType: "manual",
    siteId: null,
  }, token);
  parseJson(dataEntryRes, "POST /api/data-entry");
}

async function generateReport(token: string, period: string): Promise<string> {
  const res = await apiRequest("POST", "/api/reports/generate", {
    reportType: "pdf",
    reportTemplate: "management",
    period,
    includeMetrics: true,
    includePolicy: false,
    includeTopics: false,
    includeEvidence: false,
  }, token);
  const body = parseJson<{ report?: { id?: string } }>(res, "POST /api/reports/generate");
  const id = body.report?.id;
  assert(id, "report id missing");
  return id;
}

async function generateFile(token: string, reportId: string): Promise<{ fileId: string; filename: string }> {
  const res = await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format: "pdf" }, token);
  const body = parseJson<{ fileId?: string; filename?: string }>(res, "POST /api/reports/:id/generate-file");
  assert(body.fileId && body.filename, "generated file metadata missing");
  return { fileId: body.fileId, filename: body.filename };
}

type AuditLogResponse = Array<{
  id: string;
  companyId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  performedBy?: string | null;
}>;

async function getAuditLogs(path: string, token: string): Promise<AuditLogResponse> {
  const res = await apiRequest("GET", path, undefined, token);
  return parseJson<AuditLogResponse>(res, `GET ${path}`);
}

function expectNoSensitiveContent(log: { details: any }, values: string[]) {
  const serialized = JSON.stringify(log.details);
  for (const value of values.filter(Boolean)) {
    assert(!serialized.includes(value), `audit details leaked sensitive value ${value}: ${serialized}`);
  }
}

async function createSuperAdmin(suffix: string): Promise<string> {
  const email = `exportaudit-super-${suffix}@test-esg.example`;
  await withDb(async (client) => {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await client.query(
      `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'super_admin', NULL, NOW(), NOW(), '1.0', '1.0')`,
      [`exportauditsuper${suffix}`, email, passwordHash],
    );
  });
  return loginAndGetToken(email, TEST_PASSWORD);
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-09";

  await prepareTenant(tenantA.companyId, tenantA.adminToken, period);
  await prepareTenant(tenantB.companyId, tenantB.adminToken, period);

  const tenantBReportId = await generateReport(tenantB.adminToken, period);
  const tenantBFile = await generateFile(tenantB.adminToken, tenantBReportId);
  const superAdminToken = await createSuperAdmin(suffix);

  expectStatus(await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
    format: "pdf",
    period,
    siteId: "__org__",
  }, tenantA.adminToken), 200, "Tenant A standalone export");

  expectStatus(await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
    format: "pdf",
    period,
    siteId: "__org__",
  }, tenantB.adminToken), 200, "Tenant B standalone export");

  expectStatus(await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
    format: "csv",
    period,
    siteId: "__org__",
  }, tenantA.adminToken), 400, "Tenant A unsupported export format");

  expectStatus(
    await apiRequestRaw("GET", `/api/reports/${tenantBReportId}/download/${tenantBFile.fileId}`, undefined, tenantA.adminToken),
    404,
    "Tenant A cross-tenant generated-file download",
  );

  await check("tenant admin sees own export audit events through tenant audit-log endpoint", async () => {
    const logs = await getAuditLogs("/api/audit-logs?action=export_report&outcome=success&limit=20", tenantA.adminToken);
    assert(logs.length > 0, "expected at least one Tenant A successful export audit log");
    assert(logs.every((log) => log.companyId === tenantA.companyId), "tenant endpoint returned another company log");
    assert(logs.every((log) => log.action === "export_report"), "action filter returned non-export_report logs");
    assert(logs.every((log) => log.details?.outcome === "success"), "outcome filter returned non-success logs");
    assert(logs.some((log) => log.details?.period === period), "expected seeded period in export audit logs");
  });

  await check("tenant admin audit-log endpoint excludes other tenant export events", async () => {
    const logs = await getAuditLogs("/api/audit-logs?action=export_report&outcome=success&limit=100", tenantA.adminToken);
    assert(!logs.some((log) => log.companyId === tenantB.companyId), "Tenant B audit log leaked to Tenant A");
    assert(!JSON.stringify(logs).includes(tenantB.adminEmail), "Tenant B user metadata leaked to Tenant A");
  });

  await check("tenant audit-log filters support entity type, date range, and bounded limit", async () => {
    const now = Date.now();
    const dateFrom = new Date(now - 86400000).toISOString().slice(0, 10);
    // The API accepts date-only filters; use a two-day upper bound so this
    // assertion remains stable around local/UTC midnight boundaries.
    const dateTo = new Date(now + 2 * 86400000).toISOString().slice(0, 10);
    const logs = await getAuditLogs(
      `/api/audit-logs?action=export_report&entityType=report&dateFrom=${dateFrom}&dateTo=${dateTo}&limit=1`,
      tenantA.adminToken,
    );
    assert(logs.length <= 1, `limit was not enforced: ${logs.length}`);
    assert(logs.length > 0, "expected at least one date-filtered export audit log");
    assert(logs.every((log) => log.companyId === tenantA.companyId), "tenant endpoint returned another company log");
    assert(logs.every((log) => log.action === "export_report"), "action filter returned non-export_report logs");
    assert(logs.every((log) => log.entityType === "report"), "entityType filter returned non-report logs");
  });

  await check("contributors and viewers cannot read tenant audit-log endpoint", async () => {
    expectStatus(await apiRequest("GET", "/api/audit-logs", undefined, tenantA.contributorToken), 403, "contributor GET /api/audit-logs");
    expectStatus(await apiRequest("GET", "/api/audit-logs", undefined, tenantA.viewerToken), 403, "viewer GET /api/audit-logs");
    expectStatus(await apiRequest("GET", "/api/audit-logs", undefined), 401, "unauthenticated GET /api/audit-logs");
  });

  await check("failed export/download attempts are visible with safe metadata only", async () => {
    const unsupported = await getAuditLogs("/api/audit-logs?action=export_report&outcome=failure&limit=20", tenantA.adminToken);
    const unsupportedLog = unsupported.find((log) => log.details?.reason === "unsupported_format" && log.details?.format === "csv");
    assert(unsupportedLog, "unsupported format export audit log not visible to tenant admin");
    expectNoSensitiveContent(unsupportedLog, [tenantB.adminEmail, tenantBFile.filename]);

    const failedDownloads = await getAuditLogs("/api/audit-logs?action=generated_file_download&outcome=failure&limit=20", tenantA.adminToken);
    const crossTenantDownload = failedDownloads.find((log) => log.entityId === tenantBFile.fileId);
    assert(crossTenantDownload, "cross-tenant download audit log not visible to tenant admin");
    assert(crossTenantDownload.details?.reason === "cross_tenant_file", `reason mismatch ${JSON.stringify(crossTenantDownload.details)}`);
    assert(crossTenantDownload.details?.fileName == null, `failed download leaked filename ${JSON.stringify(crossTenantDownload.details)}`);
    assert(crossTenantDownload.details?.fileType == null, `failed download leaked file type ${JSON.stringify(crossTenantDownload.details)}`);
    expectNoSensitiveContent(crossTenantDownload, [tenantB.adminEmail, tenantBFile.filename]);
  });

  await check("super-admin audit-log filtering by company, action, and outcome remains scoped", async () => {
    const tenantALogs = await getAuditLogs(`/api/admin/audit-logs?companyId=${tenantA.companyId}&action=export_report&outcome=failure&limit=20`, superAdminToken);
    assert(tenantALogs.length > 0, "expected Tenant A failure logs");
    assert(tenantALogs.every((log) => log.companyId === tenantA.companyId), "company filter returned another company log");
    assert(tenantALogs.every((log) => log.action === "export_report"), "action filter returned non-export_report logs");
    assert(tenantALogs.every((log) => log.details?.outcome === "failure"), "outcome filter returned non-failure logs");

    expectStatus(await apiRequest("GET", "/api/admin/audit-logs", undefined, tenantA.adminToken), 403, "tenant admin GET /api/admin/audit-logs");
    expectStatus(await apiRequest("GET", "/api/admin/audit-logs", undefined, tenantA.viewerToken), 403, "viewer GET /api/admin/audit-logs");
  });
}

(async () => {
  console.log("\n=== API Regression: Report Export Audit-Log Visibility ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("report export audit-log visibility setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Report Export Audit-Log Visibility: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
