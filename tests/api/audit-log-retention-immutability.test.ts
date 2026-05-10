/**
 * API regression: audit-log retention and immutability hardening
 *
 * Covers immutable audit-log API behavior, explicit super-admin mutation
 * behavior, bounded audit-log reads, and safe export/download metadata.
 *
 * Run: npx tsx tests/api/audit-log-retention-immutability.test.ts
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
    value: 55.55,
    notes: "audit log immutability seed",
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
}>;

async function getAuditLogs(path: string, token: string): Promise<AuditLogResponse> {
  const res = await apiRequest("GET", path, undefined, token);
  return parseJson<AuditLogResponse>(res, `GET ${path}`);
}

async function createSuperAdmin(suffix: string): Promise<string> {
  const email = `auditimmut-super-${suffix}@test-esg.example`;
  await withDb(async (client) => {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await client.query(
      `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'super_admin', NULL, NOW(), NOW(), '1.0', '1.0')`,
      [`auditimmutsuper${suffix}`, email, passwordHash],
    );
  });
  return loginAndGetToken(email, TEST_PASSWORD);
}

async function getAuditRow(id: string): Promise<{ id: string; details: any; action: string; company_id: string | null } | null> {
  return withDb(async (client) => {
    const res = await client.query("SELECT id, company_id, action, details FROM audit_logs WHERE id = $1", [id]);
    return res.rows[0] ?? null;
  });
}

function expectNoSensitiveContent(logs: AuditLogResponse, values: string[]) {
  const serialized = JSON.stringify(logs.map((log) => log.details));
  for (const value of values.filter(Boolean)) {
    assert(!serialized.includes(value), `audit details leaked sensitive value ${value}: ${serialized}`);
  }
}

async function expectImmutableResponse(method: "PATCH" | "PUT" | "DELETE", path: string, token: string, expected: number, context: string) {
  const res = await apiRequest(method, path, { action: "tamper", details: { after: "modified" } }, token);
  expectStatus(res, expected, context);
  if (expected === 405) {
    const body = JSON.parse(res.body) as { code?: string };
    assert(body.code === "AUDIT_LOG_IMMUTABLE", `${context} missing immutable code: ${res.body}`);
  }
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-10";
  const fakeToken = `audit-token-${suffix}`;
  const fakeApiKey = `ak_test_${suffix}`;
  const fakeReportContent = `SECRET_REPORT_CONTENT_${suffix}`;
  const fakeFilePayload = Buffer.from(`SECRET_FILE_PAYLOAD_${suffix}`).toString("base64");

  await prepareTenant(tenantA.companyId, tenantA.adminToken, period);
  await prepareTenant(tenantB.companyId, tenantB.adminToken, period);

  const tenantAReportId = await generateReport(tenantA.adminToken, period);
  const tenantAFile = await generateFile(tenantA.adminToken, tenantAReportId);
  const tenantBReportId = await generateReport(tenantB.adminToken, period);
  const tenantBFile = await generateFile(tenantB.adminToken, tenantBReportId);
  const superAdminToken = await createSuperAdmin(suffix);

  expectStatus(await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
    format: "pdf",
    period,
    siteId: "__org__",
    token: fakeToken,
    apiKey: fakeApiKey,
    reportContent: fakeReportContent,
    filePayload: fakeFilePayload,
  }, tenantA.adminToken), 200, "Tenant A standalone export");

  expectStatus(await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
    format: "csv",
    period,
    siteId: "__org__",
    token: fakeToken,
    apiKey: fakeApiKey,
    reportContent: fakeReportContent,
    filePayload: fakeFilePayload,
  }, tenantA.adminToken), 400, "Tenant A unsupported export format");

  expectStatus(
    await apiRequestRaw("GET", `/api/reports/${tenantBReportId}/download/${tenantBFile.fileId}`, undefined, tenantA.adminToken),
    404,
    "Tenant A cross-tenant generated-file download",
  );

  const exportLogs = await getAuditLogs(`/api/audit-logs?action=export_report&limit=20`, tenantA.adminToken);
  const targetLog = exportLogs.find((log) => log.details?.period === period && log.details?.outcome === "success");
  assert(targetLog, "seeded export audit log not found");

  await check("audit-log read limits are clamped to safe bounds", async () => {
    const highTenantLogs = await getAuditLogs("/api/audit-logs?limit=9999", tenantA.adminToken);
    assert(highTenantLogs.length <= 500, `tenant high limit was not capped: ${highTenantLogs.length}`);

    const lowTenantLogs = await getAuditLogs("/api/audit-logs?limit=-20", tenantA.adminToken);
    assert(lowTenantLogs.length <= 1, `tenant negative limit was not clamped to one: ${lowTenantLogs.length}`);

    const highAdminLogs = await getAuditLogs("/api/admin/audit-logs?limit=9999", superAdminToken);
    assert(highAdminLogs.length <= 500, `super-admin high limit was not capped: ${highAdminLogs.length}`);

    const lowAdminLogs = await getAuditLogs("/api/admin/audit-logs?limit=0", superAdminToken);
    assert(lowAdminLogs.length <= 1, `super-admin zero limit was not clamped to one: ${lowAdminLogs.length}`);
  });

  await check("tenant audit-log rows cannot be edited or deleted by tenant roles", async () => {
    const before = await getAuditRow(targetLog.id);
    assert(before, "audit row missing before mutation attempts");

    await expectImmutableResponse("PATCH", `/api/audit-logs/${targetLog.id}`, tenantA.adminToken, 405, "admin PATCH /api/audit-logs/:id");
    await expectImmutableResponse("PUT", `/api/audit-logs/${targetLog.id}`, tenantA.adminToken, 405, "admin PUT /api/audit-logs/:id");
    await expectImmutableResponse("DELETE", `/api/audit-logs/${targetLog.id}`, tenantA.adminToken, 405, "admin DELETE /api/audit-logs/:id");

    await expectImmutableResponse("PATCH", `/api/audit-logs/${targetLog.id}`, tenantA.contributorToken, 403, "contributor PATCH /api/audit-logs/:id");
    await expectImmutableResponse("DELETE", `/api/audit-logs/${targetLog.id}`, tenantA.contributorToken, 403, "contributor DELETE /api/audit-logs/:id");
    await expectImmutableResponse("PATCH", `/api/audit-logs/${targetLog.id}`, tenantA.viewerToken, 403, "viewer PATCH /api/audit-logs/:id");
    await expectImmutableResponse("DELETE", `/api/audit-logs/${targetLog.id}`, tenantA.viewerToken, 403, "viewer DELETE /api/audit-logs/:id");
    await expectStatus(await apiRequest("DELETE", `/api/audit-logs/${targetLog.id}`), 401, "unauthenticated DELETE /api/audit-logs/:id");

    const after = await getAuditRow(targetLog.id);
    assert(after, "audit row missing after mutation attempts");
    assert(JSON.stringify(after.details) === JSON.stringify(before.details), "audit row details changed after mutation attempts");
    assert(after.action === before.action, "audit row action changed after mutation attempts");
  });

  await check("super-admin audit-log mutation behavior is explicit and immutable", async () => {
    await expectImmutableResponse("PATCH", `/api/admin/audit-logs/${targetLog.id}`, superAdminToken, 405, "super-admin PATCH /api/admin/audit-logs/:id");
    await expectImmutableResponse("PUT", `/api/admin/audit-logs/${targetLog.id}`, superAdminToken, 405, "super-admin PUT /api/admin/audit-logs/:id");
    await expectImmutableResponse("DELETE", `/api/admin/audit-logs/${targetLog.id}`, superAdminToken, 405, "super-admin DELETE /api/admin/audit-logs/:id");

    await expectStatus(await apiRequest("DELETE", `/api/admin/audit-logs/${targetLog.id}`, undefined, tenantA.adminToken), 403, "tenant admin DELETE /api/admin/audit-logs/:id");
    await expectStatus(await apiRequest("DELETE", `/api/admin/audit-logs/${targetLog.id}`, undefined, tenantA.viewerToken), 403, "viewer DELETE /api/admin/audit-logs/:id");

    const after = await getAuditRow(targetLog.id);
    assert(after, "audit row missing after super-admin mutation attempts");
  });

  await check("export/download audit visibility retains safe metadata only", async () => {
    const logs = [
      ...await getAuditLogs("/api/audit-logs?action=export_report&limit=50", tenantA.adminToken),
      ...await getAuditLogs("/api/audit-logs?action=generated_file_generate&limit=50", tenantA.adminToken),
      ...await getAuditLogs("/api/audit-logs?action=generated_file_download&limit=50", tenantA.adminToken),
    ].filter((log) => JSON.stringify(log.details).includes(period) || log.entityId === tenantAFile.fileId || log.entityId === tenantBFile.fileId);

    assert(logs.length > 0, "expected export/download audit logs for safe metadata checks");
    expectNoSensitiveContent(logs, [fakeToken, fakeApiKey, fakeReportContent, fakeFilePayload, tenantBFile.filename]);

    const failedDownload = logs.find((log) => log.action === "generated_file_download" && log.entityId === tenantBFile.fileId);
    assert(failedDownload, "expected failed cross-tenant generated-file download audit log");
    assert(failedDownload.details?.fileName == null, `failed download leaked filename ${JSON.stringify(failedDownload.details)}`);
    assert(failedDownload.details?.fileType == null, `failed download leaked file type ${JSON.stringify(failedDownload.details)}`);
  });
}

(async () => {
  console.log("\n=== API Regression: Audit-Log Retention and Immutability ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("audit-log retention and immutability setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Audit-Log Retention and Immutability: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
