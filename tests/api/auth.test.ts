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
import { Client } from "pg";
import crypto from "crypto";

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

function createInvitationToken() {
  const plaintext = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, tokenHash };
}

async function insertInvitationToken(input: {
  companyId: string;
  email: string;
  role?: "admin" | "contributor" | "approver" | "viewer";
  inviteeName?: string;
  expiresAt?: Date;
  usedAt?: Date | null;
  invitedUserId?: string | null;
}) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const companyRes = await client.query<{ name: string }>(
      "SELECT name FROM companies WHERE id = $1",
      [input.companyId],
    );
    const companyName = companyRes.rows[0]?.name ?? "Test Company";
    const { plaintext, tokenHash } = createInvitationToken();
    await client.query(
      `INSERT INTO auth_tokens (token_hash, type, email, metadata, expires_at, used_at)
       VALUES ($1, 'invitation', $2, $3::jsonb, $4, $5)`,
      [
        tokenHash,
        input.email,
        JSON.stringify({
          companyId: input.companyId,
          role: input.role ?? "contributor",
          inviteeName: input.inviteeName ?? null,
          companyName,
          invitedUserId: input.invitedUserId ?? null,
        }),
        input.expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000),
        input.usedAt ?? null,
      ],
    );
    return plaintext;
  } finally {
    await client.end();
  }
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

  // ── 12. Password reset request returns typed result, not silent success ──
  {
    const name = "POST /api/auth/forgot-password with valid email returns 200 or typed email failure";
    const res = await apiRequest("POST", "/api/auth/forgot-password", {
      email: tenantA.adminEmail,
    });
    if (![200, 503].includes(res.status)) {
      fail(name, `unexpected status=${res.status}`);
    } else if (res.status === 503) {
      const body = JSON.parse(res.body) as { code?: string; error?: string };
      if (body.code !== "EMAIL_SEND_FAILED") fail(name, `code=${body.code}`);
      else if (!body.error) fail(name, "missing error message");
      else pass(name, `status=${res.status}`);
    } else {
      pass(name, `status=${res.status}`);
    }
  }

  // ── 13. Valid invite token resolves to activation details ────────────────
  {
    const name = "GET /api/auth/invitation with valid token returns invited email, company, and role";
    const inviteEmail = `invite-valid-${Date.now()}@test-esg.example`;
    const token = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: inviteEmail,
      role: "approver",
      inviteeName: "Invited Person",
    });
    const res = await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(token)}`);
    if (res.status !== 200) {
      fail(name, `status=${res.status}`);
    } else {
      const body = JSON.parse(res.body) as { email?: string; role?: string; company?: { id?: string } };
      if (body.email !== inviteEmail) fail(name, `email=${body.email}`);
      else if (body.role !== "approver") fail(name, `role=${body.role}`);
      else if (body.company?.id !== tenantA.companyId) fail(name, `companyId=${body.company?.id}`);
      else pass(name);
    }
  }

  // ── 14. Valid invite creates user and signs them in ──────────────────────
  {
    const name = "POST /api/auth/accept-invitation creates user correctly";
    const inviteEmail = `invite-accept-${Date.now()}@test-esg.example`;
    const token = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: inviteEmail,
      role: "viewer",
      inviteeName: "Invite Accept",
    });
    const res = await apiRequest("POST", "/api/auth/accept-invitation", {
      token,
      password: "Welcome123!",
      confirmPassword: "Welcome123!",
    });
    if (res.status !== 200) {
      fail(name, `status=${res.status}`);
    } else {
      const body = JSON.parse(res.body) as { token?: string; user?: { email?: string; role?: string; companyId?: string }; company?: { id?: string } };
      if (!body.token) fail(name, "missing token");
      else if (body.user?.email !== inviteEmail) fail(name, `email=${body.user?.email}`);
      else if (body.user?.role !== "viewer") fail(name, `role=${body.user?.role}`);
      else if (body.user?.companyId !== tenantA.companyId) fail(name, `user.companyId=${body.user?.companyId}`);
      else if (body.company?.id !== tenantA.companyId) fail(name, `company.id=${body.company?.id}`);
      else pass(name);
    }
  }

  // ── 15. Expired invite rejected ──────────────────────────────────────────
  {
    const name = "Expired invitation token is rejected";
    const token = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `invite-expired-${Date.now()}@test-esg.example`,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });
    const res = await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(token)}`);
    if (res.status !== 410) {
      fail(name, `status=${res.status}`);
    } else {
      const body = JSON.parse(res.body) as { code?: string };
      if (body.code !== "INVITE_EXPIRED") fail(name, `code=${body.code}`);
      else pass(name);
    }
  }

  // ── 16. Used invite rejected ─────────────────────────────────────────────
  {
    const name = "Used invitation token is rejected";
    const token = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `invite-used-${Date.now()}@test-esg.example`,
      usedAt: new Date(),
    });
    const res = await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(token)}`);
    if (res.status !== 410) {
      fail(name, `status=${res.status}`);
    } else {
      const body = JSON.parse(res.body) as { code?: string };
      if (body.code !== "INVITE_ALREADY_USED") fail(name, `code=${body.code}`);
      else pass(name);
    }
  }

  // ── 17. Invite email is locked to the token ──────────────────────────────
  {
    const name = "Invite email cannot be changed during activation";
    const token = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `invite-lock-${Date.now()}@test-esg.example`,
    });
    const res = await apiRequest("POST", "/api/auth/accept-invitation", {
      token,
      email: "different-email@test-esg.example",
      password: "Welcome123!",
      confirmPassword: "Welcome123!",
    });
    if (res.status !== 400) {
      fail(name, `status=${res.status}`);
    } else {
      const body = JSON.parse(res.body) as { code?: string };
      if (body.code !== "INVITE_EMAIL_MISMATCH") fail(name, `code=${body.code}`);
      else pass(name);
    }
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
