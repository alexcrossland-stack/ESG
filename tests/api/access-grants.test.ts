import { Client } from "pg";
import bcrypt from "bcryptjs";
import { apiRequest, loginAndGetToken } from "../fixtures/seed.js";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];
const TEST_PASSWORD = "Test1234!";

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function seedAccessGrantActors(client: Client, suffix: string) {
  const companyName = `Access Grant Admin Company ${suffix}`;
  const companyRes = await client.query<{ id: string }>(
    "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
    [companyName],
  );
  const companyId = companyRes.rows[0].id;

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const superAdminEmail = `access-super-${suffix}@test-esg.example`;
  const adminEmail = `access-admin-${suffix}@test-esg.example`;

  await client.query(
    `INSERT INTO users (
      username, email, password, role, company_id,
      terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
    ) VALUES ($1, $2, $3, 'super_admin', NULL, NOW(), NOW(), '1.0', '1.0')`,
    [`accesssuper${suffix}`, superAdminEmail, passwordHash],
  );

  await client.query(
    `INSERT INTO users (
      username, email, password, role, company_id,
      terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
    ) VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')`,
    [`accessadmin${suffix}`, adminEmail, passwordHash, companyId],
  );

  return { superAdminEmail, adminEmail };
}

async function getLatestAccessGrantViewAuditAction(client: Client, userEmail: string): Promise<string | null> {
  const result = await client.query<{ action: string | null }>(
    `SELECT al.action
     FROM audit_logs al
     JOIN users u ON u.id = al.user_id
     WHERE u.email = $1
       AND al.entity_type = 'access_grant'
     ORDER BY al.created_at DESC
     LIMIT 1`,
    [userEmail],
  );
  return result.rows[0]?.action ?? null;
}

async function run(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const suffix = Date.now().toString();
    const { superAdminEmail, adminEmail } = await seedAccessGrantActors(client, suffix);

    const superAdminToken = await loginAndGetToken(superAdminEmail, TEST_PASSWORD);
    const adminToken = await loginAndGetToken(adminEmail, TEST_PASSWORD);

    const superRes = await apiRequest("GET", "/api/admin/access-grants", undefined, superAdminToken);
    if (superRes.status !== 200) {
      fail("GET /api/admin/access-grants — super_admin → 200", `status=${superRes.status} body=${superRes.body.slice(0, 200)}`);
    } else {
      try {
        const parsed = JSON.parse(superRes.body);
        if (!Array.isArray(parsed)) {
          fail("GET /api/admin/access-grants returns list", `body=${superRes.body.slice(0, 200)}`);
        } else {
          pass("GET /api/admin/access-grants — super_admin → 200", `count=${parsed.length}`);
        }
      } catch {
        fail("GET /api/admin/access-grants returns JSON list", `body=${superRes.body.slice(0, 200)}`);
      }
    }

    const auditAction = await getLatestAccessGrantViewAuditAction(client, superAdminEmail);
    if (auditAction !== "access_grants_viewed") {
      fail("GET /api/admin/access-grants writes non-null audit action", `action=${String(auditAction)}`);
    } else {
      pass("GET /api/admin/access-grants writes non-null audit action", `action=${auditAction}`);
    }

    const adminRes = await apiRequest("GET", "/api/admin/access-grants", undefined, adminToken);
    if (adminRes.status !== 403) {
      fail("GET /api/admin/access-grants — admin → 403", `status=${adminRes.status} body=${adminRes.body.slice(0, 200)}`);
    } else {
      pass("GET /api/admin/access-grants — admin → 403", `status=${adminRes.status}`);
    }
  } finally {
    await client.end();
  }
}

(async () => {
  console.log("\n=== API Tests: Access Grants Admin Read ===\n");

  try {
    await run();
  } catch (err: any) {
    console.error("TEST FAILED:", err?.message ?? err);
    process.exit(1);
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\n=== Access Grants Admin Read: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
