/**
 * API tests: Site-scoped data entry/evidence isolation
 *
 * Covers:
 * - Site A / Site B / organisation-wide values for the same metric + period stay isolated
 * - Explicit scope is required for ambiguous write paths when active sites exist
 * - Evidence uploads and evidence coverage respect org/site/all-scope filters
 * - Site ownership checks prevent cross-tenant site IDs from being used
 *
 * Run: npx tsx tests/api/site-scoped-data.test.ts
 */

import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function createSite(token: string, name: string, country = "United Kingdom"): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office", country }, token);
  if (![200, 201].includes(res.status)) {
    throw new Error(`POST /api/sites failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  }
  const body = JSON.parse(res.body) as { id?: string };
  if (!body.id) throw new Error(`POST /api/sites missing id: ${res.body.slice(0, 200)}`);
  return body.id;
}

async function getMetricIds(token: string, count = 2): Promise<string[]> {
  const res = await apiRequest("GET", "/api/metrics", undefined, token);
  if (res.status !== 200) throw new Error(`GET /api/metrics failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  const metrics = JSON.parse(res.body) as Array<{ id?: string; name?: string }>;
  const ids = metrics.map((m) => m.id).filter(Boolean) as string[];
  if (ids.length === 0) throw new Error("No metric id available");
  return ids.slice(0, count);
}

async function saveMetricValue(token: string, metricId: string, period: string, value: number, siteId: string | null) {
  return apiRequest("POST", "/api/data-entry", {
    metricId,
    period,
    value,
    notes: `site-scope-test ${value}`,
    dataSourceType: "manual",
    siteId,
  }, token);
}

async function getDataEntry(token: string, period: string, siteId?: string | null) {
  const suffix = siteId === undefined ? "" : `?siteId=${encodeURIComponent(siteId ?? "null")}`;
  return apiRequest("GET", `/api/data-entry/${encodeURIComponent(period)}${suffix}`, undefined, token);
}

function parseDataEntryValues(res: { status: number; body: string }) {
  if (res.status !== 200) throw new Error(`GET data-entry status=${res.status} body=${res.body.slice(0, 200)}`);
  return (JSON.parse(res.body) as { values?: Array<{ metricId: string; value: string | null; siteId?: string | null; attachments?: Array<{ id?: string }> }> }).values || [];
}

function valuesFor(values: Array<{ metricId: string; value: string | null; siteId?: string | null }>, metricId: string) {
  return values.filter((row) => row.metricId === metricId);
}

async function uploadMetricRowEvidence(opts: {
  token: string;
  metricId: string;
  period: string;
  value: number;
  siteId: string | null;
  filename: string;
}) {
  const form = new FormData();
  form.append("metricId", opts.metricId);
  form.append("period", opts.period);
  form.append("value", String(opts.value));
  form.append("notes", "site-scoped metric-row evidence");
  form.append("dataSourceType", "manual");
  form.append("siteId", opts.siteId ?? "__org__");
  form.append("attachments", new Blob(["site scoped evidence"], { type: "text/plain" }), opts.filename);
  return apiMultipartRequest("POST", "/api/data-entry", form, opts.token);
}

async function apiMultipartRequest(
  method: string,
  path: string,
  body: FormData,
  token?: string,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(new URL(path, BASE_URL), { method, headers, body });
  return { status: res.status, body: await res.text() };
}

async function uploadStandaloneEvidence(opts: {
  token: string;
  metricId: string;
  period: string;
  siteId?: string | null;
  filename: string;
}) {
  const form = new FormData();
  form.append("metricId", opts.metricId);
  form.append("period", opts.period);
  form.append("file", new Blob(["standalone scoped evidence"], { type: "text/plain" }), opts.filename);
  if (Object.prototype.hasOwnProperty.call(opts, "siteId")) {
    form.append("siteId", opts.siteId ?? "null");
  }
  return apiMultipartRequest("POST", "/api/evidence", form, opts.token);
}

function parseEvidenceList(res: { status: number; body: string }) {
  if (res.status !== 200) throw new Error(`GET evidence status=${res.status} body=${res.body.slice(0, 200)}`);
  return JSON.parse(res.body) as Array<{ id?: string; siteId?: string | null; filename?: string }>;
}

function parseCoverage(res: { status: number; body: string }) {
  if (res.status !== 200) throw new Error(`GET coverage status=${res.status} body=${res.body.slice(0, 200)}`);
  return JSON.parse(res.body) as { totalEvidence: number; metricCoverage?: Array<{ metricId?: string; hasEvidence?: boolean }> };
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const period = "2026-05";
  const metricIds = await getMetricIds(tenantA.adminToken, 2);
  const metricId = metricIds[0];
  const secondaryMetricId = metricIds[1] && metricIds[1] !== metricId ? metricIds[1] : null;

  {
    const name = "legacy tenant with no active sites can save without explicit scope";
    const legacyPeriod = "2026-04";
    const dataEntryRes = await apiRequest("POST", "/api/data-entry", {
      metricId,
      period: legacyPeriod,
      value: 44,
      notes: "legacy no-sites data entry",
    }, tenantA.adminToken);
    const evidenceRes = await uploadStandaloneEvidence({
      token: tenantA.adminToken,
      metricId,
      period: legacyPeriod,
      filename: `legacy-no-sites-evidence-${Date.now()}.txt`,
    });
    const rawDataRes = await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "44" },
      period: legacyPeriod,
    }, tenantA.adminToken);
    const recalcRes = await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(legacyPeriod)}`, {}, tenantA.adminToken);
    const statuses = [dataEntryRes.status, evidenceRes.status, rawDataRes.status, recalcRes.status];
    if (statuses.every((status) => [200, 201].includes(status))) pass(name);
    else fail(name, `statuses=${statuses.join(",")}`);
  }

  const siteAId = await createSite(tenantA.adminToken, `Site A ${Date.now()}`, "United Kingdom");
  const siteBId = await createSite(tenantA.adminToken, `Site B ${Date.now()}`, "Ireland");
  const tenantBSiteId = await createSite(tenantB.adminToken, `Tenant B Site ${Date.now()}`, "France");

  // Negative write-path checks after active sites exist.
  {
    const name = "POST /api/data-entry without scope fails when active sites exist";
    const res = await apiRequest("POST", "/api/data-entry", {
      metricId,
      period,
      value: 10,
      notes: "ambiguous",
    }, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else pass(name);
  }

  {
    const name = "POST /api/evidence without scope fails when active sites exist";
    const res = await uploadStandaloneEvidence({
      token: tenantA.adminToken,
      metricId,
      period,
      filename: `ambiguous-evidence-${Date.now()}.txt`,
    });
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else pass(name);
  }

  {
    const name = "POST /api/raw-data without explicit scope fails when active sites exist";
    const res = await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "123" },
      period,
    }, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else pass(name);
  }

  {
    const name = "POST /api/metrics/recalculate/:period without explicit scope fails when active sites exist";
    const res = await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {}, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else pass(name);
  }

  // Positive isolation setup: same metric + period, three distinct scopes.
  const orgSave = await saveMetricValue(tenantA.adminToken, metricId, period, 100, null);
  const siteASave = await saveMetricValue(tenantA.adminToken, metricId, period, 200, siteAId);
  const siteBSave = await saveMetricValue(tenantA.adminToken, metricId, period, 300, siteBId);
  if (![200, 201].includes(orgSave.status) || ![200, 201].includes(siteASave.status) || ![200, 201].includes(siteBSave.status)) {
    fail("seed site-scoped metric values", `org=${orgSave.status} siteA=${siteASave.status} siteB=${siteBSave.status}`);
    return;
  }
  if (secondaryMetricId) {
    const secondarySiteBSave = await saveMetricValue(tenantA.adminToken, secondaryMetricId, period, 400, siteBId);
    if (![200, 201].includes(secondarySiteBSave.status)) {
      fail("seed secondary Site B-only metric value", `status=${secondarySiteBSave.status}`);
      return;
    }
  }
  pass("seed site-scoped metric values");

  {
    const name = "Site A data-entry read never returns Site B or org-wide value";
    const values = valuesFor(parseDataEntryValues(await getDataEntry(tenantA.adminToken, period, siteAId)), metricId);
    const onlySiteA = values.length === 1 && values[0].siteId === siteAId && Number(values[0].value) === 200;
    if (!onlySiteA) fail(name, JSON.stringify(values));
    else pass(name);
  }

  {
    const name = "Site B data-entry read never returns Site A or org-wide value";
    const values = valuesFor(parseDataEntryValues(await getDataEntry(tenantA.adminToken, period, siteBId)), metricId);
    const onlySiteB = values.length === 1 && values[0].siteId === siteBId && Number(values[0].value) === 300;
    if (!onlySiteB) fail(name, JSON.stringify(values));
    else pass(name);
  }

  {
    const name = "Organisation-wide data-entry read returns only null-site value";
    const values = valuesFor(parseDataEntryValues(await getDataEntry(tenantA.adminToken, period, null)), metricId);
    const onlyOrg = values.length === 1 && (values[0].siteId === null || values[0].siteId === undefined) && Number(values[0].value) === 100;
    if (!onlyOrg) fail(name, JSON.stringify(values));
    else pass(name);
  }

  {
    const name = "All-scope data-entry read returns org-wide, Site A, and Site B values";
    const values = valuesFor(parseDataEntryValues(await getDataEntry(tenantA.adminToken, period)), metricId);
    const scopes = new Map(values.map((row) => [row.siteId ?? "__org__", Number(row.value)]));
    if (scopes.get("__org__") !== 100 || scopes.get(siteAId) !== 200 || scopes.get(siteBId) !== 300) {
      fail(name, JSON.stringify(values));
    } else pass(name);
  }

  // Evidence isolation and coverage.
  let siteAEvidenceId = "";
  {
    const name = "metric-row evidence attached under Site A appears only in Site A evidence scope";
    const uploadRes = await uploadMetricRowEvidence({
      token: tenantA.adminToken,
      metricId,
      period,
      value: 222,
      siteId: siteAId,
      filename: `site-a-metric-row-${Date.now()}.txt`,
    });
    if (![200, 201].includes(uploadRes.status)) {
      fail(name, `upload status=${uploadRes.status} body=${uploadRes.body.slice(0, 200)}`);
    } else {
      const uploaded = JSON.parse(uploadRes.body) as { newlyCreatedAttachments?: Array<{ id?: string }> };
      siteAEvidenceId = uploaded.newlyCreatedAttachments?.[0]?.id || "";
      const siteAList = parseEvidenceList(await apiRequest("GET", `/api/evidence?siteId=${siteAId}`, undefined, tenantA.adminToken));
      const siteBList = parseEvidenceList(await apiRequest("GET", `/api/evidence?siteId=${siteBId}`, undefined, tenantA.adminToken));
      const orgList = parseEvidenceList(await apiRequest("GET", "/api/evidence?siteId=null", undefined, tenantA.adminToken));
      if (!siteAEvidenceId || !siteAList.some((file) => file.id === siteAEvidenceId)) fail(name, "Site A evidence not in Site A list");
      else if (siteBList.some((file) => file.id === siteAEvidenceId)) fail(name, "Site A evidence leaked to Site B list");
      else if (orgList.some((file) => file.id === siteAEvidenceId)) fail(name, "Site A evidence leaked to org-wide list");
      else pass(name);
    }
  }

  let orgEvidenceId = "";
  let siteBEvidenceId = "";
  const orgEvidence = await uploadStandaloneEvidence({
    token: tenantA.adminToken,
    metricId,
    period,
    siteId: null,
    filename: `org-evidence-${Date.now()}.txt`,
  });
  const siteBEvidence = await uploadStandaloneEvidence({
    token: tenantA.adminToken,
    metricId,
    period,
    siteId: siteBId,
    filename: `site-b-evidence-${Date.now()}.txt`,
  });
  if (![200, 201].includes(orgEvidence.status) || ![200, 201].includes(siteBEvidence.status)) {
    fail("seed scoped standalone evidence", `org=${orgEvidence.status} siteB=${siteBEvidence.status}`);
  } else {
    orgEvidenceId = (JSON.parse(orgEvidence.body) as { id?: string }).id || "";
    siteBEvidenceId = (JSON.parse(siteBEvidence.body) as { id?: string }).id || "";
    pass("seed scoped standalone evidence");
  }

  {
    const name = "direct metric evidence endpoint is scope-safe";
    const missingScope = await apiRequest("GET", `/api/evidence/entity/metric/${metricId}`, undefined, tenantA.adminToken);
    const orgDirect = parseEvidenceList(await apiRequest("GET", `/api/evidence/entity/metric/${metricId}?siteId=null`, undefined, tenantA.adminToken));
    const siteBDirect = parseEvidenceList(await apiRequest("GET", `/api/evidence/entity/metric/${metricId}?siteId=${siteBId}`, undefined, tenantA.adminToken));
    const allDirect = parseEvidenceList(await apiRequest("GET", `/api/evidence/entity/metric/${metricId}?siteId=__all__`, undefined, tenantA.adminToken));
    if (missingScope.status !== 400) fail(name, `missing scope status=${missingScope.status}`);
    else if (!orgEvidenceId || !orgDirect.some((file) => file.id === orgEvidenceId) || orgDirect.some((file) => file.id === siteBEvidenceId)) fail(name, "org direct evidence scope leaked or missed");
    else if (!siteBEvidenceId || !siteBDirect.some((file) => file.id === siteBEvidenceId) || siteBDirect.some((file) => file.id === orgEvidenceId)) fail(name, "site direct evidence scope leaked or missed");
    else if (!allDirect.some((file) => file.id === orgEvidenceId) || !allDirect.some((file) => file.id === siteBEvidenceId)) fail(name, "all-scope direct evidence did not include explicit org and site records");
    else pass(name);
  }

  {
    const name = "metric evidence endpoint scopes metric_value and direct metric evidence";
    const siteAEvidence = parseEvidenceList(await apiRequest("GET", `/api/metrics/${metricId}/evidence?siteId=${siteAId}`, undefined, tenantA.adminToken));
    const siteBEvidence = parseEvidenceList(await apiRequest("GET", `/api/metrics/${metricId}/evidence?siteId=${siteBId}`, undefined, tenantA.adminToken));
    const orgMetricEvidence = parseEvidenceList(await apiRequest("GET", `/api/metrics/${metricId}/evidence?siteId=null`, undefined, tenantA.adminToken));
    const allMetricEvidence = parseEvidenceList(await apiRequest("GET", `/api/metrics/${metricId}/evidence?siteId=__all__`, undefined, tenantA.adminToken));
    if (!siteAEvidence.some((file) => file.id === siteAEvidenceId) || siteAEvidence.some((file) => file.id === siteBEvidenceId || file.id === orgEvidenceId)) fail(name, "Site A metric evidence leaked other scopes");
    else if (!siteBEvidence.some((file) => file.id === siteBEvidenceId) || siteBEvidence.some((file) => file.id === siteAEvidenceId || file.id === orgEvidenceId)) fail(name, "Site B metric evidence leaked other scopes");
    else if (!orgMetricEvidence.some((file) => file.id === orgEvidenceId) || orgMetricEvidence.some((file) => file.id === siteAEvidenceId || file.id === siteBEvidenceId)) fail(name, "Org metric evidence leaked site scopes");
    else if (![siteAEvidenceId, siteBEvidenceId, orgEvidenceId].every((id) => allMetricEvidence.some((file) => file.id === id))) fail(name, "All-scope metric evidence missing scoped records");
    else pass(name);
  }

  {
    const name = "evidence coverage distinguishes org-wide, specific site, and all scopes";
    const periodParam = `period=${encodeURIComponent(period)}`;
    const orgCoverage = parseCoverage(await apiRequest("GET", `/api/evidence/coverage?${periodParam}&siteId=null`, undefined, tenantA.adminToken));
    const siteACoverage = parseCoverage(await apiRequest("GET", `/api/evidence/coverage?${periodParam}&siteId=${siteAId}`, undefined, tenantA.adminToken));
    const siteBCoverage = parseCoverage(await apiRequest("GET", `/api/evidence/coverage?${periodParam}&siteId=${siteBId}`, undefined, tenantA.adminToken));
    const allCoverage = parseCoverage(await apiRequest("GET", `/api/evidence/coverage?${periodParam}`, undefined, tenantA.adminToken));
    if (orgCoverage.totalEvidence !== 1) fail(name, `org total=${orgCoverage.totalEvidence}`);
    else if (siteACoverage.totalEvidence !== 1) fail(name, `siteA total=${siteACoverage.totalEvidence}`);
    else if (siteBCoverage.totalEvidence !== 1) fail(name, `siteB total=${siteBCoverage.totalEvidence}`);
    else if (allCoverage.totalEvidence < 3) fail(name, `all total=${allCoverage.totalEvidence}`);
    else pass(name, `org=${orgCoverage.totalEvidence} siteA=${siteACoverage.totalEvidence} siteB=${siteBCoverage.totalEvidence} all=${allCoverage.totalEvidence}`);
  }

  {
    const name = "report export-data scopes metric values explicitly";
    const parseValues = (res: { status: number; body: string }) => {
      if (res.status !== 200) throw new Error(`export-data status=${res.status} body=${res.body.slice(0, 200)}`);
      return (JSON.parse(res.body) as { values?: Array<{ metricId: string; value: string | null; siteId?: string | null }> }).values || [];
    };
    try {
      const siteAValues = valuesFor(parseValues(await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=${siteAId}`, undefined, tenantA.adminToken)), metricId);
      const orgValues = valuesFor(parseValues(await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`, undefined, tenantA.adminToken)), metricId);
      const allValues = valuesFor(parseValues(await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=__all__`, undefined, tenantA.adminToken)), metricId);
      if (siteAValues.length !== 1 || siteAValues[0].siteId !== siteAId) fail(name, `siteA=${JSON.stringify(siteAValues)}`);
      else if (orgValues.length !== 1 || (orgValues[0].siteId !== null && orgValues[0].siteId !== undefined)) fail(name, `org=${JSON.stringify(orgValues)}`);
      else if (allValues.length < 3) fail(name, `all=${JSON.stringify(allValues)}`);
      else pass(name);
    } catch (error: any) {
      fail(name, error?.message || String(error));
    }
  }

  if (secondaryMetricId) {
    const name = "report readiness is site-aware and does not count other scopes";
    const parseReadiness = async (siteId: string) => {
      const res = await apiRequest("GET", `/api/reports/readiness-detail?period=${encodeURIComponent(period)}&siteId=${encodeURIComponent(siteId)}`, undefined, tenantA.adminToken);
      if (res.status !== 200) throw new Error(`readiness status=${res.status} body=${res.body.slice(0, 200)}`);
      return JSON.parse(res.body) as { scope?: string; filledMetrics?: number; scopeLabel?: string };
    };
    try {
      const siteAReadiness = await parseReadiness(siteAId);
      const siteBReadiness = await parseReadiness(siteBId);
      const orgReadiness = await parseReadiness("null");
      const allReadiness = await parseReadiness("__all__");
      if (siteAReadiness.scope !== "site" || siteAReadiness.filledMetrics !== 1) fail(name, `siteA=${JSON.stringify(siteAReadiness)}`);
      else if (siteBReadiness.scope !== "site" || siteBReadiness.filledMetrics !== 2) fail(name, `siteB=${JSON.stringify(siteBReadiness)}`);
      else if (orgReadiness.scope !== "organisation" || orgReadiness.filledMetrics !== 1) fail(name, `org=${JSON.stringify(orgReadiness)}`);
      else if (allReadiness.scope !== "all" || allReadiness.filledMetrics !== 2) fail(name, `all=${JSON.stringify(allReadiness)}`);
      else pass(name, `${siteAReadiness.scopeLabel || "site scoped"}`);
    } catch (error: any) {
      fail(name, error?.message || String(error));
    }
  }

  // Report generation/history scope sanity.
  {
    const name = "reports generate and history renders siteName for a site-scoped report";
    const generateRes = await apiRequest("POST", "/api/reports/generate", {
      period,
      reportType: "pdf",
      reportTemplate: "management",
      siteId: siteAId,
    }, tenantA.adminToken);
    if (![200, 201].includes(generateRes.status)) {
      fail(name, `generate status=${generateRes.status} body=${generateRes.body.slice(0, 200)}`);
    } else {
      const listRes = await apiRequest("GET", `/api/reports?siteId=${siteAId}`, undefined, tenantA.adminToken);
      if (listRes.status !== 200) fail(name, `list status=${listRes.status}`);
      else {
        const reports = JSON.parse(listRes.body) as Array<{ siteId?: string | null; siteName?: string | null }>;
        const report = reports.find((row) => row.siteId === siteAId);
        if (!report) fail(name, "site report missing from scoped history");
        else if (!report.siteName) fail(name, "siteName missing from report history");
        else pass(name, report.siteName);
      }
    }
  }

  // Tenant isolation / validateSiteOwnership checks.
  {
    const name = "foreign tenant siteId is rejected by scoped reads and writes";
    const readRes = await getDataEntry(tenantA.adminToken, period, tenantBSiteId);
    const writeRes = await saveMetricValue(tenantA.adminToken, metricId, period, 999, tenantBSiteId);
    const coverageRes = await apiRequest("GET", `/api/evidence/coverage?siteId=${tenantBSiteId}`, undefined, tenantA.adminToken);
    const reportRes = await apiRequest("GET", `/api/reports?siteId=${tenantBSiteId}`, undefined, tenantA.adminToken);
    const reportPreflightRes = await apiRequest("GET", `/api/reports/preflight?period=${encodeURIComponent(period)}&siteId=${tenantBSiteId}`, undefined, tenantA.adminToken);
    const scorePerformanceRes = await apiRequest("GET", `/api/esg-scores/performance?period=${encodeURIComponent(period)}&siteId=${tenantBSiteId}`, undefined, tenantA.adminToken);
    const scoreAllRes = await apiRequest("GET", `/api/esg-scores/all?period=${encodeURIComponent(period)}&siteId=${tenantBSiteId}`, undefined, tenantA.adminToken);
    const metricDefinitionValuesRes = await apiRequest("GET", `/api/metric-definition-values?siteId=${tenantBSiteId}`, undefined, tenantA.adminToken);
    const uploadRes = await uploadStandaloneEvidence({
      token: tenantA.adminToken,
      metricId,
      period,
      siteId: tenantBSiteId,
      filename: `foreign-site-${Date.now()}.txt`,
    });
    const statuses = [
      readRes.status,
      writeRes.status,
      coverageRes.status,
      reportRes.status,
      reportPreflightRes.status,
      scorePerformanceRes.status,
      scoreAllRes.status,
      metricDefinitionValuesRes.status,
      uploadRes.status,
    ];
    if (statuses.every((status) => status === 404)) pass(name);
    else fail(name, `statuses=${statuses.join(",")}`);
  }
}

async function main() {
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("test harness", error?.message || String(error));
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n=== Site-scoped data: ${passed}/${total} passed ===\n`);
  if (passed !== total) process.exit(1);
}

main();
