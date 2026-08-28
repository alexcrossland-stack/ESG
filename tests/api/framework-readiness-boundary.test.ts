/**
 * API regression: framework readiness respects the active-site boundary and
 * treats contained legacy Data Entry rows as sub-period, not full-period, facts.
 *
 * Run: node --import tsx tests/api/framework-readiness-boundary.test.ts
 */

import { Client } from "pg";
import {
  apiMultipartRequest,
  apiRequest,
  seedTestTenants,
} from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };
type ReadinessRequirement = {
  id: string;
  status: "covered" | "partial" | "missing";
  factSummary: {
    enteredValues: number;
    approvedValues: number;
    subperiodValues: number;
    requirementResponses: number;
    approvedRequirementResponses: number;
    requirementLinkedEvidence: number;
    approvedRequirementLinkedEvidence: number;
  };
};

type Fixture = {
  frameworkId: string;
  canonicalRequirementId: string;
  legacyRequirementId: string;
  narrativeRequirementId: string;
  evidenceRequirementId: string;
  periodRequirementId: string;
  canonicalDefinitionId: string;
  legacyDefinitionId: string;
  periodDefinitionId: string;
};

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseJson<T>(response: ApiResponse, context: string, expectedStatus = 200): T {
  assert(
    response.status === expectedStatus,
    `${context}: expected ${expectedStatus}, got ${response.status}: ${response.body.slice(0, 500)}`,
  );
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

async function createFixture(client: Client, suffix: string): Promise<Fixture> {
  const framework = (await client.query<{ id: string }>(
    `INSERT INTO frameworks (code, name, full_name, description, version, is_active)
     VALUES ($1, $2, $2, 'Readiness boundary API contract', '1.0', true)
     RETURNING id`,
    [`BOUNDARY-${suffix}`, `Readiness Boundary ${suffix}`],
  )).rows[0];

  async function createRequirement(code: string, type: "metric" | "narrative" | "evidence") {
    return (await client.query<{ id: string }>(
      `INSERT INTO framework_requirements
         (framework_id, code, title, description, requirement_type, pillar, mandatory_level, sort_order)
       VALUES ($1, $2, $3, 'Readiness boundary contract requirement', $4, 'governance', 'core', 1)
       RETURNING id`,
      [framework.id, `${code}-${suffix}`, `${code} ${suffix}`, type],
    )).rows[0].id;
  }

  async function createDefinition(code: string, name: string, evidenceRequired = false) {
    return (await client.query<{ id: string }>(
      `INSERT INTO metric_definitions
         (code, name, pillar, category, data_type, unit, input_frequency, is_core, is_active, evidence_required, rollup_method)
       VALUES ($1, $2, 'environmental', 'energy', 'numeric', 'kWh', 'monthly', true, true, $3, 'none')
       RETURNING id`,
      [
        `${code}-${suffix}`,
        `${name} ${suffix}`,
        evidenceRequired,
      ],
    )).rows[0];
  }

  const canonicalRequirementId = await createRequirement("BOUNDARY-CANONICAL", "metric");
  const legacyRequirementId = await createRequirement("BOUNDARY-LEGACY", "metric");
  const narrativeRequirementId = await createRequirement("BOUNDARY-NARRATIVE", "narrative");
  const evidenceRequirementId = await createRequirement("BOUNDARY-EVIDENCE", "evidence");
  const periodRequirementId = await createRequirement("BOUNDARY-PERIOD", "metric");
  const canonicalDefinition = await createDefinition("BOUNDARY-CANONICAL-DEF", "Boundary Canonical Metric");
  const legacyDefinition = await createDefinition("BOUNDARY-LEGACY-DEF", "Boundary Legacy Metric", true);
  const periodDefinition = await createDefinition("BOUNDARY-PERIOD-DEF", "Boundary Period Metric");

  for (const [metricDefinitionId, frameworkRequirementId] of [
    [canonicalDefinition.id, canonicalRequirementId],
    [legacyDefinition.id, legacyRequirementId],
    [periodDefinition.id, periodRequirementId],
  ]) {
    await client.query(
      `INSERT INTO metric_framework_mappings
         (metric_definition_id, framework_requirement_id, mapping_strength)
       VALUES ($1, $2, 'direct')`,
      [metricDefinitionId, frameworkRequirementId],
    );
  }

  return {
    frameworkId: framework.id,
    canonicalRequirementId,
    legacyRequirementId,
    narrativeRequirementId,
    evidenceRequirementId,
    periodRequirementId,
    canonicalDefinitionId: canonicalDefinition.id,
    legacyDefinitionId: legacyDefinition.id,
    periodDefinitionId: periodDefinition.id,
  };
}

async function createSite(token: string, name: string): Promise<string> {
  const response = parseJson<{ id: string }>(await apiRequest(
    "POST",
    "/api/sites",
    { name, type: "office", country: "United Kingdom" },
    token,
  ), "create site", 201);
  assert(response.id, "created site did not return an id");
  return response.id;
}

async function createMetric(token: string, name: string): Promise<string> {
  const response = parseJson<{ id: string }>(await apiRequest(
    "POST",
    "/api/metrics",
    {
      name,
      category: "environmental",
      unit: "kWh",
      enabled: true,
      metricType: "manual",
      direction: "lower_is_better",
      displayOrder: 9900,
    },
    token,
  ), "create legacy metric");
  assert(response.id, "created metric did not return an id");
  return response.id;
}

async function approveLegacyValue(input: {
  token: string;
  metricId: string;
  period: string;
  siteId: string | null;
  value: number;
}): Promise<string> {
  const value = parseJson<{ id: string }>(await apiRequest(
    "POST",
    "/api/data-entry",
    {
      metricId: input.metricId,
      period: input.period,
      siteId: input.siteId,
      value: input.value,
      dataSourceType: "manual",
      notes: "Framework readiness boundary regression",
    },
    input.token,
  ), `create ${input.period} Data Entry value`);

  parseJson(await apiRequest(
    "POST",
    "/api/workflow/submit",
    { entityType: "metric_value", entityIds: [value.id] },
    input.token,
  ), `submit ${input.period} Data Entry value`);
  parseJson(await apiRequest(
    "POST",
    "/api/workflow/review",
    { entityType: "metric_value", entityId: value.id, action: "approve", comment: "API regression" },
    input.token,
  ), `approve ${input.period} Data Entry value`);
  return value.id;
}

async function approveCanonicalValue(input: {
  token: string;
  metricDefinitionId: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  value: number;
}): Promise<string> {
  const created = parseJson<{ id: string }>(await apiRequest(
    "POST",
    "/api/metric-definition-values",
    {
      metricDefinitionId: input.metricDefinitionId,
      siteId: input.siteId,
      reportingPeriodStart: input.periodStart,
      reportingPeriodEnd: input.periodEnd,
      valueNumeric: input.value,
      sourceType: "manual",
      notes: "Framework readiness boundary regression",
    },
    input.token,
  ), "create canonical metric value");
  parseJson(await apiRequest(
    "POST",
    `/api/metric-definition-values/${created.id}/submit`,
    {},
    input.token,
  ), "submit canonical metric value");
  parseJson(await apiRequest(
    "POST",
    `/api/metric-definition-values/${created.id}/review`,
    { action: "approve" },
    input.token,
  ), "approve canonical metric value through review state machine");
  return created.id;
}

async function uploadReviewedMetricEvidence(input: {
  contributorToken: string;
  reviewerToken: string;
  metricId: string;
  siteId: string;
  period: string;
  filename: string;
}): Promise<string> {
  const form = new FormData();
  form.append("metricId", input.metricId);
  form.append("period", input.period);
  form.append("siteId", input.siteId);
  form.append("description", "Framework readiness boundary metric evidence");
  form.append("file", new Blob(["site-scoped metric evidence"], { type: "text/plain" }), input.filename);
  const evidence = parseJson<{ id: string }>(await apiMultipartRequest(
    "POST",
    "/api/evidence",
    form,
    input.contributorToken,
  ), "upload site-scoped metric evidence");
  parseJson(await apiRequest(
    "PUT",
    `/api/evidence/${evidence.id}`,
    { evidenceStatus: "reviewed" },
    input.reviewerToken,
  ), "review site-scoped metric evidence");
  return evidence.id;
}

async function getRequirement(input: {
  token: string;
  frameworkId: string;
  requirementId: string;
  period: string;
  siteId?: string | null;
}): Promise<ReadinessRequirement> {
  const params = new URLSearchParams({ period: input.period });
  if (input.siteId !== undefined) params.set("siteId", input.siteId ?? "null");
  const readiness = parseJson<Array<{
    framework: { id: string };
    requirements: ReadinessRequirement[];
  }>>(await apiRequest(
    "GET",
    `/api/framework-readiness?${params.toString()}`,
    undefined,
    input.token,
  ), `read framework readiness for ${input.period}`);
  const framework = readiness.find((item) => item.framework.id === input.frameworkId);
  assert(framework, "boundary framework missing from readiness response");
  const requirement = framework.requirements.find((item) => item.id === input.requirementId);
  assert(requirement, `requirement ${input.requirementId} missing from readiness response`);
  return requirement;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL env var not set");

  const { tenantA } = await seedTestTenants();
  const suffix = `${Date.now()}-${process.pid}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let fixture: Fixture | null = null;
  const siteIds: string[] = [];
  const metricIds: string[] = [];
  const evidenceIds: string[] = [];

  try {
    fixture = await createFixture(client, suffix);
    parseJson(await apiRequest(
      "PUT",
      `/api/framework-selections/${fixture.frameworkId}`,
      { isEnabled: true },
      tenantA.adminToken,
    ), "enable boundary framework");

    const archivedSiteId = await createSite(tenantA.adminToken, `Boundary Archived Site ${suffix}`);
    const activeSiteId = await createSite(tenantA.adminToken, `Boundary Active Site ${suffix}`);
    siteIds.push(archivedSiteId, activeSiteId);

    const legacyMetricId = await createMetric(tenantA.adminToken, `Boundary Legacy Metric ${suffix}`);
    const periodMetricId = await createMetric(tenantA.adminToken, `Boundary Period Metric ${suffix}`);
    metricIds.push(legacyMetricId, periodMetricId);

    const boundaryPeriod = "2196";
    let missingEvidenceBeforeArchive = 0;
    await approveCanonicalValue({
      token: tenantA.adminToken,
      metricDefinitionId: fixture.canonicalDefinitionId,
      siteId: archivedSiteId,
      periodStart: "2196-01-01T00:00:00.000Z",
      periodEnd: "2196-12-31T23:59:59.999Z",
      value: 100,
    });
    await approveLegacyValue({
      token: tenantA.adminToken,
      metricId: legacyMetricId,
      period: boundaryPeriod,
      siteId: archivedSiteId,
      value: 200,
    });
    evidenceIds.push(await uploadReviewedMetricEvidence({
      contributorToken: tenantA.contributorToken,
      reviewerToken: tenantA.adminToken,
      metricId: legacyMetricId,
      siteId: archivedSiteId,
      period: boundaryPeriod,
      filename: `archived-metric-${suffix}.txt`,
    }));

    const narrativeResponse = parseJson<{ id: string }>(await apiRequest(
      "PUT",
      `/api/framework-requirements/${fixture.narrativeRequirementId}/response`,
      {
        period: boundaryPeriod,
        siteId: archivedSiteId,
        responseText: "This approved disclosure belongs only to the soon-to-be archived site.",
        workflowStatus: "submitted",
      },
      tenantA.contributorToken,
    ), "create archived-site narrative response");
    parseJson(await apiRequest(
      "POST",
      `/api/framework-requirement-responses/${narrativeResponse.id}/review`,
      { workflowStatus: "approved", reviewComment: "Approved before site archival" },
      tenantA.adminToken,
    ), "approve archived-site narrative response");

    const evidenceForm = new FormData();
    evidenceForm.append("frameworkRequirementId", fixture.evidenceRequirementId);
    evidenceForm.append("period", boundaryPeriod);
    evidenceForm.append("siteId", archivedSiteId);
    evidenceForm.append("description", "Approved before site archival");
    evidenceForm.append("file", new Blob(["archived site evidence"], { type: "text/plain" }), `archived-${suffix}.txt`);
    const evidence = parseJson<{ id: string }>(await apiMultipartRequest(
      "POST",
      "/api/evidence",
      evidenceForm,
      tenantA.contributorToken,
    ), "upload archived-site requirement evidence");
    evidenceIds.push(evidence.id);
    parseJson(await apiRequest(
      "PUT",
      `/api/evidence/${evidence.id}`,
      { evidenceStatus: "reviewed" },
      tenantA.adminToken,
    ), "review archived-site requirement evidence");

    await check("active-site canonical, legacy, response, and evidence facts initially cover readiness", async () => {
      for (const requirementId of [
        fixture!.canonicalRequirementId,
        fixture!.legacyRequirementId,
        fixture!.narrativeRequirementId,
        fixture!.evidenceRequirementId,
      ]) {
        const requirement = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId,
          period: boundaryPeriod,
        });
        assert(requirement.status === "covered", `active-site fixture was not covered: ${requirementId}=${requirement.status}`);
      }
      const readiness = parseJson<{ missingCategories?: { missingEvidenceCount?: number } }>(await apiRequest(
        "GET",
        `/api/reports/readiness-detail?siteId=__all__&period=${boundaryPeriod}`,
        undefined,
        tenantA.viewerToken,
      ), "read whole-organisation report readiness before archival");
      missingEvidenceBeforeArchive = readiness.missingCategories?.missingEvidenceCount ?? 0;
    });

    parseJson(await apiRequest(
      "DELETE",
      `/api/sites/${archivedSiteId}`,
      undefined,
      tenantA.adminToken,
    ), "archive readiness fixture site");

    await check("archived-site canonical, legacy, response, and evidence facts cannot cover whole-organisation readiness", async () => {
      const expectations = [
        { label: "canonical metric", id: fixture!.canonicalRequirementId, count: "enteredValues" as const },
        { label: "legacy metric", id: fixture!.legacyRequirementId, count: "enteredValues" as const },
        { label: "narrative response", id: fixture!.narrativeRequirementId, count: "requirementResponses" as const },
        { label: "requirement evidence", id: fixture!.evidenceRequirementId, count: "requirementLinkedEvidence" as const },
      ];
      for (const expectation of expectations) {
        const requirement = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId: expectation.id,
          period: boundaryPeriod,
        });
        assert(
          requirement.status === "missing",
          `archived-site ${expectation.label} still produced ${requirement.status}: ${JSON.stringify(requirement.factSummary)}`,
        );
        assert(requirement.factSummary[expectation.count] === 0, `archived-site ${expectation.count} was still counted`);
        if (expectation.label === "legacy metric") {
          assert(requirement.factSummary.evidenceFiles === 0, "archived-site legacy metric evidence was still counted");
        }
      }
      const readiness = parseJson<{ missingCategories?: { missingEvidenceCount?: number } }>(await apiRequest(
        "GET",
        `/api/reports/readiness-detail?siteId=__all__&period=${boundaryPeriod}`,
        undefined,
        tenantA.viewerToken,
      ), "read whole-organisation report readiness after archival");
      assert(
        readiness.missingCategories?.missingEvidenceCount === missingEvidenceBeforeArchive + 1,
        "archived-site evidence still reduced the whole-organisation report-readiness gap",
      );
    });

    await approveCanonicalValue({
      token: tenantA.adminToken,
      metricDefinitionId: fixture.canonicalDefinitionId,
      siteId: activeSiteId,
      periodStart: "2196-01-01T00:00:00.000Z",
      periodEnd: "2196-12-31T23:59:59.999Z",
      value: 300,
    });
    await approveLegacyValue({
      token: tenantA.adminToken,
      metricId: legacyMetricId,
      period: boundaryPeriod,
      siteId: activeSiteId,
      value: 400,
    });
    evidenceIds.push(await uploadReviewedMetricEvidence({
      contributorToken: tenantA.contributorToken,
      reviewerToken: tenantA.adminToken,
      metricId: legacyMetricId,
      siteId: activeSiteId,
      period: boundaryPeriod,
      filename: `active-metric-${suffix}.txt`,
    }));

    await check("whole-organisation and explicit active-site scopes include active facts while org-only remains exact", async () => {
      for (const requirementId of [fixture!.canonicalRequirementId, fixture!.legacyRequirementId]) {
        const wholeOrganisation = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId,
          period: boundaryPeriod,
        });
        const activeSite = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId,
          period: boundaryPeriod,
          siteId: activeSiteId,
        });
        const organisationOnly = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId,
          period: boundaryPeriod,
          siteId: null,
        });
        assert(wholeOrganisation.status === "covered", `whole-organisation active fact was ${wholeOrganisation.status}`);
        assert(activeSite.status === "covered", `explicit active-site fact was ${activeSite.status}`);
        assert(
          organisationOnly.status === "missing",
          `org-only scope leaked ${requirementId} as ${organisationOnly.status}: ${JSON.stringify(organisationOnly.factSummary)}`,
        );
      }
    });

    await approveLegacyValue({
      token: tenantA.adminToken,
      metricId: periodMetricId,
      period: "2195-02",
      siteId: null,
      value: 50,
    });

    await check("monthly Data Entry facts are Partial in containing annual and quarterly readiness scopes", async () => {
      for (const outerPeriod of ["2195", "2195-Q1"]) {
        const requirement = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId: fixture!.periodRequirementId,
          period: outerPeriod,
          siteId: null,
        });
        assert(requirement.status === "partial", `${outerPeriod} readiness was ${requirement.status}, expected partial`);
        assert(requirement.factSummary.enteredValues === 1, `${outerPeriod} did not load the contained monthly fact`);
        assert(requirement.factSummary.approvedValues === 1, `${outerPeriod} did not retain approval state`);
        assert(requirement.factSummary.subperiodValues === 1, `${outerPeriod} did not mark the monthly fact as sub-period`);
      }

      const score = parseJson<{
        frameworks: Array<{
          id: string;
          covered: number;
          partial: number;
          missing: number;
          total: number;
          readinessPercent: number;
        }>;
      }>(await apiRequest(
        "GET",
        "/api/esg-scores/framework-readiness?period=2195&siteId=null",
        undefined,
        tenantA.viewerToken,
      ), "read strict annual framework score");
      const boundaryScore = score.frameworks.find((framework) => framework.id === fixture!.frameworkId);
      assert(boundaryScore, "boundary framework missing from framework score");
      assert(boundaryScore.covered === 0, `sub-period fact was counted as covered: ${JSON.stringify(boundaryScore)}`);
      assert(boundaryScore.partial === 1, `partial requirement was not shown separately: ${JSON.stringify(boundaryScore)}`);
      assert(boundaryScore.readinessPercent === 0, `partial requirement received score credit: ${JSON.stringify(boundaryScore)}`);
    });

    await approveLegacyValue({
      token: tenantA.adminToken,
      metricId: periodMetricId,
      period: "2195-Q1",
      siteId: null,
      value: 150,
    });
    await approveLegacyValue({
      token: tenantA.adminToken,
      metricId: periodMetricId,
      period: "2195",
      siteId: null,
      value: 600,
    });

    await check("exact outer-period legacy rows remain full coverage", async () => {
      for (const outerPeriod of ["2195-Q1", "2195"]) {
        const requirement = await getRequirement({
          token: tenantA.viewerToken,
          frameworkId: fixture!.frameworkId,
          requirementId: fixture!.periodRequirementId,
          period: outerPeriod,
          siteId: null,
        });
        assert(requirement.status === "covered", `${outerPeriod} exact outer-period fact was ${requirement.status}`);
        assert(requirement.factSummary.subperiodValues >= 1, `${outerPeriod} no longer exposed its contained sub-period fact`);
      }
    });
  } finally {
    for (const evidenceId of evidenceIds) {
      await apiRequest("DELETE", `/api/evidence/${evidenceId}`, undefined, tenantA.adminToken).catch(() => undefined);
    }
    if (fixture) {
      const requirementIds = [
        fixture.canonicalRequirementId,
        fixture.legacyRequirementId,
        fixture.narrativeRequirementId,
        fixture.evidenceRequirementId,
        fixture.periodRequirementId,
      ];
      const definitionIds = [
        fixture.canonicalDefinitionId,
        fixture.legacyDefinitionId,
        fixture.periodDefinitionId,
      ];
      await client.query("DELETE FROM evidence_files WHERE company_id = $1 AND linked_entity_id = ANY($2::varchar[])", [tenantA.companyId, requirementIds]);
      await client.query("DELETE FROM framework_requirement_responses WHERE company_id = $1 AND framework_requirement_id = ANY($2::varchar[])", [tenantA.companyId, requirementIds]);
      if (metricIds.length > 0) {
        await client.query("DELETE FROM metric_values WHERE metric_id = ANY($1::varchar[])", [metricIds]);
        await client.query("DELETE FROM metrics WHERE id = ANY($1::varchar[])", [metricIds]);
      }
      await client.query("DELETE FROM metric_definition_values WHERE business_id = $1 AND metric_definition_id = ANY($2::varchar[])", [tenantA.companyId, definitionIds]);
      await client.query("DELETE FROM business_framework_selections WHERE business_id = $1 AND framework_id = $2", [tenantA.companyId, fixture.frameworkId]);
      await client.query("DELETE FROM metric_framework_mappings WHERE framework_requirement_id = ANY($1::varchar[])", [requirementIds]);
      await client.query("DELETE FROM framework_requirements WHERE id = ANY($1::varchar[])", [requirementIds]);
      await client.query("DELETE FROM metric_definitions WHERE id = ANY($1::varchar[])", [definitionIds]);
      await client.query("DELETE FROM frameworks WHERE id = $1", [fixture.frameworkId]);
    }
    if (siteIds.length > 0) {
      await client.query("DELETE FROM organisation_sites WHERE company_id = $1 AND id = ANY($2::varchar[])", [tenantA.companyId, siteIds]);
    }
    await client.end();
  }
}

(async () => {
  console.log("\n=== API Tests: Framework Readiness Boundary ===\n");
  try {
    await run();
  } catch (error) {
    console.error("TEST FAILED:", error);
    process.exit(1);
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`\n=== Framework readiness boundary: ${passed}/${results.length} passed ===\n`);
  if (passed !== results.length) process.exit(1);
})();
