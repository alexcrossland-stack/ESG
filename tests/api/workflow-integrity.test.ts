/**
 * Workflow integrity API regression.
 *
 * Run against an isolated acceptance server/database:
 *   BASE_URL=http://127.0.0.1:5051 DATABASE_URL=postgresql://... \
 *     node --import tsx tests/api/workflow-integrity.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };
type SubmitResult = {
  requested: number;
  unique: number;
  duplicates: number;
  submitted: number;
  alreadySubmitted: number;
  alreadyApproved: number;
  ineligible: number;
  notFound: number;
};
type BulkReviewResult = {
  requested: number;
  unique: number;
  duplicates: number;
  reviewed: number;
  notSubmitted: number;
  notFound: number;
};

const createdIds: string[] = [];
const results: Array<{ name: string; passed: boolean; detail?: string }> = [];

function json<T>(response: ApiResponse, status = 200): T {
  assert.equal(response.status, status, `expected ${status}, got ${response.status}: ${response.body.slice(0, 500)}`);
  return JSON.parse(response.body) as T;
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, detail: error?.message || String(error) });
    console.error(`  FAIL  ${name} - ${error?.message || String(error)}`);
  }
}

async function insertMetricValue(
  client: Client,
  metricId: string,
  status: "draft" | "submitted" | "approved" | "rejected" | "archived",
  suffix: string,
  reviewComment?: string,
) {
  const id = randomUUID();
  createdIds.push(id);
  await client.query(
    `INSERT INTO metric_values
       (id, metric_id, period, value, workflow_status, review_comment, submitted_at)
     VALUES ($1, $2, $3, 1, $4::workflow_status, $5, CASE WHEN $4::workflow_status = 'draft' THEN NULL ELSE NOW() END)`,
    [id, metricId, `2098-${suffix}-${id.slice(0, 8)}`, status, reviewComment || null],
  );
  return id;
}

async function insertRawData(
  client: Client,
  companyId: string,
  status: "draft" | "submitted" | "approved" | "rejected" | "archived",
  suffix: string,
  reviewComment?: string,
) {
  const id = randomUUID();
  createdIds.push(id);
  await client.query(
    `INSERT INTO raw_data_inputs
       (id, company_id, input_name, input_category, value, period, workflow_status, review_comment, submitted_at)
     VALUES ($1, $2, $3, 'environmental', 1, $4, $5::workflow_status, $6, CASE WHEN $5::workflow_status = 'draft' THEN NULL ELSE NOW() END)`,
    [id, companyId, `workflow_${suffix}_${id}`, `2098-${suffix}-${id.slice(0, 8)}`, status, reviewComment || null],
  );
  return id;
}

async function statusOf(client: Client, table: "metric_values" | "raw_data_inputs", id: string) {
  const result = await client.query<{ workflow_status: string; review_comment: string | null }>(
    `SELECT workflow_status, review_comment FROM ${table} WHERE id = $1`,
    [id],
  );
  assert.equal(result.rows.length, 1, `${table}:${id} missing`);
  return result.rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const tenants = await seedTestTenants();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const tenantAMetric = (await client.query<{ id: string }>(
      "SELECT id FROM metrics WHERE company_id = $1 ORDER BY id LIMIT 1",
      [tenants.tenantA.companyId],
    )).rows[0]?.id;
    assert.ok(tenantAMetric, "tenant A metric fixture missing");

    const invalidDraft = await insertMetricValue(client, tenantAMetric, "draft", "01");
    const submitDraft = await insertMetricValue(client, tenantAMetric, "draft", "02");
    const submitRejected = await insertMetricValue(client, tenantAMetric, "rejected", "03", "Correct this value");
    const submitSubmitted = await insertMetricValue(client, tenantAMetric, "submitted", "04");
    const submitApproved = await insertMetricValue(client, tenantAMetric, "approved", "05");
    const submitArchived = await insertMetricValue(client, tenantAMetric, "archived", "06");
    const foreignDraft = await insertMetricValue(client, tenants.tenantB.metricId, "draft", "07");
    const raceSubmitted = await insertMetricValue(client, tenantAMetric, "submitted", "08");
    const bulkSubmittedOne = await insertMetricValue(client, tenantAMetric, "submitted", "09");
    const bulkSubmittedTwo = await insertMetricValue(client, tenantAMetric, "submitted", "10");
    const bulkApproved = await insertMetricValue(client, tenantAMetric, "approved", "11");
    const reviseRejected = await insertMetricValue(client, tenantAMetric, "rejected", "12", "Use the invoice total");
    const reviseApproved = await insertMetricValue(client, tenantAMetric, "approved", "01");
    const reviseForeignRejected = await insertMetricValue(client, tenants.tenantB.metricId, "rejected", "02", "Foreign feedback");
    const reviseRawRejected = await insertRawData(client, tenants.tenantA.companyId, "rejected", "03", "Recheck the utility bill");
    const mixedMetricDraft = await insertMetricValue(client, tenantAMetric, "draft", "13");
    const mixedRawDraft = await insertRawData(client, tenants.tenantA.companyId, "draft", "13");
    const invalidMixedMetricDraft = await insertMetricValue(client, tenantAMetric, "draft", "14");
    const invalidMixedRawDraft = await insertRawData(client, tenants.tenantA.companyId, "draft", "14");
    const concurrentMixedMetricDraft = await insertMetricValue(client, tenantAMetric, "draft", "15");
    const concurrentMixedRawDraft = await insertRawData(client, tenants.tenantA.companyId, "draft", "15");
    const missingId = randomUUID();

    await check("submit validates every ID before changing any row", async () => {
      const response = await apiRequest("POST", "/api/workflow/submit", {
        entityType: "metric_value",
        entityIds: [invalidDraft, 42],
      }, tenants.tenantA.contributorToken);
      assert.equal(response.status, 400, response.body);
      assert.equal((await statusOf(client, "metric_values", invalidDraft)).workflow_status, "draft");

      const extraField = await apiRequest("POST", "/api/workflow/submit", {
        entityType: "metric_value",
        entityIds: [invalidDraft],
        unexpected: true,
      }, tenants.tenantA.contributorToken);
      assert.equal(extraField.status, 400, extraField.body);
      assert.equal((await statusOf(client, "metric_values", invalidDraft)).workflow_status, "draft");
    });

    await check("workflow RBAC separates data contribution from review authority", async () => {
      const viewerSubmit = await apiRequest("POST", "/api/workflow/submit", {
        entityType: "metric_value",
        entityIds: [invalidDraft],
      }, tenants.tenantA.viewerToken);
      assert.equal(viewerSubmit.status, 403, viewerSubmit.body);
      assert.equal((await statusOf(client, "metric_values", invalidDraft)).workflow_status, "draft");

      const contributorReview = await apiRequest("POST", "/api/workflow/review", {
        entityType: "metric_value",
        entityId: submitSubmitted,
        action: "approve",
      }, tenants.tenantA.contributorToken);
      assert.equal(contributorReview.status, 403, contributorReview.body);
      assert.equal((await statusOf(client, "metric_values", submitSubmitted)).workflow_status, "submitted");
    });

    await check("mixed metric and raw drafts submit in one cross-type batch", async () => {
      const response = json<SubmitResult>(await apiRequest("POST", "/api/workflow/submit", {
        items: [
          { entityType: "metric_value", entityId: mixedMetricDraft },
          { entityType: "raw_data", entityId: mixedRawDraft },
          { entityType: "metric_value", entityId: mixedMetricDraft },
        ],
      }, tenants.tenantA.contributorToken));
      assert.deepEqual({
        requested: response.requested,
        unique: response.unique,
        duplicates: response.duplicates,
        submitted: response.submitted,
      }, {
        requested: 3,
        unique: 2,
        duplicates: 1,
        submitted: 2,
      });
      assert.equal((await statusOf(client, "metric_values", mixedMetricDraft)).workflow_status, "submitted");
      assert.equal((await statusOf(client, "raw_data_inputs", mixedRawDraft)).workflow_status, "submitted");
    });

    await check("an invalid mixed batch changes neither entity type", async () => {
      const response = await apiRequest("POST", "/api/workflow/submit", {
        items: [
          { entityType: "metric_value", entityId: invalidMixedMetricDraft },
          { entityType: "unsupported", entityId: invalidMixedRawDraft },
        ],
      }, tenants.tenantA.contributorToken);
      assert.equal(response.status, 400, response.body);
      assert.equal((await statusOf(client, "metric_values", invalidMixedMetricDraft)).workflow_status, "draft");
      assert.equal((await statusOf(client, "raw_data_inputs", invalidMixedRawDraft)).workflow_status, "draft");
    });

    await check("concurrent mixed submissions serialize without a partial result", async () => {
      const forward = [
        { entityType: "metric_value", entityId: concurrentMixedMetricDraft },
        { entityType: "raw_data", entityId: concurrentMixedRawDraft },
      ];
      const reverse = [...forward].reverse();
      const responses = await Promise.all([
        apiRequest("POST", "/api/workflow/submit", { items: forward }, tenants.tenantA.contributorToken),
        apiRequest("POST", "/api/workflow/submit", { items: reverse }, tenants.tenantA.contributorToken),
      ]);
      const bodies = responses.map((response) => json<SubmitResult>(response));
      assert.equal(bodies.reduce((total, body) => total + body.submitted, 0), 2);
      assert.equal(bodies.reduce((total, body) => total + body.alreadySubmitted, 0), 2);
      assert.equal((await statusOf(client, "metric_values", concurrentMixedMetricDraft)).workflow_status, "submitted");
      assert.equal((await statusOf(client, "raw_data_inputs", concurrentMixedRawDraft)).workflow_status, "submitted");
      const audits = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_logs
         WHERE entity_id = ANY($1::varchar[])
           AND details->'transition'->>'from' = 'draft'
           AND details->'transition'->>'to' = 'submitted'`,
        [[concurrentMixedMetricDraft, concurrentMixedRawDraft]],
      );
      assert.equal(Number(audits.rows[0].count), 2);
    });

    await check("submit deduplicates and truthfully reports mixed tenant-owned states", async () => {
      const response = json<SubmitResult>(await apiRequest("POST", "/api/workflow/submit", {
        entityType: "metric_value",
        entityIds: [
          submitDraft,
          submitDraft,
          submitRejected,
          submitSubmitted,
          submitApproved,
          submitArchived,
          missingId,
          foreignDraft,
        ],
      }, tenants.tenantA.contributorToken));
      assert.deepEqual({
        requested: response.requested,
        unique: response.unique,
        duplicates: response.duplicates,
        submitted: response.submitted,
        alreadySubmitted: response.alreadySubmitted,
        alreadyApproved: response.alreadyApproved,
        ineligible: response.ineligible,
        notFound: response.notFound,
      }, {
        requested: 8,
        unique: 7,
        duplicates: 1,
        submitted: 1,
        alreadySubmitted: 1,
        alreadyApproved: 1,
        ineligible: 2,
        notFound: 2,
      });
      assert.equal((await statusOf(client, "metric_values", submitDraft)).workflow_status, "submitted");
      assert.equal((await statusOf(client, "metric_values", submitRejected)).workflow_status, "rejected");
      assert.equal((await statusOf(client, "metric_values", foreignDraft)).workflow_status, "draft");
    });

    await check("single rejection requires a non-empty comment", async () => {
      for (const comment of [undefined, "   "]) {
        const response = await apiRequest("POST", "/api/workflow/review", {
          entityType: "metric_value",
          entityId: raceSubmitted,
          action: "reject",
          ...(comment === undefined ? {} : { comment }),
        }, tenants.tenantA.adminToken);
        assert.equal(response.status, 400, response.body);
      }
      assert.equal((await statusOf(client, "metric_values", raceSubmitted)).workflow_status, "submitted");
    });

    await check("concurrent opposite reviews produce one winner and one conflict", async () => {
      const [approve, reject] = await Promise.all([
        apiRequest("POST", "/api/workflow/review", {
          entityType: "metric_value",
          entityId: raceSubmitted,
          action: "approve",
        }, tenants.tenantA.adminToken),
        apiRequest("POST", "/api/workflow/review", {
          entityType: "metric_value",
          entityId: raceSubmitted,
          action: "reject",
          comment: "Concurrent correction request",
        }, tenants.tenantA.adminToken),
      ]);
      assert.deepEqual([approve.status, reject.status].sort(), [200, 409]);
      const winner = approve.status === 200 ? "approved" : "rejected";
      assert.equal((await statusOf(client, "metric_values", raceSubmitted)).workflow_status, winner);
      const auditCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_logs
         WHERE entity_id = $1 AND details->'transition'->>'from' = 'submitted'
           AND details->'transition'->>'to' IN ('approved', 'rejected')`,
        [raceSubmitted],
      );
      assert.equal(Number(auditCount.rows[0].count), 1);
    });

    await check("bulk review deduplicates and safely skips stale and foreign items", async () => {
      const response = json<BulkReviewResult>(await apiRequest("POST", "/api/workflow/bulk-review", {
        action: "approve",
        items: [
          { entityType: "metric_value", entityId: bulkSubmittedOne },
          { entityType: "metric_value", entityId: bulkSubmittedOne },
          { entityType: "metric_value", entityId: bulkSubmittedTwo },
          { entityType: "metric_value", entityId: bulkApproved },
          { entityType: "metric_value", entityId: missingId },
          { entityType: "metric_value", entityId: foreignDraft },
        ],
      }, tenants.tenantA.adminToken));
      assert.deepEqual({
        requested: response.requested,
        unique: response.unique,
        duplicates: response.duplicates,
        reviewed: response.reviewed,
        notSubmitted: response.notSubmitted,
        notFound: response.notFound,
      }, {
        requested: 6,
        unique: 5,
        duplicates: 1,
        reviewed: 2,
        notSubmitted: 1,
        notFound: 2,
      });
      assert.equal((await statusOf(client, "metric_values", bulkSubmittedOne)).workflow_status, "approved");
      assert.equal((await statusOf(client, "metric_values", bulkSubmittedTwo)).workflow_status, "approved");
      assert.equal((await statusOf(client, "metric_values", foreignDraft)).workflow_status, "draft");
    });

    await check("bulk rejection requires a comment before any transition", async () => {
      const pending = await insertMetricValue(client, tenantAMetric, "submitted", "04");
      const response = await apiRequest("POST", "/api/workflow/bulk-review", {
        action: "reject",
        comment: " ",
        items: [{ entityType: "metric_value", entityId: pending }],
      }, tenants.tenantA.adminToken);
      assert.equal(response.status, 400, response.body);
      assert.equal((await statusOf(client, "metric_values", pending)).workflow_status, "submitted");
    });

    await check("contributors can revise rejected metric and raw rows with an audit trail", async () => {
      const metricResponse = json<{ status: string; outcome: string }>(await apiRequest("POST", "/api/workflow/revise", {
        entityType: "metric_value",
        entityId: reviseRejected,
      }, tenants.tenantA.contributorToken));
      assert.equal(metricResponse.outcome, "revised");
      const metricRow = await statusOf(client, "metric_values", reviseRejected);
      assert.equal(metricRow.workflow_status, "draft");
      assert.equal(metricRow.review_comment, "Use the invoice total", "rejection guidance must remain visible during correction");

      const rawResponse = json<{ status: string; outcome: string }>(await apiRequest("POST", "/api/workflow/revise", {
        entityType: "raw_data",
        entityId: reviseRawRejected,
      }, tenants.tenantA.contributorToken));
      assert.equal(rawResponse.outcome, "revised");
      assert.equal((await statusOf(client, "raw_data_inputs", reviseRawRejected)).workflow_status, "draft");

      const audits = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_logs
         WHERE entity_id = ANY($1::varchar[])
           AND details->'transition'->>'from' = 'rejected'
           AND details->'transition'->>'to' = 'draft'`,
        [[reviseRejected, reviseRawRejected]],
      );
      assert.equal(Number(audits.rows[0].count), 2);
    });

    await check("revise keeps approved immutable and hides cross-tenant existence", async () => {
      const approved = await apiRequest("POST", "/api/workflow/revise", {
        entityType: "metric_value",
        entityId: reviseApproved,
      }, tenants.tenantA.contributorToken);
      const approvedBody = json<{ currentStatus: string }>(approved, 409);
      assert.equal(approvedBody.currentStatus, "approved");
      assert.equal((await statusOf(client, "metric_values", reviseApproved)).workflow_status, "approved");

      const foreign = await apiRequest("POST", "/api/workflow/revise", {
        entityType: "metric_value",
        entityId: reviseForeignRejected,
      }, tenants.tenantA.contributorToken);
      assert.equal(foreign.status, 404, foreign.body);
      assert.equal((await statusOf(client, "metric_values", reviseForeignRejected)).workflow_status, "rejected");

      const invalid = await apiRequest("POST", "/api/workflow/revise", {
        entityType: "report",
        entityId: reviseApproved,
      }, tenants.tenantA.contributorToken);
      assert.equal(invalid.status, 400, invalid.body);
    });
  } finally {
    if (createdIds.length > 0) {
      await client.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::varchar[])", [createdIds]);
      await client.query("DELETE FROM metric_values WHERE id = ANY($1::varchar[])", [createdIds]);
      await client.query("DELETE FROM raw_data_inputs WHERE id = ANY($1::varchar[])", [createdIds]);
    }
    await client.end();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\nWorkflow integrity API: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
