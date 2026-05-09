/**
 * API tests: ESG Profile metrics section
 *
 * Run: npx tsx tests/api/esg-profile.test.ts
 */

import { Client } from "pg";
import { seedTestTenants, apiRequest } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function seedProfileMetrics(companyId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const suffix = Date.now().toString();
    const metricRows = await client.query<{ id: string; name: string }>(
      `INSERT INTO metrics (company_id, name, category, unit, enabled, display_order)
       VALUES
         ($1, $2, 'environmental', 'kWh', true, 9001),
         ($1, $3, 'social', 'ratio', true, 9002),
         ($1, $4, 'governance', '%', true, 9003),
         ($1, $5, 'environmental', 'tCO2e', true, 9004),
         ($1, $6, 'social', 'hours', false, 9005),
         ($1, $7, 'environmental', 'm3', true, 9006)
       RETURNING id, name`,
      [
        companyId,
        `Profile Electricity ${suffix}`,
        `Profile Ratio ${suffix}`,
        `Profile Percentage ${suffix}`,
        `Profile Zero ${suffix}`,
        `Profile Inactive ${suffix}`,
        `Profile Site Scoped ${suffix}`,
      ],
    );

    const metricByName = new Map(metricRows.rows.map(row => [row.name, row.id]));
    const siteResult = await client.query<{ id: string }>(
      `INSERT INTO organisation_sites (company_id, name, slug, type, status, country)
       VALUES ($1, $2, $3, 'operational', 'active', 'GB')
       RETURNING id`,
      [companyId, `Profile Site ${suffix}`, `profile-site-${suffix}`],
    );
    const siteId = siteResult.rows[0].id;

    await client.query(
      `INSERT INTO metric_values (metric_id, period, value, status, site_id)
       VALUES
         ($1, '2099-01', '4990.0000', 'green', NULL),
         ($2, '2099-01', '0.5040', 'amber', NULL),
         ($3, '2099-01', '52.2800', 'green', NULL),
         ($4, '2099-01', '0.0000', 'red', NULL),
         ($5, '2099-01', '999.9999', 'green', NULL),
         ($6, '2099-01', '12.3456', 'green', $7)`,
      [
        metricByName.get(`Profile Electricity ${suffix}`),
        metricByName.get(`Profile Ratio ${suffix}`),
        metricByName.get(`Profile Percentage ${suffix}`),
        metricByName.get(`Profile Zero ${suffix}`),
        metricByName.get(`Profile Inactive ${suffix}`),
        metricByName.get(`Profile Site Scoped ${suffix}`),
        siteId,
      ],
    );

    const countResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM metrics WHERE company_id = $1 AND enabled IS TRUE",
      [companyId],
    );

    return {
      suffix,
      enabledMetricCount: Number(countResult.rows[0].count),
      expectedValues: new Map([
        [`Profile Electricity ${suffix}`, { value: "4990.00", unit: "kWh" }],
        [`Profile Ratio ${suffix}`, { value: "0.50", unit: "ratio" }],
        [`Profile Percentage ${suffix}`, { value: "52.28", unit: "%" }],
        [`Profile Zero ${suffix}`, { value: "0.00", unit: "tCO2e" }],
        [`Profile Site Scoped ${suffix}`, { value: "12.35", unit: "m3" }],
      ]),
      inactiveMetricName: `Profile Inactive ${suffix}`,
    };
  } finally {
    await client.end();
  }
}

async function run(tenants: SeededTenants): Promise<void> {
  const seeded = await seedProfileMetrics(tenants.tenantA.companyId);

  const res = await apiRequest("GET", "/api/company/esg-profile", undefined, tenants.tenantA.adminToken);
  if (res.status !== 200) {
    fail("GET /api/company/esg-profile returns 200", `status=${res.status} body=${res.body.slice(0, 200)}`);
    return;
  }

  const profile = JSON.parse(res.body) as { key_metrics?: Array<{ id?: string; name: string; value: string | null; unit?: string | null; hasValue?: boolean }> };
  const keyMetrics = profile.key_metrics ?? [];

  try {
    if (keyMetrics.length !== seeded.enabledMetricCount) {
      throw new Error(`expected ${seeded.enabledMetricCount} enabled metrics, got ${keyMetrics.length}`);
    }
    pass("ESG Profile returns all enabled metrics", `${keyMetrics.length} metrics`);
  } catch (error: any) {
    fail("ESG Profile returns all enabled metrics", error.message);
  }

  try {
    const ids = keyMetrics.map(metric => metric.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error("duplicate metric ids returned");
    pass("ESG Profile key metrics are deduplicated");
  } catch (error: any) {
    fail("ESG Profile key metrics are deduplicated", error.message);
  }

  try {
    if (keyMetrics.some(metric => metric.name === seeded.inactiveMetricName)) {
      throw new Error("inactive metric was returned");
    }
    pass("ESG Profile excludes inactive metrics");
  } catch (error: any) {
    fail("ESG Profile excludes inactive metrics", error.message);
  }

  for (const [metricName, expected] of seeded.expectedValues) {
    const testName = `ESG Profile formats ${metricName.replace(` ${seeded.suffix}`, "")} value to two decimals`;
    try {
      const metric = keyMetrics.find(item => item.name === metricName);
      if (!metric) throw new Error("metric missing from profile");
      if (metric.value !== expected.value) throw new Error(`expected value ${expected.value}, got ${metric.value}`);
      if (metric.unit !== expected.unit) throw new Error(`expected unit ${expected.unit}, got ${metric.unit}`);
      pass(testName);
    } catch (error: any) {
      fail(testName, error.message);
    }
  }

  try {
    const serialized = JSON.stringify(keyMetrics);
    if (/NaN|undefined/.test(serialized)) throw new Error(`malformed value in payload: ${serialized.slice(0, 200)}`);
    pass("ESG Profile metric payload does not contain malformed numeric strings");
  } catch (error: any) {
    fail("ESG Profile metric payload does not contain malformed numeric strings", error.message);
  }
}

(async () => {
  console.log("\n=== API Tests: ESG Profile Metrics ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("ESG Profile test setup", error.message);
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== ESG Profile metrics: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
