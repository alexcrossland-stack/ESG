/**
 * Focused API regression for public Passport accuracy and privacy.
 *
 * Run: BASE_URL=http://127.0.0.1:5000 DATABASE_URL=postgresql://... \
 *   node --import tsx tests/api/esg-passport-accuracy.test.ts
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { apiRequest } from "../fixtures/seed.js";

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

function check(name: string, condition: unknown, detail?: string) {
  const passed = Boolean(condition);
  results.push({ name, passed, detail });
  console[passed ? "log" : "error"](`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function seedAccuracyScenario() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const suffix = randomUUID();
  const token = `passport-accuracy-${suffix}`;
  const period = `FY-ACCURACY-${suffix}`;
  const otherPeriod = `FY-OTHER-${suffix}`;

  try {
    const companies = await client.query<{ id: string }>(
      `INSERT INTO companies
         (name, onboarding_complete, profile_share_enabled, profile_share_token,
          profile_share_expires_at, profile_visible_sections)
       VALUES
         ($1, true, true, $3, NOW() + INTERVAL '30 days', $4::jsonb),
         ($2, true, false, NULL, NULL, '[]'::jsonb)
       RETURNING id`,
      [
        `Passport Accuracy A ${suffix}`,
        `Tenant B private company ${suffix}`,
        token,
        JSON.stringify([
          "passport_summary",
          "evidence_confidence",
          "emissions",
          "policies_actions_targets",
          "key_metrics",
          "policy_status",
          "carbon_summary",
        ]),
      ],
    );
    const [companyA, companyB] = companies.rows;

    await client.query(
      `INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date, status)
       VALUES ($1, $2, 'annual', '2298-01-01', '2298-12-31', 'open')`,
      [companyA.id, period],
    );

    const sites = await client.query<{ id: string; status: string }>(
      `INSERT INTO organisation_sites (company_id, name, slug, type, status)
       VALUES
         ($1, 'Active site A', $2, 'operational', 'active'),
         ($1, 'Active site B', $3, 'operational', 'active'),
         ($1, 'Archived site', $4, 'operational', 'archived')
       RETURNING id, status`,
      [companyA.id, `active-a-${suffix}`, `active-b-${suffix}`, `archived-${suffix}`],
    );
    const activeSites = sites.rows.filter((site) => site.status === "active");
    const archivedSite = sites.rows.find((site) => site.status === "archived");
    if (activeSites.length !== 2 || !archivedSite) throw new Error("site seed failed");

    const metrics = await client.query<{ id: string; name: string }>(
      `INSERT INTO metrics (company_id, name, category, unit, enabled, display_order)
       VALUES
         ($1, $2, 'environmental', 'kWh', true, 9911),
         ($1, $3, 'social', '%', true, 9912),
         ($1, $4, 'governance', 'count', true, 9913)
       RETURNING id, name`,
      [
        companyA.id,
        `Organisation precedence ${suffix}`,
        `Site rate ${suffix}`,
        `Draft only ${suffix}`,
      ],
    );
    const organisationMetric = metrics.rows[0];
    const rateMetric = metrics.rows[1];
    const draftMetric = metrics.rows[2];

    await client.query(
      `INSERT INTO metric_values
         (metric_id, period, value, status, data_source_type, workflow_status, site_id, submitted_at)
       VALUES
         ($1, $7, '100', 'green', 'evidenced', 'approved', NULL, NOW()),
         ($1, $7, '60', 'green', 'manual', 'approved', $4, NOW()),
         ($1, $7, '40', 'green', 'manual', 'approved', $5, NOW()),
         ($1, $7, '900', 'red', 'manual', 'approved', $6, NOW()),
         ($2, $7, '999', 'red', 'manual', 'draft', NULL, NOW()),
         ($2, $7, '80', 'green', 'manual', 'approved', $4, NOW()),
         ($2, $7, '90', 'green', 'manual', 'approved', $5, NOW()),
         ($2, $7, '1', 'red', 'manual', 'approved', $6, NOW()),
         ($3, $7, '777', 'red', 'manual', 'draft', NULL, NOW())`,
      [
        organisationMetric.id,
        rateMetric.id,
        draftMetric.id,
        activeSites[0].id,
        activeSites[1].id,
        archivedSite.id,
        period,
      ],
    );

    const tenantBMetric = await client.query<{ id: string }>(
      `INSERT INTO metrics (company_id, name, category, unit, enabled)
       VALUES ($1, $2, 'environmental', 'kWh', true)
       RETURNING id`,
      [companyB.id, `Tenant B secret metric ${suffix}`],
    );
    await client.query(
      `INSERT INTO metric_values (metric_id, period, value, workflow_status)
       VALUES ($1, $2, '123456', 'approved')`,
      [tenantBMetric.rows[0].id, period],
    );

    await client.query(
      `INSERT INTO carbon_calculations
         (company_id, reporting_period, period_type, inputs, scope1_total, scope2_total,
          scope3_total, total_emissions, factor_year, site_id, created_at)
       VALUES
         ($1, $6, 'annual', '{}'::jsonb, '5', '5', '10', '20', 2026, $2, NOW() - INTERVAL '2 days'),
         ($1, $6, 'annual', '{}'::jsonb, '10', '10', '10', '30', 2026, $2, NOW()),
         ($1, $6, 'annual', '{}'::jsonb, '15', '15', '10', '40', 2026, $3, NOW()),
         ($1, $6, 'annual', '{}'::jsonb, '300', '300', '300', '900', 2026, $4, NOW()),
         ($1, $7, 'annual', '{}'::jsonb, '3333', '3333', '3333', '9999', 2027, NULL, NOW() + INTERVAL '1 day'),
         ($5, $6, 'annual', '{}'::jsonb, '4000', '4000', '4000', '12000', 2026, NULL, NOW())`,
      [
        companyA.id,
        activeSites[0].id,
        activeSites[1].id,
        archivedSite.id,
        companyB.id,
        period,
        otherPeriod,
      ],
    );

    await client.query(
      `INSERT INTO esg_policies (company_id, status, review_date)
       VALUES ($1, 'draft', NOW() + INTERVAL '1 year')`,
      [companyA.id],
    );
    await client.query(
      `INSERT INTO policy_records (company_id, title, policy_type, status)
       VALUES
         ($1, $2, 'environmental', 'active'),
         ($1, $3, 'governance', 'draft'),
         ($4, $5, 'environmental', 'active')`,
      [
        companyA.id,
        `Public active policy ${suffix}`,
        `Private draft policy ${suffix}`,
        companyB.id,
        `Tenant B secret policy ${suffix}`,
      ],
    );
    await client.query(
      `INSERT INTO generated_policies
         (company_id, template_id, template_slug, title, status, workflow_status, content)
       VALUES
         ($1, $2, 'accuracy-approved', $3, 'approved', 'approved', '{}'::jsonb),
         ($1, $4, 'accuracy-draft-workflow', $5, 'published', 'draft', '{}'::jsonb)`,
      [
        companyA.id,
        `template-approved-${suffix}`,
        `Public approved generated policy ${suffix}`,
        `template-draft-${suffix}`,
        `Private workflow draft policy ${suffix}`,
      ],
    );

    return {
      token,
      period,
      suffix,
      names: {
        organisationMetric: organisationMetric.name,
        rateMetric: rateMetric.name,
        draftMetric: draftMetric.name,
      },
    };
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("\n=== API: ESG Passport accuracy and privacy ===\n");
  try {
    const seeded = await seedAccuracyScenario();
    const response = await apiRequest("GET", `/api/company/esg-profile/public/${seeded.token}`);
    check("public Passport responds without authentication", response.status === 200, `status=${response.status}`);
    const payload = response.status === 200 ? JSON.parse(response.body) as any : {};
    const metrics = Array.isArray(payload.key_metrics) ? payload.key_metrics : [];
    const organisationMetric = metrics.find((metric: any) => metric.name === seeded.names.organisationMetric);
    const rateMetric = metrics.find((metric: any) => metric.name === seeded.names.rateMetric);
    const draftMetric = metrics.find((metric: any) => metric.name === seeded.names.draftMetric);

    check(
      "organisation value takes precedence over site values without double-counting",
      Number(organisationMetric?.value) === 100
        && organisationMetric?.aggregationMethod === "organisation_record"
        && organisationMetric?.sourceScope === "organisation",
    );
    check(
      "site percentages average approved active-site rows only",
      Number(rateMetric?.value) === 85
        && rateMetric?.aggregationMethod === "average"
        && rateMetric?.contributingSiteCount === 2
        && rateMetric?.workflowStatus === "approved",
    );
    check(
      "draft metric records are not published",
      draftMetric?.hasValue === false
        && draftMetric?.value === null
        && payload.passport?.completion?.reportedMetrics === 2,
    );
    check(
      "carbon is isolated to the Passport period and sums one latest active-site calculation",
      payload.passport?.emissions?.reportingPeriod === seeded.period
        && payload.passport?.emissions?.matchesPassportPeriod === true
        && payload.passport?.emissions?.total === 70
        && payload.passport?.emissions?.aggregationMethod === "sum"
        && payload.passport?.emissions?.contributingSiteCount === 2,
    );
    check(
      "boundary text explains organisation precedence and active-site aggregation",
      payload.passport?.reportingBoundary?.organisationLevelDataPrecedence === true
        && payload.passport?.reportingBoundary?.activeSiteCount === 2
        && /take precedence/i.test(payload.passport?.reportingBoundary?.label || "")
        && /percentages or rates/i.test(payload.passport?.reportingBoundary?.metricAggregationLabel || ""),
    );

    const serialized = JSON.stringify(payload);
    check(
      "draft policies are excluded from public policy summaries and legacy status",
      payload.passport?.policies?.total === 2
        && payload.passport?.policies?.published === 2
        && payload.policy_status?.status === "not_published"
        && !serialized.includes(`Private draft policy ${seeded.suffix}`)
        && !serialized.includes(`Private workflow draft policy ${seeded.suffix}`),
    );
    check(
      "another tenant's metrics, policies and carbon never enter the Passport",
      !serialized.includes(`Tenant B secret metric ${seeded.suffix}`)
        && !serialized.includes(`Tenant B secret policy ${seeded.suffix}`)
        && payload.passport?.emissions?.total !== 12000,
    );
  } catch (error: any) {
    check("ESG Passport accuracy test setup", false, error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`\n=== ESG Passport accuracy and privacy: ${passed}/${results.length} passed ===\n`);
  if (passed !== results.length) process.exit(1);
}

main();
