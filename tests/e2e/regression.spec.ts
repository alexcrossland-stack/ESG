/**
 * Regression Pack — Release-Critical Flows
 *
 * Covers the ten commercially critical user journeys that must pass before
 * every release. This suite explicitly guards against the regression classes
 * fixed prior to the last release:
 *   - Dashboard render/hook stability (no 500 on /api/dashboard/enhanced)
 *   - Portfolio access using group membership as the correct source of truth
 *   - Permission guards on write endpoints (contributor vs admin, target setting)
 *
 * Run as part of the full E2E suite:
 *   npm run test:regression
 *
 * Flows covered (all ten):
 *   1.  Login by role — Company Admin
 *   2.  Login by role — Standard SME / Contributor
 *   3.  Login by role — Portfolio Owner (via group membership)
 *   4.  Login by role — Portfolio Viewer (via group membership)
 *   5.  Dashboard load for admin (hook/render stability)
 *   6.  Onboarding / first-session flow
 *   7.  First metric entry and persistence
 *   8.  Evidence upload and retrieval
 *   9.  Report generation accessible
 *   10a. Portfolio dashboard access via group membership
 *   10b. Portfolio company switching (list changes per group)
 *   11. Contributor forbidden from setting metric targets
 *   12. Admin permitted to set metric targets
 *
 * @group regression
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import fs from "fs";

const BASE_URL = "http://localhost:5000";
const TEST_PASSWORD = "Test1234!";

// ─── Helpers ────────────────────────────────────────────────────────────────

function readSeedInfo() {
  const raw = fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8");
  return JSON.parse(raw) as {
    tenantA: {
      adminToken: string;
      viewerToken: string;
      contributorToken: string;
      companyId: string;
      adminEmail: string;
      viewerEmail: string;
      contributorEmail: string;
    };
  };
}

async function dbClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function insertUser(
  client: Client,
  opts: {
    email: string;
    username: string;
    role: string;
    companyId: string;
  }
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [opts.email]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const res = await client.query<{ id: string }>(
    `INSERT INTO users
       (username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
     VALUES ($1,$2,$3,$4,$5, NOW(), NOW(), '1.0', '1.0')
     RETURNING id`,
    [opts.username, opts.email, hash, opts.role, opts.companyId]
  );
  return res.rows[0].id;
}

// ─── Portfolio seed (module-scoped, created once for portfolio tests) ────────

interface PortfolioContext {
  groupId: string;
  companyAId: string;
  companyBId: string;
  ownerToken: string;
  viewerToken: string;
}

let portfolioCtx: PortfolioContext | null = null;

async function ensurePortfolioContext(request: APIRequestContext): Promise<PortfolioContext> {
  if (portfolioCtx) return portfolioCtx;

  const suffix = randomUUID().slice(0, 8);
  const client = await dbClient();

  try {
    // Create two portfolio companies
    const coARes = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`Regr-Co-A-${suffix}`]
    );
    const companyAId = coARes.rows[0].id;

    const coBRes = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`Regr-Co-B-${suffix}`]
    );
    const companyBId = coBRes.rows[0].id;

    // Create a portfolio group
    const groupRes = await client.query<{ id: string }>(
      "INSERT INTO groups (name, slug, type) VALUES ($1, $2, 'portfolio') RETURNING id",
      [`Regr-Group-${suffix}`, `regr-group-${suffix}`]
    );
    const groupId = groupRes.rows[0].id;

    // Add both companies to the group
    await client.query(
      "INSERT INTO group_companies (group_id, company_id) VALUES ($1, $2), ($1, $3)",
      [groupId, companyAId, companyBId]
    );

    // Create portfolio_owner user (associated with companyA)
    const ownerEmail = `regr-owner-${suffix}@test-esg.example`;
    const ownerId = await insertUser(client, {
      email: ownerEmail,
      username: `regrowner${suffix}`,
      role: "portfolio_owner",
      companyId: companyAId,
    });
    await client.query(
      "INSERT INTO user_group_roles (user_id, group_id, role) VALUES ($1, $2, 'portfolio_owner')",
      [ownerId, groupId]
    );

    // Create portfolio_viewer user (associated with companyA)
    const viewerEmail = `regr-pviewer-${suffix}@test-esg.example`;
    const viewerId = await insertUser(client, {
      email: viewerEmail,
      username: `regrpviewer${suffix}`,
      role: "portfolio_viewer",
      companyId: companyAId,
    });
    await client.query(
      "INSERT INTO user_group_roles (user_id, group_id, role) VALUES ($1, $2, 'portfolio_viewer')",
      [viewerId, groupId]
    );

    // Obtain bearer tokens by logging in
    const ownerLoginRes = await request.post("/api/auth/login", {
      data: { email: ownerEmail, password: TEST_PASSWORD },
    });
    if (!ownerLoginRes.ok()) throw new Error(`Portfolio owner login failed: ${ownerLoginRes.status()}`);
    const ownerBody = await ownerLoginRes.json() as { token: string };

    const viewerLoginRes = await request.post("/api/auth/login", {
      data: { email: viewerEmail, password: TEST_PASSWORD },
    });
    if (!viewerLoginRes.ok()) throw new Error(`Portfolio viewer login failed: ${viewerLoginRes.status()}`);
    const viewerBody = await viewerLoginRes.json() as { token: string };

    portfolioCtx = {
      groupId,
      companyAId,
      companyBId,
      ownerToken: ownerBody.token,
      viewerToken: viewerBody.token,
    };

    return portfolioCtx;
  } finally {
    await client.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 1 — Login by role: Company Admin
// Regression class: auth endpoint stability
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-01: Login by role — Company Admin", () => {
  test("admin login returns 200 with token and user object", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/auth/login", {
      data: { email: tenantA.adminEmail, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { token?: string; user?: { role?: string } };
    expect(body.token).toBeTruthy();
    expect(body.user?.role).toBe("admin");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 2 — Login by role: Standard SME / Contributor
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-02: Login by role — Contributor", () => {
  test("contributor login returns 200 with token", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/auth/login", {
      data: { email: tenantA.contributorEmail, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { token?: string; user?: { role?: string } };
    expect(body.token).toBeTruthy();
    expect(body.user?.role).toBe("contributor");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 3 — Login by role: Portfolio Owner
// Regression class: portfolio access uses group membership as source of truth
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-03: Login by role — Portfolio Owner", () => {
  test("portfolio_owner login returns 200 with correct role", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);
    expect(ctx.ownerToken).toBeTruthy();

    // Verify the /api/auth/me endpoint confirms the role
    const meRes = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(meRes.status()).toBe(200);
    const me = await meRes.json() as { user?: { role?: string } };
    expect(me.user?.role).toBe("portfolio_owner");
  });

  test("portfolio_owner /api/auth/me includes portfolioGroups from group membership (not direct company)", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const meRes = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(meRes.status()).toBe(200);
    const me = await meRes.json() as { portfolioGroups?: Array<{ id: string; role?: string }> };

    // REGRESSION: portfolioGroups must come from userGroupRoles, not user.companyId
    expect(Array.isArray(me.portfolioGroups)).toBe(true);
    expect(me.portfolioGroups!.length).toBeGreaterThan(0);
    const ownedGroup = me.portfolioGroups!.find(g => g.id === ctx.groupId);
    expect(ownedGroup).toBeTruthy();
    expect(ownedGroup?.role).toBe("portfolio_owner");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 4 — Login by role: Portfolio Viewer
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-04: Login by role — Portfolio Viewer", () => {
  test("portfolio_viewer login returns 200 with correct role", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);
    expect(ctx.viewerToken).toBeTruthy();

    const meRes = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${ctx.viewerToken}` },
    });
    expect(meRes.status()).toBe(200);
    const me = await meRes.json() as { user?: { role?: string }; portfolioGroups?: Array<{ id: string; role?: string }> };
    expect(me.user?.role).toBe("portfolio_viewer");

    // REGRESSION: viewer's group membership must also be sourced from userGroupRoles
    expect(Array.isArray(me.portfolioGroups)).toBe(true);
    const viewerGroup = me.portfolioGroups!.find(g => g.id === ctx.groupId);
    expect(viewerGroup).toBeTruthy();
    expect(viewerGroup?.role).toBe("portfolio_viewer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 5 — Dashboard load for admin (hook/render stability)
// Regression class: dashboard hook regressions (no 500, valid structure)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-05: Dashboard load — Admin (hook stability)", () => {
  test("GET /api/dashboard/enhanced returns valid structure without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/dashboard/enhanced", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    // REGRESSION: must never return 500 (hook render crash)
    expect(res.status()).not.toBe(500);
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      // Body must be a valid object, not a raw error string or empty
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
      // Must not contain raw stack traces in the response
      expect(JSON.stringify(body)).not.toMatch(/at\s+\w+\s*\(/);
    }
  });

  test("GET /api/dashboard returns 200 for admin without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/dashboard", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 404]).toContain(res.status());
  });

  test("dashboard endpoint rejects unauthenticated requests with 401", async ({ request }) => {
    const res = await request.get("/api/dashboard/enhanced");
    expect(res.status()).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 6 — Onboarding / first-session flow
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-06: Onboarding / first-session flow", () => {
  test("metrics are available after first login (seedDatabase trigger)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const metrics = await res.json();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
  });

  test("PUT /api/onboarding/step accepts a valid step without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.put("/api/onboarding/step", {
      data: { step: 1, path: "/onboarding", esgMaturity: "beginner" },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
  });

  test("GET /api/onboarding/status returns onboarding state without 500", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/onboarding/status", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 7 — First metric entry and persistence
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-07: First metric entry and persistence", () => {
  let capturedMetricId: string | null = null;
  const testPeriod = "2023-01";

  test("admin can submit a metric value (201) and it is retrievable", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json() as Array<{ id: string }>;
    expect(metrics.length).toBeGreaterThan(0);
    capturedMetricId = metrics[0].id;

    const submitRes = await request.post("/api/data-entry", {
      data: {
        metricId: capturedMetricId,
        period: testPeriod,
        value: 99.1,
        notes: "Regression pack entry",
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(submitRes.status()).not.toBe(500);
    expect([200, 201]).toContain(submitRes.status());
    const submitted = await submitRes.json() as { id?: string; metricId?: string };
    expect(submitted.id).toBeTruthy();
    expect(submitted.metricId).toBe(capturedMetricId);
  });

  test("submitted value is retrievable and the correct period is present", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    if (!capturedMetricId) {
      const metricsRes = await request.get("/api/metrics", {
        headers: { Authorization: `Bearer ${tenantA.adminToken}` },
      });
      const metrics = await metricsRes.json() as Array<{ id: string }>;
      capturedMetricId = metrics[0]?.id ?? null;
    }

    if (!capturedMetricId) {
      test.skip();
      return;
    }

    const valuesRes = await request.get(`/api/metrics/${capturedMetricId}/values`, {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(valuesRes.status()).toBe(200);
    const values = await valuesRes.json() as Array<{ period: string; value: string | number }>;
    expect(Array.isArray(values)).toBe(true);
    // Verify the specific period submitted above appears in the returned values
    const entry = values.find(v => v.period === testPeriod);
    expect(entry, `Expected period ${testPeriod} to appear in metric values after submission`).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 8 — Evidence upload and retrieval
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-08: Evidence upload and retrieval", () => {
  test("GET /api/evidence returns array for admin (200)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/evidence", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/evidence/coverage returns coverage object for admin", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/evidence/coverage", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect([200, 404]).toContain(res.status());
  });

  test("admin can upload evidence record (filename + fileUrl) and it appears in the list", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Upload a metadata-only evidence record (no binary file needed — server stores the URL reference)
    const uniqueFilename = `regression-test-${Date.now()}.pdf`;
    const uploadRes = await request.post("/api/evidence", {
      data: {
        filename: uniqueFilename,
        fileUrl: "https://example.com/regression-test.pdf",
        fileType: "pdf",
        linkedModule: "metric_value",
        description: "Regression pack evidence test",
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(uploadRes.status()).not.toBe(500);
    expect(uploadRes.status()).toBe(200);
    const uploaded = await uploadRes.json() as { id?: string; filename?: string };
    expect(uploaded.id).toBeTruthy();
    expect(uploaded.filename).toBe(uniqueFilename);

    // Verify the uploaded file appears in the evidence list
    const listRes = await request.get("/api/evidence", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(listRes.status()).toBe(200);
    const list = await listRes.json() as Array<{ id?: string; filename?: string }>;
    expect(Array.isArray(list)).toBe(true);
    const found = list.find(e => e.id === uploaded.id);
    expect(found, "Uploaded evidence should appear in the evidence list").toBeTruthy();
  });

  test("POST /api/evidence without filename returns 400 (not 500)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Send JSON body with linkedModule but no filename — server should return 400
    const res = await request.post("/api/evidence", {
      data: { linkedModule: "metric_value" },
      headers: {
        Authorization: `Bearer ${tenantA.adminToken}`,
        "Content-Type": "application/json",
      },
    });
    // Must not crash the server
    expect(res.status()).not.toBe(500);
    // Missing filename should produce a 400 client error
    expect([400, 403]).toContain(res.status());
  });

  test("viewer cannot upload evidence (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Viewer does not have metrics_data_entry permission — must be blocked at the permission guard
    const res = await request.post("/api/evidence", {
      data: { filename: "test.pdf", linkedModule: "metric_value" },
      headers: {
        Authorization: `Bearer ${tenantA.viewerToken}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 9 — Report generation accessible
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-09: Report generation", () => {
  let generatedReportId: string | null = null;

  test("admin POST /api/reports/generate creates a report (200) and it is accessible", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // reportType is the output format (pdf/csv/word), reportTemplate is the template style
    const res = await request.post("/api/reports/generate", {
      data: {
        reportType: "pdf",
        reportTemplate: "management",
        period: "2023-01",
        includeMetrics: true,
        includePolicy: true,
        includeTopics: true,
      },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    // Must not crash the server
    expect(res.status()).not.toBe(500);
    // 200/201: successfully created; 429: rate-limited (acceptable — report endpoint has a rate limiter)
    expect([200, 201, 429]).toContain(res.status());

    if ([200, 201].includes(res.status())) {
      // Response: { report: { id, ... }, data: { ... } }
      const body = await res.json() as { report?: { id?: string }; id?: string };
      generatedReportId = body.report?.id ?? body.id ?? null;
      expect(generatedReportId, "Report generation should return a report ID").toBeTruthy();
    }
  });

  test("GET /api/reports returns array including previously generated report", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).not.toBe(500);
    expect(res.status()).toBe(200);
    const reports = await res.json() as Array<{ id: string }>;
    expect(Array.isArray(reports)).toBe(true);

    if (generatedReportId) {
      const found = reports.find(r => r.id === generatedReportId);
      expect(found, "Generated report should appear in reports list").toBeTruthy();
    }
  });

  test("viewer cannot generate reports (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.post("/api/reports/generate", {
      data: { reportType: "pdf", reportTemplate: "management", period: "2023-01" },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 10a — Portfolio dashboard access via group membership
// Regression class: portfolio access uses group membership as source of truth
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-10a: Portfolio dashboard access via group membership", () => {
  test("portfolio_owner GET /api/portfolio/groups returns their group (200)", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const res = await request.get("/api/portfolio/groups", {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.status()).toBe(200);
    const groups = await res.json() as Array<{ id: string; role?: string }>;
    expect(Array.isArray(groups)).toBe(true);

    // REGRESSION: group membership must be sourced from userGroupRoles table
    const ourGroup = groups.find(g => g.id === ctx.groupId);
    expect(ourGroup).toBeTruthy();
    expect(ourGroup?.role).toBe("portfolio_owner");
  });

  test("portfolio_viewer GET /api/portfolio/groups returns their group (200)", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const res = await request.get("/api/portfolio/groups", {
      headers: { Authorization: `Bearer ${ctx.viewerToken}` },
    });
    expect(res.status()).toBe(200);
    const groups = await res.json() as Array<{ id: string; role?: string }>;

    const ourGroup = groups.find(g => g.id === ctx.groupId);
    expect(ourGroup).toBeTruthy();
    expect(ourGroup?.role).toBe("portfolio_viewer");
  });

  test("unauthenticated /api/portfolio/groups returns 401", async ({ request }) => {
    const res = await request.get("/api/portfolio/groups");
    expect(res.status()).toBe(401);
  });

  test("regular admin without group membership gets 403 from /api/portfolio/groups", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const res = await request.get("/api/portfolio/groups", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    // Regular company admin has no group membership → 403
    expect(res.status()).toBe(403);
  });

  test("portfolio_owner can view group summary (200)", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/summary`, {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { totalCompanies?: number };
    expect(typeof body.totalCompanies).toBe("number");
    expect(body.totalCompanies).toBeGreaterThanOrEqual(2);
  });

  test("portfolio_viewer can view group summary (200)", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/summary`, {
      headers: { Authorization: `Bearer ${ctx.viewerToken}` },
    });
    expect(res.status()).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 10b — Portfolio company switching
// Regression class: portfolio access uses group membership as source of truth
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-10b: Portfolio company switching", () => {
  test("portfolio_owner GET /api/portfolio/groups/:id/companies returns all group companies", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/companies`, {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.status()).toBe(200);

    // Endpoint returns a paginated response: { companies: [...], total, page, pageSize }
    const body = await res.json() as { companies?: Array<{ companyId: string }> };
    expect(Array.isArray(body.companies)).toBe(true);

    // REGRESSION: must include both companies added via group membership (not just owner's direct company)
    const ids = body.companies!.map(c => c.companyId);
    expect(ids).toContain(ctx.companyAId);
    expect(ids).toContain(ctx.companyBId);
  });

  test("portfolio_viewer can also list group companies", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);

    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/companies`, {
      headers: { Authorization: `Bearer ${ctx.viewerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { companies?: Array<{ companyId: string }> };
    expect(Array.isArray(body.companies)).toBe(true);
    const ids = body.companies!.map(c => c.companyId);
    expect(ids).toContain(ctx.companyAId);
    expect(ids).toContain(ctx.companyBId);
  });

  test("user without group membership cannot access another group's companies (403)", async ({ request }) => {
    const ctx = await ensurePortfolioContext(request);
    const { tenantA } = readSeedInfo();

    // Tenant A admin has no access to portfolio group
    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/companies`, {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 11 — Contributor forbidden from setting metric targets
// Regression class: permission guards on write endpoints
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-11: Permission guard — Contributor cannot set metric targets", () => {
  test("contributor PUT /api/metrics/:id/target returns 403", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    // Get a metric ID using admin token
    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    const metrics = await metricsRes.json() as Array<{ id: string }>;
    expect(metrics.length).toBeGreaterThan(0);
    const metricId = metrics[0].id;

    // REGRESSION: contributor must be blocked from setting targets
    const res = await request.put(`/api/metrics/${metricId}/target`, {
      data: { targetValue: 50, targetYear: 2030, direction: "lower_is_better" },
      headers: { Authorization: `Bearer ${tenantA.contributorToken}` },
    });
    expect(res.status()).toBe(403);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("viewer PUT /api/metrics/:id/target returns 403", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    const metrics = await metricsRes.json() as Array<{ id: string }>;
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const res = await request.put(`/api/metrics/${metricId}/target`, {
      data: { targetValue: 50, targetYear: 2030 },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(res.status()).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 12 — Admin permitted to set metric targets
// Regression class: permission guards on write endpoints
// ═══════════════════════════════════════════════════════════════════════════
test.describe("REGR-12: Permission guard — Admin can set metric targets", () => {
  test("admin PUT /api/metrics/:id/target succeeds (200) or returns expected client error (400)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json() as Array<{ id: string }>;
    expect(metrics.length).toBeGreaterThan(0);
    const metricId = metrics[0].id;

    const res = await request.put(`/api/metrics/${metricId}/target`, {
      data: { targetValue: 100, targetYear: 2030, direction: "lower_is_better" },
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });

    // REGRESSION: admin must NOT get 403 (permission guard must allow through)
    expect(res.status()).not.toBe(403);
    expect(res.status()).not.toBe(500);
    // 200 on success; 400 only if request data is semantically invalid (not a permissions issue)
    expect([200, 400]).toContain(res.status());

    if (res.status() === 403) {
      const body = await res.json() as { error?: string };
      throw new Error(`Admin was incorrectly blocked: ${body.error}`);
    }
  });
});
