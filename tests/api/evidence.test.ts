/**
 * API tests: Evidence domain
 *
 * Covers: upload metadata, list retrieval, cross-company access control,
 * viewer restriction, and missing-field validation.
 *
 * Run: npx tsx tests/api/evidence.test.ts
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
  const { tenantA } = tenants;

  // ── 1. GET /api/evidence returns array ───────────────────────────────────
  {
    const name = "GET /api/evidence returns 200 array for admin";
    const res = await apiRequest("GET", "/api/evidence", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else pass(name, `${body.length} records`);
    }
  }

  // ── 2. Viewer can list evidence ──────────────────────────────────────────
  {
    const name = "viewer can GET /api/evidence (200)";
    const res = await apiRequest("GET", "/api/evidence", undefined, tenantA.viewerToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 3. Admin can upload evidence record ───────────────────────────────────
  let createdEvidenceId: string | null = null;
  const uniqueFilename = `api-test-evidence-${Date.now()}.pdf`;
  {
    const name = "admin POST /api/evidence with metadata returns 200 and id";
    const res = await apiRequest("POST", "/api/evidence", {
      filename: uniqueFilename,
      fileUrl: "https://example.com/test-evidence.pdf",
      fileType: "pdf",
      linkedModule: "metric_value",
      description: "API domain test evidence",
    }, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
    else {
      const body = JSON.parse(res.body) as { id?: string; filename?: string };
      if (!body.id) fail(name, "missing id");
      else if (body.filename !== uniqueFilename) fail(name, `filename mismatch: ${body.filename}`);
      else {
        createdEvidenceId = body.id;
        pass(name, `id=${body.id}`);
      }
    }
  }

  // ── 4. Uploaded record appears in list ────────────────────────────────────
  {
    const name = "uploaded evidence appears in GET /api/evidence list";
    if (!createdEvidenceId) { fail(name, "skipped — upload failed"); }
    else {
      const res = await apiRequest("GET", "/api/evidence", undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `list status=${res.status}`);
      else {
        const list = JSON.parse(res.body) as Array<{ id?: string }>;
        const found = list.find(e => e.id === createdEvidenceId);
        if (!found) fail(name, `id=${createdEvidenceId} not in list`);
        else pass(name);
      }
    }
  }

  // ── 5. Contributor can upload evidence ────────────────────────────────────
  {
    const name = "contributor POST /api/evidence returns 200";
    const res = await apiRequest("POST", "/api/evidence", {
      filename: `contrib-test-${Date.now()}.pdf`,
      fileUrl: "https://example.com/contrib-test.pdf",
      fileType: "pdf",
      linkedModule: "metric_value",
    }, tenantA.contributorToken);
    if (res.status >= 500) fail(name, `server error status=${res.status}`);
    else if (![200, 201].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 6. Viewer cannot upload evidence → 403 ───────────────────────────────
  {
    const name = "viewer POST /api/evidence returns 403";
    const res = await apiRequest("POST", "/api/evidence", {
      filename: "viewer-attempt.pdf",
      fileType: "pdf",
      linkedModule: "metric_value",
    }, tenantA.viewerToken);
    if (res.status !== 403) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 7. Missing filename → 400 ─────────────────────────────────────────────
  {
    const name = "POST /api/evidence without filename returns 400 (not 500)";
    const res = await apiRequest("POST", "/api/evidence", {
      linkedModule: "metric_value",
    }, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error — must return 400");
    else if (![400, 403].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 8. Unauthenticated → 401 ──────────────────────────────────────────────
  {
    const name = "GET /api/evidence without token returns 401";
    const res = await apiRequest("GET", "/api/evidence");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 9. Evidence coverage endpoint — no 500 ───────────────────────────────
  {
    const name = "GET /api/evidence/coverage returns 200 or 404, never 500";
    const res = await apiRequest("GET", "/api/evidence/coverage", undefined, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 404].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 10. Company isolation: Tenant A list contains no Tenant B company data ─
  {
    const name = "evidence list is company-scoped (no cross-tenant data leakage)";
    const resA = await apiRequest("GET", "/api/evidence", undefined, tenantA.adminToken);
    if (resA.status !== 200) fail(name, `status=${resA.status}`);
    else {
      const listA = JSON.parse(resA.body) as Array<{ companyId?: string }>;
      const leak = listA.find(e => e.companyId === tenants.tenantB.companyId);
      if (leak) fail(name, "Tenant B companyId found in Tenant A evidence list");
      else pass(name);
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Evidence Domain ===\n");
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
  console.log(`\n=== Evidence: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
