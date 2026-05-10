/**
 * API regression: Settings/Security hardening
 *
 * Covers step-up auth, MFA lifecycle, API key revocation, session revocation,
 * role-change boundaries, and internal-agent tenant isolation.
 *
 * Run: npx tsx tests/api/settings-security.test.ts
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
    assert(body.token, "login response missing token");
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

async function getUserIdByEmail(email: string): Promise<string> {
  return withDb(async (client) => {
    const res = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    assert(res.rows[0]?.id, `missing user for ${email}`);
    return res.rows[0].id;
  });
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

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();

  await check("settings/admin endpoints enforce role boundaries", async () => {
    expectStatus(await apiRequest("GET", "/api/company/api-keys"), 401, "GET /api/company/api-keys unauthenticated");
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, tenantA.viewerToken), 403, "viewer GET /api/company/api-keys");
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, tenantA.contributorToken), 403, "contributor GET /api/company/api-keys");
    expectStatus(await apiRequest("GET", "/api/company/api-keys", undefined, tenantA.adminToken), 200, "admin GET /api/company/api-keys");

    expectStatus(await apiRequest("POST", "/api/company/api-keys", { label: "blocked", scopes: ["read:metrics"] }, tenantA.viewerToken), 403, "viewer POST /api/company/api-keys");
    expectStatus(await apiRequest("POST", "/api/company/api-keys", { label: "blocked", scopes: ["read:metrics"] }, tenantA.contributorToken), 403, "contributor POST /api/company/api-keys");
  });

  await check("settings/admin direct APIs enforce tenant isolation and role boundaries", async () => {
    const settingsMarkerA = `settings-admin-a-${suffix}`;
    const settingsMarkerB = `settings-admin-b-${suffix}`;
    const idpNameB = `Tenant B SSO ${suffix}`;
    const idpMarkerB = `idp-b-${suffix}.test-esg.example`;

    expectStatus(
      await apiRequest("PUT", "/api/company/settings", { reportBrandingName: "blocked viewer" }, tenantA.viewerToken),
      403,
      "viewer PUT /api/company/settings",
    );
    expectStatus(
      await apiRequest("PUT", "/api/company/settings", { reportBrandingName: "blocked contributor" }, tenantA.contributorToken),
      403,
      "contributor PUT /api/company/settings",
    );
    expectStatus(
      await apiRequest("PUT", "/api/company/settings", { reportBrandingName: settingsMarkerA }, tenantA.adminToken),
      200,
      "Tenant A admin PUT /api/company/settings",
    );
    expectStatus(
      await apiRequest("PUT", "/api/company/settings", { reportBrandingName: settingsMarkerB }, tenantB.adminToken),
      200,
      "Tenant B admin PUT /api/company/settings",
    );
    const settingsA = parseJson<any>(
      await apiRequest("GET", "/api/company/settings", undefined, tenantA.adminToken),
      "Tenant A GET /api/company/settings",
    );
    const settingsB = parseJson<any>(
      await apiRequest("GET", "/api/company/settings", undefined, tenantB.adminToken),
      "Tenant B GET /api/company/settings",
    );
    assert(settingsA.reportBrandingName === settingsMarkerA, "Tenant A settings did not return Tenant A marker");
    assert(settingsB.reportBrandingName === settingsMarkerB, "Tenant B settings did not return Tenant B marker");
    assert(JSON.stringify(settingsA).includes(settingsMarkerB) === false, "Tenant A settings leaked Tenant B marker");
    assert(JSON.stringify(settingsB).includes(settingsMarkerA) === false, "Tenant B settings leaked Tenant A marker");

    expectStatus(await apiRequest("GET", "/api/users", undefined, tenantA.viewerToken), 403, "viewer GET /api/users");
    expectStatus(await apiRequest("GET", "/api/users", undefined, tenantA.contributorToken), 403, "contributor GET /api/users");
    const usersA = parseJson<Array<{ email?: string; companyId?: string; password?: string }>>(
      await apiRequest("GET", "/api/users", undefined, tenantA.adminToken),
      "Tenant A GET /api/users",
    );
    const usersB = parseJson<Array<{ email?: string; companyId?: string; password?: string }>>(
      await apiRequest("GET", "/api/users", undefined, tenantB.adminToken),
      "Tenant B GET /api/users",
    );
    assert(usersA.some((user) => user.email === tenantA.adminEmail), "Tenant A users missing Tenant A admin");
    assert(usersA.every((user) => user.companyId === tenantA.companyId), "Tenant A users response included another company");
    assert(!usersA.some((user) => user.email === tenantB.adminEmail), "Tenant A users leaked Tenant B admin");
    assert(usersA.every((user) => !("password" in user)), "Tenant A users response leaked password hashes");
    assert(usersB.some((user) => user.email === tenantB.adminEmail), "Tenant B users missing Tenant B admin");
    assert(usersB.every((user) => user.companyId === tenantB.companyId), "Tenant B users response included another company");
    assert(!usersB.some((user) => user.email === tenantA.adminEmail), "Tenant B users leaked Tenant A admin");

    expectStatus(
      await apiRequest("POST", "/api/users/invite", { email: `blocked-viewer-${suffix}@test-esg.example`, role: "viewer" }, tenantA.viewerToken),
      403,
      "viewer POST /api/users/invite",
    );
    expectStatus(
      await apiRequest("POST", "/api/users/invite", { email: `blocked-contributor-${suffix}@test-esg.example`, role: "viewer" }, tenantA.contributorToken),
      403,
      "contributor POST /api/users/invite",
    );
    expectStatus(
      await apiRequest("POST", `/api/companies/${tenantB.companyId}/invites`, { email: `cross-invite-${suffix}@test-esg.example`, role: "viewer" }, tenantA.adminToken),
      403,
      "Tenant A admin POST /api/companies/:tenantB/invites",
    );

    expectStatus(await apiRequest("GET", "/api/admin/users/mfa-status", undefined, tenantA.viewerToken), 403, "viewer GET /api/admin/users/mfa-status");
    expectStatus(await apiRequest("GET", "/api/admin/users/mfa-status", undefined, tenantA.contributorToken), 403, "contributor GET /api/admin/users/mfa-status");
    const mfaStatusA = parseJson<Array<{ email?: string; companyId?: string }>>(
      await apiRequest("GET", "/api/admin/users/mfa-status", undefined, tenantA.adminToken),
      "Tenant A GET /api/admin/users/mfa-status",
    );
    assert(mfaStatusA.some((user) => user.email === tenantA.adminEmail), "Tenant A MFA status missing Tenant A admin");
    assert(!mfaStatusA.some((user) => user.email === tenantB.adminEmail), "Tenant A MFA status leaked Tenant B admin");

    expectStatus(await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantA.viewerToken), 403, "viewer GET /api/admin/identity-providers");
    expectStatus(await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantA.contributorToken), 403, "contributor GET /api/admin/identity-providers");
    const providerB = parseJson<{ id: string; companyId: string; domain?: string }>(
      await apiRequest("POST", "/api/admin/identity-providers", {
        name: idpNameB,
        providerType: "saml",
        domain: idpMarkerB,
        config: { ssoUrl: "https://idp.test-esg.example/sso" },
      }, tenantB.adminToken),
      "Tenant B POST /api/admin/identity-providers",
    );
    assert(providerB.companyId === tenantB.companyId, "Tenant B identity provider stored against wrong company");
    const providersA = parseJson<Array<{ id: string; companyId: string; domain?: string }>>(
      await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantA.adminToken),
      "Tenant A GET /api/admin/identity-providers",
    );
    const providersB = parseJson<Array<{ id: string; companyId: string; domain?: string }>>(
      await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantB.adminToken),
      "Tenant B GET /api/admin/identity-providers",
    );
    assert(providersA.every((provider) => provider.companyId === tenantA.companyId), "Tenant A identity providers response included another company");
    assert(!providersA.some((provider) => provider.id === providerB.id || provider.domain === idpMarkerB), "Tenant A identity providers leaked Tenant B provider");
    assert(providersB.some((provider) => provider.id === providerB.id && provider.domain === idpMarkerB), "Tenant B identity providers missing Tenant B provider");
    expectStatus(
      await apiRequest("PATCH", `/api/admin/identity-providers/${providerB.id}`, { name: "cross tenant edit" }, tenantA.adminToken),
      404,
      "Tenant A admin PATCH Tenant B identity provider",
    );
    expectStatus(
      await apiRequest("DELETE", `/api/admin/identity-providers/${providerB.id}`, undefined, tenantA.adminToken),
      404,
      "Tenant A admin DELETE Tenant B identity provider",
    );

    expectStatus(await apiRequest("GET", "/api/audit-logs", undefined, tenantA.viewerToken), 403, "viewer GET /api/audit-logs");
    expectStatus(await apiRequest("GET", "/api/audit-logs", undefined, tenantA.contributorToken), 403, "contributor GET /api/audit-logs");
    const tenantAAuditLogs = parseJson<Array<{ companyId: string; action: string; details?: unknown }>>(
      await apiRequest("GET", "/api/audit-logs?action=identity_provider_created&entityType=identity_provider", undefined, tenantA.adminToken),
      "Tenant A filtered audit logs",
    );
    const tenantBAuditLogs = parseJson<Array<{ companyId: string; action: string; details?: unknown }>>(
      await apiRequest("GET", "/api/audit-logs?action=identity_provider_created&entityType=identity_provider", undefined, tenantB.adminToken),
      "Tenant B filtered audit logs",
    );
    assert(tenantAAuditLogs.every((log) => log.companyId === tenantA.companyId), "Tenant A audit logs response included another company");
    assert(!JSON.stringify(tenantAAuditLogs).includes(idpNameB), "Tenant A audit logs leaked Tenant B identity provider details");
    assert(tenantBAuditLogs.some((log) => log.companyId === tenantB.companyId && JSON.stringify(log).includes(idpNameB)), "Tenant B audit logs missing Tenant B identity provider event");
  });

  await check("step-up protects sensitive settings actions", async () => {
    const admin = new CookieSession();
    await admin.login(tenantA.adminEmail);

    const status = parseJson<{ stepUpValid: boolean }>(
      await admin.request("GET", "/api/auth/step-up/status"),
      "GET /api/auth/step-up/status",
    );
    assert(status.stepUpValid === false, "new admin session should not be step-up valid");

    const noStepUpKey = await admin.request("POST", "/api/company/api-keys", { label: "Needs step-up", scopes: ["read:metrics"] });
    expectStatus(noStepUpKey, 403, "POST /api/company/api-keys without step-up");
    assert(JSON.parse(noStepUpKey.body).code === "STEP_UP_REQUIRED", "API key creation should return STEP_UP_REQUIRED");

    const noStepUpPolicy = await admin.request("PATCH", "/api/admin/mfa-policy", { mfaPolicy: "optional" });
    expectStatus(noStepUpPolicy, 403, "PATCH /api/admin/mfa-policy without step-up");

    expectStatus(await admin.stepUp("wrong-password"), 401, "POST /api/auth/step-up wrong password");
    const stepUp = parseJson<{ stepUpGranted?: boolean }>(await admin.stepUp(), "POST /api/auth/step-up");
    assert(stepUp.stepUpGranted === true, "step-up was not granted");

    const after = parseJson<{ stepUpValid: boolean }>(
      await admin.request("GET", "/api/auth/step-up/status"),
      "GET /api/auth/step-up/status after grant",
    );
    assert(after.stepUpValid === true, "step-up status should be valid after grant");
  });

  await check("company API key lifecycle is step-up gated and tenant-isolated", async () => {
    const adminA = new CookieSession();
    const adminB = new CookieSession();
    await adminA.login(tenantA.adminEmail);
    await adminB.login(tenantB.adminEmail);
    parseJson(await adminA.stepUp(), "Tenant A step-up");
    parseJson(await adminB.stepUp(), "Tenant B step-up");

    const tenantBLabel = `Settings security Tenant B key ${suffix}`;
    const createdTenantB = parseJson<{ id: string; key?: string; keyPrefix?: string }>(
      await adminB.request("POST", "/api/company/api-keys", {
        label: tenantBLabel,
        scopes: ["read:metrics"],
      }),
      "Tenant B POST /api/company/api-keys",
    );
    assert(createdTenantB.id && createdTenantB.key, "Tenant B API key create response missing id/plaintext key");

    const created = parseJson<{ id: string; key?: string; keyPrefix?: string }>(
      await adminA.request("POST", "/api/company/api-keys", {
        label: `Settings security smoke ${suffix}`,
        scopes: ["read:metrics", "read:reports"],
      }),
      "POST /api/company/api-keys",
    );
    assert(created.id && created.key, "API key create response missing id/plaintext key");

    const listed = parseJson<Array<{ id: string; key?: string; revokedAt?: string | null }>>(
      await adminA.request("GET", "/api/company/api-keys"),
      "GET /api/company/api-keys",
    );
    const listedKey = listed.find((key) => key.id === created.id);
    assert(listedKey, "created API key missing from list");
    assert(!("key" in listedKey), "API key list leaked plaintext key");
    assert(!listed.some((key) => key.id === createdTenantB.id), "Tenant A API key list leaked Tenant B key");
    assert(!JSON.stringify(listed).includes(tenantBLabel), "Tenant A API key list leaked Tenant B key label");

    expectStatus(await adminB.request("DELETE", `/api/company/api-keys/${created.id}`), 404, "Tenant B delete Tenant A API key");
    expectStatus(await adminA.request("DELETE", `/api/company/api-keys/${created.id}`), 200, "Tenant A delete own API key");

    const after = parseJson<Array<{ id: string; revokedAt?: string | null }>>(
      await adminA.request("GET", "/api/company/api-keys"),
      "GET /api/company/api-keys after revoke",
    );
    assert(after.find((key) => key.id === created.id)?.revokedAt, "revoked API key should remain listed with revokedAt");
  });

  await check("role changes require step-up and reject cross-tenant escalation", async () => {
    const targetUserId = await createUser({
      companyId: tenantA.companyId,
      email: `role-target-${suffix}@test-esg.example`,
      username: `roletarget${suffix}`,
      role: "viewer",
    });
    const tenantBAdminUserId = await getUserIdByEmail(tenantB.adminEmail);

    const admin = new CookieSession();
    const contributor = new CookieSession();
    await admin.login(tenantA.adminEmail);
    await contributor.login(tenantA.contributorEmail);

    expectStatus(
      await admin.request("PUT", `/api/users/${targetUserId}/role`, { role: "contributor" }),
      403,
      "admin role change without step-up",
    );
    expectStatus(
      await contributor.request("PUT", `/api/users/${targetUserId}/role`, { role: "admin" }),
      403,
      "contributor role escalation attempt",
    );

    parseJson(await admin.stepUp(), "admin step-up for role change");
    const updated = parseJson<{ id: string; role: string }>(
      await admin.request("PUT", `/api/users/${targetUserId}/role`, { role: "contributor" }),
      "PUT /api/users/:id/role",
    );
    assert(updated.role === "contributor", `expected role contributor, got ${updated.role}`);

    expectStatus(
      await admin.request("PUT", `/api/users/${tenantBAdminUserId}/role`, { role: "viewer" }),
      404,
      "Tenant A admin role-change against Tenant B user",
    );
    expectStatus(
      await admin.request("PUT", `/api/users/${targetUserId}/role`, { role: "super_admin" }),
      400,
      "admin invalid super_admin role escalation",
    );
  });

  await check("MFA setup, step-up, and disable lifecycle is enforced", async () => {
    const mfaEmail = `mfa-admin-${suffix}@test-esg.example`;
    await createUser({
      companyId: tenantA.companyId,
      email: mfaEmail,
      username: `mfaadmin${suffix}`,
      role: "admin",
    });

    const admin = new CookieSession();
    await admin.login(mfaEmail);

    const initial = parseJson<{ mfaEnabled: boolean }>(
      await admin.request("GET", "/api/auth/mfa/status"),
      "GET /api/auth/mfa/status initial",
    );
    assert(initial.mfaEnabled === false, "MFA should start disabled");

    const setup = parseJson<{ secret: string; uri: string; qrDataUrl: string }>(
      await admin.request("POST", "/api/auth/mfa/setup"),
      "POST /api/auth/mfa/setup",
    );
    assert(setup.secret && setup.uri && setup.qrDataUrl, "MFA setup response missing secret/uri/QR");
    expectStatus(await admin.request("POST", "/api/auth/mfa/verify-setup", { token: "not-a-code" }), 400, "invalid MFA setup token");

    const token = await generateTotpToken(setup.secret);
    const verified = parseJson<{ backupCodes?: string[] }>(
      await admin.request("POST", "/api/auth/mfa/verify-setup", { token }),
      "POST /api/auth/mfa/verify-setup",
    );
    assert((verified.backupCodes ?? []).length === 10, "MFA verify should return 10 backup codes");

    const enabled = parseJson<{ mfaEnabled: boolean; backupCodesCount: number }>(
      await admin.request("GET", "/api/auth/mfa/status"),
      "GET /api/auth/mfa/status enabled",
    );
    assert(enabled.mfaEnabled === true && enabled.backupCodesCount === 10, `unexpected MFA status ${JSON.stringify(enabled)}`);

    expectStatus(await admin.request("POST", "/api/auth/mfa/disable", { password: TEST_PASSWORD, token }), 403, "MFA disable without step-up");
    const missingMfa = await admin.stepUp(TEST_PASSWORD);
    expectStatus(missingMfa, 400, "step-up missing MFA token");
    assert(JSON.parse(missingMfa.body).code === "MFA_REQUIRED", "step-up should require MFA code");

    parseJson(await admin.stepUp(TEST_PASSWORD, { totpToken: await generateTotpToken(setup.secret) }), "MFA step-up");
    expectStatus(await admin.request("POST", "/api/auth/mfa/disable", { password: "wrong", token: await generateTotpToken(setup.secret) }), 401, "MFA disable wrong password");
    parseJson(
      await admin.request("POST", "/api/auth/mfa/disable", { password: TEST_PASSWORD, token: await generateTotpToken(setup.secret) }),
      "POST /api/auth/mfa/disable",
    );

    const disabled = parseJson<{ mfaEnabled: boolean }>(
      await admin.request("GET", "/api/auth/mfa/status"),
      "GET /api/auth/mfa/status disabled",
    );
    assert(disabled.mfaEnabled === false, "MFA should be disabled after disable flow");
  });

  await check("session revocation invalidates stale tokens and preserves current session", async () => {
    const sessionEmail = `session-admin-${suffix}@test-esg.example`;
    await createUser({
      companyId: tenantA.companyId,
      email: sessionEmail,
      username: `sessionadmin${suffix}`,
      role: "admin",
    });

    const first = new CookieSession();
    const second = new CookieSession();
    await first.login(sessionEmail);
    await second.login(sessionEmail);
    await waitForSessions(second, 2);

    const revoke = parseJson<{ revokedCount: number }>(
      await second.request("POST", "/api/auth/sessions/revoke-others"),
      "POST /api/auth/sessions/revoke-others",
    );
    assert(revoke.revokedCount >= 1, `expected at least one revoked session, got ${revoke.revokedCount}`);

    expectStatus(await first.request("GET", "/api/auth/me", undefined, { bearer: first.token }), 401, "revoked first session token");
    expectStatus(await second.request("GET", "/api/auth/me"), 200, "current session after revoke-others");

    expectStatus(await second.request("POST", "/api/auth/logout", undefined, { bearer: second.token }), 200, "logout current session");
    expectStatus(await second.request("GET", "/api/auth/me", undefined, { bearer: second.token }), 401, "logged-out bearer token");
  });

  await check("internal agent API keys are super-admin only, revocable, and tenant scoped", async () => {
    const superEmail = `super-${suffix}@test-esg.example`;
    await createUser({
      companyId: null,
      email: superEmail,
      username: `super${suffix}`,
      role: "super_admin",
    });

    const tenantAdmin = new CookieSession();
    await tenantAdmin.login(tenantA.adminEmail);
    expectStatus(
      await tenantAdmin.request("POST", "/api/internal/agent/keys", {
        agentType: "technical_agent",
        label: "Tenant admin should not create internal keys",
        scopes: ["internal:health"],
      }),
      403,
      "tenant admin POST /api/internal/agent/keys",
    );

    const superAdmin = new CookieSession();
    await superAdmin.login(superEmail);
    const created = parseJson<{ id: string; key: string }>(
      await superAdmin.request("POST", "/api/internal/agent/keys", {
        agentType: "technical_agent",
        label: `Settings security internal key ${suffix}`,
        scopes: ["internal:health", "internal:company"],
        companyId: tenantA.companyId,
      }),
      "super_admin POST /api/internal/agent/keys",
    );
    assert(created.id && created.key, "internal key create missing id/key");

    expectStatus(await agentRequest("/api/internal/agent/health", created.key), 200, "internal key health access");
    expectStatus(await agentRequest(`/api/internal/agent/company/${tenantA.companyId}`, created.key), 200, "internal key own company access");
    expectStatus(await agentRequest(`/api/internal/agent/company/${tenantB.companyId}`, created.key), 403, "internal key cross-tenant company access");

    expectStatus(await superAdmin.request("DELETE", `/api/internal/agent/keys/${created.id}`), 200, "super_admin DELETE /api/internal/agent/keys/:id");
    expectStatus(await agentRequest("/api/internal/agent/health", created.key), 401, "revoked internal key health access");
  });
}

(async () => {
  console.log("\n=== API Regression: Settings/Security ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("settings/security setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Settings/Security: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
