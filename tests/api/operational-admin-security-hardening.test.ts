/**
 * API regression: operational/admin security hardening.
 *
 * Covers super-admin containment actions, tenant-admin boundaries, session/token
 * invalidation, and safe audit metadata for operational security actions.
 *
 * Run: npx tsx tests/api/operational-admin-security-hardening.test.ts
 */

import bcrypt from "bcryptjs";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const TEST_PASSWORD = "Test1234!";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string | void> | string | void) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

function parseJson<T>(res: { status: number; body: string }, context: string): T {
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 500)}`);
  return JSON.parse(res.body) as T;
}

function expectStatus(res: { status: number; body: string }, expected: number | number[], context: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(allowed.includes(res.status), `${context} expected=${allowed.join("/")} got=${res.status} body=${res.body.slice(0, 500)}`);
}

function assertNoSensitiveContent(value: unknown, secrets: string[], context: string) {
  const serialized = JSON.stringify(value);
  for (const secret of secrets.filter(Boolean)) {
    assert(!serialized.includes(secret), `${context} leaked sensitive value ${secret.slice(0, 12)}...`);
  }
  assert(!/"password"\s*:/.test(serialized), `${context} leaked password field`);
  assert(!serialized.includes("tokenHash"), `${context} leaked tokenHash`);
  assert(!serialized.includes("keyHash"), `${context} leaked keyHash`);
}

class CookieSession {
  private cookie = "";
  private forwardedFor = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  token = "";

  async request(method: string, path: string, body?: object, opts: { bearer?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = {
      "X-Forwarded-Proto": "https",
      "X-Forwarded-For": this.forwardedFor,
      ...(opts.headers ?? {}),
    };
    if (this.cookie) headers.Cookie = this.cookie;
    if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;

    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(new URL(path, BASE_URL), { method, headers, body: payload });
    this.captureCookie(res);
    return { status: res.status, headers: res.headers, body: await res.text() };
  }

  async login(email: string, password = TEST_PASSWORD) {
    const res = await this.request("POST", "/api/auth/login", { email, password });
    const body = parseJson<{ token?: string }>(res, `POST /api/auth/login (${email})`);
    assert(body.token, "login response missing bearer token");
    this.token = body.token;
    return body.token;
  }

  private captureCookie(res: Response) {
    const getter = (res.headers as any).getSetCookie?.bind(res.headers);
    const cookies: string[] = typeof getter === "function"
      ? getter()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
    const sessionCookie = cookies.find((cookie) => cookie.includes("connect.sid="));
    if (sessionCookie) this.cookie = sessionCookie.split(";")[0];
  }
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createUser(opts: {
  companyId?: string | null;
  email: string;
  username: string;
  role: "admin" | "viewer" | "contributor" | "super_admin";
}) {
  return withDb(async (client) => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), '1.0', '1.0')
       RETURNING id`,
      [opts.username, opts.email, hash, opts.role, opts.companyId ?? null],
    );
    return res.rows[0].id;
  });
}

async function latestAudit(input: { action: string; entityId: string }) {
  return withDb(async (client) => {
    const res = await client.query(
      `SELECT * FROM audit_logs
       WHERE action = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.action, input.entityId],
    );
    return res.rows[0] ?? null;
  });
}

async function waitForSessions(session: CookieSession, minCount: number) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await session.request("GET", "/api/auth/sessions");
    if (res.status === 200) {
      const sessions = JSON.parse(res.body) as unknown[];
      if (sessions.length >= minCount) return sessions;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`expected at least ${minCount} active sessions`);
}

async function run(tenants: SeededTenants) {
  const suffix = Date.now().toString();
  const superEmail = `opsechard-super-${suffix}@test-esg.example`;
  await createUser({ companyId: null, email: superEmail, username: `opsechardsuper${suffix}`, role: "super_admin" });
  const superAdmin = new CookieSession();
  await superAdmin.login(superEmail);

  await check("super-admin forced session revocation invalidates target cookie and bearer sessions", async () => {
    const targetEmail = `opsechard-revoke-${suffix}@test-esg.example`;
    const targetUserId = await createUser({
      companyId: tenants.tenantA.companyId,
      email: targetEmail,
      username: `opsechardrevoke${suffix}`,
      role: "admin",
    });
    const first = new CookieSession();
    const second = new CookieSession();
    await first.login(targetEmail);
    await second.login(targetEmail);
    await waitForSessions(second, 2);

    expectStatus(
      await apiRequest("POST", `/api/admin/security/containment/revoke-sessions/${targetUserId}`, undefined, tenants.tenantA.adminToken),
      403,
      "tenant admin revoke sessions containment",
    );
    expectStatus(
      await apiRequest("POST", `/api/admin/security/containment/revoke-sessions/${targetUserId}`, undefined, tenants.tenantA.viewerToken),
      403,
      "viewer revoke sessions containment",
    );

    const revoke = parseJson<{ revokedSessions?: number }>(
      await superAdmin.request("POST", `/api/admin/security/containment/revoke-sessions/${targetUserId}`),
      "super-admin revoke sessions containment",
    );
    assert(Number(revoke.revokedSessions) >= 2, `expected at least two revoked sessions, got ${JSON.stringify(revoke)}`);
    expectStatus(await first.request("GET", "/api/auth/me", undefined, { bearer: first.token }), 401, "first bearer after forced revoke");
    expectStatus(await second.request("GET", "/api/auth/me"), 401, "second cookie after forced revoke");

    const audit = await latestAudit({ action: "admin_revoke_user_sessions", entityId: targetUserId });
    assert(audit, "missing admin_revoke_user_sessions audit log");
    assert(audit.company_id === tenants.tenantA.companyId, `audit log missing target company scope ${JSON.stringify(audit)}`);
    assert(audit.actor_type === "super_admin", `audit actor mismatch ${JSON.stringify(audit)}`);
    assert(Number(audit.details?.revokedSessions) >= 2, `audit missing revoked count ${JSON.stringify(audit.details)}`);
    assertNoSensitiveContent(audit, [first.token, second.token], "admin revoke sessions audit log");
  });

  await check("super-admin disable user invalidates sessions and blocks future login", async () => {
    const targetEmail = `opsechard-disable-${suffix}@test-esg.example`;
    const targetUserId = await createUser({
      companyId: tenants.tenantA.companyId,
      email: targetEmail,
      username: `opsecharddisable${suffix}`,
      role: "contributor",
    });
    const target = new CookieSession();
    await target.login(targetEmail);
    await waitForSessions(target, 1);

    expectStatus(
      await apiRequest("POST", `/api/admin/security/containment/disable-user/${targetUserId}`, undefined, tenants.tenantA.adminToken),
      403,
      "tenant admin disable containment",
    );

    const disabled = parseJson<{ revokedSessions?: number }>(
      await superAdmin.request("POST", `/api/admin/security/containment/disable-user/${targetUserId}`),
      "super-admin disable containment",
    );
    assert(Number(disabled.revokedSessions) >= 1, `expected revoked sessions after disable, got ${JSON.stringify(disabled)}`);
    expectStatus(await target.request("GET", "/api/auth/me", undefined, { bearer: target.token }), 401, "disabled user bearer");
    expectStatus(await apiRequest("POST", "/api/auth/login", { email: targetEmail, password: TEST_PASSWORD }), 401, "disabled user login");

    const audit = await latestAudit({ action: "admin_disable_user", entityId: targetUserId });
    assert(audit, "missing admin_disable_user audit log");
    assert(audit.company_id === tenants.tenantA.companyId, `disable audit missing target company scope ${JSON.stringify(audit)}`);
    assert(audit.actor_type === "super_admin", `disable audit actor mismatch ${JSON.stringify(audit)}`);
    assert(Number(audit.details?.revokedSessions) >= 1, `disable audit missing revoked count ${JSON.stringify(audit.details)}`);
    assertNoSensitiveContent(audit, [target.token, TEST_PASSWORD], "admin disable user audit log");
  });
}

(async () => {
  console.log("\n=== API Regression: Operational/Admin Security Hardening ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("operational/admin security setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Operational/Admin Security Hardening: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
