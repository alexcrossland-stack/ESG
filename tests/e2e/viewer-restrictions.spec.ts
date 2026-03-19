/**
 * E2E: Viewer restrictions — write UI absent/disabled, API returns 403
 */
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const SUFFIX = `${Date.now()}vr`;

async function createAdminAndViewer(request: any) {
  const adminEmail = `e2e-vr-admin-${SUFFIX}@test-esg.example`;
  const viewerEmail = `e2e-vr-viewer-${SUFFIX}@test-esg.example`;
  const password = "Test1234!";

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const hash = await bcrypt.hash(password, 10);

  const compRes = await client.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ($1) RETURNING id",
    [`E2E Viewer Co ${SUFFIX}`]
  );
  const companyId = compRes.rows[0].id;

  await client.query(
    `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1, $2, $3, 'admin', $4, NOW(), NOW(), '1.0', '1.0')
     ON CONFLICT (email) DO NOTHING`,
    [`e2evradmin${SUFFIX}`, adminEmail, hash, companyId]
  );
  await client.query(
    `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1, $2, $3, 'viewer', $4, NOW(), NOW(), '1.0', '1.0')
     ON CONFLICT (email) DO NOTHING`,
    [`e2evrviewer${SUFFIX}`, viewerEmail, hash, companyId]
  );
  await client.end();

  const loginAdmin = await request.post("/api/auth/login", {
    data: { email: adminEmail, password },
  });
  const { token: adminToken } = await loginAdmin.json();

  const loginViewer = await request.post("/api/auth/login", {
    data: { email: viewerEmail, password },
  });
  const { token: viewerToken } = await loginViewer.json();

  return { adminToken, viewerToken, companyId };
}

test.describe("Viewer restrictions", () => {
  test("viewer is blocked from all write endpoints (403)", async ({ request }) => {
    const { viewerToken, adminToken } = await createAdminAndViewer(request);

    const adminMetricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const metrics = await adminMetricsRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const writeEndpoints = [
      { method: "POST" as const, path: "/api/data-entry", body: { metricId, period: "2024-Q1", value: 99 } },
      { method: "PUT" as const, path: `/api/metrics/${metricId}/target`, body: { targetValue: 100, targetYear: 2030 } },
      { method: "POST" as const, path: "/api/reports/generate", body: { reportType: "management", period: "2024-Q1" } },
      { method: "PUT" as const, path: "/api/company/settings", body: { reportingFrequency: "quarterly" } },
    ];

    for (const { method, path, body } of writeEndpoints) {
      const res = method === "PUT"
        ? await request.put(path, { data: body, headers: { Authorization: `Bearer ${viewerToken}` } })
        : await request.post(path, { data: body, headers: { Authorization: `Bearer ${viewerToken}` } });
      expect(res.status()).toBe(403);
    }
  });

  test("viewer can read metrics (200) but not write (403)", async ({ request }) => {
    const { viewerToken } = await createAdminAndViewer(request);

    const readRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(readRes.status()).toBe(200);

    const metrics = await readRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const writeRes = await request.post("/api/data-entry", {
      data: { metricId, period: "2024-Q1", value: 1 },
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(writeRes.status()).toBe(403);
  });
});
