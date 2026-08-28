/**
 * Questionnaire tenant-boundary and import regression coverage.
 *
 * Run: BASE_URL=http://127.0.0.1:5000 DATABASE_URL=... node --import tsx tests/api/questionnaire-hardening.test.ts
 */

import assert from "node:assert/strict";
import { Client } from "pg";
import { pool, storage } from "../../server/storage";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };

function body<T>(response: ApiResponse): T {
  return JSON.parse(response.body) as T;
}

function expectStatus(response: ApiResponse, expected: number, context: string) {
  assert.equal(response.status, expected, `${context}: status=${response.status} body=${response.body.slice(0, 500)}`);
}

async function createSite(token: string, name: string): Promise<string> {
  const response = await apiRequest("POST", "/api/sites", { name, type: "office", country: "GB" }, token);
  expectStatus(response, 201, "create active site");
  const id = body<{ id?: string }>(response).id;
  assert.ok(id, "created site id missing");
  return id;
}

async function createReportingPeriod(token: string, name: string, year: number): Promise<string> {
  const response = await apiRequest("POST", "/api/reporting-periods", {
    name,
    periodType: "annual",
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  }, token);
  expectStatus(response, 201, "create reporting period");
  const id = body<{ id?: string }>(response).id;
  assert.ok(id, "created reporting-period id missing");
  return id;
}

async function main() {
  console.log("\n=== Questionnaire hardening regression ===\n");
  const { tenantA, tenantB } = await seedTestTenants();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = ANY($1::varchar[])",
      [[tenantA.companyId, tenantB.companyId]],
    );

    const suffix = `${Date.now()}-${process.pid}`;
    const siteA = await createSite(tenantA.adminToken, `Questionnaire Site A ${suffix}`);
    const siteAOther = await createSite(tenantA.adminToken, `Questionnaire Site A Other ${suffix}`);
    const siteB = await createSite(tenantB.adminToken, `Questionnaire Site B ${suffix}`);
    const periodA = await createReportingPeriod(tenantA.adminToken, `Questionnaire FY A ${suffix}`, 2192);
    const periodAOther = await createReportingPeriod(tenantA.adminToken, `Questionnaire FY A Other ${suffix}`, 2194);
    const periodB = await createReportingPeriod(tenantB.adminToken, `Questionnaire FY B ${suffix}`, 2193);

    const basePayload = {
      format: "text",
      content: "Do you track energy use?",
      title: `Questionnaire import ${suffix}`,
    };

    const missingSite = await apiRequest("POST", "/api/questionnaires/import", basePayload, tenantA.adminToken);
    expectStatus(missingSite, 400, "active-site assignment is required");
    assert.match(missingSite.body, /select a site/i);

    const foreignSite = await apiRequest("POST", "/api/questionnaires/import", {
      ...basePayload,
      title: `${basePayload.title} foreign site`,
      siteId: siteB,
    }, tenantA.adminToken);
    expectStatus(foreignSite, 404, "foreign site is rejected");

    const foreignPeriod = await apiRequest("POST", "/api/questionnaires/import", {
      ...basePayload,
      title: `${basePayload.title} foreign period`,
      siteId: siteA,
      reportingPeriodId: periodB,
    }, tenantA.adminToken);
    expectStatus(foreignPeriod, 400, "foreign reporting period is rejected");
    assert.match(foreignPeriod.body, /reportingPeriodId/i);

    const protectedFieldAttempt = await apiRequest("POST", "/api/questionnaires/import", {
      ...basePayload,
      title: `${basePayload.title} protected fields`,
      siteId: siteA,
      reportingPeriodId: periodA,
      companyId: tenantB.companyId,
      status: "completed",
      createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken);
    expectStatus(protectedFieldAttempt, 400, "strict schema rejects mass assignment");

    const tooManyQuestions = await apiRequest("POST", "/api/questionnaires/import", {
      ...basePayload,
      title: `${basePayload.title} too many questions`,
      content: Array.from({ length: 501 }, (_, index) => `Question ${index + 1}?`).join("\n"),
      siteId: siteA,
      reportingPeriodId: periodA,
    }, tenantA.adminToken);
    expectStatus(tooManyQuestions, 400, "question-count bound is enforced");

    const approvedQuestion = "Do you track energy use?";
    const approvedAnswer = "Yes, monthly through utility invoices.";
    const draftQuestion = "What is the confidential draft procurement archive marker?";
    const draftAnswer = `DRAFT ANSWER MUST NOT SURFACE ${suffix}`;
    const flaggedQuestion = "What is the flagged procurement archive marker for review?";
    const flaggedAnswer = `FLAGGED ANSWER MUST NOT SURFACE ${suffix}`;
    await client.query(
      `INSERT INTO procurement_answers (company_id, question, answer, category, status)
       VALUES
         ($1, $2, $3, 'environmental', 'approved'),
         ($1, $4, $5, 'governance', 'draft'),
         ($1, $6, $7, 'governance', 'flagged')`,
      [
        tenantA.companyId,
        approvedQuestion,
        approvedAnswer,
        draftQuestion,
        draftAnswer,
        flaggedQuestion,
        flaggedAnswer,
      ],
    );

    const excludedLibraryRows = await apiRequest("POST", "/api/questionnaires/import", {
      ...basePayload,
      title: `${basePayload.title} answer status exclusion`,
      content: `${draftQuestion}\n${flaggedQuestion}`,
      siteId: siteA,
      reportingPeriodId: periodA,
    }, tenantA.adminToken);
    expectStatus(excludedLibraryRows, 200, "draft and flagged library rows are ignored during import");
    const excludedBody = body<{
      matched?: number;
      questions?: Array<{ suggestedAnswer: string | null; confidence: number; requiresReview: boolean }>;
    }>(excludedLibraryRows);
    assert.equal(excludedBody.matched, 0, "non-approved library rows counted as matched");
    assert.equal(excludedBody.questions?.length, 2);
    for (const question of excludedBody.questions ?? []) {
      assert.equal(question.suggestedAnswer, null, "non-approved library answer surfaced during import");
      assert.equal(question.confidence, 0);
      assert.equal(question.requiresReview, true);
    }

    const successTitle = `${basePayload.title} success`;
    const imported = await apiRequest("POST", "/api/questionnaires/import", {
      ...basePayload,
      title: successTitle,
      content: "Do you track energy use?\nDo you have an ESG owner?",
      siteId: siteA,
      reportingPeriodId: periodA,
    }, tenantA.adminToken);
    expectStatus(imported, 200, "scoped questionnaire import succeeds");
    const importedBody = body<{
      questionnaireId?: string;
      totalQuestions?: number;
      matched?: number;
      questions?: Array<{ text: string; suggestedAnswer: string | null; confidence: number }>;
    }>(imported);
    assert.ok(importedBody.questionnaireId, "imported questionnaire id missing");
    assert.equal(importedBody.totalQuestions, 2);
    assert.ok((importedBody.matched ?? 0) >= 1, "expected the answer-library question to match");
    assert.equal(importedBody.questions?.[0]?.suggestedAnswer, approvedAnswer);

    const persisted = await client.query<{
      company_id: string;
      site_id: string | null;
      reporting_period_id: string | null;
      source: string | null;
      status: string | null;
    }>(
      "SELECT company_id, site_id, reporting_period_id, source, status FROM questionnaires WHERE id = $1",
      [importedBody.questionnaireId],
    );
    assert.deepEqual(persisted.rows[0], {
      company_id: tenantA.companyId,
      site_id: siteA,
      reporting_period_id: periodA,
      source: "import_text",
      status: "draft",
    });

    const children = await client.query<{
      question_text: string;
      order_index: number;
      suggested_answer: string | null;
      confidence: string | null;
      source_ref: string | null;
    }>(
      `SELECT question_text, order_index, suggested_answer, confidence, source_ref
       FROM questionnaire_questions WHERE questionnaire_id = $1 ORDER BY order_index`,
      [importedBody.questionnaireId],
    );
    assert.equal(children.rowCount, 2, "parent and every imported child must commit together");
    assert.deepEqual({
      question_text: children.rows[0].question_text,
      order_index: children.rows[0].order_index,
      suggested_answer: children.rows[0].suggested_answer,
      confidence: children.rows[0].confidence,
    }, {
      question_text: "Do you track energy use?",
      order_index: 0,
      suggested_answer: "Yes, monthly through utility invoices.",
      confidence: "high",
    });
    assert.match(children.rows[0].source_ref ?? "", /^exact:/);

    const audit = await client.query<{ details: Record<string, unknown> }>(
      `SELECT details FROM audit_logs
       WHERE company_id = $1 AND entity_type = 'questionnaire' AND entity_id = $2 AND action = 'Questionnaire imported'`,
      [tenantA.companyId, importedBody.questionnaireId],
    );
    assert.equal(audit.rowCount, 1, "successful import must emit one tenant audit event");
    assert.equal(Number(audit.rows[0].details.questionCount), 2);
    assert.equal(audit.rows[0].details.siteId, siteA);
    assert.equal(audit.rows[0].details.reportingPeriodId, periodA);

    const unscopedGeneratedResponses = await apiRequest("POST", "/api/questionnaires/generate-responses", {
      text: approvedQuestion,
    }, tenantA.adminToken);
    expectStatus(unscopedGeneratedResponses, 400, "response generation requires the active site and reporting-period boundary");

    const generatedResponses = await apiRequest("POST", "/api/questionnaires/generate-responses", {
      text: `${approvedQuestion}\n${draftQuestion}\n${flaggedQuestion}`,
      title: `Answer status generation ${suffix}`,
      siteId: siteA,
      reportingPeriodId: periodA,
    }, tenantA.adminToken);
    expectStatus(generatedResponses, 200, "response generation ignores non-approved library rows");
    const generatedText = JSON.stringify(body<unknown>(generatedResponses));
    assert.match(generatedText, /Yes, monthly through utility invoices\./);
    assert.doesNotMatch(generatedText, new RegExp(draftAnswer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(generatedText, new RegExp(flaggedAnswer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const scopedMetric = await client.query<{ id: string }>(
      `INSERT INTO metrics (company_id, name, category, unit, frequency, enabled, metric_type)
       VALUES ($1, $2, 'environmental', 'tonnes', 'annual', true, 'manual')
       RETURNING id`,
      [tenantA.companyId, `Waste Generated ${suffix}`],
    );
    const scopedMetricId = scopedMetric.rows[0]?.id;
    assert.ok(scopedMetricId, "scoped questionnaire metric id missing");
    await client.query(
      `INSERT INTO metric_values (metric_id, period, value, site_id, reporting_period_id)
       VALUES
         ($1, '2192', '11', $2, $3),
         ($1, '2192', '999', $4, $3),
         ($1, '2194', '777', $2, $5)`,
      [scopedMetricId, siteA, periodA, siteAOther, periodAOther],
    );
    await client.query(
      `INSERT INTO carbon_calculations (
         company_id, reporting_period, period_type, inputs,
         scope1_total, scope2_total, scope3_total, total_emissions, site_id
       ) VALUES
         ($1, '2192', 'annual', '{}'::jsonb, '100', '23', '0', '123', $2),
         ($1, '2192', 'annual', '{}'::jsonb, '9000', '999', '0', '9999', $3),
         ($1, '2194', 'annual', '{}'::jsonb, '700', '77', '0', '777', $2)`,
      [tenantA.companyId, siteA, siteAOther],
    );

    const scopedGeneratedResponses = await apiRequest(
      "POST",
      "/api/questionnaires/generate-responses",
      {
        text: "How much waste do you generate?\nWhat are your carbon emissions?",
        siteId: siteA,
        reportingPeriodId: periodA,
      },
      tenantA.adminToken,
    );
    expectStatus(scopedGeneratedResponses, 200, "response generation uses the selected site and reporting period");
    const scopedGeneratedBody = body<{
      siteId?: string | null;
      reportingPeriodId?: string | null;
      questions?: Array<{ suggestedAnswer?: string | null }>;
    }>(scopedGeneratedResponses);
    assert.equal(scopedGeneratedBody.siteId, siteA);
    assert.equal(scopedGeneratedBody.reportingPeriodId, periodA);
    assert.equal(scopedGeneratedBody.questions?.length, 2);
    assert.match(scopedGeneratedBody.questions?.[0]?.suggestedAnswer ?? "", /11(?:\.0+)? tonnes/);
    assert.doesNotMatch(scopedGeneratedBody.questions?.[0]?.suggestedAnswer ?? "", /777|999/);
    assert.match(scopedGeneratedBody.questions?.[1]?.suggestedAnswer ?? "", /123(?:\.0+)? kgCO2e/);
    assert.doesNotMatch(scopedGeneratedBody.questions?.[1]?.suggestedAnswer ?? "", /777|9999/);

    const createdForAutofill = await apiRequest("POST", "/api/questionnaires", {
      title: `Scoped autofill ${suffix}`,
      source: "test",
      questions: ["How much waste do you generate?", "What are your carbon emissions?"],
      siteId: siteA,
      reportingPeriodId: periodA,
    }, tenantA.adminToken);
    expectStatus(createdForAutofill, 200, "create questionnaire for scoped autofill");
    const createdForAutofillBody = body<{ id?: string }>(createdForAutofill);
    assert.ok(createdForAutofillBody.id, "created questionnaire result id missing");

    const autofilled = await apiRequest(
      "POST",
      `/api/questionnaires/${createdForAutofillBody.id}/autofill`,
      {},
      tenantA.adminToken,
    );
    expectStatus(autofilled, 200, "site/period-scoped autofill succeeds");
    const autofilledBody = body<{
      id?: string;
      questions?: Array<{ suggestedAnswer?: string | null }>;
    }>(autofilled);
    assert.equal(autofilledBody.id, createdForAutofillBody.id, "autofill response must open the created result");
    assert.equal(autofilledBody.questions?.length, 2);
    assert.match(autofilledBody.questions?.[0]?.suggestedAnswer ?? "", /11(?:\.0+)? tonnes/);
    assert.doesNotMatch(autofilledBody.questions?.[0]?.suggestedAnswer ?? "", /777|999/);
    assert.match(autofilledBody.questions?.[1]?.suggestedAnswer ?? "", /123(?:\.0+)? kgCO2e/);
    assert.doesNotMatch(autofilledBody.questions?.[1]?.suggestedAnswer ?? "", /777|9999/);

    const autofillResult = await apiRequest(
      "GET",
      `/api/questionnaires/${createdForAutofillBody.id}`,
      undefined,
      tenantA.adminToken,
    );
    expectStatus(autofillResult, 200, "created autofill result can be opened");
    const autofillResultBody = body<{ id?: string; questions?: unknown[] }>(autofillResult);
    assert.equal(autofillResultBody.id, createdForAutofillBody.id);
    assert.equal(autofillResultBody.questions?.length, 2);

    const staleQuestionnaire = await apiRequest("POST", "/api/questionnaires", {
      title: `Stale reporting period ${suffix}`,
      source: "test",
      questions: ["Do you have an ESG policy?"],
      siteId: siteA,
      reportingPeriodId: periodAOther,
    }, tenantA.adminToken);
    expectStatus(staleQuestionnaire, 200, "create questionnaire before its period becomes stale");
    const staleQuestionnaireId = body<{ id?: string }>(staleQuestionnaire).id;
    assert.ok(staleQuestionnaireId);
    await client.query("DELETE FROM reporting_periods WHERE id = $1 AND company_id = $2", [periodAOther, tenantA.companyId]);
    const staleAutofill = await apiRequest(
      "POST",
      `/api/questionnaires/${staleQuestionnaireId}/autofill`,
      {},
      tenantA.adminToken,
    );
    expectStatus(staleAutofill, 409, "autofill fails closed when its saved period is stale");
    assert.equal(body<{ code?: string }>(staleAutofill).code, "QUESTIONNAIRE_SCOPE_STALE");

    const foreignGet = await apiRequest("GET", `/api/questionnaires/${importedBody.questionnaireId}`, undefined, tenantB.adminToken);
    expectStatus(foreignGet, 404, "cross-tenant parent read is hidden");
    const foreignAutofill = await apiRequest("POST", `/api/questionnaires/${importedBody.questionnaireId}/autofill`, {}, tenantB.adminToken);
    expectStatus(foreignAutofill, 404, "cross-tenant parent update path is hidden");
    const foreignDelete = await apiRequest("DELETE", `/api/questionnaires/${importedBody.questionnaireId}`, undefined, tenantB.adminToken);
    expectStatus(foreignDelete, 404, "cross-tenant parent delete is hidden");

    assert.equal(await storage.getQuestionnaire(importedBody.questionnaireId, tenantB.companyId), undefined);
    assert.equal(
      await storage.updateQuestionnaire(importedBody.questionnaireId, tenantB.companyId, { status: "completed" }),
      undefined,
      "storage update must enforce company ownership",
    );
    assert.equal(await storage.deleteQuestionnaire(importedBody.questionnaireId, tenantB.companyId), false);

    const stillOwned = await client.query<{ status: string }>(
      "SELECT status FROM questionnaires WHERE id = $1 AND company_id = $2",
      [importedBody.questionnaireId, tenantA.companyId],
    );
    assert.equal(stillOwned.rows[0]?.status, "draft", "foreign attempts changed the owned parent");
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM questionnaire_questions WHERE questionnaire_id = $1",
      [importedBody.questionnaireId],
    )).rows[0].count), 2, "foreign delete removed child rows");

    const rollbackTitle = `${basePayload.title} rollback proof`;
    await assert.rejects(storage.createQuestionnaireWithQuestions(
      {
        companyId: tenantA.companyId,
        title: rollbackTitle,
        source: "test",
        status: "draft",
        siteId: siteA,
        reportingPeriodId: periodA,
      },
      [
        { questionText: "Valid child?", orderIndex: 0 },
        { questionText: null as never, orderIndex: 1 },
      ],
    ));
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM questionnaires WHERE company_id = $1 AND title = $2",
      [tenantA.companyId, rollbackTitle],
    )).rows[0].count), 0, "failed child insert left an orphan questionnaire parent");

    const legitimateGet = await apiRequest("GET", `/api/questionnaires/${importedBody.questionnaireId}`, undefined, tenantA.adminToken);
    expectStatus(legitimateGet, 200, "owner can read imported questionnaire");
    assert.equal(body<{ questions: unknown[] }>(legitimateGet).questions.length, 2);
    const legitimateDelete = await apiRequest("DELETE", `/api/questionnaires/${importedBody.questionnaireId}`, undefined, tenantA.adminToken);
    expectStatus(legitimateDelete, 200, "owner can delete imported questionnaire");
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM questionnaire_questions WHERE questionnaire_id = $1",
      [importedBody.questionnaireId],
    )).rows[0].count), 0, "transactional delete left child rows");
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM questionnaires WHERE id = $1",
      [importedBody.questionnaireId],
    )).rows[0].count), 0, "transactional delete left the parent row");

    console.log("PASS strict and bounded import validation");
    console.log("PASS active-site and reporting-period ownership enforcement");
    console.log("PASS atomic parent/child import and audit event");
    console.log("PASS approved-only Answer Library use for import and response generation");
    console.log("PASS site/period-isolated autofill, result contract, and stale-scope failure");
    console.log("PASS company-scoped parent read/update/delete and legitimate controls");
    console.log("\n=== Questionnaire hardening: 6/6 passed ===\n");
  } finally {
    await client.end();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
