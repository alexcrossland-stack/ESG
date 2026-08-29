/**
 * API regression: report export and generated file content
 *
 * Covers binary file generation/download and standalone report exports.
 *
 * Run: npx tsx tests/api/report-export-file-content.test.ts
 */

import { inflateRawSync } from "zlib";
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
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 300)}`);
  return JSON.parse(res.body) as T;
}

async function setCompanyProPlan(companyId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
      [companyId],
    );
  } finally {
    await client.end();
  }
}

async function createSite(token: string, name: string): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office", country: "United Kingdom" }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/sites");
  assert(body.id, "site id missing");
  return body.id;
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
    notes: `report export file-content ${opts.value}`,
    dataSourceType: "manual",
    siteId: opts.siteId,
  }, opts.token);
  parseJson(res, "POST /api/data-entry");
}

function expectPdf(buffer: Buffer, context: string) {
  assert(buffer.length > 500, `${context} PDF is unexpectedly small: ${buffer.length} bytes`);
  assert(buffer.subarray(0, 5).toString("utf8") === "%PDF-", `${context} missing PDF header`);
  assert(buffer.subarray(-2048).toString("latin1").includes("%%EOF"), `${context} missing PDF EOF marker`);
  assert(!buffer.subarray(0, 80).toString("utf8").trimStart().startsWith("{"), `${context} returned JSON instead of PDF`);
}

function expectDocx(buffer: Buffer, context: string) {
  assert(buffer.length > 500, `${context} DOCX is unexpectedly small: ${buffer.length} bytes`);
  assert(buffer.subarray(0, 2).toString("utf8") === "PK", `${context} missing ZIP header`);
  assert(buffer.includes(Buffer.from("[Content_Types].xml")), `${context} missing DOCX content types entry`);
  assert(buffer.includes(Buffer.from("word/document.xml")), `${context} missing DOCX document entry`);
}

function getZipEntry(buffer: Buffer, entryName: string): Buffer {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  assert(eocdOffset >= 0, "ZIP end-of-central-directory not found");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < totalEntries; i++) {
    assert(buffer.readUInt32LE(centralOffset) === 0x02014b50, "invalid ZIP central directory header");
    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      assert(buffer.readUInt32LE(localHeaderOffset) === 0x04034b50, `invalid ZIP local header for ${entryName}`);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return inflateRawSync(compressed);
      throw new Error(`unsupported ZIP compression method ${compressionMethod} for ${entryName}`);
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function docxText(buffer: Buffer): string {
  const xml = getZipEntry(buffer, "word/document.xml").toString("utf8");
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function generateReport(token: string, period: string, siteId: string) {
  const res = await apiRequest("POST", "/api/reports/generate", {
    period,
    reportType: "pdf",
    reportTemplate: "management",
    includeMetrics: true,
    includePolicy: false,
    includeTopics: false,
    includeCarbon: false,
    includeActions: false,
    includeEvidence: true,
    siteId,
  }, token);
  const body = parseJson<{ report?: { id?: string; siteId?: string | null } }>(res, "POST /api/reports/generate");
  assert(body.report?.id, "generated report id missing");
  assert(body.report.siteId === siteId, `generated report siteId mismatch: ${body.report.siteId}`);
  return body.report.id;
}

async function generateReportFile(token: string, reportId: string, format: "pdf" | "docx") {
  const res = await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format }, token);
  return parseJson<{ fileId?: string; filename?: string; fileSize?: number; fileType?: string; downloadUrl?: string }>(
    res,
    `POST /api/reports/${reportId}/generate-file`,
  );
}

async function downloadGeneratedFile(token: string, reportId: string, fileId: string) {
  return apiRequestRaw("GET", `/api/reports/${reportId}/download/${fileId}`, undefined, token);
}

async function exportReport(token: string, body: object) {
  return apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", body, token);
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-09";
  const metricName = `Report Export Energy ${suffix}`;
  const siteName = `Report Export Site ${suffix}`;

  await setCompanyProPlan(tenantA.companyId);
  const siteId = await createSite(tenantA.adminToken, siteName);
  const metricId = await createMetric(tenantA.adminToken, metricName);
  await saveMetricValue({ token: tenantA.adminToken, metricId, period, value: 789.12, siteId });

  const reportId = await generateReport(tenantA.adminToken, period, siteId);
  let pdfFileId = "";
  let docxFileId = "";

  await check("generated report PDF metadata and download return a real PDF", async () => {
    const file = await generateReportFile(tenantA.adminToken, reportId, "pdf");
    assert(file.fileId, "PDF fileId missing");
    assert(file.fileType === "pdf", `expected fileType=pdf, got ${file.fileType}`);
    assert(file.filename?.endsWith(`_${period}.pdf`), `unexpected PDF filename ${file.filename}`);
    assert(file.downloadUrl === `/api/reports/${reportId}/download/${file.fileId}`, `unexpected PDF downloadUrl ${file.downloadUrl}`);
    pdfFileId = file.fileId;

    const download = await downloadGeneratedFile(tenantA.adminToken, reportId, pdfFileId);
    const contentType = download.headers.get("content-type") || "";
    const disposition = download.headers.get("content-disposition") || "";
    assert(download.status === 200, `PDF download status=${download.status} body=${download.body.toString("utf8").slice(0, 200)}`);
    assert(contentType.includes("application/pdf"), `unexpected PDF content-type ${contentType}`);
    assert(disposition.includes(".pdf"), `unexpected PDF disposition ${disposition}`);
    expectPdf(download.body, "generated report download");
    assert(file.fileSize === download.body.length, `PDF fileSize ${file.fileSize} does not match downloaded length ${download.body.length}`);
    return `${download.body.length} bytes`;
  });

  await check("generated report DOCX metadata and download return a real DOCX", async () => {
    const file = await generateReportFile(tenantA.adminToken, reportId, "docx");
    assert(file.fileId, "DOCX fileId missing");
    assert(file.fileType === "docx", `expected fileType=docx, got ${file.fileType}`);
    assert(file.filename?.endsWith(`_${period}.docx`), `unexpected DOCX filename ${file.filename}`);
    assert(file.downloadUrl === `/api/reports/${reportId}/download/${file.fileId}`, `unexpected DOCX downloadUrl ${file.downloadUrl}`);
    docxFileId = file.fileId;

    const download = await downloadGeneratedFile(tenantA.adminToken, reportId, docxFileId);
    const contentType = download.headers.get("content-type") || "";
    const disposition = download.headers.get("content-disposition") || "";
    assert(download.status === 200, `DOCX download status=${download.status} body=${download.body.toString("utf8").slice(0, 200)}`);
    assert(contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), `unexpected DOCX content-type ${contentType}`);
    assert(disposition.includes(".docx"), `unexpected DOCX disposition ${disposition}`);
    expectDocx(download.body, "generated report download");
    assert(file.fileSize === download.body.length, `DOCX fileSize ${file.fileSize} does not match downloaded length ${download.body.length}`);
    const text = docxText(download.body);
    assert(text.includes("Internal Management Report"), "generated DOCX missing report type text");
    assert(text.includes(period), `generated DOCX missing period ${period}`);
    return `${download.body.length} bytes`;
  });

  await check("generated report file listing contains both generated files with metadata", async () => {
    const files = parseJson<Array<{ id?: string; fileType?: string; fileSize?: number; filename?: string }>>(
      await apiRequest("GET", `/api/reports/${reportId}/files`, undefined, tenantA.adminToken),
      "GET /api/reports/:id/files",
    );
    const pdf = files.find((file) => file.id === pdfFileId);
    const docx = files.find((file) => file.id === docxFileId);
    assert(pdf?.fileType === "pdf" && Number(pdf.fileSize) > 500 && pdf.filename?.endsWith(".pdf"), `PDF file missing from listing: ${JSON.stringify(files)}`);
    assert(docx?.fileType === "docx" && Number(docx.fileSize) > 500 && docx.filename?.endsWith(".docx"), `DOCX file missing from listing: ${JSON.stringify(files)}`);
  });

  await check("generated report file endpoint rejects unsupported file format", async () => {
    const res = await apiRequest("POST", `/api/reports/${reportId}/generate-file`, { format: "csv" }, tenantA.adminToken);
    assert(res.status === 400, `expected 400 for unsupported format, got ${res.status} body=${res.body.slice(0, 200)}`);
  });

  await check("standalone metrics summary PDF export returns a real PDF with export headers", async () => {
    const res = await exportReport(tenantA.adminToken, { format: "pdf", period, siteId });
    const contentType = res.headers.get("content-type") || "";
    const disposition = res.headers.get("content-disposition") || "";
    assert(res.status === 200, `PDF export status=${res.status} body=${res.body.toString("utf8").slice(0, 200)}`);
    assert(contentType.includes("application/pdf"), `unexpected export PDF content-type ${contentType}`);
    assert(disposition.includes(`esg_metrics_summary_${period}.pdf`), `unexpected export PDF disposition ${disposition}`);
    expectPdf(res.body, "standalone metrics summary export");
    return `${res.body.length} bytes`;
  });

  await check("standalone metrics summary DOCX export includes metric, period, and site text", async () => {
    const res = await exportReport(tenantA.adminToken, { format: "docx", period, siteId });
    const contentType = res.headers.get("content-type") || "";
    const disposition = res.headers.get("content-disposition") || "";
    assert(res.status === 200, `DOCX export status=${res.status} body=${res.body.toString("utf8").slice(0, 200)}`);
    assert(contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), `unexpected export DOCX content-type ${contentType}`);
    assert(disposition.includes(`esg_metrics_summary_${period}.docx`), `unexpected export DOCX disposition ${disposition}`);
    expectDocx(res.body, "standalone metrics summary export");
    const text = docxText(res.body);
    assert(text.includes("ESG Metrics Summary"), "standalone DOCX missing report title");
    assert(text.includes(period), `standalone DOCX missing period ${period}`);
    assert(text.includes(siteName), `standalone DOCX missing site name ${siteName}`);
    assert(text.includes(metricName), `standalone DOCX missing metric name ${metricName}`);
    assert(text.includes("789.12") || text.includes("789.1"), "standalone DOCX missing metric value");
  });

  await check("standalone export rejects invalid report type", async () => {
    const res = await apiRequestRaw("POST", "/api/reports/export/not_a_report", { format: "pdf", period }, tenantA.adminToken);
    assert(res.status === 400, `expected 400 for invalid report type, got ${res.status}`);
    assert(res.body.toString("utf8").includes("Invalid report type"), `unexpected invalid report response ${res.body.toString("utf8").slice(0, 200)}`);
  });
}

async function main() {
  console.log("\n=== API Regression: Report Export File Content ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("report export file-content setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Report export file content: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
}

main();
