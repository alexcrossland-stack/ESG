/**
 * Waste alias acceptance: run only against a disposable local server/database.
 * All fixtures belong to newly seeded test tenants. No definitions, historical
 * values or report snapshots are deleted or migrated by this test or the fix.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };
type SavedValue = { id: string; metricId: string; period: string; value: string | number | null; notes?: string | null };
type CompanyMetric = { id: string; name: string; unit: string; frequency: string; enabled: boolean; isDefault: boolean };
let passed = 0;

function json<T = any>(response: ApiResponse, label: string, statuses = [200]): T {
  assert.ok(statuses.includes(response.status), `${label}: status ${response.status}; ${response.body.slice(0, 500)}`);
  return JSON.parse(response.body) as T;
}

async function check(name: string, assertion: () => Promise<void>) {
  await assertion();
  passed++;
  console.log(`PASS ${name}`);
}

async function run() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const companyId = tenantA.companyId;
  const token = tenantA.adminToken;
  const period = "2025-12";
  const historyPeriod = "2025-11";
  const aliasNames = ["Waste Generated", "Total Waste Generated"];
  const historySnapshot = { title: "Historical alias report", metrics: [{ name: "Waste Generated", value: 10 }, { name: "Total Waste Generated", value: 20 }] };
  const reportId = randomUUID();

  try {
    // Isolate the denominator using this new tenant's fixtures only.
    await client.query("UPDATE metrics SET enabled = false WHERE company_id = $1", [companyId]);
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
    const metricIds: string[] = [];
    for (const name of aliasNames) {
      const { rows: [existing] } = await client.query(
        "SELECT id FROM metrics WHERE company_id = $1 AND name = $2 AND unit = 'tonnes' AND frequency = 'monthly' AND metric_type = 'manual' ORDER BY id LIMIT 1",
        [companyId, name],
      );
      const id = existing?.id ?? randomUUID();
      if (!existing) await client.query(
        "INSERT INTO metrics (id, company_id, name, category, unit, frequency, metric_type, enabled, is_default) VALUES ($1, $2, $3, 'environmental', 'tonnes', 'monthly', 'manual', false, false)",
        [id, companyId, name],
      );
      metricIds.push(id);
    }
    const [canonicalId, legacyId] = metricIds;
    await client.query("UPDATE metrics SET is_default = false WHERE company_id = $1 AND name = ANY($2::text[])", [companyId, aliasNames]);
    await client.query("UPDATE metrics SET enabled = true, is_default = (id = $3) WHERE company_id = $1 AND id = ANY($2::varchar[])", [companyId, metricIds, canonicalId]);
    const { rows: [definition] } = await client.query(
      "SELECT id FROM metric_definitions WHERE name = 'Waste Generated' AND unit = 'tonnes' AND input_frequency = 'monthly' AND is_derived = false ORDER BY id LIMIT 1",
    );
    assert.ok(definition, "Compatible seeded waste definition is required");

    const readMetrics = async (auth = token): Promise<CompanyMetric[]> => json(await apiRequest("GET", "/api/metrics", undefined, auth), "company metrics");
    const readValues = async (metricId: string): Promise<SavedValue[]> => json(await apiRequest("GET", `/api/metrics/${metricId}/values?siteId=__org__`, undefined, token), "metric value history");
    const save = async (metricId: string, reportingPeriod: string, value: number, notes: string): Promise<SavedValue> => json(
      await apiRequest("POST", "/api/data-entry", { metricId, period: reportingPeriod, value, notes, siteId: null }, token),
      "save explicit metric ID", [200, 201],
    );
    const originalMetricIds = (await readMetrics()).map((metric) => metric.id).sort();
    const otherTenantBefore = await readMetrics(tenantB.adminToken);
    const canonicalHistorical = await save(canonicalId, historyPeriod, 10, "Canonical historical value");
    const legacyHistorical = await save(legacyId, historyPeriod, 20, "Legacy historical value");
    const legacyCurrent = await save(legacyId, period, 25, "Legacy-only current value");
    await client.query("INSERT INTO report_runs (id, company_id, period, report_data) VALUES ($1, $2, $3, $4::jsonb)", [reportId, companyId, historyPeriod, JSON.stringify(historySnapshot)]);

    await check("legacy-only data fills one tracked concept across Overview, readiness and Action plan", async () => {
      const enhanced = json(await apiRequest("GET", `/api/dashboard/enhanced?period=${period}`, undefined, token), "enhanced dashboard");
      assert.equal(enhanced.totalMetrics, 1);
      assert.equal(enhanced.metricSummaries.length, 1);
      assert.equal(enhanced.metricSummaries[0].name, "Waste Generated");
      assert.equal(enhanced.metricSummaries[0].latestValue, 25, "Legacy value must fill a canonical gap, not be omitted");
      const readiness = json(await apiRequest("GET", `/api/dashboard/readiness?period=${period}`, undefined, token), "dashboard readiness");
      assert.equal(readiness.totalMetrics, 1);
      assert.equal(readiness.filledMetrics, 1);
      assert.equal(readiness.dataCompletenessPercent, 100);
      const reportReadiness = json(await apiRequest("GET", `/api/reports/readiness-detail?period=${period}&siteId=__org__`, undefined, token), "report readiness");
      assert.equal(reportReadiness.totalMetrics, 1);
      assert.equal(reportReadiness.filledMetrics, 1);
      assert.equal(reportReadiness.missingCategories.missingEvidenceCount, 1);
      const control = json(await apiRequest("GET", `/api/control-centre?period=${period}`, undefined, token), "control centre");
      assert.equal(control.summary.missingData, 0, "Legacy data must not create a false canonical missing-data task");
    });

    await check("both alias records and values remain available by original IDs", async () => {
      const entry = json(await apiRequest("GET", `/api/data-entry/${period}?siteId=__org__`, undefined, token), "data entry sources");
      for (const id of metricIds) assert.ok(entry.metrics.some((metric: CompanyMetric) => metric.id === id));
      assert.ok(entry.values.some((value: SavedValue) => value.id === legacyCurrent.id && value.metricId === legacyId));
      const grid = json(await apiRequest("GET", `/api/data-entry/bulk-grid?periods=${historyPeriod},${period}&siteId=null`, undefined, token), "bulk source grid");
      for (const id of metricIds) assert.ok(grid.metrics.some((metric: CompanyMetric) => metric.id === id));
      assert.ok(grid.values.some((value: SavedValue) => value.id === legacyHistorical.id));
    });

    await check("grouped disable and re-enable affect compatible aliases only in the current tenant", async () => {
      const disabled = json(await apiRequest("PATCH", `/api/metric-definitions/${definition.id}/toggle`, undefined, token), "group toggle off");
      assert.equal(disabled.isActive, false);
      const disabledMetrics = await readMetrics();
      for (const id of metricIds) assert.equal(disabledMetrics.find((metric) => metric.id === id)?.enabled, false);
      const library = json<any[]>(await apiRequest("GET", "/api/metric-definitions", undefined, token), "library after disable");
      const compatibleDefinitions = library.filter((item) => aliasNames.includes(item.name) && item.unit === "tonnes" && item.inputFrequency === "monthly" && !item.isDerived);
      assert.ok(compatibleDefinitions.length > 0);
      for (const item of compatibleDefinitions) assert.equal(item.isActive, false);
      const enabled = json(await apiRequest("PATCH", `/api/metric-definitions/${definition.id}/active`, { isActive: true }, token), "group explicit enable");
      assert.equal(enabled.isActive, true);
      for (const id of metricIds) assert.equal((await readMetrics()).find((metric) => metric.id === id)?.enabled, true);
      assert.deepEqual((await readMetrics(tenantB.adminToken)).map(({ id, enabled }) => ({ id, enabled })), otherTenantBefore.map(({ id, enabled }) => ({ id, enabled })));
    });

    await check("viewer and anonymous activation attempts fail without changing either alias", async () => {
      assert.equal((await apiRequest("PATCH", `/api/metric-definitions/${definition.id}/toggle`, undefined, tenantA.viewerToken)).status, 403);
      assert.equal((await apiRequest("PATCH", `/api/metric-definitions/${definition.id}/active`, { isActive: false }, tenantA.viewerToken)).status, 403);
      assert.equal((await apiRequest("PATCH", `/api/metric-definitions/${definition.id}/toggle`)).status, 401);
      for (const id of metricIds) assert.equal((await readMetrics()).find((metric) => metric.id === id)?.enabled, true);
      assert.equal((await apiRequest("GET", `/api/metrics/${legacyId}/values`, undefined, tenantB.adminToken)).status, 404);
    });

    await check("spreadsheet-style validation and commit retain the explicit legacy source ID", async () => {
      const cells = [{ metricId: legacyId, period, rawValue: "26.5", rowIndex: 0, columnIndex: 0 }];
      const validated = json(await apiRequest("POST", "/api/data-entry/bulk-upsert", { mode: "validate", cells, siteId: null }, token), "validate bulk legacy edit");
      assert.equal(validated.ok, true);
      assert.equal(validated.cells[0].metricId, legacyId);
      assert.equal(validated.cells[0].normalizedValue, 26.5);
      assert.equal(Number((await readValues(legacyId)).find((value) => value.period === period)?.value), 25, "Validation must not write");
      const committed = json(await apiRequest("POST", "/api/data-entry/bulk-upsert", { mode: "commit", cells, siteId: null }, token), "commit bulk legacy edit");
      assert.equal(committed.committed, true);
      const legacy = (await readValues(legacyId)).find((value) => value.period === period);
      assert.equal(legacy?.id, legacyCurrent.id);
      assert.equal(Number(legacy?.value), 26.5);
      assert.ok(!(await readValues(canonicalId)).some((value) => value.period === period), "Bulk entry must not silently migrate the source ID");
      assert.equal((await apiRequest("POST", "/api/data-entry/bulk-upsert", { mode: "commit", cells, siteId: null }, tenantA.viewerToken)).status, 403);
      const foreign = await apiRequest("POST", "/api/data-entry/bulk-upsert", { mode: "commit", cells, siteId: null }, tenantB.adminToken);
      assert.equal(foreign.status, 400);
      assert.equal(Number((await readValues(legacyId)).find((value) => value.period === period)?.value), 26.5);
    });

    await check("guided input uses one canonical source and never overwrites the other alias", async () => {
      const raw = json(await apiRequest("POST", "/api/raw-data", { period, siteId: null, inputs: { total_waste_tonnes: 30 } }, token), "guided raw input");
      assert.equal(raw.saved, 1);
      const recalc = json(await apiRequest("POST", `/api/metrics/recalculate/${period}`, { siteId: null }, token), "guided recalculation");
      const wasteSync = recalc.guidedMetricSync.synced.filter((entry: any) => entry.inputName === "total_waste_tonnes");
      assert.equal(wasteSync.length, 1);
      assert.equal(wasteSync[0].metricId, canonicalId);
      assert.equal(Number((await readValues(canonicalId)).find((value) => value.period === period)?.value), 30);
      assert.equal(Number((await readValues(legacyId)).find((value) => value.period === period)?.value), 26.5);
      const enhanced = json(await apiRequest("GET", `/api/dashboard/enhanced?period=${period}`, undefined, token), "dashboard after guided entry");
      assert.equal(enhanced.totalMetrics, 1);
      assert.equal(enhanced.metricSummaries[0].latestValue, 30, "Conflicting aliases must not be summed to 56.5");
      const readiness = json(await apiRequest("GET", `/api/dashboard/readiness?period=${period}`, undefined, token), "readiness after guided entry");
      assert.equal(readiness.totalMetrics, 1);
      assert.equal(readiness.filledMetrics, 1);
    });

    await check("existing history, snapshot payloads and source IDs survive grouping and new writes unchanged", async () => {
      const canonicalPast = (await readValues(canonicalId)).find((value) => value.period === historyPeriod);
      const legacyPast = (await readValues(legacyId)).find((value) => value.period === historyPeriod);
      assert.equal(canonicalPast?.id, canonicalHistorical.id);
      assert.equal(Number(canonicalPast?.value), 10);
      assert.equal(canonicalPast?.notes, "Canonical historical value");
      assert.equal(legacyPast?.id, legacyHistorical.id);
      assert.equal(Number(legacyPast?.value), 20);
      assert.equal(legacyPast?.notes, "Legacy historical value");
      assert.deepEqual((await readMetrics()).map((metric) => metric.id).sort(), originalMetricIds);
      const { rows: [savedReport] } = await client.query("SELECT report_data FROM report_runs WHERE id = $1 AND company_id = $2", [reportId, companyId]);
      assert.deepEqual(savedReport.report_data, historySnapshot);
      const report = json(await apiRequest("GET", `/api/reports/${reportId}`, undefined, token), "saved report readback");
      assert.deepEqual(report.reportData, historySnapshot);
    });
  } finally {
    await client.end();
  }
  console.log(`Metric alias preservation: ${passed}/7 checks passed`);
}

run().catch((error) => { console.error(`FAIL after ${passed} checks:`, error); process.exitCode = 1; });
