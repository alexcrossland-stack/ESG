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

interface FrameworkReadinessFixture {
  frameworkId: string;
  frameworkCode: string;
  frameworkName: string;
  requirementIds: {
    covered: string;
    partial: string;
    missing: string;
  };
  siteId: string;
}

interface FrameworkMetricPeriodFixture {
  frameworkId: string;
  requirementId: string;
  metricDefinitionId: string;
  annualPeriod: string;
}

async function createFrameworkMetricPeriodFixture(
  companyId: string,
  suffix: string,
): Promise<FrameworkMetricPeriodFixture> {
  return withDb(async (client) => {
    const annualPeriod = "2097";
    const framework = await client.query<{ id: string }>(
      `INSERT INTO frameworks (code, name, full_name, description, version, is_active)
       VALUES ($1, $2, $2, 'Framework metric period coverage contract', '1.0', true)
       RETURNING id`,
      [`PERIOD-COVERAGE-${suffix}`, `Period Coverage Contract ${suffix}`],
    );
    const requirement = await client.query<{ id: string }>(
      `INSERT INTO framework_requirements
         (framework_id, code, title, description, requirement_type, pillar, mandatory_level, sort_order)
       VALUES ($1, $2, 'Full-period energy fact', 'Requires a fact for the complete reporting period', 'metric', 'environmental', 'core', 1)
       RETURNING id`,
      [framework.rows[0].id, `PERIOD-COVERAGE-REQ-${suffix}`],
    );
    const definition = await client.query<{ id: string }>(
      `INSERT INTO metric_definitions
         (code, name, pillar, category, data_type, unit, input_frequency, is_core, is_active, evidence_required, rollup_method)
       VALUES ($1, $2, 'environmental', 'energy', 'numeric', 'kWh', 'monthly', true, true, false, 'sum')
       RETURNING id`,
      [`PERIOD-COVERAGE-METRIC-${suffix}`, `Period Coverage Metric ${suffix}`],
    );
    await client.query(
      `INSERT INTO metric_framework_mappings (metric_definition_id, framework_requirement_id, mapping_strength)
       VALUES ($1, $2, 'direct')`,
      [definition.rows[0].id, requirement.rows[0].id],
    );
    await client.query(
      `INSERT INTO business_framework_selections (business_id, framework_id, is_enabled)
       VALUES ($1, $2, true)`,
      [companyId, framework.rows[0].id],
    );
    await client.query(
      `INSERT INTO metric_definition_values
         (business_id, metric_definition_id, reporting_period_start, reporting_period_end, value_numeric, source_type, status)
       VALUES ($1, $2, TIMESTAMP '2097-01-01', TIMESTAMP '2097-01-31', 100, 'manual', 'approved')`,
      [companyId, definition.rows[0].id],
    );
    return {
      frameworkId: framework.rows[0].id,
      requirementId: requirement.rows[0].id,
      metricDefinitionId: definition.rows[0].id,
      annualPeriod,
    };
  });
}

async function deleteFrameworkMetricPeriodFixture(fixture: FrameworkMetricPeriodFixture): Promise<void> {
  await withDb(async (client) => {
    await client.query("DELETE FROM metric_definition_values WHERE metric_definition_id = $1", [fixture.metricDefinitionId]);
    await client.query("DELETE FROM business_framework_selections WHERE framework_id = $1", [fixture.frameworkId]);
    await client.query("DELETE FROM metric_framework_mappings WHERE framework_requirement_id = $1", [fixture.requirementId]);
    await client.query("DELETE FROM framework_requirements WHERE id = $1", [fixture.requirementId]);
    await client.query("DELETE FROM metric_definitions WHERE id = $1", [fixture.metricDefinitionId]);
    await client.query("DELETE FROM frameworks WHERE id = $1", [fixture.frameworkId]);
  });
}

async function createFrameworkReadinessFixture(
  companyId: string,
  suffix: string,
  period: string,
): Promise<FrameworkReadinessFixture> {
  return withDb(async (client) => {
    await client.query("BEGIN");
    try {
      const frameworkCode = `EXPORT-READINESS-${suffix}`;
      const frameworkName = `Export Readiness Contract ${suffix}`;
      const framework = await client.query<{ id: string }>(
        `INSERT INTO frameworks (code, name, full_name, description, version, is_active)
         VALUES ($1, $2, $2, 'Framework export shape and scope contract', '1.0', true)
         RETURNING id`,
        [frameworkCode, frameworkName],
      );
      const frameworkId = framework.rows[0].id;

      const requirementIds = {} as FrameworkReadinessFixture["requirementIds"];
      for (const [index, status] of ["covered", "partial", "missing"].entries()) {
        const requirement = await client.query<{ id: string }>(
          `INSERT INTO framework_requirements
             (framework_id, code, title, description, requirement_type, pillar, mandatory_level, sort_order)
           VALUES ($1, $2, $3, $3, 'evidence', 'governance', 'core', $4)
           RETURNING id`,
          [frameworkId, `${frameworkCode}-${status.toUpperCase()}`, `${status[0].toUpperCase()}${status.slice(1)} export requirement`, index],
        );
        requirementIds[status as keyof typeof requirementIds] = requirement.rows[0].id;
      }

      await client.query(
        "INSERT INTO business_framework_selections (business_id, framework_id, is_enabled) VALUES ($1, $2, true)",
        [companyId, frameworkId],
      );

      const site = await client.query<{ id: string }>(
        `INSERT INTO organisation_sites (company_id, name, slug, type, status)
         VALUES ($1, $2, $3, 'office', 'active')
         RETURNING id`,
        [companyId, `Readiness Other Site ${suffix}`, `readiness-other-site-${suffix}`],
      );
      const siteId = site.rows[0].id;

      await client.query(
        `INSERT INTO evidence_files
           (company_id, filename, linked_module, linked_entity_id, linked_period, evidence_status, site_id, uploaded_at)
         VALUES
           ($1, $2, 'framework_requirement', $3, $4, 'approved', NULL, NOW()),
           ($1, $5, 'framework_requirement', $6, $4, 'uploaded', NULL, NOW()),
           ($1, $7, 'framework_requirement', $6, $8, 'approved', NULL, NOW()),
           ($1, $9, 'framework_requirement', $10, $4, 'approved', $11, NOW())`,
        [
          companyId,
          `covered-${suffix}.txt`,
          requirementIds.covered,
          period,
          `partial-${suffix}.txt`,
          requirementIds.partial,
          `wrong-period-${suffix}.txt`,
          "2098-11",
          `wrong-site-${suffix}.txt`,
          requirementIds.missing,
          siteId,
        ],
      );

      await client.query("COMMIT");
      return { frameworkId, frameworkCode, frameworkName, requirementIds, siteId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function deleteTestFramework(frameworkId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query("DELETE FROM business_framework_selections WHERE framework_id = $1", [frameworkId]);
    await client.query("DELETE FROM frameworks WHERE id = $1", [frameworkId]);
  });
}

async function deleteFrameworkReadinessFixture(fixture: FrameworkReadinessFixture): Promise<void> {
  await withDb(async (client) => {
    const requirementIds = Object.values(fixture.requirementIds);
    await client.query("DELETE FROM evidence_files WHERE linked_entity_id = ANY($1::varchar[])", [requirementIds]);
    await client.query("DELETE FROM business_framework_selections WHERE framework_id = $1", [fixture.frameworkId]);
    await client.query("DELETE FROM framework_requirements WHERE framework_id = $1", [fixture.frameworkId]);
    await client.query("DELETE FROM organisation_sites WHERE id = $1", [fixture.siteId]);
    await client.query("DELETE FROM frameworks WHERE id = $1", [fixture.frameworkId]);
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

async function exportFrameworkReport(
  token: string,
  format: "pdf" | "docx",
  body: Record<string, unknown>,
) {
  return apiRequestRaw(
    "POST",
    "/api/reports/export/framework_readiness_summary",
    { format, ...body },
    token,
  );
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
  const readinessFixture = await createFrameworkReadinessFixture(tenantA.companyId, suffix, period);
  const metricPeriodFixture = await createFrameworkMetricPeriodFixture(tenantA.companyId, suffix);

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
    const res = await exportData(tenantA.adminToken, "framework_readiness_summary", { period, siteId: "null", format: "json" });
    const body = parseJson<{
      frameworkReadiness?: Array<{
        framework: { id: string; name: string };
        summary: { covered: number; partial: number; missing: number; total: number };
        requirements: Array<{ id: string; status: string }>;
        scope: { period: string | null; siteMode: string; siteId: string | null };
      }>;
      selectedFrameworks?: Array<{ id: string; name: string }>;
      scope?: { period: string | null; siteMode: string; siteId: string | null };
    }>(
      res,
      "GET /api/reports/export-data/framework_readiness_summary",
    );
    const fixtureGroup = (body.frameworkReadiness ?? []).find((group) => group.framework.id === readinessFixture.frameworkId);
    assert(fixtureGroup, "storage-shaped readiness group missing from framework export-data");
    assert(fixtureGroup.scope.period === period, `framework group period mismatch ${fixtureGroup.scope.period}`);
    assert(fixtureGroup.scope.siteMode === "organisation" && fixtureGroup.scope.siteId === null, `framework group site scope mismatch ${JSON.stringify(fixtureGroup.scope)}`);
    assert(
      JSON.stringify(fixtureGroup.summary) === JSON.stringify({
        covered: 1,
        partial: 1,
        missing: 1,
        total: 3,
        responseFacts: 0,
        approvedResponseFacts: 0,
        evidenceFacts: 2,
        approvedEvidenceFacts: 1,
      }),
      `framework summary did not preserve covered/partial/missing contract: ${JSON.stringify(fixtureGroup.summary)}`,
    );
    const statusByRequirementId = new Map(fixtureGroup.requirements.map((requirement) => [requirement.id, requirement.status]));
    assert(statusByRequirementId.get(readinessFixture.requirementIds.covered) === "covered", "approved in-period organisation evidence was not covered");
    assert(statusByRequirementId.get(readinessFixture.requirementIds.partial) === "partial", "unreviewed in-period organisation evidence was not partial");
    assert(statusByRequirementId.get(readinessFixture.requirementIds.missing) === "missing", "other-site evidence leaked into organisation readiness");
    assert(body.scope?.period === period && body.scope?.siteMode === "organisation" && body.scope?.siteId === null, `top-level export scope mismatch ${JSON.stringify(body.scope)}`);
    assert(!(body.selectedFrameworks ?? []).some((framework) => framework.id === tenantBFramework.id || framework.name === tenantBFramework.name), "Tenant B selected framework leaked into Tenant A export-data");
    expectExcludes(JSON.stringify(body), tenantB.companyId);
  });

  await check("framework exports accept a saved fiscal period and display its name", async () => {
    const fiscalName = `FY 2099/2100 ${suffix}`;
    const reportingPeriodId = await withDb(async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date, status)
         VALUES ($1, $2, 'annual', TIMESTAMP '2099-04-01', TIMESTAMP '2100-03-31', 'open')
         RETURNING id`,
        [tenantA.companyId, fiscalName],
      );
      return created.rows[0].id;
    });
    try {
      const json = await exportData(tenantA.adminToken, "framework_readiness_summary", {
        period: reportingPeriodId,
        siteId: "null",
        format: "json",
      });
      const body = parseJson<{
        period?: string;
        scope?: { period?: string | null };
        frameworkReadiness?: Array<{ scope?: { period?: string | null } }>;
      }>(json, "GET framework readiness for saved fiscal period");
      assert(body.period === fiscalName, `top-level period exposed opaque id instead of name: ${body.period}`);
      assert(body.scope?.period === fiscalName, `scope period mismatch ${body.scope?.period}`);
      assert(
        (body.frameworkReadiness ?? []).every((framework) => framework.scope?.period === fiscalName),
        "framework groups did not resolve the saved fiscal period name",
      );

      const pdf = await exportFrameworkReport(tenantA.adminToken, "pdf", {
        period: reportingPeriodId,
        siteId: "__org__",
      });
      expectStatus(pdf, 200, "POST framework readiness PDF for saved fiscal period");
      const pdfText = extractPdfText(pdf.body);
      expectIncludes(pdfText, fiscalName);
      expectExcludes(pdfText, reportingPeriodId);
    } finally {
      await withDb((client) => client.query("DELETE FROM reporting_periods WHERE id = $1", [reportingPeriodId]));
    }
  });

  await check("legacy framework status is period-scoped and never aggregates all periods", async () => {
    const scoped = await apiRequest(
      "GET",
      `/api/compliance/status?period=${encodeURIComponent(period)}&siteId=__org__`,
      undefined,
      tenantA.adminToken,
    );
    const scopedBody = parseJson<Array<{ id: string; scope?: { period?: string | null; siteMode?: string } }>>(
      scoped,
      "GET /api/compliance/status with period",
    );
    const fixture = scopedBody.find((framework) => framework.id === readinessFixture.frameworkId);
    assert(fixture, "period-scoped compliance status omitted the selected readiness fixture");
    assert(fixture.scope?.period === period, `legacy readiness period mismatch ${fixture.scope?.period}`);
    assert(fixture.scope?.siteMode === "organisation", `legacy readiness site scope mismatch ${JSON.stringify(fixture.scope)}`);

    const defaulted = await apiRequest("GET", "/api/compliance/status", undefined, tenantA.adminToken);
    const defaultedBody = parseJson<Array<{ scope?: { period?: string | null } }>>(
      defaulted,
      "GET /api/compliance/status with canonical default",
    );
    assert(defaultedBody.length > 0, "default compliance status returned no selected framework");
    assert(
      defaultedBody.every((framework) => Boolean(framework.scope?.period) && framework.scope?.period !== "all"),
      `default compliance status was not period-scoped: ${JSON.stringify(defaultedBody.map((framework) => framework.scope))}`,
    );
  });

  await check("framework PDF and DOCX exports use scoped storage readiness and the approval methodology", async () => {
    const pdf = await exportFrameworkReport(tenantA.adminToken, "pdf", { period, siteId: "__org__" });
    expectStatus(pdf, 200, "POST framework readiness PDF");
    assert((pdf.headers.get("content-type") || "").includes("application/pdf"), `unexpected framework PDF content-type ${pdf.headers.get("content-type")}`);
    const pdfText = extractPdfText(pdf.body);
    expectIncludes(pdfText, readinessFixture.frameworkName);
    expectIncludes(pdfText, "Strict Readiness");
    expectIncludes(pdfText, "33%");
    expectIncludes(pdfText, "Partial export requirement");
    expectIncludes(pdfText, "Missing export requirement");
    expectIncludes(pdfText, period);
    expectIncludes(pdfText, "Organisation-wide records only");
    expectIncludes(pdfText, "approved requirement response");
    expectIncludes(pdfText, "reviewed or approved requirement-linked evidence");

    const docx = await exportFrameworkReport(tenantA.adminToken, "docx", { period, siteId: "__org__" });
    expectStatus(docx, 200, "POST framework readiness DOCX");
    assert(
      (docx.headers.get("content-type") || "").includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      `unexpected framework DOCX content-type ${docx.headers.get("content-type")}`,
    );
    assert(docx.body.length > 1_000 && docx.body.subarray(0, 2).toString("ascii") === "PK", "framework DOCX was not a valid non-empty OpenXML package");
  });

  await check("a monthly canonical fact cannot cover an annual framework requirement", async () => {
    const readRequirement = async () => {
      const response = await exportData(tenantA.adminToken, "framework_readiness_summary", {
        period: metricPeriodFixture.annualPeriod,
        siteId: "null",
        format: "json",
      });
      const body = parseJson<{ frameworkReadiness?: Array<{ framework: { id: string }; requirements: Array<{ id: string; status: string; factSummary?: { subperiodValues?: number } }> }> }>(
        response,
        "GET annual framework readiness with canonical metric fact",
      );
      const framework = body.frameworkReadiness?.find((item) => item.framework.id === metricPeriodFixture.frameworkId);
      const requirement = framework?.requirements.find((item) => item.id === metricPeriodFixture.requirementId);
      assert(requirement, "period coverage requirement missing from readiness export");
      return requirement;
    };

    const subperiodOnly = await readRequirement();
    assert(subperiodOnly.status === "partial", `monthly fact incorrectly produced annual status ${subperiodOnly.status}`);
    assert(subperiodOnly.factSummary?.subperiodValues === 1, `expected one explicit sub-period fact, got ${JSON.stringify(subperiodOnly.factSummary)}`);

    await withDb((client) => client.query(
      `INSERT INTO metric_definition_values
         (business_id, metric_definition_id, reporting_period_start, reporting_period_end, value_numeric, source_type, status)
       VALUES ($1, $2, TIMESTAMP '2097-01-01', TIMESTAMP '2097-12-31', 1200, 'manual', 'approved')`,
      [tenantA.companyId, metricPeriodFixture.metricDefinitionId],
    ));

    const fullPeriod = await readRequirement();
    assert(fullPeriod.status === "covered", `full annual fact did not produce covered status ${fullPeriod.status}`);
  });

  await check("framework JSON, PDF, and DOCX exports reject unsupported date-range scope", async () => {
    const dateRange = { dateFrom: "2099-11-01", dateTo: "2099-11-30" };
    const json = await exportData(tenantA.adminToken, "framework_readiness_summary", {
      ...dateRange,
      siteId: "null",
      format: "json",
    });
    expectStatus(json, 400, "GET framework readiness JSON with date range");
    assert(JSON.parse(json.body).code === "FRAMEWORK_PERIOD_REQUIRED", `unexpected framework JSON error ${json.body}`);

    for (const format of ["pdf", "docx"] as const) {
      const response = await exportFrameworkReport(tenantA.adminToken, format, {
        ...dateRange,
        siteId: "__org__",
      });
      expectStatus(response, 400, `POST framework readiness ${format.toUpperCase()} with date range`);
      const body = JSON.parse(response.body.toString("utf8"));
      assert(body.code === "FRAMEWORK_PERIOD_REQUIRED", `unexpected framework ${format} error ${JSON.stringify(body)}`);
    }
  });

  await check("framework JSON, PDF, and DOCX exports reject missing or all-period scope", async () => {
    for (const invalidPeriod of [undefined, "all"] as const) {
      const params: Record<string, string> = { siteId: "null", format: "json" };
      if (invalidPeriod !== undefined) params.period = invalidPeriod;
      const json = await exportData(tenantA.adminToken, "framework_readiness_summary", params);
      expectStatus(json, 400, `GET framework readiness JSON with period ${invalidPeriod ?? "missing"}`);
      assert(JSON.parse(json.body).code === "FRAMEWORK_PERIOD_REQUIRED", `unexpected framework JSON error ${json.body}`);

      for (const format of ["pdf", "docx"] as const) {
        const body: Record<string, unknown> = { siteId: "__org__" };
        if (invalidPeriod !== undefined) body.period = invalidPeriod;
        const response = await exportFrameworkReport(tenantA.adminToken, format, body);
        expectStatus(response, 400, `POST framework readiness ${format.toUpperCase()} with period ${invalidPeriod ?? "missing"}`);
        const errorBody = JSON.parse(response.body.toString("utf8"));
        assert(errorBody.code === "FRAMEWORK_PERIOD_REQUIRED", `unexpected framework ${format} error ${JSON.stringify(errorBody)}`);
      }
    }
  });

  await check("PDF export text is tenant-scoped and excludes disabled or cross-tenant content", async () => {
    const text = await exportPdf(tenantA.adminToken, { period, siteId: "__org__" });
    expectIncludes(text, tenantACompanyName);
    expectIncludes(text, "Trend Summary");
    expectIncludes(text, "Compared with previous month");
    expectIncludes(text, "Trend Notes");
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

  // Frameworks are a global catalogue. Remove this synthetic sentinel so a
  // completed test cannot pollute another tenant's Framework Settings UI.
  await deleteFrameworkReadinessFixture(readinessFixture);
  await deleteFrameworkMetricPeriodFixture(metricPeriodFixture);
  await deleteTestFramework(tenantBFramework.id);
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
