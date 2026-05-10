/**
 * API regression: security audit-log completeness
 *
 * Covers audit logs for API key lifecycle/auth failures and security token
 * invalidation events. Run: npx tsx tests/api/security-audit-log-completeness.test.ts
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

  async stepUp(password = TEST_PASSWORD, mfa?: { totpToken?: string }) {
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

type AuditRow = {
  id: string;
  company_id: string | null;
  user_id: string | null;
  actor_type: string | null;
  actor_agent_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
};

async function latestAudit(input: {
  action: string;
  companyId?: string | null;
  userId?: string | null;
  actorType?: string;
  entityType?: string;
  entityId?: string | null;
  outcome?: string;
  reason?: string;
}): Promise<AuditRow> {
  return withDb(async (client) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const params: unknown[] = [input.action];
      const clauses = ["action = $1"];
      if ("companyId" in input) {
        if (input.companyId === null) {
          clauses.push("company_id IS NULL");
        } else {
          params.push(input.companyId);
          clauses.push(`company_id = $${params.length}`);
        }
      }
      if ("userId" in input) {
        if (input.userId === null) {
          clauses.push("user_id IS NULL");
        } else {
          params.push(input.userId);
          clauses.push(`user_id = $${params.length}`);
        }
      }
      if (input.actorType) {
        params.push(input.actorType);
        clauses.push(`actor_type = $${params.length}`);
      }
      if (input.entityType) {
        params.push(input.entityType);
        clauses.push(`entity_type = $${params.length}`);
      }
      if ("entityId" in input) {
        if (input.entityId === null) {
          clauses.push("entity_id IS NULL");
        } else {
          params.push(input.entityId);
          clauses.push(`entity_id = $${params.length}`);
        }
      }
      if (input.outcome) {
        params.push(input.outcome);
        clauses.push(`details->>'outcome' = $${params.length}`);
      }
      if (input.reason) {
        params.push(input.reason);
        clauses.push(`details->>'reason' = $${params.length}`);
      }
      const res = await client.query<AuditRow>(
        `SELECT * FROM audit_logs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 1`,
        params,
      );
      if (res.rows[0]) return res.rows[0];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`audit log not found: ${JSON.stringify(input)}`);
  });
}

function expectAuditShape(row: AuditRow, expected: {
  companyId?: string | null;
  userId?: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: string;
  reason: string;
}) {
  if ("companyId" in expected) assert(row.company_id === expected.companyId, `company mismatch ${row.company_id}`);
  if ("userId" in expected) assert(row.user_id === expected.userId, `user mismatch ${row.user_id}`);
  assert(row.actor_type === expected.actorType, `actorType mismatch ${row.actor_type}`);
  assert(row.action === expected.action, `action mismatch ${row.action}`);
  assert(row.entity_type === expected.entityType, `entityType mismatch ${row.entity_type}`);
  if ("entityId" in expected) assert(row.entity_id === expected.entityId, `entityId mismatch ${row.entity_id}`);
  assert(row.details?.outcome === expected.outcome, `outcome mismatch ${JSON.stringify(row.details)}`);
  assert(row.details?.reason === expected.reason, `reason mismatch ${JSON.stringify(row.details)}`);
}

function assertNoSensitiveContent(rows: AuditRow | AuditRow[], secrets: string[], context: string) {
  const serialized = JSON.stringify(Array.isArray(rows) ? rows.map((row) => row.details) : rows.details);
  for (const secret of secrets.filter(Boolean)) {
    assert(!serialized.includes(secret), `${context} leaked sensitive value ${secret.slice(0, 12)}...`);
  }
  assert(!serialized.includes("keyHash"), `${context} leaked keyHash`);
  assert(!serialized.includes("tokenHash"), `${context} leaked tokenHash`);
  assert(!/"password"\s*:/.test(serialized), `${context} leaked password field`);
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
  const id = await withDb(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO auth_tokens (token_hash, type, user_id, email, expires_at)
       VALUES ($1, 'password_reset', $2, $3, NOW() + INTERVAL '1 hour')
       RETURNING id`,
      [token.hash, input.userId, input.email],
    );
    return res.rows[0].id;
  });
  return { id, plaintext: token.plaintext };
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

async function agentRequest(path: string, key?: string) {
  const headers: Record<string, string> = {};
  if (key) headers["X-Agent-API-Key"] = key;
  const res = await fetch(new URL(path, BASE_URL), { headers });
  return { status: res.status, body: await res.text() };
}

async function createInternalAgentKey(input: {
  superAdmin: CookieSession;
  companyId?: string | null;
  scopes: string[];
  label: string;
}) {
  return parseJson<{ id: string; key: string; keyPrefix: string; companyId: string | null; scopes: string[] }>(
    await input.superAdmin.request("POST", "/api/internal/agent/keys", {
      agentType: "technical_agent",
      label: input.label,
      scopes: input.scopes,
      companyId: input.companyId ?? null,
    }),
    "POST /api/internal/agent/keys",
  );
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA } = tenants;
  const suffix = Date.now().toString();
  const tenantAAdminUserId = await getUserIdByEmail(tenantA.adminEmail);

  await check("company API key lifecycle and auth failures write safe audit logs", async () => {
    const admin = new CookieSession();
    await admin.login(tenantA.adminEmail);
    parseJson(await admin.stepUp(), "Tenant A step-up");

    const created = parseJson<{ id: string; key: string; keyPrefix: string; label: string }>(
      await admin.request("POST", "/api/company/api-keys", {
        label: `Audit completeness company key ${suffix}`,
        scopes: ["read:metrics"],
      }),
      "POST /api/company/api-keys",
    );
    expectStatus(await agentRequest("/api/internal/agent/health", created.key), 403, "wrong-scope company API key");
    expectStatus(await admin.request("DELETE", `/api/company/api-keys/${created.id}`), 200, "DELETE /api/company/api-keys/:id");
    expectStatus(await agentRequest("/api/internal/agent/health", created.key), 401, "revoked company API key");
    expectStatus(await agentRequest("/api/internal/agent/health", `esgk_invalid_${suffix}`), 401, "invalid API key");
    expectStatus(await agentRequest("/api/internal/agent/health"), 401, "missing API key");

    const createLog = await latestAudit({ action: "api_key_created", companyId: tenantA.companyId, userId: tenantAAdminUserId, entityType: "api_key", entityId: created.id, outcome: "success", reason: "created" });
    const scopeLog = await latestAudit({ action: "api_key_auth_failed", companyId: tenantA.companyId, actorType: "agent", entityType: "agent_api_key", entityId: created.id, outcome: "failure", reason: "missing_scope" });
    const revokeLog = await latestAudit({ action: "api_key_revoked", companyId: tenantA.companyId, userId: tenantAAdminUserId, entityType: "api_key", entityId: created.id, outcome: "success", reason: "revoked" });
    const revokedLog = await latestAudit({ action: "api_key_auth_failed", companyId: tenantA.companyId, actorType: "agent", entityType: "agent_api_key", entityId: created.id, outcome: "failure", reason: "revoked" });
    const invalidLog = await latestAudit({ action: "api_key_auth_failed", companyId: null, actorType: "agent", entityType: "agent_api_key", entityId: null, outcome: "failure", reason: "invalid_key" });
    const missingLog = await latestAudit({ action: "api_key_auth_failed", companyId: null, actorType: "agent", entityType: "agent_api_key", entityId: null, outcome: "failure", reason: "missing_key" });

    expectAuditShape(createLog, { companyId: tenantA.companyId, userId: tenantAAdminUserId, actorType: "user", action: "api_key_created", entityType: "api_key", entityId: created.id, outcome: "success", reason: "created" });
    expectAuditShape(scopeLog, { companyId: tenantA.companyId, actorType: "agent", action: "api_key_auth_failed", entityType: "agent_api_key", entityId: created.id, outcome: "failure", reason: "missing_scope" });
    expectAuditShape(revokeLog, { companyId: tenantA.companyId, userId: tenantAAdminUserId, actorType: "user", action: "api_key_revoked", entityType: "api_key", entityId: created.id, outcome: "success", reason: "revoked" });
    expectAuditShape(revokedLog, { companyId: tenantA.companyId, actorType: "agent", action: "api_key_auth_failed", entityType: "agent_api_key", entityId: created.id, outcome: "failure", reason: "revoked" });
    expectAuditShape(invalidLog, { companyId: null, userId: null, actorType: "agent", action: "api_key_auth_failed", entityType: "agent_api_key", entityId: null, outcome: "failure", reason: "invalid_key" });
    expectAuditShape(missingLog, { companyId: null, userId: null, actorType: "agent", action: "api_key_auth_failed", entityType: "agent_api_key", entityId: null, outcome: "failure", reason: "missing_key" });
    assert(scopeLog.details?.requiredScope === "internal:health", `missing requiredScope ${JSON.stringify(scopeLog.details)}`);
    assertNoSensitiveContent([createLog, scopeLog, revokeLog, revokedLog, invalidLog, missingLog], [created.key], "company API key audit logs");
  });

  await check("internal agent key create/revoke audit logs include tenant scope and safe metadata", async () => {
    const superEmail = `audit-agent-super-${suffix}@test-esg.example`;
    const superUserId = await createUser({
      companyId: null,
      email: superEmail,
      username: `auditagentsuper${suffix}`,
      role: "super_admin",
    });
    const superAdmin = new CookieSession();
    await superAdmin.login(superEmail);

    const key = await createInternalAgentKey({
      superAdmin,
      companyId: tenantA.companyId,
      scopes: ["internal:health"],
      label: `Audit completeness agent key ${suffix}`,
    });
    expectStatus(await superAdmin.request("DELETE", `/api/internal/agent/keys/${key.id}`), 200, "DELETE /api/internal/agent/keys/:id");

    const createLog = await latestAudit({ action: "api_key_created", companyId: tenantA.companyId, userId: superUserId, entityType: "agent_api_key", entityId: key.id, outcome: "success", reason: "created" });
    const revokeLog = await latestAudit({ action: "api_key_revoked", companyId: tenantA.companyId, userId: superUserId, entityType: "agent_api_key", entityId: key.id, outcome: "success", reason: "revoked" });

    expectAuditShape(createLog, { companyId: tenantA.companyId, userId: superUserId, actorType: "user", action: "api_key_created", entityType: "agent_api_key", entityId: key.id, outcome: "success", reason: "created" });
    expectAuditShape(revokeLog, { companyId: tenantA.companyId, userId: superUserId, actorType: "user", action: "api_key_revoked", entityType: "agent_api_key", entityId: key.id, outcome: "success", reason: "revoked" });
    assertNoSensitiveContent([createLog, revokeLog], [key.key], "internal agent key audit logs");
  });

  await check("logout and stale bearer attempts write safe token audit logs", async () => {
    const email = `audit-logout-${suffix}@test-esg.example`;
    const userId = await createUser({
      companyId: tenantA.companyId,
      email,
      username: `auditlogout${suffix}`,
      role: "admin",
    });
    const session = new CookieSession();
    await session.login(email);
    const sessionId = await waitForCurrentSession(session);
    expectStatus(await session.request("POST", "/api/auth/logout"), 200, "POST /api/auth/logout");
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, session.token), 401, "stale bearer after logout");

    const logoutLog = await latestAudit({ action: "logout", companyId: tenantA.companyId, userId, entityType: "auth", entityId: sessionId, outcome: "success", reason: "user_logout" });
    const staleLog = await latestAudit({ action: "token_auth_failed", companyId: null, actorType: "user", entityType: "auth", outcome: "failure", reason: "invalid_or_expired_bearer" });
    expectAuditShape(logoutLog, { companyId: tenantA.companyId, userId, actorType: "user", action: "logout", entityType: "auth", entityId: sessionId, outcome: "success", reason: "user_logout" });
    expectAuditShape(staleLog, { companyId: null, actorType: "user", action: "token_auth_failed", entityType: "auth", outcome: "failure", reason: "invalid_or_expired_bearer" });
    assertNoSensitiveContent([logoutLog, staleLog], [session.token], "logout audit logs");
  });

  await check("password reset and stale token attempts write safe audit logs", async () => {
    const email = `audit-reset-${suffix}@test-esg.example`;
    const userId = await createUser({
      companyId: tenantA.companyId,
      email,
      username: `auditreset${suffix}`,
      role: "admin",
    });
    const session = new CookieSession();
    await session.login(email);
    await waitForCurrentSession(session);

    const resetToken = await insertPasswordResetToken({ userId, email });
    expectStatus(await apiRequest("POST", "/api/auth/reset-password", {
      token: resetToken.plaintext,
      newPassword: "AuditReset123!",
    }), 200, "POST /api/auth/reset-password");
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, session.token), 401, "stale bearer after password reset");

    const resetLog = await latestAudit({ action: "password_reset", companyId: tenantA.companyId, userId, entityType: "auth", entityId: resetToken.id, outcome: "success", reason: "password_reset_completed" });
    expectAuditShape(resetLog, { companyId: tenantA.companyId, userId, actorType: "user", action: "password_reset", entityType: "auth", entityId: resetToken.id, outcome: "success", reason: "password_reset_completed" });
    assert(Number(resetLog.details?.revokedSessions) >= 1, `missing revoked session count ${JSON.stringify(resetLog.details)}`);
    assertNoSensitiveContent(resetLog, [resetToken.plaintext, session.token], "password reset audit log");
  });

  await check("MFA enable/disable and role changes log token invalidation counts", async () => {
    const mfaEmail = `audit-mfa-${suffix}@test-esg.example`;
    const roleEmail = `audit-role-${suffix}@test-esg.example`;
    const mfaUserId = await createUser({
      companyId: tenantA.companyId,
      email: mfaEmail,
      username: `auditmfa${suffix}`,
      role: "admin",
    });
    const roleUserId = await createUser({
      companyId: tenantA.companyId,
      email: roleEmail,
      username: `auditrole${suffix}`,
      role: "viewer",
    });

    const acting = new CookieSession();
    const stale = new CookieSession();
    await acting.login(mfaEmail);
    await stale.login(mfaEmail);
    await waitForSessions(acting, 2);
    const setup = parseJson<{ secret: string }>(
      await acting.request("POST", "/api/auth/mfa/setup"),
      "POST /api/auth/mfa/setup",
    );
    parseJson(await acting.request("POST", "/api/auth/mfa/verify-setup", {
      token: await generateTotpToken(setup.secret),
    }), "POST /api/auth/mfa/verify-setup");
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, stale.token), 401, "stale bearer after MFA enable");
    parseJson(await acting.stepUp(TEST_PASSWORD, { totpToken: await generateTotpToken(setup.secret) }), "MFA step-up before disable");
    parseJson(await acting.request("POST", "/api/auth/mfa/disable", {
      password: TEST_PASSWORD,
      token: await generateTotpToken(setup.secret),
    }), "POST /api/auth/mfa/disable");

    const mfaEnabledLog = await latestAudit({ action: "mfa_enabled", companyId: tenantA.companyId, userId: mfaUserId, entityType: "user", entityId: mfaUserId, outcome: "success", reason: "mfa_setup_completed" });
    const mfaDisabledLog = await latestAudit({ action: "mfa_disabled", companyId: tenantA.companyId, userId: mfaUserId, entityType: "user", entityId: mfaUserId, outcome: "success", reason: "mfa_disabled" });
    assert(Number(mfaEnabledLog.details?.revokedSessions) >= 1, `MFA enable missing revoked count ${JSON.stringify(mfaEnabledLog.details)}`);
    assert(Number(mfaDisabledLog.details?.revokedSessions) >= 0, `MFA disable missing revoked count ${JSON.stringify(mfaDisabledLog.details)}`);
    assertNoSensitiveContent([mfaEnabledLog, mfaDisabledLog], [setup.secret, stale.token], "MFA audit logs");

    const roleTarget = new CookieSession();
    await roleTarget.login(roleEmail);
    await waitForCurrentSession(roleTarget);
    const admin = new CookieSession();
    await admin.login(tenantA.adminEmail);
    parseJson(await admin.stepUp(), "admin step-up for role change");
    const changed = parseJson<{ role: string }>(
      await admin.request("PUT", `/api/users/${roleUserId}/role`, { role: "contributor" }),
      "PUT /api/users/:id/role",
    );
    assert(changed.role === "contributor", `unexpected changed role ${changed.role}`);
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, roleTarget.token), 401, "stale bearer after role change");

    const roleLog = await latestAudit({ action: "user_role_changed", companyId: tenantA.companyId, userId: tenantAAdminUserId, entityType: "user", entityId: roleUserId, outcome: "success", reason: "role_changed" });
    expectAuditShape(roleLog, { companyId: tenantA.companyId, userId: tenantAAdminUserId, actorType: "user", action: "user_role_changed", entityType: "user", entityId: roleUserId, outcome: "success", reason: "role_changed" });
    assert(Number(roleLog.details?.revokedSessions) >= 1, `role change missing revoked count ${JSON.stringify(roleLog.details)}`);
    assert(roleLog.details?.before?.role === "viewer" && roleLog.details?.after?.role === "contributor", `role change before/after mismatch ${JSON.stringify(roleLog.details)}`);
    assertNoSensitiveContent(roleLog, [roleTarget.token], "role-change audit log");
  });
}

(async () => {
  console.log("\n=== API Regression: Security Audit-Log Completeness ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("security audit-log completeness setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Security Audit-Log Completeness: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
