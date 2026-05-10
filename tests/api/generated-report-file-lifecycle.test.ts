/**
 * API regression: generated report file lifecycle
 *
 * Covers generated file ownership, expiry, list/download visibility,
 * hard deletion, and stale file isolation across regenerated reports.
 *
 * Run: npx tsx tests/api/generated-report-file-lifecycle.test.ts
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
    value: 10,
    notes: "generated report file lifecycle seed",
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
  const reportId = body.report?.id;
  assert(reportId, "generated report id missing");
  return reportId;
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
  fileType?: "pdf" | "docx";
  generatedAtSql?: string;
  expiresAtSql?: string;
}): Promise<string> {
  return withDb(async (client) => {
    const buffer = Buffer.from(input.content, "utf8");
    const res = await client.query<{ id: string }>(
      `INSERT INTO generated_files (report_run_id, company_id, file_type, filename, file_data, file_size, generated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${input.generatedAtSql ?? "NOW()"}, ${input.expiresAtSql ?? "NULL"})
       RETURNING id`,
      [
        input.reportRunId,
        input.companyId,
        input.fileType ?? "pdf",
        input.filename,
        buffer.toString("base64"),
        buffer.length,
      ],
    );
    return res.rows[0].id;
  });
}

async function deleteGeneratedFile(fileId: string): Promise<number> {
  return withDb(async (client) => {
    const res = await client.query("DELETE FROM generated_files WHERE id = $1", [fileId]);
    return res.rowCount ?? 0;
  });
}

async function reportFiles(token: string, reportId: string) {
  const res = await apiRequest("GET", `/api/reports/${reportId}/files`, undefined, token);
  return parseJson<Array<{ id: string; filename: string; fileType: string }>>(res, "GET /api/reports/:id/files");
}

async function reportsList(token: string) {
  const res = await apiRequest("GET", "/api/reports", undefined, token);
  return parseJson<Array<{
    id: string;
    latestFileId?: string | null;
    latestFilename?: string | null;
    latestDownloadUrl?: string | null;
    fileAvailability?: string;
  }>>(res, "GET /api/reports");
}

async function download(token: string, reportId: string, fileId: string) {
  return apiRequestRaw("GET", `/api/reports/${reportId}/download/${fileId}`, undefined, token);
}

function findReport(reports: Array<{ id: string }>, reportId: string) {
  const report = reports.find((row) => row.id === reportId);
  assert(report, `report ${reportId} missing from report list`);
  return report as {
    id: string;
    latestFileId?: string | null;
    latestFilename?: string | null;
    latestDownloadUrl?: string | null;
    fileAvailability?: string;
  };
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-09";

  await prepareTenant(tenantA.companyId, tenantA.adminToken, period);
  await prepareTenant(tenantB.companyId, tenantB.adminToken, period);

  const reportOneId = await generateReport(tenantA.adminToken, period);
  const reportTwoId = await generateReport(tenantA.adminToken, period);
  const tenantBReportId = await generateReport(tenantB.adminToken, period);

  await check("owned generated files are listed and downloadable for their report", async () => {
    const firstFile = await generateFile(tenantA.adminToken, reportOneId, "pdf");
    assert(firstFile.fileId && firstFile.filename, "generated file metadata missing");
    assert(firstFile.downloadUrl === `/api/reports/${reportOneId}/download/${firstFile.fileId}`, `unexpected download URL ${firstFile.downloadUrl}`);

    const files = await reportFiles(tenantA.adminToken, reportOneId);
    assert(files.some((file) => file.id === firstFile.fileId && file.filename === firstFile.filename), "owned generated file missing from file list");

    const reports = await reportsList(tenantA.adminToken);
    const report = findReport(reports, reportOneId);
    assert(report.fileAvailability === "available", `expected available, got ${report.fileAvailability}`);
    assert(report.latestFileId === firstFile.fileId, `expected latestFileId=${firstFile.fileId}, got ${report.latestFileId}`);
    assert(report.latestDownloadUrl === firstFile.downloadUrl, `unexpected latestDownloadUrl ${report.latestDownloadUrl}`);

    const file = await download(tenantA.adminToken, reportOneId, firstFile.fileId);
    const contentType = file.headers.get("content-type") || "";
    expectStatus(file, 200, "download owned generated file");
    assert(contentType.includes("application/pdf"), `unexpected content-type ${contentType}`);
    assert(file.body.length > 100, "downloaded generated file is unexpectedly small");
  });

  await check("expired files are not listed, not current in history, and not downloadable", async () => {
    const valid = await generateFile(tenantA.adminToken, reportOneId, "pdf");
    assert(valid.fileId && valid.filename, "valid generated file missing");
    const expiredFilename = `expired-generated-report-${suffix}.pdf`;
    const expiredId = await insertGeneratedFile({
      reportRunId: reportOneId,
      companyId: tenantA.companyId,
      filename: expiredFilename,
      content: "expired generated report file",
      generatedAtSql: "NOW() + INTERVAL '1 minute'",
      expiresAtSql: "TIMESTAMP '2000-01-01 00:00:00'",
    });

    const files = await reportFiles(tenantA.adminToken, reportOneId);
    assert(files.some((file) => file.id === valid.fileId), "valid generated file missing from file list");
    assert(!files.some((file) => file.id === expiredId || file.filename === expiredFilename), "expired generated file appeared in file list");

    const report = findReport(await reportsList(tenantA.adminToken), reportOneId);
    assert(report.latestFileId === valid.fileId, `expired file should not become latestFileId; got ${report.latestFileId}`);
    assert(report.latestFilename === valid.filename, `expired file should not become latestFilename; got ${report.latestFilename}`);

    expectStatus(await download(tenantA.adminToken, reportOneId, expiredId), 404, "download expired generated file");
  });

  await check("files from another tenant are never listed or downloadable", async () => {
    const tenantBFile = await generateFile(tenantB.adminToken, tenantBReportId, "pdf");
    assert(tenantBFile.fileId, "Tenant B generated file id missing");
    const injectedFilename = `tenant-b-injected-${suffix}.pdf`;
    const injectedId = await insertGeneratedFile({
      reportRunId: reportOneId,
      companyId: tenantB.companyId,
      filename: injectedFilename,
      content: "tenant b injected generated file",
      generatedAtSql: "NOW() + INTERVAL '2 minutes'",
    });

    expectStatus(await apiRequest("GET", `/api/reports/${tenantBReportId}/files`, undefined, tenantA.adminToken), 404, "Tenant A lists Tenant B report files");
    expectStatus(await download(tenantA.adminToken, tenantBReportId, tenantBFile.fileId), 404, "Tenant A downloads Tenant B report file");

    const files = await reportFiles(tenantA.adminToken, reportOneId);
    assert(!files.some((file) => file.id === injectedId || file.filename === injectedFilename), "cross-tenant generated file appeared in Tenant A file list");
    expectStatus(await download(tenantA.adminToken, reportOneId, injectedId), 404, "Tenant A downloads injected cross-tenant generated file");

    const report = findReport(await reportsList(tenantA.adminToken), reportOneId);
    assert(report.latestFileId !== injectedId, "cross-tenant generated file became latest report file");
    assert(report.latestFilename !== injectedFilename, "cross-tenant generated filename became latest report filename");
  });

  await check("deleted generated files are not listed or downloadable", async () => {
    const file = await generateFile(tenantA.adminToken, reportOneId, "pdf");
    assert(file.fileId, "generated file id missing before delete");
    const deleted = await deleteGeneratedFile(file.fileId);
    assert(deleted === 1, `expected one generated file row deleted, got ${deleted}`);

    const files = await reportFiles(tenantA.adminToken, reportOneId);
    assert(!files.some((row) => row.id === file.fileId), "deleted generated file still appears in file list");
    expectStatus(await download(tenantA.adminToken, reportOneId, file.fileId), 404, "download deleted generated file");
  });

  await check("regeneration uses the current report file and does not expose stale prior-report files", async () => {
    const priorFile = await generateFile(tenantA.adminToken, reportOneId, "pdf");
    const currentFile = await generateFile(tenantA.adminToken, reportTwoId, "pdf");
    assert(priorFile.fileId && currentFile.fileId && currentFile.filename, "generated file metadata missing");
    const staleFilename = `stale-prior-report-${suffix}.pdf`;
    const stalePriorId = await insertGeneratedFile({
      reportRunId: reportOneId,
      companyId: tenantA.companyId,
      filename: staleFilename,
      content: "stale prior report generated file",
      generatedAtSql: "NOW() + INTERVAL '5 minutes'",
    });

    const currentFiles = await reportFiles(tenantA.adminToken, reportTwoId);
    assert(currentFiles.some((file) => file.id === currentFile.fileId), "current report generated file missing");
    assert(!currentFiles.some((file) => file.id === priorFile.fileId || file.id === stalePriorId || file.filename === staleFilename), "prior report file appeared in current report file list");

    expectStatus(await download(tenantA.adminToken, reportTwoId, priorFile.fileId), 404, "download prior file through current report");
    expectStatus(await download(tenantA.adminToken, reportTwoId, stalePriorId), 404, "download stale prior file through current report");

    const reports = await reportsList(tenantA.adminToken);
    const currentReport = findReport(reports, reportTwoId);
    assert(currentReport.latestFileId === currentFile.fileId, `current report latestFileId should be current file, got ${currentReport.latestFileId}`);
    assert(currentReport.latestFilename === currentFile.filename, `current report latestFilename should be current filename, got ${currentReport.latestFilename}`);
  });
}

(async () => {
  console.log("\n=== API Regression: Generated Report File Lifecycle ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("generated report file lifecycle setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Generated Report File Lifecycle: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
