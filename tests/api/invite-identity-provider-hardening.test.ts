/**
 * API regression: invite and identity-provider hardening
 *
 * Covers invitation create/resend/accept boundaries, invalidated invite tokens,
 * identity-provider tenant isolation, direct API access denial, and response
 * sanitization for tokens/secrets.
 *
 * Run: npx tsx tests/api/invite-identity-provider-hardening.test.ts
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Client } from "pg";
import { apiRequest, loginAndGetToken, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

const TEST_PASSWORD = "Test1234!";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string | void> | string | void) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

function expectStatus(res: { status: number; body: string }, expected: number | number[], context: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(allowed.includes(res.status), `${context} expected=${allowed.join("/")} got=${res.status} body=${res.body.slice(0, 500)}`);
}

function parseJson<T>(res: { status: number; body: string }, context: string): T {
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 500)}`);
  return JSON.parse(res.body) as T;
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function createInviteToken() {
  const plaintext = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, tokenHash };
}

async function insertInvitationToken(input: {
  companyId: string;
  email: string;
  role?: "admin" | "contributor" | "approver" | "viewer";
  inviteeName?: string | null;
  expiresAt?: Date;
  usedAt?: Date | null;
  metadataOverride?: Record<string, unknown>;
  invitedUserId?: string | null;
}) {
  return withDb(async (client) => {
    const companyRes = await client.query<{ name: string }>("SELECT name FROM companies WHERE id = $1", [input.companyId]);
    const { plaintext, tokenHash } = createInviteToken();
    const metadata = input.metadataOverride ?? {
      companyId: input.companyId,
      role: input.role ?? "contributor",
      inviteeName: input.inviteeName ?? null,
      companyName: companyRes.rows[0]?.name ?? "Test Company",
      invitedUserId: input.invitedUserId ?? null,
    };
    const res = await client.query<{ id: string }>(
      `INSERT INTO auth_tokens (token_hash, type, email, metadata, expires_at, used_at)
       VALUES ($1, 'invitation', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        tokenHash,
        input.email,
        JSON.stringify(metadata),
        input.expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000),
        input.usedAt ?? null,
      ],
    );
    return { plaintext, id: res.rows[0].id };
  });
}

async function getLatestInviteMetadata(email: string) {
  return withDb(async (client) => {
    const res = await client.query<{ id: string; metadata: any; used_at: Date | null }>(
      `SELECT id, metadata, used_at
       FROM auth_tokens
       WHERE email = $1 AND type = 'invitation'
       ORDER BY created_at DESC
       LIMIT 1`,
      [email],
    );
    return res.rows[0] ?? null;
  });
}

async function createUser(opts: {
  companyId: string | null;
  email: string;
  username: string;
  role: "admin" | "viewer" | "contributor" | "super_admin";
}) {
  return withDb(async (client) => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const res = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, password, role, company_id,
        terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), '1.0', '1.0')
       RETURNING id`,
      [opts.username, opts.email, hash, opts.role, opts.companyId],
    );
    return res.rows[0].id;
  });
}

async function getUserIdByEmail(email: string): Promise<string> {
  return withDb(async (client) => {
    const res = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    assert(res.rows[0]?.id, `missing user ${email}`);
    return res.rows[0].id;
  });
}

function assertNoRawSecrets(payload: unknown, secrets: string[], context: string) {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const secret of secrets) {
    assert(!serialized.includes(secret), `${context} leaked secret value ${secret}`);
  }
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();

  await check("invitation create endpoints enforce role and tenant boundaries without leaking tokens", async () => {
    expectStatus(
      await apiRequest("POST", "/api/users/invite", { email: `viewer-invite-${suffix}@test-esg.example`, role: "viewer" }, tenantA.viewerToken),
      403,
      "viewer POST /api/users/invite",
    );
    expectStatus(
      await apiRequest("POST", "/api/users/invite", { email: `contributor-invite-${suffix}@test-esg.example`, role: "viewer" }, tenantA.contributorToken),
      403,
      "contributor POST /api/users/invite",
    );
    expectStatus(
      await apiRequest("POST", `/api/companies/${tenantB.companyId}/invites`, { email: `cross-company-${suffix}@test-esg.example`, role: "viewer" }, tenantA.adminToken),
      403,
      "Tenant A admin POST Tenant B /api/companies/:id/invites",
    );

    const targetedEmail = `targeted-company-invite-${suffix}@test-esg.example`;
    const targetedCreate = await apiRequest("POST", `/api/companies/${tenantA.companyId}/invites`, {
      email: targetedEmail,
      role: "contributor",
      inviteeName: "Targeted Company Invite",
    }, tenantA.adminToken);
    expectStatus(targetedCreate, [200, 503], "Tenant A admin POST own /api/companies/:id/invites");
    assertNoRawSecrets(targetedCreate.body, ["token_hash", "plaintext", "invite-token"], "targeted company invite response");
    const targetedInvite = await getLatestInviteMetadata(targetedEmail);
    assert(targetedInvite, "expected auth token row for targeted company invite");
    assert(targetedInvite.metadata?.companyId === tenantA.companyId, "targeted invite recorded the wrong company");
    assert(typeof targetedInvite.metadata?.companyName === "string" && targetedInvite.metadata.companyName.length > 0, "targeted invite omitted company name");

    const scopedEmail = `scoped-invite-${suffix}@test-esg.example`;
    const scopedCreate = await apiRequest("POST", "/api/users/invite", {
      companyId: tenantB.companyId,
      email: scopedEmail,
      role: "viewer",
      inviteeName: "Scoped Invite",
    }, tenantA.adminToken);
    expectStatus(scopedCreate, [200, 503], "Tenant A admin POST /api/users/invite with foreign companyId");
    assertNoRawSecrets(scopedCreate.body, ["token_hash", "plaintext", "invite-token"], "invite create response");
    const createdInvite = await getLatestInviteMetadata(scopedEmail);
    assert(createdInvite, "expected auth token row for invite create attempt");
    assert(createdInvite.metadata?.companyId === tenantA.companyId, "non-super-admin invite honored foreign companyId");
    assert(createdInvite.metadata?.companyId !== tenantB.companyId, "invite was incorrectly scoped to Tenant B");

    const invalidRoleEmail = `invalid-role-${suffix}@test-esg.example`;
    expectStatus(
      await apiRequest("POST", "/api/users/invite", { email: invalidRoleEmail, role: "super_admin" }, tenantA.adminToken),
      400,
      "POST /api/users/invite invalid role",
    );
    assert(!(await getLatestInviteMetadata(invalidRoleEmail)), "invalid role invite created an auth token");
  });

  await check("invitation accept rejects expired, invalidated, malformed, and cross-tenant tokens safely", async () => {
    const validEmail = `valid-invite-${suffix}@test-esg.example`;
    const valid = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: validEmail,
      role: "viewer",
      inviteeName: "Valid Invite",
    });
    const invitation = parseJson<any>(
      await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(valid.plaintext)}`),
      "GET valid invitation",
    );
    assert(invitation.email === validEmail, "valid invitation returned wrong email");
    assert(invitation.role === "viewer", "valid invitation returned wrong role");
    assert(invitation.company?.id === tenantA.companyId, "valid invitation returned wrong company");
    assertNoRawSecrets(invitation, [valid.plaintext, valid.id, "token_hash"], "valid invitation lookup");

    const accepted = parseJson<any>(
      await apiRequest("POST", "/api/auth/accept-invitation", {
        token: valid.plaintext,
        password: "Welcome123!",
        confirmPassword: "Welcome123!",
      }),
      "POST accept valid invitation",
    );
    assert(accepted.user?.email === validEmail, "accepted invite returned wrong user email");
    assert(accepted.user?.companyId === tenantA.companyId, "accepted invite returned wrong company");
    assert(accepted.user?.role === "viewer", "accepted invite returned wrong role");
    assert(!("password" in (accepted.user ?? {})), "accepted invite response leaked password");
    assertNoRawSecrets(accepted, [valid.plaintext, "token_hash"], "accepted invite response");
    expectStatus(
      await apiRequest("POST", "/api/auth/accept-invitation", {
        token: valid.plaintext,
        password: "Welcome123!",
        confirmPassword: "Welcome123!",
      }),
      410,
      "reused accepted invitation",
    );

    const expired = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `expired-invite-${suffix}@test-esg.example`,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expectStatus(
      await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(expired.plaintext)}`),
      410,
      "GET expired invitation",
    );
    expectStatus(
      await apiRequest("POST", "/api/auth/accept-invitation", {
        token: expired.plaintext,
        password: "Welcome123!",
        confirmPassword: "Welcome123!",
      }),
      410,
      "POST expired invitation",
    );

    const revoked = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `revoked-invite-${suffix}@test-esg.example`,
      usedAt: new Date(),
      metadataOverride: {
        companyId: tenantA.companyId,
        role: "viewer",
        inviteeName: "Revoked Invite",
        revokedAt: new Date().toISOString(),
      },
    });
    expectStatus(
      await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(revoked.plaintext)}`),
      410,
      "GET revoked/inactivated invitation",
    );
    expectStatus(
      await apiRequest("POST", "/api/auth/accept-invitation", {
        token: revoked.plaintext,
        password: "Welcome123!",
        confirmPassword: "Welcome123!",
      }),
      410,
      "POST revoked/inactivated invitation",
    );

    expectStatus(
      await apiRequest("GET", "/api/auth/invitation?token=malformed-token-that-does-not-exist"),
      400,
      "GET unknown invitation token",
    );
    const malformedMetadata = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: `malformed-metadata-${suffix}@test-esg.example`,
      metadataOverride: { companyId: tenantA.companyId, role: "super_admin" },
    });
    expectStatus(
      await apiRequest("GET", `/api/auth/invitation?token=${encodeURIComponent(malformedMetadata.plaintext)}`),
      400,
      "GET invitation with malformed metadata",
    );

    const tenantBAdminUserId = await getUserIdByEmail(tenantB.adminEmail);
    const crossTenant = await insertInvitationToken({
      companyId: tenantA.companyId,
      email: tenantB.adminEmail,
      role: "admin",
      invitedUserId: tenantBAdminUserId,
    });
    const crossTenantAccept = await apiRequest("POST", "/api/auth/accept-invitation", {
      token: crossTenant.plaintext,
      password: "Welcome123!",
      confirmPassword: "Welcome123!",
    });
    expectStatus(crossTenantAccept, 409, "POST cross-tenant invitedUserId invitation");
    assertNoRawSecrets(crossTenantAccept.body, [crossTenant.plaintext, tenantB.companyId], "cross-tenant invite rejection");
  });

  await check("super-admin resend invite is scoped and sanitized", async () => {
    const superEmail = `invite-super-${suffix}@test-esg.example`;
    await createUser({
      companyId: null,
      email: superEmail,
      username: `invitesuper${suffix}`,
      role: "super_admin",
    });
    const superToken = await loginAndGetToken(superEmail, TEST_PASSWORD);
    const tenantAViewerId = await getUserIdByEmail(tenantA.viewerEmail);

    expectStatus(
      await apiRequest("POST", `/api/admin/company/${tenantA.companyId}/support/resend-invite`, { userId: tenantAViewerId }, tenantA.adminToken),
      403,
      "tenant admin POST support resend invite",
    );
    expectStatus(
      await apiRequest("POST", `/api/admin/company/${tenantA.companyId}/support/resend-invite`, { userId: tenantAViewerId }, tenantA.viewerToken),
      403,
      "viewer POST support resend invite",
    );
    expectStatus(
      await apiRequest("POST", `/api/admin/company/${tenantB.companyId}/support/resend-invite`, { userId: tenantAViewerId }, superToken),
      404,
      "super-admin resend Tenant A user under Tenant B",
    );

    const before = await getLatestInviteMetadata(tenantA.viewerEmail);
    const resend = await apiRequest(
      "POST",
      `/api/admin/company/${tenantA.companyId}/support/resend-invite`,
      { userId: tenantAViewerId },
      superToken,
    );
    expectStatus(resend, 200, "super-admin resend Tenant A invite");
    assertNoRawSecrets(resend.body, ["token_hash", "plaintext", "invite-token"], "resend invite response");
    const after = await getLatestInviteMetadata(tenantA.viewerEmail);
    assert(after, "expected auth token row after resend");
    assert(after.id !== before?.id, "resend did not create a fresh invitation token");
    assert(after.metadata?.companyId === tenantA.companyId, "resend invitation was not scoped to Tenant A");
  });

  await check("identity-provider APIs are admin-only, tenant-scoped, and sanitize secrets", async () => {
    const secretValues = [
      `client-secret-${suffix}`,
      `private-key-${suffix}`,
      `refresh-token-${suffix}`,
      `nested-password-${suffix}`,
    ];
    const tenantBSecret = `tenant-b-secret-${suffix}`;

    expectStatus(await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantA.viewerToken), 403, "viewer GET identity providers");
    expectStatus(await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantA.contributorToken), 403, "contributor GET identity providers");
    expectStatus(
      await apiRequest("POST", "/api/admin/identity-providers", { name: "blocked", providerType: "saml" }, tenantA.viewerToken),
      403,
      "viewer POST identity providers",
    );
    expectStatus(
      await apiRequest("POST", "/api/admin/identity-providers", { name: "blocked", providerType: "saml" }, tenantA.contributorToken),
      403,
      "contributor POST identity providers",
    );

    const tenantBProvider = parseJson<any>(
      await apiRequest("POST", "/api/admin/identity-providers", {
        name: `Tenant B IdP ${suffix}`,
        providerType: "saml",
        domain: `tenant-b-${suffix}.example.test`,
        config: { clientSecret: tenantBSecret, ssoUrl: "https://tenant-b-idp.example.test/sso" },
      }, tenantB.adminToken),
      "Tenant B POST identity provider",
    );
    assert(tenantBProvider.companyId === tenantB.companyId, "Tenant B identity provider created under wrong company");
    assertNoRawSecrets(tenantBProvider, [tenantBSecret], "Tenant B identity provider create response");

    const tenantAProvider = parseJson<any>(
      await apiRequest("POST", "/api/admin/identity-providers", {
        name: `Tenant A IdP ${suffix}`,
        providerType: "saml",
        domain: `tenant-a-${suffix}.example.test`,
        config: {
          entityId: "tenant-a-entity",
          clientSecret: secretValues[0],
          privateKey: secretValues[1],
          nested: {
            refreshToken: secretValues[2],
            password: secretValues[3],
          },
        },
      }, tenantA.adminToken),
      "Tenant A POST identity provider",
    );
    assert(tenantAProvider.companyId === tenantA.companyId, "Tenant A identity provider created under wrong company");
    assertNoRawSecrets(tenantAProvider, secretValues, "Tenant A identity provider create response");
    assert(tenantAProvider.config?.clientSecret === "[redacted]", "clientSecret was not redacted");
    assert(tenantAProvider.config?.privateKey === "[redacted]", "privateKey was not redacted");
    assert(tenantAProvider.config?.nested?.refreshToken === "[redacted]", "nested refreshToken was not redacted");
    assert(tenantAProvider.config?.nested?.password === "[redacted]", "nested password was not redacted");

    const tenantAList = parseJson<any[]>(
      await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantA.adminToken),
      "Tenant A GET identity providers",
    );
    const tenantBList = parseJson<any[]>(
      await apiRequest("GET", "/api/admin/identity-providers", undefined, tenantB.adminToken),
      "Tenant B GET identity providers",
    );
    assert(tenantAList.some((provider) => provider.id === tenantAProvider.id), "Tenant A list missing Tenant A provider");
    assert(!tenantAList.some((provider) => provider.id === tenantBProvider.id), "Tenant A list leaked Tenant B provider");
    assert(!JSON.stringify(tenantAList).includes(tenantBSecret), "Tenant A list leaked Tenant B provider secret");
    assertNoRawSecrets(tenantAList, secretValues, "Tenant A identity provider list");
    assert(tenantBList.some((provider) => provider.id === tenantBProvider.id), "Tenant B list missing Tenant B provider");
    assert(!tenantBList.some((provider) => provider.id === tenantAProvider.id), "Tenant B list leaked Tenant A provider");

    expectStatus(
      await apiRequest("PATCH", `/api/admin/identity-providers/${tenantBProvider.id}`, { name: "cross tenant update" }, tenantA.adminToken),
      404,
      "Tenant A PATCH Tenant B identity provider",
    );
    expectStatus(
      await apiRequest("DELETE", `/api/admin/identity-providers/${tenantBProvider.id}`, undefined, tenantA.adminToken),
      404,
      "Tenant A DELETE Tenant B identity provider",
    );

    const updatedSecret = `updated-secret-${suffix}`;
    const updated = parseJson<any>(
      await apiRequest("PATCH", `/api/admin/identity-providers/${tenantAProvider.id}`, {
        config: { clientSecret: updatedSecret, ssoUrl: "https://tenant-a-idp.example.test/sso" },
      }, tenantA.adminToken),
      "Tenant A PATCH identity provider",
    );
    assertNoRawSecrets(updated, [updatedSecret], "Tenant A identity provider patch response");

    const auditLogs = parseJson<any[]>(
      await apiRequest("GET", "/api/audit-logs?action=identity_provider_updated&entityType=identity_provider", undefined, tenantA.adminToken),
      "Tenant A identity provider audit logs",
    );
    assert(auditLogs.some((log) => log.entityId === tenantAProvider.id), "Tenant A audit logs missing identity provider update");
    assertNoRawSecrets(auditLogs, [updatedSecret], "Tenant A identity provider audit logs");
  });
}

(async () => {
  console.log("\n=== API Regression: Invite and Identity Provider Hardening ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("invite/identity-provider setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Invite and Identity Provider Hardening: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
