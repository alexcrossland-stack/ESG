/**
 * API regression: sensitive response sanitization.
 *
 * Covers auth/settings/admin responses that should never expose password hashes,
 * MFA secrets, recovery-code hashes, API key hashes, raw tokens, or stack traces.
 *
 * Run: npx tsx tests/api/response-sanitization-hardening.test.ts
 */

import bcrypt from "bcryptjs";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

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

function assertNoSensitiveFields(value: unknown, context: string, secrets: string[] = []) {
  const serialized = JSON.stringify(value);
  for (const field of [
    "password",
    "mfaSecretEncrypted",
    "mfaBackupCodesHash",
    "keyHash",
    "tokenHash",
    "resetToken",
    "inviteToken",
    "recoveryCode",
    "stack",
  ]) {
    assert(!new RegExp(`"${field}"\\s*:`, "i").test(serialized), `${context} leaked ${field}`);
  }
  for (const secret of secrets.filter(Boolean)) {
    assert(!serialized.includes(secret), `${context} leaked sensitive value ${secret.slice(0, 12)}...`);
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

async function createUnassignedSensitiveUser(suffix: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const mfaSecret = `encrypted-mfa-secret-${suffix}`;
  const backupHash = `backup-code-hash-${suffix}`;
  const user = await withDb(async (client) => {
    const res = await client.query<{ id: string; email: string }>(
      `INSERT INTO users (
        username, email, password, role, company_id,
        mfa_enabled, mfa_secret_encrypted, mfa_backup_codes_hash,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
      )
      VALUES ($1, $2, $3, 'viewer', NULL, true, $4, $5::text[], NOW(), NOW(), '1.0', '1.0')
      RETURNING id, email`,
      [
        `sanitizeassign${suffix}`,
        `sanitize-assign-${suffix}@test-esg.example`,
        passwordHash,
        mfaSecret,
        [backupHash],
      ],
    );
    return res.rows[0];
  });
  return { ...user, passwordHash, mfaSecret, backupHash };
}

let seeded: SeededTenants;
const suffix = Date.now().toString();

async function main() {
  console.log("Response sanitization hardening regression\n");
  seeded = await seedTestTenants();

  await check("auth responses omit sensitive user fields", async () => {
    const login = parseJson<{ user?: unknown; token?: string }>(
      await apiRequest("POST", "/api/auth/login", { email: seeded.tenantA.adminEmail, password: TEST_PASSWORD }),
      "POST /api/auth/login",
    );
    assert(login.token, "login response missing bearer token");
    assertNoSensitiveFields(login.user, "login user response", [login.token]);

    const me = parseJson<{ user?: unknown }>(
      await apiRequest("GET", "/api/auth/me", undefined, login.token),
      "GET /api/auth/me",
    );
    assertNoSensitiveFields(me.user, "auth me user response", [login.token]);
  });

  await check("company user list omits password and MFA internals", async () => {
    const users = parseJson<unknown[]>(
      await apiRequest("GET", "/api/users", undefined, seeded.tenantA.adminToken),
      "GET /api/users",
    );
    assert(Array.isArray(users) && users.length > 0, "expected at least one company user");
    assertNoSensitiveFields(users, "company users list");
  });

  await check("company user assignment response is sanitized", async () => {
    const sensitiveUser = await createUnassignedSensitiveUser(suffix);
    const res = await apiRequest(
      "POST",
      `/api/companies/${seeded.tenantA.companyId}/users`,
      { userId: sensitiveUser.id, role: "viewer" },
      seeded.tenantA.adminToken,
    );
    expectStatus(res, 200, "POST /api/companies/:id/users");
    const body = JSON.parse(res.body) as { user?: unknown };
    assertNoSensitiveFields(body, "company user assignment response", [
      sensitiveUser.passwordHash,
      sensitiveUser.mfaSecret,
      sensitiveUser.backupHash,
    ]);
  });

  await check("API key list and failed auth errors do not expose key internals", async () => {
    const list = parseJson<unknown[]>(
      await apiRequest("GET", "/api/company/api-keys", undefined, seeded.tenantA.adminToken),
      "GET /api/company/api-keys",
    );
    assertNoSensitiveFields(list, "company API key list");

    const failed = await apiRequest("GET", "/api/company/api-keys", undefined, `not-a-real-token-${suffix}`);
    expectStatus(failed, 401, "invalid bearer request");
    assertNoSensitiveFields(JSON.parse(failed.body), "invalid bearer error response", [`not-a-real-token-${suffix}`]);
  });

  await check("audit-log responses expose safe metadata only", async () => {
    const logs = parseJson<unknown[]>(
      await apiRequest("GET", "/api/audit-logs?limit=25", undefined, seeded.tenantA.adminToken),
      "GET /api/audit-logs",
    );
    assert(Array.isArray(logs), "audit-log response should be an array");
    assertNoSensitiveFields(logs, "audit-log response");
  });

  const failed = results.filter((r) => !r.passed);
  console.log(`\nResponse sanitization: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
