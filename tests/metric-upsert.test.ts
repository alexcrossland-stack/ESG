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
import {
  parseStrictCanonicalReportingDate,
  toCanonicalPgTimestamp,
} from "../server/canonical-reporting-date.js";
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
  const metrics = JSON.parse(res.body) as Array<{ id: string; enabled?: boolean; metricType?: string | null }>;
  const metricId = metrics.find((metric) => metric.enabled !== false && (!metric.metricType || metric.metricType === "manual"))?.id;
  if (!metricId) throw new Error("No tenant A metric found for test");
  return metricId;
}

async function getTenantAMetricIds(adminToken: string, count: number): Promise<string[]> {
  const res = await apiRequest("GET", "/api/metrics", undefined, adminToken);
  if (res.status !== 200) {
    throw new Error(`GET /api/metrics failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  }
  const metrics = JSON.parse(res.body) as Array<{ id: string; enabled?: boolean; metricType?: string | null }>;
  const metricIds = metrics
    .filter((metric) => metric.enabled !== false && (!metric.metricType || metric.metricType === "manual"))
    .slice(0, count)
    .map((metric) => metric.id)
    .filter(Boolean);
  if (metricIds.length < count) throw new Error(`Expected at least ${count} metrics for bulk paste test`);
  return metricIds;
}

async function getMetricDefinitionId(client: Client): Promise<string> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM metric_definitions
     WHERE is_derived = false AND is_active = true AND data_type = 'numeric'
     ORDER BY created_at ASC LIMIT 1`,
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
  const result = await client.query<{
    count: string;
    value: string | null;
    value_text: string | null;
    value_boolean: boolean | null;
  }>(
    `
      SELECT
        COUNT(*)::int AS count,
        MAX(value::text) AS value,
        MAX(value_text) AS value_text,
        BOOL_OR(value_boolean) FILTER (WHERE value_boolean IS NOT NULL) AS value_boolean
      FROM metric_values
      WHERE metric_id = $1
        AND period = $2
        AND (
          ($3::text IS NULL AND site_id IS NULL)
          OR site_id = $3::text
        )
    `,
    [metricId, period, siteId],
  );
  return {
    count: Number(result.rows[0]?.count ?? 0),
    value: result.rows[0]?.value ?? null,
    valueText: result.rows[0]?.value_text ?? null,
    valueBoolean: result.rows[0]?.value_boolean ?? null,
  };
}

async function createBooleanMetricForCompany(client: Client, companyId: string) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const name = `Bulk Boolean Regression ${suffix}`;
  await client.query(
    `
      INSERT INTO metric_definitions (
        code,
        name,
        pillar,
        category,
        description,
        data_type,
        unit,
        input_frequency,
        is_core,
        is_active,
        is_derived
      )
      VALUES ($1, $2, 'governance', 'governance', 'Bulk boolean regression fixture', 'boolean', 'Yes/No', 'monthly', false, true, false)
    `,
    [`bulk_boolean_${suffix}`, name],
  );
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO metrics (
        company_id,
        name,
        description,
        category,
        unit,
        frequency,
        enabled,
        is_default,
        metric_type
      )
      VALUES ($1, $2, 'Bulk boolean regression fixture', 'governance', 'Yes/No', 'monthly', true, false, 'manual')
      RETURNING id
    `,
    [companyId, name],
  );
  const metricId = result.rows[0]?.id;
  if (!metricId) throw new Error("Could not create boolean metric fixture");
  return metricId;
}

async function countMetricDefinitionValues(
  client: Client,
  businessId: string,
  metricDefinitionId: string,
  periodStart: string,
  periodEnd: string,
  siteId: string | null,
) {
  const parsedPeriodStart = parseStrictCanonicalReportingDate(periodStart);
  const parsedPeriodEnd = parseStrictCanonicalReportingDate(periodEnd);
  if (!parsedPeriodStart || !parsedPeriodEnd) {
    throw new Error("Metric-definition-value count requires canonical reporting dates");
  }
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
    [
      businessId,
      metricDefinitionId,
      toCanonicalPgTimestamp(parsedPeriodStart),
      toCanonicalPgTimestamp(parsedPeriodEnd),
      siteId,
    ],
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
      siteId: "__org__",
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

async function testBulkMetricPasteUpsert(adminToken: string, metricIds: string[], client: Client) {
  console.log("\n── bulk metric paste tests ──");

  const validateRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: [
      { metricId: metricIds[0], period: "2026-04", rawValue: "1,250" },
      { metricId: metricIds[1], period: "2026-04", rawValue: "£250" },
    ],
  }, adminToken);

  if (validateRes.status === 200) {
    const body = JSON.parse(validateRes.body) as ValidationShape;
    if (body.summary.createCount === 2 && body.summary.errorCount === 0) {
      pass("bulk validate reports create counts before commit", `creates=${body.summary.createCount}`);
    } else {
      fail("bulk validate should classify pending creates", JSON.stringify(body.summary));
    }
  } else {
    fail("bulk validate should return 200", `status=${validateRes.status}`);
  }

  const commitRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "commit",
    cells: [
      { metricId: metricIds[0], period: "2026-04", rawValue: "1,250" },
      { metricId: metricIds[1], period: "2026-04", rawValue: "£250" },
    ],
  }, adminToken);

  if (commitRes.status === 200) {
    const firstRow = await countMetricValues(client, metricIds[0], "2026-04", null);
    const secondRow = await countMetricValues(client, metricIds[1], "2026-04", null);
    if (
      firstRow.count === 1 &&
      secondRow.count === 1 &&
      numericTextEquals(firstRow.value, 1250) &&
      numericTextEquals(secondRow.value, 250)
    ) {
      pass("bulk commit stores normalized values once per metric/month", `values=${firstRow.value},${secondRow.value}`);
    } else {
      fail("bulk commit should persist normalized values", `row1=${JSON.stringify(firstRow)} row2=${JSON.stringify(secondRow)}`);
    }
  } else {
    fail("bulk commit should succeed", `status=${commitRes.status}`);
  }

  const updateRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "commit",
    cells: [
      { metricId: metricIds[0], period: "2026-04", rawValue: "" },
      { metricId: metricIds[1], period: "2026-04", rawValue: "12%" },
    ],
  }, adminToken);

  if (updateRes.status === 200) {
    const firstRow = await countMetricValues(client, metricIds[0], "2026-04", null);
    const secondRow = await countMetricValues(client, metricIds[1], "2026-04", null);
    if (
      firstRow.count === 1 &&
      secondRow.count === 1 &&
      firstRow.value === null &&
      numericTextEquals(secondRow.value, 12)
    ) {
      pass("bulk commit can clear values and update existing rows without duplicates", `cleared=${firstRow.value} updated=${secondRow.value}`);
    } else {
      fail("bulk commit should clear/update existing rows", `row1=${JSON.stringify(firstRow)} row2=${JSON.stringify(secondRow)}`);
    }
  } else {
    fail("bulk update commit should succeed", `status=${updateRes.status}`);
  }
}

async function testBulkBooleanMetricPaste(adminToken: string, booleanMetricId: string, numericMetricId: string, client: Client) {
  console.log("\n── bulk yes/no metric paste tests ──");

  const variants = [
    { period: "2026-09", rawValue: "Yes", expected: true, label: "Yes" },
    { period: "2026-10", rawValue: "no", expected: false, label: "No" },
    { period: "2026-11", rawValue: "Y", expected: true, label: "Yes" },
    { period: "2026-12", rawValue: "N", expected: false, label: "No" },
    { period: "2027-01", rawValue: "TRUE", expected: true, label: "Yes" },
    { period: "2027-02", rawValue: "false", expected: false, label: "No" },
    { period: "2027-03", rawValue: "1", expected: true, label: "Yes" },
    { period: "2027-04", rawValue: "0", expected: false, label: "No" },
  ];

  const validateRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: variants.map(({ period, rawValue }) => ({ metricId: booleanMetricId, period, rawValue })),
  }, adminToken);

  if (validateRes.status === 200) {
    const body = JSON.parse(validateRes.body) as ValidationShape;
    const normalizedLabels = (body.cells || []).map((cell) => cell.normalizedText);
    if (
      body.ok === true &&
      body.summary.errorCount === 0 &&
      body.summary.createCount === variants.length &&
      normalizedLabels.join(",") === variants.map((variant) => variant.label).join(",")
    ) {
      pass("bulk validate accepts yes/no paste variants and normalizes display labels", normalizedLabels.join(","));
    } else {
      fail("bulk validate should accept yes/no paste variants", JSON.stringify({ summary: body.summary, normalizedLabels, cells: body.cells }));
    }
  } else {
    fail("bulk yes/no validate should return 200", `status=${validateRes.status} body=${validateRes.body.slice(0, 200)}`);
  }

  const invalidBooleanRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: [{ metricId: booleanMetricId, period: "2027-05", rawValue: "maybe" }],
  }, adminToken);
  if (invalidBooleanRes.status === 200) {
    const body = JSON.parse(invalidBooleanRes.body) as ValidationShape;
    const errors = (body.cells || []).flatMap((cell) => cell.errors);
    if (body.ok === false && errors.some((error) => error.includes("Yes/No"))) {
      pass("bulk validate rejects invalid yes/no labels", errors.join(","));
    } else {
      fail("bulk validate should reject invalid yes/no labels", JSON.stringify(body));
    }
  } else {
    fail("bulk invalid yes/no validate should return 200", `status=${invalidBooleanRes.status}`);
  }

  const invalidNumericRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: [{ metricId: numericMetricId, period: "2027-05", rawValue: "maybe" }],
  }, adminToken);
  if (invalidNumericRes.status === 200) {
    const body = JSON.parse(invalidNumericRes.body) as ValidationShape;
    const errors = (body.cells || []).flatMap((cell) => cell.errors);
    if (body.ok === false && errors.some((error) => error.includes("numeric"))) {
      pass("bulk validate still rejects non-numeric text for numeric metrics", errors.join(","));
    } else {
      fail("bulk validate should reject non-numeric text for numeric metrics", JSON.stringify(body));
    }
  } else {
    fail("bulk invalid numeric validate should return 200", `status=${invalidNumericRes.status}`);
  }

  const commitRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "commit",
    cells: [
      { metricId: booleanMetricId, period: "2027-06", rawValue: "Yes" },
      { metricId: booleanMetricId, period: "2027-07", rawValue: "No" },
    ],
  }, adminToken);

  if (commitRes.status === 200) {
    const yesRow = await countMetricValues(client, booleanMetricId, "2027-06", null);
    const noRow = await countMetricValues(client, booleanMetricId, "2027-07", null);
    if (
      yesRow.count === 1 &&
      yesRow.value === null &&
      yesRow.valueText === "Yes" &&
      yesRow.valueBoolean === true &&
      noRow.count === 1 &&
      noRow.value === null &&
      noRow.valueText === "No" &&
      noRow.valueBoolean === false
    ) {
      pass("bulk commit stores yes/no metrics as boolean and display text", `yes=${yesRow.valueText}/${yesRow.valueBoolean} no=${noRow.valueText}/${noRow.valueBoolean}`);
    } else {
      fail("bulk commit should store yes/no values in typed columns", `yes=${JSON.stringify(yesRow)} no=${JSON.stringify(noRow)}`);
    }
  } else {
    fail("bulk yes/no commit should succeed", `status=${commitRes.status} body=${commitRes.body.slice(0, 200)}`);
  }

  const reloadRes = await apiRequest("GET", "/api/data-entry/bulk-grid?periods=2027-06,2027-07&siteId=null", undefined, adminToken);
  if (reloadRes.status === 200) {
    const body = JSON.parse(reloadRes.body) as { values?: Array<{ metricId: string; period: string; value: string | null; valueText?: string | null; valueBoolean?: boolean | null }> };
    const yes = (body.values || []).find((value) => value.metricId === booleanMetricId && value.period === "2027-06");
    const no = (body.values || []).find((value) => value.metricId === booleanMetricId && value.period === "2027-07");
    if (yes?.value === "Yes" && yes.valueText === "Yes" && yes.valueBoolean === true && no?.value === "No" && no.valueText === "No" && no.valueBoolean === false) {
      pass("bulk grid reload displays yes/no values as labels", `yes=${yes.value} no=${no.value}`);
    } else {
      fail("bulk grid reload should display yes/no labels", JSON.stringify({ yes, no }));
    }
  } else {
    fail("bulk grid reload should return 200", `status=${reloadRes.status} body=${reloadRes.body.slice(0, 200)}`);
  }

  const exportRes = await apiRequest("GET", "/api/reports/export-data/esg_metrics_summary?period=2027-06&siteId=null", undefined, adminToken);
  if (exportRes.status === 200) {
    const body = JSON.parse(exportRes.body) as { values?: Array<{ metricId: string; value?: unknown; valueText?: string | null; valueBoolean?: boolean | null; displayValue?: string | null }> };
    const row = (body.values || []).find((value) => value.metricId === booleanMetricId);
    if (row && row.valueText === "Yes" && row.valueBoolean === true && String(row.displayValue ?? row.valueText) === "Yes") {
      pass("report export-data keeps yes/no values as labels", JSON.stringify({ valueText: row.valueText, valueBoolean: row.valueBoolean, displayValue: row.displayValue }));
    } else {
      fail("report export-data should expose yes/no labels", JSON.stringify(row));
    }
  } else {
    fail("report export-data for bulk yes/no metric should return 200", `status=${exportRes.status} body=${exportRes.body.slice(0, 200)}`);
  }
}

type ValidationShape = {
  summary: {
    createCount: number;
    updateCount: number;
    clearCount: number;
    errorCount: number;
    warningCount: number;
  };
  ok?: boolean;
  rowIssues?: Array<{ metricName: string | null; errors: string[]; warnings: string[] }>;
  cells?: Array<{
    status: string;
    normalizedValue: number | null;
    normalizedText?: string | null;
    normalizedBoolean?: boolean | null;
    normalizedDisplayValue?: string | null;
    errors: string[];
    warnings: string[];
  }>;
};

async function insertLockedReportingPeriod(client: Client, companyId: string, month: string) {
  await client.query(
    `
      INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date, status)
      VALUES ($1, $2, 'monthly', $3::timestamp, $4::timestamp, 'locked')
    `,
    [
      companyId,
      `Locked ${month}`,
      `${month}-01T00:00:00.000Z`,
      `${month}-28T23:59:59.999Z`,
    ],
  );
}

async function testBulkMetricPasteValidationEdges(adminToken: string, companyId: string, metricIds: string[], client: Client) {
  console.log("\n── bulk metric paste validation edges ──");

  const mixedRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: [
      { metricId: metricIds[0], period: "2026-05", rawValue: "100" },
      { metricId: metricIds[1], period: "2026-05", rawValue: "1000" },
      { metricId: metricIds[0], period: "2026-06", rawValue: "not-a-number" },
    ],
  }, adminToken);

  if (mixedRes.status === 200) {
    const body = JSON.parse(mixedRes.body) as ValidationShape;
    if ((body.summary.errorCount ?? 0) >= 1 && (body.summary.warningCount ?? 0) >= 1 && body.ok === false) {
      pass("bulk validate returns mixed warnings and blocking errors in one batch", `errors=${body.summary.errorCount} warnings=${body.summary.warningCount}`);
    } else {
      fail("bulk validate should report mixed error/warning batches", JSON.stringify(body.summary));
    }
  } else {
    fail("mixed validation batch should return 200", `status=${mixedRes.status}`);
  }

  const duplicateRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: [
      { metricId: metricIds[0], period: "2026-07", rawValue: "10" },
      { metricId: metricIds[0], period: "2026-07", rawValue: "20" },
    ],
  }, adminToken);

  if (duplicateRes.status === 200) {
    const body = JSON.parse(duplicateRes.body) as ValidationShape;
    if ((body.summary.errorCount ?? 0) >= 1) {
      pass("bulk validate blocks duplicate metric/month cells inside one batch", `errors=${body.summary.errorCount}`);
    } else {
      fail("duplicate batch should be rejected before commit", JSON.stringify(body.summary));
    }
  } else {
    fail("duplicate validation batch should return 200", `status=${duplicateRes.status}`);
  }

  await insertLockedReportingPeriod(client, companyId, "2026-08");
  const lockedRes = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
    mode: "validate",
    cells: [
      { metricId: metricIds[0], period: "2026-08", rawValue: "25" },
    ],
  }, adminToken);

  if (lockedRes.status === 200) {
    const body = JSON.parse(lockedRes.body) as ValidationShape;
    if ((body.summary.errorCount ?? 0) >= 1 && (body.rowIssues || []).some((issue) => issue.errors.some((error) => error.includes("locked")))) {
      pass("bulk validate blocks locked reporting periods", "locked month rejected");
    } else {
      fail("locked reporting period should be rejected", JSON.stringify(body));
    }
  } else {
    fail("locked validation batch should return 200", `status=${lockedRes.status}`);
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
    const bulkMetricIds = await getTenantAMetricIds(tenants.tenantA.adminToken, 2);
    const booleanMetricId = await createBooleanMetricForCompany(client, tenants.tenantA.companyId);
    const metricDefinitionId = await getMetricDefinitionId(client);

    await testMetricValuesUpsert(tenants.tenantA.adminToken, metricId, client);
    await testBulkMetricPasteUpsert(tenants.tenantA.adminToken, bulkMetricIds, client);
    await testBulkBooleanMetricPaste(tenants.tenantA.adminToken, booleanMetricId, bulkMetricIds[0], client);
    await testBulkMetricPasteValidationEdges(tenants.tenantA.adminToken, tenants.tenantA.companyId, bulkMetricIds, client);
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
