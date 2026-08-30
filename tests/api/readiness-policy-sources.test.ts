/**
 * Report-readiness policy-source regression.
 *
 * The platform has three historical policy stores. Readiness must treat any
 * adopted/published policy in the requesting tenant as satisfying the policy
 * requirement, without allowing draft, retired, or another tenant's rows to
 * do so.
 *
 * Run against an isolated acceptance server/database:
 *   BASE_URL=http://127.0.0.1:5031 DATABASE_URL=postgresql://... \
 *     node --import tsx tests/api/readiness-policy-sources.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ReadinessResponse = {
  missingCategories?: {
    policyNotPublished?: boolean;
  };
};

const results: Array<{ name: string; passed: boolean; detail?: string }> = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    const detail = error?.message || String(error);
    results.push({ name, passed: false, detail });
    console.error(`  FAIL  ${name} - ${detail}`);
  }
}

async function getPolicyNotPublished(token: string): Promise<boolean> {
  const response = await apiRequest("GET", "/api/reports/readiness-detail", undefined, token);
  assert.equal(response.status, 200, `readiness status=${response.status} body=${response.body.slice(0, 500)}`);
  const body = JSON.parse(response.body) as ReadinessResponse;
  assert.equal(
    typeof body.missingCategories?.policyNotPublished,
    "boolean",
    `missingCategories.policyNotPublished is not boolean: ${response.body.slice(0, 500)}`,
  );
  return body.missingCategories!.policyNotPublished!;
}

async function clearPolicySources(client: Client, companyIds: string[]) {
  await client.query("DELETE FROM policy_records WHERE company_id = ANY($1::varchar[])", [companyIds]);
  await client.query("DELETE FROM generated_policies WHERE company_id = ANY($1::varchar[])", [companyIds]);
  await client.query("DELETE FROM esg_policies WHERE company_id = ANY($1::varchar[])", [companyIds]);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const tenants = await seedTestTenants();
  const companyIds = [tenants.tenantA.companyId, tenants.tenantB.companyId];
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await clearPolicySources(client, companyIds);

    await check("readiness reports the policy requirement missing when no policy source is adopted", async () => {
      assert.equal(await getPolicyNotPublished(tenants.tenantA.adminToken), true);
    });

    await check("an active policy_records row satisfies the readiness policy requirement", async () => {
      await clearPolicySources(client, companyIds);
      await client.query(
        `INSERT INTO policy_records (id, company_id, title, policy_type, status)
         VALUES ($1, $2, $3, 'environmental', 'active')`,
        [randomUUID(), tenants.tenantA.companyId, `Active readiness policy ${randomUUID()}`],
      );
      assert.equal(await getPolicyNotPublished(tenants.tenantA.adminToken), false);
    });

    await check("a published generated_policies row with approved workflow satisfies readiness", async () => {
      await clearPolicySources(client, companyIds);
      await client.query(
        `INSERT INTO generated_policies
           (id, company_id, template_id, template_slug, title, status, content, workflow_status)
         VALUES ($1, $2, $3, $4, $5, 'published', '{}'::jsonb, 'approved')`,
        [
          randomUUID(),
          tenants.tenantA.companyId,
          randomUUID(),
          `readiness-template-${randomUUID()}`,
          `Published generated readiness policy ${randomUUID()}`,
        ],
      );
      assert.equal(await getPolicyNotPublished(tenants.tenantA.adminToken), false);
    });

    await check("a published legacy esg_policies row satisfies the readiness policy requirement", async () => {
      await clearPolicySources(client, companyIds);
      await client.query(
        `INSERT INTO esg_policies (id, company_id, status, published_at)
         VALUES ($1, $2, 'published', NOW())`,
        [randomUUID(), tenants.tenantA.companyId],
      );
      assert.equal(await getPolicyNotPublished(tenants.tenantA.adminToken), false);
    });

    await check("draft and retired policy rows do not satisfy the readiness policy requirement", async () => {
      await clearPolicySources(client, companyIds);
      await client.query(
        `INSERT INTO policy_records (id, company_id, title, policy_type, status)
         VALUES
           ($1, $3, 'Draft readiness record', 'other', 'draft'),
           ($2, $3, 'Retired readiness record', 'other', 'retired')`,
        [randomUUID(), randomUUID(), tenants.tenantA.companyId],
      );
      await client.query(
        `INSERT INTO generated_policies
           (id, company_id, template_id, template_slug, title, status, content, workflow_status)
         VALUES ($1, $2, $3, $4, 'Draft generated readiness policy', 'draft', '{}'::jsonb, 'draft')`,
        [randomUUID(), tenants.tenantA.companyId, randomUUID(), `readiness-draft-${randomUUID()}`],
      );
      await client.query(
        `INSERT INTO esg_policies (id, company_id, status)
         VALUES ($1, $2, 'draft')`,
        [randomUUID(), tenants.tenantA.companyId],
      );
      assert.equal(await getPolicyNotPublished(tenants.tenantA.adminToken), true);
    });

    await check("another tenant's published policies do not satisfy readiness", async () => {
      await clearPolicySources(client, companyIds);
      await client.query(
        `INSERT INTO policy_records (id, company_id, title, policy_type, status)
         VALUES ($1, $2, 'Foreign active readiness policy', 'other', 'active')`,
        [randomUUID(), tenants.tenantB.companyId],
      );
      await client.query(
        `INSERT INTO generated_policies
           (id, company_id, template_id, template_slug, title, status, content, workflow_status)
         VALUES ($1, $2, $3, $4, 'Foreign published generated policy', 'published', '{}'::jsonb, 'approved')`,
        [randomUUID(), tenants.tenantB.companyId, randomUUID(), `foreign-readiness-${randomUUID()}`],
      );
      await client.query(
        `INSERT INTO esg_policies (id, company_id, status, published_at)
         VALUES ($1, $2, 'published', NOW())`,
        [randomUUID(), tenants.tenantB.companyId],
      );
      assert.equal(await getPolicyNotPublished(tenants.tenantA.adminToken), true);
    });
  } finally {
    await clearPolicySources(client, companyIds).catch(() => undefined);
    await client.end();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\nReadiness policy sources API: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
