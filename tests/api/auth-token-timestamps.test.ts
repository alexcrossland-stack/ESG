/**
 * API regression: auth/security token timestamp handling
 *
 * Covers DB-authoritative expiry and shared timestamp handling for auth tokens,
 * persisted bearer sessions, step-up timestamps, and agent API keys.
 *
 * Run: npx tsx tests/api/auth-token-timestamps.test.ts
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

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

function expectStatus(res: { status: number; body: string }, expected: number, context: string) {
  assert(res.status === expected, `${context} expected=${expected} got=${res.status} body=${res.body.slice(0, 500)}`);
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

function createPlainToken() {
  const plaintext = crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

function createAgentPlainKey() {
  const plaintext = `esgk_${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  const prefix = `${plaintext.slice(0, "esgk_".length + 8)}...`;
  return { plaintext, hash, prefix };
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

  async stepUp(password = TEST_PASSWORD) {
    return this.request("POST", "/api/auth/step-up", { password });
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

async function createUser(companyId: string, suffix: string, label: string) {
  return withDb(async (client) => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const email = `${label}-${suffix}@test-esg.example`;
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')
       RETURNING id`,
      [`${label}${suffix}`.replace(/[^a-zA-Z0-9]/g, ""), email, passwordHash, companyId],
    );
    return { id: res.rows[0].id, email };
  });
}

async function insertInvitationToken(input: {
  companyId: string;
  email: string;
  expiry: "past" | "future";
  used?: boolean;
}) {
  const token = createPlainToken();
  const expiresSql = input.expiry === "past" ? "NOW() - INTERVAL '1 minute'" : "NOW() + INTERVAL '1 minute'";
  await withDb(async (client) => {
    const companyRes = await client.query<{ name: string }>("SELECT name FROM companies WHERE id = $1", [input.companyId]);
    await client.query(
      `INSERT INTO auth_tokens (token_hash, type, email, metadata, expires_at, used_at)
       VALUES ($1, 'invitation', $2, $3::jsonb, ${expiresSql}, ${input.used ? "NOW()" : "NULL"})`,
      [
        token.hash,
        input.email,
        JSON.stringify({
          companyId: input.companyId,
          role: "contributor",
          inviteeName: null,
          companyName: companyRes.rows[0]?.name ?? "Test Company",
          invitedUserId: null,
        }),
      ],
    );
  });
  return token.plaintext;
}

async function insertResetToken(input: {
  userId: string;
  email: string;
  expiry: "past" | "future";
  used?: boolean;
}) {
  const token = createPlainToken();
  const expiresSql = input.expiry === "past" ? "NOW() - INTERVAL '1 minute'" : "NOW() + INTERVAL '1 hour'";
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO auth_tokens (token_hash, type, user_id, email, expires_at, used_at)
       VALUES ($1, 'password_reset', $2, $3, ${expiresSql}, ${input.used ? "NOW()" : "NULL"})`,
      [token.hash, input.userId, input.email],
    );
  });
  return token.plaintext;
}

async function createAgentApiKey(input: { companyId: string | null; expiry: "past" | "future"; revoked?: boolean }) {
  const key = createAgentPlainKey();
  const expiresSql = input.expiry === "past" ? "NOW() - INTERVAL '1 minute'" : "NOW() + INTERVAL '1 hour'";
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO agent_api_keys (agent_type, label, key_hash, key_prefix, scopes, company_id, expires_at, revoked_at)
       VALUES ('technical_agent', $1, $2, $3, $4::jsonb, $5, ${expiresSql}, ${input.revoked ? "NOW()" : "NULL"})`,
      [
        `Timestamp regression ${input.expiry}${input.revoked ? " revoked" : ""}`,
        key.hash,
        key.prefix,
        JSON.stringify(["internal:health"]),
        input.companyId,
      ],
    );
  });
  return key.plaintext;
}

async function getCurrentSessionId(session: CookieSession): Promise<string> {
  const sessions = parseJson<Array<{ sessionId: string; isCurrent: boolean }>>(
    await session.request("GET", "/api/auth/sessions"),
    "GET /api/auth/sessions",
  );
  const current = sessions.find((s) => s.isCurrent) ?? sessions[0];
  assert(current?.sessionId, "current session id missing");
  return current.sessionId;
}

async function agentRequest(path: string, key: string) {
  const res = await fetch(new URL(path, BASE_URL), {
    headers: { "X-Agent-API-Key": key },
  });
  return { status: res.status, body: await res.text() };
}

async function run() {
  const { tenantA } = await seedTestTenants();
  const suffix = Date.now().toString();
  const resetUser = await createUser(tenantA.companyId, suffix, "tokentsreset");

  await check("DB-expired invitation token is rejected", async () => {
    const token = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `invite-db-expired-${suffix}@test-esg.example`,
      expiry: "past",
    });
    const res = await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(token)}`);
    expectStatus(res, 410, "GET /api/auth/invitation expired");
    assert(/expired/i.test(res.body), `expected expired error, got ${res.body.slice(0, 300)}`);
  });

  await check("DB-future invitation token remains valid", async () => {
    const email = `invite-db-future-${suffix}@test-esg.example`;
    const token = await insertInvitationToken({ companyId: tenantA.companyId, email, expiry: "future" });
    const res = await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(token)}`);
    const body = parseJson<{ email?: string; role?: string }>(res, "GET /api/auth/invitation future");
    assert(body.email === email && body.role === "contributor", `unexpected invitation payload ${JSON.stringify(body)}`);
  });

  await check("DB-expired password reset token is rejected", async () => {
    const token = await insertResetToken({ userId: resetUser.id, email: resetUser.email, expiry: "past" });
    const res = await apiRequest("POST", "/api/auth/reset-password", {
      token,
      newPassword: "ExpiredReset123!",
    });
    expectStatus(res, 400, "POST /api/auth/reset-password expired");
    assert(/expired/i.test(res.body), `expected expired error, got ${res.body.slice(0, 300)}`);
  });

  await check("used password reset token cannot be consumed", async () => {
    const token = await insertResetToken({ userId: resetUser.id, email: resetUser.email, expiry: "future", used: true });
    const res = await apiRequest("POST", "/api/auth/reset-password", {
      token,
      newPassword: "UsedReset123!",
    });
    expectStatus(res, 400, "POST /api/auth/reset-password used");
    assert(/already been used/i.test(res.body), `expected used-token error, got ${res.body.slice(0, 300)}`);
  });

  await check("expired extended session rejects cookie and bearer auth", async () => {
    const user = await createUser(tenantA.companyId, suffix, "tokentssession");
    const session = new CookieSession();
    await session.login(user.email);
    const sessionId = await getCurrentSessionId(session);
    await withDb((client) => client.query(
      "UPDATE user_sessions_ext SET expires_at = NOW() - INTERVAL '1 minute' WHERE session_id = $1",
      [sessionId],
    ));

    expectStatus(await session.request("GET", "/api/auth/me"), 401, "expired cookie session /api/auth/me");
    expectStatus(await session.request("GET", "/api/auth/me", undefined, { bearer: session.token }), 401, "expired bearer session /api/auth/me");
  });

  await check("expired DB step-up timestamp blocks sensitive settings writes", async () => {
    const user = await createUser(tenantA.companyId, suffix, "tokentsstepup");
    const session = new CookieSession();
    await session.login(user.email);
    parseJson(await session.stepUp(), "POST /api/auth/step-up");
    const sessionId = await getCurrentSessionId(session);
    await withDb((client) => client.query(
      "UPDATE user_sessions_ext SET step_up_at = NOW() - INTERVAL '20 minutes' WHERE session_id = $1",
      [sessionId],
    ));

    const status = parseJson<{ stepUpValid: boolean }>(
      await session.request("GET", "/api/auth/step-up/status"),
      "GET /api/auth/step-up/status expired",
    );
    assert(status.stepUpValid === false, "expired DB step-up timestamp should not be valid");

    const res = await session.request("POST", "/api/company/api-keys", {
      label: "Blocked by expired step-up",
      scopes: ["read:metrics"],
    });
    expectStatus(res, 403, "POST /api/company/api-keys expired step-up");
    assert(JSON.parse(res.body).code === "STEP_UP_REQUIRED", `expected STEP_UP_REQUIRED, got ${res.body.slice(0, 300)}`);
  });

  await check("malformed API key expiry timestamp is rejected", async () => {
    const user = await createUser(tenantA.companyId, suffix, "tokentsmalformed");
    const session = new CookieSession();
    await session.login(user.email);
    parseJson(await session.stepUp(), "POST /api/auth/step-up");
    const res = await session.request("POST", "/api/company/api-keys", {
      label: "Malformed expiry",
      scopes: ["read:metrics"],
      expiresAt: "not-a-timestamp",
    });
    expectStatus(res, 400, "POST /api/company/api-keys malformed expiry");
  });

  await check("agent API key expiry, revocation, and malformed keys fail closed", async () => {
    const expiredKey = await createAgentApiKey({ companyId: tenantA.companyId, expiry: "past" });
    expectStatus(await agentRequest("/api/internal/agent/health", expiredKey), 401, "expired agent key");

    const revokedKey = await createAgentApiKey({ companyId: tenantA.companyId, expiry: "future", revoked: true });
    expectStatus(await agentRequest("/api/internal/agent/health", revokedKey), 401, "revoked agent key");

    expectStatus(await agentRequest("/api/internal/agent/health", "not-a-real-agent-key"), 401, "malformed agent key");
  });
}

(async () => {
  console.log("\n=== API Regression: Auth Token Timestamp Handling ===\n");
  try {
    await run();
  } catch (error: any) {
    fail("auth token timestamp setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Auth Token Timestamp Handling: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
