/**
 * API regression: recommendations use the canonical reporting context.
 *
 * Run: node --import tsx tests/api/recommendations-period.test.ts
 */

import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import { Client } from "pg";

type Recommendation = {
  type?: string;
  title?: string;
};

type RecommendationsResponse = {
  recommendations?: Recommendation[];
  period?: string;
  reportingContext?: {
    period?: {
      id?: string | null;
      name?: string;
      startDate?: string | null;
      endDate?: string | null;
    };
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function missingMetricCount(body: RecommendationsResponse): number {
  const recommendation = (body.recommendations ?? []).find((item) => item.type === "missing_data");
  if (!recommendation) return 0;
  const match = recommendation.title?.match(/Enter missing data for (\d+) metric/);
  if (!match) throw new Error(`Could not parse missing-data recommendation: ${recommendation.title}`);
  return Number(match[1]);
}

function lowQualityMetricCount(body: RecommendationsResponse): number {
  const recommendation = (body.recommendations ?? []).find((item) => item.type === "low_quality");
  if (!recommendation) return 0;
  const match = recommendation.title?.match(/Improve data quality for (\d+) metric/);
  if (!match) throw new Error(`Could not parse low-quality recommendation: ${recommendation.title}`);
  return Number(match[1]);
}

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function readRecommendations(token: string): Promise<RecommendationsResponse> {
  const response = await apiRequest("GET", "/api/recommendations", undefined, token);
  assert(response.status === 200, `GET /api/recommendations returned ${response.status}: ${response.body.slice(0, 300)}`);
  return JSON.parse(response.body) as RecommendationsResponse;
}

async function run(): Promise<void> {
  console.log("\n=== API Test: Recommendations Reporting Period ===\n");
  const { tenantA } = await seedTestTenants();
  const suffix = Date.now();
  const periodName = `Recommendations FY 2197 ${suffix}`;

  const periodResponse = await apiRequest("POST", "/api/reporting-periods", {
    name: periodName,
    periodType: "annual",
    startDate: "2197-01-01",
    endDate: "2197-12-31",
  }, tenantA.adminToken);
  assert(periodResponse.status === 201, `reporting-period setup returned ${periodResponse.status}: ${periodResponse.body.slice(0, 300)}`);
  const period = JSON.parse(periodResponse.body) as { id?: string };
  assert(period.id, "reporting-period setup omitted id");

  const metricsResponse = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
  assert(metricsResponse.status === 200, `metric setup returned ${metricsResponse.status}`);
  const metrics = JSON.parse(metricsResponse.body) as Array<{ id?: string; enabled?: boolean }>;
  const enabledMetrics = metrics.filter((item) => item.enabled !== false && item.id);
  const metric = enabledMetrics[0];
  const siteMetric = enabledMetrics[1];
  assert(metric?.id && siteMetric?.id, "two enabled metrics were required for the recommendation fixture");

  const siteResponse = await apiRequest("POST", "/api/sites", {
    name: `Recommendations Boundary Site ${suffix}`,
    type: "office",
    country: "United Kingdom",
  }, tenantA.adminToken);
  assert(siteResponse.status === 201, `site setup returned ${siteResponse.status}: ${siteResponse.body.slice(0, 300)}`);
  const site = JSON.parse(siteResponse.body) as { id?: string };
  assert(site.id, "site setup omitted id");

  const before = await readRecommendations(tenantA.adminToken);
  assert(before.period === periodName, `recommendations used ${before.period} instead of ${periodName}`);
  assert(before.reportingContext?.period?.id === period.id, "recommendations did not expose the canonical reporting-period identity");
  assert(before.reportingContext?.period?.startDate === "2197-01-01", "recommendations exposed the wrong period start");
  assert(before.reportingContext?.period?.endDate === "2197-12-31", "recommendations exposed the wrong period end");
  const missingBefore = missingMetricCount(before);
  assert(missingBefore > 0, "fresh recommendation fixture unexpectedly had no missing metrics");

  const outsideResponse = await apiRequest("POST", "/api/data-entry", {
    metricId: metric.id,
    period: "2196-12",
    value: 41,
    notes: "outside canonical recommendation period",
    siteId: "__org__",
  }, tenantA.adminToken);
  assert([200, 201].includes(outsideResponse.status), `outside-period data entry returned ${outsideResponse.status}: ${outsideResponse.body.slice(0, 300)}`);
  const afterOutside = await readRecommendations(tenantA.adminToken);
  assert(
    missingMetricCount(afterOutside) === missingBefore,
    "a metric value outside the canonical period changed the missing-data recommendation",
  );

  const insideResponse = await apiRequest("POST", "/api/data-entry", {
    metricId: metric.id,
    period: "2197-06",
    value: 42,
    dataSourceType: "estimated",
    siteId: "__org__",
  }, tenantA.adminToken);
  assert([200, 201].includes(insideResponse.status), `inside-period data entry returned ${insideResponse.status}: ${insideResponse.body.slice(0, 300)}`);
  const insideValue = JSON.parse(insideResponse.body) as { id?: string };
  assert(insideValue.id, "inside-period data entry omitted its metric-value id");
  const afterInside = await readRecommendations(tenantA.adminToken);
  assert(
    missingMetricCount(afterInside) === missingBefore - 1,
    `contained monthly entry did not reduce missing count ${missingBefore} -> ${missingMetricCount(afterInside)}`,
  );

  const lowQualityBefore = lowQualityMetricCount(afterInside);
  assert(lowQualityBefore > 0, "estimated in-scope fixture did not produce a low-quality recommendation");
  const activeSiteResponse = await apiRequest("POST", "/api/data-entry", {
    metricId: siteMetric.id,
    period: "2197-07",
    value: 43,
    dataSourceType: "estimated",
    siteId: site.id,
  }, tenantA.adminToken);
  assert([200, 201].includes(activeSiteResponse.status), `active-site data entry returned ${activeSiteResponse.status}: ${activeSiteResponse.body.slice(0, 300)}`);
  const afterActiveSite = await readRecommendations(tenantA.adminToken);
  assert(
    missingMetricCount(afterActiveSite) === missingBefore - 2,
    "a contained monthly entry at an active site did not satisfy the metric",
  );
  assert(
    lowQualityMetricCount(afterActiveSite) === lowQualityBefore + 1,
    "the active-site estimated entry was not included in the quality recommendation",
  );

  const archiveSiteResponse = await apiRequest("DELETE", `/api/sites/${site.id}`, undefined, tenantA.adminToken);
  assert(archiveSiteResponse.status === 200, `site archive returned ${archiveSiteResponse.status}: ${archiveSiteResponse.body.slice(0, 300)}`);
  const afterArchive = await readRecommendations(tenantA.adminToken);
  assert(
    missingMetricCount(afterArchive) === missingBefore - 1,
    "an archived-site entry still suppressed the missing-data recommendation",
  );
  assert(
    lowQualityMetricCount(afterArchive) === lowQualityBefore,
    "an archived-site entry still contributed to the quality recommendation",
  );

  await withDb(async (client) => {
    await client.query(
      `INSERT INTO evidence_files
         (company_id, filename, metric_id, linked_module, linked_entity_id, linked_period, evidence_status, site_id)
       VALUES ($1, $2, $3, 'metric_value', $4, '2197-06', 'uploaded', $5)`,
      [tenantA.companyId, `archived-site-evidence-${suffix}.txt`, metric.id, insideValue.id, site.id],
    );
  });
  const afterArchivedEvidence = await readRecommendations(tenantA.adminToken);
  assert(
    lowQualityMetricCount(afterArchivedEvidence) === lowQualityBefore,
    "archived-site evidence raised the quality score of an in-boundary metric value",
  );

  console.log("  PASS  canonical annual context and active-site fact/evidence boundaries drive recommendations");
  console.log("\n=== Recommendations Reporting Period: 1/1 passed ===\n");
}

run().catch((error) => {
  console.error(`  FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
