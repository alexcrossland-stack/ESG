/**
 * API regression: report export audit logging
 *
 * Covers audit logs for report exports, generated-file creation/download,
 * failed cross-tenant access, expired-file access, and unsupported formats.
 *
 * Run: npx tsx tests/api/report-export-audit.test.ts
 */

import { Client } from "pg";
import { apiRequest, apiRequestRaw, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

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
    value: 77.77,
    notes: "report export audit seed",
    dataSourceType: "manual",
    siteId: null,
  }, token);
  parseJson(dataEntryRes, "POST /api/data-entry");
}

async function getUserIdByEmail(email: string): Promise<string> {
  return withDb(async (client) => {
    const res = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    const id = res.rows[0]?.id;
    assert(id, `user id not found for ${email}`);
    return id;
  });
}

async function createSite(token: string, name: string): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office", country: "United Kingdom" }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/sites");
  assert(body.id, "site id missing");
  return body.id;
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

async function generateFile(token: string, reportId: string, format: "pdf" | "docx" = "pdf") {
  const res = await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format }, token);
  return parseJson<{ fileId?: string; filename?: string; downloadUrl?: string; fileType?: string }>(
    res,
    "POST /api/reports/:id/generate-file",
  );
}

async function insertGeneratedFile(input: {
  reportRunId: string;
  companyId: string;
  filename: string;
  content: string;
  expiresAtSql?: string;
}): Promise<string> {
  return withDb(async (client) => {
    const buffer = Buffer.from(input.content, "utf8");
    const res = await client.query<{ id: string }>(
      `INSERT INTO generated_files (report_run_id, company_id, file_type, filename, file_data, file_size, expires_at)
       VALUES ($1, $2, 'pdf', $3, $4, $5, ${input.expiresAtSql ?? "NULL"})
       RETURNING id`,
      [input.reportRunId, input.companyId, input.filename, buffer.toString("base64"), buffer.length],
    );
    return res.rows[0].id;
  });
}

type AuditRow = {
  id: string;
  company_id: string | null;
  user_id: string | null;
  actor_type: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
};

async function latestAudit(input: {
  companyId: string;
  action: string;
  entityId?: string;
  outcome?: string;
  reason?: string | null;
}): Promise<AuditRow> {
  return withDb(async (client) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const params: unknown[] = [input.companyId, input.action];
      let sqlText = "SELECT * FROM audit_logs WHERE company_id = $1 AND action = $2";
      if (input.entityId !== undefined) {
        params.push(input.entityId);
        sqlText += ` AND entity_id = $${params.length}`;
      }
      if (input.outcome !== undefined) {
        params.push(input.outcome);
        sqlText += ` AND details->>'outcome' = $${params.length}`;
      }
      if (input.reason !== undefined) {
        if (input.reason === null) {
          sqlText += " AND (details->>'reason' IS NULL OR details->>'reason' = '')";
        } else {
          params.push(input.reason);
          sqlText += ` AND details->>'reason' = $${params.length}`;
        }
      }
      sqlText += " ORDER BY created_at DESC LIMIT 1";
      const res = await client.query<AuditRow>(sqlText, params);
      if (res.rows[0]) return res.rows[0];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`audit log not found action=${input.action} entityId=${input.entityId ?? "*"} outcome=${input.outcome ?? "*"} reason=${input.reason ?? "*"}`);
  });
}

function expectBaseAudit(row: AuditRow, input: {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: string;
}) {
  assert(row.company_id === input.companyId, `companyId mismatch ${row.company_id}`);
  assert(row.user_id === input.userId, `userId mismatch ${row.user_id}`);
  assert(row.actor_type === "user", `actorType mismatch ${row.actor_type}`);
  assert(row.action === input.action, `action mismatch ${row.action}`);
  assert(row.entity_type === input.entityType, `entityType mismatch ${row.entity_type}`);
  assert(row.entity_id === input.entityId, `entityId mismatch ${row.entity_id}`);
  assert(row.details?.outcome === input.outcome, `outcome mismatch ${JSON.stringify(row.details)}`);
}

function expectNoSensitiveContent(row: AuditRow, values: string[]) {
  const serialized = JSON.stringify(row.details);
  for (const value of values.filter(Boolean)) {
    assert(!serialized.includes(value), `audit details leaked sensitive value ${value}: ${serialized}`);
  }
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-08";
  const tenantAUserId = await getUserIdByEmail(tenantA.adminEmail);
  const tenantBUserId = await getUserIdByEmail(tenantB.adminEmail);

  await prepareTenant(tenantA.companyId, tenantA.adminToken, period);
  await prepareTenant(tenantB.companyId, tenantB.adminToken, period);

  const reportId = await generateReport(tenantA.adminToken, period);
  const tenantBReportId = await generateReport(tenantB.adminToken, period);
  const tenantBFile = await generateFile(tenantB.adminToken, tenantBReportId, "pdf");
  assert(tenantBFile.fileId, "Tenant B file id missing");

  await check("successful standalone report export writes actor/company/outcome audit log", async () => {
    const res = await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
      format: "pdf",
      period,
      siteId: "__org__",
    }, tenantA.adminToken);
    expectStatus(res, 200, "POST /api/reports/export/esg_metrics_summary");

    const row = await latestAudit({
      companyId: tenantA.companyId,
      action: "export_report",
      entityId: "esg_metrics_summary",
      outcome: "success",
      reason: null,
    });
    expectBaseAudit(row, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "export_report",
      entityType: "report",
      entityId: "esg_metrics_summary",
      outcome: "success",
    });
    assert(row.details?.reportType === "esg_metrics_summary", `missing reportType ${JSON.stringify(row.details)}`);
    assert(row.details?.format === "pdf", `missing format ${JSON.stringify(row.details)}`);
    assert(row.details?.period === period, `missing period ${JSON.stringify(row.details)}`);
    assert(row.details?.statusCode === 200, `missing statusCode ${JSON.stringify(row.details)}`);
    assert(typeof row.details?.fileSize === "number" && row.details.fileSize > 0, `missing fileSize ${JSON.stringify(row.details)}`);
  });

  await check("generated-file generation and download write success audit logs", async () => {
    const file = await generateFile(tenantA.adminToken, reportId, "pdf");
    assert(file.fileId && file.filename, "generated file metadata missing");
    const generation = await latestAudit({
      companyId: tenantA.companyId,
      action: "generated_file_generate",
      entityId: file.fileId,
      outcome: "success",
      reason: null,
    });
    expectBaseAudit(generation, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "generated_file_generate",
      entityType: "generated_file",
      entityId: file.fileId,
      outcome: "success",
    });
    assert(generation.details?.reportRunId === reportId, `reportRunId mismatch ${JSON.stringify(generation.details)}`);
    assert(generation.details?.fileName === file.filename, `filename mismatch ${JSON.stringify(generation.details)}`);

    expectStatus(await apiRequestRaw("GET", `/api/reports/${reportId}/download/${file.fileId}`, undefined, tenantA.adminToken), 200, "download generated file");
    const download = await latestAudit({
      companyId: tenantA.companyId,
      action: "generated_file_download",
      entityId: file.fileId,
      outcome: "success",
      reason: null,
    });
    expectBaseAudit(download, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "generated_file_download",
      entityType: "generated_file",
      entityId: file.fileId,
      outcome: "success",
    });
    assert(download.details?.reportRunId === reportId, `reportRunId mismatch ${JSON.stringify(download.details)}`);
    assert(download.details?.fileId === file.fileId, `fileId mismatch ${JSON.stringify(download.details)}`);
    assert(download.details?.statusCode === 200, `statusCode mismatch ${JSON.stringify(download.details)}`);
  });

  await check("historical report view success and cross-tenant failures are audited safely", async () => {
    const viewRes = await apiRequest("GET", `/api/reports/${reportId}`, undefined, tenantA.adminToken);
    expectStatus(viewRes, 200, "GET /api/reports/:id");
    const viewAudit = await latestAudit({
      companyId: tenantA.companyId,
      action: "historical_report_view",
      entityId: reportId,
      outcome: "success",
      reason: null,
    });
    expectBaseAudit(viewAudit, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "historical_report_view",
      entityType: "report_run",
      entityId: reportId,
      outcome: "success",
    });
    assert(viewAudit.details?.statusCode === 200, `statusCode mismatch ${JSON.stringify(viewAudit.details)}`);
    assert(viewAudit.details?.reportRunId === reportId, `reportRunId mismatch ${JSON.stringify(viewAudit.details)}`);
    assert(typeof viewAudit.details?.hasReportData === "boolean", `missing hasReportData ${JSON.stringify(viewAudit.details)}`);
    assert(!JSON.stringify(viewAudit.details).includes("values"), `historical view audit leaked report snapshot content ${JSON.stringify(viewAudit.details)}`);

    expectStatus(await apiRequest("GET", `/api/reports/${tenantBReportId}`, undefined, tenantA.adminToken), 404, "cross-tenant historical report view");
    const failedViewAudit = await latestAudit({
      companyId: tenantA.companyId,
      action: "historical_report_view",
      entityId: tenantBReportId,
      outcome: "failure",
      reason: "report_not_found_or_forbidden",
    });
    expectBaseAudit(failedViewAudit, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "historical_report_view",
      entityType: "report_run",
      entityId: tenantBReportId,
      outcome: "failure",
    });
    assert(failedViewAudit.details?.statusCode === 404, `statusCode mismatch ${JSON.stringify(failedViewAudit.details)}`);
    expectNoSensitiveContent(failedViewAudit, [tenantB.adminEmail, tenantBUserId, tenantB.companyId]);
  });

  await check("cross-tenant report export and download failures are audited without sensitive content", async () => {
    const tenantBSiteId = await createSite(tenantB.adminToken, `Tenant B Audit Site ${suffix}`);
    const exportRes = await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
      format: "pdf",
      period,
      siteId: tenantBSiteId,
    }, tenantA.adminToken);
    expectStatus(exportRes, [403, 404], "cross-tenant standalone export");

    const exportAudit = await latestAudit({
      companyId: tenantA.companyId,
      action: "export_report",
      entityId: "esg_metrics_summary",
      outcome: "failure",
      reason: "site_scope_forbidden",
    });
    expectBaseAudit(exportAudit, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "export_report",
      entityType: "report",
      entityId: "esg_metrics_summary",
      outcome: "failure",
    });
    assert([403, 404].includes(exportAudit.details?.statusCode), `statusCode mismatch ${JSON.stringify(exportAudit.details)}`);
    expectNoSensitiveContent(exportAudit, [tenantB.adminEmail, tenantBUserId]);

    expectStatus(await apiRequestRaw("GET", `/api/reports/${tenantBReportId}/download/${tenantBFile.fileId}`, undefined, tenantA.adminToken), 404, "cross-tenant generated-file download");
    const downloadAudit = await latestAudit({
      companyId: tenantA.companyId,
      action: "generated_file_download",
      entityId: tenantBFile.fileId,
      outcome: "failure",
      reason: "cross_tenant_file",
    });
    expectBaseAudit(downloadAudit, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "generated_file_download",
      entityType: "generated_file",
      entityId: tenantBFile.fileId,
      outcome: "failure",
    });
    assert(downloadAudit.details?.reportRunId === tenantBReportId, `reportRunId mismatch ${JSON.stringify(downloadAudit.details)}`);
    assert(downloadAudit.details?.statusCode === 404, `statusCode mismatch ${JSON.stringify(downloadAudit.details)}`);
    expectNoSensitiveContent(downloadAudit, [tenantB.adminEmail, tenantBUserId, tenantBFile.filename ?? ""]);
  });

  await check("expired-file access is audited without leaking filename or file content", async () => {
    const expiredFilename = `expired-secret-${suffix}.pdf`;
    const expiredSecret = `EXPIRED_SECRET_CONTENT_${suffix}`;
    const expiredId = await insertGeneratedFile({
      reportRunId: reportId,
      companyId: tenantA.companyId,
      filename: expiredFilename,
      content: expiredSecret,
      expiresAtSql: "TIMESTAMP '2000-01-01 00:00:00'",
    });

    expectStatus(await apiRequestRaw("GET", `/api/reports/${reportId}/download/${expiredId}`, undefined, tenantA.adminToken), 404, "expired generated-file download");
    const row = await latestAudit({
      companyId: tenantA.companyId,
      action: "generated_file_download",
      entityId: expiredId,
      outcome: "failure",
      reason: "expired_file",
    });
    expectBaseAudit(row, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "generated_file_download",
      entityType: "generated_file",
      entityId: expiredId,
      outcome: "failure",
    });
    assert(row.details?.reportRunId === reportId, `reportRunId mismatch ${JSON.stringify(row.details)}`);
    assert(row.details?.fileId === expiredId, `fileId mismatch ${JSON.stringify(row.details)}`);
    expectNoSensitiveContent(row, [expiredFilename, expiredSecret]);
  });

  await check("unsupported format rejections are audited for export endpoints", async () => {
    expectStatus(await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
      format: "csv",
      period,
      siteId: "__org__",
    }, tenantA.adminToken), 400, "standalone export unsupported format");
    const standalone = await latestAudit({
      companyId: tenantA.companyId,
      action: "export_report",
      entityId: "esg_metrics_summary",
      outcome: "failure",
      reason: "unsupported_format",
    });
    expectBaseAudit(standalone, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "export_report",
      entityType: "report",
      entityId: "esg_metrics_summary",
      outcome: "failure",
    });
    assert(standalone.details?.format === "csv", `format mismatch ${JSON.stringify(standalone.details)}`);
    assert(standalone.details?.statusCode === 400, `statusCode mismatch ${JSON.stringify(standalone.details)}`);

    expectStatus(await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format: "xlsx" }, tenantA.adminToken), 400, "generated-file unsupported format");
    const generation = await latestAudit({
      companyId: tenantA.companyId,
      action: "generated_file_generate",
      entityId: reportId,
      outcome: "failure",
      reason: "unsupported_format",
    });
    expectBaseAudit(generation, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "generated_file_generate",
      entityType: "report_run",
      entityId: reportId,
      outcome: "failure",
    });
    assert(generation.details?.format === "xlsx", `format mismatch ${JSON.stringify(generation.details)}`);

    expectStatus(await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?period=${period}&siteId=null&format=pdf`, undefined, tenantA.adminToken), 400, "export-data unsupported format");
    const exportData = await latestAudit({
      companyId: tenantA.companyId,
      action: "report_export_data",
      entityId: "esg_metrics_summary",
      outcome: "failure",
      reason: "unsupported_format",
    });
    expectBaseAudit(exportData, {
      companyId: tenantA.companyId,
      userId: tenantAUserId,
      action: "report_export_data",
      entityType: "report",
      entityId: "esg_metrics_summary",
      outcome: "failure",
    });
    assert(exportData.details?.format === "pdf", `format mismatch ${JSON.stringify(exportData.details)}`);
  });
}

(async () => {
  console.log("\n=== API Regression: Report Export Audit Logging ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("report export audit setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Report Export Audit Logging: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
