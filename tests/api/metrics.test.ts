/**
 * API tests: Metrics domain
 *
 * Covers: valid create (data-entry), validation failure, company scoping,
 * persistence (submit then retrieve), and target setting.
 *
 * Run: npx tsx tests/api/metrics.test.ts
 */

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

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const PERIOD = "2024-Q1";

  // ── 1. GET /api/metrics returns array ────────────────────────────────────
  {
    const name = "GET /api/metrics returns 200 array for admin";
    const res = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body) || body.length === 0) fail(name, "empty or non-array");
      else pass(name, `${body.length} metrics`);
    }
  }

  // ── 2. Contributor can list metrics ──────────────────────────────────────
  {
    const name = "contributor can GET /api/metrics";
    const res = await apiRequest("GET", "/api/metrics", undefined, tenantA.contributorToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 3. Valid data-entry creates record ────────────────────────────────────
  let createdEntryId: string | null = null;
  let testMetricId: string | null = null;
  {
    const name = "POST /api/data-entry with valid payload returns 200/201 with id";
    const metricRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    const metrics = JSON.parse(metricRes.body) as Array<{ id: string }>;
    testMetricId = metrics[0]?.id ?? null;
    if (!testMetricId) { fail(name, "no metric id available"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        period: PERIOD,
        value: 42.5,
        notes: "API test entry",
      }, tenantA.adminToken);
      if (![200, 201].includes(res.status)) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
      else {
        const body = JSON.parse(res.body) as { id?: string };
        if (!body.id) fail(name, "missing id in response");
        else {
          createdEntryId = body.id;
          pass(name, `id=${body.id}`);
        }
      }
    }
  }

  // ── 4. Submitted value is retrievable ────────────────────────────────────
  {
    const name = "submitted metric value is retrievable via /api/metrics/:id/values";
    if (!testMetricId) {
      fail(name, "skipped — no metricId");
    } else {
      const res = await apiRequest("GET", `/api/metrics/${testMetricId}/values`, undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `status=${res.status}`);
      else {
        const values = JSON.parse(res.body) as Array<{ period: string }>;
        const found = values.find(v => v.period === PERIOD);
        if (!found) fail(name, `period ${PERIOD} not found in values`);
        else pass(name);
      }
    }
  }

  // ── 5. Validation: missing period → 400 ──────────────────────────────────
  {
    const name = "POST /api/data-entry without period returns 400";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        value: 1,
      }, tenantA.adminToken);
      if (res.status !== 400) fail(name, `status=${res.status}`);
      else {
        const body = JSON.parse(res.body) as { error?: string };
        if (!body.error) fail(name, "missing error field");
        else pass(name);
      }
    }
  }

  // ── 6. Validation: non-numeric value → 400 ───────────────────────────────
  {
    const name = "POST /api/data-entry with non-numeric value returns 400";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        period: PERIOD,
        value: "not-a-number",
      }, tenantA.adminToken);
      if (res.status !== 400) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 7. Cross-company scoping: Tenant A cannot read Tenant B metric values ─
  {
    const name = "Tenant A cannot GET Tenant B metric values (403 or 404)";
    const res = await apiRequest("GET", `/api/metrics/${tenantB.metricId}/values`, undefined, tenantA.adminToken);
    if (![403, 404].includes(res.status)) fail(name, `expected 403/404 got ${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 8. Viewer can read own-company metric values ──────────────────────────
  {
    const name = "viewer can GET /api/metrics/:id/values for own company";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("GET", `/api/metrics/${testMetricId}/values`, undefined, tenantA.viewerToken);
      if (res.status !== 200) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 9. Admin can set metric target ────────────────────────────────────────
  {
    const name = "admin can PUT /api/metrics/:id/target (200)";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("PUT", `/api/metrics/${testMetricId}/target`, {
        targetValue: 100,
        targetYear: 2025,
        targetType: "reduction",
      }, tenantA.adminToken);
      if (res.status >= 500) fail(name, `server error status=${res.status}`);
      else if (![200, 201].includes(res.status)) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
      else pass(name);
    }
  }

  // ── 10. Contributor blocked from target setting ───────────────────────────
  {
    const name = "contributor PUT /api/metrics/:id/target returns 403";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("PUT", `/api/metrics/${testMetricId}/target`, {
        targetValue: 50,
        targetYear: 2025,
        targetType: "absolute",
      }, tenantA.contributorToken);
      if (res.status !== 403) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 11. Unauthenticated blocked ───────────────────────────────────────────
  {
    const name = "POST /api/data-entry without token returns 401";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        period: PERIOD,
        value: 1,
      });
      if (res.status !== 401) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Metrics Domain ===\n");
  let tenants: SeededTenants;
  try {
    console.log("Seeding test tenants…");
    tenants = await seedTestTenants();
    console.log("Seed complete.\n");
  } catch (err) {
    console.error("SEED FAILED:", err);
    process.exit(1);
  }

  await run(tenants);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n=== Metrics: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
