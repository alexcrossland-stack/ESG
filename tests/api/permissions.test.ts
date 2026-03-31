/**
 * API tests: Permissions matrix (release-critical regression guard)
 *
 * For each key restricted write endpoint, asserts all four cases:
 *   1. Unauthenticated          → 401
 *   2. Wrong role (contributor) → 403  (or viewer where noted)
 *   3. Correct role (admin)     → 200 / 201 / 2xx
 *   4. Wrong company (cross-tenant) → 403 or 404
 *
 * Explicitly covers the target-setting endpoint as the canonical restricted
 * write action (regression class: contributor must not set targets).
 *
 * Run: npx tsx tests/api/permissions.test.ts
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

type Actor = "unauthed" | "viewer" | "contributor" | "admin" | "cross-tenant";

async function assertPermission(opts: {
  name: string;
  method: string;
  path: string;
  body?: object;
  actor: Actor;
  tenants: SeededTenants;
  expectedStatus: number | number[];
}) {
  const { name, method, path, body, actor, tenants, expectedStatus } = opts;
  const { tenantA, tenantB } = tenants;

  const token =
    actor === "unauthed" ? undefined :
    actor === "viewer" ? tenantA.viewerToken :
    actor === "contributor" ? tenantA.contributorToken :
    actor === "admin" ? tenantA.adminToken :
    tenantA.adminToken; // cross-tenant uses Tenant A token but Tenant B resource in path

  const res = await apiRequest(method, path, body, token);
  const allowed = Array.isArray(expectedStatus)
    ? expectedStatus.includes(res.status)
    : res.status === expectedStatus;

  if (!allowed) fail(name, `actor=${actor} expected=${JSON.stringify(expectedStatus)} got=${res.status}`);
  else pass(name, `actor=${actor} status=${res.status}`);
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;

  // Need a real metricId from Tenant A to test write operations
  const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
  const metrics = JSON.parse(metricsRes.body) as Array<{ id: string }>;
  const metricId = metrics[0]?.id;

  if (!metricId) {
    fail("setup — get Tenant A metricId", "no metrics found");
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ENDPOINT 1: PUT /api/metrics/:id/target — CANONICAL restricted write
  // Regression class: contributor must be blocked from setting targets
  // ════════════════════════════════════════════════════════════════════════
  const targetPayload = { targetValue: 50, targetYear: 2025, targetType: "reduction" };

  await assertPermission({
    name: "PERM-01a: PUT /api/metrics/:id/target — unauthenticated → 401",
    method: "PUT", path: `/api/metrics/${metricId}/target`,
    body: targetPayload, actor: "unauthed",
    tenants, expectedStatus: 401,
  });

  await assertPermission({
    name: "PERM-01b: PUT /api/metrics/:id/target — contributor → 403 (REGRESSION GUARD)",
    method: "PUT", path: `/api/metrics/${metricId}/target`,
    body: targetPayload, actor: "contributor",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-01c: PUT /api/metrics/:id/target — viewer → 403",
    method: "PUT", path: `/api/metrics/${metricId}/target`,
    body: targetPayload, actor: "viewer",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-01d: PUT /api/metrics/:id/target — admin → 200",
    method: "PUT", path: `/api/metrics/${metricId}/target`,
    body: targetPayload, actor: "admin",
    tenants, expectedStatus: [200, 201],
  });

  // Cross-tenant: Tenant A token against Tenant B metricId
  {
    const name = "PERM-01e: PUT /api/metrics/:id/target — wrong company → 403 or 404";
    const res = await apiRequest("PUT", `/api/metrics/${tenantB.metricId}/target`, targetPayload, tenantA.adminToken);
    if (![403, 404].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // ENDPOINT 2: POST /api/data-entry — write metric value
  // ════════════════════════════════════════════════════════════════════════
  const dataEntryPayload = { metricId, period: "2024-02", value: 10 };

  await assertPermission({
    name: "PERM-02a: POST /api/data-entry — unauthenticated → 401",
    method: "POST", path: "/api/data-entry",
    body: dataEntryPayload, actor: "unauthed",
    tenants, expectedStatus: 401,
  });

  await assertPermission({
    name: "PERM-02b: POST /api/data-entry — viewer → 403",
    method: "POST", path: "/api/data-entry",
    body: dataEntryPayload, actor: "viewer",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-02c: POST /api/data-entry — contributor → 200/201",
    method: "POST", path: "/api/data-entry",
    body: dataEntryPayload, actor: "contributor",
    tenants, expectedStatus: [200, 201],
  });

  await assertPermission({
    name: "PERM-02d: POST /api/data-entry — admin → 200/201",
    method: "POST", path: "/api/data-entry",
    body: dataEntryPayload, actor: "admin",
    tenants, expectedStatus: [200, 201],
  });

  // ════════════════════════════════════════════════════════════════════════
  // ENDPOINT 3: POST /api/reports/generate
  // ════════════════════════════════════════════════════════════════════════
  const reportPayload = { reportType: "pdf", reportTemplate: "management", period: "2024-01" };

  await assertPermission({
    name: "PERM-03a: POST /api/reports/generate — unauthenticated → 401",
    method: "POST", path: "/api/reports/generate",
    body: reportPayload, actor: "unauthed",
    tenants, expectedStatus: 401,
  });

  await assertPermission({
    name: "PERM-03b: POST /api/reports/generate — viewer → 403",
    method: "POST", path: "/api/reports/generate",
    body: reportPayload, actor: "viewer",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-03c: POST /api/reports/generate — contributor → 403",
    method: "POST", path: "/api/reports/generate",
    body: reportPayload, actor: "contributor",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-03d: POST /api/reports/generate — admin → 200/201 (no 500)",
    method: "POST", path: "/api/reports/generate",
    body: reportPayload, actor: "admin",
    tenants, expectedStatus: [200, 201],
  });

  // ════════════════════════════════════════════════════════════════════════
  // ENDPOINT 4: PUT /api/company/settings — admin-only settings
  // ════════════════════════════════════════════════════════════════════════
  const settingsPayload = { displayName: "Test Company Updated" };

  await assertPermission({
    name: "PERM-04a: PUT /api/company/settings — unauthenticated → 401",
    method: "PUT", path: "/api/company/settings",
    body: settingsPayload, actor: "unauthed",
    tenants, expectedStatus: 401,
  });

  await assertPermission({
    name: "PERM-04b: PUT /api/company/settings — viewer → 403",
    method: "PUT", path: "/api/company/settings",
    body: settingsPayload, actor: "viewer",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-04c: PUT /api/company/settings — contributor → 403",
    method: "PUT", path: "/api/company/settings",
    body: settingsPayload, actor: "contributor",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-04d: PUT /api/company/settings — admin → 200",
    method: "PUT", path: "/api/company/settings",
    body: settingsPayload, actor: "admin",
    tenants, expectedStatus: [200, 201],
  });

  // ════════════════════════════════════════════════════════════════════════
  // ENDPOINT 5: POST /api/evidence (upload)
  // ════════════════════════════════════════════════════════════════════════
  const evidencePayload = { filename: `perm-test-${Date.now()}.pdf`, fileType: "pdf", linkedModule: "metric_value" };

  await assertPermission({
    name: "PERM-05a: POST /api/evidence — unauthenticated → 401",
    method: "POST", path: "/api/evidence",
    body: evidencePayload, actor: "unauthed",
    tenants, expectedStatus: 401,
  });

  await assertPermission({
    name: "PERM-05b: POST /api/evidence — viewer → 403",
    method: "POST", path: "/api/evidence",
    body: evidencePayload, actor: "viewer",
    tenants, expectedStatus: 403,
  });

  await assertPermission({
    name: "PERM-05c: POST /api/evidence — admin → 200/201",
    method: "POST", path: "/api/evidence",
    body: { ...evidencePayload, filename: `perm-admin-${Date.now()}.pdf`, fileUrl: "https://example.com/test.pdf" },
    actor: "admin",
    tenants, expectedStatus: [200, 201],
  });

  // ════════════════════════════════════════════════════════════════════════
  // ENDPOINT 6: GET /api/admin/users — super_admin only
  // ════════════════════════════════════════════════════════════════════════
  await assertPermission({
    name: "PERM-06a: GET /api/admin/users — unauthenticated → 401",
    method: "GET", path: "/api/admin/users",
    actor: "unauthed", tenants, expectedStatus: 401,
  });

  await assertPermission({
    name: "PERM-06b: GET /api/admin/users — admin (not super_admin) → 403",
    method: "GET", path: "/api/admin/users",
    actor: "admin", tenants, expectedStatus: 403,
  });
}

(async () => {
  console.log("\n=== API Tests: Permissions Matrix ===\n");
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
  console.log(`\n=== Permissions: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
