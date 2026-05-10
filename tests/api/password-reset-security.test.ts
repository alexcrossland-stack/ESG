/**
 * API regression: password reset token safety
 *
 * Covers expired, used, and unknown reset tokens without relying on email
 * delivery. Tokens are inserted directly, then exercised through the public
 * reset endpoint.
 *
 * Run: npx tsx tests/api/password-reset-security.test.ts
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

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

async function check(name: string, fn: () => Promise<void | string>) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
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

function createPlainToken() {
  const plaintext = crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

async function createUser(companyId: string, suffix: string) {
  return withDb(async (client) => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const email = `reset-security-${suffix}@test-esg.example`;
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')
       RETURNING id`,
      [`resetsecurity${suffix}`, email, passwordHash, companyId],
    );
    return { id: res.rows[0].id, email };
  });
}

async function insertResetToken(input: {
  userId: string;
  email: string;
  expiresAt: Date;
  usedAt?: Date | null;
}) {
  const token = createPlainToken();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO auth_tokens (token_hash, type, user_id, email, expires_at, used_at)
       VALUES ($1, 'password_reset', $2, $3, $4, $5)`,
      [token.hash, input.userId, input.email, input.expiresAt, input.usedAt ?? null],
    );
  });
  return token.plaintext;
}

async function run() {
  const { tenantA } = await seedTestTenants();
  const suffix = Date.now().toString();
  const user = await createUser(tenantA.companyId, suffix);

  await check("expired reset token is rejected", async () => {
    const token = await insertResetToken({
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });
    const res = await apiRequest("POST", "/api/auth/reset-password", {
      token,
      newPassword: "NewReset123!",
    });
    assert(res.status === 400, `expected 400, got ${res.status}: ${res.body.slice(0, 300)}`);
    assert(/expired/i.test(res.body), `expected expired error, got ${res.body.slice(0, 300)}`);
  });

  await check("used reset token cannot be reused", async () => {
    const token = await insertResetToken({
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const first = await apiRequest("POST", "/api/auth/reset-password", {
      token,
      newPassword: "FirstReset123!",
    });
    assert(first.status === 200, `first reset expected 200, got ${first.status}: ${first.body.slice(0, 300)}`);

    const second = await apiRequest("POST", "/api/auth/reset-password", {
      token,
      newPassword: "SecondReset123!",
    });
    assert(second.status === 400, `reuse expected 400, got ${second.status}: ${second.body.slice(0, 300)}`);
    assert(/already been used/i.test(second.body), `expected used-token error, got ${second.body.slice(0, 300)}`);
  });

  await check("invalid reset token fails safely", async () => {
    const res = await apiRequest("POST", "/api/auth/reset-password", {
      token: "unknown-reset-token",
      newPassword: "UnknownReset123!",
    });
    assert(res.status === 400, `expected 400, got ${res.status}: ${res.body.slice(0, 300)}`);
    assert(/invalid|expired/i.test(res.body), `expected generic invalid/expired error, got ${res.body.slice(0, 300)}`);
  });
}

(async () => {
  console.log("\n=== API Regression: Password Reset Security ===\n");
  try {
    await run();
  } catch (error: any) {
    fail("password reset security setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Password Reset Security: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
