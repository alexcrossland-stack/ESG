/**
 * API regression: Stripe can be intentionally disabled for launch.
 *
 * Run with Stripe env vars unset:
 *   npx tsx tests/api/optional-billing-disabled.test.ts
 */

import bcrypt from "bcryptjs";
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

async function createSuperAdmin(suffix: string) {
  const email = `optional-billing-super-${suffix}@test-esg.example`;
  const username = `optionalbillingsuper${suffix}`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO users (
        username, email, password, role,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
      )
      VALUES ($1, $2, $3, 'super_admin', NOW(), NOW(), '1.0', '1.0')
      ON CONFLICT (email) DO NOTHING`,
      [username, email, passwordHash],
    );
  });
  const login = parseJson<{ token?: string }>(
    await apiRequest("POST", "/api/auth/login", { email, password: TEST_PASSWORD }),
    "POST /api/auth/login super admin",
  );
  assert(login.token, "super admin login missing token");
  return login.token;
}

async function main() {
  console.log("Optional billing disabled regression\n");

  const stripeEnv = ["STRIPE_SECRET_KEY", "STRIPE_PRO_PRICE_ID", "STRIPE_WEBHOOK_SECRET"]
    .filter((name) => !!process.env[name]);
  assert(stripeEnv.length === 0, `this regression must run with Stripe env vars unset; found ${stripeEnv.join(", ")}`);

  const seeded = await seedTestTenants();
  const suffix = Date.now().toString();

  await check("billing status reports disabled checkout without crashing", async () => {
    const body = parseJson<{
      planTier?: string;
      billingEnabled?: boolean;
      billingWebhookEnabled?: boolean;
      stripeCustomerId?: string | null;
    }>(
      await apiRequest("GET", "/api/billing/status", undefined, seeded.tenantA.adminToken),
      "GET /api/billing/status",
    );
    assert(body.planTier === "free" || body.planTier === "pro", `unexpected planTier ${body.planTier}`);
    assert(body.billingEnabled === false, `expected billingEnabled=false, got ${String(body.billingEnabled)}`);
    assert(body.billingWebhookEnabled === false, `expected billingWebhookEnabled=false, got ${String(body.billingWebhookEnabled)}`);
  });

  await check("checkout creation fails safely when billing is disabled", async () => {
    const res = await apiRequest("POST", "/api/billing/create-checkout", {}, seeded.tenantA.adminToken);
    expectStatus(res, 503, "POST /api/billing/create-checkout");
    const body = JSON.parse(res.body) as { error?: string };
    assert(body.error === "Billing is not configured", `unexpected checkout error ${res.body}`);
  });

  await check("billing webhook fails safely when billing is disabled", async () => {
    const res = await apiRequest("POST", "/api/billing/webhook", { type: "checkout.session.completed" });
    expectStatus(res, 503, "POST /api/billing/webhook");
    assert(/billing not configured/i.test(res.body), `unexpected webhook body ${res.body.slice(0, 200)}`);
  });

  await check("security audit treats intentionally disabled billing as passing", async () => {
    const superAdminToken = await createSuperAdmin(suffix);
    const audit = parseJson<{
      checks?: Array<{ check: string; pass: boolean; detail?: string }>;
    }>(
      await apiRequest("GET", "/api/admin/security-audit", undefined, superAdminToken),
      "GET /api/admin/security-audit",
    );
    const billingCheck = audit.checks?.find((check) => check.check === "Billing configuration");
    const webhookCheck = audit.checks?.find((check) => check.check === "Stripe webhook configuration");
    assert(billingCheck, "missing Billing configuration check");
    assert(webhookCheck, "missing Stripe webhook configuration check");
    assert(billingCheck.pass === true, `expected Billing configuration pass=true, got ${JSON.stringify(billingCheck)}`);
    assert(webhookCheck.pass === true, `expected Stripe webhook configuration pass=true, got ${JSON.stringify(webhookCheck)}`);
    assert(/disabled/i.test(billingCheck.detail || ""), `expected disabled billing detail, got ${billingCheck.detail}`);
  });

  const failed = results.filter((result) => !result.passed);
  console.log(`\nOptional billing disabled: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
