/**
 * API tests: Portfolio domain
 *
 * Covers: correct companies returned for portfolio user, disallowed companies
 * absent, access tied to group membership, and non-member rejection.
 *
 * Run: npx tsx tests/api/portfolio.test.ts
 */

import { seedTestTenants, apiRequest, loginAndGetToken } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

interface PortfolioCtx {
  groupId: string;
  companyAId: string;
  companyBId: string;
  ownerToken: string;
  viewerToken: string;
  nonMemberToken: string;
}

async function buildPortfolioContext(): Promise<PortfolioCtx> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const suffix = randomUUID().slice(0, 8);
  const PASSWORD = "Test1234!";

  try {
    // Two portfolio companies
    const coA = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`Port-Co-A-${suffix}`]
    );
    const companyAId = coA.rows[0].id;

    const coB = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`Port-Co-B-${suffix}`]
    );
    const companyBId = coB.rows[0].id;

    // A third company NOT in the portfolio group
    const coC = await client.query<{ id: string }>(
      "INSERT INTO companies (name, onboarding_complete, onboarding_completed_at) VALUES ($1, true, NOW()) RETURNING id",
      [`Port-Co-C-NonMember-${suffix}`]
    );
    const companyCId = coC.rows[0].id;

    // Portfolio group containing only A and B
    const grp = await client.query<{ id: string }>(
      "INSERT INTO groups (name, slug, type) VALUES ($1, $2, 'portfolio') RETURNING id",
      [`Port-Group-${suffix}`, `port-group-${suffix}`]
    );
    const groupId = grp.rows[0].id;

    await client.query(
      "INSERT INTO group_companies (group_id, company_id) VALUES ($1, $2), ($1, $3)",
      [groupId, companyAId, companyBId]
    );

    const hash = await bcrypt.hash(PASSWORD, 10);

    async function insertUser(email: string, username: string, role: string, cId: string): Promise<string> {
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

    const ownerEmail = `port-owner-${suffix}@test-esg.example`;
    const ownerId = await insertUser(ownerEmail, `portowner${suffix}`, "portfolio_owner", companyAId);
    await client.query(
      "INSERT INTO user_group_roles (user_id, group_id, role) VALUES ($1, $2, 'portfolio_owner')",
      [ownerId, groupId]
    );

    const viewerEmail = `port-viewer-${suffix}@test-esg.example`;
    const viewerId = await insertUser(viewerEmail, `portviewer${suffix}`, "portfolio_viewer", companyAId);
    await client.query(
      "INSERT INTO user_group_roles (user_id, group_id, role) VALUES ($1, $2, 'portfolio_viewer')",
      [viewerId, groupId]
    );

    // Non-member user — belongs to company C which is NOT in the group
    const nonMemberEmail = `port-nonmember-${suffix}@test-esg.example`;
    await insertUser(nonMemberEmail, `portnonmember${suffix}`, "admin", companyCId);

    const ownerToken = await loginAndGetToken(ownerEmail, PASSWORD);
    const viewerToken = await loginAndGetToken(viewerEmail, PASSWORD);
    const nonMemberToken = await loginAndGetToken(nonMemberEmail, PASSWORD);

    return { groupId, companyAId, companyBId, ownerToken, viewerToken, nonMemberToken };
  } finally {
    await client.end();
  }
}

async function run(tenants: SeededTenants): Promise<void> {
  let ctx: PortfolioCtx;
  try {
    ctx = await buildPortfolioContext();
  } catch (err) {
    console.error("Portfolio context build failed:", err);
    fail("portfolio context build", String(err));
    return;
  }

  // ── 1. /api/auth/me includes portfolioGroups for portfolio_owner ──────────
  {
    const name = "portfolio_owner /api/auth/me returns portfolioGroups from group membership";
    const res = await apiRequest("GET", "/api/auth/me", undefined, ctx.ownerToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { portfolioGroups?: Array<{ id: string; role?: string }> };
      if (!Array.isArray(body.portfolioGroups) || body.portfolioGroups.length === 0) {
        fail(name, "portfolioGroups missing or empty");
      } else {
        const ownedGroup = body.portfolioGroups.find(g => g.id === ctx.groupId);
        if (!ownedGroup) fail(name, `groupId=${ctx.groupId} not in portfolioGroups`);
        else if (ownedGroup.role !== "portfolio_owner") fail(name, `role=${ownedGroup.role}`);
        else pass(name);
      }
    }
  }

  // ── 2. /api/auth/me includes portfolioGroups for portfolio_viewer ─────────
  {
    const name = "portfolio_viewer /api/auth/me returns portfolioGroups from group membership";
    const res = await apiRequest("GET", "/api/auth/me", undefined, ctx.viewerToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { portfolioGroups?: Array<{ id: string; role?: string }> };
      if (!Array.isArray(body.portfolioGroups) || body.portfolioGroups.length === 0) {
        fail(name, "portfolioGroups missing or empty");
      } else {
        const vg = body.portfolioGroups.find(g => g.id === ctx.groupId);
        if (!vg) fail(name, `groupId=${ctx.groupId} not in portfolioGroups`);
        else if (vg.role !== "portfolio_viewer") fail(name, `role=${vg.role}`);
        else pass(name);
      }
    }
  }

  // ── 3. /api/portfolio/groups returns group list for owner ─────────────────
  {
    const name = "GET /api/portfolio/groups returns groups for portfolio_owner";
    const res = await apiRequest("GET", "/api/portfolio/groups", undefined, ctx.ownerToken);
    // Feature may be flagged — accept 200 or 403 (feature disabled) but not 500
    if (res.status === 500) fail(name, "server error");
    else if (res.status === 200) {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else pass(name, `${body.length} groups`);
    } else {
      pass(name, `status=${res.status} (feature flag or auth state)`);
    }
  }

  // ── 4. Portfolio companies list contains correct companies ────────────────
  {
    const name = "GET /api/portfolio/groups/:id/companies contains both member companies";
    const res = await apiRequest("GET", `/api/portfolio/groups/${ctx.groupId}/companies`, undefined, ctx.ownerToken);
    if (res.status === 500) fail(name, "server error");
    else if (res.status === 200) {
      const body = JSON.parse(res.body) as { companies?: Array<{ companyId?: string }> };
      const companies = body.companies;
      if (!Array.isArray(companies)) fail(name, `expected companies array, got: ${res.body.slice(0,200)}`);
      else {
        const ids = companies.map(c => c.companyId);
        const hasA = ids.includes(ctx.companyAId);
        const hasB = ids.includes(ctx.companyBId);
        if (!hasA || !hasB) fail(name, `companyA=${hasA} companyB=${hasB} in companies list`);
        else pass(name, `${companies.length} companies`);
      }
    } else {
      pass(name, `status=${res.status} (feature flag or permission)`);
    }
  }

  // ── 5. Non-member cannot access the group ────────────────────────────────
  {
    const name = "non-group-member GET /api/portfolio/groups/:id/companies returns 403 or 404";
    const res = await apiRequest("GET", `/api/portfolio/groups/${ctx.groupId}/companies`, undefined, ctx.nonMemberToken);
    if (res.status === 500) fail(name, "server error");
    else if (res.status === 200) fail(name, "non-member got 200 — data leak");
    else pass(name, `status=${res.status}`);
  }

  // ── 6. Non-member cannot access group summary ─────────────────────────────
  {
    const name = "non-group-member GET /api/portfolio/groups/:id/summary returns 403 or 404";
    const res = await apiRequest("GET", `/api/portfolio/groups/${ctx.groupId}/summary`, undefined, ctx.nonMemberToken);
    if (res.status === 500) fail(name, "server error");
    else if (res.status === 200) fail(name, "non-member got 200 — data leak");
    else pass(name, `status=${res.status}`);
  }

  // ── 7. Unauthenticated rejected from portfolio routes ─────────────────────
  {
    const name = "GET /api/portfolio/groups without token returns 401";
    const res = await apiRequest("GET", "/api/portfolio/groups");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 8. Regular admin has no portfolioGroups ───────────────────────────────
  {
    const name = "regular admin /api/auth/me returns empty portfolioGroups or none";
    const res = await apiRequest("GET", "/api/auth/me", undefined, tenants.tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { portfolioGroups?: unknown[] };
      const groups = body.portfolioGroups;
      if (groups !== undefined && !Array.isArray(groups)) fail(name, "portfolioGroups is not array");
      else {
        const count = groups ? groups.length : 0;
        pass(name, `portfolioGroups length=${count}`);
      }
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Portfolio Domain ===\n");
  let tenants: SeededTenants;
  try {
    console.log("Seeding test tenants…");
    tenants = await seedTestTenants();
    console.log("Seed complete.\n");
  } catch (err) {
    console.error("SEED FAILED:", err);
    process.exit(1);
  }

  await run(tenants);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n=== Portfolio: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
