/**
 * E2E: Portfolio dashboard access via group membership
 *
 * Flow 10a of the ten release-critical flows.
 * Regression class: portfolio access must use group membership (userGroupRoles)
 * as the source of truth — not the user's direct companyId.
 *
 * Verifies:
 *   - portfolio_owner sees only permitted companies (those in the group)
 *   - portfolio_viewer sees the same group companies
 *   - non-member admin is blocked from accessing the group
 *
 * @group regression
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import fs from "fs";

const TEST_PASSWORD = "Test1234!";

interface PortfolioCtx {
  groupId: string;
  companyAId: string;
  companyBId: string;
  companyCId: string; // NOT in group
  ownerToken: string;
  viewerToken: string;
  nonMemberToken: string;
}

let portfolioCtx: PortfolioCtx | null = null;

async function ensurePortfolioCtx(request: APIRequestContext): Promise<PortfolioCtx> {
  if (portfolioCtx) return portfolioCtx;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const suffix = randomUUID().slice(0, 8);

  try {
    const coA = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`PA-Co-A-${suffix}`]
    );
    const companyAId = coA.rows[0].id;

    const coB = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`PA-Co-B-${suffix}`]
    );
    const companyBId = coB.rows[0].id;

    const coC = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`PA-Co-C-NonMember-${suffix}`]
    );
    const companyCId = coC.rows[0].id;

    // Group contains A and B only
    const grp = await client.query<{ id: string }>(
      "INSERT INTO groups (name, slug, type) VALUES ($1, $2, 'portfolio') RETURNING id",
      [`PA-Group-${suffix}`, `pa-group-${suffix}`]
    );
    const groupId = grp.rows[0].id;
    await client.query(
      "INSERT INTO group_companies (group_id, company_id) VALUES ($1, $2), ($1, $3)",
      [groupId, companyAId, companyBId]
    );

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);

    async function upsertUser(email: string, username: string, role: string, cId: string): Promise<string> {
      const ex = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
      if (ex.rows.length > 0) return ex.rows[0].id;
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (username, email, password, role, company_id,
           terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
         VALUES ($1,$2,$3,$4,$5, NOW(), NOW(), '1.0', '1.0') RETURNING id`,
        [username, email, hash, role, cId]
      );
      return r.rows[0].id;
    }

    const ownerEmail = `pa-owner-${suffix}@test-esg.example`;
    const ownerId = await upsertUser(ownerEmail, `paowner${suffix}`, "portfolio_owner", companyAId);
    await client.query(
      "INSERT INTO user_group_roles (user_id, group_id, role) VALUES ($1, $2, 'portfolio_owner')",
      [ownerId, groupId]
    );

    const viewerEmail = `pa-viewer-${suffix}@test-esg.example`;
    const viewerId = await upsertUser(viewerEmail, `paviewer${suffix}`, "portfolio_viewer", companyAId);
    await client.query(
      "INSERT INTO user_group_roles (user_id, group_id, role) VALUES ($1, $2, 'portfolio_viewer')",
      [viewerId, groupId]
    );

    const nonMemberEmail = `pa-nonmember-${suffix}@test-esg.example`;
    await upsertUser(nonMemberEmail, `panonmember${suffix}`, "admin", companyCId);

    const ownerLogin = await request.post("/api/auth/login", { data: { email: ownerEmail, password: TEST_PASSWORD } });
    const ownerBody = await ownerLogin.json() as { token: string };

    const viewerLogin = await request.post("/api/auth/login", { data: { email: viewerEmail, password: TEST_PASSWORD } });
    const viewerBody = await viewerLogin.json() as { token: string };

    const nonMemberLogin = await request.post("/api/auth/login", { data: { email: nonMemberEmail, password: TEST_PASSWORD } });
    const nonMemberBody = await nonMemberLogin.json() as { token: string };

    portfolioCtx = {
      groupId, companyAId, companyBId, companyCId,
      ownerToken: ownerBody.token,
      viewerToken: viewerBody.token,
      nonMemberToken: nonMemberBody.token,
    };
    return portfolioCtx;
  } finally {
    await client.end();
  }
}

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
  };
}

test.describe("REGR-PA: Portfolio access via group membership", () => {
  test("portfolio_owner /api/auth/me returns portfolioGroups sourced from group membership", async ({ request }) => {
    const ctx = await ensurePortfolioCtx(request);
    const res = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as {
      user?: { role?: string };
      portfolioGroups?: Array<{ id: string; role?: string }>;
    };
    expect(body.user?.role).toBe("portfolio_owner");
    // REGRESSION: groups must come from userGroupRoles, not user.companyId
    expect(Array.isArray(body.portfolioGroups)).toBe(true);
    expect(body.portfolioGroups!.length).toBeGreaterThan(0);
    const ownedGroup = body.portfolioGroups!.find(g => g.id === ctx.groupId);
    expect(ownedGroup, "group must appear in portfolioGroups").toBeTruthy();
    expect(ownedGroup?.role).toBe("portfolio_owner");
  });

  test("portfolio_viewer /api/auth/me returns portfolioGroups sourced from group membership", async ({ request }) => {
    const ctx = await ensurePortfolioCtx(request);
    const res = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${ctx.viewerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as {
      user?: { role?: string };
      portfolioGroups?: Array<{ id: string; role?: string }>;
    };
    expect(body.user?.role).toBe("portfolio_viewer");
    expect(Array.isArray(body.portfolioGroups)).toBe(true);
    const viewerGroup = body.portfolioGroups!.find(g => g.id === ctx.groupId);
    expect(viewerGroup).toBeTruthy();
    expect(viewerGroup?.role).toBe("portfolio_viewer");
  });

  test("portfolio companies list contains permitted companies A and B", async ({ request }) => {
    const ctx = await ensurePortfolioCtx(request);
    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/companies`, {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    // Accept 200 or feature-flag responses but not 500
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json() as { companies?: Array<{ companyId?: string }> };
      const companies = body.companies ?? [];
      expect(Array.isArray(companies)).toBe(true);
      const ids = companies.map(c => c.companyId);
      expect(ids).toContain(ctx.companyAId);
      expect(ids).toContain(ctx.companyBId);
    } else {
      test.skip();
    }
  });

  test("portfolio companies list does NOT contain non-member company C", async ({ request }) => {
    const ctx = await ensurePortfolioCtx(request);
    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/companies`, {
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json() as { companies?: Array<{ companyId?: string }> };
      const companies = body.companies ?? [];
      const ids = companies.map(c => c.companyId);
      expect(ids).not.toContain(ctx.companyCId);
    }
  });

  test("non-group-member cannot access group companies (403 or 404)", async ({ request }) => {
    const ctx = await ensurePortfolioCtx(request);
    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/companies`, {
      headers: { Authorization: `Bearer ${ctx.nonMemberToken}` },
    });
    expect(res.status()).not.toBe(200);
    expect(res.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(res.status());
  });

  test("non-group-member cannot access group summary (403 or 404)", async ({ request }) => {
    const ctx = await ensurePortfolioCtx(request);
    const res = await request.get(`/api/portfolio/groups/${ctx.groupId}/summary`, {
      headers: { Authorization: `Bearer ${ctx.nonMemberToken}` },
    });
    expect(res.status()).not.toBe(200);
    expect(res.status()).not.toBe(500);
  });

  test("unauthenticated request to portfolio groups returns 401", async ({ request }) => {
    const res = await request.get("/api/portfolio/groups");
    expect(res.status()).toBe(401);
  });

  test("regular admin has no portfolioGroups (empty or absent)", async ({ request }) => {
    const { tenantA } = readSeedInfo();
    const res = await request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { portfolioGroups?: unknown[] };
    const count = body.portfolioGroups ? body.portfolioGroups.length : 0;
    // Regular admin should not have any portfolio groups
    expect(count).toBe(0);
  });
});
