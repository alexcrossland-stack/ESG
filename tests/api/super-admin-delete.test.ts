import { Client } from "pg";
import bcrypt from "bcryptjs";
import { apiRequest, loginAndGetToken } from "../fixtures/seed.js";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const TEST_PASSWORD = "Test1234!";
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function seed(client: Client, suffix: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const companyA = await client.query<{ id: string }>(
    "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
    [`Delete Test Company A ${suffix}`],
  );
  const companyB = await client.query<{ id: string }>(
    "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
    [`Delete Test Company B ${suffix}`],
  );

  const companyAId = companyA.rows[0].id;
  const companyBId = companyB.rows[0].id;

  const insertUser = async (username: string, email: string, role: string, companyId: string | null) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (
        username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), '1.0', '1.0')
      RETURNING id`,
      [username, email, passwordHash, role, companyId],
    );
    return res.rows[0].id;
  };

  const superAEmail = `super-a-${suffix}@test-esg.example`;
  const superBEmail = `super-b-${suffix}@test-esg.example`;
  const superCEmail = `super-c-${suffix}@test-esg.example`;
  const adminEmail = `admin-${suffix}@test-esg.example`;
  const targetUserEmail = `target-user-${suffix}@test-esg.example`;
  const companyBAdminEmail = `companyb-admin-${suffix}@test-esg.example`;

  const superAId = await insertUser(`supera${suffix}`, superAEmail, "super_admin", null);
  const superBId = await insertUser(`superb${suffix}`, superBEmail, "super_admin", null);
  const superCId = await insertUser(`superc${suffix}`, superCEmail, "super_admin", null);
  const adminId = await insertUser(`admin${suffix}`, adminEmail, "admin", companyAId);
  const targetUserId = await insertUser(`target${suffix}`, targetUserEmail, "viewer", companyAId);
  const companyBAdminId = await insertUser(`companybadmin${suffix}`, companyBAdminEmail, "admin", companyBId);

  return {
    companyAId,
    companyBId,
    superAId,
    superBId,
    superCId,
    adminId,
    targetUserId,
    companyBAdminId,
    superAEmail,
    superBEmail,
    superCEmail,
    adminEmail,
  };
}

async function run(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const suffix = Date.now().toString();
    const seeded = await seed(client, suffix);

    const superToken = await loginAndGetToken(seeded.superAEmail, TEST_PASSWORD);
    const adminToken = await loginAndGetToken(seeded.adminEmail, TEST_PASSWORD);

    {
      const res = await apiRequest("DELETE", `/api/admin/users/${seeded.targetUserId}`, undefined, adminToken);
      if (res.status !== 403) fail("Non-super-admin cannot delete user", `status=${res.status} body=${res.body.slice(0, 200)}`);
      else pass("Non-super-admin cannot delete user", `status=${res.status}`);
    }

    {
      const res = await apiRequest("DELETE", `/api/admin/companies/${seeded.companyBId}`, undefined, adminToken);
      if (res.status !== 403) fail("Non-super-admin cannot delete company", `status=${res.status} body=${res.body.slice(0, 200)}`);
      else pass("Non-super-admin cannot delete company", `status=${res.status}`);
    }

    {
      const res = await apiRequest("DELETE", `/api/admin/users/${seeded.superAId}`, undefined, superToken);
      if (res.status !== 400) fail("Super-admin self-delete is blocked", `status=${res.status} body=${res.body.slice(0, 200)}`);
      else pass("Super-admin self-delete is blocked", `status=${res.status}`);
    }

    {
      const res = await apiRequest("DELETE", `/api/admin/users/${seeded.companyBAdminId}`, undefined, superToken);
      if (res.status !== 400) {
        fail("Deleting the only admin for a company is blocked", `status=${res.status} body=${res.body.slice(0, 200)}`);
      } else if (!/only admin for this company/i.test(res.body)) {
        fail("Deleting the only admin for a company returns clear error", `body=${res.body.slice(0, 200)}`);
      } else {
        pass("Deleting the only admin for a company is blocked", `status=${res.status}`);
      }
    }

    {
      const res = await apiRequest("DELETE", `/api/admin/users/${seeded.targetUserId}`, undefined, superToken);
      if (res.status !== 200) {
        fail("Super-admin can delete any user", `status=${res.status} body=${res.body.slice(0, 200)}`);
      } else {
        const check = await client.query<{ anonymised_at: string | null; role: string | null }>(
          "SELECT anonymised_at, role FROM users WHERE id = $1",
          [seeded.targetUserId],
        );
        const row = check.rows[0];
        if (!row?.anonymised_at) fail("Super-admin user delete anonymises user", "anonymised_at is null");
        else if (row.role !== "viewer") fail("Super-admin user delete demotes user to viewer", `role=${row.role}`);
        else pass("Super-admin can delete any user");
      }
    }

    {
      const res = await apiRequest("DELETE", `/api/admin/companies/${seeded.companyBId}`, undefined, superToken);
      if (res.status !== 200) {
        fail("Super-admin can delete any company", `status=${res.status} body=${res.body.slice(0, 200)}`);
      } else {
        const check = await client.query<{ status: string | null }>(
          "SELECT status FROM companies WHERE id = $1",
          [seeded.companyBId],
        );
        if (check.rows[0]?.status !== "deleted") fail("Super-admin company delete soft-deletes company", `status=${check.rows[0]?.status}`);
        else pass("Super-admin can delete any company");
      }
    }

    await client.query("UPDATE users SET role = 'viewer' WHERE id IN ($1, $2)", [seeded.superBId, seeded.superCId]);

    {
      const res = await apiRequest("DELETE", `/api/admin/users/${seeded.superAId}`, undefined, superToken);
      if (res.status !== 400) {
        fail("Deleting the last remaining super-admin is blocked", `status=${res.status} body=${res.body.slice(0, 200)}`);
      } else if (!/last remaining super admin/i.test(res.body)) {
        fail("Deleting the last remaining super-admin returns clear error", `body=${res.body.slice(0, 200)}`);
      } else {
        pass("Deleting the last remaining super-admin is blocked", `status=${res.status}`);
      }
    }
  } finally {
    await client.end();
  }
}

(async () => {
  console.log("\n=== API Tests: Super Admin Delete Controls ===\n");

  try {
    await run();
  } catch (err: any) {
    console.error("TEST FAILED:", err?.message ?? err);
    process.exit(1);
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\n=== Super Admin Delete Controls: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
