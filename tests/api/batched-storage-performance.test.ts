/** Non-production regression only: creates and removes its own fictional rows. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { storage, pool } from "../../server/storage";
import { seedTestTenants } from "../fixtures/seed";

assert.equal(process.env.REGRESSION_TEST, "1", "Requires the isolated regression environment");
const { tenantA, tenantB } = await seedTestTenants();
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const siteIds: string[] = [], metricIds = Array.from({ length: 8 }, () => randomUUID());
const originalQuery = pool.query;
try {
  await client.query("INSERT INTO metrics(id,company_id,name,category,unit,frequency) SELECT id,$1,'Batch regression metric','environmental','kWh','monthly' FROM unnest($2::varchar[]) AS id", [tenantA.companyId, metricIds]);
  let queryCount = 0;
  (pool as any).query = (...args: any[]) => { queryCount++; return (originalQuery as any).apply(pool, args); };
  for (const siteCount of [1, 10, 50]) {
    const newIds = Array.from({ length: siteCount - siteIds.length }, () => randomUUID());
    siteIds.push(...newIds);
    await client.query("INSERT INTO organisation_sites(id,company_id,name,slug,status) SELECT id,$1,'Batch site ' || id,'batch-' || id,'active' FROM unnest($2::varchar[]) AS id", [tenantA.companyId, newIds]);
    queryCount = 0;
    const summary = await storage.getSitesSummary(tenantA.companyId, "2026-09");
    assert.equal(queryCount, 4, `Site summary must remain four queries for ${siteCount} sites`);
    assert.equal(summary.filter(row => siteIds.includes(row.siteId || "")).length, siteCount);
  }
  await client.query("INSERT INTO metric_values(id,metric_id,site_id,period,value) SELECT gen_random_uuid(),metric,site,to_char(date '2023-10-01' + (month || ' months')::interval,'YYYY-MM'),'100' FROM unnest($1::varchar[]) metric CROSS JOIN unnest($2::varchar[]) site CROSS JOIN generate_series(0,35) month", [metricIds, siteIds]);
  const measurements: number[] = [];
  for (let iteration = 0; iteration < 10; iteration++) {
    queryCount = 0;
    const started = performance.now();
    const history = await storage.getMetricValuesForMetrics(tenantA.companyId, metricIds, { scope: "all" });
    measurements.push(performance.now() - started);
    assert.equal(queryCount, 1);
    assert.equal(history.length, 8 * 50 * 36);
  }
  assert.equal((await storage.getMetricValuesForMetrics(tenantB.companyId, metricIds, { scope: "all" })).length, 0);
  assert.equal((await storage.getMetricValuesForMetrics(tenantA.companyId, metricIds, { scope: "organisation" })).length, 0);
  assert.equal((await storage.getMetricValuesForMetrics(tenantA.companyId, metricIds, { scope: "site", siteId: siteIds[0] })).length, 8 * 36);
  measurements.sort((a, b) => a - b);
  console.log(`PASS batching: 1/10/50 sites remain 4 queries; 14,400 records across 36 months use 1 history query; tenant and site isolation. Local storage p50=${measurements[4].toFixed(1)}ms, p95=${measurements[9].toFixed(1)}ms (not production/page timings).`);
} finally {
  pool.query = originalQuery;
  await client.query("DELETE FROM metric_values WHERE metric_id=ANY($1::varchar[])", [metricIds]);
  await client.query("DELETE FROM metrics WHERE company_id=$1 AND id=ANY($2::varchar[])", [tenantA.companyId, metricIds]);
  await client.query("DELETE FROM organisation_sites WHERE company_id=$1 AND id=ANY($2::varchar[])", [tenantA.companyId, siteIds]);
  await client.end();
  await pool.end();
}
