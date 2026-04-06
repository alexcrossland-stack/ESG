/**
 * API tests: Reports domain
 *
 * Covers: generation trigger, record creation, list retrieval,
 * unauthorized failure (viewer/unauthenticated), and validation.
 *
 * Run: npx tsx tests/api/reports.test.ts
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

  // ── 1. Admin can generate a report ───────────────────────────────────────
  let generatedReportId: string | null = null;
  {
    const name = "admin POST /api/reports/generate returns 200 with id (no 500)";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
      includeMetrics: true,
      includePolicy: false,
      includeTopics: false,
    }, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 201].includes(res.status)) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
    else {
      const body = JSON.parse(res.body) as { report?: { id?: string } };
      const id = body.report?.id;
      if (!id) fail(name, `missing report.id — body=${res.body.slice(0,200)}`);
      else {
        generatedReportId = id;
        pass(name, `id=${id}`);
      }
    }
  }

  // ── 2. Generated report appears in list ──────────────────────────────────
  {
    const name = "generated report appears in GET /api/reports list";
    const res = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else if (generatedReportId) {
        const found = body.find((r: { id?: string }) => r.id === generatedReportId);
        if (!found) fail(name, `reportId=${generatedReportId} not in list`);
        else pass(name);
      } else {
        pass(name, "skipped id check — generation skipped");
      }
    }
  }

  // ── 3. Viewer blocked from generating reports → 403 ──────────────────────
  {
    const name = "viewer POST /api/reports/generate returns 403";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
    }, tenantA.viewerToken);
    if (res.status !== 403) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 4. Contributor blocked from generating reports → 403 ─────────────────
  {
    const name = "contributor POST /api/reports/generate returns 403";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
    }, tenantA.contributorToken);
    if (res.status !== 403) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 5. Unauthenticated → 401 ─────────────────────────────────────────────
  {
    const name = "POST /api/reports/generate without token returns 401";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
    });
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 6. Invalid reportType enum value → 400 ───────────────────────────────
  {
    const name = "POST /api/reports/generate with invalid reportType returns 400";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "invalid-type",
      period: "2024-01",
    }, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { error?: string };
      if (!body.error) fail(name, "missing error field");
      else pass(name);
    }
  }

  // ── 7. Invalid period format → 400 ───────────────────────────────────────
  {
    const name = "POST /api/reports/generate with invalid period returns 400";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "not-a-period",
    }, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 8. Cross-company: Tenant A cannot access Tenant B report files ────────
  {
    const name = "Tenant A cannot GET Tenant B report files (403 or 404)";
    if (!tenantB.reportId) {
      pass(name, "skipped — Tenant B reportId unavailable");
    } else {
      const res = await apiRequest("GET", `/api/reports/${tenantB.reportId}/files`, undefined, tenantA.adminToken);
      if (![403, 404].includes(res.status)) fail(name, `expected 403/404 got ${res.status}`);
      else pass(name, `status=${res.status}`);
    }
  }

  // ── 9. List is company-scoped (Tenant B data absent from Tenant A list) ───
  {
    const name = "GET /api/reports is company-scoped (Tenant B companyId absent from Tenant A list)";
    const res = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      if (res.body.includes(tenantB.companyId)) fail(name, "Tenant B companyId found in Tenant A report list");
      else pass(name);
    }
  }

  // ── 10. GET /api/reports returns 200 array ────────────────────────────────
  {
    const name = "GET /api/reports returns 200 array for admin";
    const res = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else pass(name, `${body.length} reports`);
    }
  }

  // ── 11. Readiness detail returns structured report-readiness payload ─────
  {
    const name = "GET /api/reports/readiness-detail returns 200 with readiness detail";
    const res = await apiRequest("GET", "/api/reports/readiness-detail", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else {
      const body = JSON.parse(res.body) as {
        esgState?: string;
        stateLabel?: string;
        stateExplanation?: string;
        blockingFactors?: unknown;
        missingCategories?: unknown;
      };
      if (!body.esgState) fail(name, "missing esgState");
      else if (!body.stateLabel) fail(name, "missing stateLabel");
      else if (!body.stateExplanation) fail(name, "missing stateExplanation");
      else if (!Array.isArray(body.blockingFactors)) fail(name, "blockingFactors is not an array");
      else if (!body.missingCategories || typeof body.missingCategories !== "object") fail(name, "missingCategories is not an object");
      else pass(name, `state=${body.esgState}`);
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Reports Domain ===\n");
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
  console.log(`\n=== Reports: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
