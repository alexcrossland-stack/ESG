/**
 * Metric submission uniqueness regression tests.
 *
 * Verifies DB-level uniqueness and idempotent upsert behavior for:
 * - metric_values
 * - metric_definition_values
 *
 * Run: node --import tsx tests/metric-upsert.test.ts
 */

import { Client } from "pg";
import { apiRequest, seedTestTenants } from "./fixtures/seed.js";

const PERIOD = "2026-02";
const CONCURRENT_PERIOD = "2026-03";
const REPORTING_PERIOD_START = "2026-02-01T00:00:00.000Z";
const REPORTING_PERIOD_END = "2026-02-28T23:59:59.999Z";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function numericTextEquals(actual: string | null, expected: number): boolean {
  if (actual === null) return false;
  return Math.abs(Number(actual) - expected) < 0.000001;
}

async function createDbClient(): Promise<Client> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

async function enableProPlan(client: Client, companyId: string) {
  await client.query(
    "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
    [companyId],
  );
}

async function getTenantAMetricId(adminToken: string): Promise<string> {
  const res = await apiRequest("GET", "/api/metrics", undefined, adminToken);
  if (res.status !== 200) {
    throw new Error(`GET /api/metrics failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  }
  const metrics = JSON.parse(res.body) as Array<{ id: string }>;
  const metricId = metrics[0]?.id;
  if (!metricId) throw new Error("No tenant A metric found for test");
  return metricId;
}

async function getMetricDefinitionId(client: Client): Promise<string> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM metric_definitions WHERE is_derived = false ORDER BY created_at ASC LIMIT 1",
  );
  const metricDefinitionId = result.rows[0]?.id;
  if (!metricDefinitionId) throw new Error("No metric definition found for test");
  return metricDefinitionId;
}

async function createSite(adminToken: string, name: string): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office" }, adminToken);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`POST /api/sites failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  }
  const parsed = JSON.parse(res.body) as { id?: string };
  if (!parsed.id) throw new Error(`POST /api/sites missing id: ${res.body.slice(0, 200)}`);
  return parsed.id;
}

async function countMetricValues(client: Client, metricId: string, period: string, siteId: string | null) {
  const result = await client.query<{ count: string; value: string | null }>(
    `
      SELECT COUNT(*)::int AS count, MAX(value::text) AS value
      FROM metric_values
      WHERE metric_id = $1
        AND period = $2
        AND (
          ($3::uuid IS NULL AND site_id IS NULL)
          OR site_id = $3::uuid
        )
    `,
    [metricId, period, siteId],
  );
  return {
    count: Number(result.rows[0]?.count ?? 0),
    value: result.rows[0]?.value ?? null,
  };
}

async function countMetricDefinitionValues(
  client: Client,
  businessId: string,
  metricDefinitionId: string,
  periodStart: string,
  periodEnd: string,
  siteId: string | null,
) {
  const result = await client.query<{ count: string; value_numeric: string | null }>(
    `
      SELECT COUNT(*)::int AS count, MAX(value_numeric::text) AS value_numeric
      FROM metric_definition_values
      WHERE business_id = $1
        AND metric_definition_id = $2
        AND reporting_period_start = $3::timestamp
        AND reporting_period_end = $4::timestamp
        AND (
          ($5::text IS NULL AND site_id IS NULL)
          OR site_id = $5::text
        )
    `,
    [businessId, metricDefinitionId, periodStart, periodEnd, siteId],
  );
  return {
    count: Number(result.rows[0]?.count ?? 0),
    valueNumeric: result.rows[0]?.value_numeric ?? null,
  };
}

async function testMetricValuesUpsert(adminToken: string, metricId: string, client: Client) {
  console.log("\n── metric_values upsert tests ──");

  const first = await apiRequest("POST", "/api/data-entry", {
    metricId,
    period: PERIOD,
    value: 10,
    notes: "first submission",
  }, adminToken);
  const second = await apiRequest("POST", "/api/data-entry", {
    metricId,
    period: PERIOD,
    value: 25,
    notes: "second submission",
  }, adminToken);

  if ([200, 201].includes(first.status) && [200, 201].includes(second.status)) {
    const row = await countMetricValues(client, metricId, PERIOD, null);
    if (row.count === 1 && numericTextEquals(row.value, 25)) {
      pass("metric_values repeated submissions remain a single org-level row", `count=1 value=${row.value}`);
    } else {
      fail("metric_values repeated submissions should upsert", `count=${row.count} value=${row.value}`);
    }
  } else {
    fail("metric_values repeated submissions should succeed", `statuses=${first.status},${second.status}`);
  }

  const siteId = await createSite(adminToken, `Upsert site ${Date.now()}`);
  const siteRes = await apiRequest("POST", "/api/data-entry", {
    metricId,
    period: PERIOD,
    value: 33,
    siteId,
  }, adminToken);

  if ([200, 201].includes(siteRes.status)) {
    const orgRow = await countMetricValues(client, metricId, PERIOD, null);
    const siteRow = await countMetricValues(client, metricId, PERIOD, siteId);
    if (
      orgRow.count === 1 &&
      siteRow.count === 1 &&
      numericTextEquals(orgRow.value, 25) &&
      numericTextEquals(siteRow.value, 33)
    ) {
      pass("metric_values natural key stays distinct by site", `org=${orgRow.value} site=${siteRow.value}`);
    } else {
      fail("metric_values should allow a distinct row per site", `orgCount=${orgRow.count} siteCount=${siteRow.count}`);
    }
  } else {
    fail("metric_values site-scoped submission should succeed", `status=${siteRes.status}`);
  }

  const concurrentBodies = Array.from({ length: 4 }, (_, idx) =>
    apiRequest("POST", "/api/data-entry", {
      metricId,
      period: CONCURRENT_PERIOD,
      value: 100 + idx,
      notes: `concurrent-${idx}`,
    }, adminToken),
  );
  const concurrentResponses = await Promise.all(concurrentBodies);
  const concurrentRow = await countMetricValues(client, metricId, CONCURRENT_PERIOD, null);
  const allSucceeded = concurrentResponses.every((res) => [200, 201].includes(res.status));
  if (allSucceeded && concurrentRow.count === 1) {
    pass("metric_values concurrent submissions collapse to one row", `count=1 value=${concurrentRow.value}`);
  } else {
    fail(
      "metric_values concurrent submissions should remain unique",
      `statuses=${concurrentResponses.map((r) => r.status).join(",")} count=${concurrentRow.count}`,
    );
  }
}

async function testMetricDefinitionValuesUpsert(
  adminToken: string,
  businessId: string,
  metricDefinitionId: string,
  client: Client,
) {
  console.log("\n── metric_definition_values upsert tests ──");

  const first = await apiRequest("POST", "/api/metric-definition-values", {
    metricDefinitionId,
    reportingPeriodStart: REPORTING_PERIOD_START,
    reportingPeriodEnd: REPORTING_PERIOD_END,
    valueNumeric: "12.5",
    sourceType: "manual",
    notes: "first metric-definition submission",
  }, adminToken);
  const second = await apiRequest("POST", "/api/metric-definition-values", {
    metricDefinitionId,
    reportingPeriodStart: REPORTING_PERIOD_START,
    reportingPeriodEnd: REPORTING_PERIOD_END,
    valueNumeric: "19.75",
    sourceType: "manual",
    notes: "second metric-definition submission",
  }, adminToken);

  if ([200, 201].includes(first.status) && [200, 201].includes(second.status)) {
    const row = await countMetricDefinitionValues(
      client,
      businessId,
      metricDefinitionId,
      REPORTING_PERIOD_START,
      REPORTING_PERIOD_END,
      null,
    );
    if (row.count === 1 && numericTextEquals(row.valueNumeric, 19.75)) {
      pass("metric_definition_values repeated submissions remain a single org-level row", `count=1 value=${row.valueNumeric}`);
    } else {
      fail("metric_definition_values repeated submissions should upsert", `count=${row.count} value=${row.valueNumeric}`);
    }
  } else {
    fail("metric_definition_values repeated submissions should succeed", `statuses=${first.status},${second.status}`);
  }

  const siteId = await createSite(adminToken, `Definition site ${Date.now()}`);
  const siteRes = await apiRequest("POST", "/api/metric-definition-values", {
    metricDefinitionId,
    siteId,
    reportingPeriodStart: REPORTING_PERIOD_START,
    reportingPeriodEnd: REPORTING_PERIOD_END,
    valueNumeric: "44.25",
    sourceType: "manual",
  }, adminToken);

  if ([200, 201].includes(siteRes.status)) {
    const orgRow = await countMetricDefinitionValues(
      client,
      businessId,
      metricDefinitionId,
      REPORTING_PERIOD_START,
      REPORTING_PERIOD_END,
      null,
    );
    const siteRow = await countMetricDefinitionValues(
      client,
      businessId,
      metricDefinitionId,
      REPORTING_PERIOD_START,
      REPORTING_PERIOD_END,
      siteId,
    );
    if (
      orgRow.count === 1 &&
      siteRow.count === 1 &&
      numericTextEquals(siteRow.valueNumeric, 44.25)
    ) {
      pass("metric_definition_values natural key stays distinct by site", `org=${orgRow.valueNumeric} site=${siteRow.valueNumeric}`);
    } else {
      fail(
        "metric_definition_values should allow a distinct row per site",
        `orgCount=${orgRow.count} siteCount=${siteRow.count} orgValue=${orgRow.valueNumeric} siteValue=${siteRow.valueNumeric}`,
      );
    }
  } else {
    fail("metric_definition_values site-scoped submission should succeed", `status=${siteRes.status}`);
  }

  const concurrentBodies = Array.from({ length: 4 }, (_, idx) =>
    apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId,
      reportingPeriodStart: "2026-03-01T00:00:00.000Z",
      reportingPeriodEnd: "2026-03-31T23:59:59.999Z",
      valueNumeric: String(50 + idx),
      sourceType: "manual",
      notes: `definition-concurrent-${idx}`,
    }, adminToken),
  );
  const concurrentResponses = await Promise.all(concurrentBodies);
  const concurrentRow = await countMetricDefinitionValues(
    client,
    businessId,
    metricDefinitionId,
    "2026-03-01T00:00:00.000Z",
    "2026-03-31T23:59:59.999Z",
    null,
  );
  const allSucceeded = concurrentResponses.every((res) => [200, 201].includes(res.status));
  if (allSucceeded && concurrentRow.count === 1) {
    pass("metric_definition_values concurrent submissions collapse to one row", `count=1 value=${concurrentRow.valueNumeric}`);
  } else {
    fail(
      "metric_definition_values concurrent submissions should remain unique",
      `statuses=${concurrentResponses.map((r) => r.status).join(",")} count=${concurrentRow.count}`,
    );
  }
}

async function run() {
  console.log("Metric upsert regression tests");
  console.log("==============================");

  const client = await createDbClient();
  try {
    const tenants = await seedTestTenants();
    await enableProPlan(client, tenants.tenantA.companyId);

    const metricId = await getTenantAMetricId(tenants.tenantA.adminToken);
    const metricDefinitionId = await getMetricDefinitionId(client);

    await testMetricValuesUpsert(tenants.tenantA.adminToken, metricId, client);
    await testMetricDefinitionValuesUpsert(
      tenants.tenantA.adminToken,
      tenants.tenantA.companyId,
      metricDefinitionId,
      client,
    );
  } catch (err) {
    console.error("\nTest runner error:", err);
    process.exit(2);
  } finally {
    await client.end();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n==============================");
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`));
    process.exit(1);
  } else {
    console.log("\nAll metric upsert tests passed.");
  }
}

run();
