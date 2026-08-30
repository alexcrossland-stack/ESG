import assert from "node:assert/strict";
import { Client } from "pg";
import { apiMultipartRequest, apiRequest, seedTestTenants } from "../fixtures/seed.js";

function expectStatus(response: { status: number; body: string }, expected: number, label: string) {
  assert.equal(response.status, expected, `${label}: status=${response.status} body=${response.body.slice(0, 300)}`);
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const token = tenantA.adminToken;
  const period = currentMonth();

  const nullableProfile = await apiRequest("PUT", "/api/company", {
    name: "Audit Findings Regression Company",
    industry: null,
    country: null,
    employeeCount: 51,
    revenueBand: null,
    locations: 1,
  }, token);
  expectStatus(nullableProfile, 200, "nullable company profile update");
  const nullableBody = JSON.parse(nullableProfile.body);
  assert.equal(nullableBody.employeeCount, 51);
  assert.equal(nullableBody.industry, null);
  assert.equal(nullableBody.country, null);
  assert.equal(nullableBody.revenueBand, null);

  const whitespaceProfile = await apiRequest("PUT", "/api/company", { industry: "   " }, token);
  expectStatus(whitespaceProfile, 400, "whitespace is not a canonical optional value");

  expectStatus(await apiRequest("POST", "/api/metrics", {
    name: "Carbon Intensity",
    description: "Emissions per employee",
    category: "environmental",
    unit: "tCO2e/employee",
    metricType: "calculated",
    calculationType: "carbon_intensity",
    formulaText: "(Scope 1 + Scope 2 + Travel) / Employees",
    direction: "lower_is_better",
    enabled: true,
  }, token), 200, "enable carbon intensity calculation for regression coverage");
  expectStatus(await apiRequest("POST", "/api/metrics", {
    name: "Company Vehicle Fuel Use",
    description: "Company vehicle fuel purchased",
    category: "environmental",
    unit: "litres",
    metricType: "manual",
    direction: "lower_is_better",
    enabled: true,
  }, token), 200, "enable company vehicle fuel for import regression coverage");

  expectStatus(await apiRequest("POST", "/api/raw-data", {
    inputs: { electricity_kwh: "1" },
    period: "2026-99",
    siteId: null,
  }, token), 400, "guided raw save rejects a non-calendar month");
  expectStatus(await apiRequest("POST", "/api/metrics/recalculate/2026-99", {
    siteId: null,
  }, token), 400, "guided recalculation rejects a non-calendar month");

  const fabricatedInput = await apiRequest("POST", "/api/raw-data", {
    inputs: { fabricated_control: "1" },
    period,
    siteId: null,
  }, token);
  expectStatus(fabricatedInput, 400, "guided raw save rejects fabricated readiness fields");
  assert.equal(JSON.parse(fabricatedInput.body).code, "UNSUPPORTED_GUIDED_INPUT");

  const excessiveInputs = Object.fromEntries([
    ["water_m3", "1"],
    ...Array.from({ length: 26 }, (_, index) => [`fabricated_${index}`, "1"]),
  ]);
  expectStatus(await apiRequest("POST", "/api/raw-data", {
    inputs: excessiveInputs,
    period,
    siteId: null,
  }, token), 400, "guided raw save bounds the number of input mutations");

  const rawSave = await apiRequest("POST", "/api/raw-data", {
    inputs: {
      electricity_kwh: "13000",
      gas_kwh: "1000",
      employee_headcount: "42",
    },
    period,
    siteId: null,
  }, token);
  expectStatus(rawSave, 200, "guided raw data save");

  const recalc = await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
    siteId: null,
  }, token);
  expectStatus(recalc, 200, "guided metric recalculation");
  const recalcBody = JSON.parse(recalc.body) as {
    guidedMetricSync?: { synced?: Array<{ metricName?: string }>; skippedLocked?: unknown[] };
  };
  const syncedNames = new Set((recalcBody.guidedMetricSync?.synced || []).map((entry) => entry.metricName));
  assert.ok(syncedNames.has("Electricity Consumption"), "electricity guided input was not synced");
  assert.ok(
    syncedNames.has("Total Employees") || syncedNames.has("Employee Headcount") || syncedNames.has("Total Headcount"),
    "headcount guided input was not synced",
  );

  const readiness = await apiRequest("GET", "/api/dashboard/readiness", undefined, token);
  expectStatus(readiness, 200, "dashboard readiness after guided save");
  const readinessBody = JSON.parse(readiness.body) as {
    dashboardState?: string;
    dataCompletenessPercent?: number;
    filledMetrics?: number;
  };
  assert.notEqual(readinessBody.dashboardState, "onboarding_complete_no_data");
  assert.ok((readinessBody.filledMetrics || 0) >= 2, `expected at least two filled metrics: ${readiness.body}`);
  assert.ok((readinessBody.dataCompletenessPercent || 0) > 0, `expected positive completeness: ${readiness.body}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const fabricatedRows = await client.query(
      "SELECT input_name FROM raw_data_inputs WHERE company_id = $1 AND period = $2 AND input_name LIKE 'fabricated_%'",
      [tenantA.companyId, period],
    );
    assert.equal(fabricatedRows.rowCount, 0, "rejected fabricated inputs must not persist any readiness-bearing rows");
    const excessiveAtomicRows = await client.query(
      "SELECT input_name FROM raw_data_inputs WHERE company_id = $1 AND period = $2 AND input_name = 'water_m3'",
      [tenantA.companyId, period],
    );
    assert.equal(excessiveAtomicRows.rowCount, 0, "an oversized guided mutation must reject its legitimate fields atomically");

    await client.query(
      `INSERT INTO raw_data_inputs (
         company_id, input_name, input_category, value, period, site_id,
         data_source_type, workflow_status
       ) VALUES ($1, 'historical_fabricated_control', 'governance', '1', $2, NULL, 'manual', 'draft')`,
      [tenantB.companyId, period],
    );
    const historicalFabricationReadiness = await apiRequest(
      "GET",
      "/api/dashboard/actions",
      undefined,
      tenantB.adminToken,
    );
    expectStatus(historicalFabricationReadiness, 200, "historical fabricated rows are excluded from dashboard readiness");
    const historicalProgress = JSON.parse(historicalFabricationReadiness.body).progressSummary as {
      totalEntries?: number;
      govEntries?: number;
      hasAnyDataEntry?: boolean;
      hasActualData?: boolean;
    };
    assert.equal(historicalProgress.totalEntries, 0);
    assert.equal(historicalProgress.govEntries, 0);
    assert.equal(historicalProgress.hasAnyDataEntry, false);
    assert.equal(historicalProgress.hasActualData, false);

    const invalidAtomicSave = await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "not-a-number" },
      clearInputs: ["gas_kwh"],
      period,
      siteId: null,
    }, token);
    expectStatus(invalidAtomicSave, 400, "invalid guided save is rejected before any clear");
    const rawAfterRejectedSave = await apiRequest("GET", `/api/raw-data/${encodeURIComponent(period)}?siteId=null`, undefined, token);
    expectStatus(rawAfterRejectedSave, 200, "guided data after rejected atomic save");
    assert.ok(
      (JSON.parse(rawAfterRejectedSave.body) as Array<{ inputName?: string; value?: string }>).some((entry) =>
        entry.inputName === "gas_kwh" && Number(entry.value) === 1000),
      "a rejected guided save must not clear an earlier raw value",
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { gas_kwh: "2000" },
      clearInputs: ["gas_kwh"],
      period,
      siteId: null,
    }, token), 400, "guided input cannot be saved and cleared together");

    const directValues = await client.query<{
      value_id: string;
      metric_id: string;
      name: string;
      value: string;
      value_numeric: string | null;
      site_id: string | null;
    }>(
      `SELECT mv.id AS value_id, mv.metric_id, m.name, mv.value::text, mv.value_numeric::text, mv.site_id
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1
         AND mv.period = $2
         AND mv.site_id IS NULL
         AND m.name IN ('Electricity Consumption', 'Total Employees', 'Employee Headcount', 'Total Headcount')
       ORDER BY m.name`,
      [tenantA.companyId, period],
    );
    assert.ok(directValues.rows.some((row) => row.name === "Electricity Consumption" && Number(row.value) === 13000));
    assert.ok(directValues.rows.some((row) => /Employees|Headcount/.test(row.name) && Number(row.value) === 42));
    assert.ok(directValues.rows.some((row) => row.name === "Electricity Consumption" && Number(row.value_numeric) === 13000));
    assert.ok(directValues.rows.some((row) => /Employees|Headcount/.test(row.name) && Number(row.value_numeric) === 42));

    const electricityMetricId = directValues.rows.find((row) => row.name === "Electricity Consumption")?.metric_id;
    const electricityValueId = directValues.rows.find((row) => row.name === "Electricity Consumption")?.value_id;
    const headcountMetricId = directValues.rows.find((row) => /Employees|Headcount/.test(row.name))?.metric_id;
    assert.ok(electricityMetricId, "electricity metric row missing");
    assert.ok(electricityValueId, "electricity metric value row missing");
    assert.ok(headcountMetricId, "headcount metric row missing");

    const evidencedMappedFile = await client.query<{ id: string }>(
      `INSERT INTO evidence_files (
         company_id, filename, metric_id, linked_module, linked_entity_id,
         linked_period, evidence_status, site_id
       ) VALUES ($1, 'guided-approved-evidence.txt', $2, 'metric_value', $3, $4, 'uploaded', NULL)
       RETURNING id`,
      [tenantA.companyId, electricityMetricId, electricityValueId, period],
    );
    await client.query(
      `UPDATE metric_values
       SET data_source_type = 'evidenced', workflow_status = 'approved', notes = 'Approved electricity evidence'
       WHERE metric_id = $1 AND period = $2 AND site_id IS NULL`,
      [electricityMetricId, period],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "13500" }, period, siteId: null,
    }, token), 200, "raw update behind an evidenced tracked value");
    const protectedRecalc = await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
      siteId: null,
    }, token);
    expectStatus(protectedRecalc, 200, "protected guided metric recalculation");
    const protectedBody = JSON.parse(protectedRecalc.body) as {
      guidedMetricSync?: { skippedProtected?: Array<{ metricId?: string; reason?: string }> };
    };
    assert.ok(
      protectedBody.guidedMetricSync?.skippedProtected?.some((entry) =>
        entry.metricId === electricityMetricId && entry.reason === "evidenced"),
      "evidenced mapped values must be reported as protected",
    );
    const protectedValue = await client.query<{
      id: string;
      value: string;
      data_source_type: string;
      workflow_status: string;
      notes: string;
    }>(
      `SELECT id, value::text, data_source_type::text, workflow_status::text, notes
       FROM metric_values
       WHERE metric_id = $1 AND period = $2 AND site_id IS NULL`,
      [electricityMetricId, period],
    );
    assert.equal(protectedValue.rows[0]?.id, electricityValueId, "protected recalculation must preserve the existing row identity");
    assert.equal(Number(protectedValue.rows[0]?.value), 13000, "guided input must not replace an evidenced value");
    assert.equal(protectedValue.rows[0]?.data_source_type, "evidenced");
    assert.equal(protectedValue.rows[0]?.workflow_status, "approved");
    assert.equal(protectedValue.rows[0]?.notes, "Approved electricity evidence");

    await client.query("DELETE FROM evidence_files WHERE id = $1", [evidencedMappedFile.rows[0]?.id]);
    await client.query(
      `UPDATE metric_values
       SET data_source_type = 'evidenced', workflow_status = 'draft', notes = NULL,
           reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL
       WHERE metric_id = $1 AND period = $2 AND site_id IS NULL`,
      [electricityMetricId, period],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "13550" }, period, siteId: null,
    }, token), 200, "raw update behind stale evidenced provenance");
    const staleEvidenceRecalc = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${encodeURIComponent(period)}`,
      { siteId: null },
      token,
    );
    expectStatus(staleEvidenceRecalc, 200, "stale evidenced provenance recalculation");
    const staleEvidenceBody = JSON.parse(staleEvidenceRecalc.body) as {
      guidedMetricSync?: {
        synced?: Array<{ metricId?: string }>;
        skippedProtected?: Array<{ metricId?: string }>;
      };
    };
    assert.ok(
      staleEvidenceBody.guidedMetricSync?.synced?.some((entry) => entry.metricId === electricityMetricId),
      "stale evidenced provenance without usable evidence must remain mutable",
    );
    assert.ok(
      !staleEvidenceBody.guidedMetricSync?.skippedProtected?.some((entry) => entry.metricId === electricityMetricId),
      "stale evidenced provenance was incorrectly reported as protected",
    );
    const staleEvidenceValue = await client.query<{ value: string; data_source_type: string }>(
      `SELECT value::text, data_source_type::text
       FROM metric_values WHERE id = $1`,
      [electricityValueId],
    );
    assert.equal(Number(staleEvidenceValue.rows[0]?.value), 13550);
    assert.equal(staleEvidenceValue.rows[0]?.data_source_type, "manual", "stale evidenced provenance was not normalized");

    const manualLinkedEvidence = await client.query<{ id: string }>(
      `INSERT INTO evidence_files (
         company_id, filename, metric_id, linked_module, linked_entity_id,
         linked_period, evidence_status, site_id
       ) VALUES ($1, 'guided-manual-linked-evidence.txt', $2, 'metric_value', $3, $4, 'uploaded', NULL)
       RETURNING id`,
      [tenantA.companyId, electricityMetricId, electricityValueId, period],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: {}, clearInputs: ["electricity_kwh"], period, siteId: null,
    }, token), 409, "guided clear cannot erase a linked-evidence manual value");
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "13600" }, period, siteId: null,
    }, token), 200, "raw update behind a linked-evidence manual value");
    const linkedEvidenceManualRecalc = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${encodeURIComponent(period)}`,
      { siteId: null },
      token,
    );
    expectStatus(linkedEvidenceManualRecalc, 200, "linked-evidence manual value is skipped during recalculation");
    assert.ok(
      (JSON.parse(linkedEvidenceManualRecalc.body).guidedMetricSync?.skippedProtected || []).some((entry: any) =>
        entry.metricId === electricityMetricId && entry.reason === "evidenced"),
      "a manual value with linked evidence must be reported as evidenced and skipped",
    );
    const manualAfterLinkedEvidence = await client.query<{ value: string }>(
      "SELECT value::text FROM metric_values WHERE id = $1",
      [electricityValueId],
    );
    assert.equal(Number(manualAfterLinkedEvidence.rows[0]?.value), 13550);
    await client.query("DELETE FROM evidence_files WHERE id = $1", [manualLinkedEvidence.rows[0]?.id]);

    await client.query(
      `UPDATE metric_values
       SET reviewed_by = $2, reviewed_at = NOW(), review_comment = 'Reviewed manual guided value'
       WHERE id = $1`,
      [electricityValueId, tenantA.companyId],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: {}, clearInputs: ["electricity_kwh"], period, siteId: null,
    }, token), 409, "guided clear cannot erase a reviewed-only manual value");
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "13700" }, period, siteId: null,
    }, token), 200, "raw update behind a reviewed-only manual value");
    const reviewedManualRecalc = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${encodeURIComponent(period)}`,
      { siteId: null },
      token,
    );
    expectStatus(reviewedManualRecalc, 200, "reviewed-only manual value is skipped during recalculation");
    assert.ok(
      (JSON.parse(reviewedManualRecalc.body).guidedMetricSync?.skippedProtected || []).some((entry: any) =>
        entry.metricId === electricityMetricId && entry.reason === "reviewed"),
      "a reviewed-only manual value must be reported as reviewed and skipped",
    );
    const manualAfterReview = await client.query<{ value: string }>(
      "SELECT value::text FROM metric_values WHERE id = $1",
      [electricityValueId],
    );
    assert.equal(Number(manualAfterReview.rows[0]?.value), 13550);
    await client.query(
      "UPDATE metric_values SET reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL WHERE id = $1",
      [electricityValueId],
    );

    await client.query(
      `UPDATE raw_data_inputs
       SET is_user_reviewed = true, data_source_type = 'manual', workflow_status = 'draft',
           reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL
       WHERE company_id = $1 AND period = $2 AND site_id IS NULL AND input_name = 'gas_kwh'`,
      [tenantA.companyId, period],
    );
    const reviewedRawClear = await apiRequest("POST", "/api/raw-data", {
      inputs: {}, clearInputs: ["gas_kwh"], period, siteId: null,
    }, token);
    expectStatus(reviewedRawClear, 409, "guided clear respects isUserReviewed raw protection");
    assert.ok(
      (JSON.parse(reviewedRawClear.body).protectedInputs || []).some((entry: any) =>
        entry.inputName === "gas_kwh" && entry.reason === "reviewed"),
      "isUserReviewed must be reported as reviewed protection",
    );
    await client.query(
      `UPDATE raw_data_inputs SET is_user_reviewed = false
       WHERE company_id = $1 AND period = $2 AND site_id IS NULL AND input_name = 'gas_kwh'`,
      [tenantA.companyId, period],
    );

    const protectedDerivedBefore = await client.query<{ id: string; metric_id: string; value: string }>(
      `SELECT mv.id, mv.metric_id, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND m.name = 'Scope 2 Emissions'
         AND mv.period = $2 AND mv.site_id IS NULL`,
      [tenantA.companyId, period],
    );
    assert.equal(protectedDerivedBefore.rows.length, 1);
    await client.query(
      "UPDATE metric_values SET workflow_status = 'approved' WHERE metric_id = $1 AND period = $2 AND site_id IS NULL",
      [protectedDerivedBefore.rows[0]?.metric_id, period],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "14000" }, period, siteId: null,
    }, token), 200, "raw update behind an approved calculated value");
    const protectedDerivedRecalc = await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
      siteId: null,
    }, token);
    expectStatus(protectedDerivedRecalc, 200, "protected calculated metric recalculation");
    const protectedDerivedBody = JSON.parse(protectedDerivedRecalc.body) as {
      calculatedSkippedProtected?: Array<{ metricId?: string; reason?: string }>;
    };
    assert.ok(protectedDerivedBody.calculatedSkippedProtected?.some((entry) =>
      entry.metricId === protectedDerivedBefore.rows[0]?.metric_id && entry.reason === "workflow"));
    const protectedDerivedAfter = await client.query<{ value: string }>(
      "SELECT value::text FROM metric_values WHERE metric_id = $1 AND period = $2 AND site_id IS NULL",
      [protectedDerivedBefore.rows[0]?.metric_id, period],
    );
    assert.equal(
      Number(protectedDerivedAfter.rows[0]?.value),
      Number(protectedDerivedBefore.rows[0]?.value),
      "approved calculated values must remain unchanged",
    );
    await client.query(
      "UPDATE metric_values SET workflow_status = 'draft' WHERE metric_id = $1 AND period = $2 AND site_id IS NULL",
      [protectedDerivedBefore.rows[0]?.metric_id, period],
    );

    const linkedCalculatedValue = "9.5000";
    await client.query(
      `UPDATE metric_values
       SET value = $2, value_numeric = $2, data_source_type = 'manual', workflow_status = 'draft',
           reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL
       WHERE id = $1`,
      [protectedDerivedBefore.rows[0]?.id, linkedCalculatedValue],
    );
    const calculatedLinkedEvidence = await client.query<{ id: string }>(
      `INSERT INTO metric_evidence (metric_value_id, file_name, file_type, notes)
       VALUES ($1, 'calculated-value-evidence.txt', 'text/plain', 'Protect calculated Scope 2')
       RETURNING id`,
      [protectedDerivedBefore.rows[0]?.id],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "14500" }, period, siteId: null,
    }, token), 200, "raw update behind a linked-evidence calculated value");
    const linkedCalculatedRecalc = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${encodeURIComponent(period)}`,
      { siteId: null },
      token,
    );
    expectStatus(linkedCalculatedRecalc, 200, "linked-evidence calculated value is skipped during recalculation");
    assert.ok(
      (JSON.parse(linkedCalculatedRecalc.body).calculatedSkippedProtected || []).some((entry: any) =>
        entry.metricId === protectedDerivedBefore.rows[0]?.metric_id && entry.reason === "evidenced"),
      "a calculated value with linked evidence must be reported as evidenced and skipped",
    );
    const linkedCalculatedResults = await client.query<{ name: string; value: string | null }>(
      `SELECT m.name, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1
         AND m.name IN ('Scope 1 Emissions', 'Scope 2 Emissions', 'Business Travel Emissions', 'Carbon Intensity')
         AND mv.period = $2 AND mv.site_id IS NULL`,
      [tenantA.companyId, period],
    );
    const linkedCalculatedByName = new Map(linkedCalculatedResults.rows.map((row) => [row.name, row.value]));
    assert.equal(Number(linkedCalculatedByName.get("Scope 2 Emissions")), Number(linkedCalculatedValue));
    const linkedExpectedIntensity = Math.round(((
      Number(linkedCalculatedByName.get("Scope 1 Emissions") || 0)
      + Number(linkedCalculatedValue)
      + Number(linkedCalculatedByName.get("Business Travel Emissions") || 0)
    ) / 42) * 100) / 100;
    assert.ok(
      Math.abs(Number(linkedCalculatedByName.get("Carbon Intensity")) - linkedExpectedIntensity) < 0.00011,
      "Carbon Intensity must use the authoritative linked-evidence emissions component",
    );
    await client.query("DELETE FROM metric_evidence WHERE id = $1", [calculatedLinkedEvidence.rows[0]?.id]);

    await client.query(
      `UPDATE metric_values
       SET reviewed_by = $2, reviewed_at = NOW(), review_comment = 'Reviewed calculated Scope 2'
       WHERE id = $1`,
      [protectedDerivedBefore.rows[0]?.id, tenantA.companyId],
    );
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "15000" }, period, siteId: null,
    }, token), 200, "raw update behind a reviewed-only calculated value");
    const reviewedCalculatedRecalc = await apiRequest(
      "POST",
      `/api/metrics/recalculate/${encodeURIComponent(period)}`,
      { siteId: null },
      token,
    );
    expectStatus(reviewedCalculatedRecalc, 200, "reviewed-only calculated value is skipped during recalculation");
    assert.ok(
      (JSON.parse(reviewedCalculatedRecalc.body).calculatedSkippedProtected || []).some((entry: any) =>
        entry.metricId === protectedDerivedBefore.rows[0]?.metric_id && entry.reason === "reviewed"),
      "a reviewed-only calculated value must be reported as reviewed and skipped",
    );
    const reviewedCalculatedResults = await client.query<{ name: string; value: string | null }>(
      `SELECT m.name, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1
         AND m.name IN ('Scope 1 Emissions', 'Scope 2 Emissions', 'Business Travel Emissions', 'Carbon Intensity')
         AND mv.period = $2 AND mv.site_id IS NULL`,
      [tenantA.companyId, period],
    );
    const reviewedCalculatedByName = new Map(reviewedCalculatedResults.rows.map((row) => [row.name, row.value]));
    assert.equal(Number(reviewedCalculatedByName.get("Scope 2 Emissions")), Number(linkedCalculatedValue));
    const reviewedExpectedIntensity = Math.round(((
      Number(reviewedCalculatedByName.get("Scope 1 Emissions") || 0)
      + Number(linkedCalculatedValue)
      + Number(reviewedCalculatedByName.get("Business Travel Emissions") || 0)
    ) / 42) * 100) / 100;
    assert.ok(
      Math.abs(Number(reviewedCalculatedByName.get("Carbon Intensity")) - reviewedExpectedIntensity) < 0.00011,
      "Carbon Intensity must use the authoritative reviewed emissions component",
    );
    await client.query(
      "UPDATE metric_values SET reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL WHERE id = $1",
      [protectedDerivedBefore.rows[0]?.id],
    );

    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "0" }, period, siteId: null,
    }, token), 200, "explicit zero raw update");
    expectStatus(await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
      siteId: null,
    }, token), 200, "explicit zero metric sync");

    const deduped = await client.query<{ count: string; value: string }>(
      `SELECT count(*)::text AS count, max(value)::text AS value
       FROM metric_values
       WHERE metric_id = $1 AND period = $2 AND site_id IS NULL`,
      [electricityMetricId, period],
    );
    assert.equal(deduped.rows[0]?.count, "1", "guided updates must not create duplicate metric rows");
    assert.equal(Number(deduped.rows[0]?.value), 0, "explicit zero must be preserved");

    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { employee_headcount: "40", employee_leavers: "2" }, period, siteId: null,
    }, token), 200, "ratio inputs");
    expectStatus(await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
      siteId: null,
    }, token), 200, "ratio calculation");
    const turnoverBeforeClear = await client.query<{ metric_id: string; value: string | null }>(
      `SELECT mv.metric_id, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND m.name = 'Employee Turnover Rate'
         AND mv.period = $2 AND mv.site_id IS NULL`,
      [tenantA.companyId, period],
    );
    assert.equal(Number(turnoverBeforeClear.rows[0]?.value), 5);
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { employee_headcount: "0" }, period, siteId: null,
    }, token), 200, "zero denominator input");
    expectStatus(await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
      siteId: null,
    }, token), 200, "non-applicable ratio recalculation");
    const clearedDerived = await client.query<{ name: string; value: string | null }>(
      `SELECT m.name, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1
         AND m.name IN ('Employee Turnover Rate', 'Carbon Intensity')
         AND mv.period = $2 AND mv.site_id IS NULL
       ORDER BY m.name`,
      [tenantA.companyId, period],
    );
    assert.equal(clearedDerived.rows.find((row) => row.name === "Employee Turnover Rate")?.value, null);
    assert.equal(clearedDerived.rows.find((row) => row.name === "Carbon Intensity")?.value, null);

    const scope2BeforeLock = await client.query<{ metric_id: string; value: string }>(
      `SELECT mv.metric_id, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND m.name = 'Scope 2 Emissions'
         AND mv.period = $2 AND mv.site_id IS NULL`,
      [tenantA.companyId, period],
    );
    assert.equal(scope2BeforeLock.rows.length, 1, "Scope 2 should be calculated before the period is locked");

    expectStatus(await apiRequest("POST", `/api/data-entry/${encodeURIComponent(period)}/lock`, {}, token), 200, "period lock");
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "999" }, period, siteId: null,
    }, token), 400, "raw update against locked period");
    const lockedRecalc = await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(period)}`, {
      siteId: null,
    }, token);
    expectStatus(lockedRecalc, 200, "locked guided metric recalculation");
    const lockedBody = JSON.parse(lockedRecalc.body) as {
      guidedMetricSync?: { skippedLocked?: Array<{ metricId?: string }> };
      calculatedSkippedLocked?: Array<{ metricId?: string }>;
    };
    assert.ok(lockedBody.guidedMetricSync?.skippedLocked?.some((entry) => entry.metricId === electricityMetricId));
    assert.ok(
      lockedBody.calculatedSkippedLocked?.some((entry) => entry.metricId === scope2BeforeLock.rows[0]?.metric_id),
      "locked calculated Scope 2 value should be explicitly reported as skipped",
    );

    const lockedValue = await client.query<{ value: string }>(
      "SELECT value::text FROM metric_values WHERE metric_id = $1 AND period = $2 AND site_id IS NULL",
      [electricityMetricId, period],
    );
    assert.equal(Number(lockedValue.rows[0]?.value), 0, "locked mapped metric value must not be overwritten");
    const lockedScope2 = await client.query<{ value: string }>(
      "SELECT value::text FROM metric_values WHERE metric_id = $1 AND period = $2 AND site_id IS NULL",
      [scope2BeforeLock.rows[0]?.metric_id, period],
    );
    assert.equal(
      Number(lockedScope2.rows[0]?.value),
      Number(scope2BeforeLock.rows[0]?.value),
      "locked calculated metric value must not be overwritten",
    );

    let recalculationAudit: { details: Record<string, unknown> } | undefined;
    for (let attempt = 0; attempt < 20 && !recalculationAudit; attempt += 1) {
      const auditRows = await client.query<{ details: Record<string, unknown> }>(
        `SELECT details
         FROM audit_logs
         WHERE company_id = $1 AND action = 'Guided metrics recalculated' AND entity_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantA.companyId, period],
      );
      const candidate = auditRows.rows[0];
      const lockedMetricIds = candidate?.details?.lockedMetricIds;
      recalculationAudit = Array.isArray(lockedMetricIds)
        && lockedMetricIds.includes(electricityMetricId)
        && lockedMetricIds.includes(scope2BeforeLock.rows[0]?.metric_id)
        ? candidate
        : undefined;
      if (!recalculationAudit) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(recalculationAudit, "guided recalculation audit row was not persisted");
    assert.ok(
      Array.isArray(recalculationAudit.details.lockedMetricIds)
        && recalculationAudit.details.lockedMetricIds.includes(electricityMetricId)
        && recalculationAudit.details.lockedMetricIds.includes(scope2BeforeLock.rows[0]?.metric_id),
      "audit metadata should identify every direct and calculated metric protected by the lock",
    );

    const siteResponse = await apiRequest("POST", "/api/sites", {
      name: `Guided Sync Site ${Date.now()}`,
      type: "office",
      country: "United Kingdom",
    }, token);
    expectStatus(siteResponse, 201, "site creation for scoped guided sync");
    const siteId = JSON.parse(siteResponse.body).id as string;
    const [periodYear, periodMonth] = period.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(periodYear, periodMonth, 1));
    const sitePeriod = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "321" }, period: sitePeriod, siteId,
    }, token), 200, "site-scoped guided save");
    expectStatus(await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(sitePeriod)}`, {
      siteId,
    }, token), 200, "site-scoped guided recalculation");
    const siteValue = await client.query<{ site_id: string | null; value: string }>(
      "SELECT site_id, value::text FROM metric_values WHERE metric_id = $1 AND period = $2",
      [electricityMetricId, sitePeriod],
    );
    assert.deepEqual(siteValue.rows.map((row) => row.site_id), [siteId]);
    assert.equal(Number(siteValue.rows[0]?.value), 321);

    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: {}, clearInputs: ["electricity_kwh"], period: sitePeriod, siteId,
    }, token), 200, "site-scoped guided clear");
    expectStatus(await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(sitePeriod)}`, {
      siteId,
    }, token), 200, "site-scoped recalculation after clear");
    const rawAfterClear = await apiRequest("GET", `/api/raw-data/${encodeURIComponent(sitePeriod)}?siteId=${encodeURIComponent(siteId)}`, undefined, token);
    expectStatus(rawAfterClear, 200, "site-scoped raw data after clear");
    assert.ok(!(JSON.parse(rawAfterClear.body) as Array<{ inputName?: string }>).some((entry) => entry.inputName === "electricity_kwh"));
    const clearedSiteValues = await client.query<{ name: string; value: string | null; value_numeric: string | null }>(
      `SELECT m.name, mv.value::text, mv.value_numeric::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1
         AND m.name IN ('Electricity Consumption', 'Scope 2 Emissions')
         AND mv.period = $2 AND mv.site_id = $3
       ORDER BY m.name`,
      [tenantA.companyId, sitePeriod, siteId],
    );
    assert.equal(clearedSiteValues.rows.length, 2);
    for (const row of clearedSiteValues.rows) {
      assert.equal(row.value, null, `${row.name} should be empty after the guided source is cleared`);
      assert.equal(row.value_numeric, null, `${row.name} numeric value should be empty after the guided source is cleared`);
    }

    const emptyLockDate = new Date(Date.UTC(periodYear, periodMonth + 1, 1));
    const emptyLockPeriod = `${emptyLockDate.getUTCFullYear()}-${String(emptyLockDate.getUTCMonth() + 1).padStart(2, "0")}`;
    expectStatus(
      await apiRequest("POST", `/api/data-entry/${encodeURIComponent(emptyLockPeriod)}/lock`, {}, token),
      200,
      "empty period lock",
    );
    const emptyLockedEntry = await apiRequest(
      "GET",
      `/api/data-entry/${encodeURIComponent(emptyLockPeriod)}?siteId=${encodeURIComponent(siteId)}`,
      undefined,
      token,
    );
    expectStatus(emptyLockedEntry, 200, "empty locked period data entry state");
    assert.equal(JSON.parse(emptyLockedEntry.body).periodLocked, true);
    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { electricity_kwh: "888" }, period: emptyLockPeriod, siteId,
    }, token), 400, "durable empty-period lock");
    const durableLock = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM data_entry_period_locks WHERE company_id = $1 AND period = $2",
      [tenantA.companyId, emptyLockPeriod],
    );
    assert.equal(durableLock.rows[0]?.count, "1");

    const legacyLockDate = new Date(Date.UTC(periodYear, periodMonth + 3, 1));
    const legacyLockPeriod = `${legacyLockDate.getUTCFullYear()}-${String(legacyLockDate.getUTCMonth() + 1).padStart(2, "0")}`;
    await client.query(
      `INSERT INTO metric_values (
         id, metric_id, period, value, value_numeric, locked, site_id, data_source_type, workflow_status
       ) VALUES (gen_random_uuid(), $1, $2, '1', '1', true, NULL, 'manual', 'draft')`,
      [electricityMetricId, legacyLockPeriod],
    );
    const legacyLockedPaste = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "validate",
      siteId: null,
      cells: [{ metricId: headcountMetricId, period: legacyLockPeriod, rawValue: "11" }],
    }, token);
    expectStatus(legacyLockedPaste, 200, "legacy locked period bulk-paste validation");
    const legacyLockedPasteBody = JSON.parse(legacyLockedPaste.body) as {
      ok?: boolean;
      cells?: Array<{ errors?: string[]; locked?: boolean }>;
    };
    assert.equal(legacyLockedPasteBody.ok, false);
    assert.equal(legacyLockedPasteBody.cells?.[0]?.locked, true);
    assert.ok(legacyLockedPasteBody.cells?.[0]?.errors?.includes("This reporting period is locked"));

    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [tenantA.companyId]);
    const importDate = new Date(Date.UTC(periodYear, periodMonth + 2, 1));
    const importPeriod = `${importDate.getUTCFullYear()}-${String(importDate.getUTCMonth() + 1).padStart(2, "0")}`;
    expectStatus(await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: [{ column: "Electricity (kWh)", inputKey: "electricity_kwh" }],
      rows: [{ "Electricity (kWh)": "1" }],
      period: importPeriod,
      siteId: "__org__",
    }, token), 400, "CSV organisation sentinel is normalized before active-site enforcement");
    const importCsv = [
      "Electricity (kWh),Employees,Diesel (Litres),Petrol (Litres)",
      "456,12,500,200",
    ].join("\n");
    const parsedImport = await apiRequest("POST", "/api/raw-data/import/parse", {
      format: "csv",
      content: Buffer.from(importCsv).toString("base64"),
      siteId,
    }, token);
    expectStatus(parsedImport, 200, "CSV import canonical fuel mapping");
    const parsedImportBody = JSON.parse(parsedImport.body) as {
      mappings: Array<{ column: string; inputKey: string | null }>;
      rows: Array<Record<string, string>>;
    };
    assert.equal(
      parsedImportBody.mappings.find((mapping) => mapping.column === "Diesel (Litres)")?.inputKey,
      "diesel_litres",
    );
    assert.equal(
      parsedImportBody.mappings.find((mapping) => mapping.column === "Petrol (Litres)")?.inputKey,
      "petrol_litres",
    );

    const importPayload = {
      mappings: parsedImportBody.mappings,
      rows: parsedImportBody.rows,
      period: importPeriod,
      siteId,
    };
    const importResponse = await apiRequest("POST", "/api/raw-data/import/confirm", importPayload, token);
    expectStatus(importResponse, 200, "CSV import guided mapping");
    const importBody = JSON.parse(importResponse.body) as {
      recalculation?: { guidedMetricSync?: { synced?: Array<{ metricName?: string }> }; updated?: unknown[] };
    };
    assert.ok(importBody.recalculation?.guidedMetricSync?.synced?.some((entry) => entry.metricName === "Electricity Consumption"));
    const importedValues = await client.query<{ name: string; value: string | null; value_numeric: string | null }>(
      `SELECT m.name, mv.value::text, mv.value_numeric::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1
         AND m.name IN ('Electricity Consumption', 'Company Vehicle Fuel Use', 'Vehicle Fuel Consumption', 'Total Employees', 'Employee Headcount', 'Total Headcount', 'Scope 1 Emissions', 'Scope 2 Emissions')
         AND mv.period = $2 AND mv.site_id = $3
       ORDER BY m.name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.ok(importedValues.rows.some((row) => row.name === "Electricity Consumption" && Number(row.value) === 456 && Number(row.value_numeric) === 456));
    assert.ok(importedValues.rows.some((row) =>
      /Company Vehicle Fuel Use|Vehicle Fuel Consumption/.test(row.name)
      && Number(row.value) === 700 && Number(row.value_numeric) === 700),
    "CSV-imported typed fuels must populate the existing combined vehicle-fuel metric");
    assert.ok(importedValues.rows.some((row) => /Employees|Headcount/.test(row.name) && Number(row.value) === 12));
    assert.ok(importedValues.rows.some((row) =>
      row.name === "Scope 1 Emissions" && Math.abs(Number(row.value) - 1.7068) < 1e-8
      && Math.abs(Number(row.value_numeric) - 1.7068) < 1e-8),
    "CSV-imported diesel and petrol must use their respective 2026 UK factors");
    assert.ok(importedValues.rows.some((row) => row.name === "Scope 2 Emissions" && Number(row.value) > 0 && Number(row.value_numeric) > 0));

    const linkedEvidenceDate = new Date(Date.UTC(periodYear, periodMonth + 7, 1));
    const linkedEvidencePeriod = `${linkedEvidenceDate.getUTCFullYear()}-${String(linkedEvidenceDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const linkedEvidenceMapping = [{ column: "Employees", inputKey: "employee_headcount" }];
    expectStatus(await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: linkedEvidenceMapping,
      rows: [{ Employees: "21" }],
      period: linkedEvidencePeriod,
      siteId,
    }, token), 200, "seed CSV import for linked-evidence protection");

    const linkedMetricEvidence = new FormData();
    linkedMetricEvidence.append("metricId", headcountMetricId);
    linkedMetricEvidence.append("period", linkedEvidencePeriod);
    linkedMetricEvidence.append("siteId", siteId);
    linkedMetricEvidence.append(
      "file",
      new Blob(["evidence protecting the imported headcount metric"], { type: "text/plain" }),
      `csv-linked-metric-evidence-${Date.now()}.txt`,
    );
    expectStatus(
      await apiMultipartRequest("POST", "/api/evidence", linkedMetricEvidence, token),
      200,
      "attach direct evidence to CSV-linked metric",
    );

    const linkedEvidenceReimport = await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: linkedEvidenceMapping,
      rows: [{ Employees: "34" }],
      period: linkedEvidencePeriod,
      siteId,
    }, token);
    expectStatus(linkedEvidenceReimport, 200, "CSV import behind linked metric evidence remains a successful import");
    const linkedEvidenceReimportBody = JSON.parse(linkedEvidenceReimport.body) as {
      success?: boolean;
      partialSuccess?: boolean;
      recalculationWarning?: { code?: string };
      recalculation?: {
        guidedMetricSync?: { skippedProtected?: Array<{ metricId?: string; reason?: string }> };
      };
    };
    assert.equal(linkedEvidenceReimportBody.success, true);
    assert.equal(linkedEvidenceReimportBody.partialSuccess, false);
    assert.equal(linkedEvidenceReimportBody.recalculationWarning, undefined);
    assert.ok(linkedEvidenceReimportBody.recalculation?.guidedMetricSync?.skippedProtected?.some((entry) =>
      entry.metricId === headcountMetricId && entry.reason === "evidenced"),
    "linked metric evidence must preflight as a reported skip rather than fail after raw commit");
    const linkedEvidenceValues = await client.query<{ raw_value: string; metric_value: string }>(
      `SELECT raw.value::text AS raw_value, mv.value::text AS metric_value
       FROM raw_data_inputs raw
       JOIN metric_values mv
         ON mv.metric_id = $4 AND mv.period = raw.period AND mv.site_id = raw.site_id
       WHERE raw.company_id = $1 AND raw.period = $2 AND raw.site_id = $3
         AND raw.input_name = 'employee_headcount'`,
      [tenantA.companyId, linkedEvidencePeriod, siteId, headcountMetricId],
    );
    assert.equal(Number(linkedEvidenceValues.rows[0]?.raw_value), 34, "successful import must retain the new raw value");
    assert.equal(Number(linkedEvidenceValues.rows[0]?.metric_value), 21, "linked evidence must preserve the mapped metric value");

    const importedElectricityValue = await client.query<{ id: string; value: string }>(
      `SELECT mv.id, mv.value::text
       FROM metric_values mv
       WHERE mv.metric_id = $1 AND mv.period = $2 AND mv.site_id = $3`,
      [electricityMetricId, importPeriod, siteId],
    );
    assert.equal(Number(importedElectricityValue.rows[0]?.value), 456);
    await client.query(
      `UPDATE metric_values
       SET data_source_type = 'manual', workflow_status = 'approved',
           reviewed_by = $4, reviewed_at = NOW(), review_comment = 'Approved import value',
           notes = 'Approved import metric'
       WHERE metric_id = $1 AND period = $2 AND site_id = $3`,
      [electricityMetricId, importPeriod, siteId, tenantA.companyId],
    );

    const protectedBulkValidation = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "validate",
      siteId,
      cells: [{ metricId: electricityMetricId, period: importPeriod, rawValue: "999" }],
    }, token);
    expectStatus(protectedBulkValidation, 200, "protected bulk-paste validation preview");
    const protectedBulkValidationBody = JSON.parse(protectedBulkValidation.body) as {
      ok?: boolean;
      cells?: Array<{ protected?: boolean; protectionReason?: string; errors?: string[] }>;
    };
    assert.equal(protectedBulkValidationBody.ok, false);
    assert.equal(protectedBulkValidationBody.cells?.[0]?.protected, true);
    assert.equal(protectedBulkValidationBody.cells?.[0]?.protectionReason, "workflow");

    const protectedBulkCommit = await apiRequest("POST", "/api/data-entry/bulk-upsert", {
      mode: "commit",
      siteId,
      cells: [{ metricId: electricityMetricId, period: importPeriod, rawValue: "999" }],
    }, token);
    expectStatus(protectedBulkCommit, 409, "protected bulk-paste commit");
    assert.equal(JSON.parse(protectedBulkCommit.body).code, "VALUE_PROTECTED");

    const protectedManualUpdate = await apiRequest("POST", "/api/data-entry", {
      metricId: electricityMetricId,
      period: importPeriod,
      value: 999,
      notes: "Approved import metric",
      siteId,
    }, token);
    expectStatus(protectedManualUpdate, 409, "protected direct metric update");
    assert.equal(JSON.parse(protectedManualUpdate.body).code, "VALUE_PROTECTED");

    const appendEvidenceForm = new FormData();
    appendEvidenceForm.append("metricId", electricityMetricId);
    appendEvidenceForm.append("period", importPeriod);
    appendEvidenceForm.append("value", "456");
    appendEvidenceForm.append("notes", "Approved import metric");
    appendEvidenceForm.append("siteId", siteId);
    appendEvidenceForm.append(
      "attachments",
      new Blob(["additional evidence for approved value"], { type: "text/plain" }),
      "approved-value-additional-evidence.txt",
    );
    const appendedEvidence = await apiMultipartRequest("POST", "/api/data-entry", appendEvidenceForm, token);
    expectStatus(appendedEvidence, 200, "append evidence to unchanged protected metric value");
    const appendedEvidenceBody = JSON.parse(appendedEvidence.body) as {
      id?: string;
      newlyCreatedAttachments?: Array<{ filename?: string }>;
    };
    assert.equal(appendedEvidenceBody.id, importedElectricityValue.rows[0]?.id);
    assert.ok(appendedEvidenceBody.newlyCreatedAttachments?.some((file) => file.filename === "approved-value-additional-evidence.txt"));

    const protectedMetricAfterWrites = await client.query<{
      value: string;
      data_source_type: string;
      workflow_status: string;
      reviewed_at: Date | null;
      notes: string;
    }>(
      `SELECT value::text, data_source_type::text, workflow_status::text, reviewed_at, notes
       FROM metric_values WHERE id = $1`,
      [importedElectricityValue.rows[0]?.id],
    );
    assert.equal(Number(protectedMetricAfterWrites.rows[0]?.value), 456);
    assert.equal(protectedMetricAfterWrites.rows[0]?.data_source_type, "evidenced");
    assert.equal(protectedMetricAfterWrites.rows[0]?.workflow_status, "approved");
    assert.ok(protectedMetricAfterWrites.rows[0]?.reviewed_at);
    assert.equal(protectedMetricAfterWrites.rows[0]?.notes, "Approved import metric");

    await client.query(
      `UPDATE raw_data_inputs
       SET data_source_type = 'evidenced', workflow_status = 'approved',
           reviewed_by = $4, reviewed_at = NOW(), review_comment = 'Approved raw import'
       WHERE company_id = $1 AND period = $2 AND site_id = $3 AND input_name = 'electricity_kwh'`,
      [tenantA.companyId, importPeriod, siteId, tenantA.companyId],
    );
    const protectedRawImport = await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: parsedImportBody.mappings.filter((mapping) =>
        mapping.column === "Electricity (kWh)" || mapping.column === "Employees"),
      rows: [{ "Electricity (kWh)": "888", Employees: "77" }],
      period: importPeriod,
      siteId,
    }, token);
    expectStatus(protectedRawImport, 409, "CSV import cannot overwrite a protected raw input");
    assert.equal(JSON.parse(protectedRawImport.body).code, "VALUE_PROTECTED");
    const protectedRawAfterImport = await client.query<{
      input_name: string;
      value: string;
      data_source_type: string;
      workflow_status: string;
    }>(
      `SELECT input_name, value::text, data_source_type::text, workflow_status::text
       FROM raw_data_inputs
       WHERE company_id = $1 AND period = $2 AND site_id = $3
         AND input_name IN ('electricity_kwh', 'employee_headcount')
       ORDER BY input_name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.deepEqual(protectedRawAfterImport.rows, [
      { input_name: "electricity_kwh", value: "456.0000", data_source_type: "evidenced", workflow_status: "approved" },
      { input_name: "employee_headcount", value: "12.0000", data_source_type: "manual", workflow_status: "draft" },
    ]);

    const invalidImportDate = new Date(Date.UTC(periodYear, periodMonth + 4, 1));
    const invalidImportPeriod = `${invalidImportDate.getUTCFullYear()}-${String(invalidImportDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const invalidNumericImport = await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: [
        { column: "valid", inputKey: "water_m3" },
        { column: "negative", inputKey: "electricity_kwh" },
        { column: "nonFinite", inputKey: "gas_kwh" },
        { column: "oversized", inputKey: "diesel_litres" },
        { column: "overPrecise", inputKey: "petrol_litres" },
      ],
      rows: [{ valid: "321", negative: "-1", nonFinite: "Infinity", oversized: "100000000000", overPrecise: "1.23456" }],
      period: invalidImportPeriod,
      siteId,
    }, token);
    expectStatus(invalidNumericImport, 400, "invalid CSV numbers reject the whole batch");
    assert.equal(JSON.parse(invalidNumericImport.body).invalidValueCount, 4);
    const invalidImportRows = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM raw_data_inputs WHERE company_id = $1 AND period = $2 AND site_id = $3",
      [tenantA.companyId, invalidImportPeriod, siteId],
    );
    assert.equal(invalidImportRows.rows[0]?.count, "0", "invalid CSV import must not persist valid siblings");

    const unsupportedMappingImport = await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: [{ column: "Injected", inputKey: "unapproved_internal_key" }],
      rows: [{ Injected: "1" }],
      period: invalidImportPeriod,
      siteId,
    }, token);
    expectStatus(unsupportedMappingImport, 400, "CSV input keys are server allowlisted");
    assert.equal(JSON.parse(unsupportedMappingImport.body).code, "INVALID_IMPORT_MAPPING");

    const workforceCsv = [
      "Employee Headcount,Employee Leavers,Female Managers,Total Managers,Absence Days,Total Working Days,Training Hours,Living Wage Employees",
      "10,1,3,5,2,200,10,9",
      "12,2,4,6,3,220,20,11",
    ].join("\n");
    const workforceParse = await apiRequest("POST", "/api/raw-data/import/parse", {
      format: "csv",
      content: Buffer.from(workforceCsv).toString("base64"),
      siteId,
    }, token);
    expectStatus(workforceParse, 200, "official workforce CSV headers parse exactly");
    const workforceBody = JSON.parse(workforceParse.body) as {
      mappings: Array<{ column: string; inputKey: string | null }>;
      rows: Array<Record<string, string>>;
    };
    assert.deepEqual(
      Object.fromEntries(workforceBody.mappings.map((mapping) => [mapping.column, mapping.inputKey])),
      {
        "Employee Headcount": "employee_headcount",
        "Employee Leavers": "employee_leavers",
        "Female Managers": "female_managers",
        "Total Managers": "total_managers",
        "Absence Days": "absence_days",
        "Total Working Days": "total_working_days",
        "Training Hours": "total_training_hours",
        "Living Wage Employees": "living_wage_employees",
      },
    );
    const workforceDate = new Date(Date.UTC(periodYear, periodMonth + 5, 1));
    const workforcePeriod = `${workforceDate.getUTCFullYear()}-${String(workforceDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const workforceImport = await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: workforceBody.mappings,
      rows: workforceBody.rows,
      period: workforcePeriod,
      siteId,
    }, token);
    expectStatus(workforceImport, 200, "workforce CSV imports with truthful aggregation semantics");
    assert.equal(JSON.parse(workforceImport.body).savedInputCount, 8);
    const workforceRows = await client.query<{ input_name: string; value: string }>(
      `SELECT input_name, value::text
       FROM raw_data_inputs
       WHERE company_id = $1 AND period = $2 AND site_id = $3
       ORDER BY input_name`,
      [tenantA.companyId, workforcePeriod, siteId],
    );
    assert.deepEqual(Object.fromEntries(workforceRows.rows.map((row) => [row.input_name, Number(row.value)])), {
      absence_days: 5,
      employee_headcount: 12,
      employee_leavers: 3,
      female_managers: 4,
      living_wage_employees: 11,
      total_managers: 6,
      total_training_hours: 30,
      total_working_days: 420,
    });

    const concurrentDate = new Date(Date.UTC(periodYear, periodMonth + 6, 1));
    const concurrentPeriod = `${concurrentDate.getUTCFullYear()}-${String(concurrentDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const concurrentRawWrites = await Promise.all([
      apiRequest("POST", "/api/raw-data", { inputs: { electricity_kwh: "111" }, period: concurrentPeriod, siteId }, token),
      apiRequest("POST", "/api/raw-data", { inputs: { electricity_kwh: "222" }, period: concurrentPeriod, siteId }, token),
    ]);
    assert.deepEqual(concurrentRawWrites.map((response) => response.status), [200, 200]);
    const concurrentRawRows = await client.query<{ count: string; value: string }>(
      `SELECT count(*)::text AS count, max(value)::text AS value
       FROM raw_data_inputs
       WHERE company_id = $1 AND period = $2 AND site_id = $3 AND input_name = 'electricity_kwh'`,
      [tenantA.companyId, concurrentPeriod, siteId],
    );
    assert.equal(concurrentRawRows.rows[0]?.count, "1", "scope advisory lock must prevent duplicate raw-data natural keys");
    assert.ok([111, 222].includes(Number(concurrentRawRows.rows[0]?.value)));

    const importedFuelRawData = await client.query<{ input_name: string; value: string }>(
      `SELECT input_name, value::text
       FROM raw_data_inputs
       WHERE company_id = $1 AND period = $2 AND site_id = $3
         AND input_name IN ('diesel_litres', 'petrol_litres', 'vehicle_fuel_litres')
       ORDER BY input_name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.deepEqual(importedFuelRawData.rows.map((row) => ({ ...row, value: Number(row.value) })), [
      { input_name: "diesel_litres", value: 500 },
      { input_name: "petrol_litres", value: 200 },
      { input_name: "vehicle_fuel_litres", value: 700 },
    ]);

    const petrolMapping = parsedImportBody.mappings.filter((mapping) => mapping.column === "Petrol (Litres)");
    const partialFuelReimport = await apiRequest("POST", "/api/raw-data/import/confirm", {
      mappings: petrolMapping,
      rows: [{ "Petrol (Litres)": "250" }],
      period: importPeriod,
      siteId,
    }, token);
    expectStatus(partialFuelReimport, 200, "partial typed-fuel CSV re-import");
    const fuelAfterPartialReimport = await client.query<{ input_name: string; value: string }>(
      `SELECT input_name, value::text
       FROM raw_data_inputs
       WHERE company_id = $1 AND period = $2 AND site_id = $3
         AND input_name IN ('diesel_litres', 'petrol_litres', 'vehicle_fuel_litres')
       ORDER BY input_name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.deepEqual(fuelAfterPartialReimport.rows.map((row) => ({ ...row, value: Number(row.value) })), [
      { input_name: "diesel_litres", value: 500 },
      { input_name: "petrol_litres", value: 250 },
      { input_name: "vehicle_fuel_litres", value: 750 },
    ]);
    const metricsAfterPartialReimport = await client.query<{ name: string; value: string | null }>(
      `SELECT m.name, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND mv.period = $2 AND mv.site_id = $3
         AND m.name IN ('Company Vehicle Fuel Use', 'Vehicle Fuel Consumption', 'Scope 1 Emissions')
       ORDER BY m.name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.ok(metricsAfterPartialReimport.rows.some((row) =>
      /Company Vehicle Fuel Use|Vehicle Fuel Consumption/.test(row.name) && Number(row.value) === 750));
    assert.ok(metricsAfterPartialReimport.rows.some((row) =>
      row.name === "Scope 1 Emissions" && Math.abs(Number(row.value) - 1.8105) < 1e-8));

    expectStatus(await apiRequest("POST", "/api/raw-data", {
      inputs: { vehicle_fuel_litres: "300" },
      period: importPeriod,
      siteId,
    }, token), 200, "manual combined-fuel edit after typed CSV import");
    expectStatus(await apiRequest("POST", `/api/metrics/recalculate/${encodeURIComponent(importPeriod)}`, {
      siteId,
    }, token), 200, "combined-fuel recalculation after typed CSV import");
    const rawFuelAfterManualEdit = await client.query<{ input_name: string; value: string }>(
      `SELECT input_name, value::text
       FROM raw_data_inputs
       WHERE company_id = $1 AND period = $2 AND site_id = $3
         AND input_name IN ('diesel_litres', 'petrol_litres', 'vehicle_fuel_litres')
       ORDER BY input_name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.deepEqual(rawFuelAfterManualEdit.rows.map((row) => ({ ...row, value: Number(row.value) })), [
      { input_name: "vehicle_fuel_litres", value: 300 },
    ]);
    const metricsAfterManualFuelEdit = await client.query<{ name: string; value: string | null }>(
      `SELECT m.name, mv.value::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.company_id = $1 AND mv.period = $2 AND mv.site_id = $3
         AND m.name IN ('Company Vehicle Fuel Use', 'Vehicle Fuel Consumption', 'Scope 1 Emissions')
       ORDER BY m.name`,
      [tenantA.companyId, importPeriod, siteId],
    );
    assert.ok(metricsAfterManualFuelEdit.rows.some((row) =>
      /Company Vehicle Fuel Use|Vehicle Fuel Consumption/.test(row.name) && Number(row.value) === 300));
    assert.ok(metricsAfterManualFuelEdit.rows.some((row) =>
      row.name === "Scope 1 Emissions" && Math.abs(Number(row.value) - 0.7751) < 1e-8));

    expectStatus(
      await apiRequest("POST", `/api/data-entry/${encodeURIComponent(importPeriod)}/lock`, {}, token),
      200,
      "import period lock",
    );
    expectStatus(
      await apiRequest("POST", "/api/raw-data/import/confirm", importPayload, token),
      400,
      "CSV import against locked period",
    );
  } finally {
    await client.end();
  }

  console.log("audit findings API regression tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
