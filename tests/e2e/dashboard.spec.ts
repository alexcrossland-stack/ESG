/**
 * E2E: Dashboard — empty states and CTA navigation
 */
import { test, expect, APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const SUFFIX = `${Date.now()}db`;

async function createAdminAndGetToken(request: APIRequestContext, suffix: string): Promise<string> {
  const email = `e2e-dash-${suffix}@test-esg.example`;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const hash = await bcrypt.hash("Test1234!", 10);
  const compRes = await client.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ($1) RETURNING id",
    [`E2E Dashboard Co ${suffix}`]
  );
  const companyId = compRes.rows[0].id;
  await client.query(
    `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')
     ON CONFLICT (email) DO NOTHING`,
    [`e2edash${suffix}`, email, hash, companyId]
  );
  await client.end();

  const loginRes = await request.post("/api/auth/login", {
    data: { email, password: "Test1234!" },
  });
  if (loginRes.status() !== 200) throw new Error(`Login failed: ${loginRes.status()}`);
  const { token } = await loginRes.json();
  return token;
}

test.describe("Dashboard API", () => {
  test("GET /api/dashboard/enhanced returns valid structure without 500", async ({ request }) => {
    const token = await createAdminAndGetToken(request, `${SUFFIX}a`);

    const dashRes = await request.get("/api/dashboard/enhanced", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dashRes.status()).not.toBe(500);
    expect([200, 404]).toContain(dashRes.status());
    if (dashRes.status() === 200) {
      const body = await dashRes.json();
      expect(body).toBeTruthy();
    }
  });

  test("GET /api/metrics returns array after seedDatabase", async ({ request }) => {
    const token = await createAdminAndGetToken(request, `${SUFFIX}b`);

    const res = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const metrics = await res.json();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
  });

  test("GET /api/topics returns array after seedDatabase", async ({ request }) => {
    const token = await createAdminAndGetToken(request, `${SUFFIX}c`);

    const res = await request.get("/api/topics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const topics = await res.json();
    expect(Array.isArray(topics)).toBe(true);
  });

  test("unauthenticated GET /api/dashboard/enhanced returns 401", async ({ request }) => {
    const res = await request.get("/api/dashboard/enhanced");
    expect(res.status()).toBe(401);
  });
});
