/**
 * API regression: report export integrity
 *
 * Covers period/scope/source-data integrity for standalone report exports and
 * export-data payloads.
 *
 * Run: npx tsx tests/api/report-export-integrity.test.ts
 */

import { inflateRawSync } from "zlib";
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

async function prepareTenantForDeterministicExports(companyId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
    await client.query("UPDATE metrics SET enabled = false WHERE company_id = $1", [companyId]);
  } finally {
    await client.end();
  }
}

async function createSite(token: string, name: string, country: string): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office", country }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/sites");
  assert(body.id, "site id missing");
  return body.id;
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
    notes: `report-export-integrity value ${opts.value}`,
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
  form.append("notes", `report-export-integrity evidence ${opts.filename}`);
  form.append("dataSourceType", "manual");
  form.append("siteId", opts.siteId ?? "__org__");
  form.append("attachments", new Blob([`evidence for ${opts.filename}`], { type: "text/plain" }), opts.filename);
  const res = await apiMultipartRequest("POST", "/api/data-entry", form, opts.token);
  const body = parseJson<{ newlyCreatedAttachments?: Array<{ id?: string }> }>(res, "POST /api/data-entry multipart");
  const id = body.newlyCreatedAttachments?.[0]?.id;
  assert(id, "created evidence id missing");
  return id;
}

async function getExportData(token: string, period: string, siteId: string | null | "__all__") {
  const qs = new URLSearchParams({ period, siteId: siteId === null ? "null" : siteId });
  const res = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?${qs.toString()}`, undefined, token);
  return parseJson<{
    period?: string;
    site?: { id?: string; name?: string } | null;
    values?: Array<{ metricId: string; value: string | null; siteId?: string | null }>;
  }>(res, "GET /api/reports/export-data/esg_metrics_summary");
}

async function getEvidenceCoverage(token: string, period: string, siteId?: string | null) {
  const qs = new URLSearchParams({ period });
  if (siteId !== undefined) qs.set("siteId", siteId ?? "null");
  const res = await apiRequest("GET", `/api/evidence/coverage?${qs.toString()}`, undefined, token);
  return parseJson<{ totalEvidence: number; byStatus?: { uploaded?: number } }>(res, "GET /api/evidence/coverage");
}

async function getReadiness(token: string, period: string, siteId: string | null | "__all__") {
  const qs = new URLSearchParams({ period, siteId: siteId === null ? "null" : siteId });
  const res = await apiRequest("GET", `/api/reports/readiness-detail?${qs.toString()}`, undefined, token);
  return parseJson<{
    scope?: string;
    scopeLabel?: string;
    filledMetrics?: number;
    evidenceCoveragePercent?: number;
    period?: string | null;
  }>(res, "GET /api/reports/readiness-detail");
}

async function exportDocx(token: string, body: Record<string, unknown>): Promise<string> {
  const res = await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", { format: "docx", ...body }, token);
  const contentType = res.headers.get("content-type") || "";
  const disposition = res.headers.get("content-disposition") || "";
  assert(res.status === 200, `DOCX export status=${res.status} body=${res.body.toString("utf8").slice(0, 500)}`);
  assert(contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), `unexpected DOCX content-type ${contentType}`);
  assert(disposition.includes("esg_metrics_summary_"), `unexpected DOCX disposition ${disposition}`);
  return docxText(res.body);
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

function valuesFor(values: Array<{ metricId: string; value: string | null; siteId?: string | null }>, metricId: string) {
  return values.filter((value) => value.metricId === metricId);
}

function numberSet(rows: Array<{ value: string | null }>) {
  return rows.map((row) => Number(row.value)).sort((a, b) => a - b);
}

function expectIncludes(text: string, expected: string) {
  assert(text.includes(expected), `expected exported DOCX to include "${expected}". Text excerpt: ${text.slice(0, 1200)}`);
}

function expectExcludes(text: string, unexpected: string) {
  assert(!text.includes(unexpected), `expected exported DOCX to exclude "${unexpected}". Text excerpt: ${text.slice(0, 1200)}`);
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-10";
  const siteAName = `Export Integrity Site A ${suffix}`;
  const siteBName = `Export Integrity Site B ${suffix}`;
  const primaryMetricName = `Export Integrity Energy ${suffix}`;
  const siteBOnlyMetricName = `Export Integrity Site B Only ${suffix}`;
  const tenantBMetricName = `Tenant B Export Leakage Sentinel ${suffix}`;

  await prepareTenantForDeterministicExports(tenantA.companyId);
  await prepareTenantForDeterministicExports(tenantB.companyId);

  const siteAId = await createSite(tenantA.adminToken, siteAName, "United Kingdom");
  const siteBId = await createSite(tenantA.adminToken, siteBName, "Ireland");
  const tenantBSiteId = await createSite(tenantB.adminToken, `Tenant B Export Site ${suffix}`, "France");
  const primaryMetricId = await createMetric(tenantA.adminToken, primaryMetricName);
  const siteBOnlyMetricId = await createMetric(tenantA.adminToken, siteBOnlyMetricName, "m3");
  const tenantBMetricId = await createMetric(tenantB.adminToken, tenantBMetricName);

  await attachMetricEvidence({
    token: tenantA.adminToken,
    metricId: primaryMetricId,
    period,
    value: 101.5,
    siteId: null,
    filename: `export-org-${suffix}.txt`,
  });
  await attachMetricEvidence({
    token: tenantA.adminToken,
    metricId: primaryMetricId,
    period,
    value: 202.25,
    siteId: siteAId,
    filename: `export-site-a-${suffix}.txt`,
  });
  await attachMetricEvidence({
    token: tenantA.adminToken,
    metricId: primaryMetricId,
    period,
    value: 303.75,
    siteId: siteBId,
    filename: `export-site-b-${suffix}.txt`,
  });
  await saveMetricValue({ token: tenantA.adminToken, metricId: siteBOnlyMetricId, period, value: 404.4, siteId: siteBId });
  await saveMetricValue({ token: tenantB.adminToken, metricId: tenantBMetricId, period, value: 9999.99, siteId: tenantBSiteId });

  await check("export-data isolates organisation-wide, Site A, Site B, and all-scope values", async () => {
    const org = await getExportData(tenantA.adminToken, period, null);
    const siteA = await getExportData(tenantA.adminToken, period, siteAId);
    const siteB = await getExportData(tenantA.adminToken, period, siteBId);
    const all = await getExportData(tenantA.adminToken, period, "__all__");

    assert(org.period === period && siteA.period === period && siteB.period === period && all.period === period, "export-data period mismatch");
    assert(siteA.site?.id === siteAId && siteA.site.name === siteAName, `Site A metadata mismatch: ${JSON.stringify(siteA.site)}`);
    assert(siteB.site?.id === siteBId && siteB.site.name === siteBName, `Site B metadata mismatch: ${JSON.stringify(siteB.site)}`);

    const orgPrimary = valuesFor(org.values ?? [], primaryMetricId);
    const siteAPrimary = valuesFor(siteA.values ?? [], primaryMetricId);
    const siteBPrimary = valuesFor(siteB.values ?? [], primaryMetricId);
    const siteBOnly = valuesFor(siteB.values ?? [], siteBOnlyMetricId);
    const allPrimary = valuesFor(all.values ?? [], primaryMetricId);
    const allSiteBOnly = valuesFor(all.values ?? [], siteBOnlyMetricId);

    assert(orgPrimary.length === 1 && (orgPrimary[0].siteId ?? null) === null && Number(orgPrimary[0].value) === 101.5, `unexpected org rows ${JSON.stringify(orgPrimary)}`);
    assert(siteAPrimary.length === 1 && siteAPrimary[0].siteId === siteAId && Number(siteAPrimary[0].value) === 202.25, `unexpected Site A rows ${JSON.stringify(siteAPrimary)}`);
    assert(siteBPrimary.length === 1 && siteBPrimary[0].siteId === siteBId && Number(siteBPrimary[0].value) === 303.75, `unexpected Site B rows ${JSON.stringify(siteBPrimary)}`);
    assert(siteBOnly.length === 1 && siteBOnly[0].siteId === siteBId && Number(siteBOnly[0].value) === 404.4, `unexpected Site B-only rows ${JSON.stringify(siteBOnly)}`);
    assert(numberSet(allPrimary).join(",") === "101.5,202.25,303.75", `unexpected all-scope primary rows ${JSON.stringify(allPrimary)}`);
    assert(allSiteBOnly.length === 1 && Number(allSiteBOnly[0].value) === 404.4, `unexpected all-scope Site B-only rows ${JSON.stringify(allSiteBOnly)}`);
    assert(!(all.values ?? []).some((row) => row.metricId === tenantBMetricId || Number(row.value) === 9999.99), "Tenant B value leaked into Tenant A export-data");
  });

  await check("evidence coverage and readiness summaries stay scoped", async () => {
    const orgCoverage = await getEvidenceCoverage(tenantA.adminToken, period, null);
    const siteACoverage = await getEvidenceCoverage(tenantA.adminToken, period, siteAId);
    const siteBCoverage = await getEvidenceCoverage(tenantA.adminToken, period, siteBId);
    const allCoverage = await getEvidenceCoverage(tenantA.adminToken, period);
    assert(orgCoverage.totalEvidence === 1, `expected org evidence total 1, got ${orgCoverage.totalEvidence}`);
    assert(siteACoverage.totalEvidence === 1, `expected Site A evidence total 1, got ${siteACoverage.totalEvidence}`);
    assert(siteBCoverage.totalEvidence === 1, `expected Site B evidence total 1, got ${siteBCoverage.totalEvidence}`);
    assert(allCoverage.totalEvidence === 3, `expected all-scope evidence total 3, got ${allCoverage.totalEvidence}`);

    const orgReadiness = await getReadiness(tenantA.adminToken, period, null);
    const siteAReadiness = await getReadiness(tenantA.adminToken, period, siteAId);
    const siteBReadiness = await getReadiness(tenantA.adminToken, period, siteBId);
    const allReadiness = await getReadiness(tenantA.adminToken, period, "__all__");
    assert(orgReadiness.scope === "organisation" && orgReadiness.scopeLabel?.includes("Organisation-wide"), `unexpected org readiness ${JSON.stringify(orgReadiness)}`);
    assert(siteAReadiness.scope === "site" && siteAReadiness.scopeLabel?.includes(siteAName), `unexpected Site A readiness ${JSON.stringify(siteAReadiness)}`);
    assert(siteBReadiness.scope === "site" && siteBReadiness.scopeLabel?.includes(siteBName), `unexpected Site B readiness ${JSON.stringify(siteBReadiness)}`);
    assert(allReadiness.scope === "all" && allReadiness.scopeLabel?.includes("All scopes"), `unexpected all-scope readiness ${JSON.stringify(allReadiness)}`);
    assert(orgReadiness.filledMetrics === 1 && orgReadiness.evidenceCoveragePercent === 50, `unexpected org readiness counts ${JSON.stringify(orgReadiness)}`);
    assert(siteAReadiness.filledMetrics === 1 && siteAReadiness.evidenceCoveragePercent === 50, `unexpected Site A readiness counts ${JSON.stringify(siteAReadiness)}`);
    assert(siteBReadiness.filledMetrics === 2 && siteBReadiness.evidenceCoveragePercent === 50, `unexpected Site B readiness counts ${JSON.stringify(siteBReadiness)}`);
    assert(allReadiness.filledMetrics === 2 && allReadiness.evidenceCoveragePercent === 100, `unexpected all-scope readiness counts ${JSON.stringify(allReadiness)}`);
  });

  await check("DOCX exports render correct reporting period, scope labels, values, precision, and evidence status", async () => {
    const orgText = await exportDocx(tenantA.adminToken, { period, siteId: "__org__" });
    expectIncludes(orgText, "ESG Metrics Summary");
    expectIncludes(orgText, `Reporting Period ${period}`);
    expectIncludes(orgText, "excludes site-specific metric entries");
    expectIncludes(orgText, primaryMetricName);
    expectIncludes(orgText, "101.50");
    expectIncludes(orgText, "Evidence Coverage 50%");
    expectExcludes(orgText, "202.25");
    expectExcludes(orgText, "303.75");
    expectExcludes(orgText, "404.40");
    expectExcludes(orgText, tenantBMetricName);
    expectExcludes(orgText, "9,999.99");

    const siteAText = await exportDocx(tenantA.adminToken, { period, siteId: siteAId });
    expectIncludes(siteAText, siteAName);
    expectIncludes(siteAText, "excludes organisation-wide and other-site metric entries");
    expectIncludes(siteAText, primaryMetricName);
    expectIncludes(siteAText, "202.25");
    expectIncludes(siteAText, "Evidence Coverage 50%");
    expectExcludes(siteAText, "101.50");
    expectExcludes(siteAText, "303.75");
    expectExcludes(siteAText, "404.40");
    expectExcludes(siteAText, tenantBMetricName);

    const siteBText = await exportDocx(tenantA.adminToken, { period, siteId: siteBId });
    expectIncludes(siteBText, siteBName);
    expectIncludes(siteBText, "303.75");
    expectIncludes(siteBText, "404.40");
    expectIncludes(siteBText, "Evidence Coverage 50%");
    expectExcludes(siteBText, "101.50");
    expectExcludes(siteBText, "202.25");
    expectExcludes(siteBText, tenantBMetricName);

    const allText = await exportDocx(tenantA.adminToken, { period, siteId: "__all__" });
    expectIncludes(allText, "all active sites and organisational-level metric entries");
    expectIncludes(allText, "607.50");
    expectIncludes(allText, "404.40");
    expectIncludes(allText, "Evidence Coverage 100%");
    expectExcludes(allText, "9,999.99");
    expectExcludes(allText, tenantBMetricName);
  });

  await check("cross-tenant report/export requests are rejected", async () => {
    const qs = new URLSearchParams({ period, siteId: tenantBSiteId });
    const exportData = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?${qs.toString()}`, undefined, tenantA.adminToken);
    assert([403, 404].includes(exportData.status), `expected cross-tenant export-data rejection, got ${exportData.status} body=${exportData.body.slice(0, 300)}`);

    const docx = await apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", {
      format: "docx",
      period,
      siteId: tenantBSiteId,
    }, tenantA.adminToken);
    assert([403, 404].includes(docx.status), `expected cross-tenant export rejection, got ${docx.status} body=${docx.body.toString("utf8").slice(0, 300)}`);
  });
}

async function main() {
  console.log("\n=== API Regression: Report Export Integrity ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("report export integrity setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Report export integrity: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
}

main();
