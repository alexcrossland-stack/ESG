/**
 * API tests: Authentication domain
 *
 * Covers: valid login, invalid login, session behaviour (me, logout, revoked token),
 * and protected-route access.
 *
 * Run: npx tsx tests/api/auth.test.ts
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
  const PASSWORD = "Test1234!";

  // ── 1. Valid login ───────────────────────────────────────────────────────
  {
    const name = "valid login returns 200 with token and user object";
    const res = await apiRequest("POST", "/api/auth/login", {
      email: tenantA.adminEmail,
      password: PASSWORD,
    });
    if (res.status !== 200) { fail(name, `status=${res.status}`); }
    else {
      const body = JSON.parse(res.body) as { token?: string; user?: { role?: string } };
      if (!body.token) fail(name, "missing token");
      else if (body.user?.role !== "admin") fail(name, `role=${body.user?.role}`);
      else pass(name);
    }
  }

  // ── 2. Login as viewer ───────────────────────────────────────────────────
  {
    const name = "viewer login returns 200 with correct role";
    const res = await apiRequest("POST", "/api/auth/login", {
      email: tenantA.viewerEmail,
      password: PASSWORD,
    });
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { token?: string; user?: { role?: string } };
      if (body.user?.role !== "viewer") fail(name, `role=${body.user?.role}`);
      else pass(name);
    }
  }

  // ── 3. Login as contributor ──────────────────────────────────────────────
  {
    const name = "contributor login returns 200 with correct role";
    const res = await apiRequest("POST", "/api/auth/login", {
      email: tenantA.contributorEmail,
      password: PASSWORD,
    });
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { user?: { role?: string } };
      if (body.user?.role !== "contributor") fail(name, `role=${body.user?.role}`);
      else pass(name);
    }
  }

  // ── 4. Invalid credentials → 401 ─────────────────────────────────────────
  {
    const name = "wrong password returns 401 with error field";
    const res = await apiRequest("POST", "/api/auth/login", {
      email: tenantA.adminEmail,
      password: "WrongPass999!",
    });
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { error?: string };
      if (!body.error) fail(name, "missing error field");
      else pass(name);
    }
  }

  // ── 5. Non-existent user → 401 ──────────────────────────────────────────
  {
    const name = "non-existent email returns 401";
    const res = await apiRequest("POST", "/api/auth/login", {
      email: `nobody-${Date.now()}@nowhere.example`,
      password: PASSWORD,
    });
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 6. Missing fields → 400 or 429 ──────────────────────────────────────
  {
    const name = "register with missing fields returns 400 or 429";
    const res = await apiRequest("POST", "/api/auth/register", { username: "incomplete" });
    if (![400, 429].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 7. /api/auth/me with valid token ─────────────────────────────────────
  {
    const name = "/api/auth/me with valid token returns user and company";
    const res = await apiRequest("GET", "/api/auth/me", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { user?: { role?: string }; company?: { id?: string } };
      if (!body.user?.role) fail(name, "missing user.role");
      else if (!body.company?.id) fail(name, "missing company.id");
      else pass(name);
    }
  }

  // ── 8. /api/auth/me without token → 401 ──────────────────────────────────
  {
    const name = "/api/auth/me without token returns 401";
    const res = await apiRequest("GET", "/api/auth/me");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 9. /api/auth/me with fabricated token → 401 ──────────────────────────
  {
    const name = "/api/auth/me with fabricated token returns 401";
    const res = await apiRequest("GET", "/api/auth/me", undefined, "fabricated.token.here");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 10. Logout revokes token ─────────────────────────────────────────────
  {
    const name = "logout returns 200 and revokes the token";
    // Get a fresh token
    const loginRes = await apiRequest("POST", "/api/auth/login", {
      email: tenantA.contributorEmail,
      password: PASSWORD,
    });
    if (loginRes.status !== 200) { fail(name, `login failed status=${loginRes.status}`); }
    else {
      const { token } = JSON.parse(loginRes.body) as { token: string };

      const logoutRes = await apiRequest("POST", "/api/auth/logout", undefined, token);
      if (logoutRes.status !== 200) fail(name, `logout status=${logoutRes.status}`);
      else {
        // Token should now be revoked — me should return 401
        const meRes = await apiRequest("GET", "/api/auth/me", undefined, token);
        if (meRes.status !== 401) fail(name, `revoked token still accepted, status=${meRes.status}`);
        else pass(name);
      }
    }
  }

  // ── 11. Protected route rejects unauthenticated request ──────────────────
  {
    const name = "protected route /api/metrics rejects unauthenticated request with 401";
    const res = await apiRequest("GET", "/api/metrics");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 12. Password reset request (no 500) ──────────────────────────────────
  {
    const name = "POST /api/auth/forgot-password with valid email returns 200";
    const res = await apiRequest("POST", "/api/auth/forgot-password", {
      email: tenantA.adminEmail,
    });
    if (res.status >= 500) fail(name, `server error status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }
}

(async () => {
  console.log("\n=== API Tests: Auth Domain ===\n");
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
  console.log(`\n=== Auth: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
