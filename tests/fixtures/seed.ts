/**
 * Seed utility for API and E2E tests.
 *
 * Provisions two isolated tenants (Tenant A and Tenant B).
 *
 * Strategy:
 * - All users are created directly via SQL to avoid the API rate limiter on /api/auth/register.
 *   Companies are created via SQL as well (companyId is a UUID).
 * - Bearer tokens are obtained via /api/auth/login (no rate limiter).
 * - First login triggers seedDatabase() which inserts default metrics/topics.
 *
 * Returns bearer tokens and company IDs for use in test suites.
 *
 * Usage:
 *   import { seedTestTenants } from "./fixtures/seed.js";
 *   const { tenantA, tenantB } = await seedTestTenants();
 */

import http from "http";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const BASE_URL = "http://localhost:5000";
const TEST_PASSWORD = "Test1234!";

export interface TenantA {
  adminToken: string;
  viewerToken: string;
  companyId: string;
}

export interface TenantB {
  adminToken: string;
  companyId: string;
  metricId: string;
}

export interface SeededTenants {
  tenantA: TenantA;
  tenantB: TenantB;
}

function apiRequest(
  method: string,
  path: string,
  body?: object,
  token?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (bodyStr) headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: parseInt(url.port || "5000"),
      path: url.pathname + url.search,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function loginAndGetToken(
  email: string,
  password: string
): Promise<string> {
  const res = await apiRequest("POST", "/api/auth/login", { email, password });
  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${email}: status=${res.status} body=${res.body.slice(0, 200)}`
    );
  }
  const parsed = JSON.parse(res.body);
  const token = parsed.token;
  if (!token) {
    throw new Error(
      `Login response missing token for ${email}: ${res.body.slice(0, 200)}`
    );
  }
  return token;
}

async function getMetricId(token: string): Promise<string> {
  const res = await apiRequest("GET", "/api/metrics", undefined, token);
  if (res.status !== 200) {
    throw new Error(
      `GET /api/metrics failed: status=${res.status} body=${res.body.slice(0, 200)}`
    );
  }
  const metrics = JSON.parse(res.body);
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error(
      `No metrics found after seedDatabase: ${res.body.slice(0, 200)}`
    );
  }
  return metrics[0].id;
}

/**
 * Create a company and admin user directly via SQL.
 * Returns { companyId, email }.
 * If the user already exists (by email), returns the existing record.
 */
async function getOrCreateUserViaSql(
  client: Client,
  email: string,
  username: string,
  role: "admin" | "viewer",
  companyId?: string
): Promise<{ companyId: string; userId: string }> {
  const existing = await client.query<{ id: string; company_id: string }>(
    "SELECT id, company_id FROM users WHERE email = $1",
    [email]
  );
  if (existing.rows.length > 0) {
    return {
      userId: existing.rows[0].id,
      companyId: existing.rows[0].company_id,
    };
  }

  let resolvedCompanyId = companyId;
  if (!resolvedCompanyId) {
    const companyName = `Test Company ${username}`;
    const companyRes = await client.query<{ id: string }>(
      `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
      [companyName]
    );
    resolvedCompanyId = companyRes.rows[0].id;
  }

  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const userRes = await client.query<{ id: string }>(
    `INSERT INTO users (username, email, password, role, company_id,
       terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), '1.0', '1.0')
     RETURNING id`,
    [username, email, hash, role, resolvedCompanyId]
  );

  return {
    userId: userRes.rows[0].id,
    companyId: resolvedCompanyId,
  };
}

export async function seedTestTenants(): Promise<SeededTenants> {
  const suffix = Date.now().toString();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  let tenantACompanyId: string;
  let tenantBCompanyId: string;
  const tenantAAdminEmail = `ta-admin-${suffix}@test-esg.example`;
  const tenantBAdminEmail = `tb-admin-${suffix}@test-esg.example`;
  const tenantAViewerEmail = `ta-viewer-${suffix}@test-esg.example`;

  try {
    const tenantAAdmin = await getOrCreateUserViaSql(
      client,
      tenantAAdminEmail,
      `taadmin${suffix}`,
      "admin"
    );
    tenantACompanyId = tenantAAdmin.companyId;

    const _tenantAViewer = await getOrCreateUserViaSql(
      client,
      tenantAViewerEmail,
      `taviewer${suffix}`,
      "viewer",
      tenantACompanyId
    );

    const tenantBAdmin = await getOrCreateUserViaSql(
      client,
      tenantBAdminEmail,
      `tbadmin${suffix}`,
      "admin"
    );
    tenantBCompanyId = tenantBAdmin.companyId;
  } finally {
    await client.end();
  }

  // Login to trigger seedDatabase() for each tenant
  const tenantAAdminToken = await loginAndGetToken(tenantAAdminEmail, TEST_PASSWORD);
  const tenantAViewerToken = await loginAndGetToken(tenantAViewerEmail, TEST_PASSWORD);
  const tenantBAdminToken = await loginAndGetToken(tenantBAdminEmail, TEST_PASSWORD);

  const metricId = await getMetricId(tenantBAdminToken);

  return {
    tenantA: {
      adminToken: tenantAAdminToken,
      viewerToken: tenantAViewerToken,
      companyId: tenantACompanyId,
    },
    tenantB: {
      adminToken: tenantBAdminToken,
      companyId: tenantBCompanyId,
      metricId,
    },
  };
}
