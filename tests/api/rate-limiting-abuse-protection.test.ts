/**
 * API regression: rate limiting and abuse protection
 *
 * Covers brute-force controls for login, password reset, MFA/recovery-code
 * challenges, invites, API-key auth failures, and audit-log reads.
 *
 * Run: npx tsx tests/api/rate-limiting-abuse-protection.test.ts
 */

import bcrypt from "bcryptjs";
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
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
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

async function createMfaUser(companyId: string, suffix: string, label: string) {
  const email = `rl-${label}-${suffix}@test-esg.example`;
  await createUser({
    companyId,
    email,
    username: `rl${label}${suffix}`.replace(/[^a-zA-Z0-9]/g, ""),
    role: "admin",
  });

  const session = new CookieSession();
  await session.login(email);
  const setup = parseJson<{ secret: string; backupCodes?: string[] }>(
    await session.request("POST", "/api/auth/mfa/setup"),
    "POST /api/auth/mfa/setup",
  );
  parseJson(await session.request("POST", "/api/auth/mfa/verify-setup", {
    token: await generateTotpToken(setup.secret),
  }), "POST /api/auth/mfa/verify-setup");
  return { email, secret: setup.secret, backupCodes: setup.backupCodes ?? [] };
}

async function expectRateLimited(input: {
  attempts: number;
  request: (attempt: number) => Promise<{ status: number; body: string; headers?: Headers }>;
  context: string;
  allowedBeforeLimit: number[];
  secrets?: string[];
}) {
  let last: { status: number; body: string; headers?: Headers } | null = null;
  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    last = await input.request(attempt);
    if (last.status === 429) {
      const body = JSON.parse(last.body) as { error?: string; code?: string; stack?: string };
      assert(body.code === "RATE_LIMITED", `${input.context} missing RATE_LIMITED code: ${last.body}`);
      assert(typeof body.error === "string" && body.error.length > 0, `${input.context} missing safe error message`);
      assert(!("stack" in body), `${input.context} leaked stack trace`);
      const serialized = JSON.stringify(body);
      for (const secret of input.secrets ?? []) {
        assert(!serialized.includes(secret), `${input.context} leaked secret in rate-limit response`);
      }
      return `limited after ${attempt} attempts`;
    }
    assert(input.allowedBeforeLimit.includes(last.status), `${input.context} unexpected pre-limit status=${last.status} body=${last.body.slice(0, 300)}`);
  }
  throw new Error(`${input.context} did not return 429 within ${input.attempts} attempts; last=${last?.status} ${last?.body.slice(0, 300)}`);
}

async function agentRequest(path: string, key?: string) {
  const headers: Record<string, string> = {};
  if (key) headers["X-Agent-API-Key"] = key;
  const res = await fetch(new URL(path, BASE_URL), { headers });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();

  await check("login brute-force attempts are rate limited while other users can still log in", async () => {
    const email = `rl-login-${suffix}@test-esg.example`;
    const detail = await expectRateLimited({
      attempts: 12,
      context: "POST /api/auth/login brute force",
      allowedBeforeLimit: [401],
      secrets: [TEST_PASSWORD],
      request: () => apiRequest("POST", "/api/auth/login", { email, password: `Wrong-${suffix}` }),
    });

    const valid = await apiRequest("POST", "/api/auth/login", { email: tenantA.viewerEmail, password: TEST_PASSWORD });
    expectStatus(valid, 200, "valid login after unrelated brute-force limit");
    return detail;
  });

  await check("password-reset request spam is rate limited with safe responses", async () => {
    const email = `rl-reset-${suffix}@test-esg.example`;
    return expectRateLimited({
      attempts: 12,
      context: "POST /api/auth/forgot-password spam",
      allowedBeforeLimit: [200],
      request: () => apiRequest("POST", "/api/auth/forgot-password", { email }),
    });
  });

  await check("MFA challenge attempts are rate limited per pending user", async () => {
    const mfaUser = await createMfaUser(tenantA.companyId, suffix, "mfa");
    const pending = new CookieSession();
    const login = await pending.request("POST", "/api/auth/login", { email: mfaUser.email, password: TEST_PASSWORD });
    const loginBody = parseJson<{ mfaRequired?: boolean }>(login, "MFA login");
    assert(loginBody.mfaRequired, "MFA login did not require challenge");

    return expectRateLimited({
      attempts: 25,
      context: "POST /api/auth/mfa/verify TOTP attempts",
      allowedBeforeLimit: [401],
      request: () => pending.request("POST", "/api/auth/mfa/verify", { token: `invalid-token-${suffix}` }),
    });
  });

  await check("recovery-code attempts are rate limited per pending user", async () => {
    const mfaUser = await createMfaUser(tenantA.companyId, suffix, "recovery");
    const pending = new CookieSession();
    const login = await pending.request("POST", "/api/auth/login", { email: mfaUser.email, password: TEST_PASSWORD });
    const loginBody = parseJson<{ mfaRequired?: boolean }>(login, "MFA login for recovery code");
    assert(loginBody.mfaRequired, "MFA login did not require recovery-code challenge");

    return expectRateLimited({
      attempts: 25,
      context: "POST /api/auth/mfa/verify recovery-code attempts",
      allowedBeforeLimit: [401],
      secrets: mfaUser.backupCodes,
      request: () => pending.request("POST", "/api/auth/mfa/verify", { backupCode: `not-a-code-${suffix}` }),
    });
  });

  await check("invite create spam is rate limited per tenant actor", async () => {
    return expectRateLimited({
      attempts: 23,
      context: "POST /api/users/invite spam",
      allowedBeforeLimit: [200, 409, 503],
      request: (attempt) => apiRequest("POST", "/api/users/invite", {
        email: `rl-invite-${suffix}-${attempt}@test-esg.example`,
        role: "viewer",
      }, tenantA.adminToken),
    });
  });

  await check("API key authentication failures are rate limited with safe responses", async () => {
    const invalidKey = `esgk_rate_limit_invalid_${suffix}`;
    return expectRateLimited({
      attempts: 23,
      context: "GET /api/internal/agent/health invalid API key",
      allowedBeforeLimit: [401],
      secrets: [invalidKey],
      request: () => agentRequest("/api/internal/agent/health", invalidKey),
    });
  });

  await check("tenant audit-log read abuse is rate limited per actor", async () => {
    return expectRateLimited({
      attempts: 65,
      context: "GET /api/audit-logs read spam",
      allowedBeforeLimit: [200],
      request: () => apiRequest("GET", "/api/audit-logs?limit=1", undefined, tenantA.adminToken),
    });
  });

  await check("super-admin audit-log read abuse is rate limited independently", async () => {
    const superEmail = `rl-super-${suffix}@test-esg.example`;
    const superSession = new CookieSession();
    await createUser({
      companyId: null,
      email: superEmail,
      username: `rlsuper${suffix}`,
      role: "super_admin",
    });
    await superSession.login(superEmail);

    const detail = await expectRateLimited({
      attempts: 65,
      context: "GET /api/admin/audit-logs read spam",
      allowedBeforeLimit: [200],
      request: () => superSession.request("GET", "/api/admin/audit-logs?limit=1"),
    });

    expectStatus(await apiRequest("GET", "/api/audit-logs?limit=1", undefined, tenantB.adminToken), 200, "other tenant audit read after Tenant A/admin limits");
    return detail;
  });
}

(async () => {
  console.log("\n=== API Regression: Rate Limiting and Abuse Protection ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("rate limiting setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Rate Limiting and Abuse Protection: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
