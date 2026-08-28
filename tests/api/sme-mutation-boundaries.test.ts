import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { apiRequest, loginAndGetToken, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };

function expectStatus(response: ApiResponse, expected: number | number[], label: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(allowed.includes(response.status), `${label}: expected ${allowed.join("/")}, got ${response.status}: ${response.body.slice(0, 500)}`);
}

function json<T = Record<string, any>>(response: ApiResponse): T {
  return JSON.parse(response.body) as T;
}

async function createSite(token: string, name: string): Promise<string> {
  const response = await apiRequest("POST", "/api/sites", { name, type: "office", country: "GB" }, token);
  expectStatus(response, 201, `create site ${name}`);
  return json<{ id: string }>(response).id;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const prefix = `SME_BOUNDARY_${Date.now()}_${process.pid}`;

  try {
    await client.query(
      "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = ANY($1::varchar[])",
      [[tenantA.companyId, tenantB.companyId]],
    );

    const siteA = await createSite(tenantA.adminToken, `${prefix} Site A`);
    const siteB = await createSite(tenantA.adminToken, `${prefix} Site B`);

    // Route validation and durable tenant predicates both preserve immutable
    // ownership while allowing ordinary same-tenant edits.
    expectStatus(await apiRequest("PUT", "/api/company/settings", { trackEnergy: true }, tenantA.adminToken), 200, "legitimate settings update");
    expectStatus(await apiRequest("PUT", "/api/company/settings", {
      trackEnergy: false,
      companyId: tenantB.companyId,
      id: "attacker-settings-id",
    }, tenantA.adminToken), 400, "settings mass assignment");
    const settingsOwner = await client.query<{ company_id: string; track_energy: boolean }>(
      "SELECT company_id, track_energy FROM company_settings WHERE company_id = $1",
      [tenantA.companyId],
    );
    assert.equal(settingsOwner.rows[0]?.company_id, tenantA.companyId);
    assert.equal(settingsOwner.rows[0]?.track_energy, true);

    const ownMetricResponse = await apiRequest("POST", "/api/metrics", {
      name: `${prefix} Own Metric`, category: "environmental", unit: "kWh", frequency: "monthly", enabled: true,
    }, tenantA.adminToken);
    expectStatus(ownMetricResponse, 200, "create own metric");
    const ownMetricId = json<{ id: string }>(ownMetricResponse).id;
    expectStatus(await apiRequest("PUT", `/api/metrics/${ownMetricId}`, { enabled: false }, tenantA.adminToken), 200, "same-tenant metric update");
    expectStatus(await apiRequest("PUT", `/api/metrics/${tenantB.metricId}`, { enabled: false }, tenantA.adminToken), 404, "cross-tenant metric update");
    expectStatus(await apiRequest("PUT", `/api/metrics/${ownMetricId}`, {
      enabled: true, companyId: tenantB.companyId, createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "metric mass assignment");
    assert.equal((await client.query<{ company_id: string; enabled: boolean }>(
      "SELECT company_id, enabled FROM metrics WHERE id = $1", [ownMetricId],
    )).rows[0]?.company_id, tenantA.companyId);

    const ownActionResponse = await apiRequest("POST", "/api/actions", {
      title: `${prefix} Action`, status: "not_started",
    }, tenantA.adminToken);
    expectStatus(ownActionResponse, 200, "create own action");
    const ownActionId = json<{ id: string }>(ownActionResponse).id;
    expectStatus(await apiRequest("PUT", `/api/actions/${ownActionId}`, { status: "in_progress" }, tenantA.adminToken), 200, "same-tenant action update");
    assert.ok(tenantB.actionId, "tenant B fixture action is required");
    expectStatus(await apiRequest("PUT", `/api/actions/${tenantB.actionId}`, { status: "complete" }, tenantA.adminToken), 404, "cross-tenant action update");
    expectStatus(await apiRequest("PUT", `/api/actions/${ownActionId}`, {
      title: "forged", companyId: tenantB.companyId, assignedUserId: "foreign-user",
    }, tenantA.adminToken), 400, "action mass assignment");

    // Identity-provider storage mutations are tenant-scoped in addition to
    // route ownership checks.
    const providerResponse = await apiRequest("POST", "/api/admin/identity-providers", {
      name: `${prefix} SSO`, providerType: "saml", domain: "example.test", config: { issuer: "test" }, isEnabled: false,
    }, tenantA.adminToken);
    expectStatus(providerResponse, 200, "create identity provider");
    const providerId = json<{ id: string }>(providerResponse).id;
    expectStatus(await apiRequest("PATCH", `/api/admin/identity-providers/${providerId}`, { isEnabled: true }, tenantA.adminToken), 200, "same-tenant identity provider update");
    expectStatus(await apiRequest("PATCH", `/api/admin/identity-providers/${providerId}`, { isEnabled: false }, tenantB.adminToken), 404, "cross-tenant identity provider update");
    expectStatus(await apiRequest("PATCH", `/api/admin/identity-providers/${providerId}`, {
      companyId: tenantB.companyId, createdBy: "foreign-user", createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "identity provider mass assignment");
    expectStatus(await apiRequest("DELETE", `/api/admin/identity-providers/${providerId}`, undefined, tenantB.adminToken), 404, "cross-tenant identity provider delete");
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity_providers WHERE id = $1 AND company_id = $2", [providerId, tenantA.companyId],
    )).rows[0]?.count ?? 0), 1);
    expectStatus(await apiRequest("DELETE", `/api/admin/identity-providers/${providerId}`, undefined, tenantA.adminToken), 200, "same-tenant identity provider delete");
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity_providers WHERE id = $1", [providerId],
    )).rows[0]?.count ?? 0), 0);

    const tenantAAdmin = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1", [tenantA.adminEmail],
    );
    const assessmentResponse = await apiRequest("POST", "/api/materiality/assessments", {
      assessmentYear: 2190, status: "draft", notes: `${prefix} assessment`,
    }, tenantA.adminToken);
    expectStatus(assessmentResponse, 200, "create materiality assessment");
    const assessmentId = json<{ id: string }>(assessmentResponse).id;
    expectStatus(await apiRequest("PATCH", `/api/materiality/assessments/${assessmentId}`, {
      status: "completed", completedAt: "2000-01-01T00:00:00.000Z", completedBy: "foreign-user",
    }, tenantA.adminToken), 400, "materiality completion metadata mass assignment");
    expectStatus(await apiRequest("PATCH", `/api/materiality/assessments/${assessmentId}`, {
      status: "completed",
    }, tenantA.adminToken), 200, "server-managed materiality completion");
    const completedAssessment = await client.query<{ completed_at: Date | null; completed_by: string | null }>(
      "SELECT completed_at, completed_by FROM business_materiality_assessments WHERE id = $1", [assessmentId],
    );
    assert.ok(completedAssessment.rows[0].completed_at);
    assert.equal(completedAssessment.rows[0].completed_by, tenantAAdmin.rows[0]?.id);
    const completionTimestamp = completedAssessment.rows[0].completed_at?.toISOString();
    expectStatus(await apiRequest("PATCH", `/api/materiality/assessments/${assessmentId}`, {
      notes: "Completion metadata remains stable",
    }, tenantA.adminToken), 200, "completed assessment note update");
    assert.equal((await client.query<{ completed_at: Date | null }>(
      "SELECT completed_at FROM business_materiality_assessments WHERE id = $1", [assessmentId],
    )).rows[0].completed_at?.toISOString(), completionTimestamp);
    expectStatus(await apiRequest("PATCH", `/api/materiality/assessments/${assessmentId}`, {
      status: "in_progress",
    }, tenantA.adminToken), 200, "reopen completed assessment");
    const reopenedAssessment = await client.query<{ completed_at: Date | null; completed_by: string | null }>(
      "SELECT completed_at, completed_by FROM business_materiality_assessments WHERE id = $1", [assessmentId],
    );
    assert.equal(reopenedAssessment.rows[0].completed_at, null);
    assert.equal(reopenedAssessment.rows[0].completed_by, null);

    // The remaining ESG administration surfaces reject generic ownership and
    // audit fields, validate tenant-local relationships, and preserve the few
    // explicitly global catalogue references.
    const topicsAResponse = await apiRequest("GET", "/api/materiality/topics", undefined, tenantA.adminToken);
    const topicsBResponse = await apiRequest("GET", "/api/materiality/topics", undefined, tenantB.adminToken);
    expectStatus(topicsAResponse, 200, "load tenant A material topics");
    expectStatus(topicsBResponse, 200, "load tenant B material topics");
    const ownMaterialTopicId = json<Array<{ id: string }>>(topicsAResponse)[0]?.id;
    const foreignMaterialTopicId = json<Array<{ id: string }>>(topicsBResponse)[0]?.id;
    assert.ok(ownMaterialTopicId && foreignMaterialTopicId, "material topic seeds are required");

    expectStatus(await apiRequest("POST", "/api/policy-records", {
      title: `${prefix} protected policy`, companyId: tenantB.companyId, ownerUserId: "foreign-user",
      createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "policy record protected fields");
    expectStatus(await apiRequest("POST", "/api/policy-records", {
      title: `${prefix} foreign-topic policy`, linkedMaterialTopicIds: [foreignMaterialTopicId],
    }, tenantA.adminToken), 400, "policy record foreign material topic");
    const policyRecordResponse = await apiRequest("POST", "/api/policy-records", {
      title: `${prefix} own policy`, policyType: "environmental", status: "draft",
      linkedMaterialTopicIds: [ownMaterialTopicId],
    }, tenantA.adminToken);
    expectStatus(policyRecordResponse, 200, "policy record same-tenant material topic");
    const policyRecordId = json<{ id: string }>(policyRecordResponse).id;
    const policyRecordBefore = (await client.query<{
      company_id: string; owner_user_id: string | null; created_at: Date | null; title: string;
    }>("SELECT company_id, owner_user_id, created_at, title FROM policy_records WHERE id = $1", [policyRecordId])).rows[0];
    expectStatus(await apiRequest("PATCH", `/api/policy-records/${policyRecordId}`, {
      title: "Forged policy", id: "forged-id", companyId: tenantB.companyId,
      ownerUserId: "foreign-user", updatedAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "policy record update protected fields");
    const policyRecordAfter = (await client.query<{
      company_id: string; owner_user_id: string | null; created_at: Date | null; title: string;
    }>("SELECT company_id, owner_user_id, created_at, title FROM policy_records WHERE id = $1", [policyRecordId])).rows[0];
    assert.deepEqual(policyRecordAfter, policyRecordBefore);
    expectStatus(await apiRequest("PATCH", `/api/policy-records/${policyRecordId}`, {
      title: `${prefix} updated own policy`, linkedMaterialTopicIds: [ownMaterialTopicId],
    }, tenantA.adminToken), 200, "policy record legitimate update");

    const governanceOtherAreaBefore = Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM governance_assignments WHERE company_id = $1 AND area = 'governance'", [tenantA.companyId],
    )).rows[0]?.count ?? 0);
    expectStatus(await apiRequest("PUT", "/api/governance-assignments/environment", {
      ownerName: "Environment lead", ownerTitle: "Director", responsibilities: "Own environmental controls",
    }, tenantA.adminToken), 200, "governance legitimate path-scoped upsert");
    const governanceBefore = (await client.query<{
      id: string; company_id: string; area: string; owner_name: string | null; owner_user_id: string | null; created_at: Date | null;
    }>("SELECT id, company_id, area, owner_name, owner_user_id, created_at FROM governance_assignments WHERE company_id = $1 AND area = 'environment'", [tenantA.companyId])).rows[0];
    expectStatus(await apiRequest("PUT", "/api/governance-assignments/environment", {
      ownerName: "Forged lead", area: "governance", companyId: tenantB.companyId,
      id: "forged-id", ownerUserId: "foreign-user", createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "governance body cannot override path or ownership");
    const governanceAfter = (await client.query<{
      id: string; company_id: string; area: string; owner_name: string | null; owner_user_id: string | null; created_at: Date | null;
    }>("SELECT id, company_id, area, owner_name, owner_user_id, created_at FROM governance_assignments WHERE id = $1", [governanceBefore.id])).rows[0];
    assert.deepEqual(governanceAfter, governanceBefore);
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM governance_assignments WHERE company_id = $1 AND area = 'governance'", [tenantA.companyId],
    )).rows[0]?.count ?? 0), governanceOtherAreaBefore);
    expectStatus(await apiRequest("PUT", "/api/governance-assignments/not_an_area", {
      ownerName: "Invalid area",
    }, tenantA.adminToken), 400, "invalid governance path area");

    const globalMetricDefinition = await client.query<{ id: string }>(
      "SELECT id FROM metric_definitions WHERE is_active = true ORDER BY code LIMIT 1",
    );
    assert.ok(globalMetricDefinition.rows[0]?.id, "active global metric definition is required");
    expectStatus(await apiRequest("POST", "/api/esg-targets", {
      title: `${prefix} protected target`, pillar: "environmental", id: "forged-id",
      companyId: tenantB.companyId, ownerUserId: "foreign-user", createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "ESG target protected fields");
    expectStatus(await apiRequest("POST", "/api/esg-targets", {
      title: `${prefix} foreign metric target`, pillar: "environmental", linkedMetricId: tenantB.metricId,
    }, tenantA.adminToken), 400, "ESG target foreign legacy metric");
    expectStatus(await apiRequest("POST", "/api/esg-targets", {
      title: `${prefix} foreign topic target`, pillar: "environmental", linkedMaterialTopicIds: [foreignMaterialTopicId],
    }, tenantA.adminToken), 400, "ESG target foreign material topic");
    const ownTargetResponse = await apiRequest("POST", "/api/esg-targets", {
      title: `${prefix} own ESG target`, pillar: "environmental", linkedMetricId: ownMetricId,
      linkedMetricDefinitionId: globalMetricDefinition.rows[0].id, linkedMaterialTopicIds: [ownMaterialTopicId],
      targetValue: 10, targetYear: 2191,
    }, tenantA.adminToken);
    expectStatus(ownTargetResponse, 200, "ESG target same-tenant and global references");
    const ownTargetId = json<{ id: string }>(ownTargetResponse).id;
    const ownTargetStored = (await client.query<{
      company_id: string; linked_metric_id: string | null; linked_metric_definition_id: string | null; owner_user_id: string | null;
    }>("SELECT company_id, linked_metric_id, linked_metric_definition_id, owner_user_id FROM esg_targets WHERE id = $1", [ownTargetId])).rows[0];
    assert.equal(ownTargetStored.company_id, tenantA.companyId);
    assert.equal(ownTargetStored.linked_metric_id, ownMetricId);
    assert.equal(ownTargetStored.linked_metric_definition_id, globalMetricDefinition.rows[0].id);
    assert.equal(ownTargetStored.owner_user_id, null);
    expectStatus(await apiRequest("PATCH", `/api/esg-targets/${ownTargetId}`, {
      title: "Forged target", companyId: tenantB.companyId, ownerUserId: "foreign-user",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "ESG target update protected fields");
    expectStatus(await apiRequest("PATCH", `/api/esg-targets/${ownTargetId}`, {
      status: "in_progress", linkedMetricId: ownMetricId,
      linkedMetricDefinitionId: globalMetricDefinition.rows[0].id, linkedMaterialTopicIds: [ownMaterialTopicId],
    }, tenantA.adminToken), 200, "ESG target legitimate update");
    const foreignTargetResponse = await apiRequest("POST", "/api/esg-targets", {
      title: `${prefix} tenant B target`, pillar: "social", linkedMetricId: tenantB.metricId,
      linkedMaterialTopicIds: [foreignMaterialTopicId],
    }, tenantB.adminToken);
    expectStatus(foreignTargetResponse, 200, "tenant B ESG target control");
    const foreignTargetId = json<{ id: string }>(foreignTargetResponse).id;
    expectStatus(await apiRequest("PATCH", `/api/esg-targets/${foreignTargetId}`, {
      status: "in_progress",
    }, tenantA.adminToken), 404, "cross-tenant ESG target update");

    expectStatus(await apiRequest("POST", "/api/esg-risks", {
      title: `${prefix} protected risk`, pillar: "environmental", riskType: "operational",
      likelihood: "high", impact: "medium", riskScore: 1, companyId: tenantB.companyId,
      ownerUserId: "foreign-user", createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "ESG risk protected fields and score");
    expectStatus(await apiRequest("POST", "/api/esg-risks", {
      title: `${prefix} foreign topic risk`, pillar: "environmental", riskType: "operational",
      likelihood: "high", impact: "medium", linkedMaterialTopicIds: [foreignMaterialTopicId],
    }, tenantA.adminToken), 400, "ESG risk foreign material topic");
    const ownRiskResponse = await apiRequest("POST", "/api/esg-risks", {
      title: `${prefix} own ESG risk`, pillar: "environmental", riskType: "operational",
      likelihood: "high", impact: "medium", linkedMaterialTopicIds: [ownMaterialTopicId],
    }, tenantA.adminToken);
    expectStatus(ownRiskResponse, 200, "ESG risk same-tenant material topic");
    const ownRiskId = json<{ id: string }>(ownRiskResponse).id;
    assert.equal(Number((await client.query<{ risk_score: number | null }>(
      "SELECT risk_score FROM esg_risks WHERE id = $1", [ownRiskId],
    )).rows[0].risk_score), 12, "risk score was not server-derived on create");
    expectStatus(await apiRequest("PATCH", `/api/esg-risks/${ownRiskId}`, {
      title: "Forged risk", riskScore: 1, companyId: tenantB.companyId, ownerUserId: "foreign-user",
    }, tenantA.adminToken), 400, "ESG risk update protected fields and score");
    expectStatus(await apiRequest("PATCH", `/api/esg-risks/${ownRiskId}`, {
      likelihood: "very_high", linkedMaterialTopicIds: [ownMaterialTopicId],
    }, tenantA.adminToken), 200, "ESG risk legitimate update");
    assert.equal(Number((await client.query<{ risk_score: number | null }>(
      "SELECT risk_score FROM esg_risks WHERE id = $1", [ownRiskId],
    )).rows[0].risk_score), 15, "risk score was not server-derived on update");
    const foreignRiskResponse = await apiRequest("POST", "/api/esg-risks", {
      title: `${prefix} tenant B risk`, pillar: "social", riskType: "social",
      likelihood: "low", impact: "high", linkedMaterialTopicIds: [foreignMaterialTopicId],
    }, tenantB.adminToken);
    expectStatus(foreignRiskResponse, 200, "tenant B ESG risk control");
    const foreignRiskId = json<{ id: string }>(foreignRiskResponse).id;
    expectStatus(await apiRequest("PATCH", `/api/esg-risks/${foreignRiskId}`, {
      status: "mitigated",
    }, tenantA.adminToken), 404, "cross-tenant ESG risk update");

    expectStatus(await apiRequest("POST", "/api/esg-actions", {
      title: `${prefix} protected ESG action`, targetId: ownTargetId, riskId: ownRiskId,
      id: "forged-id", companyId: tenantB.companyId, ownerUserId: "foreign-user",
      createdAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "ESG action protected fields");
    expectStatus(await apiRequest("POST", "/api/esg-actions", {
      title: `${prefix} foreign target action`, targetId: foreignTargetId, riskId: ownRiskId,
    }, tenantA.adminToken), 400, "ESG action foreign target");
    expectStatus(await apiRequest("POST", "/api/esg-actions", {
      title: `${prefix} foreign risk action`, targetId: ownTargetId, riskId: foreignRiskId,
    }, tenantA.adminToken), 400, "ESG action foreign risk");
    const ownEsgActionResponse = await apiRequest("POST", "/api/esg-actions", {
      title: `${prefix} own ESG action`, targetId: ownTargetId, riskId: ownRiskId,
      status: "not_started", progressPercent: 0,
    }, tenantA.adminToken);
    expectStatus(ownEsgActionResponse, 200, "ESG action same-tenant target and risk");
    const ownEsgActionId = json<{ id: string }>(ownEsgActionResponse).id;
    expectStatus(await apiRequest("PATCH", `/api/esg-actions/${ownEsgActionId}`, {
      status: "in_progress", progressPercent: 25, targetId: ownTargetId, riskId: ownRiskId,
    }, tenantA.adminToken), 200, "ESG action legitimate update");
    const ownEsgActionBeforeProtected = (await client.query<{
      company_id: string; owner_user_id: string | null; target_id: string | null; risk_id: string | null; progress_percent: number | null;
    }>("SELECT company_id, owner_user_id, target_id, risk_id, progress_percent FROM esg_actions WHERE id = $1", [ownEsgActionId])).rows[0];
    expectStatus(await apiRequest("PATCH", `/api/esg-actions/${ownEsgActionId}`, {
      progressPercent: 99, companyId: tenantB.companyId, ownerUserId: "foreign-user",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, tenantA.adminToken), 400, "ESG action update protected fields");
    assert.deepEqual((await client.query<{
      company_id: string; owner_user_id: string | null; target_id: string | null; risk_id: string | null; progress_percent: number | null;
    }>("SELECT company_id, owner_user_id, target_id, risk_id, progress_percent FROM esg_actions WHERE id = $1", [ownEsgActionId])).rows[0], ownEsgActionBeforeProtected);
    const foreignEsgActionResponse = await apiRequest("POST", "/api/esg-actions", {
      title: `${prefix} tenant B ESG action`, targetId: foreignTargetId, riskId: foreignRiskId,
    }, tenantB.adminToken);
    expectStatus(foreignEsgActionResponse, 200, "tenant B ESG action control");
    expectStatus(await apiRequest("PATCH", `/api/esg-actions/${json<{ id: string }>(foreignEsgActionResponse).id}`, {
      status: "complete",
    }, tenantA.adminToken), 404, "cross-tenant ESG action update");

    // Reporting-period enums/date shape return 4xx, exact retries serialize to
    // one row, and overlapping annual/quarterly/monthly periods remain valid.
    expectStatus(await apiRequest("POST", "/api/reporting-periods", {
      name: `${prefix} invalid type`, periodType: "weekly", startDate: "2180-01-01", endDate: "2180-01-31",
    }, tenantA.adminToken), 400, "invalid reporting period enum");
    expectStatus(await apiRequest("POST", "/api/reporting-periods", {
      name: `${prefix} invalid shape`, periodType: "annual", startDate: "2180-01-01T00:00:00.000Z", endDate: "2180-12-31",
    }, tenantA.adminToken), 400, "invalid reporting period date shape");

    const annualPayload = { name: `${prefix} FY2180`, periodType: "annual", startDate: "2180-01-01", endDate: "2180-12-31" };
    const concurrent = await Promise.all([
      apiRequest("POST", "/api/reporting-periods", annualPayload, tenantA.adminToken),
      apiRequest("POST", "/api/reporting-periods", annualPayload, tenantA.adminToken),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409], `concurrent duplicate statuses: ${concurrent.map((r) => r.status)}`);
    const annual = json<{ id: string }>(concurrent.find((r) => r.status === 201)!);
    expectStatus(await apiRequest("POST", "/api/reporting-periods", {
      name: `${prefix} Q1 2180`, periodType: "quarterly", startDate: "2180-01-01", endDate: "2180-03-31",
    }, tenantA.adminToken), 201, "overlapping quarter remains allowed");
    expectStatus(await apiRequest("POST", "/api/reporting-periods", {
      name: `${prefix} Jan 2180`, periodType: "monthly", startDate: "2180-01-01", endDate: "2180-01-31",
    }, tenantA.adminToken), 201, "overlapping month remains allowed");

    await client.query("DELETE FROM metric_targets WHERE metric_id = $1", [ownMetricId]);
    await client.query(
      `INSERT INTO metric_targets (metric_id, target_value, target_year)
       VALUES ($1, '10', 2181)`,
      [ownMetricId],
    );
    const actionCountBefore = Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM action_plans WHERE company_id = $1", [tenantA.companyId],
    )).rows[0]?.count ?? 0);
    const copyOne = await apiRequest("POST", `/api/reporting-periods/${annual.id}/copy-forward`, {
      name: `${prefix} FY2181`, periodType: "annual", startDate: "2181-01-01", endDate: "2181-12-31",
    }, tenantA.adminToken);
    expectStatus(copyOne, 201, "copy forward creates new period");
    const copied = json<{ copiedMetrics: number; copiedActions: number; carriedForwardMetrics: number; carriedForwardActions: number }>(copyOne);
    assert.equal(copied.copiedMetrics, 0);
    assert.equal(copied.copiedActions, 0);
    assert.ok(copied.carriedForwardMetrics >= 1);
    assert.ok(copied.carriedForwardActions >= 1);
    expectStatus(await apiRequest("POST", `/api/reporting-periods/${annual.id}/copy-forward`, {
      name: `${prefix} FY2181 retry`, periodType: "annual", startDate: "2181-01-01", endDate: "2181-12-31",
    }, tenantA.adminToken), 409, "copy-forward exact retry");
    expectStatus(await apiRequest("POST", `/api/reporting-periods/${annual.id}/copy-forward`, {
      name: `${prefix} FY2182`, periodType: "annual", startDate: "2182-01-01", endDate: "2182-12-31",
    }, tenantA.adminToken), 201, "second distinct copy forward");
    const actionCountAfter = Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM action_plans WHERE company_id = $1", [tenantA.companyId],
    )).rows[0]?.count ?? 0);
    assert.equal(actionCountAfter, actionCountBefore, "copy forward duplicated global action plans");

    // Questionnaire creation validates parent ownership and commits parent and
    // question rows together; updates require tenant + qId + questionId.
    const foreignPeriod = await client.query<{ id: string }>(
      `INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date)
       VALUES ($1, $2, 'annual', '2185-01-01', '2185-12-31') RETURNING id`,
      [tenantB.companyId, `${prefix} tenant B period`],
    );
    expectStatus(await apiRequest("POST", "/api/questionnaires", {
      title: `${prefix} foreign period questionnaire`, source: "test", questions: ["Question one?"], siteId: siteA,
      reportingPeriodId: foreignPeriod.rows[0].id,
    }, tenantA.adminToken), 400, "foreign reporting period questionnaire create");
    const questionnaireCountBefore = Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM questionnaires WHERE company_id = $1 AND title LIKE $2", [tenantA.companyId, `${prefix}%`],
    )).rows[0]?.count ?? 0);
    expectStatus(await apiRequest("POST", "/api/questionnaires", {
      title: `${prefix} invalid atomic questionnaire`, questions: ["Valid?", "   "], siteId: siteA,
    }, tenantA.adminToken), 400, "invalid questionnaire is rejected before parent insert");
    assert.equal(Number((await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM questionnaires WHERE company_id = $1 AND title LIKE $2", [tenantA.companyId, `${prefix}%`],
    )).rows[0]?.count ?? 0), questionnaireCountBefore);

    const questionnaireResponse = await apiRequest("POST", "/api/questionnaires", {
      title: `${prefix} own questionnaire`, source: "customer", questions: ["Question one?", "Question two?"], siteId: siteA,
    }, tenantA.adminToken);
    expectStatus(questionnaireResponse, 200, "atomic questionnaire create");
    const ownQuestionnaire = json<{ id: string; questions: Array<{ id: string }> }>(questionnaireResponse);
    assert.equal(ownQuestionnaire.questions.length, 2);
    const secondQuestionnaireResponse = await apiRequest("POST", "/api/questionnaires", {
      title: `${prefix} second questionnaire`, questions: ["Another question?"], siteId: siteA,
    }, tenantA.adminToken);
    expectStatus(secondQuestionnaireResponse, 200, "second own questionnaire create");
    const secondQuestionnaire = json<{ id: string; questions: Array<{ id: string }> }>(secondQuestionnaireResponse);
    expectStatus(await apiRequest("PUT", `/api/questionnaires/${ownQuestionnaire.id}/questions/${ownQuestionnaire.questions[0].id}`, {
      editedAnswer: "Legitimate answer", approved: true,
    }, tenantA.adminToken), 200, "same-questionnaire question update");
    expectStatus(await apiRequest("PUT", `/api/questionnaires/${secondQuestionnaire.id}/questions/${ownQuestionnaire.questions[0].id}`, {
      editedAnswer: "Wrong parent",
    }, tenantA.adminToken), 404, "mismatched own questionnaire and question");
    assert.ok(tenantB.questionnaireId, "tenant B fixture questionnaire is required");
    let foreignQuestion = await client.query<{ id: string }>(
      "SELECT id FROM questionnaire_questions WHERE questionnaire_id = $1 LIMIT 1", [tenantB.questionnaireId],
    );
    if (!foreignQuestion.rows[0]) {
      foreignQuestion = await client.query<{ id: string }>(
        `INSERT INTO questionnaire_questions (questionnaire_id, question_text, order_index)
         VALUES ($1, 'Foreign tenant question?', 0) RETURNING id`,
        [tenantB.questionnaireId],
      );
    }
    assert.ok(foreignQuestion.rows[0]?.id, "tenant B fixture question is required");
    expectStatus(await apiRequest("PUT", `/api/questionnaires/${ownQuestionnaire.id}/questions/${foreignQuestion.rows[0].id}`, {
      editedAnswer: "Foreign question",
    }, tenantA.adminToken), 404, "foreign question under owned parent");
    expectStatus(await apiRequest("PUT", `/api/questionnaires/${tenantB.questionnaireId}/questions/${foreignQuestion.rows[0].id}`, {
      editedAnswer: "Foreign parent",
    }, tenantA.adminToken), 404, "foreign questionnaire and question");

    // Estimate results match the Data Entry consumer, preserve an explicit
    // zero headcount, respect force, exact site scope, and rejected values.
    await client.query("UPDATE companies SET employee_count = 0, industry = 'Professional Services' WHERE id = $1", [tenantA.companyId]);
    let employeeMetric = await client.query<{ id: string }>(
      "SELECT id FROM metrics WHERE company_id = $1 AND name IN ('Total Employees', 'Employee Headcount') ORDER BY name LIMIT 1",
      [tenantA.companyId],
    );
    if (!employeeMetric.rows[0]) {
      employeeMetric = await client.query<{ id: string }>(
        `INSERT INTO metrics (company_id, name, category, unit, frequency, enabled, metric_type)
         VALUES ($1, 'Total Employees', 'social', 'people', 'monthly', true, 'manual') RETURNING id`,
        [tenantA.companyId],
      );
    }
    const employeeMetricId = employeeMetric.rows[0].id;
    await client.query("UPDATE metrics SET enabled = true, metric_type = 'manual' WHERE id = $1", [employeeMetricId]);
    await client.query("DELETE FROM metric_values WHERE metric_id = $1 AND period LIKE '2189-%'", [employeeMetricId]);
    const emptyEstimate = await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-01", metricIds: [employeeMetricId], siteId: siteB, force: false,
    }, tenantA.adminToken);
    expectStatus(emptyEstimate, 200, "site-scoped estimate prefill");
    const emptyBody = json<{ employeeCount: number; estimates: Array<{ metricId: string; estimatedValue: number; shouldPrefill: boolean }> }>(emptyEstimate);
    assert.equal(emptyBody.employeeCount, 0);
    assert.deepEqual(emptyBody.estimates.map((e) => ({ id: e.metricId, value: e.estimatedValue, prefill: e.shouldPrefill })), [
      { id: employeeMetricId, value: 0, prefill: true },
    ]);
    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId: employeeMetricId, period: "2189-01", value: 0, dataSourceType: "estimated", siteId: siteB,
    }, tenantA.adminToken), 200, "persist site estimate");
    const existingEstimate = json<{ estimates: Array<{ shouldPrefill: boolean }> }>(await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-01", metricIds: [employeeMetricId], siteId: siteB, force: false,
    }, tenantA.adminToken));
    assert.equal(existingEstimate.estimates[0]?.shouldPrefill, false);
    const forcedEstimate = json<{ estimates: Array<{ shouldPrefill: boolean }> }>(await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-01", metricIds: [employeeMetricId], siteId: siteB, force: true,
    }, tenantA.adminToken));
    assert.equal(forcedEstimate.estimates[0]?.shouldPrefill, true);
    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId: employeeMetricId, period: "2189-02", value: 4, dataSourceType: "manual", siteId: siteA,
    }, tenantA.adminToken), 200, "persist actual at site A");
    const siteBEstimate = json<{ estimates: Array<{ shouldPrefill: boolean }> }>(await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-02", metricIds: [employeeMetricId], siteId: siteB, force: false,
    }, tenantA.adminToken));
    assert.equal(siteBEstimate.estimates[0]?.shouldPrefill, true, "site A actual suppressed site B estimate");
    const siteAEstimate = json<{ estimates: unknown[] }>(await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-02", metricIds: [employeeMetricId], siteId: siteA, force: true,
    }, tenantA.adminToken));
    assert.equal(siteAEstimate.estimates.length, 0, "force must not overwrite an actual in the selected scope");
    await client.query(
      `INSERT INTO metric_values (metric_id, period, value, data_source_type, workflow_status, site_id)
       VALUES ($1, '2189-03', '9', 'manual', 'rejected', $2)`,
      [employeeMetricId, siteB],
    );
    const rejectedEstimate = json<{ estimates: Array<{ shouldPrefill: boolean }> }>(await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-03", metricIds: [employeeMetricId], siteId: siteB, force: false,
    }, tenantA.adminToken));
    assert.equal(rejectedEstimate.estimates[0]?.shouldPrefill, true, "rejected value suppressed correction estimate");
    expectStatus(await apiRequest("POST", "/api/data-entries/estimate", {
      period: "2189-99", metricIds: "not-an-array", force: "yes", siteId: siteB,
    } as any, tenantA.adminToken), 400, "malformed estimate request");

    // Generated policy timestamps/version and global template governance are
    // server-controlled.
    const template = await client.query<{ id: string; slug: string; description: string | null; enabled: boolean }>(
      "SELECT id, slug, description, COALESCE(enabled, true) AS enabled FROM policy_templates ORDER BY slug LIMIT 1",
    );
    assert.ok(template.rows[0], "policy template seed missing");
    const generated = await client.query<{ id: string }>(
      `INSERT INTO generated_policies (company_id, template_id, template_slug, title, status, content, version_number)
       VALUES ($1, $2, $3, $4, 'draft', '{}'::jsonb, 1) RETURNING id`,
      [tenantA.companyId, template.rows[0].id, template.rows[0].slug, `${prefix} generated policy`],
    );
    expectStatus(await apiRequest("PUT", `/api/generated-policies/${generated.rows[0].id}`, {
      status: "approved", approvedAt: "2000-01-01T00:00:00.000Z", versionNumber: 99,
    }, tenantA.adminToken), 400, "generated policy audit-field mass assignment");
    expectStatus(await apiRequest("PUT", `/api/generated-policies/${generated.rows[0].id}`, { status: "approved" }, tenantA.adminToken), 200, "server-managed policy approval");
    const approved = await client.query<{ company_id: string; approved_at: Date | null; version_number: number }>(
      "SELECT company_id, approved_at, version_number FROM generated_policies WHERE id = $1", [generated.rows[0].id],
    );
    assert.equal(approved.rows[0].company_id, tenantA.companyId);
    assert.ok(approved.rows[0].approved_at);
    assert.equal(approved.rows[0].version_number, 2);
    expectStatus(await apiRequest("PUT", `/api/generated-policies/${generated.rows[0].id}`, { title: "foreign update" }, tenantB.adminToken), 404, "cross-tenant generated policy update");

    expectStatus(await apiRequest("PUT", `/api/metrics/${ownMetricId}/admin`, {
      enabled: true, importance: "important",
    }, tenantA.adminToken), 200, "company admin tenant-local metric administration remains available");
    const tenantLocalMetric = (await client.query<{ company_id: string; enabled: boolean; importance: string | null }>(
      "SELECT company_id, enabled, importance FROM metrics WHERE id = $1", [ownMetricId],
    )).rows[0];
    assert.equal(tenantLocalMetric.company_id, tenantA.companyId);
    assert.equal(tenantLocalMetric.enabled, true);
    assert.equal(tenantLocalMetric.importance, "important");

    expectStatus(await apiRequest("PUT", `/api/policy-templates/${template.rows[0].slug}/admin`, {
      enabled: !template.rows[0].enabled,
    }, tenantA.adminToken), 403, "company admin global template update");
    const unchangedTemplate = await client.query<{ enabled: boolean }>("SELECT COALESCE(enabled, true) AS enabled FROM policy_templates WHERE id = $1", [template.rows[0].id]);
    assert.equal(unchangedTemplate.rows[0].enabled, template.rows[0].enabled);

    const superEmail = `${prefix.toLowerCase()}@super-admin.test`;
    const password = "Test1234!";
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (username, email, password, role, company_id, terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted)
       VALUES ($1, $2, $3, 'super_admin', NULL, NOW(), NOW(), '1.0', '1.0')`,
      [`super_${Date.now()}`, superEmail, passwordHash],
    );
    const superToken = await loginAndGetToken(superEmail, password);
    expectStatus(await apiRequest("PUT", `/api/policy-templates/${template.rows[0].slug}/admin`, {
      enabled: !template.rows[0].enabled,
      id: "forged-template-id", slug: "forged-slug", isSystem: false,
      createdAt: "2000-01-01T00:00:00.000Z",
    }, superToken), 400, "super admin cannot mass-assign global template identity fields");
    const protectedTemplate = await client.query<{ slug: string; enabled: boolean }>(
      "SELECT slug, COALESCE(enabled, true) AS enabled FROM policy_templates WHERE id = $1", [template.rows[0].id],
    );
    assert.equal(protectedTemplate.rows[0].slug, template.rows[0].slug);
    assert.equal(protectedTemplate.rows[0].enabled, template.rows[0].enabled);
    const superUpdate = await apiRequest("PUT", `/api/policy-templates/${template.rows[0].slug}/admin`, {
      enabled: !template.rows[0].enabled,
    }, superToken);
    expectStatus(superUpdate, 200, "super admin global template update");
    expectStatus(await apiRequest("PUT", `/api/policy-templates/${template.rows[0].slug}/admin`, {
      enabled: template.rows[0].enabled,
    }, superToken), 200, "super admin restores global template");

    console.log("SME mutation boundary regressions passed");
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
