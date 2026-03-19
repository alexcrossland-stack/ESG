/**
 * E2E: First metric entry — raw-data input flow
 */
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const SUFFIX = `${Date.now()}me`;

async function createUserViaSql(email: string, username: string, role: "admin" | "viewer", companyId?: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const hash = await bcrypt.hash("Test1234!", 10);
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const compRes = await client.query<{ id: string }>(
        "INSERT INTO companies (name) VALUES ($1) RETURNING id",
        [`Test Co ${username}`]
      );
      resolvedCompanyId = compRes.rows[0].id;
    }
    const uRes = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), '1.0', '1.0')
       ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
       RETURNING id`,
      [username, email, hash, role, resolvedCompanyId]
    );
    return { userId: uRes.rows[0].id, companyId: resolvedCompanyId };
  } finally {
    await client.end();
  }
}

test.describe("Metric entry flow", () => {
  test("admin can submit a metric value and retrieve it", async ({ request }) => {
    const adminEmail = `e2e-metric-admin-${SUFFIX}@test-esg.example`;

    await createUserViaSql(adminEmail, `e2emetricadmin${SUFFIX}`, "admin");

    const loginRes = await request.post("/api/auth/login", {
      data: { email: adminEmail, password: "Test1234!" },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();
    expect(token).toBeTruthy();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);

    const metricId = metrics[0].id;

    const submitRes = await request.post("/api/data-entry", {
      data: {
        metricId,
        period: "2024-Q1",
        value: 42.5,
        notes: "E2E test entry",
      },
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(submitRes.status()).not.toBe(500);
    expect([200, 201]).toContain(submitRes.status());
    const submitted = await submitRes.json();
    expect(submitted.id).toBeTruthy();
    expect(submitted.metricId).toBe(metricId);

    const valuesRes = await request.get(`/api/metrics/${metricId}/values`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(valuesRes.status()).toBe(200);
    const values = await valuesRes.json();
    const our = (values as Array<{ period: string; value: number }>).find((v) => v.period === "2024-Q1");
    expect(our).toBeTruthy();
  });

  test("missing period returns 400 with error field", async ({ request }) => {
    const adminEmail = `e2e-metric-admin2-${SUFFIX}@test-esg.example`;
    await createUserViaSql(adminEmail, `e2emetricadmin2${SUFFIX}`, "admin");

    const loginRes = await request.post("/api/auth/login", {
      data: { email: adminEmail, password: "Test1234!" },
    });
    const { token } = await loginRes.json();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const metrics = await metricsRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const res = await request.post("/api/data-entry", {
      data: { metricId, value: 100 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
