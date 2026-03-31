/**
 * API tests: Dashboard domain
 *
 * Covers: response shape, company scoping, null/empty crash protection,
 * unauthenticated rejection.
 *
 * Run: npx tsx tests/api/dashboard.test.ts
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

  // ── 1. /api/dashboard/enhanced — no 500 ──────────────────────────────────
  {
    const name = "GET /api/dashboard/enhanced returns 200 or 404, never 500";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 404].includes(res.status)) fail(name, `unexpected status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 2. Response shape contains no raw stack traces ────────────────────────
  {
    const name = "dashboard/enhanced response contains no raw stack traces";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status === 200) {
      if (/at\s+\w+\s*\(/.test(res.body)) fail(name, "stack trace found in response");
      else pass(name);
    } else {
      pass(name, `skipped — status=${res.status}`);
    }
  }

  // ── 3. Response is valid JSON object ─────────────────────────────────────
  {
    const name = "dashboard/enhanced returns valid JSON object when 200";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status === 200) {
      try {
        const body = JSON.parse(res.body);
        if (typeof body !== "object" || body === null) fail(name, "not a valid object");
        else pass(name);
      } catch {
        fail(name, "invalid JSON");
      }
    } else {
      pass(name, `skipped — status=${res.status}`);
    }
  }

  // ── 4. /api/dashboard — no 500 ───────────────────────────────────────────
  {
    const name = "GET /api/dashboard returns 200 or 404, never 500";
    const res = await apiRequest("GET", "/api/dashboard", undefined, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 404].includes(res.status)) fail(name, `unexpected status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 5. Viewer can access dashboard ───────────────────────────────────────
  {
    const name = "viewer can GET /api/dashboard without 500";
    const res = await apiRequest("GET", "/api/dashboard", undefined, tenantA.viewerToken);
    if (res.status === 500) fail(name, "server error for viewer");
    else pass(name, `status=${res.status}`);
  }

  // ── 6. Unauthenticated rejected ───────────────────────────────────────────
  {
    const name = "GET /api/dashboard/enhanced without token returns 401";
    const res = await apiRequest("GET", "/api/dashboard/enhanced");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 7. Company scoping — Tenant A data absent from Tenant B response ──────
  {
    const name = "dashboard is company-scoped (Tenant A companyId absent in Tenant B response)";
    const resB = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantB.adminToken);
    if (resB.status === 200) {
      if (resB.body.includes(tenantA.companyId)) {
        fail(name, "Tenant A companyId leaked into Tenant B dashboard response");
      } else {
        pass(name);
      }
    } else {
      pass(name, `skipped — Tenant B dashboard status=${resB.status}`);
    }
  }

  // ── 8. /api/metrics list is company-scoped ────────────────────────────────
  {
    const name = "GET /api/metrics list is company-scoped (Tenant B IDs absent from Tenant A)";
    const resA = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (resA.status === 200) {
      if (resA.body.includes(tenantB.companyId)) {
        fail(name, "Tenant B companyId leaked into Tenant A metrics response");
      } else {
        pass(name);
      }
    } else {
      fail(name, `GET /api/metrics for Tenant A returned status=${resA.status}`);
    }
  }

  // ── 9. /api/topics list returns array ────────────────────────────────────
  {
    const name = "GET /api/topics returns array for admin";
    const res = await apiRequest("GET", "/api/topics", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      try {
        const body = JSON.parse(res.body);
        if (!Array.isArray(body)) fail(name, "expected array");
        else pass(name, `${body.length} topics`);
      } catch {
        fail(name, "invalid JSON");
      }
    }
  }

  // ── 10. Contributor dashboard access ─────────────────────────────────────
  {
    const name = "contributor can GET /api/dashboard without 500";
    const res = await apiRequest("GET", "/api/dashboard", undefined, tenantA.contributorToken);
    if (res.status === 500) fail(name, "server error for contributor");
    else pass(name, `status=${res.status}`);
  }
}

(async () => {
  console.log("\n=== API Tests: Dashboard Domain ===\n");
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
  console.log(`\n=== Dashboard: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
