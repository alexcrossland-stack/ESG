/**
 * API regression tests for the public SME ESG Passport.
 *
 * Run: npx tsx tests/api/esg-passport-public.test.ts
 */

import { Client } from "pg";

import { apiRequest, apiRequestRaw, seedTestTenants } from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function check(name: string, condition: unknown, detail?: string) {
  if (condition) {
    results.push({ name, passed: true, detail });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    results.push({ name, passed: false, detail });
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function seedPassportData(companyAId: string, companyBId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const suffix = Date.now().toString();
  const shareToken = `passport-a-${suffix}`;
  const disabledToken = `passport-b-disabled-${suffix}`;
  const period = "2199";

  try {
    await client.query("UPDATE metrics SET enabled = false WHERE company_id = $1", [companyAId]);
    await client.query("UPDATE reporting_periods SET status = 'closed' WHERE company_id = $1", [companyAId]);
    await client.query(
      `INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date, status)
       VALUES ($1, $2, 'annual', '2199-01-01', '2199-12-31', 'open')`,
      [companyAId, period],
    );

    const metricRows = await client.query<{ id: string }>(
      `INSERT INTO metrics (company_id, name, category, unit, enabled, display_order)
       VALUES
         ($1, $2, 'environmental', 'kWh', true, 9901),
         ($1, $3, 'social', 'employees', true, 9902)
       RETURNING id`,
      [companyAId, `Passport electricity ${suffix}`, `Passport headcount ${suffix}`],
    );
    const [electricityMetric, headcountMetric] = metricRows.rows;
    await client.query(
      `INSERT INTO metric_values (metric_id, period, value, status, data_source_type, workflow_status)
       VALUES
         ($1, $3, '12500.0000', 'green', 'evidenced', 'approved'),
         ($2, $3, '48.0000', 'green', 'estimated', 'approved')`,
      [electricityMetric.id, headcountMetric.id, period],
    );
    await client.query(
      `INSERT INTO evidence_files
         (company_id, filename, file_type, metric_id, linked_module, linked_entity_id, linked_period, evidence_status, description)
       VALUES ($1, $2, 'pdf', $3, 'metric', $3, $4, 'approved', $5)`,
      [
        companyAId,
        `energy-evidence-${suffix}.pdf`,
        electricityMetric.id,
        period,
        `private evidence description ${suffix}`,
      ],
    );
    await client.query(
      `INSERT INTO organisation_sites (company_id, name, slug, type, status, country)
       VALUES ($1, $2, $3, 'operational', 'active', 'GB')`,
      [companyAId, `Private site name ${suffix}`, `passport-site-${suffix}`],
    );
    await client.query(
      `INSERT INTO carbon_calculations
         (company_id, reporting_period, period_type, inputs, scope1_total, scope2_total, scope3_total, total_emissions, factor_year)
       VALUES ($1, $2, 'annual', '{}'::jsonb, '1200.0000', '2300.0000', '450.0000', '3950.0000', 2025)`,
      [companyAId, period],
    );

    const targetResult = await client.query<{ id: string }>(
      `INSERT INTO esg_targets
         (company_id, title, description, pillar, linked_metric_id, baseline_value, baseline_year, target_value, target_year, owner, status, progress_percent, notes)
       VALUES ($1, $2, $3, 'environmental', $4, '100.0000', 2199, '70.0000', 2205, $5, 'in_progress', 25, $6)
       RETURNING id`,
      [
        companyAId,
        `Reduce electricity ${suffix}`,
        `private target description ${suffix}`,
        electricityMetric.id,
        `private target owner ${suffix}`,
        `private target notes ${suffix}`,
      ],
    );
    await client.query(
      `INSERT INTO esg_actions
         (company_id, target_id, title, description, owner, due_date, status, progress_percent, notes)
       VALUES ($1, $2, $3, $4, $5, '2200-06-30', 'in_progress', 40, $6)`,
      [
        companyAId,
        targetResult.rows[0].id,
        `Upgrade lighting ${suffix}`,
        `private action description ${suffix}`,
        `private action owner ${suffix}`,
        `private action notes ${suffix}`,
      ],
    );
    await client.query(
      `INSERT INTO policy_records (company_id, title, policy_type, owner, status, notes)
       VALUES ($1, $2, 'environmental', $3, 'active', $4)`,
      [
        companyAId,
        `Environmental policy ${suffix}`,
        `private policy owner ${suffix}`,
        `private policy notes ${suffix}`,
      ],
    );

    const approvedReport = await client.query<{ id: string }>(
      `INSERT INTO report_runs
         (company_id, period, report_type, report_template, workflow_status, report_data, generated_at)
       VALUES ($1, $2, 'pdf', 'management', 'approved', $3::jsonb, NOW() - INTERVAL '1 minute')
       RETURNING id`,
      [companyAId, period, JSON.stringify({ reportTitle: `Approved Passport Report ${suffix}` })],
    );
    const approvedFile = await client.query<{ id: string }>(
      `INSERT INTO generated_files
         (report_run_id, company_id, file_type, filename, file_data, file_size, expires_at)
       VALUES ($1, $2, 'pdf', $3, $4, 25, NOW() + INTERVAL '30 days')
       RETURNING id`,
      [
        approvedReport.rows[0].id,
        companyAId,
        `approved-passport-${suffix}.pdf`,
        Buffer.from("%PDF-1.4\npassport approved\n").toString("base64"),
      ],
    );
    const draftReport = await client.query<{ id: string }>(
      `INSERT INTO report_runs
         (company_id, period, report_type, report_template, workflow_status, report_data, generated_at)
       VALUES ($1, $2, 'pdf', 'management', 'draft', $3::jsonb, NOW())
       RETURNING id`,
      [companyAId, period, JSON.stringify({ reportTitle: `Private Draft Report ${suffix}` })],
    );
    const draftFile = await client.query<{ id: string }>(
      `INSERT INTO generated_files
         (report_run_id, company_id, file_type, filename, file_data, file_size, expires_at)
       VALUES ($1, $2, 'pdf', $3, $4, 20, NOW() + INTERVAL '30 days')
       RETURNING id`,
      [
        draftReport.rows[0].id,
        companyAId,
        `private-draft-${suffix}.pdf`,
        Buffer.from("%PDF-1.4\nprivate draft\n").toString("base64"),
      ],
    );
    const tenantBReport = await client.query<{ id: string }>(
      `INSERT INTO report_runs (company_id, period, report_type, report_template, workflow_status)
       VALUES ($1, $2, 'pdf', 'management', 'approved')
       RETURNING id`,
      [companyBId, period],
    );
    const tenantBFile = await client.query<{ id: string }>(
      `INSERT INTO generated_files
         (report_run_id, company_id, file_type, filename, file_data, file_size, expires_at)
       VALUES ($1, $2, 'pdf', 'tenant-b-private.pdf', $3, 22, NOW() + INTERVAL '30 days')
       RETURNING id`,
      [
        tenantBReport.rows[0].id,
        companyBId,
        Buffer.from("%PDF-1.4\ntenant b private\n").toString("base64"),
      ],
    );

    await client.query(
      `UPDATE companies
       SET profile_share_enabled = true,
           profile_share_token = $2,
           profile_share_expires_at = NOW() + INTERVAL '30 days',
           profile_visible_sections = $3::jsonb
       WHERE id = $1`,
      [
        companyAId,
        shareToken,
        JSON.stringify([
          "passport_summary",
          "evidence_confidence",
          "emissions",
          "policies_actions_targets",
          "report_access",
        ]),
      ],
    );
    await client.query(
      `UPDATE companies
       SET profile_share_enabled = false, profile_share_token = $2
       WHERE id = $1`,
      [companyBId, disabledToken],
    );

    return {
      suffix,
      shareToken,
      disabledToken,
      approvedReportId: approvedReport.rows[0].id,
      approvedFileId: approvedFile.rows[0].id,
      draftReportId: draftReport.rows[0].id,
      draftFileId: draftFile.rows[0].id,
      tenantBReportId: tenantBReport.rows[0].id,
      tenantBFileId: tenantBFile.rows[0].id,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("\n=== API: Public SME ESG Passport ===\n");
  try {
    const tenants = await seedTestTenants();
    const seeded = await seedPassportData(tenants.tenantA.companyId, tenants.tenantB.companyId);
    const publicPath = `/api/company/esg-profile/public/${seeded.shareToken}`;
    const response = await apiRequest("GET", publicPath);
    check("public passport returns 200 without authentication", response.status === 200, `status=${response.status}`);

    const payload = response.status === 200 ? JSON.parse(response.body) as any : {};
    check(
      "passport states the organisation boundary and reporting period",
      payload.passport?.reportingBoundary?.activeSiteCount >= 1
        && payload.passport?.reportingPeriod?.period === "2199",
    );
    check(
      "completion is a transparent count",
      payload.passport?.completion?.reportedMetrics === 2
        && payload.passport?.completion?.totalMetrics === 2
        && payload.passport?.completion?.percentage === 100,
    );
    check(
      "evidence confidence exposes measured, estimated and evidence-backed counts",
      payload.passport?.evidenceConfidence?.measuredCount === 1
        && payload.passport?.evidenceConfidence?.estimatedCount === 1
        && payload.passport?.evidenceConfidence?.ladder?.find((step: any) => step.key === "evidence_backed")?.count === 1,
    );
    check(
      "emissions retain calculator units and scope facts",
      payload.passport?.emissions?.unit === "kgCO2e"
        && payload.passport?.emissions?.scope1 === 1200
        && payload.passport?.emissions?.total === 3950,
    );
    check(
      "policies, actions and targets expose public progress facts",
      payload.passport?.policies?.items?.some((item: any) => item.title === `Environmental policy ${seeded.suffix}`)
        && payload.passport?.actions?.items?.some((item: any) => item.title === `Upgrade lighting ${seeded.suffix}`)
        && payload.passport?.targets?.items?.some((item: any) => item.title === `Reduce electricity ${seeded.suffix}`),
    );
    check(
      "only an approved report is offered",
      payload.passport?.reportAccess?.latest?.title === `Approved Passport Report ${seeded.suffix}`
        && !JSON.stringify(payload).includes(`Private Draft Report ${seeded.suffix}`),
    );
    check(
      "opaque ESG score is not included unless explicitly selected for legacy compatibility",
      payload.esg_scores === undefined,
    );

    const serialized = JSON.stringify(payload);
    check(
      "public payload omits private owners, notes, site names and raw identifier fields",
      !serialized.includes(`private target owner ${seeded.suffix}`)
        && !serialized.includes(`private action notes ${seeded.suffix}`)
        && !serialized.includes(`Private site name ${seeded.suffix}`)
        && payload.passport?.reportAccess?.latest?.reportId === undefined
        && payload.passport?.reportAccess?.latest?.fileId === undefined,
    );

    const downloadPath = payload.passport?.reportAccess?.latest?.downloadUrl;
    const download = await apiRequestRaw("GET", downloadPath);
    check(
      "approved public report can be downloaded through the share token",
      download.status === 200
        && (download.headers.get("content-type") || "").includes("application/pdf")
        && download.body.toString("utf8").includes("passport approved"),
      `status=${download.status}`,
    );

    const draftDownload = await apiRequest(
      "GET",
      `/api/company/esg-profile/public/${seeded.shareToken}/reports/${seeded.draftReportId}/download/${seeded.draftFileId}`,
    );
    check("draft reports cannot be downloaded publicly", draftDownload.status === 404, `status=${draftDownload.status}`);

    const crossTenantDownload = await apiRequest(
      "GET",
      `/api/company/esg-profile/public/${seeded.shareToken}/reports/${seeded.tenantBReportId}/download/${seeded.tenantBFileId}`,
    );
    check("share token cannot access another tenant's report", crossTenantDownload.status === 404, `status=${crossTenantDownload.status}`);

    const disabled = await apiRequest("GET", `/api/company/esg-profile/public/${seeded.disabledToken}`);
    check("disabled tenant share remains unavailable", disabled.status === 404, `status=${disabled.status}`);

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        "UPDATE companies SET profile_visible_sections = $2::jsonb WHERE id = $1",
        [tenants.tenantA.companyId, JSON.stringify(["passport_summary"])],
      );
    } finally {
      await client.end();
    }
    const filtered = await apiRequest("GET", publicPath);
    const filteredPayload = filtered.status === 200 ? JSON.parse(filtered.body) as any : {};
    check("unselected passport sections are absent", filteredPayload.passport?.reportAccess === undefined);
    const hiddenDownload = await apiRequest("GET", downloadPath);
    check("report download is revoked when report access is deselected", hiddenDownload.status === 404, `status=${hiddenDownload.status}`);
  } catch (error: any) {
    check("public passport test setup", false, error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`\n=== Public SME ESG Passport: ${passed}/${results.length} passed ===\n`);
  if (passed !== results.length) process.exit(1);
}

main();
