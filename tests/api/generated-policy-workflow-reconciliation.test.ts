/**
 * Legacy generated-policy workflow reconciliation regression.
 *
 * Run after a fresh acceptance-server startup has completed its own global
 * reconciliation pass. This keeps the first explicit invocation deterministic:
 * only the unique fixtures created below remain eligible.
 *
 *   DATABASE_URL=postgresql://... \
 *     node --import tsx tests/api/generated-policy-workflow-reconciliation.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { reconcileLegacyGeneratedPolicyWorkflowStates } from "../../server/policy-workflow-reconciliation.js";
import { pool } from "../../server/storage.js";

type PolicyState = {
  id: string;
  status: string | null;
  workflow_status: string | null;
  approved_at: Date | null;
  reviewed_at: Date | null;
};

type AuditState = {
  entity_id: string;
  company_id: string | null;
  user_id: string | null;
  actor_type: string | null;
  action: string;
  entity_type: string | null;
  details: Record<string, unknown> | null;
};

const ACTION = "Generated policy workflow reconciled";
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

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const companyId = randomUUID();
  const templateId = randomUUID();
  const templateSlug = `legacy-workflow-reconciliation-${randomUUID()}`;
  const eligibleApproved = randomUUID();
  const eligiblePublished = randomUUID();
  const approvedWithoutTimestamp = randomUUID();
  const publishedWithoutTimestamp = randomUUID();
  const draftWithApprovalTimestamp = randomUUID();
  const rejectedApprovedPolicy = randomUUID();
  const alreadyWorkflowApproved = randomUUID();
  const allPolicyIds = [
    eligibleApproved,
    eligiblePublished,
    approvedWithoutTimestamp,
    publishedWithoutTimestamp,
    draftWithApprovalTimestamp,
    rejectedApprovedPolicy,
    alreadyWorkflowApproved,
  ];

  try {
    await client.query(
      "INSERT INTO companies (id, name, onboarding_complete) VALUES ($1, $2, true)",
      [companyId, `Policy reconciliation fixture ${randomUUID()}`],
    );
    await client.query(
      `INSERT INTO generated_policies
         (id, company_id, template_id, template_slug, title, status, workflow_status, approved_at, reviewed_at, content)
       VALUES
         ($1, $8, $9, $10, 'Eligible approved policy', 'approved', 'draft', TIMESTAMP '2026-01-02 10:00:00', NULL, '{}'::jsonb),
         ($2, $8, $9, $10, 'Eligible published policy', 'published', 'draft', TIMESTAMP '2026-02-03 11:00:00', NULL, '{}'::jsonb),
         ($3, $8, $9, $10, 'Approved without evidence', 'approved', 'draft', NULL, NULL, '{}'::jsonb),
         ($4, $8, $9, $10, 'Published without evidence', 'published', 'draft', NULL, NULL, '{}'::jsonb),
         ($5, $8, $9, $10, 'Draft with stale approval timestamp', 'draft', 'draft', TIMESTAMP '2026-03-04 12:00:00', NULL, '{}'::jsonb),
         ($6, $8, $9, $10, 'Explicitly rejected approved policy', 'approved', 'rejected', TIMESTAMP '2026-04-05 13:00:00', NULL, '{}'::jsonb),
         ($7, $8, $9, $10, 'Already workflow approved', 'approved', 'approved', TIMESTAMP '2026-05-06 14:00:00', TIMESTAMP '2026-05-06 14:00:00', '{}'::jsonb)`,
      [
        eligibleApproved,
        eligiblePublished,
        approvedWithoutTimestamp,
        publishedWithoutTimestamp,
        draftWithApprovalTimestamp,
        rejectedApprovedPolicy,
        alreadyWorkflowApproved,
        companyId,
        templateId,
        templateSlug,
      ],
    );

    await check("only unambiguously approved legacy rows are repaired", async () => {
      const repaired = await reconcileLegacyGeneratedPolicyWorkflowStates();
      assert.equal(repaired, 2);

      const state = await client.query<PolicyState>(
        `SELECT id, status, workflow_status, approved_at, reviewed_at
         FROM generated_policies WHERE id = ANY($1::varchar[])`,
        [[eligibleApproved, eligiblePublished]],
      );
      assert.equal(state.rows.length, 2);
      for (const row of state.rows) {
        assert.equal(row.workflow_status, "approved");
        assert.ok(row.approved_at);
        assert.ok(row.reviewed_at);
        assert.equal(row.reviewed_at!.getTime(), row.approved_at!.getTime());
      }
      assert.equal(state.rows.find((row) => row.id === eligibleApproved)?.status, "approved");
      assert.equal(state.rows.find((row) => row.id === eligiblePublished)?.status, "published");
    });

    await check("each repaired policy receives exactly one system audit record", async () => {
      const audits = await client.query<AuditState>(
        `SELECT entity_id, company_id, user_id, actor_type, action, entity_type, details
         FROM audit_logs
         WHERE entity_id = ANY($1::varchar[]) AND action = $2
         ORDER BY entity_id`,
        [[eligibleApproved, eligiblePublished], ACTION],
      );
      assert.equal(audits.rows.length, 2);
      assert.deepEqual(new Set(audits.rows.map((row) => row.entity_id)), new Set([eligibleApproved, eligiblePublished]));

      for (const audit of audits.rows) {
        assert.equal(audit.company_id, companyId);
        assert.equal(audit.user_id, null);
        assert.equal(audit.actor_type, "system");
        assert.equal(audit.entity_type, "generated_policy");
        assert.equal(audit.details?.reason, "legacy_direct_approval_reconciliation");
        assert.equal(audit.details?.fromWorkflowStatus, "draft");
        assert.equal(audit.details?.toWorkflowStatus, "approved");
        const expectedBusinessStatus = audit.entity_id === eligibleApproved ? "approved" : "published";
        assert.equal(audit.details?.businessStatus, expectedBusinessStatus);
      }
    });

    await check("ambiguous, draft, rejected and already-correct policies remain untouched", async () => {
      const state = await client.query<PolicyState>(
        `SELECT id, status, workflow_status, approved_at, reviewed_at
         FROM generated_policies
         WHERE id = ANY($1::varchar[])`,
        [[
          approvedWithoutTimestamp,
          publishedWithoutTimestamp,
          draftWithApprovalTimestamp,
          rejectedApprovedPolicy,
          alreadyWorkflowApproved,
        ]],
      );
      const byId = new Map(state.rows.map((row) => [row.id, row]));
      assert.equal(byId.get(approvedWithoutTimestamp)?.workflow_status, "draft");
      assert.equal(byId.get(publishedWithoutTimestamp)?.workflow_status, "draft");
      assert.equal(byId.get(draftWithApprovalTimestamp)?.status, "draft");
      assert.equal(byId.get(draftWithApprovalTimestamp)?.workflow_status, "draft");
      assert.equal(byId.get(rejectedApprovedPolicy)?.workflow_status, "rejected");
      assert.equal(byId.get(alreadyWorkflowApproved)?.workflow_status, "approved");
      for (const id of [
        approvedWithoutTimestamp,
        publishedWithoutTimestamp,
        draftWithApprovalTimestamp,
        rejectedApprovedPolicy,
      ]) {
        assert.equal(byId.get(id)?.reviewed_at, null);
      }

      const unexpectedAudits = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_logs
         WHERE entity_id = ANY($1::varchar[]) AND action = $2`,
        [[
          approvedWithoutTimestamp,
          publishedWithoutTimestamp,
          draftWithApprovalTimestamp,
          rejectedApprovedPolicy,
          alreadyWorkflowApproved,
        ], ACTION],
      );
      assert.equal(Number(unexpectedAudits.rows[0].count), 0);
    });

    await check("a second reconciliation is a strict no-op", async () => {
      assert.equal(await reconcileLegacyGeneratedPolicyWorkflowStates(), 0);
      const audits = await client.query<{ entity_id: string; count: string }>(
        `SELECT entity_id, COUNT(*)::text AS count
         FROM audit_logs
         WHERE entity_id = ANY($1::varchar[]) AND action = $2
         GROUP BY entity_id
         ORDER BY entity_id`,
        [[eligibleApproved, eligiblePublished], ACTION],
      );
      assert.equal(audits.rows.length, 2);
      assert.ok(audits.rows.every((row) => Number(row.count) === 1));
    });
  } finally {
    await client.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::varchar[])", [allPolicyIds]).catch(() => undefined);
    await client.query("DELETE FROM generated_policies WHERE id = ANY($1::varchar[])", [allPolicyIds]).catch(() => undefined);
    await client.query("DELETE FROM companies WHERE id = $1", [companyId]).catch(() => undefined);
    await client.end();
    await pool.end();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\nGenerated policy workflow reconciliation: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
