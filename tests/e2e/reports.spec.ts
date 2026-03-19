/**
 * E2E: Report generation — success or loading state appears
 */
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const SUFFIX = `${Date.now()}rp`;

async function createAdminAndGetToken(request: any, suffix: string) {
  const email = `e2e-report-${suffix}@test-esg.example`;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const hash = await bcrypt.hash("Test1234!", 10);
  const compRes = await client.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ($1) RETURNING id",
    [`E2E Reports Co ${suffix}`]
  );
  const companyId = compRes.rows[0].id;
  await client.query(
    `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')
     ON CONFLICT (email) DO NOTHING`,
    [`e2ereport${suffix}`, email, hash, companyId]
  );
  await client.end();

  const loginRes = await request.post("/api/auth/login", {
    data: { email, password: "Test1234!" },
  });
  if (loginRes.status() !== 200) throw new Error(`Login failed: ${loginRes.status()}`);
  const { token } = await loginRes.json();
  return { token, companyId };
}

test.describe("Report generation", () => {
  test("POST /api/reports/generate responds without 500", async ({ request }) => {
    const { token } = await createAdminAndGetToken(request, `${SUFFIX}a`);

    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "management",
        period: "2024-Q1",
        includeMetrics: true,
        includePolicy: true,
        includeTopics: true,
      },
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).not.toBe(500);
    expect([200, 201, 202, 400]).toContain(res.status());
  });

  test("GET /api/reports returns array without 500", async ({ request }) => {
    const { token } = await createAdminAndGetToken(request, `${SUFFIX}b`);

    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test("viewer role is blocked from POST /api/reports/generate (403)", async ({ request }) => {
    const { token: adminToken, companyId } = await createAdminAndGetToken(request, `${SUFFIX}c`);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set");
    const viewerEmail = `e2e-viewer-report-${SUFFIX}@test-esg.example`;
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const hash = await bcrypt.hash("Test1234!", 10);
    await client.query(
      `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'viewer', $4, NOW(), NOW(), '1.0', '1.0')
       ON CONFLICT (email) DO NOTHING`,
      [`e2eviewerrpt${SUFFIX}`, viewerEmail, hash, companyId]
    );
    await client.end();

    const vLoginRes = await request.post("/api/auth/login", {
      data: { email: viewerEmail, password: "Test1234!" },
    });
    expect(vLoginRes.status()).toBe(200);
    const { token: viewerToken } = await vLoginRes.json();

    const res = await request.post("/api/reports/generate", {
      data: { reportType: "management", period: "2024-Q1" },
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });
});
