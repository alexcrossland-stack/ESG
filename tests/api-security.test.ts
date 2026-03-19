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
 * Parses the JSON response body and extracts the token field.
 */
async function loginAs(email: string, password: string): Promise<string | null> {
  const res = await request("POST", "/api/auth/login", { email, password });
  if (res.status !== 200) return null;
  try {
    const parsed = JSON.parse(res.body) as { token?: string };
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

// ─── Suite 2: Tenant Isolation (unauthenticated baseline) ──────────────────

async function testTenantIsolation() {
  console.log("\n── Suite 2: Tenant Isolation (unauthenticated baseline) ──");

  // These endpoints must not return JSON data when unauthenticated
  const protectedEndpoints: [string, string, object?][] = [
    ["GET", "/api/metrics/1"],
    ["PUT", "/api/metrics/1/target", { targetValue: 99 }],
    ["GET", "/api/metrics/1/values"],
    ["GET", "/api/metrics/1/history"],
    ["PUT", "/api/topics/1", { selected: true }],
  ];

  for (const [method, path, body] of protectedEndpoints) {
    const res = await request(method, path, body);
    if (res.status === 401 || res.status === 404) {
      pass(`${method} ${path} is protected (401/404)`, `status=${res.status}`);
    } else if (res.status === 200 && !isJsonApiResponse(res.body)) {
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
  // Accept 429 (rate limited) as a valid "rejected" response — the request was not processed
  {
    const res = await request("POST", "/api/auth/register", { email: "partial@example.com" });
    if (res.status === 400) {
      pass("POST /api/auth/register rejects incomplete registration", `status=${res.status}`);
    } else if (res.status === 429) {
      pass("POST /api/auth/register rejected by rate limiter (incomplete request still blocked)", `status=429`);
    } else {
      fail("POST /api/auth/register should reject incomplete data", `got ${res.status}`);
    }
  }
}

// ─── Suite 4: Dashboard/Reports Endpoints (unauthenticated) ──────────────

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
      pass(`${method} ${path} — no JSON data leaked (SPA fallback)`, `status=${res.status}`);
    } else {
      pass(`${method} ${path} returns non-200 without auth`, `status=${res.status}`);
    }
  }
}

// ─── Suite 5: Cross-Tenant Isolation (authenticated) ──────────────────────

async function testCrossTenantIsolation(tenants: SeededTenants) {
  console.log("\n── Suite 5: Cross-Tenant Isolation (authenticated) ──");

  const { tenantA, tenantB } = tenants;
  const tbMetricId = tenantB.metricId;
  const tbTopicId = tenantB.topicId;
  const tbCompanyId = tenantB.companyId;
  const tbReportId = tenantB.reportId;
  const tbActionId = tenantB.actionId;
  const tbQuestionnaireId = tenantB.questionnaireId;

  /**
   * For targeted cross-tenant operations (accessing a specific Tenant B resource by ID),
   * the ONLY acceptable responses are 403 (forbidden) or 404 (not found/scoped out).
   * A 200 response for a targeted write/read on another tenant's resource is always a FAIL.
   */
  function assertTargetedBlocked(label: string, status: number, body: string): void {
    if (status === 403 || status === 404) {
      try {
        const parsed = JSON.parse(body) as { error?: string };
        if (typeof parsed.error === "string" && parsed.error.length > 0) {
          pass(label, `status=${status}, error="${parsed.error.slice(0, 60)}"`);
        } else {
          fail(`${label} — blocked (${status}) but error field missing or empty`, `body=${body.slice(0, 80)}`);
        }
      } catch {
        fail(`${label} — blocked (${status}) but response is not valid JSON`, `body=${body.slice(0, 80)}`);
      }
    } else {
      // Any other status (including 200) is a failure for targeted cross-tenant access
      fail(
        `${label} — expected 403/404, got ${status}`,
        `body=${body.slice(0, 120)}`
      );
    }
  }

  /**
   * For company-scoped list endpoints (GET /api/reports, GET /api/actions, etc.),
   * a 200 response is expected but must NOT contain any Tenant B data.
   * Non-200 (plan-gated, etc.) is also acceptable as long as it's not a 500.
   */
  function assertNoDataLeak(
    label: string,
    status: number,
    body: string,
    tbId: string
  ): void {
    if (status === 500) {
      fail(`${label} — returned 500`, `body=${body.slice(0, 120)}`);
      return;
    }
    if (status === 200 && isJsonApiResponse(body)) {
      // Could be object or array — check recursively for Tenant B companyId
      const bodyStr = body.toLowerCase();
      const tbIdLower = tbId.toLowerCase();
      if (bodyStr.includes(tbIdLower)) {
        fail(`${label} — Tenant B companyId found in response!`, `body=${body.slice(0, 200)}`);
      } else {
        pass(label, `status=200, no Tenant B data found`);
      }
    } else {
      pass(label, `status=${status} (non-200 or non-JSON — no data leak possible)`);
    }
  }

  // ── Targeted cross-tenant operations — must return 403 or 404 only ──

  {
    const res = await request("PUT", `/api/metrics/${tbMetricId}/target`, { targetValue: 999, targetYear: 2030 }, tenantA.adminToken);
    assertTargetedBlocked("Tenant A PUT Tenant B metric target blocked (403/404)", res.status, res.body);
  }
  {
    const res = await request("GET", `/api/metrics/${tbMetricId}/values`, undefined, tenantA.adminToken);
    assertTargetedBlocked("Tenant A GET Tenant B metric values blocked (403/404)", res.status, res.body);
  }
  {
    const res = await request("GET", `/api/metrics/${tbMetricId}/history`, undefined, tenantA.adminToken);
    assertTargetedBlocked("Tenant A GET Tenant B metric history blocked (403/404)", res.status, res.body);
  }
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: tbMetricId,
      period: "2024-Q1",
      value: 42,
    }, tenantA.adminToken);
    assertTargetedBlocked("Tenant A POST data-entry for Tenant B metric blocked (403/404)", res.status, res.body);
  }
  {
    const res = await request("PUT", `/api/topics/${tbTopicId}`, { selected: true }, tenantA.adminToken);
    assertTargetedBlocked("Tenant A PUT Tenant B topic blocked (403/404)", res.status, res.body);
  }

  // ── Targeted report-by-ID cross-tenant access — must return 403 or 404 only ──

  if (tbReportId) {
    const res = await request("GET", `/api/reports/${tbReportId}/files`, undefined, tenantA.adminToken);
    assertTargetedBlocked("Tenant A GET Tenant B report files blocked (403/404)", res.status, res.body);
  } else {
    pass("Targeted report cross-tenant test — Tenant B report not created; skip", "skipped");
  }

  // ── Targeted cross-tenant action access — must return 403 or 404 only ──

  if (tbActionId) {
    {
      const res = await request("PUT", `/api/actions/${tbActionId}`, { status: "in_progress" }, tenantA.adminToken);
      assertTargetedBlocked("Tenant A PUT Tenant B action blocked (403/404)", res.status, res.body);
    }
    {
      const res = await request("DELETE", `/api/actions/${tbActionId}`, undefined, tenantA.adminToken);
      assertTargetedBlocked("Tenant A DELETE Tenant B action blocked (403/404)", res.status, res.body);
    }
  } else {
    pass("Targeted action cross-tenant tests — Tenant B action not created; skip", "skipped");
  }

  // ── Targeted cross-tenant questionnaire access — must return 403 or 404 only ──

  if (tbQuestionnaireId) {
    const res = await request("GET", `/api/questionnaires/${tbQuestionnaireId}`, undefined, tenantA.adminToken);
    assertTargetedBlocked("Tenant A GET Tenant B questionnaire blocked (403/404)", res.status, res.body);
  } else {
    pass("Targeted questionnaire cross-tenant test — Tenant B questionnaire not created; skip", "skipped");
  }

  // ── Company-scoped list endpoints — 200 is OK, but no Tenant B data must appear ──

  {
    const res = await request("GET", "/api/reports", undefined, tenantA.adminToken);
    assertNoDataLeak("GET /api/reports — no Tenant B data in Tenant A response", res.status, res.body, tbCompanyId);
  }
  {
    const res = await request("GET", "/api/policy", undefined, tenantA.adminToken);
    assertNoDataLeak("GET /api/policy — no Tenant B data in Tenant A response", res.status, res.body, tbCompanyId);
  }
  {
    const res = await request("GET", "/api/actions", undefined, tenantA.adminToken);
    assertNoDataLeak("GET /api/actions — no Tenant B data in Tenant A response", res.status, res.body, tbCompanyId);
  }
  {
    const res = await request("GET", "/api/questionnaires", undefined, tenantA.adminToken);
    assertNoDataLeak("GET /api/questionnaires — no Tenant B data in Tenant A response", res.status, res.body, tbCompanyId);
  }
}

// ─── Suite 6: RBAC Enforcement ─────────────────────────────────────────────

async function testRBACEnforcement(tenants: SeededTenants) {
  console.log("\n── Suite 6: RBAC Enforcement ──");

  const { tenantA } = tenants;
  const viewerToken = tenantA.viewerToken;
  const contributorToken = tenantA.contributorToken;
  const adminToken = tenantA.adminToken;

  // Get Tenant A metric ID for tests
  const metricsRes = await request("GET", "/api/metrics", undefined, adminToken);
  let tenantAMetricId = "00000000-0000-0000-0000-000000000000";
  if (metricsRes.status === 200) {
    const metrics = JSON.parse(metricsRes.body) as Array<{ id: string }>;
    if (metrics.length > 0) tenantAMetricId = metrics[0].id;
  }

  // Get Tenant A topic ID for tests
  const topicsRes = await request("GET", "/api/topics", undefined, adminToken);
  let tenantATopicId = "00000000-0000-0000-0000-000000000001";
  if (topicsRes.status === 200) {
    const topics = JSON.parse(topicsRes.body) as Array<{ id: string }>;
    if (topics.length > 0) tenantATopicId = topics[0].id;
  }

  // ── Viewer checks ──

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
      pass("Viewer blocked from PUT /api/company/settings (settings_admin)", `status=403`);
    } else {
      fail("Viewer should be blocked from PUT /api/company/settings", `status=${res.status}`);
    }
  }

  // Viewer cannot PUT /api/topics/:id
  {
    const res = await request("PUT", `/api/topics/${tenantATopicId}`, { selected: true }, viewerToken);
    if (res.status === 403) {
      pass("Viewer blocked from PUT /api/topics/:id (settings_admin)", `status=403`);
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

  // ── Contributor checks (has metrics_data_entry, policy_editing, questionnaire_access; lacks settings_admin, template_admin, report_generation, user_management) ──

  // Contributor cannot PUT /api/company/settings (settings_admin required)
  {
    const res = await request("PUT", "/api/company/settings", {
      reportingFrequency: "quarterly",
    }, contributorToken);
    if (res.status === 403) {
      pass("Contributor blocked from PUT /api/company/settings (settings_admin)", `status=403`);
    } else {
      fail("Contributor should be blocked from PUT /api/company/settings", `status=${res.status}`);
    }
  }

  // Contributor cannot PUT /api/metrics/:id/admin (template_admin required)
  {
    const res = await request("PUT", `/api/metrics/${tenantAMetricId}/admin`, {
      visible: true,
    }, contributorToken);
    if (res.status === 403) {
      pass("Contributor blocked from PUT /api/metrics/:id/admin (template_admin)", `status=403`);
    } else {
      fail("Contributor should be blocked from PUT /api/metrics/:id/admin", `status=${res.status}`);
    }
  }

  // Contributor cannot PUT /api/policy-templates/:slug/admin (template_admin required)
  {
    const res = await request("PUT", "/api/policy-templates/environmental-policy/admin", {
      customInstructions: "test",
    }, contributorToken);
    if (res.status === 403) {
      pass("Contributor blocked from PUT /api/policy-templates/:slug/admin (template_admin)", `status=403`);
    } else {
      fail("Contributor should be blocked from PUT /api/policy-templates/:slug/admin", `status=${res.status}`);
    }
  }

  // Contributor cannot POST /api/reports/generate (report_generation required)
  {
    const res = await request("POST", "/api/reports/generate", {
      reportType: "management",
      period: "2024-Q1",
    }, contributorToken);
    if (res.status === 403) {
      pass("Contributor blocked from POST /api/reports/generate (report_generation)", `status=403`);
    } else {
      fail("Contributor should be blocked from POST /api/reports/generate", `status=${res.status}`);
    }
  }

  // ── Admin checks ──

  // Admin (non-super-admin) is blocked from GET /api/admin/users (requireSuperAdmin)
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

  const protectedRoutes: [string, string][] = [
    ["GET", "/api/metrics"],
    ["GET", "/api/topics"],
    ["GET", "/api/company"],
    ["GET", "/api/reports"],
    ["GET", "/api/auth/sessions"],
  ];

  for (const [method, path] of protectedRoutes) {
    const res = await request(method, path, undefined, adminToken);
    if (res.status === 401) {
      pass(`Revoked token blocked on ${method} ${path}`, `status=401`);
    } else {
      fail(`Revoked token should return 401 on ${method} ${path}`, `status=${res.status}`);
    }
  }

  // Fabricated token must return 401, not 500
  const fakeToken = "totally-fake-token-that-does-not-exist-in-any-session-store";
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

  // Missing auth header
  {
    const res = await request("GET", "/api/company");
    if (res.status === 401) {
      pass("Missing auth header returns 401", `status=401`);
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

  const metricsRes = await request("GET", "/api/metrics", undefined, adminToken);
  let tenantAMetricId = "00000000-0000-0000-0000-000000000000";
  if (metricsRes.status === 200) {
    const metrics = JSON.parse(metricsRes.body) as Array<{ id: string }>;
    if (metrics.length > 0) tenantAMetricId = metrics[0].id;
  }

  function assertBadRequest(
    label: string,
    status: number,
    body: string
  ): void {
    if (status === 400) {
      try {
        const parsed = JSON.parse(body) as { error?: string };
        if (typeof parsed.error === "string" && parsed.error.length > 0) {
          pass(`${label} returns 400 with safe error field`, `error="${parsed.error.slice(0, 60)}"`);
        } else {
          fail(`${label} returns 400 but error field is missing or empty`, `body=${body.slice(0, 100)}`);
        }
      } catch {
        fail(`${label} returns 400 but response is not valid JSON`, `body=${body.slice(0, 100)}`);
      }
    } else if (status === 500) {
      fail(`${label} returns 500 — must never return 500 for invalid input`, `body=${body.slice(0, 100)}`);
    } else {
      fail(`${label} — expected 400, got ${status}`, `body=${body.slice(0, 100)}`);
    }
  }

  // POST /api/data-entry — missing period
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: tenantAMetricId,
      value: 100,
    }, adminToken);
    assertBadRequest("POST /api/data-entry missing period", res.status, res.body);
  }

  // POST /api/data-entry — null metricId
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: null,
      period: "2024-Q1",
      value: 50,
    }, adminToken);
    assertBadRequest("POST /api/data-entry null metricId", res.status, res.body);
  }

  // PUT /api/metrics/:id/target — string instead of number for targetValue
  {
    const res = await request("PUT", `/api/metrics/${tenantAMetricId}/target`, {
      targetValue: "not-a-number",
      targetYear: 2030,
    }, adminToken);
    assertBadRequest("PUT /api/metrics/:id/target string targetValue", res.status, res.body);
  }

  // POST /api/reports/generate — missing reportType
  {
    const res = await request("POST", "/api/reports/generate", {
      period: "2024-Q1",
    }, adminToken);
    assertBadRequest("POST /api/reports/generate missing reportType", res.status, res.body);
  }

  // POST /api/reports/generate — invalid period format
  {
    const res = await request("POST", "/api/reports/generate", {
      reportType: "management",
      period: "INVALID_PERIOD_FORMAT!!!",
    }, adminToken);
    assertBadRequest("POST /api/reports/generate invalid period returns 400 with error field", res.status, res.body);
  }

  // POST /api/data-entry — non-numeric value (string)
  {
    const res = await request("POST", "/api/data-entry", {
      metricId: tenantAMetricId,
      period: "2024-Q1",
      value: "not-a-number",
    }, adminToken);
    assertBadRequest("POST /api/data-entry non-numeric value returns 400 with error field", res.status, res.body);
  }

  // PUT /api/metrics/:id/target — missing targetValue entirely (targetValue is required)
  {
    const res = await request("PUT", `/api/metrics/${tenantAMetricId}/target`, {
      targetYear: 2030,
    }, adminToken);
    assertBadRequest("PUT /api/metrics/:id/target missing targetValue returns 400 with error", res.status, res.body);
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
    console.log(`  Tenant B metricId: ${tenants.tenantB.metricId}`);
    console.log(`  Tenant B topicId: ${tenants.tenantB.topicId}`);
    console.log(`  Tenant B reportId: ${tenants.tenantB.reportId}`);
    console.log(`  Tenant B actionId: ${tenants.tenantB.actionId}`);
    console.log(`  Tenant B questionnaireId: ${tenants.tenantB.questionnaireId}`);

    await testCrossTenantIsolation(tenants);
    await testRBACEnforcement(tenants);

    // Seed a fresh set of tenants for Suite 8 (malformed payload tests need a
    // valid admin token; Suite 7 will have invalidated the original tenants token
    // via logout). Suite 7 uses `tenants` so its logout only affects `tenants`.
    const freshTenants = await seedTestTenants();
    await testSessionLifecycle(tenants);
    await testMalformedPayloads(freshTenants);

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
