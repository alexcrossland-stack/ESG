/**
 * Seed utility for API and E2E tests.
 *
 * Tenant A:
 *   - Admin: registered via /api/auth/register (may be skipped if rate-limited,
 *     falling back to direct SQL).
 *   - Viewer: inserted directly via SQL.
 *   - Contributor: inserted directly via SQL.
 *
 * Tenant B:
 *   - Admin: inserted directly via SQL (avoids consuming 2 of 5/hr register slots).
 *
 * Bearer tokens are always obtained via /api/auth/login (no rate limiter on login).
 * First login triggers seedDatabase(), populating default metrics and topics.
 */

import http from "http";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const BASE_URL = "http://localhost:5000";
const TEST_PASSWORD = "Test1234!";

export interface TenantA {
  adminToken: string;
  viewerToken: string;
  contributorToken: string;
  companyId: string;
  adminEmail: string;
  viewerEmail: string;
  contributorEmail: string;
}

export interface TenantB {
  adminToken: string;
  companyId: string;
  metricId: string;
  topicId: string;
  reportId: string | null;
  adminEmail: string;
}

export interface SeededTenants {
  tenantA: TenantA;
  tenantB: TenantB;
}

export function apiRequest(
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

export async function loginAndGetToken(email: string, password: string): Promise<string> {
  const res = await apiRequest("POST", "/api/auth/login", { email, password });
  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${email}: status=${res.status} body=${res.body.slice(0, 200)}`
    );
  }
  const parsed = JSON.parse(res.body) as { token?: string };
  if (!parsed.token) {
    throw new Error(`Login response missing token for ${email}: ${res.body.slice(0, 200)}`);
  }
  return parsed.token;
}

async function getMetricId(token: string): Promise<string> {
  const res = await apiRequest("GET", "/api/metrics", undefined, token);
  if (res.status !== 200) {
    throw new Error(`GET /api/metrics failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  }
  const metrics = JSON.parse(res.body) as Array<{ id: string }>;
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error(`No metrics found after seedDatabase: ${res.body.slice(0, 200)}`);
  }
  return metrics[0].id;
}

async function getTopicId(token: string): Promise<string> {
  const res = await apiRequest("GET", "/api/topics", undefined, token);
  if (res.status !== 200) {
    throw new Error(`GET /api/topics failed: status=${res.status} body=${res.body.slice(0, 200)}`);
  }
  const topics = JSON.parse(res.body) as Array<{ id: string }>;
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error(`No topics found after seedDatabase: ${res.body.slice(0, 200)}`);
  }
  return topics[0].id;
}

async function createUserViaSql(
  client: Client,
  opts: {
    email: string;
    username: string;
    role: "admin" | "viewer" | "contributor";
    companyId?: string;
    companyName?: string;
  }
): Promise<{ userId: string; companyId: string }> {
  const existing = await client.query<{ id: string; company_id: string }>(
    "SELECT id, company_id FROM users WHERE email = $1",
    [opts.email]
  );
  if (existing.rows.length > 0) {
    return { userId: existing.rows[0].id, companyId: existing.rows[0].company_id };
  }

  let companyId = opts.companyId;
  if (!companyId) {
    const companyName = opts.companyName ?? `Test Company ${opts.username}`;
    const compRes = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [companyName]
    );
    companyId = compRes.rows[0].id;
  }

  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const userRes = await client.query<{ id: string }>(
    `INSERT INTO users (username, email, password, role, company_id,
       terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), '1.0', '1.0')
     RETURNING id`,
    [opts.username, opts.email, hash, opts.role, companyId]
  );

  return { userId: userRes.rows[0].id, companyId };
}

/**
 * Register a tenant admin via the API if not already created.
 * Falls back to direct SQL insert when the API rate limiter is active (5/hr per IP).
 * Works for both Tenant A and Tenant B admins.
 */
async function getOrRegisterAdmin(
  opts: { suffix: string; tenant: "A" | "B"; client: Client }
): Promise<{ email: string; companyId: string; via: "api" | "sql" }> {
  const tag = opts.tenant === "A" ? "ta" : "tb";
  const email = `${tag}-admin-${opts.suffix}@test-esg.example`;
  const companyName = `Test Company T${opts.tenant} ${opts.suffix}`;

  const existing = await opts.client.query<{ id: string; company_id: string }>(
    "SELECT id, company_id FROM users WHERE email = $1",
    [email]
  );
  if (existing.rows.length > 0) {
    return { email, companyId: existing.rows[0].company_id, via: "sql" };
  }

  const res = await apiRequest("POST", "/api/auth/register", {
    username: `${tag}admin${opts.suffix}`,
    email,
    password: TEST_PASSWORD,
    companyName,
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: "1.0",
    privacyVersion: "1.0",
  });

  if (res.status === 200 || res.status === 201) {
    const parsed = JSON.parse(res.body) as { token?: string; company?: { id: string } };
    if (parsed.company?.id) {
      return { email, companyId: parsed.company.id, via: "api" };
    }
  }

  // Rate-limited or other error — fall back to direct SQL
  const result = await createUserViaSql(opts.client, {
    email,
    username: `${tag}admin${opts.suffix}`,
    role: "admin",
    companyName,
  });
  return { email, companyId: result.companyId, via: "sql" };
}

/**
 * Attempt to generate a report for a tenant so we have a concrete report ID
 * for cross-tenant isolation tests. Returns the report ID or null if not supported
 * (e.g. rate-limited, plan restriction).
 */
async function generateTenantReport(token: string): Promise<string | null> {
  const res = await apiRequest("POST", "/api/reports/generate", {
    reportType: "management",
    period: "2024-Q1",
  }, token);
  if (res.status === 200 || res.status === 201) {
    try {
      const parsed = JSON.parse(res.body) as { id?: string };
      return parsed.id ?? null;
    } catch {
      return null;
    }
  }
  return null;
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
  const tenantAViewerEmail = `ta-viewer-${suffix}@test-esg.example`;
  const tenantAContributorEmail = `ta-contributor-${suffix}@test-esg.example`;
  const tenantBAdminEmail = `tb-admin-${suffix}@test-esg.example`;

  try {
    // Tenant A admin — try API first, SQL fallback on rate limit
    const tenantAAdmin = await getOrRegisterAdmin({ suffix, tenant: "A", client });
    tenantACompanyId = tenantAAdmin.companyId;

    // Tenant A viewer — direct SQL only
    await createUserViaSql(client, {
      email: tenantAViewerEmail,
      username: `taviewer${suffix}`,
      role: "viewer",
      companyId: tenantACompanyId,
    });

    // Tenant A contributor — direct SQL only
    await createUserViaSql(client, {
      email: tenantAContributorEmail,
      username: `tacontrib${suffix}`,
      role: "contributor",
      companyId: tenantACompanyId,
    });

    // Tenant B admin — try API first, SQL fallback on rate limit
    const tenantBAdmin = await getOrRegisterAdmin({ suffix, tenant: "B", client });
    tenantBCompanyId = tenantBAdmin.companyId;

    // Mark both tenant companies as onboarding-complete so browser tests
    // navigate directly to dashboard (not the /onboarding wizard).
    await client.query(
      "UPDATE companies SET onboarding_complete = true, onboarding_completed_at = NOW() WHERE id = ANY($1::text[])",
      [[tenantACompanyId, tenantBCompanyId]]
    );
  } finally {
    await client.end();
  }

  // Login to trigger seedDatabase() for each tenant
  const tenantAAdminToken = await loginAndGetToken(tenantAAdminEmail, TEST_PASSWORD);
  const tenantAViewerToken = await loginAndGetToken(tenantAViewerEmail, TEST_PASSWORD);
  const tenantAContributorToken = await loginAndGetToken(tenantAContributorEmail, TEST_PASSWORD);
  const tenantBAdminToken = await loginAndGetToken(tenantBAdminEmail, TEST_PASSWORD);

  const metricId = await getMetricId(tenantBAdminToken);
  const topicId = await getTopicId(tenantBAdminToken);

  // Generate a Tenant B report so Suite 5 can test targeted cross-tenant report access
  const tenantBReportId = await generateTenantReport(tenantBAdminToken);

  return {
    tenantA: {
      adminToken: tenantAAdminToken,
      viewerToken: tenantAViewerToken,
      contributorToken: tenantAContributorToken,
      companyId: tenantACompanyId,
      adminEmail: tenantAAdminEmail,
      viewerEmail: tenantAViewerEmail,
      contributorEmail: tenantAContributorEmail,
    },
    tenantB: {
      adminToken: tenantBAdminToken,
      companyId: tenantBCompanyId,
      metricId,
      topicId,
      reportId: tenantBReportId,
      adminEmail: tenantBAdminEmail,
    },
  };
}
