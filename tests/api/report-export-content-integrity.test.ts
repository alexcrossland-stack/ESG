/**
 * API regression: report export content integrity
 *
 * Covers exported PDF/JSON content scope, disabled/inaccessible data exclusion,
 * and export format rejection consistency.
 *
 * Run: npx tsx tests/api/report-export-content-integrity.test.ts
 */

import { inflateSync } from "zlib";
import { Client } from "pg";
import { apiMultipartRequest, apiRequest, apiRequestRaw, seedTestTenants } from "../fixtures/seed.js";
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

async function prepareTenant(companyId: string) {
  await withDb(async (client) => {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
    await client.query("UPDATE metrics SET enabled = false WHERE company_id = $1", [companyId]);
  });
}

async function getCompanyName(companyId: string): Promise<string> {
  return withDb(async (client) => {
    const res = await client.query<{ name: string }>("SELECT name FROM companies WHERE id = $1", [companyId]);
    const name = res.rows[0]?.name;
    assert(name, `company not found ${companyId}`);
    return name;
  });
}

async function createMetric(token: string, name: string, unit = "kWh"): Promise<string> {
  const res = await apiRequest("POST", "/api/metrics", {
    name,
    category: "environmental",
    unit,
    enabled: true,
    metricType: "manual",
    direction: "higher_is_better",
    displayOrder: 9900,
  }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/metrics");
  assert(body.id, "metric id missing");
  return body.id;
}

async function saveMetricValue(opts: {
  token: string;
  metricId: string;
  period: string;
  value: number;
  siteId: string | null;
}) {
  const res = await apiRequest("POST", "/api/data-entry", {
    metricId: opts.metricId,
    period: opts.period,
    value: opts.value,
    notes: `report export content integrity ${opts.value}`,
    dataSourceType: "manual",
    siteId: opts.siteId,
  }, opts.token);
  parseJson(res, "POST /api/data-entry");
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
  form.append("notes", `report export content evidence ${opts.filename}`);
  form.append("dataSourceType", "manual");
  form.append("siteId", opts.siteId ?? "__org__");
  form.append("attachments", new Blob([`evidence for ${opts.filename}`], { type: "text/plain" }), opts.filename);
  const res = await apiMultipartRequest("POST", "/api/data-entry", form, opts.token);
  const body = parseJson<{ newlyCreatedAttachments?: Array<{ id?: string }> }>(res, "POST /api/data-entry multipart");
  const id = body.newlyCreatedAttachments?.[0]?.id;
  assert(id, "created evidence id missing");
  return id;
}

async function disableMetric(metricId: string) {
  await withDb(async (client) => {
    await client.query("UPDATE metrics SET enabled = false WHERE id = $1", [metricId]);
  });
}

async function createTenantBOnlyFramework(companyId: string, suffix: string): Promise<{ id: string; name: string }> {
  return withDb(async (client) => {
    const framework = await client.query<{ id: string; name: string }>(
      `INSERT INTO frameworks (code, name, full_name, description, version, is_active)
       VALUES ($1, $2, $2, 'Tenant B only framework for export content integrity', '1.0', true)
       RETURNING id, name`,
      [`TB-CONTENT-${suffix}`, `Tenant B Private Framework ${suffix}`],
    );
    const id = framework.rows[0].id;
    await client.query(
      "INSERT INTO business_framework_selections (business_id, framework_id, is_enabled) VALUES ($1, $2, true)",
      [companyId, id],
    );
    return framework.rows[0];
  });
}

async function insertGeneratedFile(input: {
  reportRunId: string;
  companyId: string;
  filename: string;
  fileType: "pdf" | "docx";
  content: string;
  expiresAtSql?: string;
}): Promise<string> {
  return withDb(async (client) => {
    const fileBuffer = Buffer.from(input.content, "utf8");
    const fileData = fileBuffer.toString("base64");
    const res = await client.query<{ id: string }>(
      `INSERT INTO generated_files (report_run_id, company_id, file_type, filename, file_data, file_size, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${input.expiresAtSql ?? "NULL"})
       RETURNING id`,
      [input.reportRunId, input.companyId, input.fileType, input.filename, fileData, fileBuffer.length],
    );
    return res.rows[0].id;
  });
}

async function exportData(token: string, reportType: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  return apiRequest("GET", `/api/reports/export-data/${reportType}?${qs.toString()}`, undefined, token);
}

async function exportPdf(token: string, body: Record<string, unknown>): Promise<string> {
  const res = await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", { format: "pdf", ...body }, token);
  const contentType = res.headers.get("content-type") || "";
  expectStatus(res, 200, "POST /api/reports/export/esg_metrics_summary PDF");
  assert(contentType.includes("application/pdf"), `unexpected PDF content-type ${contentType}`);
  return extractPdfText(res.body);
}

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const pieces: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(streamPattern)) {
    let stream = Buffer.from(match[1], "latin1");
    try {
      stream = inflateSync(stream);
    } catch {
      // Some PDF streams may be uncompressed.
    }
    const content = stream.toString("latin1");
    for (const hex of content.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
      const normalized = hex[1].replace(/\s+/g, "");
      if (!normalized || normalized.length % 2 !== 0) continue;
      pieces.push(Buffer.from(normalized, "hex").toString("utf8"));
    }
    for (const literal of content.matchAll(/\(([^()]*)\)/g)) {
      pieces.push(literal[1].replace(/\\([\\()])/g, "$1"));
    }
  }
  return pieces.join("").replace(/\s+/g, " ").trim();
}

function expectIncludes(text: string, expected: string) {
  assert(text.includes(expected), `expected content to include "${expected}". Excerpt: ${text.slice(0, 1200)}`);
}

function expectExcludes(text: string, unexpected: string) {
  assert(!text.includes(unexpected), `expected content to exclude "${unexpected}". Excerpt: ${text.slice(0, 1200)}`);
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-11";
  const tenantACompanyName = await getCompanyName(tenantA.companyId);
  const tenantBCompanyName = await getCompanyName(tenantB.companyId);
  const tenantAMetricName = `Tenant A Export Content Metric ${suffix}`;
  const disabledMetricName = `Tenant A Disabled Export Metric ${suffix}`;
  const tenantBMetricName = `Tenant B Export Content Sentinel ${suffix}`;
  const tenantAEvidenceName = `tenant-a-export-content-${suffix}.txt`;
  const tenantBEvidenceName = `tenant-b-secret-evidence-${suffix}.txt`;

  await prepareTenant(tenantA.companyId);
  await prepareTenant(tenantB.companyId);

  const tenantAMetricId = await createMetric(tenantA.adminToken, tenantAMetricName);
  const disabledMetricId = await createMetric(tenantA.adminToken, disabledMetricName, "m3");
  const tenantBMetricId = await createMetric(tenantB.adminToken, tenantBMetricName);

  await attachMetricEvidence({ token: tenantA.adminToken, metricId: tenantAMetricId, period, value: 12.34, siteId: null, filename: tenantAEvidenceName });
  await saveMetricValue({ token: tenantA.adminToken, metricId: disabledMetricId, period, value: 55.55, siteId: null });
  await disableMetric(disabledMetricId);
  await attachMetricEvidence({ token: tenantB.adminToken, metricId: tenantBMetricId, period, value: 9876.54, siteId: null, filename: tenantBEvidenceName });
  const tenantBFramework = await createTenantBOnlyFramework(tenantB.companyId, suffix);

  let tenantAReportId: string | null = null;

  await check("JSON export-data is tenant-scoped and excludes disabled metric values", async () => {
    const res = await exportData(tenantA.adminToken, "esg_metrics_summary", { period, siteId: "null", format: "json" });
    const body = parseJson<{
      metrics?: Array<{ id: string; name: string }>;
      values?: Array<{ metricId: string; value: string | null }>;
      period?: string;
    }>(res, "GET /api/reports/export-data/esg_metrics_summary");
    const serialized = JSON.stringify(body);
    assert(body.period === period, `period mismatch ${body.period}`);
    assert((body.metrics ?? []).some((metric) => metric.id === tenantAMetricId && metric.name === tenantAMetricName), "Tenant A active metric missing");
    assert((body.values ?? []).some((value) => value.metricId === tenantAMetricId && Number(value.value) === 12.34), "Tenant A active value missing");
    expectExcludes(serialized, disabledMetricId);
    expectExcludes(serialized, disabledMetricName);
    expectExcludes(serialized, "55.55");
    expectExcludes(serialized, tenantBMetricId);
    expectExcludes(serialized, tenantBMetricName);
    expectExcludes(serialized, "9876.54");
    expectExcludes(serialized, tenantB.companyId);
    expectExcludes(serialized, tenantBCompanyName);
    expectExcludes(serialized, tenantBEvidenceName);
  });

  await check("framework JSON export excludes another tenant's selected frameworks", async () => {
    const res = await exportData(tenantA.adminToken, "framework_readiness_summary", { period, format: "json" });
    const body = parseJson<{ selectedFrameworks?: Array<{ id: string; name: string }> }>(
      res,
      "GET /api/reports/export-data/framework_readiness_summary",
    );
    assert(!(body.selectedFrameworks ?? []).some((framework) => framework.id === tenantBFramework.id || framework.name === tenantBFramework.name), "Tenant B selected framework leaked into Tenant A export-data");
    expectExcludes(JSON.stringify(body), tenantB.companyId);
  });

  await check("PDF export text is tenant-scoped and excludes disabled or cross-tenant content", async () => {
    const text = await exportPdf(tenantA.adminToken, { period, siteId: "__org__" });
    expectIncludes(text, tenantACompanyName);
    expectIncludes(text, tenantAMetricName);
    expectIncludes(text, "12.34");
    expectIncludes(text, period);
    expectExcludes(text, disabledMetricName);
    expectExcludes(text, "55.55");
    expectExcludes(text, tenantBMetricName);
    expectExcludes(text, "9,876.54");
    expectExcludes(text, "9876.54");
    expectExcludes(text, tenantBCompanyName);
    expectExcludes(text, tenantB.adminEmail);
    expectExcludes(text, tenantBEvidenceName);
    expectExcludes(text, tenantBFramework.name);
  });

  await check("generated report JSON excludes another tenant's metrics, evidence, users, frameworks, and metadata", async () => {
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period,
      includeMetrics: true,
      includeEvidence: true,
      includeSummary: true,
      includeDataQualityAssessment: true,
    }, tenantA.adminToken);
    const body = parseJson<{ report?: { id?: string; companyId?: string }; data?: unknown }>(res, "POST /api/reports/generate");
    tenantAReportId = body.report?.id ?? null;
    assert(tenantAReportId, "generated report id missing");
    assert(body.report?.companyId === tenantA.companyId, `report companyId mismatch ${body.report?.companyId}`);
    const serialized = JSON.stringify(body.data ?? {});
    expectIncludes(serialized, tenantAMetricName);
    expectIncludes(serialized, "12.34");
    expectExcludes(serialized, disabledMetricName);
    expectExcludes(serialized, "55.55");
    expectExcludes(serialized, tenantBMetricName);
    expectExcludes(serialized, "9876.54");
    expectExcludes(serialized, tenantBEvidenceName);
    expectExcludes(serialized, tenantB.companyId);
    expectExcludes(serialized, tenantBCompanyName);
    expectExcludes(serialized, tenantB.adminEmail);
    expectExcludes(serialized, tenantBFramework.name);
  });

  await check("expired and mismatched generated files are excluded from report file surfaces", async () => {
    assert(tenantAReportId, "generated report id unavailable");
    const validFileRes = await apiRequest("POST", `/api/reports/${tenantAReportId}/generate-file`, { format: "pdf" }, tenantA.adminToken);
    const validFile = parseJson<{ fileId?: string; filename?: string }>(validFileRes, "POST /api/reports/:id/generate-file");
    assert(validFile.fileId && validFile.filename, "valid generated file metadata missing");

    const rogueFilename = `tenant-b-rogue-report-${suffix}.pdf`;
    const expiredFilename = `tenant-a-expired-report-${suffix}.pdf`;
    const rogueId = await insertGeneratedFile({
      reportRunId: tenantAReportId,
      companyId: tenantB.companyId,
      filename: rogueFilename,
      fileType: "pdf",
      content: `tenant b rogue report ${tenantBMetricName}`,
    });
    const expiredId = await insertGeneratedFile({
      reportRunId: tenantAReportId,
      companyId: tenantA.companyId,
      filename: expiredFilename,
      fileType: "pdf",
      content: `expired tenant a report ${disabledMetricName}`,
      expiresAtSql: "TIMESTAMP '2000-01-01 00:00:00'",
    });

    const filesRes = await apiRequest("GET", `/api/reports/${tenantAReportId}/files`, undefined, tenantA.adminToken);
    const files = parseJson<Array<{ id: string; filename: string }>>(filesRes, "GET /api/reports/:id/files");
    assert(files.some((file) => file.id === validFile.fileId), "valid generated file missing from file list");
    assert(!files.some((file) => file.id === rogueId || file.filename === rogueFilename), "cross-company generated file metadata leaked into file list");
    assert(!files.some((file) => file.id === expiredId || file.filename === expiredFilename), "expired generated file metadata leaked into file list");

    const reportListRes = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    const reports = parseJson<Array<{ id: string; latestFileId?: string | null; latestFilename?: string | null }>>(reportListRes, "GET /api/reports");
    const generatedReport = reports.find((report) => report.id === tenantAReportId);
    assert(generatedReport, "generated report missing from report list");
    assert(generatedReport.latestFileId === validFile.fileId, `latestFileId should ignore expired/inaccessible files, got ${generatedReport.latestFileId}`);
    assert(generatedReport.latestFilename === validFile.filename, `latestFilename should ignore expired/inaccessible files, got ${generatedReport.latestFilename}`);

    expectStatus(await apiRequest("GET", `/api/reports/${tenantAReportId}/download/${rogueId}`, undefined, tenantA.adminToken), 404, "download rogue generated file");
    expectStatus(await apiRequest("GET", `/api/reports/${tenantAReportId}/download/${expiredId}`, undefined, tenantA.adminToken), 404, "download expired generated file");
  });

  await check("unsupported formats are rejected consistently across report export endpoints", async () => {
    assert(tenantAReportId, "generated report id unavailable");
    for (const format of ["csv", "json", "xlsx"]) {
      const standalone = await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", { format, period, siteId: "__org__" }, tenantA.adminToken);
      expectStatus(standalone, 400, `standalone export unsupported ${format}`);

      const generatedFile = await apiRequest("POST", `/api/reports/${tenantAReportId}/generate-file`, { format }, tenantA.adminToken);
      expectStatus(generatedFile, 400, `generated-file unsupported ${format}`);
    }

    for (const format of ["csv", "pdf", "docx", "xlsx"]) {
      const jsonExport = await exportData(tenantA.adminToken, "esg_metrics_summary", { period, siteId: "null", format });
      expectStatus(jsonExport, 400, `export-data unsupported ${format}`);
    }
  });
}

(async () => {
  console.log("\n=== API Regression: Report Export Content Integrity ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("report export content integrity setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Report Export Content Integrity: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
