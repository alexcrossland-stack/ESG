/**
 * API regression: connected core ESG flow
 *
 * Covers setup -> site -> metric value -> evidence -> dashboard/profile/report.
 *
 * Run: npx tsx tests/api/connected-core-flow.test.ts
 */

import { apiMultipartRequest, apiRequest, seedTestTenants } from "../fixtures/seed.js";
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

async function createReportingPeriod(token: string, period: string): Promise<string> {
  const res = await apiRequest("POST", "/api/reporting-periods", {
    name: period,
    periodType: "monthly",
    startDate: `${period}-01`,
    endDate: `${period}-28`,
  }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/reporting-periods");
  assert(body.id, "reporting period id missing");
  return body.id;
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
    displayOrder: 9800,
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
    notes: `connected-flow value ${opts.value}`,
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
  form.append("notes", `connected-flow evidence ${opts.filename}`);
  form.append("dataSourceType", "manual");
  form.append("siteId", opts.siteId ?? "__org__");
  form.append("attachments", new Blob(["connected core flow evidence"], { type: "text/plain" }), opts.filename);
  const res = await apiMultipartRequest("POST", "/api/data-entry", form, opts.token);
  const body = parseJson<{ newlyCreatedAttachments?: Array<{ id?: string }> }>(res, "POST /api/data-entry multipart");
  const id = body.newlyCreatedAttachments?.[0]?.id;
  assert(id, "created evidence id missing");
  return id;
}

function dataEntryPath(period: string, siteId?: string | null) {
  const suffix = siteId === undefined ? "" : `?siteId=${encodeURIComponent(siteId ?? "null")}`;
  return `/api/data-entry/${encodeURIComponent(period)}${suffix}`;
}

async function getDataEntryValues(token: string, period: string, siteId?: string | null) {
  const res = await apiRequest("GET", dataEntryPath(period, siteId), undefined, token);
  return parseJson<{
    values?: Array<{
      id?: string;
      metricId: string;
      value: string | null;
      siteId?: string | null;
      attachments?: Array<{ id?: string; siteId?: string | null }>;
    }>;
  }>(res, "GET /api/data-entry/:period").values || [];
}

function valuesFor<T extends { metricId: string; value: string | null; siteId?: string | null }>(values: T[], metricId: string): T[] {
  return values.filter((row) => row.metricId === metricId);
}

async function getEvidence(token: string, period: string, siteId?: string | null) {
  const qs = new URLSearchParams({ period });
  if (siteId !== undefined) qs.set("siteId", siteId ?? "null");
  const res = await apiRequest("GET", `/api/evidence?${qs.toString()}`, undefined, token);
  return parseJson<Array<{ id?: string; metricId?: string | null; siteId?: string | null }>>(res, "GET /api/evidence");
}

async function getEvidenceCoverage(token: string, period: string, siteId?: string | null) {
  const qs = new URLSearchParams({ period });
  if (siteId !== undefined) qs.set("siteId", siteId ?? "null");
  const res = await apiRequest("GET", `/api/evidence/coverage?${qs.toString()}`, undefined, token);
  return parseJson<{ totalEvidence: number; metricCoverage?: Array<{ metricId?: string; hasEvidence?: boolean }> }>(
    res,
    "GET /api/evidence/coverage",
  );
}

async function getReportExportValues(token: string, period: string, siteId: string | null | "__all__") {
  const qs = new URLSearchParams({ period, siteId: siteId === null ? "null" : siteId });
  const res = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?${qs.toString()}`, undefined, token);
  return parseJson<{ values?: Array<{ metricId: string; value: string | null; siteId?: string | null }> }>(
    res,
    "GET /api/reports/export-data/esg_metrics_summary",
  ).values || [];
}

async function getReadiness(token: string, period: string, siteId: string | null | "__all__") {
  const qs = new URLSearchParams({ period, siteId: siteId === null ? "null" : siteId });
  const res = await apiRequest("GET", `/api/reports/readiness-detail?${qs.toString()}`, undefined, token);
  return parseJson<{
    scope?: string;
    scopeLabel?: string;
    filledMetrics?: number;
    period?: string | null;
    siteId?: string | null;
  }>(res, "GET /api/reports/readiness-detail");
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-08";

  const reportingPeriodId = await createReportingPeriod(tenantA.adminToken, period);
  const siteAId = await createSite(tenantA.adminToken, `Connected Flow Site A ${suffix}`, "United Kingdom");
  const siteBId = await createSite(tenantA.adminToken, `Connected Flow Site B ${suffix}`, "Ireland");
  const primaryMetricId = await createMetric(tenantA.adminToken, `Connected Flow Energy ${suffix}`);
  const siteBOnlyMetricId = await createMetric(tenantA.adminToken, `Connected Flow Site B Only ${suffix}`, "m3");

  await saveMetricValue({ token: tenantA.adminToken, metricId: primaryMetricId, period, value: 101, siteId: null });
  await saveMetricValue({ token: tenantA.adminToken, metricId: primaryMetricId, period, value: 202, siteId: siteAId });
  await saveMetricValue({ token: tenantA.adminToken, metricId: primaryMetricId, period, value: 303, siteId: siteBId });
  await saveMetricValue({ token: tenantA.adminToken, metricId: siteBOnlyMetricId, period, value: 404, siteId: siteBId });

  const orgEvidenceId = await attachMetricEvidence({
    token: tenantA.adminToken,
    metricId: primaryMetricId,
    period,
    value: 101,
    siteId: null,
    filename: `connected-org-${suffix}.txt`,
  });
  const siteAEvidenceId = await attachMetricEvidence({
    token: tenantA.adminToken,
    metricId: primaryMetricId,
    period,
    value: 202,
    siteId: siteAId,
    filename: `connected-site-a-${suffix}.txt`,
  });
  const siteBEvidenceId = await attachMetricEvidence({
    token: tenantA.adminToken,
    metricId: primaryMetricId,
    period,
    value: 303,
    siteId: siteBId,
    filename: `connected-site-b-${suffix}.txt`,
  });

  await check("Data Entry returns only Site A value and evidence in Site A scope", async () => {
    const rows = valuesFor(await getDataEntryValues(tenantA.adminToken, period, siteAId), primaryMetricId);
    assert(rows.length === 1, `expected 1 Site A row, got ${JSON.stringify(rows)}`);
    assert(rows[0].siteId === siteAId, `expected Site A siteId, got ${rows[0].siteId}`);
    assert(Number(rows[0].value) === 202, `expected Site A value 202, got ${rows[0].value}`);
    const attachmentIds = new Set(rows[0].attachments?.map((file) => file.id));
    assert(attachmentIds.has(siteAEvidenceId), "Site A evidence missing from Site A data-entry row");
    assert(!attachmentIds.has(siteBEvidenceId), "Site B evidence leaked into Site A data-entry row");
    assert(!attachmentIds.has(orgEvidenceId), "Organisation-wide evidence leaked into Site A data-entry row");
  });

  await check("Data Entry returns only Site B value and evidence in Site B scope", async () => {
    const rows = valuesFor(await getDataEntryValues(tenantA.adminToken, period, siteBId), primaryMetricId);
    assert(rows.length === 1, `expected 1 Site B row, got ${JSON.stringify(rows)}`);
    assert(rows[0].siteId === siteBId, `expected Site B siteId, got ${rows[0].siteId}`);
    assert(Number(rows[0].value) === 303, `expected Site B value 303, got ${rows[0].value}`);
    const attachmentIds = new Set(rows[0].attachments?.map((file) => file.id));
    assert(attachmentIds.has(siteBEvidenceId), "Site B evidence missing from Site B data-entry row");
    assert(!attachmentIds.has(siteAEvidenceId), "Site A evidence leaked into Site B data-entry row");
    assert(!attachmentIds.has(orgEvidenceId), "Organisation-wide evidence leaked into Site B data-entry row");
  });

  await check("Data Entry returns only Organisation-wide value in org-wide scope", async () => {
    const rows = valuesFor(await getDataEntryValues(tenantA.adminToken, period, null), primaryMetricId);
    assert(rows.length === 1, `expected 1 org-wide row, got ${JSON.stringify(rows)}`);
    assert((rows[0].siteId ?? null) === null, `expected null siteId, got ${rows[0].siteId}`);
    assert(Number(rows[0].value) === 101, `expected org-wide value 101, got ${rows[0].value}`);
    const attachmentIds = new Set(rows[0].attachments?.map((file) => file.id));
    assert(attachmentIds.has(orgEvidenceId), "Organisation-wide evidence missing from org-wide data-entry row");
    assert(!attachmentIds.has(siteAEvidenceId), "Site A evidence leaked into org-wide data-entry row");
    assert(!attachmentIds.has(siteBEvidenceId), "Site B evidence leaked into org-wide data-entry row");
  });

  await check("Data Entry all-scope read returns Organisation-wide, Site A, and Site B values", async () => {
    const rows = valuesFor(await getDataEntryValues(tenantA.adminToken, period), primaryMetricId);
    const scopeValues = new Map(rows.map((row) => [row.siteId ?? "__org__", Number(row.value)]));
    assert(scopeValues.get("__org__") === 101, `missing org-wide value in ${JSON.stringify(rows)}`);
    assert(scopeValues.get(siteAId) === 202, `missing Site A value in ${JSON.stringify(rows)}`);
    assert(scopeValues.get(siteBId) === 303, `missing Site B value in ${JSON.stringify(rows)}`);
  });

  await check("Evidence list and coverage are isolated by scope", async () => {
    const orgEvidence = await getEvidence(tenantA.adminToken, period, null);
    const siteAEvidence = await getEvidence(tenantA.adminToken, period, siteAId);
    const siteBEvidence = await getEvidence(tenantA.adminToken, period, siteBId);
    const allEvidence = await getEvidence(tenantA.adminToken, period);
    assert(orgEvidence.some((file) => file.id === orgEvidenceId), "org evidence missing from org scope");
    assert(!orgEvidence.some((file) => file.id === siteAEvidenceId || file.id === siteBEvidenceId), "site evidence leaked into org scope");
    assert(siteAEvidence.some((file) => file.id === siteAEvidenceId), "Site A evidence missing from Site A scope");
    assert(!siteAEvidence.some((file) => file.id === siteBEvidenceId || file.id === orgEvidenceId), "non-Site A evidence leaked into Site A scope");
    assert(siteBEvidence.some((file) => file.id === siteBEvidenceId), "Site B evidence missing from Site B scope");
    assert(!siteBEvidence.some((file) => file.id === siteAEvidenceId || file.id === orgEvidenceId), "non-Site B evidence leaked into Site B scope");
    for (const id of [orgEvidenceId, siteAEvidenceId, siteBEvidenceId]) {
      assert(allEvidence.some((file) => file.id === id), `all-scope evidence missing ${id}`);
    }

    const orgCoverage = await getEvidenceCoverage(tenantA.adminToken, period, null);
    const siteACoverage = await getEvidenceCoverage(tenantA.adminToken, period, siteAId);
    const siteBCoverage = await getEvidenceCoverage(tenantA.adminToken, period, siteBId);
    const allCoverage = await getEvidenceCoverage(tenantA.adminToken, period);
    assert(orgCoverage.totalEvidence === 1, `expected org coverage total=1, got ${orgCoverage.totalEvidence}`);
    assert(siteACoverage.totalEvidence === 1, `expected Site A coverage total=1, got ${siteACoverage.totalEvidence}`);
    assert(siteBCoverage.totalEvidence === 1, `expected Site B coverage total=1, got ${siteBCoverage.totalEvidence}`);
    assert(allCoverage.totalEvidence === 3, `expected all-scope coverage total=3, got ${allCoverage.totalEvidence}`);
    return `org=${orgCoverage.totalEvidence} siteA=${siteACoverage.totalEvidence} siteB=${siteBCoverage.totalEvidence} all=${allCoverage.totalEvidence}`;
  });

  await check("Dashboard enhanced data aggregates active site and org-wide values for selected period", async () => {
    const qs = new URLSearchParams({ reportingPeriodId });
    const dashboard = parseJson<{
      latestPeriod?: string;
      metricSummaries?: Array<{ id?: string; latestValue?: number | null; status?: string }>;
    }>(
      await apiRequest("GET", `/api/dashboard/enhanced?${qs.toString()}`, undefined, tenantA.adminToken),
      "GET /api/dashboard/enhanced",
    );
    const metric = dashboard.metricSummaries?.find((item) => item.id === primaryMetricId);
    assert(dashboard.latestPeriod === period, `expected dashboard period ${period}, got ${dashboard.latestPeriod}`);
    assert(metric, "primary metric missing from dashboard summaries");
    assert(metric.latestValue === 606, `expected aggregated dashboard value 606, got ${metric.latestValue}`);
    assert(metric.status && metric.status !== "missing", `expected submitted dashboard status, got ${metric.status}`);
  });

  await check("ESG Profile shows active reporting period and active metric values for that period", async () => {
    const profile = parseJson<{
      reporting_period?: { period?: string; source?: string; hasActivePeriod?: boolean };
      key_metrics?: Array<{ id?: string; name?: string; value?: string | null; period?: string | null; hasValue?: boolean }>;
    }>(
      await apiRequest("GET", "/api/company/esg-profile", undefined, tenantA.adminToken),
      "GET /api/company/esg-profile",
    );
    assert(profile.reporting_period?.period === period, `expected active profile period ${period}, got ${profile.reporting_period?.period}`);
    assert(profile.reporting_period?.source === "active", `expected active profile source, got ${profile.reporting_period?.source}`);
    assert(profile.reporting_period?.hasActivePeriod === true, "expected profile to report an active period");
    const primary = profile.key_metrics?.find((metric) => metric.id === primaryMetricId);
    const siteBOnly = profile.key_metrics?.find((metric) => metric.id === siteBOnlyMetricId);
    assert(primary, "primary active metric missing from ESG Profile");
    assert(siteBOnly, "Site B-only active metric missing from ESG Profile");
    assert(primary.period === period, `expected primary profile metric period ${period}, got ${primary.period}`);
    assert(siteBOnly.period === period, `expected secondary profile metric period ${period}, got ${siteBOnly.period}`);
    assert(/^\d+\.\d{2}$/.test(primary.value || ""), `expected two-decimal primary profile value, got ${primary.value}`);
    assert(/^\d+\.\d{2}$/.test(siteBOnly.value || ""), `expected two-decimal secondary profile value, got ${siteBOnly.value}`);
  });

  await check("Report readiness labels and counts stay scoped", async () => {
    const orgReadiness = await getReadiness(tenantA.adminToken, period, null);
    const siteAReadiness = await getReadiness(tenantA.adminToken, period, siteAId);
    const siteBReadiness = await getReadiness(tenantA.adminToken, period, siteBId);
    const allReadiness = await getReadiness(tenantA.adminToken, period, "__all__");
    assert(orgReadiness.scope === "organisation", `expected org scope, got ${orgReadiness.scope}`);
    assert(siteAReadiness.scope === "site", `expected Site A scope, got ${siteAReadiness.scope}`);
    assert(siteBReadiness.scope === "site", `expected Site B scope, got ${siteBReadiness.scope}`);
    assert(allReadiness.scope === "all", `expected all scope, got ${allReadiness.scope}`);
    assert(orgReadiness.filledMetrics === 1, `expected org filledMetrics=1, got ${orgReadiness.filledMetrics}`);
    assert(siteAReadiness.filledMetrics === 1, `expected Site A filledMetrics=1, got ${siteAReadiness.filledMetrics}`);
    assert(siteBReadiness.filledMetrics === 2, `expected Site B filledMetrics=2, got ${siteBReadiness.filledMetrics}`);
    assert(allReadiness.filledMetrics === 2, `expected all-scope filledMetrics=2, got ${allReadiness.filledMetrics}`);
    assert(orgReadiness.scopeLabel?.includes("Organisation-wide"), `unexpected org label ${orgReadiness.scopeLabel}`);
    assert(allReadiness.scopeLabel?.includes("All scopes"), `unexpected all-scope label ${allReadiness.scopeLabel}`);
  });

  await check("Report export-data isolates Site A, Site B, org-wide, and all-scope values", async () => {
    const orgValues = valuesFor(await getReportExportValues(tenantA.adminToken, period, null), primaryMetricId);
    const siteAValues = valuesFor(await getReportExportValues(tenantA.adminToken, period, siteAId), primaryMetricId);
    const siteBValues = valuesFor(await getReportExportValues(tenantA.adminToken, period, siteBId), primaryMetricId);
    const allPrimaryValues = valuesFor(await getReportExportValues(tenantA.adminToken, period, "__all__"), primaryMetricId);
    const allSecondaryValues = valuesFor(await getReportExportValues(tenantA.adminToken, period, "__all__"), siteBOnlyMetricId);
    assert(orgValues.length === 1 && (orgValues[0].siteId ?? null) === null && Number(orgValues[0].value) === 101, `unexpected org export rows ${JSON.stringify(orgValues)}`);
    assert(siteAValues.length === 1 && siteAValues[0].siteId === siteAId && Number(siteAValues[0].value) === 202, `unexpected Site A export rows ${JSON.stringify(siteAValues)}`);
    assert(siteBValues.length === 1 && siteBValues[0].siteId === siteBId && Number(siteBValues[0].value) === 303, `unexpected Site B export rows ${JSON.stringify(siteBValues)}`);
    assert(allPrimaryValues.length === 3, `expected 3 all-scope primary rows, got ${JSON.stringify(allPrimaryValues)}`);
    assert(allSecondaryValues.length === 1 && allSecondaryValues[0].siteId === siteBId, `expected Site B-only metric in all-scope export, got ${JSON.stringify(allSecondaryValues)}`);
  });
}

async function main() {
  console.log("\n=== API Regression: Connected Core ESG Flow ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("connected core flow setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Connected core ESG flow: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
}

main();
