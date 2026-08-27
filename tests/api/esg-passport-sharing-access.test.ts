/**
 * API regression: authenticated ESG Passport sharing access.
 *
 * Run: npx tsx tests/api/esg-passport-sharing-access.test.ts
 */

import { Client } from "pg";

import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function check(name: string, condition: unknown, detail?: string) {
  if (condition) {
    results.push({ name, passed: true, detail });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    results.push({ name, passed: false, detail });
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function parseJson(response: { status: number; body: string }) {
  try {
    return JSON.parse(response.body) as any;
  } catch {
    return {};
  }
}

async function main() {
  console.log("\n=== API: ESG Passport sharing access ===\n");
  let client: Client | null = null;

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL env var not set");
    const tenants = await seedTestTenants();
    const initialToken = `passport-access-${Date.now()}`;

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("DELETE FROM access_grants WHERE company_id = $1", [tenants.tenantA.companyId]);
    await client.query(
      `UPDATE companies
       SET plan_tier = 'free',
           plan_status = 'active',
           is_beta_company = false,
           beta_expires_at = NULL,
           profile_share_enabled = true,
           profile_share_token = $2,
           profile_share_expires_at = NOW() + INTERVAL '30 days',
           profile_visible_sections = '["passport_summary"]'::jsonb
       WHERE id = $1`,
      [tenants.tenantA.companyId, initialToken],
    );

    const freeAdminProfile = await apiRequest(
      "GET",
      "/api/company/esg-profile",
      undefined,
      tenants.tenantA.adminToken,
    );
    const freeAdminPayload = parseJson(freeAdminProfile);
    check("free admin can review the private Passport", freeAdminProfile.status === 200, `status=${freeAdminProfile.status}`);
    check(
      "free admin response redacts the live share token",
      freeAdminPayload.shareSettings?.token == null && !freeAdminProfile.body.includes(initialToken),
    );

    const freeAdminShare = await apiRequest(
      "POST",
      "/api/company/esg-profile/share",
      { enabled: true, expiresInDays: 30, visibleSections: ["passport_summary"] },
      tenants.tenantA.adminToken,
    );
    check(
      "free admin cannot create a public share token",
      freeAdminShare.status === 403 && parseJson(freeAdminShare).code === "UPGRADE_REQUIRED",
      `status=${freeAdminShare.status}`,
    );

    const freeViewerProfile = await apiRequest(
      "GET",
      "/api/company/esg-profile",
      undefined,
      tenants.tenantA.viewerToken,
    );
    check(
      "viewer can review the private Passport without receiving the token",
      freeViewerProfile.status === 200
        && parseJson(freeViewerProfile).shareSettings?.token == null
        && !freeViewerProfile.body.includes(initialToken),
      `status=${freeViewerProfile.status}`,
    );

    await client.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
      [tenants.tenantA.companyId],
    );

    const proViewerProfile = await apiRequest(
      "GET",
      "/api/company/esg-profile",
      undefined,
      tenants.tenantA.viewerToken,
    );
    check(
      "Pro viewer still cannot receive the live share token",
      proViewerProfile.status === 200
        && parseJson(proViewerProfile).shareSettings?.token == null
        && !proViewerProfile.body.includes(initialToken),
      `status=${proViewerProfile.status}`,
    );

    const proViewerShare = await apiRequest(
      "POST",
      "/api/company/esg-profile/share",
      { enabled: true, expiresInDays: 30, visibleSections: ["passport_summary"] },
      tenants.tenantA.viewerToken,
    );
    check(
      "Pro viewer cannot mutate Passport sharing",
      proViewerShare.status === 403 && parseJson(proViewerShare).code === "PERMISSION_DENIED",
      `status=${proViewerShare.status}`,
    );

    const proAdminProfile = await apiRequest(
      "GET",
      "/api/company/esg-profile",
      undefined,
      tenants.tenantA.adminToken,
    );
    check(
      "Pro admin receives the active live token",
      proAdminProfile.status === 200 && parseJson(proAdminProfile).shareSettings?.token === initialToken,
      `status=${proAdminProfile.status}`,
    );

    const proAdminShare = await apiRequest(
      "POST",
      "/api/company/esg-profile/share",
      { enabled: true, expiresInDays: 30, visibleSections: ["passport_summary"] },
      tenants.tenantA.adminToken,
    );
    const sharePayload = parseJson(proAdminShare);
    check(
      "Pro admin can publish and receive a new live token",
      proAdminShare.status === 200
        && typeof sharePayload.token === "string"
        && sharePayload.token.length > 0
        && sharePayload.token !== initialToken,
      `status=${proAdminShare.status}`,
    );

    const rotated = await apiRequest(
      "POST",
      "/api/company/esg-profile/rotate-token",
      undefined,
      tenants.tenantA.adminToken,
    );
    const rotatedPayload = parseJson(rotated);
    check(
      "Pro admin can rotate the live token",
      rotated.status === 200
        && typeof rotatedPayload.token === "string"
        && rotatedPayload.token.length > 0
        && rotatedPayload.token !== sharePayload.token,
      `status=${rotated.status}`,
    );

    const refreshedAdminProfile = await apiRequest(
      "GET",
      "/api/company/esg-profile",
      undefined,
      tenants.tenantA.adminToken,
    );
    check(
      "only the newly rotated token is returned to the Pro admin",
      refreshedAdminProfile.status === 200
        && parseJson(refreshedAdminProfile).shareSettings?.token === rotatedPayload.token
        && !refreshedAdminProfile.body.includes(sharePayload.token),
    );

    const publicProfile = await apiRequest(
      "GET",
      `/api/company/esg-profile/public/${encodeURIComponent(rotatedPayload.token || "missing")}`,
    );
    const publicPayload = parseJson(publicProfile);
    check(
      "public Passport rendering remains available without authentication",
      publicProfile.status === 200
        && publicPayload.passport?.title === "SME ESG Passport"
        && publicPayload.shareSettings === undefined
        && !publicProfile.body.includes(rotatedPayload.token),
      `status=${publicProfile.status}`,
    );
  } catch (error: any) {
    check("Passport sharing access test setup", false, error?.message || String(error));
  } finally {
    await client?.end().catch(() => {});
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`\n=== ESG Passport sharing access: ${passed}/${results.length} passed ===\n`);
  if (passed !== results.length) process.exit(1);
}

main();
