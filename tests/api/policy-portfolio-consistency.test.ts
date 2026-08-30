/**
 * API regression: all policy consumers use the same active/adopted portfolio.
 *
 * Run against an isolated acceptance server/database:
 *   BASE_URL=http://127.0.0.1:5019 DATABASE_URL=postgresql://... \
 *     node --import tsx tests/api/policy-portfolio-consistency.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };
type PolicyNotification = {
  type?: string;
  linkedModule?: string | null;
  linkedEntityId?: string | null;
  sourceKey?: string | null;
};
type CoverageResponse = {
  overallPercent?: number;
  policiesWithEvidence?: number;
  totalPolicies?: number;
  metricsWithEvidence?: number;
  totalMetrics?: number;
  reportsWithEvidence?: number;
  totalReports?: number;
};
type MaturityResponse = {
  details?: {
    policiesAdopted?: number;
    evidenceCoverage?: number;
  };
};

const results: Array<{ name: string; passed: boolean; detail?: string }> = [];

function json<T>(response: ApiResponse, label: string): T {
  assert.equal(response.status, 200, `${label}: status=${response.status} body=${response.body.slice(0, 500)}`);
  return JSON.parse(response.body) as T;
}

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

async function clearPolicyPortfolio(client: Client, companyId: string) {
  await client.query("DELETE FROM notifications WHERE company_id = $1", [companyId]);
  await client.query(
    `DELETE FROM evidence_files
     WHERE company_id = $1
       AND linked_module IN ('policy', 'generated_policy')`,
    [companyId],
  );
  await client.query("DELETE FROM policy_records WHERE company_id = $1", [companyId]);
  await client.query("DELETE FROM generated_policies WHERE company_id = $1", [companyId]);
  await client.query(
    "DELETE FROM policy_versions WHERE policy_id IN (SELECT id FROM esg_policies WHERE company_id = $1)",
    [companyId],
  );
  await client.query("DELETE FROM esg_policies WHERE company_id = $1", [companyId]);
}

async function assertPolicyCoverage(
  token: string,
  expectedPoliciesWithEvidence: number,
  label: string,
) {
  const coverage = json<CoverageResponse>(
    await apiRequest("GET", "/api/esg/coverage", undefined, token),
    `${label} coverage`,
  );
  assert.equal(coverage.totalPolicies, 1, `${label}: ${JSON.stringify(coverage)}`);
  assert.equal(
    coverage.policiesWithEvidence,
    expectedPoliciesWithEvidence,
    `${label}: ${JSON.stringify(coverage)}`,
  );
  assert.equal(coverage.metricsWithEvidence, 0, `${label}: ${JSON.stringify(coverage)}`);
  assert.equal(coverage.reportsWithEvidence, 0, `${label}: ${JSON.stringify(coverage)}`);

  assert.equal(typeof coverage.totalMetrics, "number", `${label}: ${JSON.stringify(coverage)}`);
  assert.equal(typeof coverage.totalReports, "number", `${label}: ${JSON.stringify(coverage)}`);
  const totalItems = 1 + coverage.totalMetrics! + coverage.totalReports!;
  const expectedCoverage = totalItems > 0
    ? Math.round((expectedPoliciesWithEvidence / totalItems) * 100)
    : 0;
  assert.equal(coverage.overallPercent, expectedCoverage, `${label}: ${JSON.stringify(coverage)}`);

  const maturity = json<MaturityResponse>(
    await apiRequest("GET", "/api/esg/maturity", undefined, token),
    `${label} maturity`,
  );
  assert.equal(maturity.details?.policiesAdopted, 1, `${label}: ${JSON.stringify(maturity)}`);
  assert.equal(maturity.details?.evidenceCoverage, expectedCoverage, `${label}: ${JSON.stringify(maturity)}`);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");

  const { tenantA } = await seedTestTenants();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const companyId = tenantA.companyId;
  const token = tenantA.adminToken;
  const legacyDraftId = randomUUID();
  const generatedRejectedId = randomUUID();
  const retiredRecordId = randomUUID();
  const activeRecordId = randomUUID();
  const activeEvidenceId = randomUUID();
  const retiredEvidenceId = randomUUID();
  const archivedEvidenceId = randomUUID();
  const pastReviewDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activeReviewDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  pastReviewDate.setUTCMilliseconds(0);
  activeReviewDate.setUTCMilliseconds(0);

  try {
    await clearPolicyPortfolio(client, companyId);
    await client.query(
      `INSERT INTO esg_policies (id, company_id, status, review_date)
       VALUES ($1, $2, 'draft', $3)`,
      [legacyDraftId, companyId, pastReviewDate],
    );
    await client.query(
      `INSERT INTO generated_policies (
         id, company_id, template_id, template_slug, title, status, content,
         workflow_status, review_date
       ) VALUES ($1, $2, $3, $4, $5, 'draft', '{}'::jsonb, 'rejected', $6)`,
      [
        generatedRejectedId,
        companyId,
        randomUUID(),
        `rejected-policy-${randomUUID()}`,
        "Rejected generated policy",
        pastReviewDate,
      ],
    );
    await client.query(
      `INSERT INTO policy_records (
         id, company_id, title, policy_type, status, review_date
       ) VALUES
         ($1, $3, 'Retired policy record', 'other', 'retired', $4),
         ($2, $3, 'Active policy record', 'environmental', 'active', $5)`,
      [retiredRecordId, activeRecordId, companyId, pastReviewDate, activeReviewDate],
    );
    await client.query(
      `INSERT INTO evidence_files (
         id, company_id, filename, file_type, mime_type, linked_module,
         linked_entity_id, evidence_status
       ) VALUES ($1, $2, 'active-policy-evidence.pdf', 'pdf', 'application/pdf',
         'policy', $3, 'uploaded')`,
      [activeEvidenceId, companyId, activeRecordId],
    );

    await check("inactive draft, rejected and retired review dates do not degrade policy health", async () => {
      const maturity = json<{
        dimensions?: {
          policiesInPlace?: { score?: number; detail?: string };
          reviewCycles?: { score?: number; detail?: string };
        };
        gaps?: string[];
      }>(
        await apiRequest("GET", "/api/esg-scores/management-maturity", undefined, token),
        "management maturity",
      );
      assert.equal(maturity.dimensions?.policiesInPlace?.score, 100, JSON.stringify(maturity.dimensions?.policiesInPlace));
      assert.equal(maturity.dimensions?.reviewCycles?.score, 100, JSON.stringify(maturity.dimensions?.reviewCycles));
      assert.doesNotMatch(maturity.dimensions?.policiesInPlace?.detail ?? "", /overdue|draft/i);
      assert.doesNotMatch(maturity.dimensions?.reviewCycles?.detail ?? "", /overdue/i);
      assert.ok(
        !(maturity.gaps ?? []).some((gap) => /policy review|review date/i.test(gap)),
        `inactive review dates created a policy-health gap: ${JSON.stringify(maturity.gaps)}`,
      );
    });

    await check("reminders are generated only for the active policy review date", async () => {
      await client.query("DELETE FROM notifications WHERE company_id = $1", [companyId]);
      json<{ generated?: number }>(
        await apiRequest("POST", "/api/notifications/refresh", {}, token),
        "refresh notifications",
      );
      const notifications = json<PolicyNotification[]>(
        await apiRequest("GET", "/api/notifications?all=true", undefined, token),
        "list notifications",
      );
      const fixtureIds = new Set([legacyDraftId, generatedRejectedId, retiredRecordId, activeRecordId]);
      const policyReviewNotifications = notifications.filter((notification) =>
        notification.type === "policy_review"
        && Boolean(notification.linkedEntityId)
        && fixtureIds.has(notification.linkedEntityId!),
      );
      assert.deepEqual(
        policyReviewNotifications.map((notification) => notification.linkedEntityId),
        [activeRecordId],
        `unexpected policy reminders: ${JSON.stringify(policyReviewNotifications)}`,
      );
      assert.equal(policyReviewNotifications[0]?.linkedModule, "policy_record");
      assert.equal(policyReviewNotifications[0]?.sourceKey, `policy_record_review:${activeRecordId}`);
    });

    await check("dashboard policy health exposes only the active review date", async () => {
      const dashboard = json<{
        upcomingPolicyReviews?: Array<{ reviewDate?: string; status?: string }>;
      }>(await apiRequest("GET", "/api/dashboard/enhanced", undefined, token), "enhanced dashboard");
      assert.equal(
        dashboard.upcomingPolicyReviews?.length,
        1,
        `inactive policy dates leaked into dashboard health: ${JSON.stringify(dashboard.upcomingPolicyReviews)}`,
      );
      assert.equal(dashboard.upcomingPolicyReviews?.[0]?.status, "upcoming");
      const dashboardReviewTime = new Date(dashboard.upcomingPolicyReviews?.[0]?.reviewDate ?? "").getTime();
      assert.ok(
        Number.isFinite(dashboardReviewTime)
          && Math.abs(dashboardReviewTime - activeReviewDate.getTime()) <= 2 * 60 * 60 * 1000,
        `dashboard review date did not resolve to the active record: ${JSON.stringify(dashboard.upcomingPolicyReviews)}`,
      );
      // The dashboard schedules the same reminder refresh after responding.
      // A synchronous refresh here also ensures that background work has no
      // stale inactive source left to create before fixture teardown.
      json<{ generated?: number }>(
        await apiRequest("POST", "/api/notifications/refresh", {}, token),
        "post-dashboard notification refresh",
      );
    });

    // Leave one active policy alongside deliberately evidenced retired and
    // archived inventory. Only the active policy may contribute to either
    // endpoint's policy total or evidence numerator/denominator.
    await client.query("DELETE FROM esg_policies WHERE id = $1", [legacyDraftId]);
    await client.query(
      `UPDATE generated_policies
       SET status = 'published', workflow_status = 'archived', review_date = NULL
       WHERE id = $1`,
      [generatedRejectedId],
    );
    await client.query(
      `INSERT INTO evidence_files (
         id, company_id, filename, file_type, mime_type, linked_module,
         linked_entity_id, evidence_status
       ) VALUES
         ($1, $3, 'retired-policy-evidence.pdf', 'pdf', 'application/pdf',
          'policy', $4, 'approved'),
         ($2, $3, 'archived-policy-evidence.pdf', 'pdf', 'application/pdf',
          'generated_policy', $5, 'approved')`,
      [retiredEvidenceId, archivedEvidenceId, companyId, retiredRecordId, generatedRejectedId],
    );

    await check("coverage and maturity count only the active policy with usable evidence", async () => {
      await assertPolicyCoverage(token, 1, "usable active evidence");
    });

    await client.query(
      "UPDATE evidence_files SET evidence_status = 'pending', expiry_date = NULL WHERE id = $1",
      [activeEvidenceId],
    );
    await check("coverage and maturity ignore pending policy evidence", async () => {
      await assertPolicyCoverage(token, 0, "pending active evidence");
    });

    await client.query(
      "UPDATE evidence_files SET evidence_status = 'rejected', expiry_date = NULL WHERE id = $1",
      [activeEvidenceId],
    );
    await check("coverage and maturity ignore rejected policy evidence", async () => {
      await assertPolicyCoverage(token, 0, "rejected active evidence");
    });

    await client.query(
      "UPDATE evidence_files SET evidence_status = 'expired', expiry_date = NULL WHERE id = $1",
      [activeEvidenceId],
    );
    await check("coverage and maturity ignore evidence in the expired state", async () => {
      await assertPolicyCoverage(token, 0, "explicitly expired active evidence");
    });

    await client.query(
      `UPDATE evidence_files
       SET evidence_status = 'available', expiry_date = NOW() - INTERVAL '1 day'
       WHERE id = $1`,
      [activeEvidenceId],
    );
    await check("coverage and maturity ignore otherwise usable evidence past its expiry date", async () => {
      await assertPolicyCoverage(token, 0, "time-expired active evidence");
    });

    await client.query(
      "UPDATE evidence_files SET evidence_status = 'uploaded', expiry_date = NULL WHERE id = $1",
      [activeEvidenceId],
    );

    await check("programme status uses the same adopted policy count", async () => {
      const programme = json<{
        policiesAdoptedCount?: number;
        nextBestActions?: Array<{ label?: string }>;
      }>(await apiRequest("GET", "/api/programme/status", undefined, token), "programme status");
      assert.equal(programme.policiesAdoptedCount, 1, JSON.stringify(programme));
      assert.ok(
        !(programme.nextBestActions ?? []).some((action) => /create your first ESG policy/i.test(action.label ?? "")),
        `active policy record still produced first-policy action: ${JSON.stringify(programme.nextBestActions)}`,
      );
    });

    await check("report readiness recognizes the same active policy record", async () => {
      const readiness = json<{
        missingCategories?: { policyNotPublished?: boolean };
      }>(await apiRequest("GET", "/api/reports/readiness-detail", undefined, token), "report readiness");
      assert.equal(readiness.missingCategories?.policyNotPublished, false, JSON.stringify(readiness.missingCategories));
    });
  } finally {
    await clearPolicyPortfolio(client, companyId).catch(() => undefined);
    await client.end();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\nPolicy portfolio consistency API: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

console.log("\n=== API Tests: Policy Portfolio Consistency ===\n");
run().catch((error) => {
  console.error("TEST FAILED:", error);
  process.exit(1);
});
