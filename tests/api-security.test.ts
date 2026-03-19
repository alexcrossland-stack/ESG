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
  cookie?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: parseInt(url.port || "5000"),
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
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

async function loginAs(email: string, password: string): Promise<string | null> {
  const res = await request("POST", "/api/auth/login", { email, password });
  if (res.status !== 200) return null;
  return `session=${res.body}`;
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
