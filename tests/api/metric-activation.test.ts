import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

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

async function ensureMetricDefinition(
  client: Client,
  input: {
    code: string;
    name: string;
    pillar?: "environmental" | "social" | "governance";
    category?: string;
    description?: string;
    unit?: string | null;
    isCore?: boolean;
    isActive?: boolean;
  },
): Promise<{ id: string; name: string }> {
  const existing = await client.query<{ id: string; name: string }>(
    "SELECT id, name FROM metric_definitions WHERE lower(name) = lower($1) LIMIT 1",
    [input.name],
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query<{ id: string; name: string }>(
    `INSERT INTO metric_definitions
      (code, name, pillar, category, description, data_type, unit, input_frequency, is_core, is_active, is_derived, scoring_weight, sort_order, evidence_required, rollup_method)
     VALUES
      ($1, $2, $3, $4, $5, 'numeric', $6, 'monthly', $7, $8, false, '1', 999, false, 'sum')
     RETURNING id, name`,
    [
      input.code,
      input.name,
      input.pillar ?? "environmental",
      input.category ?? "General",
      input.description ?? null,
      input.unit ?? null,
      input.isCore ?? false,
      input.isActive ?? true,
    ],
  );
  return inserted.rows[0];
}

async function run() {
  const tenants = await seedTestTenants();
  const tenantA = tenants.tenantA;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL env var not set");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const recommendedDef = await ensureMetricDefinition(client, {
      code: "QA_ENV_ELEC_KWH",
      name: "Electricity Consumption",
      pillar: "environmental",
      category: "Energy",
      description: "QA seeded recommended default definition",
      unit: "kWh",
      isCore: true,
      isActive: true,
    });

    const libraryRes = await apiRequest("GET", "/api/metric-definitions", undefined, tenantA.adminToken);
    if (libraryRes.status !== 200) {
      fail("GET /api/metric-definitions returns 200 for admin", `status=${libraryRes.status}`);
      return;
    }
    pass("GET /api/metric-definitions returns 200 for admin");

    const definitions = JSON.parse(libraryRes.body) as Array<{ id: string; name: string; isActive: boolean; isCore: boolean }>;
    const enabledDefinitionCount = definitions.filter((metric) => metric.isActive).length;
    const recommendedLibraryMetric = definitions.find((metric) => metric.name === recommendedDef.name);
    if (!recommendedLibraryMetric) {
      fail("Recommended default definition appears in Metrics Library", recommendedDef.name);
    } else if (!recommendedLibraryMetric.isActive) {
      fail("New company gets recommended defaults enabled in Metrics Library", recommendedDef.name);
    } else {
      pass("New company gets recommended defaults enabled in Metrics Library", recommendedDef.name);
    }

    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (metricsRes.status !== 200) {
      fail("GET /api/metrics returns 200", `status=${metricsRes.status}`);
      return;
    }

    const companyMetrics = JSON.parse(metricsRes.body) as Array<{ id: string; name: string; enabled: boolean; isDefault: boolean }>;
    const enabledDefaults = companyMetrics.filter((metric) => metric.enabled && metric.isDefault);
    const enabledCompanyMetrics = companyMetrics.filter((metric) => metric.enabled);
    if (enabledDefaults.length === 0) {
      fail("New company has recommended defaults enabled in company metrics");
    } else {
      pass("New company has recommended defaults enabled in company metrics", `${enabledDefaults.length} enabled defaults`);
    }

    if (enabledCompanyMetrics.length !== enabledDefinitionCount) {
      fail("Enabled Metrics Library count matches enabled company metrics count", `library=${enabledDefinitionCount} metrics=${enabledCompanyMetrics.length}`);
    } else {
      pass("Enabled Metrics Library count matches enabled company metrics count", `${enabledCompanyMetrics.length}`);
    }

    const initialDataEntryRes = await apiRequest("GET", "/api/data-entry/2024-01", undefined, tenantA.adminToken);
    if (initialDataEntryRes.status !== 200) {
      fail("GET /api/data-entry/2024-01 returns 200 for enabled metric denominator", `status=${initialDataEntryRes.status}`);
    } else {
      const dataEntry = JSON.parse(initialDataEntryRes.body) as { metrics: Array<{ name: string }> };
      if (dataEntry.metrics.length !== enabledDefinitionCount) {
        fail("Enabled Metrics Library count matches Enter Data enabled metric denominator", `library=${enabledDefinitionCount} data-entry=${dataEntry.metrics.length}`);
      } else {
        pass("Enabled Metrics Library count matches Enter Data enabled metric denominator", `${dataEntry.metrics.length}`);
      }
    }

    const disableRes = await apiRequest("PATCH", `/api/metric-definitions/${recommendedDef.id}/toggle`, undefined, tenantA.adminToken);
    if (disableRes.status !== 200) {
      fail("Disabling a recommended metric from Metrics Library returns 200", `status=${disableRes.status}`);
    } else {
      pass("Disabling a recommended metric from Metrics Library returns 200");
    }

    const metricsAfterDisableRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    const metricsAfterDisable = JSON.parse(metricsAfterDisableRes.body) as Array<{ id: string; name: string; enabled: boolean }>;
    const disabledMetric = metricsAfterDisable.find((metric) => metric.name === recommendedDef.name);
    if (!disabledMetric || disabledMetric.enabled) {
      fail("Disabling a recommended metric updates company metric enabled state", recommendedDef.name);
    } else {
      pass("Disabling a recommended metric updates company metric enabled state", recommendedDef.name);
    }

    const dataEntryAfterDisableRes = await apiRequest("GET", "/api/data-entry/2024-01", undefined, tenantA.adminToken);
    if (dataEntryAfterDisableRes.status !== 200) {
      fail("GET /api/data-entry/2024-01 returns 200 after disabling metric", `status=${dataEntryAfterDisableRes.status}`);
    } else {
      const dataEntry = JSON.parse(dataEntryAfterDisableRes.body) as { metrics: Array<{ name: string }> };
      const stillVisible = dataEntry.metrics.some((metric) => metric.name === recommendedDef.name);
      if (stillVisible) fail("Disabled recommended metric is removed from Enter Data", recommendedDef.name);
      else pass("Disabled recommended metric is removed from Enter Data", recommendedDef.name);
    }

    const customName = "QA Activation Metric";
    const customDef = await ensureMetricDefinition(client, {
      code: "QA_OPTIONAL_ENABLE",
      name: customName,
      pillar: "governance",
      category: "Operations",
      description: "QA optional library metric",
      unit: "%",
      isCore: false,
      isActive: false,
    });

    const enableRes = await apiRequest("PATCH", `/api/metric-definitions/${customDef.id}/toggle`, undefined, tenantA.adminToken);
    if (enableRes.status !== 200) {
      fail("Enabling a disabled library metric returns 200", `status=${enableRes.status}`);
    } else {
      pass("Enabling a disabled library metric returns 200");
    }

    const metricsAfterEnableRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    const metricsAfterEnable = JSON.parse(metricsAfterEnableRes.body) as Array<{ name: string; enabled: boolean }>;
    const enabledMetric = metricsAfterEnable.find((metric) => metric.name === customName);
    if (!enabledMetric || !enabledMetric.enabled) {
      fail("Enabling a disabled metric adds it to company metrics", customName);
    } else {
      pass("Enabling a disabled metric adds it to company metrics", customName);
    }

    const dataEntryAfterEnableRes = await apiRequest("GET", "/api/data-entry/2024-01", undefined, tenantA.adminToken);
    if (dataEntryAfterEnableRes.status !== 200) {
      fail("GET /api/data-entry/2024-01 returns 200 after enabling metric", `status=${dataEntryAfterEnableRes.status}`);
    } else {
      const dataEntry = JSON.parse(dataEntryAfterEnableRes.body) as { metrics: Array<{ name: string }> };
      const visible = dataEntry.metrics.some((metric) => metric.name === customName);
      if (!visible) fail("Enabled manual metric appears in Enter Data", customName);
      else pass("Enabled manual metric appears in Enter Data", customName);
    }
  } finally {
    await client.end();
  }
}

(async () => {
  console.log("\n=== API Tests: Metric Activation ===\n");
  try {
    await run();
  } catch (error) {
    console.error("TEST FAILED:", error);
    process.exit(1);
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Metric activation: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
