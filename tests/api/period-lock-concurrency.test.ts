import assert from "node:assert/strict";
import { Client } from "pg";
import {
  calculationMutationLockKey,
  isPeriodLockedInTransaction,
  periodMutationLockKey,
} from "../../server/period-locks";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type AdvisoryLockIdentity = {
  classid: string;
  objid: string;
  objsubid: number;
};

function expectStatus(response: { status: number; body: string }, expected: number, label: string) {
  assert.equal(response.status, expected, `${label}: status=${response.status} body=${response.body.slice(0, 300)}`);
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} did not complete after the advisory lock was released`)),
          10_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForAdvisoryWaiters(
  observer: Client,
  identity: AdvisoryLockIdentity,
  expectedCount: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_locks
       WHERE locktype = 'advisory'
         AND classid::text = $1
         AND objid::text = $2
         AND objsubid = $3
         AND granted = false`,
      [identity.classid, identity.objid, identity.objsubid],
    );
    if (Number(result.rows[0]?.count ?? 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expectedCount} queued period-lock transactions`);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const observer = new Client({ connectionString: databaseUrl });
  const blocker = new Client({ connectionString: databaseUrl });
  await observer.connect();
  await blocker.connect();

  let blockerTransactionOpen = false;
  try {
    await observer.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
      [tenantA.companyId],
    );
    const metricResult = await observer.query<{ id: string }>(
      `SELECT id
       FROM metrics
       WHERE company_id = $1 AND name = 'Electricity Consumption'
       ORDER BY enabled DESC NULLS LAST, id
       LIMIT 1`,
      [tenantA.companyId],
    );
    const metricId = metricResult.rows[0]?.id;
    assert.ok(metricId, "tenant electricity metric is required");
    const travelMetricResult = await observer.query<{ id: string }>(
      `SELECT id
       FROM metrics
       WHERE company_id = $1 AND name = 'Business Travel Emissions'
       LIMIT 1`,
      [tenantA.companyId],
    );
    const travelMetricId = travelMetricResult.rows[0]?.id;
    assert.ok(travelMetricId, "tenant business-travel metric is required");
    const metricDefinitionResult = await observer.query<{ id: string }>(
      `SELECT id
       FROM metric_definitions
       WHERE is_derived = false AND is_active = true AND data_type = 'numeric'
       ORDER BY is_core DESC, sort_order NULLS LAST, id
       LIMIT 1`,
    );
    const metricDefinitionId = metricDefinitionResult.rows[0]?.id;
    assert.ok(metricDefinitionId, "an active manual numeric metric definition is required");

    const calculationRacePeriod = "2098-04";
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "111" },
      period: calculationRacePeriod,
      siteId: null,
    }, tenantA.adminToken), 200, "seed guided calculation race input");

    // Capture the calculation-gate identity, then pause an older calculation
    // after it owns that exclusive gate but before it can persist outputs.
    const calculationKey = calculationMutationLockKey(tenantA.companyId, calculationRacePeriod);
    await blocker.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [calculationKey]);
    const calculationIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const calculationIdentity = calculationIdentityResult.rows[0];
    assert.ok(calculationIdentity, "the calculation-run advisory lock must be visible");
    await blocker.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [calculationKey]);

    const calculationPeriodKey = periodMutationLockKey(tenantA.companyId, calculationRacePeriod);
    await blocker.query("BEGIN");
    blockerTransactionOpen = true;
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [calculationPeriodKey]);
    const calculationPeriodIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const calculationPeriodIdentity = calculationPeriodIdentityResult.rows[0];
    assert.ok(calculationPeriodIdentity);

    const olderRecalculation = apiRequest(
      "POST",
      `/api/metrics/recalculate/${calculationRacePeriod}`,
      { siteId: null },
      tenantA.adminToken,
    );
    await waitForAdvisoryWaiters(observer, calculationPeriodIdentity, 1);

    const newerRawSave = apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "222" },
      period: calculationRacePeriod,
      siteId: null,
    }, tenantA.adminToken);
    await waitForAdvisoryWaiters(observer, calculationIdentity, 1);

    await blocker.query("COMMIT");
    blockerTransactionOpen = false;
    expectStatus(await withTimeout(olderRecalculation, "older guided recalculation"), 200, "older guided recalculation");
    expectStatus(await withTimeout(newerRawSave, "newer raw save"), 200, "newer raw save waits for calculation snapshot");

    const orderedRaceState = await observer.query<{ raw_value: string; metric_value: string }>(
      `SELECT
         (SELECT value::text FROM raw_data_inputs
          WHERE company_id = $1 AND period = $2 AND input_name = 'electricity_kwh' AND site_id IS NULL) AS raw_value,
         (SELECT mv.value::text FROM metric_values mv INNER JOIN metrics m ON m.id = mv.metric_id
          WHERE m.company_id = $1 AND m.name = 'Electricity Consumption'
            AND mv.period = $2 AND mv.site_id IS NULL LIMIT 1) AS metric_value`,
      [tenantA.companyId, calculationRacePeriod],
    );
    assert.equal(Number(orderedRaceState.rows[0]?.raw_value), 222, "the newer raw save must commit after the older calculation");
    assert.equal(Number(orderedRaceState.rows[0]?.metric_value), 111, "the older run must finish before the newer source mutation can commit");

    expectStatus(await apiRequest(
      "POST",
      `/api/metrics/recalculate/${calculationRacePeriod}`,
      { siteId: null },
      tenantA.adminToken,
    ), 200, "fresh guided recalculation after the newer source mutation");
    const freshMetricState = await observer.query<{ metric_value: string }>(
      `SELECT mv.value::text AS metric_value
       FROM metric_values mv INNER JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND m.name = 'Electricity Consumption'
         AND mv.period = $2 AND mv.site_id IS NULL LIMIT 1`,
      [tenantA.companyId, calculationRacePeriod],
    );
    assert.equal(Number(freshMetricState.rows[0]?.metric_value), 222, "the next run must calculate from the newest committed raw input");

    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId,
      period: "2097-Q4",
      value: 88,
      siteId: null,
    }, tenantA.adminToken), 200, "canonical quarterly direct entry remains supported");

    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId,
      period: "2098-3",
      value: 88,
      siteId: null,
    }, tenantA.adminToken), 400, "direct entry rejects a non-padded month alias");
    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId,
      period: ["2098-03"],
      value: 88,
      siteId: null,
    }, tenantA.adminToken), 400, "direct entry rejects a coerced non-string period");

    expectStatus(await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "commit",
      siteId: null,
      cells: [{ metricId, period: "2098-13", rawValue: "99" }],
    }, tenantA.adminToken), 400, "bulk entry rejects a non-calendar month");
    expectStatus(await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "commit",
      siteId: null,
      cells: [{ metricId, period: ["2098-03"], rawValue: "99" }],
    }, tenantA.adminToken), 400, "bulk entry rejects a coerced non-string period");

    expectStatus(await apiRequest("POST", `/api/metric-values/${travelMetricId}/calculate`, {
      metricCode: "OTHER_TENANT_VALUE",
      periodStart: "2098-03-01T00:00:00.000Z",
      periodEnd: "2098-03-31T23:59:59.999Z",
      siteId: null,
    }, tenantB.adminToken), 410, "retired legacy calculation endpoint is unreachable");

    expectStatus(
      await apiRequest("POST", "/api/data-entry/2098-3/lock", {}, tenantA.adminToken),
      400,
      "period lock rejects a non-padded month",
    );
    expectStatus(
      await apiRequest("POST", "/api/data-entry/2098-13/lock", {}, tenantA.adminToken),
      400,
      "period lock rejects a non-calendar month",
    );
    const invalidDirectLocks = await observer.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM data_entry_period_locks
       WHERE company_id = $1 AND period IN ('2098-3', '2098-13')`,
      [tenantA.companyId],
    );
    assert.equal(invalidDirectLocks.rows[0]?.count, "0", "invalid month locks must not be persisted");

    expectStatus(await apiRequest("POST", "/api/reporting-periods", {
      name: "Oversized range rejected at creation",
      periodType: "annual",
      startDate: "2000-01-01T00:00:00.000Z",
      endDate: "2025-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "oversized reporting-period creation");

    const legacyOversizedRange = await observer.query<{ id: string }>(
      `INSERT INTO reporting_periods (
         id, company_id, name, period_type, start_date, end_date, status
       ) VALUES (
         gen_random_uuid(), $1, 'Pre-existing oversized range', 'annual',
         '2000-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', 'open'
       ) RETURNING id`,
      [tenantA.companyId],
    );
    const oversizedLockResult = await apiRequest(
      "POST",
      `/api/reporting-periods/${legacyOversizedRange.rows[0]?.id}/lock`,
      {},
      tenantA.adminToken,
    );
    expectStatus(oversizedLockResult, 400, "pre-existing oversized reporting-period lock");
    assert.match(JSON.parse(oversizedLockResult.body).error, /at most 240 calendar months/);
    const oversizedStatus = await observer.query<{ status: string }>(
      "SELECT status::text FROM reporting_periods WHERE id = $1",
      [legacyOversizedRange.rows[0]?.id],
    );
    assert.equal(oversizedStatus.rows[0]?.status, "open", "an oversized legacy range must remain usable but unlocked");

    await observer.query(
      `INSERT INTO reporting_periods (
         id, company_id, name, period_type, start_date, end_date, status
       ) VALUES (
         gen_random_uuid(), $1, 'Timezone boundary range', 'monthly',
         '2097-07-01 00:00:00', '2097-07-01 00:00:00', 'locked'
       )`,
      [tenantA.companyId],
    );
    for (const timezone of ["Europe/London", "America/Los_Angeles"]) {
      await observer.query("BEGIN");
      try {
        await observer.query(`SET LOCAL TIME ZONE '${timezone}'`);
        await observer.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [periodMutationLockKey(tenantA.companyId, "2097-07")],
        );
        assert.equal(
          await isPeriodLockedInTransaction(observer, tenantA.companyId, "2097-07"),
          true,
          `timestamp-without-time-zone boundary must remain locked under ${timezone}`,
        );
      } finally {
        await observer.query("ROLLBACK");
      }
    }

    const period = "2098-03";
    await observer.query(
      `INSERT INTO raw_data_inputs (
         id, company_id, input_name, input_category, value, period, site_id,
         data_source_type, workflow_status
       ) VALUES
       (
         gen_random_uuid(), $1, 'domestic_flight_km', 'travel', '1000', $2, NULL,
         'manual', 'draft'
       ),
       (
         gen_random_uuid(), $1, 'absence_days', 'social', '10', $2, NULL,
         'manual', 'draft'
       ),
       (
         gen_random_uuid(), $1, 'total_working_days', 'social', '1000', $2, NULL,
         'manual', 'draft'
       )`,
      [tenantA.companyId, period],
    );
    await observer.query(
      `INSERT INTO metric_values (
         id, metric_id, period, value, value_numeric, locked, site_id,
         data_source_type, workflow_status
       ) VALUES (
         gen_random_uuid(), $1, $2, '9', '9', false, NULL, 'manual', 'draft'
       )`,
      [travelMetricId, period],
    );
    const advisoryKey = periodMutationLockKey(tenantA.companyId, period);
    const queuedCalculationKey = calculationMutationLockKey(tenantA.companyId, period);
    await blocker.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [queuedCalculationKey]);
    const queuedCalculationIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const queuedCalculationIdentity = queuedCalculationIdentityResult.rows[0];
    assert.ok(queuedCalculationIdentity, "the calculation-gate advisory lock must be visible");
    await blocker.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [queuedCalculationKey]);

    await blocker.query("BEGIN");
    blockerTransactionOpen = true;
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [advisoryKey]);
    const identityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const identity = identityResult.rows[0];
    assert.ok(identity, "the blocker advisory lock must be visible in pg_locks");

    // Queue the lock transaction first, but keep it blocked before it can
    // persist the durable lock. Each write therefore passes its optimistic
    // route precheck and must rely on the authoritative in-transaction recheck.
    const periodLockRequest = apiRequest(
      "POST",
      `/api/data-entry/${period}/lock`,
      {},
      tenantA.adminToken,
    );
    await waitForAdvisoryWaiters(observer, identity, 1);

    const guidedWrite = apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "101" },
      period,
      siteId: null,
    }, tenantA.adminToken);
    const directWrite = apiRequest("POST", "/api/data-entry", {
      metricId,
      period,
      value: 202,
      siteId: null,
    }, tenantA.adminToken);
    const bulkWrite = apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "commit",
      siteId: null,
      cells: [{ metricId, period, rawValue: "303" }],
    }, tenantA.adminToken);
    const csvWrite = apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: [{ column: "Electricity (kWh)", inputKey: "electricity_kwh" }],
      rows: [{ "Electricity (kWh)": "404" }],
      period,
      siteId: null,
    }, tenantA.adminToken);
    // Let every ordinary mutation obtain its compatible shared calculation
    // gate and queue on the period lock first. The recalculation then queues
    // on the exclusive calculation gate; it must not leapfrog those writers.
    await waitForAdvisoryWaiters(observer, identity, 5);
    const recalculationWrite = apiRequest(
      "POST",
      `/api/metrics/recalculate/${period}`,
      { siteId: null },
      tenantA.adminToken,
    );
    await waitForAdvisoryWaiters(observer, queuedCalculationIdentity, 1);
    await blocker.query("COMMIT");
    blockerTransactionOpen = false;

    expectStatus(await withTimeout(periodLockRequest, "queued period lock"), 200, "queued period lock");
    const [guidedResult, directResult, bulkResult, csvResult, recalculationResult] = await Promise.all([
      withTimeout(guidedWrite, "guided write"),
      withTimeout(directWrite, "direct write"),
      withTimeout(bulkWrite, "bulk write"),
      withTimeout(csvWrite, "CSV write"),
      withTimeout(recalculationWrite, "recalculation write"),
    ]);
    expectStatus(guidedResult, 400, "guided write queued behind period lock");
    expectStatus(directResult, 400, "direct metric write queued behind period lock");
    expectStatus(bulkResult, 409, "bulk paste queued behind period lock");
    expectStatus(csvResult, 400, "CSV import queued behind period lock");
    expectStatus(recalculationResult, 200, "calculated metric write queued behind period lock");
    const recalculationBody = JSON.parse(recalculationResult.body) as {
      updated?: unknown[];
      calculatedSkippedLocked?: unknown[];
    };
    assert.deepEqual(recalculationBody.updated, [], "no calculated metric may be written after the period lock");
    assert.ok(
      (recalculationBody.calculatedSkippedLocked?.length ?? 0) >= 2,
      "a recalculation that loses the period-lock race must report both update and create paths as skipped",
    );

    const persisted = await observer.query<{
      raw_count: string;
      metric_count: string;
      lock_count: string;
      travel_value: string;
    }>(
      `SELECT
         (SELECT count(*) FROM raw_data_inputs WHERE company_id = $1 AND period = $2)::text AS raw_count,
         (SELECT count(*) FROM metric_values mv INNER JOIN metrics m ON m.id = mv.metric_id
          WHERE m.company_id = $1 AND mv.period = $2)::text AS metric_count,
         (SELECT count(*) FROM data_entry_period_locks WHERE company_id = $1 AND period = $2)::text AS lock_count,
         (SELECT value::text FROM metric_values WHERE metric_id = $3 AND period = $2 AND site_id IS NULL LIMIT 1) AS travel_value`,
      [tenantA.companyId, period, travelMetricId],
    );
    assert.equal(persisted.rows[0]?.raw_count, "3", "no queued raw mutation may commit after the period lock");
    assert.equal(persisted.rows[0]?.metric_count, "1", "no queued metric mutation may commit after the period lock");
    assert.equal(persisted.rows[0]?.travel_value, "9.0000", "the queued calculated update must not change the existing value");
    assert.equal(persisted.rows[0]?.lock_count, "1", "the winning period lock must be durable");

    const quarterRead = await apiRequest("GET", "/api/data-entry/2098-Q1", undefined, tenantA.adminToken);
    expectStatus(quarterRead, 200, "quarterly data-entry lock state");
    assert.equal(JSON.parse(quarterRead.body).periodLocked, true, "a quarter must report locked when any month is locked");
    const annualRead = await apiRequest("GET", "/api/data-entry/2098", undefined, tenantA.adminToken);
    expectStatus(annualRead, 200, "annual data-entry lock state");
    assert.equal(JSON.parse(annualRead.body).periodLocked, true, "an annual period must report locked when any month is locked");
    expectStatus(await apiRequest("GET", "/api/data-entry/2098-3", undefined, tenantA.adminToken), 400, "invalid read period");
    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId,
      period: "2098-Q1",
      value: 606,
      siteId: null,
    }, tenantA.adminToken), 400, "quarterly write overlapping a locked month");

    const tenantBCanonical = await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId,
      reportingPeriodStart: "2096-01-01T00:00:00.000Z",
      reportingPeriodEnd: "2096-01-31T23:59:59.999Z",
      valueNumeric: "12",
      siteId: null,
    }, tenantB.adminToken);
    expectStatus(tenantBCanonical, 200, "tenant B canonical value setup");
    const tenantBCanonicalId = JSON.parse(tenantBCanonical.body).id as string;
    assert.ok(tenantBCanonicalId);
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${tenantBCanonicalId}`, {
      valueNumeric: "999",
    }, tenantA.adminToken), 404, "canonical patch remains tenant isolated");

    const canonicalCreatePeriod = "2098-09";
    await blocker.query("BEGIN");
    blockerTransactionOpen = true;
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [periodMutationLockKey(tenantA.companyId, canonicalCreatePeriod)],
    );
    const canonicalCreateIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const canonicalCreateIdentity = canonicalCreateIdentityResult.rows[0];
    assert.ok(canonicalCreateIdentity);
    const canonicalPeriodLock = apiRequest(
      "POST",
      `/api/data-entry/${canonicalCreatePeriod}/lock`,
      {},
      tenantA.adminToken,
    );
    await waitForAdvisoryWaiters(observer, canonicalCreateIdentity, 1);
    const canonicalCreate = apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId,
      reportingPeriodStart: "2098-09-01T00:00:00.000Z",
      reportingPeriodEnd: "2098-09-30T23:59:59.999Z",
      valueNumeric: "77",
      siteId: null,
    }, tenantA.adminToken);
    await waitForAdvisoryWaiters(observer, canonicalCreateIdentity, 2);
    await blocker.query("COMMIT");
    blockerTransactionOpen = false;
    expectStatus(await withTimeout(canonicalPeriodLock, "canonical create period lock"), 200, "canonical create period lock");
    expectStatus(await withTimeout(canonicalCreate, "canonical create behind lock"), 400, "canonical create queued behind lock");
    const canonicalCreateCount = await observer.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM metric_definition_values
       WHERE business_id = $1 AND metric_definition_id = $2
         AND to_char(reporting_period_start, 'YYYY-MM') = '2098-09'`,
      [tenantA.companyId, metricDefinitionId],
    );
    assert.equal(canonicalCreateCount.rows[0]?.count, "0", "canonical create must not commit after a monthly lock");

    const canonicalPatchSetup = await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId,
      reportingPeriodStart: "2098-10-01T00:00:00.000Z",
      reportingPeriodEnd: "2098-10-31T23:59:59.999Z",
      valueNumeric: "31",
      siteId: null,
    }, tenantA.adminToken);
    expectStatus(canonicalPatchSetup, 200, "canonical patch setup");
    const canonicalPatchId = JSON.parse(canonicalPatchSetup.body).id as string;
    assert.ok(canonicalPatchId);

    const canonicalPatchPeriod = "2098-10";
    await blocker.query("BEGIN");
    blockerTransactionOpen = true;
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [periodMutationLockKey(tenantA.companyId, canonicalPatchPeriod)],
    );
    const canonicalPatchIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const canonicalPatchIdentity = canonicalPatchIdentityResult.rows[0];
    assert.ok(canonicalPatchIdentity);
    const canonicalPatchLock = apiRequest(
      "POST",
      `/api/data-entry/${canonicalPatchPeriod}/lock`,
      {},
      tenantA.adminToken,
    );
    await waitForAdvisoryWaiters(observer, canonicalPatchIdentity, 1);
    const canonicalPatch = apiRequest("PATCH", `/api/metric-definition-values/${canonicalPatchId}`, {
      valueNumeric: "99",
    }, tenantA.adminToken);
    await waitForAdvisoryWaiters(observer, canonicalPatchIdentity, 2);
    await blocker.query("COMMIT");
    blockerTransactionOpen = false;
    expectStatus(await withTimeout(canonicalPatchLock, "canonical patch period lock"), 200, "canonical patch period lock");
    expectStatus(await withTimeout(canonicalPatch, "canonical patch behind lock"), 400, "canonical patch queued behind lock");
    const canonicalPatchValue = await observer.query<{ value_numeric: string }>(
      "SELECT value_numeric::text FROM metric_definition_values WHERE id = $1",
      [canonicalPatchId],
    );
    assert.equal(canonicalPatchValue.rows[0]?.value_numeric, "31.000000", "canonical patch must not change a locked value");

    const rangeTargetPeriod = "2098-08";
    const reportingRange = await observer.query<{ id: string }>(
      `INSERT INTO reporting_periods (
         id, company_id, name, period_type, start_date, end_date, status
       ) VALUES (
         gen_random_uuid(), $1, 'Concurrent summer range', 'quarterly',
         '2098-06-15 00:00:00', '2098-08-01 00:00:00', 'open'
       ) RETURNING id`,
      [tenantA.companyId],
    );

    await blocker.query("BEGIN");
    blockerTransactionOpen = true;
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [periodMutationLockKey(tenantA.companyId, rangeTargetPeriod)],
    );
    const rangeIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const rangeIdentity = rangeIdentityResult.rows[0];
    assert.ok(rangeIdentity, "the reporting-range blocker advisory lock must be visible");

    const reportingRangeLockRequest = apiRequest(
      "POST",
      `/api/reporting-periods/${reportingRange.rows[0]?.id}/lock`,
      {},
      tenantA.adminToken,
    );
    await waitForAdvisoryWaiters(observer, rangeIdentity, 1);
    const rangeWrite = apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "505" },
      period: rangeTargetPeriod,
      siteId: null,
    }, tenantA.adminToken);
    await waitForAdvisoryWaiters(observer, rangeIdentity, 2);

    await blocker.query("COMMIT");
    blockerTransactionOpen = false;
    const rangeLockResult = await withTimeout(reportingRangeLockRequest, "reporting-range lock");
    expectStatus(rangeLockResult, 200, "queued reporting-range lock");
    assert.equal(JSON.parse(rangeLockResult.body).status, "locked");
    expectStatus(
      await withTimeout(rangeWrite, "write behind reporting-range lock"),
      400,
      "guided write queued behind reporting-range lock",
    );
    const rangePersistence = await observer.query<{ status: string; raw_count: string }>(
      `SELECT
         (SELECT status::text FROM reporting_periods WHERE id = $2) AS status,
         (SELECT count(*) FROM raw_data_inputs WHERE company_id = $1 AND period = $3)::text AS raw_count`,
      [tenantA.companyId, reportingRange.rows[0]?.id, rangeTargetPeriod],
    );
    assert.equal(rangePersistence.rows[0]?.status, "locked");
    assert.equal(rangePersistence.rows[0]?.raw_count, "0", "no monthly write may commit after its reporting range is locked");
    expectStatus(
      await apiRequest("POST", `/api/reporting-periods/${reportingRange.rows[0]?.id}/close`, {}, tenantA.adminToken),
      409,
      "locked reporting ranges are terminal",
    );
    const stillLocked = await observer.query<{ status: string }>(
      "SELECT status::text FROM reporting_periods WHERE id = $1",
      [reportingRange.rows[0]?.id],
    );
    assert.equal(stillLocked.rows[0]?.status, "locked", "close must not silently unlock a reporting range");
  } finally {
    if (blockerTransactionOpen) await blocker.query("ROLLBACK").catch(() => {});
    await blocker.end();
    await observer.end();
  }

  console.log("period lock concurrency tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
