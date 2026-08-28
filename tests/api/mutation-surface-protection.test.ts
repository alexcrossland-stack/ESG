import assert from "node:assert/strict";
import { Client } from "pg";
import { apiMultipartRequest, apiRequest, seedTestTenants } from "../fixtures/seed.js";

type ApiResponse = { status: number; body: string };

function expectStatus(response: ApiResponse, expected: number | number[], label: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    allowed.includes(response.status),
    `${label}: expected ${allowed.join("/")}, status=${response.status}, body=${response.body.slice(0, 500)}`,
  );
}

function body<T = Record<string, unknown>>(response: ApiResponse): T {
  return JSON.parse(response.body) as T;
}

async function createMetric(
  token: string,
  input: { name: string; enabled: boolean; metricType: "manual" | "calculated" | "derived" },
): Promise<string> {
  const response = await apiRequest("POST", "/api/metrics", {
    ...input,
    description: `${input.name} mutation-surface test`,
    category: "environmental",
    unit: "kWh",
    frequency: "monthly",
    direction: "lower_is_better",
  }, token);
  expectStatus(response, 200, `create ${input.name}`);
  const id = body<{ id?: string }>(response).id;
  assert.ok(id, `create ${input.name}: missing id`);
  return id;
}

async function createDefinition(
  client: Client,
  options: {
    code: string;
    name?: string;
    isActive?: boolean;
    isDerived?: boolean;
    formula?: Record<string, unknown> | null;
    sortOrder?: number;
    rollupMethod?: "sum" | "weighted_average" | "latest" | "none";
  },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO metric_definitions (
       code, name, pillar, category, data_type, input_frequency, is_core,
       is_active, is_derived, formula_json, sort_order, rollup_method
     ) VALUES ($1, $2, 'environmental', 'Mutation protection', 'numeric', 'monthly', false,
       $3, $4, $5::jsonb, $6, $7)
     RETURNING id`,
    [
      options.code,
      options.name ?? options.code,
      options.isActive ?? true,
      options.isDerived ?? false,
      options.formula ? JSON.stringify(options.formula) : null,
      options.sortOrder ?? 0,
      options.rollupMethod ?? "none",
    ],
  );
  return result.rows[0].id;
}

async function createCanonicalValue(
  token: string,
  input: {
    metricDefinitionId: string;
    start: string;
    end: string;
    value: string | null;
    siteId?: string | null;
    sourceType?: "manual" | "imported" | "api";
    notes?: string | null;
  },
): Promise<Record<string, any>> {
  const response = await apiRequest("POST", "/api/metric-definition-values", {
    metricDefinitionId: input.metricDefinitionId,
    reportingPeriodStart: input.start,
    reportingPeriodEnd: input.end,
    valueNumeric: input.value,
    ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  }, token);
  expectStatus(response, 200, "create canonical value");
  return body<Record<string, any>>(response);
}

async function canonicalRows(
  client: Client,
  businessId: string,
  definitionIds: string[],
  start: string,
  end: string,
  siteId: string | null,
) {
  return (await client.query<{
    id: string;
    metric_definition_id: string;
    value_numeric: string | null;
    source_type: string;
    status: string;
  }>(
    `SELECT id, metric_definition_id, value_numeric::text, source_type, status
     FROM metric_definition_values
     WHERE business_id = $1
       AND metric_definition_id = ANY($2::varchar[])
       AND reporting_period_start = $3::timestamp
       AND reporting_period_end = $4::timestamp
       AND site_id IS NOT DISTINCT FROM $5::varchar
     ORDER BY metric_definition_id`,
    [businessId, definitionIds, start, end, siteId],
  )).rows;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const token = tenantA.adminToken;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const prefix = `AUDIT_${Date.now()}_${process.pid}`;
  const provenanceTriggerName = `test_provenance_lock_${process.pid}`;
  const provenanceFunctionName = `test_provenance_lock_fn_${process.pid}`;
  const provenanceFilename = `mutation-provenance-lock-${process.pid}.txt`;
  let provenanceTriggerInstalled = false;
  const metricIds: string[] = [];
  const definitionIds: string[] = [];
  const siteIds: string[] = [];

  try {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [tenantA.companyId]);

    const siteResponse = await apiRequest("POST", "/api/sites", {
      name: `${prefix} Primary Site`,
      type: "office",
      country: "GB",
    }, token);
    expectStatus(siteResponse, 201, "create primary site");
    const primarySiteId = body<{ id: string }>(siteResponse).id;
    siteIds.push(primarySiteId);

    // Direct data entry accepts only active manual metrics and truthful user
    // provenance. Evidenced provenance is promoted by durable evidence.
    const manualMetricId = await createMetric(token, { name: `${prefix} Manual`, enabled: true, metricType: "manual" });
    const disabledMetricId = await createMetric(token, { name: `${prefix} Disabled`, enabled: false, metricType: "manual" });
    const calculatedMetricId = await createMetric(token, { name: `${prefix} Calculated`, enabled: true, metricType: "calculated" });
    metricIds.push(manualMetricId, disabledMetricId, calculatedMetricId);

    for (const metricId of [disabledMetricId, calculatedMetricId]) {
      const rejected = await apiRequest("POST", "/api/data-entry", {
        metricId,
        period: "2088-01",
        siteId: null,
        value: "1",
      }, token);
      expectStatus(rejected, 400, "disabled/calculated direct entry");
      assert.equal(body<{ code?: string }>(rejected).code, "METRIC_NOT_EDITABLE");
    }
    const forgedEvidenceSource = await apiRequest("POST", "/api/data-entry", {
      metricId: manualMetricId,
      period: "2088-01",
      siteId: null,
      value: "1",
      dataSourceType: "evidenced",
    }, token);
    expectStatus(forgedEvidenceSource, 400, "forged evidenced direct provenance");
    assert.equal(body<{ code?: string }>(forgedEvidenceSource).code, "INVALID_DATA_SOURCE_TYPE");
    expectStatus(await apiRequest("POST", "/api/data-entry", {
      metricId: manualMetricId,
      period: "2088-01",
      siteId: null,
      value: "Infinity",
    }, token), 400, "non-finite direct value");

    // CSV parsing must return every accepted row rather than silently keeping
    // only the first 100.
    const csv = ["Electricity (kWh)", ...Array.from({ length: 101 }, (_, index) => String(index + 1))].join("\n");
    const csvParse = await apiRequest("POST", "/api/raw-data/import/parse", {
      format: "csv",
      content: Buffer.from(csv).toString("base64"),
      siteId: primarySiteId,
    }, token);
    expectStatus(csvParse, 200, "101-row CSV parse");
    assert.equal(body<{ rows: unknown[] }>(csvParse).rows.length, 101, "CSV parser silently truncated accepted rows");

    // Legacy metric_evidence is tenant scoped, atomic with provenance, and
    // deletion is blocked after workflow/period protection.
    const legacyCreate = await apiRequest("POST", "/api/data-entry", {
      metricId: manualMetricId,
      period: "2088-02",
      siteId: null,
      value: "12.5",
      notes: "legacy evidence lifecycle",
      dataSourceType: "manual",
    }, token);
    expectStatus(legacyCreate, 200, "legacy evidence value setup");
    const legacyValueId = body<{ id: string }>(legacyCreate).id;

    const firstLegacyEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "first-legacy-evidence.pdf",
      fileUrl: "https://example.com/first-legacy-evidence.pdf",
    }, token);
    expectStatus(firstLegacyEvidence, 201, "attach first legacy metric evidence");
    const firstLegacyEvidenceId = body<{ id: string }>(firstLegacyEvidence).id;
    assert.equal((await client.query<{ source: string }>(
      "SELECT data_source_type::text AS source FROM metric_values WHERE id = $1",
      [legacyValueId],
    )).rows[0].source, "evidenced");

    expectStatus(await apiRequest("GET", `/api/metric-evidence/${legacyValueId}`, undefined, tenantB.adminToken), 404, "cross-tenant legacy evidence read");
    expectStatus(await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "foreign.pdf",
    }, tenantB.adminToken), 404, "cross-tenant legacy evidence attach");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${firstLegacyEvidenceId}`, undefined, tenantB.adminToken), 404, "cross-tenant legacy evidence delete");

    const secondLegacyEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "second-legacy-evidence.pdf",
      fileUrl: "https://example.com/second-legacy-evidence.pdf",
    }, token);
    expectStatus(secondLegacyEvidence, 201, "append legacy evidence");
    const secondLegacyEvidenceId = body<{ id: string }>(secondLegacyEvidence).id;
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${firstLegacyEvidenceId}`, undefined, token), 200, "delete one of two legacy evidence records");
    assert.equal((await client.query<{ source: string }>(
      "SELECT data_source_type::text AS source FROM metric_values WHERE id = $1",
      [legacyValueId],
    )).rows[0].source, "evidenced", "surviving evidence must preserve evidenced provenance");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${secondLegacyEvidenceId}`, undefined, token), 200, "delete last legacy evidence record");
    assert.equal((await client.query<{ source: string }>(
      "SELECT data_source_type::text AS source FROM metric_values WHERE id = $1",
      [legacyValueId],
    )).rows[0].source, "manual", "zero linked evidence must not retain evidenced provenance");

    const approvedEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "approved-evidence.pdf",
    }, token);
    expectStatus(approvedEvidence, 201, "attach evidence before approval");
    const approvedEvidenceId = body<{ id: string }>(approvedEvidence).id;
    await client.query("UPDATE metric_values SET workflow_status = 'approved' WHERE id = $1", [legacyValueId]);
    const appendedToApproved = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "approved-append.pdf",
    }, token);
    expectStatus(appendedToApproved, 201, "append evidence to an unchanged approved legacy value");
    const approvedAppendId = body<{ id: string }>(appendedToApproved).id;
    for (const evidenceId of [approvedEvidenceId, approvedAppendId]) {
      const protectedDelete = await apiRequest("DELETE", `/api/metric-evidence/${evidenceId}`, undefined, token);
      expectStatus(protectedDelete, 409, "approved legacy evidence deletion");
      assert.equal(body<{ code?: string }>(protectedDelete).code, "VALUE_PROTECTED");
    }
    await client.query("UPDATE metric_values SET workflow_status = 'draft' WHERE id = $1", [legacyValueId]);
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${approvedAppendId}`, undefined, token), 200, "remove approved append after revision");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${approvedEvidenceId}`, undefined, token), 200, "remove final approved evidence after revision");

    const lockedEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "locked-evidence.pdf",
    }, token);
    expectStatus(lockedEvidence, 201, "attach evidence before value lock");
    const lockedEvidenceId = body<{ id: string }>(lockedEvidence).id;
    await client.query("UPDATE metric_values SET locked = true WHERE id = $1", [legacyValueId]);
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${lockedEvidenceId}`, undefined, token), 409, "locked legacy evidence deletion");
    expectStatus(await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "locked-append.pdf",
    }, token), 409, "locked legacy evidence append");
    await client.query("UPDATE metric_values SET locked = false WHERE id = $1", [legacyValueId]);
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${lockedEvidenceId}`, undefined, token), 200, "remove evidence after unlock");

    // A historical metric_evidence row protects bulk mutation even if the
    // legacy provenance label itself was not promoted.
    const bulkEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: legacyValueId,
      fileName: "bulk-protection.pdf",
    }, token);
    expectStatus(bulkEvidence, 201, "attach bulk protection evidence");
    const bulkEvidenceId = body<{ id: string }>(bulkEvidence).id;
    await client.query("UPDATE metric_values SET data_source_type = 'manual' WHERE id = $1", [legacyValueId]);
    const bulkPreview = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "validate",
      siteId: null,
      cells: [{ metricId: manualMetricId, period: "2088-02", rawValue: "99" }],
    }, token);
    expectStatus(bulkPreview, 200, "metric_evidence bulk validation");
    const bulkCell = body<{ cells: Array<{ protected?: boolean; protectionReason?: string }> }>(bulkPreview).cells[0];
    assert.equal(bulkCell.protected, true);
    assert.equal(bulkCell.protectionReason, "evidenced");
    expectStatus(await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "commit",
      siteId: null,
      cells: [{ metricId: manualMetricId, period: "2088-02", rawValue: "99" }],
    }, token), 409, "metric_evidence bulk commit");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${bulkEvidenceId}`, undefined, token), 200, "bulk evidence cleanup");

    // The current evidence_files path has the same truthful last-evidence
    // fallback and cannot remove evidence from submitted values.
    const upload = new FormData();
    upload.append("metricId", manualMetricId);
    upload.append("period", "2088-03");
    upload.append("siteId", "null");
    upload.append("value", "21");
    upload.append("notes", "direct file lifecycle");
    upload.append("attachments", new Blob(["evidence bytes"], { type: "text/plain" }), "direct-evidence.txt");
    const uploaded = await apiMultipartRequest("POST", "/api/data-entry", upload, token);
    expectStatus(uploaded, 200, "direct evidence upload");
    const uploadedBody = body<{ id: string; newlyCreatedAttachments?: Array<{ id: string }>; attachments?: Array<{ id: string }> }>(uploaded);
    const directValueId = uploadedBody.id;
    const firstDirectFileId = uploadedBody.newlyCreatedAttachments?.[0]?.id ?? uploadedBody.attachments?.[0]?.id;
    assert.ok(firstDirectFileId, "direct upload response omitted attachment id");
    assert.equal((await client.query<{ source: string }>(
      "SELECT data_source_type::text AS source FROM metric_values WHERE id = $1",
      [directValueId],
    )).rows[0].source, "evidenced");
    expectStatus(await apiRequest("DELETE", `/api/evidence/${firstDirectFileId}`, undefined, tenantB.adminToken), 404, "cross-tenant direct evidence delete");
    expectStatus(await apiRequest("DELETE", `/api/evidence/${firstDirectFileId}`, undefined, token), 200, "delete last direct evidence file");
    assert.equal((await client.query<{ source: string }>(
      "SELECT data_source_type::text AS source FROM metric_values WHERE id = $1",
      [directValueId],
    )).rows[0].source, "manual", "last direct file deletion must restore manual provenance");

    const secondUpload = new FormData();
    secondUpload.append("metricId", manualMetricId);
    secondUpload.append("period", "2088-03");
    secondUpload.append("siteId", "null");
    secondUpload.append("value", "21");
    secondUpload.append("notes", "direct file lifecycle");
    secondUpload.append("attachments", new Blob(["second evidence"], { type: "text/plain" }), "direct-evidence-2.txt");
    const secondUploaded = await apiMultipartRequest("POST", "/api/data-entry", secondUpload, token);
    expectStatus(secondUploaded, 200, "second direct evidence upload");
    const secondUploadedBody = body<{ newlyCreatedAttachments?: Array<{ id: string }>; attachments?: Array<{ id: string }> }>(secondUploaded);
    const secondDirectFileId = secondUploadedBody.newlyCreatedAttachments?.[0]?.id ?? secondUploadedBody.attachments?.[0]?.id;
    assert.ok(secondDirectFileId, "second upload response omitted attachment id");
    await client.query("UPDATE metric_values SET workflow_status = 'submitted' WHERE id = $1", [directValueId]);
    expectStatus(await apiRequest("DELETE", `/api/evidence/${secondDirectFileId}`, undefined, token), 409, "submitted direct evidence deletion");
    await client.query("UPDATE metric_values SET workflow_status = 'draft' WHERE id = $1", [directValueId]);
    expectStatus(await apiRequest("DELETE", `/api/evidence/${secondDirectFileId}`, undefined, token), 200, "direct evidence delete after revision");

    // If a period lock wins after the file is already durable but before the
    // source label is promoted, retain both successful writes and surface an
    // explicit partial outcome. A test-only trigger deterministically closes
    // that otherwise tiny race window.
    await client.query(`
      CREATE FUNCTION ${provenanceFunctionName}() RETURNS trigger AS $$
      BEGIN
        IF NEW.filename = '${provenanceFilename}'
           AND NEW.storage_path IS NOT NULL
           AND OLD.storage_path IS NULL THEN
          INSERT INTO data_entry_period_locks (company_id, period, locked_by)
          VALUES (NEW.company_id, NEW.linked_period, NEW.uploaded_by)
          ON CONFLICT (company_id, period) DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER ${provenanceTriggerName}
      AFTER UPDATE OF storage_path ON evidence_files
      FOR EACH ROW EXECUTE FUNCTION ${provenanceFunctionName}();
    `);
    provenanceTriggerInstalled = true;
    const provenanceRaceUpload = new FormData();
    provenanceRaceUpload.append("metricId", manualMetricId);
    provenanceRaceUpload.append("period", "2088-04");
    provenanceRaceUpload.append("siteId", "null");
    provenanceRaceUpload.append("value", "31");
    provenanceRaceUpload.append("notes", "period-lock provenance race");
    provenanceRaceUpload.append("dataSourceType", "manual");
    provenanceRaceUpload.append(
      "attachments",
      new Blob(["durable evidence before period lock"], { type: "text/plain" }),
      provenanceFilename,
    );
    const provenanceRace = await apiMultipartRequest("POST", "/api/data-entry", provenanceRaceUpload, token);
    expectStatus(provenanceRace, 409, "period lock after durable evidence linkage");
    const provenanceRaceBody = body<Record<string, any>>(provenanceRace);
    assert.equal(provenanceRaceBody.code, "EVIDENCE_PROVENANCE_PARTIAL_SUCCESS");
    assert.equal(provenanceRaceBody.partialSuccess, true);
    assert.equal(provenanceRaceBody.attachmentRetained, true);
    assert.equal(provenanceRaceBody.savedMetricValue?.dataSourceType, "manual");
    const retainedEvidenceId = provenanceRaceBody.retainedAttachments?.[0]?.id;
    assert.ok(retainedEvidenceId, "partial-success response omitted retained evidence id");
    const retainedRaceState = (await client.query<{
      source: string;
      evidence_count: string;
      durable_count: string;
    }>(
      `SELECT mv.data_source_type::text AS source,
              COUNT(ef.id)::text AS evidence_count,
              COUNT(*) FILTER (WHERE ef.file_url IS NOT NULL AND ef.storage_path IS NOT NULL)::text AS durable_count
       FROM metric_values mv
       LEFT JOIN evidence_files ef
         ON ef.linked_module = 'metric_value' AND ef.linked_entity_id = mv.id
       WHERE mv.id = $1
       GROUP BY mv.id`,
      [provenanceRaceBody.metricValueId],
    )).rows[0];
    assert.equal(retainedRaceState.source, "manual", "period lock was bypassed by provenance promotion");
    assert.equal(retainedRaceState.evidence_count, "1", "durable evidence was compensated away");
    assert.equal(retainedRaceState.durable_count, "1", "retained evidence was not fully persisted");
    await client.query(`DROP TRIGGER ${provenanceTriggerName} ON evidence_files`);
    await client.query(`DROP FUNCTION ${provenanceFunctionName}()`);
    provenanceTriggerInstalled = false;
    await client.query(
      "DELETE FROM data_entry_period_locks WHERE company_id = $1 AND period = '2088-04'",
      [tenantA.companyId],
    );
    expectStatus(await apiRequest("DELETE", `/api/evidence/${retainedEvidenceId}`, undefined, token), 200, "retained race evidence cleanup");

    // Canonical definitions used for protection and calculation contracts.
    const evidenceDefId = await createDefinition(client, { code: `${prefix}_EVIDENCE` });
    const precisionDefId = await createDefinition(client, { code: `${prefix}_PRECISION` });
    const inactiveDefId = await createDefinition(client, { code: `${prefix}_INACTIVE`, isActive: false });
    const derivedManualDefId = await createDefinition(client, {
      code: `${prefix}_DERIVED_MANUAL`,
      isDerived: true,
      formula: { type: "expression", sources: [`${prefix}_EVIDENCE`], expression: `${prefix}_EVIDENCE * 2` },
    });
    definitionIds.push(evidenceDefId, precisionDefId, inactiveDefId, derivedManualDefId);
    const canonicalStart = "2089-01-01T00:00:00.000Z";
    const canonicalEnd = "2089-01-31T23:59:59.999Z";

    expectStatus(await apiRequest("GET", "/api/metric-definition-values?periodStart=not-a-date", undefined, token), 400, "invalid canonical GET date");
    expectStatus(await apiRequest("GET", "/api/metric-definition-values?periodStart=2089-02-01&periodEnd=2089-01-01", undefined, token), 400, "descending canonical GET range");
    for (const metricDefinitionId of [inactiveDefId, derivedManualDefId]) {
      expectStatus(await apiRequest("POST", "/api/metric-definition-values", {
        metricDefinitionId,
        reportingPeriodStart: canonicalStart,
        reportingPeriodEnd: canonicalEnd,
        valueNumeric: "1",
      }, token), 400, "inactive/derived canonical direct entry");
    }
    expectStatus(await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId: evidenceDefId,
      reportingPeriodStart: canonicalStart,
      reportingPeriodEnd: canonicalEnd,
      valueNumeric: "7",
      sourceType: "calculated",
    }, token), 400, "forged canonical calculated provenance");

    const canonicalEvidenceValue = await createCanonicalValue(token, {
      metricDefinitionId: evidenceDefId,
      start: canonicalStart,
      end: canonicalEnd,
      value: "7",
      sourceType: "manual",
    });
    const canonicalEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: canonicalEvidenceValue.id,
      fileName: "canonical-evidence.pdf",
      fileUrl: "https://example.com/canonical-evidence.pdf",
    }, token);
    expectStatus(canonicalEvidence, 201, "canonical evidence attach");
    const canonicalEvidenceId = body<{ id: string }>(canonicalEvidence).id;
    expectStatus(await apiRequest("GET", `/api/metric-evidence/${canonicalEvidenceValue.id}`, undefined, tenantB.adminToken), 404, "cross-tenant canonical evidence read");
    expectStatus(await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: canonicalEvidenceValue.id,
      fileName: "foreign-canonical.pdf",
    }, tenantB.adminToken), 404, "cross-tenant canonical evidence attach");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${canonicalEvidenceId}`, undefined, tenantB.adminToken), 404, "cross-tenant canonical evidence delete");

    const exactCanonicalNoop = await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId: evidenceDefId,
      reportingPeriodStart: canonicalStart,
      reportingPeriodEnd: canonicalEnd,
      valueNumeric: "7.000000",
    }, token);
    expectStatus(exactCanonicalNoop, 200, "evidenced canonical exact no-op");
    assert.equal(body<{ status: string }>(exactCanonicalNoop).status, "draft");
    const changedCanonical = await apiRequest("PATCH", `/api/metric-definition-values/${canonicalEvidenceValue.id}`, {
      valueNumeric: "8",
    }, token);
    expectStatus(changedCanonical, 409, "evidenced canonical mutation");
    assert.equal(body<{ code?: string }>(changedCanonical).code, "VALUE_PROTECTED");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${canonicalEvidenceId}`, undefined, token), 200, "canonical evidence delete while draft");
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${canonicalEvidenceValue.id}`, {
      valueNumeric: "8",
    }, token), 200, "canonical mutation after evidence removal");

    const submittedCanonicalEvidence = await apiRequest("POST", "/api/metric-evidence", {
      metricValueId: canonicalEvidenceValue.id,
      fileName: "canonical-submitted-evidence.pdf",
    }, token);
    expectStatus(submittedCanonicalEvidence, 201, "canonical evidence reattach");
    const submittedCanonicalEvidenceId = body<{ id: string }>(submittedCanonicalEvidence).id;
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${canonicalEvidenceValue.id}/submit`, {}, token), 200, "canonical submit");
    expectStatus(await apiRequest("DELETE", `/api/metric-evidence/${submittedCanonicalEvidenceId}`, undefined, token), 409, "submitted canonical evidence delete");
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${canonicalEvidenceValue.id}`, {
      status: "approved",
    }, token), 400, "canonical status smuggling through PATCH");
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${canonicalEvidenceValue.id}/review`, {
      action: "approve",
    }, token), 200, "canonical approve transition");
    const approvedNoop = await apiRequest("PATCH", `/api/metric-definition-values/${canonicalEvidenceValue.id}`, {
      valueNumeric: "8.000000",
    }, token);
    expectStatus(approvedNoop, 200, "approved canonical exact no-op");
    assert.equal(body<{ status: string }>(approvedNoop).status, "approved", "exact no-op changed canonical status");
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${canonicalEvidenceValue.id}`, {
      valueNumeric: "9",
    }, token), 409, "approved canonical mutation");

    // Decimal no-op comparison must not collapse distinct values through
    // JavaScript's unsafe integer range.
    const precisionValue = await createCanonicalValue(token, {
      metricDefinitionId: precisionDefId,
      start: canonicalStart,
      end: canonicalEnd,
      value: "99999999999999.000001",
    });
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${precisionValue.id}/submit`, {}, token), 200, "precision value submit");
    const missingRejectComment = await apiRequest("POST", `/api/metric-definition-values/${precisionValue.id}/review`, {
      action: "reject",
      comment: "   ",
    }, token);
    expectStatus(missingRejectComment, 400, "canonical rejection requires feedback");
    assert.equal((await client.query<{ status: string }>(
      "SELECT status::text FROM metric_definition_values WHERE id = $1",
      [precisionValue.id],
    )).rows[0].status, "submitted");

    const concurrentReview = await Promise.all([
      apiRequest("POST", `/api/metric-definition-values/${precisionValue.id}/review`, { action: "approve" }, token),
      apiRequest("POST", `/api/metric-definition-values/${precisionValue.id}/review`, { action: "reject", comment: "concurrent rejection" }, token),
    ]);
    assert.deepEqual(concurrentReview.map((response) => response.status).sort(), [200, 409], "canonical reviews were not serialized");
    const reviewAuditCount = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
       WHERE company_id = $1 AND entity_id = $2
         AND action IN ('metric_definition_value_approve', 'metric_definition_value_reject')`,
      [tenantA.companyId, precisionValue.id],
    );
    assert.equal(reviewAuditCount.rows[0].count, "1", "competing canonical reviews created more than one transition audit");
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${precisionValue.id}`, {
      valueNumeric: "99999999999999.000002",
    }, token), 409, "high-precision protected value mutation");
    expectStatus(await apiRequest("GET", `/api/metric-definition-values?metricDefinitionId=${precisionDefId}`, undefined, tenantB.adminToken), 200, "cross-tenant canonical list remains an empty scoped response");
    assert.equal(body<unknown[]>(await apiRequest("GET", `/api/metric-definition-values?metricDefinitionId=${precisionDefId}`, undefined, tenantB.adminToken)).length, 0);
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${precisionValue.id}`, {
      valueNumeric: "99999999999999.000001",
    }, tenantB.adminToken), 404, "cross-tenant canonical patch");

    // Topological calculation, stale clearing, rejected-source exclusion, and
    // review audit feedback.
    const baseCode = `${prefix}_BASE`;
    const middleCode = `${prefix}_MIDDLE`;
    const topCode = `${prefix}_TOP`;
    const baseDefId = await createDefinition(client, { code: baseCode, sortOrder: 30 });
    const topDefId = await createDefinition(client, {
      code: topCode,
      isDerived: true,
      sortOrder: 1,
      formula: { type: "expression", sources: [middleCode], expression: `${middleCode} + 1` },
    });
    const middleDefId = await createDefinition(client, {
      code: middleCode,
      isDerived: true,
      sortOrder: 20,
      formula: { type: "expression", sources: [baseCode], expression: `${baseCode} * 2` },
    });
    definitionIds.push(baseDefId, topDefId, middleDefId);
    const chainStart = "2090-01-01T00:00:00.000Z";
    const chainEnd = "2090-01-31T23:59:59.999Z";
    const baseValue = await createCanonicalValue(token, {
      metricDefinitionId: baseDefId,
      start: chainStart,
      end: chainEnd,
      value: "10",
    });
    let chainRows = await canonicalRows(client, tenantA.companyId, [middleDefId, topDefId], chainStart, chainEnd, null);
    assert.equal(Number(chainRows.find((row) => row.metric_definition_id === middleDefId)?.value_numeric), 20);
    assert.equal(Number(chainRows.find((row) => row.metric_definition_id === topDefId)?.value_numeric), 21, "derived chain did not run in dependency order");

    const clearedChainResponse = await apiRequest(
      "PATCH",
      `/api/metric-definition-values/${baseValue.id}`,
      { valueNumeric: null },
      token,
    );
    expectStatus(clearedChainResponse, 200, "clear canonical base source");
    const clearedChainBody = body<Record<string, any>>(clearedChainResponse);
    assert.equal(clearedChainBody.partialSuccess, true, "destructive dependent clears must be visible to the caller");
    assert.ok(clearedChainBody.calculationCleared?.includes(middleCode));
    assert.ok(clearedChainBody.calculationCleared?.includes(topCode));
    assert.ok(clearedChainBody.calculationSkippedMissing?.includes(middleCode));
    assert.ok(clearedChainBody.calculationSkippedMissing?.includes(topCode));
    chainRows = await canonicalRows(client, tenantA.companyId, [middleDefId, topDefId], chainStart, chainEnd, null);
    assert.equal(chainRows.length, 0, "stale calculated descendants survived a missing source");
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${baseValue.id}`, { valueNumeric: "10" }, token), 200, "restore canonical base source");
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${baseValue.id}/submit`, {}, token), 200, "chain source submit");
    const rejectedChain = await apiRequest("POST", `/api/metric-definition-values/${baseValue.id}/review`, {
      action: "reject",
      comment: "Source evidence was not acceptable",
    }, token);
    expectStatus(rejectedChain, 200, "reject chain source");
    chainRows = await canonicalRows(client, tenantA.companyId, [middleDefId, topDefId], chainStart, chainEnd, null);
    assert.equal(chainRows.length, 0, "rejected source continued to drive derived values");
    const rejectionAudit = await client.query<{ comment: string | null }>(
      `SELECT details->>'comment' AS comment FROM audit_logs
       WHERE company_id = $1 AND entity_id = $2 AND action = 'metric_definition_value_reject'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantA.companyId, baseValue.id],
    );
    assert.equal(rejectionAudit.rows[0]?.comment, "Source evidence was not acceptable");
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${baseValue.id}/revise`, {}, token), 200, "revise rejected chain source");
    chainRows = await canonicalRows(client, tenantA.companyId, [middleDefId, topDefId], chainStart, chainEnd, null);
    assert.equal(Number(chainRows.find((row) => row.metric_definition_id === topDefId)?.value_numeric), 21, "revision did not restore dependent calculations");

    // Exact-scope loading must not consume a contained monthly fact for an
    // annual formula; the stale annual calculation is removed.
    const exactSourceCode = `${prefix}_EXACT_SOURCE`;
    const exactDerivedCode = `${prefix}_EXACT_DERIVED`;
    const exactTriggerCode = `${prefix}_EXACT_TRIGGER`;
    const exactSourceDefId = await createDefinition(client, { code: exactSourceCode });
    const exactDerivedDefId = await createDefinition(client, {
      code: exactDerivedCode,
      isDerived: true,
      formula: { type: "expression", sources: [exactSourceCode], expression: `${exactSourceCode} * 3` },
    });
    const exactTriggerDefId = await createDefinition(client, { code: exactTriggerCode });
    definitionIds.push(exactSourceDefId, exactDerivedDefId, exactTriggerDefId);
    const annualStart = "2091-01-01T00:00:00.000Z";
    const annualEnd = "2091-12-31T23:59:59.999Z";
    await client.query(
      `INSERT INTO metric_definition_values (
         business_id, metric_definition_id, site_id, reporting_period_start, reporting_period_end,
         value_numeric, source_type, status
       ) VALUES
         ($1, $2, NULL, '2091-02-01'::timestamp, '2091-02-28 23:59:59.999'::timestamp, '4', 'manual', 'draft'),
         ($1, $3, NULL, $4::timestamp, $5::timestamp, '999', 'calculated', 'draft')`,
      [tenantA.companyId, exactSourceDefId, exactDerivedDefId, annualStart, annualEnd],
    );
    await createCanonicalValue(token, {
      metricDefinitionId: exactTriggerDefId,
      start: annualStart,
      end: annualEnd,
      value: "1",
    });
    const exactAnnualDerived = await canonicalRows(client, tenantA.companyId, [exactDerivedDefId], annualStart, annualEnd, null);
    assert.equal(exactAnnualDerived.length, 0, "contained monthly source polluted exact annual calculation scope");

    // Active-site rollups exclude rejected and archived sites, clear stale
    // calculated organisation values, and never overwrite a manual org fact.
    const rollupDefId = await createDefinition(client, { code: `${prefix}_ROLLUP`, rollupMethod: "sum" });
    definitionIds.push(rollupDefId);
    const rollupStart = "2092-01-01T00:00:00.000Z";
    const rollupEnd = "2092-01-31T23:59:59.999Z";
    const firstSiteValue = await createCanonicalValue(token, {
      metricDefinitionId: rollupDefId,
      siteId: primarySiteId,
      start: rollupStart,
      end: rollupEnd,
      value: "5",
    });
    let orgRollup = await canonicalRows(client, tenantA.companyId, [rollupDefId], rollupStart, rollupEnd, null);
    assert.equal(Number(orgRollup[0]?.value_numeric), 5);
    assert.equal(orgRollup[0]?.source_type, "calculated");
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${firstSiteValue.id}/submit`, {}, token), 200, "rollup site submit");
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${firstSiteValue.id}/review`, {
      action: "reject",
      comment: "Rejected rollup source",
    }, token), 200, "rollup site rejection");
    orgRollup = await canonicalRows(client, tenantA.companyId, [rollupDefId], rollupStart, rollupEnd, null);
    assert.equal(orgRollup.length, 0, "rejected site value continued to drive organisation rollup");
    expectStatus(await apiRequest("POST", `/api/metric-definition-values/${firstSiteValue.id}/revise`, {}, token), 200, "revise rollup site value");

    const secondSiteResponse = await apiRequest("POST", "/api/sites", {
      name: `${prefix} Archived Site`,
      type: "office",
      country: "GB",
    }, token);
    expectStatus(secondSiteResponse, 201, "create second site");
    const secondSiteId = body<{ id: string }>(secondSiteResponse).id;
    siteIds.push(secondSiteId);
    await createCanonicalValue(token, {
      metricDefinitionId: rollupDefId,
      siteId: secondSiteId,
      start: rollupStart,
      end: rollupEnd,
      value: "7",
    });
    orgRollup = await canonicalRows(client, tenantA.companyId, [rollupDefId], rollupStart, rollupEnd, null);
    assert.equal(Number(orgRollup[0]?.value_numeric), 12);
    expectStatus(await apiRequest("DELETE", `/api/sites/${secondSiteId}`, undefined, token), 200, "archive second site");
    expectStatus(await apiRequest("PATCH", `/api/metric-definition-values/${firstSiteValue.id}`, { valueNumeric: "5" }, token), 200, "trigger rollup after site archive");
    orgRollup = await canonicalRows(client, tenantA.companyId, [rollupDefId], rollupStart, rollupEnd, null);
    assert.equal(Number(orgRollup[0]?.value_numeric), 5, "archived site value remained in rollup");

    await client.query(
      `UPDATE metric_definition_values SET source_type = 'manual', value_numeric = '100', status = 'draft'
       WHERE business_id = $1 AND metric_definition_id = $2
         AND reporting_period_start = $3::timestamp AND reporting_period_end = $4::timestamp
         AND site_id IS NULL`,
      [tenantA.companyId, rollupDefId, rollupStart, rollupEnd],
    );
    const protectedRollup = await apiRequest("PATCH", `/api/metric-definition-values/${firstSiteValue.id}`, {
      valueNumeric: "6",
    }, token);
    expectStatus(protectedRollup, 200, "site save with protected organisation rollup");
    const protectedRollupBody = body<Record<string, any>>(protectedRollup);
    assert.equal(protectedRollupBody.partialSuccess, true, "protected rollup was not reported as partial success");
    assert.ok(protectedRollupBody.calculationSkippedProtected?.some((entry: any) =>
      entry.code === `${prefix}_ROLLUP` && entry.operation === "rollup" && entry.reason === "authoritative"));
    orgRollup = await canonicalRows(client, tenantA.companyId, [rollupDefId], rollupStart, rollupEnd, null);
    assert.equal(Number(orgRollup[0]?.value_numeric), 100, "automatic rollup overwrote manual organisation value");

    // Cycles are surfaced truthfully rather than silently disappearing.
    const cycleACode = `${prefix}_CYCLE_A`;
    const cycleBCode = `${prefix}_CYCLE_B`;
    const cycleTriggerDefId = await createDefinition(client, { code: `${prefix}_CYCLE_TRIGGER` });
    const cycleADefId = await createDefinition(client, {
      code: cycleACode,
      isDerived: true,
      formula: { type: "expression", sources: [cycleBCode], expression: `${cycleBCode} + 1` },
    });
    const cycleBDefId = await createDefinition(client, {
      code: cycleBCode,
      isDerived: true,
      formula: { type: "expression", sources: [cycleACode], expression: `${cycleACode} + 1` },
    });
    definitionIds.push(cycleTriggerDefId, cycleADefId, cycleBDefId);
    const cycleResult = await apiRequest("POST", "/api/metric-definition-values", {
      metricDefinitionId: cycleTriggerDefId,
      reportingPeriodStart: "2093-01-01T00:00:00.000Z",
      reportingPeriodEnd: "2093-01-31T23:59:59.999Z",
      valueNumeric: "1",
    }, token);
    expectStatus(cycleResult, 200, "cycle trigger retains base save");
    const cycleBody = body<Record<string, any>>(cycleResult);
    assert.equal(cycleBody.partialSuccess, true);
    assert.ok(cycleBody.calculationFailures?.some((failure: string) => failure.includes(`${cycleACode}: circular`)));
    assert.ok(cycleBody.calculationFailures?.some((failure: string) => failure.includes(`${cycleBCode}: circular`)));

    console.log("mutation-surface protection regression passed");
  } finally {
    try {
      if (provenanceTriggerInstalled) {
        await client.query(`DROP TRIGGER IF EXISTS ${provenanceTriggerName} ON evidence_files`);
        await client.query(`DROP FUNCTION IF EXISTS ${provenanceFunctionName}()`);
      }
      await client.query(
        "DELETE FROM data_entry_period_locks WHERE company_id = $1 AND period = '2088-04'",
        [tenantA.companyId],
      );
      await client.query(
        `DELETE FROM metric_evidence
         WHERE metric_value_id IN (
           SELECT id FROM metric_definition_values WHERE business_id = $1
           UNION
           SELECT mv.id FROM metric_values mv WHERE mv.metric_id = ANY($2::varchar[])
         )`,
        [tenantA.companyId, metricIds],
      );
      await client.query("DELETE FROM metric_calculation_runs WHERE business_id = $1", [tenantA.companyId]);
      await client.query("DELETE FROM metric_definition_values WHERE business_id = $1", [tenantA.companyId]);
      if (definitionIds.length > 0) {
        await client.query("DELETE FROM metric_definitions WHERE id = ANY($1::varchar[])", [definitionIds]);
      }
      if (metricIds.length > 0) {
        await client.query("DELETE FROM evidence_files WHERE company_id = $1 AND metric_id = ANY($2::varchar[])", [tenantA.companyId, metricIds]);
        await client.query("DELETE FROM metric_values WHERE metric_id = ANY($1::varchar[])", [metricIds]);
        await client.query("DELETE FROM metrics WHERE id = ANY($1::varchar[])", [metricIds]);
      }
      if (siteIds.length > 0) {
        await client.query("DELETE FROM organisation_sites WHERE id = ANY($1::varchar[])", [siteIds]);
      }
    } finally {
      await client.end();
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
