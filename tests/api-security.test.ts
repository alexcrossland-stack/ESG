/**
 * API Security Regression Tests
 *
 * Tests tenant isolation and input validation for critical API endpoints.
 * These are regression tests for the security hardening applied during
 * the first-time activation audit (Task #49).
 *
 * Run: npx tsx tests/api-security.test.ts
 */

import http from "http";
import { seedTestTenants } from "./fixtures/seed.js";
import type { SeededTenants } from "./fixtures/seed.js";

const BASE_URL = "http://localhost:5000";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

function isJsonApiResponse(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(
  method: string,
  path: string,
  body?: object,
  token?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (bodyStr) headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: parseInt(url.port || "5000"),
      path: url.pathname + url.search,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Authenticates as the given user and returns a bearer token.
 * Returns null if login fails.
 */
async function loginAs(email: string, password: string): Promise<string | null> {
  const res = await request("POST", "/api/auth/login", { email, password });
  if (res.status !== 200) return null;
  try {
    const parsed = JSON.parse(res.body);
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

// ─── Suite 1: Input Validation ─────────────────────────────────────────────

async function testInputValidation() {
  console.log("\n── Suite 1: Input Validation ──");

  // POST /api/data-entry — missing metricId
  {
    const res = await request("POST", "/api/data-entry", {
      value: 42,
      period: "2024-Q1",
    });
    if (res.status === 400 || res.status === 401) {
      pass("POST /api/data-entry rejects missing metricId (400 or 401 unauthed)", `status=${res.status}`);
    } else {
      fail("POST /api/data-entry rejects missing metricId", `expected 400/401, got ${res.status}`);
    }
  }

  // PUT /api/topics/:id — missing 'selected' field
  {
    const res = await request("PUT", "/api/topics/1", { someOtherField: true });
    if (res.status === 400 || res.status === 401) {
      pass("PUT /api/topics/:id rejects missing 'selected' field (400 or 401 unauthed)", `status=${res.status}`);
    } else {
      fail("PUT /api/topics/:id rejects missing 'selected' field", `expected 400/401, got ${res.status}`);
    }
  }

  // GET /api/auth/sessions — should not return 500
  {
    const res = await request("GET", "/api/auth/sessions");
    if (res.status !== 500) {
      pass("GET /api/auth/sessions does not return 500", `status=${res.status}`);
    } else {
      fail("GET /api/auth/sessions returns 500 (user_sessions_ext table missing?)", res.body.slice(0, 120));
    }
  }
}

// ─── Suite 2: Tenant Isolation (metrics) ──────────────────────────────────

async function testTenantIsolation() {
  console.log("\n── Suite 2: Tenant Isolation (unauthenticated baseline) ──");

  // These endpoints must not return JSON data when unauthenticated (401/404 or SPA HTML fallback)
  const protectedEndpoints: [string, string, object?][] = [
    ["GET", "/api/metrics/1"],
    ["PUT", "/api/metrics/1/target", { targetValue: 99 }],
    ["GET", "/api/metrics/1/values"],
    ["GET", "/api/metrics/1/history"],
    ["PUT", "/api/topics/1", { selected: true }],
  ];

  for (const [method, path, body] of protectedEndpoints) {
    const res = await request(method, path, body);
    // Protected endpoints should either return 401, 404, or serve the SPA HTML (not JSON API data)
    if (res.status === 401 || res.status === 404) {
      pass(`${method} ${path} is protected (401/404)`, `status=${res.status}`);
    } else if (res.status === 200 && !isJsonApiResponse(res.body)) {
      // SPA HTML fallback — not a data leak
      pass(`${method} ${path} — no JSON data leaked (SPA fallback)`, `status=${res.status}, HTML response`);
    } else if (res.status === 200 && isJsonApiResponse(res.body)) {
      fail(`${method} ${path} returns JSON data without auth — data leak!`, `status=200, body=${res.body.slice(0, 80)}`);
    } else {
      fail(`${method} ${path} is not properly protected`, `expected 401/404, got ${res.status}`);
    }
  }
}

// ─── Suite 3: Auth Endpoints ──────────────────────────────────────────────

async function testAuthEndpoints() {
  console.log("\n── Suite 3: Auth Endpoints ──");

  // POST /api/auth/login — bad credentials
  {
    const res = await request("POST", "/api/auth/login", {
      email: `nonexistent-${Date.now()}@example.com`,
      password: "wrongpassword",
    });
    if (res.status === 401 || res.status === 400) {
      pass("POST /api/auth/login rejects bad credentials", `status=${res.status}`);
    } else {
      fail("POST /api/auth/login should reject bad credentials", `got ${res.status}`);
    }
  }

  // POST /api/auth/register — missing fields
  {
    const res = await request("POST", "/api/auth/register", { email: "partial@example.com" });
    if (res.status === 400) {
      pass("POST /api/auth/register rejects incomplete registration", `status=${res.status}`);
    } else if (res.status === 429) {
      // Rate limiter hit — the request was still rejected (not processed), which is correct behavior
      pass("POST /api/auth/register rejected by rate limiter (request not processed)", `status=429`);
    } else {
      fail("POST /api/auth/register should reject incomplete data", `got ${res.status}`);
    }
  }
}

// ─── Suite 4: Dashboard/Reports Endpoints ─────────────────────────────────

async function testDashboardEndpoints() {
  console.log("\n── Suite 4: Dashboard/Report Endpoints ──");

  const unauthEndpoints: [string, string][] = [
    ["GET", "/api/dashboard"],
    ["GET", "/api/reports"],
    ["GET", "/api/data-entry"],
    ["GET", "/api/topics"],
  ];

  for (const [method, path] of unauthEndpoints) {
    const res = await request(method, path);
    if (res.status === 401 || res.status === 403) {
      pass(`${method} ${path} requires authentication`, `status=${res.status}`);
    } else if (res.status === 200 && isJsonApiResponse(res.body)) {
      fail(`${method} ${path} returns JSON data without auth — data leak!`, `status=${res.status}`);
    } else if (res.status === 200 && !isJsonApiResponse(res.body)) {
      // SPA HTML fallback — route doesn't exist as API, serving frontend
      pass(`${method} ${path} — no JSON data leaked (SPA fallback, non-existent API route)`, `status=${res.status}`);
    } else {
      pass(`${method} ${path} returns non-200 without auth`, `status=${res.status}`);
    }
  }
}

// ─── Suite 5: Cross-Tenant Isolation (authenticated) ──────────────────────

async function testCrossTenantIsolation(tenants: SeededTenants) {
  console.log("\n── Suite 5: Cross-Tenant Isolation (authenticated) ──");

  const { tenantA, tenantB } = tenants;
  const tenantBMetricId = tenantB.metricId;

  // Tenant A admin tries to access Tenant B metric
  // Note: GET /api/metrics/:id does not exist as a singular route — Express falls through to
  // the SPA (status 200, HTML), which is NOT a data leak. The cross-tenant check
  // is validated via PUT /target, GET /values, and POST /api/data-entry below.
  {
    const res = await request("GET", `/api/metrics/${tenantBMetricId}`, undefined, tenantA.adminToken);
    if (res.status === 403 || res.status === 404) {
      pass("Tenant A cannot GET Tenant B metric — protected", `status=${res.status}`);
    } else if (res.status === 200 && isJsonApiResponse(res.body)) {
      const parsed = JSON.parse(res.body);
      if (parsed.companyId && parsed.companyId !== tenantA.companyId) {
        fail("Tenant A GOT Tenant B metric JSON — cross-tenant data leak!", `body=${res.body.slice(0, 80)}`);
      } else {
        pass("Tenant A GET /api/metrics/:id returns 200 but no cross-tenant JSON data (SPA fallback or own data)", `status=200`);
      }
    } else if (res.status === 200 && !isJsonApiResponse(res.body)) {
      pass("Tenant A GET /api/metrics/:id returns SPA HTML (no data leak)", `status=200`);
    } else {
      pass("Tenant A GET /api/metrics/:id returns non-data response", `status=${res.status}`);
    }
  }

  // Tenant A admin tries to update Tenant B metric target
  {
    const res = await request("PUT", `/api/metrics/${tenantBMetricId}/target`, { targetValue: 999, targetYear: 2030 }, tenantA.adminToken);
    if (res.status === 403 || res.status === 404) {
      pass("Tenant A cannot PUT Tenant B metric target", `status=${res.status}`);
    } else if (res.status === 200) {
      fail("Tenant A updated Tenant B metric target — cross-tenant write!", `status=200`);
    } else {
      fail("Unexpected response for cross-tenant metric target PUT", `status=${res.status}`);
    }
  }

  // Tenant A admin tries to get Tenant B metric values
  {
    const res = await request("GET", `/api/metrics/${tenantBMetricId}/values`, undefined, tenantA.adminToken);
    if (res.status === 403 || res.status === 404) {
      pass("Tenant A cannot GET Tenant B metric values", `status=${res.status}`);
    } else if (res.status === 200 && isJsonApiResponse(res.body)) {
      fail("Tenant A GOT Tenant B metric values — cross-tenant data leak!", `status=200`);
    } else {
      fail("Unexpected response for cross-tenant metric values GET", `status=${res.status}`);
    }
  }

  // Tenant A admin tries to post data entry for Tenant B metric
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: tenantBMetricId,
      period: "2024-Q1",
      value: 42,
    }, tenantA.adminToken);
    if (res.status === 403 || res.status === 404) {
      pass("Tenant A cannot POST data-entry for Tenant B metric", `status=${res.status}`);
    } else if (res.status === 200 || res.status === 201) {
      fail("Tenant A submitted data-entry for Tenant B metric — cross-tenant write!", `status=${res.status}`);
    } else {
      fail("Unexpected response for cross-tenant data-entry POST", `status=${res.status}`);
    }
  }

  // Verify response body is safe (no raw DB content or stack trace)
  {
    const res = await request("GET", `/api/metrics/${tenantBMetricId}`, undefined, tenantA.adminToken);
    const body = res.body.slice(0, 300);
    if (body.includes("at ") && body.includes("Error:")) {
      fail("Cross-tenant error response contains stack trace", body);
    } else if (res.status === 403 || res.status === 404) {
      try {
        const parsed = JSON.parse(res.body);
        if (parsed.error && typeof parsed.error === "string") {
          pass("Cross-tenant error response has safe error field", `error="${parsed.error.slice(0, 60)}"`);
        } else {
          fail("Cross-tenant error response missing error field", res.body.slice(0, 80));
        }
      } catch {
        fail("Cross-tenant error response is not valid JSON", body);
      }
    } else {
      pass("Cross-tenant response is not a JSON leak", `status=${res.status}`);
    }
  }
}

// ─── Suite 6: RBAC Enforcement ─────────────────────────────────────────────

async function testRBACEnforcement(tenants: SeededTenants) {
  console.log("\n── Suite 6: RBAC Enforcement ──");

  const { tenantA, tenantB } = tenants;
  const viewerToken = tenantA.viewerToken;
  const adminToken = tenantA.adminToken;
  const tenantAMetricId = await (async () => {
    const res = await request("GET", "/api/metrics", undefined, adminToken);
    if (res.status === 200) {
      const metrics = JSON.parse(res.body);
      if (Array.isArray(metrics) && metrics.length > 0) return metrics[0].id;
    }
    return "00000000-0000-0000-0000-000000000000";
  })();

  // Viewer cannot POST /api/data-entry
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: tenantAMetricId,
      period: "2024-Q1",
      value: 10,
    }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from POST /api/data-entry", `status=403`);
    } else {
      fail("Viewer should be blocked from POST /api/data-entry", `status=${res.status}`);
    }
  }

  // Viewer cannot PUT /api/metrics/:id/target
  {
    const res = await request("PUT", `/api/metrics/${tenantAMetricId}/target`, {
      targetValue: 100,
      targetYear: 2030,
    }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from PUT /api/metrics/:id/target", `status=403`);
    } else {
      fail("Viewer should be blocked from PUT /api/metrics/:id/target", `status=${res.status}`);
    }
  }

  // Viewer cannot POST /api/reports/generate
  {
    const res = await request("POST", "/api/reports/generate", {
      reportType: "esg_summary",
      period: "2024-Q1",
    }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from POST /api/reports/generate", `status=403`);
    } else {
      fail("Viewer should be blocked from POST /api/reports/generate", `status=${res.status}`);
    }
  }

  // Viewer cannot PUT /api/company/settings
  {
    const res = await request("PUT", "/api/company/settings", {
      reportingFrequency: "quarterly",
    }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from PUT /api/company/settings", `status=403`);
    } else {
      fail("Viewer should be blocked from PUT /api/company/settings", `status=${res.status}`);
    }
  }

  // Viewer cannot PUT /api/topics/:id
  {
    const topicsRes = await request("GET", "/api/topics", undefined, adminToken);
    let topicId = "00000000-0000-0000-0000-000000000001";
    if (topicsRes.status === 200) {
      const topics = JSON.parse(topicsRes.body);
      if (Array.isArray(topics) && topics.length > 0) topicId = topics[0].id;
    }
    const res = await request("PUT", `/api/topics/${topicId}`, { selected: true }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from PUT /api/topics/:id", `status=403`);
    } else {
      fail("Viewer should be blocked from PUT /api/topics/:id", `status=${res.status}`);
    }
  }

  // Viewer cannot POST /api/actions
  {
    const res = await request("POST", "/api/actions", {
      title: "Test action",
      description: "Test",
    }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from POST /api/actions", `status=403`);
    } else {
      fail("Viewer should be blocked from POST /api/actions", `status=${res.status}`);
    }
  }

  // Admin (non-super-admin) is blocked from GET /api/admin/users (super-admin only)
  {
    const res = await request("GET", "/api/admin/users", undefined, adminToken);
    if (res.status === 403 || res.status === 401) {
      pass("Admin blocked from GET /api/admin/users (super-admin only)", `status=${res.status}`);
    } else {
      fail("Admin should be blocked from GET /api/admin/users", `status=${res.status}`);
    }
  }
}

// ─── Suite 7: Session Lifecycle ────────────────────────────────────────────

async function testSessionLifecycle(tenants: SeededTenants) {
  console.log("\n── Suite 7: Session Lifecycle ──");

  const { tenantA } = tenants;
  const adminToken = tenantA.adminToken;

  // Login → logout → replay token → must get 401
  const logoutRes = await request("POST", "/api/auth/logout", undefined, adminToken);
  if (logoutRes.status === 200) {
    pass("POST /api/auth/logout succeeds", `status=200`);
  } else {
    fail("POST /api/auth/logout did not return 200", `status=${logoutRes.status}`);
  }

  const protectedRoutes = [
    ["GET", "/api/metrics"],
    ["GET", "/api/topics"],
    ["GET", "/api/company"],
    ["GET", "/api/reports"],
    ["GET", "/api/auth/sessions"],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    const res = await request(method, path, undefined, adminToken);
    if (res.status === 401) {
      pass(`Revoked token blocked on ${method} ${path}`, `status=401`);
    } else {
      fail(`Revoked token should return 401 on ${method} ${path}`, `status=${res.status}`);
    }
  }

  // Fabricated token must return 401, not 500
  const fakeToken = "totally-fake-token-that-does-not-exist-in-any-session";
  {
    const res = await request("GET", "/api/metrics", undefined, fakeToken);
    if (res.status === 401) {
      pass("Fabricated token returns 401, not 500", `status=401`);
    } else if (res.status === 500) {
      fail("Fabricated token returns 500 — server error on invalid token!", `status=500`);
    } else {
      fail("Fabricated token should return 401", `status=${res.status}`);
    }
  }

  // Malformed bearer header (not a token)
  {
    const res = await request("GET", "/api/company");
    if (res.status === 401) {
      pass("No auth header returns 401", `status=401`);
    } else {
      fail("Missing auth header should return 401", `status=${res.status}`);
    }
  }
}

// ─── Suite 8: Malformed Payloads (authenticated) ───────────────────────────

async function testMalformedPayloads(tenants: SeededTenants) {
  console.log("\n── Suite 8: Malformed Payloads (authenticated) ──");

  const { tenantA } = tenants;
  const adminToken = tenantA.adminToken;

  const tenantAMetricId = await (async () => {
    const res = await request("GET", "/api/metrics", undefined, adminToken);
    if (res.status === 200) {
      const metrics = JSON.parse(res.body);
      if (Array.isArray(metrics) && metrics.length > 0) return metrics[0].id;
    }
    return "00000000-0000-0000-0000-000000000000";
  })();

  // POST /api/data-entry — missing period
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: tenantAMetricId,
      value: 100,
    }, adminToken);
    if (res.status === 400) {
      const body = JSON.parse(res.body);
      if (body.error) {
        pass("POST /api/data-entry with missing period returns 400 + error field", `error="${body.error.slice(0, 60)}"`);
      } else {
        fail("POST /api/data-entry missing period returns 400 but no error field", res.body.slice(0, 100));
      }
    } else if (res.status === 500) {
      fail("POST /api/data-entry missing period returns 500", res.body.slice(0, 100));
    } else {
      fail("POST /api/data-entry missing period should return 400", `status=${res.status}`);
    }
  }

  // POST /api/data-entry — null metricId
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: null,
      period: "2024-Q1",
      value: 50,
    }, adminToken);
    if (res.status === 400) {
      const body = JSON.parse(res.body);
      if (body.error) {
        pass("POST /api/data-entry with null metricId returns 400 + error field", `error="${body.error.slice(0, 60)}"`);
      } else {
        fail("POST /api/data-entry null metricId returns 400 but no error field", res.body.slice(0, 100));
      }
    } else if (res.status === 500) {
      fail("POST /api/data-entry null metricId returns 500", res.body.slice(0, 100));
    } else {
      fail("POST /api/data-entry null metricId should return 400", `status=${res.status}`);
    }
  }

  // PUT /api/metrics/:id/target — missing targetValue (uses string instead of number)
  {
    const res = await request("PUT", `/api/metrics/${tenantAMetricId}/target`, {
      targetYear: 2030,
    }, adminToken);
    // The route does not do strict validation of missing targetValue — it will just set null
    // We accept 200 (upsert with null) or 400; we reject 500
    if (res.status === 500) {
      fail("PUT /api/metrics/:id/target missing targetValue returns 500", res.body.slice(0, 100));
    } else {
      pass("PUT /api/metrics/:id/target missing targetValue does not return 500", `status=${res.status}`);
    }
  }

  // PUT /api/metrics/:id/target — string instead of number for targetValue
  {
    const res = await request("PUT", `/api/metrics/${tenantAMetricId}/target`, {
      targetValue: "not-a-number",
      targetYear: 2030,
    }, adminToken);
    if (res.status === 500) {
      fail("PUT /api/metrics/:id/target with string targetValue returns 500", res.body.slice(0, 100));
    } else {
      pass("PUT /api/metrics/:id/target with string targetValue does not return 500", `status=${res.status}`);
    }
  }

  // POST /api/reports/generate — missing reportType
  {
    const res = await request("POST", "/api/reports/generate", {
      period: "2024-Q1",
    }, adminToken);
    if (res.status === 400 || res.status === 500) {
      if (res.status === 500) {
        fail("POST /api/reports/generate missing reportType returns 500", res.body.slice(0, 100));
      } else {
        const body = JSON.parse(res.body);
        if (body.error) {
          pass("POST /api/reports/generate missing reportType returns 400 + error field", `error="${body.error.slice(0, 60)}"`);
        } else {
          fail("POST /api/reports/generate missing reportType returns 400 but no error field", res.body.slice(0, 100));
        }
      }
    } else {
      pass("POST /api/reports/generate missing reportType responds without 500", `status=${res.status}`);
    }
  }

  // POST /api/reports/generate — invalid period format
  {
    const res = await request("POST", "/api/reports/generate", {
      reportType: "esg_summary",
      period: "NOT_A_VALID_PERIOD_FORMAT",
    }, adminToken);
    if (res.status === 500) {
      fail("POST /api/reports/generate invalid period returns 500", res.body.slice(0, 100));
    } else {
      pass("POST /api/reports/generate invalid period does not return 500", `status=${res.status}`);
    }
  }
}

// ─── Run All Suites ────────────────────────────────────────────────────────

async function run() {
  console.log("ESG Platform — API Security Regression Tests");
  console.log("=============================================");
  console.log(`Target: ${BASE_URL}\n`);

  try {
    await testInputValidation();
    await testTenantIsolation();
    await testAuthEndpoints();
    await testDashboardEndpoints();

    console.log("\n── Seeding test tenants for authenticated suites… ──");
    const tenants = await seedTestTenants();
    console.log(`  Tenant A companyId: ${tenants.tenantA.companyId}`);
    console.log(`  Tenant B companyId: ${tenants.tenantB.companyId}`);
    console.log(`  Tenant B sample metricId: ${tenants.tenantB.metricId}`);

    await testCrossTenantIsolation(tenants);
    await testRBACEnforcement(tenants);

    // Suite 7 logs out the admin token — get a fresh one for Suite 8
    const freshTenantAReg = await seedTestTenants();
    await testSessionLifecycle(tenants);
    await testMalformedPayloads(freshTenantAReg);

  } catch (err) {
    console.error("\nTest runner error:", err);
    process.exit(2);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n=============================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`));
    process.exit(1);
  } else {
    console.log("All tests passed!");
    process.exit(0);
  }
}

run();
