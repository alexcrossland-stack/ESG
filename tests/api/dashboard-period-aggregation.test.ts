/** Run only against the disposable acceptance database/server. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { apiRequest, apiRequestRaw, seedTestTenants } from "../fixtures/seed";

async function run() {
  assert.ok(process.env.DATABASE_URL);
  const { tenantA, tenantB } = await seedTestTenants();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const metricId = randomUUID(), siteA = randomUUID(), siteB = randomUUID(), archived = randomUUID();
  try {
    await client.query("UPDATE companies SET plan_tier='pro', plan_status='active' WHERE id=$1", [tenantA.companyId]);
    await client.query("UPDATE metrics SET enabled=false WHERE company_id=$1", [tenantA.companyId]);
    await client.query("INSERT INTO metrics(id,company_id,name,category,unit,frequency,metric_type,enabled,direction) VALUES($1,$2,'Period aggregation regression','environmental','kWh','monthly','manual',true,'lower_is_better')", [metricId, tenantA.companyId]);
    for (const [id, name, status] of [[siteA, "Site A", "active"], [siteB, "Site B", "active"], [archived, "Archived site", "archived"]]) {
      await client.query("INSERT INTO organisation_sites(id,company_id,name,slug,status) VALUES($1,$2,$3,$4,$5)", [id, tenantA.companyId, name, `regression-${id}`, status]);
    }
    for (const [period, a, b] of [["2026-08", 100, 200], ["2026-09", 110, 220], ["2026-11", 900, 990]] as const) {
      for (const [siteId, value] of [[siteA, a], [siteB, b]]) {
        const saved = await apiRequest("POST", "/api/data-entry", { metricId, period, siteId, value }, tenantA.adminToken);
        assert.equal(saved.status, 200, saved.body.slice(0, 300));
      }
    }
    await client.query("INSERT INTO metric_values(id, metric_id,period,site_id,value) VALUES($1,$2,'2026-09',$3,'99999')", [randomUUID(), metricId, archived]);
    const response = await apiRequest("GET", "/api/dashboard/enhanced?period=2026-09", undefined, tenantA.adminToken);
    assert.equal(response.status, 200, response.body.slice(0, 300));
    const result = JSON.parse(response.body);
    const metric = result.metricSummaries.find((row: any) => row.id === metricId);
    assert.equal(metric.latestValue, 330);
    assert.equal(metric.previousValue, 300);
    assert.equal(metric.percentChange, 10);
    assert.deepEqual(metric.trend, [{ period: "2026-08", value: 300 }, { period: "2026-09", value: 330 }]);
    assert.equal(result.siteBreakdown.find((row: any) => row.siteId === siteA).metricCount, 1);
    assert.equal(result.siteBreakdown.find((row: any) => row.siteId === siteB).metricCount, 1);
    assert.ok(!result.siteBreakdown.some((row: any) => row.siteId === archived));
    const other = await apiRequest("GET", "/api/dashboard/enhanced?period=2026-09", undefined, tenantB.adminToken);
    assert.equal(other.status, 200);
    assert.ok(!JSON.parse(other.body).metricSummaries.some((row: any) => row.id === metricId));
    const unauthenticated = await apiRequest("GET", "/api/dashboard/enhanced?period=2026-09");
    assert.equal(unauthenticated.status, 401);
    const unknown = await apiRequestRaw("GET", "/api/unknown-platform-trust-regression", undefined, tenantA.adminToken);
    assert.equal(unknown.status, 404);
    assert.match(unknown.headers.get("content-type") || "", /json/);
    console.log("PASS actual dashboard API: 330/300/10%, aggregated past-only history, active-site counts, tenant isolation/auth, JSON missing API");
  } finally {
    await client.query("DELETE FROM metric_values WHERE metric_id=$1", [metricId]);
    await client.query("DELETE FROM metrics WHERE id=$1 AND company_id=$2", [metricId, tenantA.companyId]);
    await client.query("DELETE FROM organisation_sites WHERE company_id=$1 AND id=ANY($2::varchar[])", [tenantA.companyId, [siteA, siteB, archived]]);
    await client.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
