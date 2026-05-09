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
    await client.query(
      `INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date, status)
       VALUES ($1, '2099-01', 'monthly', '2099-01-01', '2099-01-31', 'open')`,
      [companyId],
    );

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
         ($1, '2099-02', '100.1000', 'red', NULL),
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

  const profile = JSON.parse(res.body) as {
    reporting_period?: { period?: string; label?: string; source?: string; hasActivePeriod?: boolean };
    key_metrics?: Array<{ id?: string; name: string; value: string | null; unit?: string | null; hasValue?: boolean }>;
  };
  const keyMetrics = profile.key_metrics ?? [];

  try {
    if (profile.reporting_period?.period !== "2099-01") {
      throw new Error(`expected active period 2099-01, got ${profile.reporting_period?.period}`);
    }
    if (profile.reporting_period?.label !== "2099-01") {
      throw new Error(`expected reporting period label 2099-01, got ${profile.reporting_period?.label}`);
    }
    if (profile.reporting_period?.source !== "active") {
      throw new Error(`expected active period source, got ${profile.reporting_period?.source}`);
    }
    pass("ESG Profile exposes the active reporting period");
  } catch (error: any) {
    fail("ESG Profile exposes the active reporting period", error.message);
  }

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
    const selectedRes = await apiRequest("GET", "/api/company/esg-profile?period=2099-02", undefined, tenants.tenantA.adminToken);
    if (selectedRes.status !== 200) throw new Error(`status=${selectedRes.status} body=${selectedRes.body.slice(0, 200)}`);
    const selectedProfile = JSON.parse(selectedRes.body) as typeof profile;
    const electricity = selectedProfile.key_metrics?.find(item => item.name === `Profile Electricity ${seeded.suffix}`);
    const ratio = selectedProfile.key_metrics?.find(item => item.name === `Profile Ratio ${seeded.suffix}`);
    if (selectedProfile.reporting_period?.period !== "2099-02") {
      throw new Error(`expected selected period 2099-02, got ${selectedProfile.reporting_period?.period}`);
    }
    if (electricity?.value !== "100.10") throw new Error(`expected 2099-02 electricity value 100.10, got ${electricity?.value}`);
    if (ratio?.value !== null || ratio?.hasValue !== false) {
      throw new Error("2099-01-only ratio value leaked into selected 2099-02 profile");
    }
    pass("ESG Profile switches metric values with the selected reporting period");
  } catch (error: any) {
    fail("ESG Profile switches metric values with the selected reporting period", error.message);
  }

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL env var not set");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    try {
      await client.query("UPDATE reporting_periods SET status = 'closed' WHERE company_id = $1", [tenants.tenantB.companyId]);
    } finally {
      await client.end();
    }
    const emptyPeriodRes = await apiRequest("GET", "/api/company/esg-profile", undefined, tenants.tenantB.adminToken);
    if (emptyPeriodRes.status !== 200) throw new Error(`status=${emptyPeriodRes.status} body=${emptyPeriodRes.body.slice(0, 200)}`);
    const emptyPeriodProfile = JSON.parse(emptyPeriodRes.body) as typeof profile;
    if (!emptyPeriodProfile.reporting_period?.period) throw new Error("missing fallback reporting period");
    if (emptyPeriodProfile.reporting_period?.source !== "default") {
      throw new Error(`expected default period source, got ${emptyPeriodProfile.reporting_period?.source}`);
    }
    if (emptyPeriodProfile.reporting_period?.hasActivePeriod !== false) {
      throw new Error("expected hasActivePeriod=false when no reporting period is open");
    }
    pass("ESG Profile returns a safe default when no active reporting period exists", emptyPeriodProfile.reporting_period.period);
  } catch (error: any) {
    fail("ESG Profile returns a safe default when no active reporting period exists", error.message);
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
