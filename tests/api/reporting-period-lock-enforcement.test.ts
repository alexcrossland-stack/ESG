import assert from "node:assert/strict";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

function expectStatus(response: { status: number; body: string }, expected: number, label: string) {
  assert.equal(response.status, expected, `${label}: status=${response.status} body=${response.body.slice(0, 300)}`);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
      [tenantA.companyId],
    );
    const metric = await client.query<{ id: string }>(
      "SELECT id FROM metrics WHERE company_id = $1 AND name = 'Electricity Consumption' LIMIT 1",
      [tenantA.companyId],
    );
    const electricityMetricId = metric.rows[0]?.id;
    assert.ok(electricityMetricId, "tenant A electricity metric is required");

    const reportingLockedPeriod = "2042-04";
    await client.query(
      `INSERT INTO reporting_periods (
         id, company_id, name, period_type, start_date, end_date, status
       ) VALUES (
         gen_random_uuid(), $1, 'Locked spring reporting range', 'quarterly',
         '2042-03-15T00:00:00.000Z', '2042-05-10T00:00:00.000Z', 'locked'
       )`,
      [tenantA.companyId],
    );

    const emptyBefore = await client.query<{ count: string }>(
      `SELECT (
         (SELECT count(*) FROM raw_data_inputs WHERE company_id = $1 AND period = $2)
         +
         (SELECT count(*) FROM metric_values mv JOIN metrics m ON m.id = mv.metric_id
          WHERE m.company_id = $1 AND mv.period = $2)
       )::text AS count`,
      [tenantA.companyId, reportingLockedPeriod],
    );
    assert.equal(emptyBefore.rows[0]?.count, "0", "the reporting-range lock fixture must start with an empty month");

    for (const month of ["2042-03", "2042-04", "2042-05"]) {
      const state = await apiRequest("GET", `/api/data-entry/${month}?siteId=null`, undefined, tenantA.adminToken);
      expectStatus(state, 200, `data-entry state for reporting-range month ${month}`);
      assert.equal(JSON.parse(state.body).periodLocked, true, `${month} should be locked by the overlapping reporting range`);
    }
    for (const month of ["2042-02", "2042-06"]) {
      const state = await apiRequest("GET", `/api/data-entry/${month}?siteId=null`, undefined, tenantA.adminToken);
      expectStatus(state, 200, `data-entry state outside reporting range ${month}`);
      assert.equal(JSON.parse(state.body).periodLocked, false, `${month} should remain outside the locked reporting range`);
    }

    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId: electricityMetricId,
      period: reportingLockedPeriod,
      value: 123,
      siteId: null,
    }, tenantA.adminToken), 400, "manual metric entry in a locked reporting range");
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "123" },
      period: reportingLockedPeriod,
      siteId: null,
    }, tenantA.adminToken), 400, "guided raw entry in a locked reporting range");

    const lockedRecalculation = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${reportingLockedPeriod}`,
      { siteId: null },
      tenantA.adminToken,
    );
    expectStatus(lockedRecalculation, 200, "recalculation in a locked reporting range");
    const lockedRecalculationBody = JSON.parse(lockedRecalculation.body) as {
      updated?: unknown[];
      calculatedSkippedLocked?: unknown[];
    };
    assert.deepEqual(lockedRecalculationBody.updated, []);
    assert.ok(
      (lockedRecalculationBody.calculatedSkippedLocked?.length ?? 0) > 0,
      "calculated metrics should be explicitly skipped for the locked reporting range",
    );

    expectStatus(await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: [{ column: "Electricity (kWh)", inputKey: "electricity_kwh" }],
      rows: [{ "Electricity (kWh)": "456" }],
      period: reportingLockedPeriod,
      siteId: null,
    }, tenantA.adminToken), 400, "CSV import in a locked reporting range");

    const emptyAfter = await client.query<{ count: string }>(
      `SELECT (
         (SELECT count(*) FROM raw_data_inputs WHERE company_id = $1 AND period = $2)
         +
         (SELECT count(*) FROM metric_values mv JOIN metrics m ON m.id = mv.metric_id
          WHERE m.company_id = $1 AND mv.period = $2)
       )::text AS count`,
      [tenantA.companyId, reportingLockedPeriod],
    );
    assert.equal(emptyAfter.rows[0]?.count, "0", "blocked write and recalculation paths must leave the empty month unchanged");

    // Reporting-period locks are tenant-scoped. A range owned by tenant B must
    // not lock the same month for tenant A.
    const tenantScopedPeriod = "2042-07";
    await client.query(
      `INSERT INTO reporting_periods (
         id, company_id, name, period_type, start_date, end_date, status
       ) VALUES (
         gen_random_uuid(), $1, 'Tenant B locked month', 'monthly',
         '2042-07-01T00:00:00.000Z', '2042-07-31T23:59:59.999Z', 'locked'
       )`,
      [tenantB.companyId],
    );
    const tenantAState = await apiRequest(
      "GET",
      `/api/data-entry/${tenantScopedPeriod}?siteId=null`,
      undefined,
      tenantA.adminToken,
    );
    expectStatus(tenantAState, 200, "tenant-scoped reporting lock state");
    assert.equal(JSON.parse(tenantAState.body).periodLocked, false);
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "77" },
      period: tenantScopedPeriod,
      siteId: null,
    }, tenantA.adminToken), 200, "tenant A write beside tenant B reporting lock");

    // Durable empty-month and legacy metric-row locks remain supported.
    const durablePeriod = "2042-08";
    expectStatus(
      await apiRequest("POST", `/api/data-entry/${durablePeriod}/lock`, {}, tenantA.adminToken),
      200,
      "durable empty-month lock",
    );
    const durableState = await apiRequest("GET", `/api/data-entry/${durablePeriod}?siteId=null`, undefined, tenantA.adminToken);
    expectStatus(durableState, 200, "durable empty-month state");
    assert.equal(JSON.parse(durableState.body).periodLocked, true);
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "88" },
      period: durablePeriod,
      siteId: null,
    }, tenantA.adminToken), 400, "write in a durable locked month");

    const legacyPeriod = "2042-09";
    await client.query(
      `INSERT INTO metric_values (
         id, metric_id, period, value, value_numeric, locked, site_id, data_source_type, workflow_status
       ) VALUES (gen_random_uuid(), $1, $2, '1', '1', true, NULL, 'manual', 'draft')`,
      [electricityMetricId, legacyPeriod],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "99" },
      period: legacyPeriod,
      siteId: null,
    }, tenantA.adminToken), 400, "write in a legacy locked month");

    // With no active sites, omitted scope means organisation-wide. Archived
    // site rows must not be synced or used by organisation calculations.
    const archivedScopePeriod = "2042-11";
    const archivedSite = await client.query<{ id: string }>(
      `INSERT INTO organisation_sites (id, company_id, name, slug, type, status)
       VALUES (gen_random_uuid(), $1, 'Archived historical site', 'archived-historical-site', 'office', 'archived')
       RETURNING id`,
      [tenantA.companyId],
    );
    await client.query(
      `INSERT INTO raw_data_inputs (
         id, company_id, input_name, input_category, value, unit, period, site_id,
         data_source_type, workflow_status
       ) VALUES (
         gen_random_uuid(), $1, 'electricity_kwh', 'energy', '7777', 'kWh', $2, $3,
         'manual', 'draft'
       )`,
      [tenantA.companyId, archivedScopePeriod, archivedSite.rows[0]?.id],
    );
    const implicitRecalculation = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${archivedScopePeriod}`,
      {},
      tenantA.adminToken,
    );
    expectStatus(implicitRecalculation, 200, "implicit organisation recalculation with archived site history");
    const implicitBody = JSON.parse(implicitRecalculation.body) as {
      guidedMetricSync?: { synced?: unknown[] };
      updated?: unknown[];
    };
    assert.deepEqual(implicitBody.guidedMetricSync?.synced, []);
    assert.deepEqual(implicitBody.updated, []);
    const archivedContamination = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND mv.period = $2`,
      [tenantA.companyId, archivedScopePeriod],
    );
    assert.equal(archivedContamination.rows[0]?.count, "0", "archived-site raw data must not contaminate implicit organisation recalculation");
  } finally {
    await client.end();
  }

  console.log("reporting period lock enforcement tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
