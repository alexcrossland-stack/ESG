/**
 * API regression: API key and auth-token lifecycle hardening
 *
 * Covers display-once API keys, revoked/expired/malformed/wrong-scope keys,
 * tenant-scoped internal agent access, and session invalidation after logout,
 * password reset, MFA changes, and role changes.
 *
 * Run: npx tsx tests/api/api-key-token-lifecycle-hardening.test.ts
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";
import { generateTotpToken } from "../../server/mfa.js";

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

function assertNoSecretLeak(value: unknown, secrets: Array<string | undefined>, context: string) {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    if (secret) assert(!serialized.includes(secret), `${context} leaked secret ${secret.slice(0, 12)}...`);
  }
  assert(!serialized.includes("keyHash"), `${context} leaked keyHash`);
  assert(!serialized.includes("tokenHash"), `${context} leaked tokenHash`);
  assert(!serialized.includes("password"), `${context} leaked password field`);
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

  async stepUp(password = TEST_PASSWORD, mfa?: { totpToken?: string; backupCode?: string }) {
    return this.request("POST", "/api/auth/step-up", { password, ...(mfa ?? {}) });
  }

  private captureCookie(res: Response) {
    const getSetCookie = (res.headers as any).getSetCookie?.bind(res.headers);
    const cookies: string[] = typeof getSetCookie === "function"
      ? getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
    const sessionCookie = cookies.find((cookie) => cookie.includes("connect.sid="));
    if (sessionCookie) this.cookie = sessionCookie.split(";")[0];
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

async function getUserIdByEmail(email: string): Promise<string> {
  return withDb(async (client) => {
    const res = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    assert(res.rows[0]?.id, `missing user for ${email}`);
    return res.rows[0].id;
  });
}

function createPlainToken() {
  const plaintext = crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

async function insertPasswordResetToken(input: { userId: string; email: string }) {
  const token = createPlainToken();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO auth_tokens (token_hash, type, user_id, email, expires_at)
       VALUES ($1, 'password_reset', $2, $3, NOW() + INTERVAL '1 hour')`,
      [token.hash, input.userId, input.email],
    );
  });
  return token.plaintext;
}

async function waitForCurrentSession(session: CookieSession): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const res = await session.request("GET", "/api/auth/sessions");
    if (res.status === 200) {
      const sessions = JSON.parse(res.body) as Array<{ sessionId: string; isCurrent: boolean }>;
      const current = sessions.find((item) => item.isCurrent) ?? sessions[0];
      if (current?.sessionId) return current.sessionId;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("current session id missing");
}

async function waitForSessions(session: CookieSession, minCount: number) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const res = await session.request("GET", "/api/auth/sessions");
    if (res.status === 200) {
      const sessions = JSON.parse(res.body) as Array<{ sessionId: string; isCurrent: boolean }>;
      if (sessions.length >= minCount) return sessions;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`expected at least ${minCount} active session(s)`);
}

async function agentRequest(path: string, key: string) {
  const res = await fetch(new URL(path, BASE_URL), {
    headers: { "X-Agent-API-Key": key },
  });
  return { status: res.status, body: await res.text() };
}

async function createInternalAgentKey(input: {
  superAdmin: CookieSession;
  companyId?: string | null;
  scopes: string[];
  label: string;
  expiresAt?: string;
}) {
  return parseJson<{ id: string; key: string; keyPrefix: string; companyId: string | null; scopes: string[] }>(
    await input.superAdmin.request("POST", "/api/internal/agent/keys", {
      agentType: "technical_agent",
      label: input.label,
      scopes: input.scopes,
      companyId: input.companyId ?? null,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    }),
    "POST /api/internal/agent/keys",
  );
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();

  await check("company API keys display once, stay tenant-isolated, and fail closed after revoke/expiry/malformed input", async () => {
    const adminA = new CookieSession();
    const adminB = new CookieSession();
    await adminA.login(tenantA.adminEmail);
    await adminB.login(tenantB.adminEmail);
    parseJson(await adminA.stepUp(), "Tenant A step-up");
    parseJson(await adminB.stepUp(), "Tenant B step-up");

    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, tenantA.viewerToken), 403, "viewer list company API keys");
    expectStatus(await apiRequest("POST", "/api/company/api-keys", { label: "blocked", scopes: ["read:metrics"] }, tenantA.contributorToken), 403, "contributor create company API key");

    const tenantBKey = parseJson<{ id: string; key: string; label: string }>(
      await adminB.request("POST", "/api/company/api-keys", {
        label: `Tenant B lifecycle key ${suffix}`,
        scopes: ["read:metrics"],
      }),
      "Tenant B create API key",
    );
    assert(tenantBKey.key?.startsWith("esgk_"), "Tenant B create did not return plaintext key once");

    const created = parseJson<{ id: string; key: string; keyPrefix: string; label: string }>(
      await adminA.request("POST", "/api/company/api-keys", {
        label: `Tenant A lifecycle key ${suffix}`,
        scopes: ["read:metrics", "read:reports"],
      }),
      "Tenant A create API key",
    );
    assert(created.key?.startsWith("esgk_"), "create did not return plaintext key");
    assertNoSecretLeak(created, [], "company API key create response metadata");

    const listed = parseJson<Array<{ id: string; key?: string; keyHash?: string; label: string; revokedAt?: string | null }>>(
      await adminA.request("GET", "/api/company/api-keys"),
      "Tenant A list API keys",
    );
    const listedKey = listed.find((key) => key.id === created.id);
    assert(listedKey, "Tenant A key missing from list");
    assert(!("key" in listedKey), "company API key list leaked plaintext key");
    assert(!("keyHash" in listedKey), "company API key list leaked hash");
    assert(!listed.some((key) => key.id === tenantBKey.id || key.label === tenantBKey.label), "Tenant A API key list leaked Tenant B key");
    assertNoSecretLeak(listed, [created.key, tenantBKey.key], "company API key list");

    expectStatus(await agentRequest("/api/internal/agent/health", created.key), 403, "valid company API key with wrong internal scope");
    expectStatus(await agentRequest("/api/internal/agent/health", "not-a-real-key"), 401, "malformed API key");
    expectStatus(await adminB.request("DELETE", `/api/company/api-keys/${created.id}`), 404, "Tenant B revoke Tenant A key");
    expectStatus(await adminA.request("DELETE", `/api/company/api-keys/${created.id}`), 200, "Tenant A revoke own key");
    expectStatus(await agentRequest("/api/internal/agent/health", created.key), 401, "revoked company API key");

    const expired = parseJson<{ id: string; key: string }>(
      await adminA.request("POST", "/api/company/api-keys", {
        label: `Expired lifecycle key ${suffix}`,
        scopes: ["read:metrics"],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
      "Tenant A create expired API key",
    );
    expectStatus(await agentRequest("/api/internal/agent/health", expired.key), 401, "expired company API key");

    const relisted = parseJson<Array<{ id: string; key?: string }>>(
      await adminA.request("GET", "/api/company/api-keys"),
      "Tenant A relist API keys",
    );
    assertNoSecretLeak(relisted, [created.key, expired.key, tenantBKey.key], "company API key relist");
  });

  await check("internal agent key management is super-admin only, display-once, and tenant-scoped", async () => {
    const superEmail = `agent-super-${suffix}@test-esg.example`;
    await createUser({
      companyId: null,
      email: superEmail,
      username: `agentsuper${suffix}`,
      role: "super_admin",
    });

    const superAdmin = new CookieSession();
    await superAdmin.login(superEmail);
    const tenantAdmin = new CookieSession();
    await tenantAdmin.login(tenantA.adminEmail);

    expectStatus(await tenantAdmin.request("GET", "/api/internal/agent/keys"), 403, "tenant admin list internal keys");
    expectStatus(await tenantAdmin.request("POST", "/api/internal/agent/keys", {
      agentType: "technical_agent",
      label: "blocked",
      scopes: ["internal:health"],
    }), 403, "tenant admin create internal key");

    const tenantBAdminUserId = await getUserIdByEmail(tenantB.adminEmail);
    const scopedKey = await createInternalAgentKey({
      superAdmin,
      companyId: tenantA.companyId,
      scopes: ["internal:company", "internal:user", "internal:events", "internal:health"],
      label: `Tenant-scoped internal key ${suffix}`,
    });
    assert(scopedKey.key?.startsWith("esgk_"), "internal key create did not return plaintext key once");
    assert(scopedKey.companyId === tenantA.companyId, "internal key stored against wrong company");

    const listed = parseJson<Array<{ id: string; key?: string; keyHash?: string; companyId?: string | null }>>(
      await superAdmin.request("GET", "/api/internal/agent/keys"),
      "super admin list internal keys",
    );
    const listedKey = listed.find((key) => key.id === scopedKey.id);
    assert(listedKey, "internal key missing from list");
    assert(!("key" in listedKey), "internal key list leaked plaintext key");
    assert(!("keyHash" in listedKey), "internal key list leaked hash");
    assertNoSecretLeak(listed, [scopedKey.key], "internal key list");

    expectStatus(await agentRequest(`/api/internal/agent/company/${tenantA.companyId}`, scopedKey.key), 200, "scoped key own company");
    expectStatus(await agentRequest(`/api/internal/agent/company/${tenantB.companyId}`, scopedKey.key), 403, "scoped key cross-tenant company");
    expectStatus(await agentRequest(`/api/internal/agent/user/${tenantBAdminUserId}`, scopedKey.key), 403, "scoped key cross-tenant user");
    expectStatus(await agentRequest(`/api/internal/agent/audit-logs/${tenantB.companyId}`, scopedKey.key), 403, "scoped key cross-tenant audit logs");

    const wrongScopeKey = await createInternalAgentKey({
      superAdmin,
      companyId: tenantA.companyId,
      scopes: ["internal:health"],
      label: `Wrong-scope internal key ${suffix}`,
    });
    expectStatus(await agentRequest(`/api/internal/agent/company/${tenantA.companyId}`, wrongScopeKey.key), 403, "wrong-scope internal key");

    const expiredKey = await createInternalAgentKey({
      superAdmin,
      companyId: tenantA.companyId,
      scopes: ["internal:health"],
      label: `Expired internal key ${suffix}`,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expectStatus(await agentRequest("/api/internal/agent/health", expiredKey.key), 401, "expired internal key");

    expectStatus(await superAdmin.request("DELETE", `/api/internal/agent/keys/${scopedKey.id}`), 200, "super admin revoke internal key");
    expectStatus(await agentRequest("/api/internal/agent/health", scopedKey.key), 401, "revoked internal key");
  });

  await check("logout without bearer invalidates the linked bearer token and extended session", async () => {
    const email = `logout-lifecycle-${suffix}@test-esg.example`;
    await createUser({
      companyId: tenantA.companyId,
      email,
      username: `logoutlifecycle${suffix}`,
      role: "admin",
    });
    const session = new CookieSession();
    await session.login(email);
    const sessionId = await waitForCurrentSession(session);
    expectStatus(await session.request("POST", "/api/auth/logout"), 200, "cookie-only logout");
    expectStatus(await session.request("GET", "/api/auth/me", undefined, { bearer: session.token }), 401, "bearer after cookie-only logout");
    const revokedAt = await withDb(async (client) => {
      const res = await client.query<{ revoked_at: Date | null }>("SELECT revoked_at FROM user_sessions_ext WHERE session_id = $1", [sessionId]);
      return res.rows[0]?.revoked_at ?? null;
    });
    assert(revokedAt, "logout did not revoke extended session row");
  });

  await check("password reset invalidates existing sessions and stale bearer tokens", async () => {
    const email = `reset-lifecycle-${suffix}@test-esg.example`;
    const userId = await createUser({
      companyId: tenantA.companyId,
      email,
      username: `resetlifecycle${suffix}`,
      role: "admin",
    });
    const session = new CookieSession();
    await session.login(email);
    await waitForCurrentSession(session);

    const token = await insertPasswordResetToken({ userId, email });
    expectStatus(await apiRequest("POST", "/api/auth/reset-password", {
      token,
      newPassword: "ResetLifecycle123!",
    }), 200, "password reset");
    expectStatus(await session.request("GET", "/api/auth/me"), 401, "cookie after password reset");
    expectStatus(await session.request("GET", "/api/auth/me", undefined, { bearer: session.token }), 401, "bearer after password reset");

    const newLogin = new CookieSession();
    await newLogin.login(email, "ResetLifecycle123!");
    expectStatus(await newLogin.request("GET", "/api/auth/me"), 200, "login after reset with new password");
  });

  await check("MFA changes preserve the acting session and invalidate other sessions", async () => {
    const email = `mfa-lifecycle-${suffix}@test-esg.example`;
    await createUser({
      companyId: tenantA.companyId,
      email,
      username: `mfalifecycle${suffix}`,
      role: "admin",
    });
    const acting = new CookieSession();
    const stale = new CookieSession();
    await acting.login(email);
    await stale.login(email);
    await waitForSessions(acting, 2);

    const setup = parseJson<{ secret: string }>(
      await acting.request("POST", "/api/auth/mfa/setup"),
      "POST /api/auth/mfa/setup",
    );
    parseJson(await acting.request("POST", "/api/auth/mfa/verify-setup", {
      token: await generateTotpToken(setup.secret),
    }), "POST /api/auth/mfa/verify-setup");
    expectStatus(await acting.request("GET", "/api/auth/me"), 200, "acting session after MFA enable");
    expectStatus(await stale.request("GET", "/api/auth/me", undefined, { bearer: stale.token }), 401, "stale session after MFA enable");

    const second = new CookieSession();
    await second.request("POST", "/api/auth/login", { email, password: TEST_PASSWORD });
    parseJson(await second.request("POST", "/api/auth/mfa/verify", {
      token: await generateTotpToken(setup.secret),
    }), "second MFA login");
    await waitForSessions(acting, 2);

    parseJson(await acting.stepUp(TEST_PASSWORD, { totpToken: await generateTotpToken(setup.secret) }), "MFA step-up before disable");
    parseJson(await acting.request("POST", "/api/auth/mfa/disable", {
      password: TEST_PASSWORD,
      token: await generateTotpToken(setup.secret),
    }), "POST /api/auth/mfa/disable");
    expectStatus(await acting.request("GET", "/api/auth/me"), 200, "acting session after MFA disable");
    expectStatus(await second.request("GET", "/api/auth/me", undefined, { bearer: second.token }), 401, "stale session after MFA disable");
  });

  await check("role changes invalidate the target user's existing sessions", async () => {
    const targetEmail = `role-lifecycle-${suffix}@test-esg.example`;
    const targetUserId = await createUser({
      companyId: tenantA.companyId,
      email: targetEmail,
      username: `rolelifecycle${suffix}`,
      role: "viewer",
    });
    const target = new CookieSession();
    await target.login(targetEmail);
    await waitForCurrentSession(target);

    const admin = new CookieSession();
    await admin.login(tenantA.adminEmail);
    parseJson(await admin.stepUp(), "admin step-up");
    const changed = parseJson<{ id: string; role: string }>(
      await admin.request("PUT", `/api/users/${targetUserId}/role`, { role: "contributor" }),
      "PUT /api/users/:id/role",
    );
    assert(changed.role === "contributor", `expected contributor role, got ${changed.role}`);
    expectStatus(await target.request("GET", "/api/auth/me", undefined, { bearer: target.token }), 401, "target bearer after role change");
    expectStatus(await target.request("GET", "/api/auth/me"), 401, "target cookie after role change");
  });
}

(async () => {
  console.log("\n=== API Regression: API Key and Token Lifecycle Hardening ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("api key/token lifecycle setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== API Key and Token Lifecycle Hardening: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
