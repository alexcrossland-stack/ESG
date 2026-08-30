/**
 * Generated-policy optimistic concurrency regression.
 *
 * The public update request stays backward compatible. The route reads the
 * current workflow and business statuses, validates the requested change, and
 * passes those values to storage as compare-and-swap preconditions. Storage
 * must update only if both persisted statuses still match. This file exercises
 * stale snapshots deterministically at the storage boundary, while keeping
 * lifecycle-transition rules covered through the API.
 *
 * Run against an isolated acceptance server/database:
 *   BASE_URL=http://127.0.0.1:5032 DATABASE_URL=postgresql://... \
 *     node --import tsx tests/api/generated-policy-cas.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { pool, storage } from "../../server/storage.js";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type PolicyRow = {
  title: string;
  status: "draft" | "approved" | "published" | null;
  workflow_status: "draft" | "submitted" | "approved" | "rejected" | "archived" | null;
  content: Record<string, unknown> | null;
};

const createdIds: string[] = [];
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

function expectStatus(
  response: { status: number; body: string },
  expected: number,
  context: string,
) {
  assert.equal(response.status, expected, `${context}: ${response.body.slice(0, 500)}`);
}

async function insertPolicy(
  client: Client,
  input: {
    companyId: string;
    templateId: string;
    templateSlug: string;
    title: string;
    nullLegacyStatuses?: boolean;
  },
) {
  const id = randomUUID();
  createdIds.push(id);
  await client.query(
    `INSERT INTO generated_policies
       (id, company_id, template_id, template_slug, title, status, content, workflow_status)
     VALUES ($1, $2, $3, $4, $5,
       CASE WHEN $6::boolean THEN NULL ELSE 'draft'::policy_template_status END,
       '{"purpose":"Original content"}'::jsonb,
       CASE WHEN $6::boolean THEN NULL ELSE 'draft'::workflow_status END)`,
    [id, input.companyId, input.templateId, input.templateSlug, input.title, input.nullLegacyStatuses === true],
  );
  return id;
}

async function policyRow(client: Client, id: string): Promise<PolicyRow> {
  const result = await client.query<PolicyRow>(
    "SELECT title, status, workflow_status, content FROM generated_policies WHERE id = $1",
    [id],
  );
  assert.equal(result.rows.length, 1, `generated policy ${id} missing`);
  return result.rows[0];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const tenants = await seedTestTenants();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const template = (await client.query<{ id: string; slug: string }>(
      "SELECT id, slug FROM policy_templates WHERE COALESCE(enabled, true) = true ORDER BY slug LIMIT 1",
    )).rows[0];
    assert.ok(template, "policy template fixture missing");

    const submitRacePolicy = await insertPolicy(client, {
      companyId: tenants.tenantA.companyId,
      templateId: template.id,
      templateSlug: template.slug,
      title: `Submit race ${randomUUID()}`,
    });
    const reviseRacePolicy = await insertPolicy(client, {
      companyId: tenants.tenantA.companyId,
      templateId: template.id,
      templateSlug: template.slug,
      title: `Revise race ${randomUUID()}`,
    });
    const publishRacePolicy = await insertPolicy(client, {
      companyId: tenants.tenantA.companyId,
      templateId: template.id,
      templateSlug: template.slug,
      title: `Publish race ${randomUUID()}`,
    });
    const legacyNullPolicy = await insertPolicy(client, {
      companyId: tenants.tenantA.companyId,
      templateId: template.id,
      templateSlug: template.slug,
      title: `Legacy null status ${randomUUID()}`,
      nullLegacyStatuses: true,
    });

    await check("a stale draft edit cannot mutate a policy after submission wins", async () => {
      const before = await policyRow(client, submitRacePolicy);
      assert.equal(before.workflow_status, "draft");
      assert.equal(before.status, "draft");

      expectStatus(await apiRequest("POST", "/api/workflow/submit", {
        entityType: "generated_policy",
        entityIds: [submitRacePolicy],
      }, tenants.tenantA.adminToken), 200, "submit generated policy");

      const staleUpdate = await storage.updateGeneratedPolicy(
        submitRacePolicy,
        tenants.tenantA.companyId,
        { content: { purpose: "Stale edit after submission" } },
        { expectedWorkflowStatus: "draft", expectedStatus: "draft" },
      );
      assert.equal(staleUpdate, undefined, "stale draft update unexpectedly mutated the submitted policy");

      const after = await policyRow(client, submitRacePolicy);
      assert.equal(after.workflow_status, "submitted");
      assert.deepEqual(after.content, { purpose: "Original content" });
    });

    await check("a stale rejected edit cannot mutate a policy after revision wins", async () => {
      expectStatus(await apiRequest("POST", "/api/workflow/submit", {
        entityType: "generated_policy",
        entityIds: [reviseRacePolicy],
      }, tenants.tenantA.adminToken), 200, "submit policy for rejection");
      expectStatus(await apiRequest("POST", "/api/workflow/review", {
        entityType: "generated_policy",
        entityId: reviseRacePolicy,
        action: "reject",
        comment: "Clarify the operational owner",
      }, tenants.tenantA.adminToken), 200, "reject generated policy");

      const rejectedSnapshot = await policyRow(client, reviseRacePolicy);
      assert.equal(rejectedSnapshot.workflow_status, "rejected");
      assert.equal(rejectedSnapshot.status, "draft");
      expectStatus(await apiRequest("POST", "/api/workflow/revise", {
        entityType: "generated_policy",
        entityId: reviseRacePolicy,
      }, tenants.tenantA.adminToken), 200, "start rejected-policy revision");

      const staleUpdate = await storage.updateGeneratedPolicy(
        reviseRacePolicy,
        tenants.tenantA.companyId,
        { title: "Stale rejected title" },
        { expectedWorkflowStatus: "rejected", expectedStatus: "draft" },
      );
      assert.equal(staleUpdate, undefined, "stale rejected update unexpectedly mutated the revised policy");

      const after = await policyRow(client, reviseRacePolicy);
      assert.equal(after.workflow_status, "draft");
      assert.equal(after.status, "draft");
      assert.equal(after.title, rejectedSnapshot.title);
    });

    await check("publish defeats stale approved edits and all backward status updates", async () => {
      expectStatus(await apiRequest("POST", "/api/workflow/submit", {
        entityType: "generated_policy",
        entityIds: [publishRacePolicy],
      }, tenants.tenantA.adminToken), 200, "submit policy for approval");
      expectStatus(await apiRequest("POST", "/api/workflow/review", {
        entityType: "generated_policy",
        entityId: publishRacePolicy,
        action: "approve",
      }, tenants.tenantA.adminToken), 200, "approve generated policy");

      const approvedSnapshot = await policyRow(client, publishRacePolicy);
      assert.equal(approvedSnapshot.workflow_status, "approved");
      assert.equal(approvedSnapshot.status, "approved");
      expectStatus(await apiRequest("PUT", `/api/generated-policies/${publishRacePolicy}`, {
        status: "published",
      }, tenants.tenantA.adminToken), 200, "publish approved policy");

      const staleUpdate = await storage.updateGeneratedPolicy(
        publishRacePolicy,
        tenants.tenantA.companyId,
        { title: "Stale approved title" },
        { expectedWorkflowStatus: "approved", expectedStatus: "approved" },
      );
      assert.equal(staleUpdate, undefined, "stale approved update unexpectedly mutated the published policy");

      for (const backwardStatus of ["approved", "draft"] as const) {
        const downgrade = await apiRequest("PUT", `/api/generated-policies/${publishRacePolicy}`, {
          status: backwardStatus,
        }, tenants.tenantA.adminToken);
        expectStatus(downgrade, 409, `published-to-${backwardStatus} downgrade`);
        const error = JSON.parse(downgrade.body) as { code?: string };
        assert.equal(error.code, "POLICY_REVISION_REQUIRED");
      }

      const after = await policyRow(client, publishRacePolicy);
      assert.equal(after.workflow_status, "approved");
      assert.equal(after.status, "published");
      assert.equal(after.title, approvedSnapshot.title);
    });

    await check("controlled revision defeats stale published edits and reopens draft editing", async () => {
      const publishedSnapshot = await policyRow(client, publishRacePolicy);
      assert.equal(publishedSnapshot.workflow_status, "approved");
      assert.equal(publishedSnapshot.status, "published");

      expectStatus(await apiRequest("POST", "/api/workflow/revise", {
        entityType: "generated_policy",
        entityId: publishRacePolicy,
      }, tenants.tenantA.adminToken), 200, "start published-policy revision");

      const staleUpdate = await storage.updateGeneratedPolicy(
        publishRacePolicy,
        tenants.tenantA.companyId,
        { title: "Stale published title" },
        { expectedWorkflowStatus: "approved", expectedStatus: "published" },
      );
      assert.equal(staleUpdate, undefined, "stale published update unexpectedly mutated the new revision");

      const revised = await policyRow(client, publishRacePolicy);
      assert.equal(revised.workflow_status, "draft");
      assert.equal(revised.status, "draft");
      assert.equal(revised.title, publishedSnapshot.title);

      expectStatus(await apiRequest("PUT", `/api/generated-policies/${publishRacePolicy}`, {
        title: "Controlled revision title",
      }, tenants.tenantA.adminToken), 200, "edit controlled draft revision");
      assert.equal((await policyRow(client, publishRacePolicy)).title, "Controlled revision title");
    });

    await check("legacy null statuses compare as draft without weakening stale-state protection", async () => {
      const currentUpdate = await storage.updateGeneratedPolicy(
        legacyNullPolicy,
        tenants.tenantA.companyId,
        { title: "Legacy draft updated" },
        { expectedWorkflowStatus: "draft", expectedStatus: "draft" },
      );
      assert.ok(currentUpdate, "null legacy statuses were not normalized to draft for CAS");
      assert.equal((await policyRow(client, legacyNullPolicy)).title, "Legacy draft updated");

      await client.query(
        "UPDATE generated_policies SET workflow_status = 'submitted' WHERE id = $1",
        [legacyNullPolicy],
      );
      const staleUpdate = await storage.updateGeneratedPolicy(
        legacyNullPolicy,
        tenants.tenantA.companyId,
        { title: "Legacy stale title" },
        { expectedWorkflowStatus: "draft", expectedStatus: "draft" },
      );
      assert.equal(staleUpdate, undefined);
      assert.equal((await policyRow(client, legacyNullPolicy)).title, "Legacy draft updated");
    });
  } finally {
    if (createdIds.length > 0) {
      await client.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::varchar[])", [createdIds]);
      await client.query("DELETE FROM generated_policies WHERE id = ANY($1::varchar[])", [createdIds]);
    }
    await client.end();
    await pool.end();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\nGenerated policy CAS API: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
