import assert from "node:assert/strict";
import { Client } from "pg";
import {
  calculationMutationLockKey,
  periodMutationLockKey,
} from "../../server/period-locks";
import { toCanonicalPgTimestamp } from "../../server/canonical-reporting-date";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type AdvisoryLockIdentity = {
  classid: string;
  objid: string;
  objsubid: number;
};

function expectStatus(
  response: { status: number; body: string },
  expected: number,
  label: string,
): void {
  assert.equal(
    response.status,
    expected,
    `${label}: status=${response.status} body=${response.body.slice(0, 400)}`,
  );
}

async function waitForAdvisoryWaiter(
  observer: Client,
  identity: AdvisoryLockIdentity,
  label: string,
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
    if (Number(result.rows[0]?.count ?? 0) >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 15_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");

  const { tenantA } = await seedTestTenants();
  const observer = new Client({ connectionString: databaseUrl });
  const blocker = new Client({ connectionString: databaseUrl });
  let enginePools: Array<{ end(): Promise<void> }> = [];
  let blockerTransactionOpen = false;
  const period = "2095-06";
  const periodStart = new Date("2095-06-01T00:00:00.000Z");
  const periodEnd = new Date("2095-06-30T23:59:59.999Z");
  const periodStartParameter = toCanonicalPgTimestamp(periodStart);
  const periodEndParameter = toCanonicalPgTimestamp(periodEnd);
  let siteId: string | undefined;

  await observer.connect();
  await blocker.connect();
  try {
    await observer.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
      [tenantA.companyId],
    );

    const definitions = await observer.query<{ id: string; code: string }>(
      `SELECT id, code
       FROM metric_definitions
       WHERE code IN ('E007', 'E008', 'E009') AND is_active = true`,
    );
    const definitionByCode = new Map(definitions.rows.map((row) => [row.code, row.id]));
    for (const code of ["E007", "E008", "E009"]) {
      assert.ok(definitionByCode.get(code), `active ${code} definition is required`);
    }

    const site = await observer.query<{ id: string }>(
      `INSERT INTO organisation_sites (company_id, name, slug, type, status)
       VALUES ($1, 'Canonical race site', $2, 'operational', 'active')
       RETURNING id`,
      [tenantA.companyId, `canonical-race-${process.pid}`],
    );
    siteId = site.rows[0]?.id;
    assert.ok(siteId);

    const createWaste = await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId: definitionByCode.get("E007"),
      siteId,
      reportingPeriodStart: periodStart.toISOString(),
      reportingPeriodEnd: periodEnd.toISOString(),
      valueNumeric: "10",
    }, tenantA.adminToken);
    expectStatus(createWaste, 200, "create site waste total");
    const createdWasteBody = JSON.parse(createWaste.body) as {
      reportingPeriodStart?: string;
      reportingPeriodEnd?: string;
    };
    assert.equal(createdWasteBody.reportingPeriodStart, periodStart.toISOString());
    assert.equal(createdWasteBody.reportingPeriodEnd, periodEnd.toISOString());

    const createRecycled = await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId: definitionByCode.get("E008"),
      siteId,
      reportingPeriodStart: periodStart.toISOString(),
      reportingPeriodEnd: periodEnd.toISOString(),
      valueNumeric: "5",
    }, tenantA.adminToken);
    expectStatus(createRecycled, 200, "create site recycled waste");
    const recycledValueId = (JSON.parse(createRecycled.body) as { id?: string }).id;
    assert.ok(recycledValueId, "recycled-waste value id is required");

    const persistedBounds = await observer.query<{ start: string; end: string }>(
      `SELECT
         to_char(reporting_period_start, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS start,
         to_char(reporting_period_end, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS end
       FROM metric_definition_values
       WHERE id = $1`,
      [recycledValueId],
    );
    assert.deepEqual(persistedBounds.rows[0], {
      start: periodStartParameter,
      end: periodEndParameter,
    }, "canonical API persistence must retain UTC calendar bounds under British Summer Time");

    const initial = await observer.query<{ site_rate: string; org_rate: string }>(
      `SELECT
         (SELECT value_numeric::text FROM metric_definition_values
          WHERE business_id = $1 AND metric_definition_id = $2 AND site_id = $3
            AND reporting_period_start = $4 AND reporting_period_end = $5) AS site_rate,
         (SELECT value_numeric::text FROM metric_definition_values
          WHERE business_id = $1 AND metric_definition_id = $2 AND site_id IS NULL
            AND reporting_period_start = $4 AND reporting_period_end = $5) AS org_rate`,
      [tenantA.companyId, definitionByCode.get("E009"), siteId, periodStartParameter, periodEndParameter],
    );
    assert.equal(Number(initial.rows[0]?.site_rate), 50, "site recycling rate must initially calculate to 50%");
    assert.equal(Number(initial.rows[0]?.org_rate), 50, "organisation recycling rate must initially roll up to 50%");

    const calculationKey = calculationMutationLockKey(tenantA.companyId, period);
    await blocker.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [calculationKey]);
    const calculationIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const calculationIdentity = calculationIdentityResult.rows[0];
    assert.ok(calculationIdentity, "calculation advisory-lock identity is required");
    await blocker.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [calculationKey]);

    const periodKey = periodMutationLockKey(tenantA.companyId, period);
    await blocker.query("BEGIN");
    blockerTransactionOpen = true;
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [periodKey]);
    const periodIdentityResult = await blocker.query<AdvisoryLockIdentity>(
      `SELECT classid::text AS classid, objid::text AS objid, objsubid
       FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted = true
       LIMIT 1`,
    );
    const periodIdentity = periodIdentityResult.rows[0];
    assert.ok(periodIdentity, "period advisory-lock identity is required");

    const [{ runDerivedMetricCalculations }, storageModule] = await Promise.all([
      import("../../server/metric-calculation-engine"),
      import("../../server/storage"),
    ]);
    enginePools = [storageModule.calculationLockPool, storageModule.pool];

    // This older run obtains the exclusive calculation gate and snapshots the
    // 50% inputs, then pauses at its first canonical output write.
    const olderCalculation = runDerivedMetricCalculations(
      tenantA.companyId,
      siteId,
      periodStart,
      periodEnd,
    );
    await waitForAdvisoryWaiter(observer, periodIdentity, "older canonical calculation to reach its output write");

    // The newer user mutation must wait at the shared calculation gate. It
    // cannot commit between the older snapshot and its derived/rollup writes.
    const newerMutation = apiRequest("PATCH", `/api/metric-definition-values/${recycledValueId}`, {
      valueNumeric: "8",
    }, tenantA.adminToken);
    await waitForAdvisoryWaiter(observer, calculationIdentity, "newer canonical source mutation to wait on the calculation gate");

    await blocker.query("COMMIT");
    blockerTransactionOpen = false;
    const olderResult = await withTimeout(olderCalculation, "older canonical calculation");
    assert.deepEqual(olderResult.failures, [], `older calculation failed: ${olderResult.failures.join("; ")}`);
    expectStatus(await withTimeout(newerMutation, "newer canonical mutation"), 200, "newer canonical mutation");

    const final = await observer.query<{
      site_recycled: string;
      site_rate: string;
      org_recycled: string;
      org_rate: string;
    }>(
      `SELECT
         (SELECT value_numeric::text FROM metric_definition_values
          WHERE business_id = $1 AND metric_definition_id = $2 AND site_id = $4
            AND reporting_period_start = $5 AND reporting_period_end = $6) AS site_recycled,
         (SELECT value_numeric::text FROM metric_definition_values
          WHERE business_id = $1 AND metric_definition_id = $3 AND site_id = $4
            AND reporting_period_start = $5 AND reporting_period_end = $6) AS site_rate,
         (SELECT value_numeric::text FROM metric_definition_values
          WHERE business_id = $1 AND metric_definition_id = $2 AND site_id IS NULL
            AND reporting_period_start = $5 AND reporting_period_end = $6) AS org_recycled,
         (SELECT value_numeric::text FROM metric_definition_values
          WHERE business_id = $1 AND metric_definition_id = $3 AND site_id IS NULL
            AND reporting_period_start = $5 AND reporting_period_end = $6) AS org_rate`,
      [
        tenantA.companyId,
        definitionByCode.get("E008"),
        definitionByCode.get("E009"),
        siteId,
        periodStartParameter,
        periodEndParameter,
      ],
    );
    assert.equal(Number(final.rows[0]?.site_recycled), 8, "newest site source value must win");
    assert.equal(Number(final.rows[0]?.site_rate), 80, "site derived value must reflect the newest source");
    assert.equal(Number(final.rows[0]?.org_recycled), 8, "organisation source rollup must reflect the newest source");
    assert.equal(Number(final.rows[0]?.org_rate), 80, "organisation derived rollup must reflect the newest source");

    console.log("canonical calculation concurrency tests passed");
  } finally {
    if (blockerTransactionOpen) await blocker.query("ROLLBACK").catch(() => {});
    if (siteId) {
      await observer.query(
        `DELETE FROM metric_calculation_runs
         WHERE business_id = $1 AND reporting_period_start = $2 AND reporting_period_end = $3`,
        [tenantA.companyId, periodStartParameter, periodEndParameter],
      ).catch(() => {});
      await observer.query(
        `DELETE FROM metric_definition_values
         WHERE business_id = $1 AND reporting_period_start = $2 AND reporting_period_end = $3`,
        [tenantA.companyId, periodStartParameter, periodEndParameter],
      ).catch(() => {});
      await observer.query("DELETE FROM organisation_sites WHERE id = $1", [siteId]).catch(() => {});
    }
    await blocker.end();
    await observer.end();
    for (const enginePool of enginePools) await enginePool.end().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
