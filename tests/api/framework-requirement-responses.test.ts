/**
 * API regression: non-metric framework requirement responses and evidence.
 *
 * Run: npx tsx tests/api/framework-requirement-responses.test.ts
 */

import bcrypt from "bcryptjs";
import { Client } from "pg";
import {
  apiMultipartRequest,
  apiRequest,
  loginAndGetToken,
  seedTestTenants,
} from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, detail: error?.message || String(error) });
    console.error(`  FAIL  ${name} - ${error?.message || String(error)}`);
  }
}

function json<T>(response: { status: number; body: string }, expectedStatus = 200): T {
  assert(response.status === expectedStatus, `expected ${expectedStatus}, got ${response.status}: ${response.body.slice(0, 400)}`);
  return JSON.parse(response.body) as T;
}

async function createApprover(client: Client, companyId: string, suffix: string) {
  const email = `framework-approver-${suffix}@test-esg.example`;
  const password = "Test1234!";
  const passwordHash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO users (
       username, email, password, role, company_id,
       terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
     ) VALUES ($1, $2, $3, 'approver', $4, NOW(), NOW(), '1.0', '1.0')`,
    [`frameworkapprover${suffix}`, email, passwordHash, companyId],
  );
  return loginAndGetToken(email, password);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL env var not set");

  const tenants = await seedTestTenants();
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2098";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const framework = (await client.query<{ id: string }>(
      `INSERT INTO frameworks (code, name, full_name, description, version, is_active)
       VALUES ($1, $2, $2, 'API test framework', '1', true)
       RETURNING id`,
      [`QA-FRR-${suffix}`, `QA Framework Responses ${suffix}`],
    )).rows[0];

    async function createRequirement(code: string, title: string, type: "narrative" | "policy" | "target" | "risk" | "evidence") {
      return (await client.query<{ id: string }>(
        `INSERT INTO framework_requirements
          (framework_id, code, title, requirement_type, pillar, mandatory_level, sort_order)
         VALUES ($1, $2, $3, $4, 'governance', 'core', 1)
         RETURNING id`,
        [framework.id, `${code}-${suffix}`, title, type],
      )).rows[0];
    }

    const narrativeRequirement = await createRequirement("QA-NARRATIVE", "Governance narrative", "narrative");
    const policyRequirement = await createRequirement("QA-POLICY", "Active policy", "policy");
    const targetRequirement = await createRequirement("QA-TARGET", "Quantified target", "target");
    const riskRequirement = await createRequirement("QA-RISK", "Scored risk", "risk");
    const evidenceRequirement = await createRequirement("QA-EVIDENCE", "Reviewed evidence", "evidence");

    json(await apiRequest("PUT", `/api/framework-selections/${framework.id}`, { isEnabled: true }, tenantA.adminToken));

    const activePolicy = (await client.query<{ id: string }>(
      `INSERT INTO policy_records (company_id, title, policy_type, status)
       VALUES ($1, $2, 'governance', 'active') RETURNING id`,
      [tenantA.companyId, `Active policy ${suffix}`],
    )).rows[0];
    const draftPolicy = (await client.query<{ id: string }>(
      `INSERT INTO policy_records (company_id, title, policy_type, status)
       VALUES ($1, $2, 'governance', 'draft') RETURNING id`,
      [tenantA.companyId, `Draft policy ${suffix}`],
    )).rows[0];
    const foreignPolicy = (await client.query<{ id: string }>(
      `INSERT INTO policy_records (company_id, title, policy_type, status)
       VALUES ($1, $2, 'governance', 'active') RETURNING id`,
      [tenantB.companyId, `Foreign policy ${suffix}`],
    )).rows[0];
    const target = (await client.query<{ id: string }>(
      `INSERT INTO esg_targets (company_id, title, pillar, target_value, target_year, status)
       VALUES ($1, $2, 'environmental', '25', 2030, 'in_progress') RETURNING id`,
      [tenantA.companyId, `Target ${suffix}`],
    )).rows[0];
    const scoredRisk = (await client.query<{ id: string }>(
      `INSERT INTO esg_risks (company_id, pillar, risk_type, title, likelihood, impact, risk_score, status)
       VALUES ($1, 'governance', 'regulatory', $2, 'medium', 'high', 12, 'open') RETURNING id`,
      [tenantA.companyId, `Scored risk ${suffix}`],
    )).rows[0];
    const unscoredRisk = (await client.query<{ id: string }>(
      `INSERT INTO esg_risks (company_id, pillar, risk_type, title, likelihood, impact, status)
       VALUES ($1, 'governance', 'regulatory', $2, 'medium', 'high', 'open') RETURNING id`,
      [tenantA.companyId, `Unscored risk ${suffix}`],
    )).rows[0];
    const foreignSite = (await client.query<{ id: string }>(
      `INSERT INTO organisation_sites (company_id, name, slug, type, status)
       VALUES ($1, $2, $3, 'office', 'active') RETURNING id`,
      [tenantB.companyId, `Foreign site ${suffix}`, `foreign-site-${suffix}`],
    )).rows[0];
    const approverToken = await createApprover(client, tenantA.companyId, suffix);

    let narrativeResponseId = "";
    await check("contributor can submit a narrative response", async () => {
      const response = json<{ id: string; workflowStatus: string; createdByUserId?: string; submittedByUserId?: string; submittedAt?: string }>(await apiRequest(
        "PUT",
        `/api/framework-requirements/${narrativeRequirement.id}/response`,
        { period, siteId: null, responseText: "The board reviews ESG risks quarterly.", workflowStatus: "submitted" },
        tenantA.contributorToken,
      ));
      narrativeResponseId = response.id;
      assert(response.workflowStatus === "submitted", `unexpected status ${response.workflowStatus}`);
      assert(Boolean(response.createdByUserId), "creator audit metadata missing");
      assert(Boolean(response.submittedByUserId && response.submittedAt), "submission audit metadata missing");
    });

    await check("viewer cannot create or edit a response", async () => {
      const response = await apiRequest(
        "PUT",
        `/api/framework-requirements/${narrativeRequirement.id}/response`,
        { period, siteId: null, responseText: "viewer edit", workflowStatus: "draft" },
        tenantA.viewerToken,
      );
      assert(response.status === 403, `expected 403, got ${response.status}`);
    });

    await check("contributor cannot approve a response", async () => {
      const response = await apiRequest(
        "POST",
        `/api/framework-requirement-responses/${narrativeResponseId}/review`,
        { workflowStatus: "approved" },
        tenantA.contributorToken,
      );
      assert(response.status === 403, `expected 403, got ${response.status}`);
    });

    await check("approver can approve a submitted response", async () => {
      const response = json<{ workflowStatus: string; reviewedByUserId?: string }>(await apiRequest(
        "POST",
        `/api/framework-requirement-responses/${narrativeResponseId}/review`,
        { workflowStatus: "approved", reviewComment: "Suitable disclosure" },
        approverToken,
      ));
      assert(response.workflowStatus === "approved", `unexpected status ${response.workflowStatus}`);
      assert(Boolean(response.reviewedByUserId), "reviewer audit metadata missing");
    });

    await check("approved narrative covers readiness and exposes response counts", async () => {
      const readiness = json<any[]>(await apiRequest(
        "GET",
        `/api/framework-readiness?period=${period}&siteId=null`,
        undefined,
        tenantA.viewerToken,
      ));
      const frameworkResult = readiness.find((item) => item.framework?.id === framework.id);
      const requirement = frameworkResult?.requirements?.find((item: any) => item.id === narrativeRequirement.id);
      assert(requirement?.status === "covered", `unexpected readiness ${requirement?.status}`);
      assert(requirement.factSummary.requirementResponses === 1, "response fact count missing");
      assert(frameworkResult.summary.approvedResponseFacts >= 1, "framework response count missing");
    });

    await check("editing an approved response resets review state to draft", async () => {
      const response = json<{ id: string; workflowStatus: string; reviewedByUserId: string | null }>(await apiRequest(
        "PUT",
        `/api/framework-requirements/${narrativeRequirement.id}/response`,
        { period, siteId: null, responseText: "The board now reviews ESG risks monthly.", workflowStatus: "draft" },
        tenantA.contributorToken,
      ));
      assert(response.id === narrativeResponseId, "upsert created a duplicate response");
      assert(response.workflowStatus === "draft", `unexpected status ${response.workflowStatus}`);
      assert(response.reviewedByUserId === null, "stale reviewer metadata was retained");
      const review = await apiRequest(
        "POST",
        `/api/framework-requirement-responses/${narrativeResponseId}/review`,
        { workflowStatus: "approved" },
        approverToken,
      );
      assert(review.status === 409, `draft response was directly approved: ${review.status}`);
    });

    await check("foreign and ineligible policy links are rejected", async () => {
      const foreign = await apiRequest(
        "PUT",
        `/api/framework-requirements/${policyRequirement.id}/response`,
        { period, linkedEntityType: "policy", linkedEntityId: foreignPolicy.id, workflowStatus: "submitted" },
        tenantA.contributorToken,
      );
      assert(foreign.status === 404, `foreign policy should be hidden with 404, got ${foreign.status}`);

      const draft = await apiRequest(
        "PUT",
        `/api/framework-requirements/${policyRequirement.id}/response`,
        { period, linkedEntityType: "policy", linkedEntityId: draftPolicy.id, workflowStatus: "submitted" },
        tenantA.contributorToken,
      );
      assert(draft.status === 422, `draft policy should be ineligible, got ${draft.status}`);
    });

    await check("active policy, quantified target, and scored risk responses complete after approval", async () => {
      const invalidRisk = await apiRequest(
        "PUT",
        `/api/framework-requirements/${riskRequirement.id}/response`,
        { period, linkedEntityType: "risk", linkedEntityId: unscoredRisk.id, workflowStatus: "submitted" },
        tenantA.contributorToken,
      );
      assert(invalidRisk.status === 422, `unscored risk should be ineligible, got ${invalidRisk.status}`);

      for (const item of [
        { requirementId: policyRequirement.id, linkedEntityType: "policy", linkedEntityId: activePolicy.id },
        { requirementId: targetRequirement.id, linkedEntityType: "target", linkedEntityId: target.id },
        { requirementId: riskRequirement.id, linkedEntityType: "risk", linkedEntityId: scoredRisk.id },
      ]) {
        const saved = json<{ id: string }>(await apiRequest(
          "PUT",
          `/api/framework-requirements/${item.requirementId}/response`,
          { period, linkedEntityType: item.linkedEntityType, linkedEntityId: item.linkedEntityId, workflowStatus: "submitted" },
          tenantA.contributorToken,
        ));
        json(await apiRequest(
          "POST",
          `/api/framework-requirement-responses/${saved.id}/review`,
          { workflowStatus: "approved" },
          approverToken,
        ));
      }

      const readiness = json<any[]>(await apiRequest("GET", `/api/framework-readiness?period=${period}&siteId=null`, undefined, tenantA.adminToken));
      const requirements = readiness.find((item) => item.framework?.id === framework.id)?.requirements ?? [];
      assert(requirements.find((item: any) => item.id === policyRequirement.id)?.status === "covered", "policy was not covered");
      assert(requirements.find((item: any) => item.id === targetRequirement.id)?.status === "covered", "target was not covered");
      assert(requirements.find((item: any) => item.id === riskRequirement.id)?.status === "covered", "risk was not covered");
    });

    await check("foreign site scope is rejected", async () => {
      const response = await apiRequest(
        "PUT",
        `/api/framework-requirements/${narrativeRequirement.id}/response`,
        { period, siteId: foreignSite.id, responseText: "foreign site", workflowStatus: "draft" },
        tenantA.contributorToken,
      );
      assert(response.status === 404, `expected 404, got ${response.status}`);
    });

    let evidenceId = "";
    await check("framework evidence upload uses guarded multipart persistence", async () => {
      const form = new FormData();
      form.append("frameworkRequirementId", evidenceRequirement.id);
      form.append("period", period);
      form.append("siteId", "__org__");
      form.append("description", "Approved board sign-off");
      form.append("file", new Blob(["board sign-off evidence"], { type: "text/plain" }), `board-signoff-${suffix}.txt`);
      const response = json<{ id: string; linkedModule: string; linkedEntityId: string; mimeType: string; fileSize: number }>(
        await apiMultipartRequest("POST", "/api/evidence", form, tenantA.contributorToken),
      );
      evidenceId = response.id;
      assert(response.linkedModule === "framework_requirement", `unexpected module ${response.linkedModule}`);
      assert(response.linkedEntityId === evidenceRequirement.id, "wrong requirement linkage");
      assert(response.mimeType === "text/plain", `unexpected MIME ${response.mimeType}`);
      assert(response.fileSize > 0, "file size was not persisted");
    });

    await check("only admin or approver can review framework evidence", async () => {
      const contributor = await apiRequest("PUT", `/api/evidence/${evidenceId}`, { evidenceStatus: "approved" }, tenantA.contributorToken);
      assert(contributor.status === 403, `contributor review should be 403, got ${contributor.status}`);
      const reviewed = json<{ evidenceStatus: string; reviewedBy: string | null }>(
        await apiRequest("PUT", `/api/evidence/${evidenceId}`, { evidenceStatus: "reviewed" }, approverToken),
      );
      assert(reviewed.evidenceStatus === "reviewed", `unexpected evidence status ${reviewed.evidenceStatus}`);
      assert(Boolean(reviewed.reviewedBy), "evidence reviewer audit metadata missing");
    });

    await check("approver review access cannot become upload or ordinary evidence edit access", async () => {
      const metrics = json<Array<{ id: string }>>(await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken));
      assert(Boolean(metrics[0]?.id), "tenant metric missing");

      const ordinaryForm = new FormData();
      ordinaryForm.append("metricId", metrics[0].id);
      ordinaryForm.append("period", period);
      ordinaryForm.append("siteId", "__org__");
      ordinaryForm.append("file", new Blob(["ordinary metric evidence"], { type: "text/plain" }), `ordinary-${suffix}.txt`);
      const ordinaryEvidence = json<{ id: string }>(
        await apiMultipartRequest("POST", "/api/evidence", ordinaryForm, tenantA.contributorToken),
      );

      const ordinaryReview = await apiRequest("PUT", `/api/evidence/${ordinaryEvidence.id}`, { evidenceStatus: "approved" }, approverToken);
      assert(ordinaryReview.status === 403, `approver edited ordinary evidence: ${ordinaryReview.status}`);
      const contributorOrdinaryReview = await apiRequest(
        "PUT",
        `/api/evidence/${ordinaryEvidence.id}`,
        { evidenceStatus: "approved" },
        tenantA.contributorToken,
      );
      assert(
        contributorOrdinaryReview.status === 403,
        `contributor reviewed ordinary evidence: ${contributorOrdinaryReview.status}`,
      );
      const metadataEdit = await apiRequest("PUT", `/api/evidence/${evidenceId}`, { description: "approver metadata edit" }, approverToken);
      assert(metadataEdit.status === 403, `approver edited framework metadata: ${metadataEdit.status}`);

      const approverUploadForm = new FormData();
      approverUploadForm.append("frameworkRequirementId", evidenceRequirement.id);
      approverUploadForm.append("period", period);
      approverUploadForm.append("siteId", "__org__");
      approverUploadForm.append("file", new Blob(["not permitted"], { type: "text/plain" }), `approver-upload-${suffix}.txt`);
      const approverUpload = await apiMultipartRequest("POST", "/api/evidence", approverUploadForm, approverToken);
      assert(approverUpload.status === 403, `approver uploaded evidence: ${approverUpload.status}`);

      const ambiguousForm = new FormData();
      ambiguousForm.append("metricId", metrics[0].id);
      ambiguousForm.append("frameworkRequirementId", evidenceRequirement.id);
      ambiguousForm.append("period", period);
      ambiguousForm.append("siteId", "__org__");
      ambiguousForm.append("file", new Blob(["ambiguous link"], { type: "text/plain" }), `ambiguous-${suffix}.txt`);
      const ambiguous = await apiMultipartRequest("POST", "/api/evidence", ambiguousForm, tenantA.contributorToken);
      assert(ambiguous.status === 400, `upload accepted two entity links: ${ambiguous.status}`);
    });

    await check("reviewed requirement evidence covers evidence readiness", async () => {
      const readiness = json<any[]>(await apiRequest("GET", `/api/framework-readiness?period=${period}&siteId=null`, undefined, tenantA.viewerToken));
      const frameworkResult = readiness.find((item) => item.framework?.id === framework.id);
      const requirement = frameworkResult?.requirements?.find((item: any) => item.id === evidenceRequirement.id);
      assert(requirement?.status === "covered", `unexpected readiness ${requirement?.status}`);
      assert(requirement.factSummary.approvedRequirementLinkedEvidence === 1, "approved evidence fact count missing");
      assert(frameworkResult.summary.approvedEvidenceFacts >= 1, "framework evidence count missing");
    });

    await check("response and evidence reads remain tenant scoped", async () => {
      const foreignResponses = json<{ responses: Array<{ id: string }> }>(await apiRequest(
        "GET",
        `/api/framework-requirement-responses?frameworkRequirementId=${narrativeRequirement.id}&period=${period}&siteId=__org__`,
        undefined,
        tenantB.adminToken,
      ));
      assert(foreignResponses.responses.length === 0, "response leaked across tenants");
      const foreignReview = await apiRequest(
        "POST",
        `/api/framework-requirement-responses/${narrativeResponseId}/review`,
        { workflowStatus: "rejected" },
        tenantB.adminToken,
      );
      assert(foreignReview.status === 404, `foreign response review should be 404, got ${foreignReview.status}`);
      const foreignEvidenceUpdate = await apiRequest("PUT", `/api/evidence/${evidenceId}`, { description: "foreign edit" }, tenantB.adminToken);
      assert(foreignEvidenceUpdate.status === 404, `foreign evidence update should be 404, got ${foreignEvidenceUpdate.status}`);
    });

    await check("readiness revalidates an approved linked source", async () => {
      await client.query("UPDATE policy_records SET status = 'retired' WHERE id = $1", [activePolicy.id]);
      try {
        const readiness = json<any[]>(await apiRequest("GET", `/api/framework-readiness?period=${period}&siteId=null`, undefined, tenantA.adminToken));
        const requirement = readiness
          .find((item) => item.framework?.id === framework.id)
          ?.requirements?.find((item: any) => item.id === policyRequirement.id);
        assert(requirement?.status === "partial", `stale linked policy remained covered: ${requirement?.status}`);
        assert(requirement.factSummary.invalidRequirementResponses === 1, "invalid linked source count missing");
      } finally {
        await client.query("UPDATE policy_records SET status = 'active' WHERE id = $1", [activePolicy.id]);
      }
    });
  } finally {
    await client.end();
  }
}

(async () => {
  console.log("\n=== API Tests: Framework Requirement Responses ===\n");
  try {
    await run();
  } catch (error) {
    console.error("TEST FAILED:", error);
    process.exit(1);
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`\n=== Framework requirement responses: ${passed}/${results.length} passed ===\n`);
  if (passed !== results.length) process.exit(1);
})();
