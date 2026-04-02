/**
 * PE Demo Seed
 * Creates a realistic private-equity demo environment with 1 group,
 * 4 portfolio companies at varying ESG maturity, and 3 demo users.
 *
 * Run:  npx tsx server/seed-pe-demo.ts
 * API:  POST /api/admin/demo/pe-seed  (super_admin only)
 *
 * Fully idempotent — subsequent runs produce "skipped" counts, never duplicates.
 *
 * Demo Credentials:
 * -----------------
 * PE Firm Admin (portfolio_owner, sees Portfolio Dashboard on login):
 *   Email:    demo.pe.admin@simplyesg.demo
 *   Password: DemoAdmin1!
 *
 * Company Admin (admin inside "GreenTech Solutions (Demo)"):
 *   Email:    demo.co.admin@simplyesg.demo
 *   Password: DemoAdmin1!
 *
 * Contributor (contributor inside "BuildRight Construction (Demo)"):
 *   Email:    demo.contributor@simplyesg.demo
 *   Password: DemoAdmin1!
 *
 * Portfolio Companies:
 *   1. GreenTech Solutions (Demo)     — high completion (3 periods, 15+ metrics, evidence)
 *   2. BuildRight Construction (Demo) — partial (1 period, 8 metrics, 1 evidence)
 *   3. RetailCo Brands (Demo)         — low (1 period, 2 metrics, no evidence)
 *   4. Horizon Logistics (Demo)       — missing data (onboarding started, no metric values)
 *
 * Metric names are sourced from server/default-metrics.ts — the single canonical
 * source shared with routes.ts seedDatabase(). No private metric list exists here.
 */

import { db } from "./storage";
import {
  users,
  companies,
  companySettings,
  metrics,
  metricValues,
  evidenceFiles,
  reportingPeriods,
  groups,
  groupCompanies,
  userGroupRoles,
} from "@shared/schema";
import { eq, and, notInArray, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { DEFAULT_METRICS, DEFAULT_METRIC_NAMES } from "./default-metrics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = "DemoAdmin1!";
const CONSENT_VERSION = "1.0";
const GROUP_SLUG = "pe-demo-fund-2025";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function counter() {
  const c: Record<string, { created: number; skipped: number }> = {};
  function track(key: string, wasCreated: boolean) {
    if (!c[key]) c[key] = { created: 0, skipped: 0 };
    if (wasCreated) c[key].created++; else c[key].skipped++;
  }
  function summary() {
    return Object.entries(c)
      .map(([k, v]) => `  ${k}: ${v.created} created, ${v.skipped} skipped`)
      .join("\n");
  }
  return { track, summary, raw: c };
}

async function findOrCreateCompany(
  name: string,
  extra: Record<string, unknown>,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.name, name), eq(companies.demoMode, true)));
  if (existing) {
    counts.track("companies", false);
    return { company: existing, created: false };
  }
  const [created] = await db
    .insert(companies)
    .values({ name, ...extra } as any)
    .returning();
  counts.track("companies", true);
  return { company: created, created: true };
}

async function ensureCompanySettings(companyId: string, counts: ReturnType<typeof counter>) {
  const [existing] = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId));
  if (existing) { counts.track("company_settings", false); return; }
  await db.insert(companySettings).values({
    companyId,
    trackEnergy: true, trackWaste: true, trackWater: true,
    trackDiversity: true, trackTraining: true, trackHealthSafety: true,
    trackGovernance: true,
    requireApprovalMetrics: false, requireApprovalReports: false, requireApprovalPolicies: false,
    reminderEnabled: true, reminderFrequency: "monthly",
  } as any);
  counts.track("company_settings", true);
}

async function findOrCreateUser(
  email: string,
  username: string,
  role: "admin" | "contributor" | "viewer",
  companyId: string,
  hashedPw: string,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) { counts.track("users", false); return { user: existing, created: false }; }
  const now = new Date();
  const [created] = await db.insert(users).values({
    username,
    email,
    password: hashedPw,
    role,
    companyId,
    termsVersionAccepted: CONSENT_VERSION,
    privacyVersionAccepted: CONSENT_VERSION,
    termsAcceptedAt: now,
    privacyAcceptedAt: now,
  } as any).returning();
  counts.track("users", true);
  return { user: created, created: true };
}

async function findOrCreateGroup(slug: string, name: string, counts: ReturnType<typeof counter>) {
  const [existing] = await db.select().from(groups).where(eq(groups.slug, slug));
  if (existing) { counts.track("groups", false); return { group: existing, created: false }; }
  const [created] = await db
    .insert(groups)
    .values({ name, slug, type: "portfolio", description: "PE demo portfolio group" } as any)
    .returning();
  counts.track("groups", true);
  return { group: created, created: true };
}

async function ensureGroupCompany(groupId: string, companyId: string, counts: ReturnType<typeof counter>) {
  const [existing] = await db
    .select()
    .from(groupCompanies)
    .where(and(eq(groupCompanies.groupId, groupId), eq(groupCompanies.companyId, companyId)));
  if (existing) { counts.track("group_companies", false); return; }
  await db.insert(groupCompanies).values({ groupId, companyId } as any);
  counts.track("group_companies", true);
}

async function ensureUserGroupRole(
  userId: string,
  groupId: string,
  role: "portfolio_owner" | "portfolio_viewer",
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db
    .select()
    .from(userGroupRoles)
    .where(and(eq(userGroupRoles.userId, userId), eq(userGroupRoles.groupId, groupId)));
  if (existing) { counts.track("user_group_roles", false); return; }
  await db.insert(userGroupRoles).values({ userId, groupId, role } as any);
  counts.track("user_group_roles", true);
}

/**
 * Creates the full platform-canonical set of 28 metrics for a company.
 * Uses DEFAULT_METRICS from server/default-metrics.ts — no private list.
 */
async function ensureMetrics(companyId: string, counts: ReturnType<typeof counter>) {
  const canonicalNameSet = new Set(DEFAULT_METRIC_NAMES);
  const existing = await db.select().from(metrics).where(eq(metrics.companyId, companyId));

  // Purge stale metrics whose names are no longer in the canonical list.
  // Delete metric_values first to avoid orphaned rows, then delete the metrics.
  const stale = existing.filter((m) => !canonicalNameSet.has(m.name));
  if (stale.length > 0) {
    const staleIds = stale.map((m) => m.id);
    // Delete metric values FOR stale metrics (inArray = delete only the stale ones)
    await db.delete(metricValues).where(inArray(metricValues.metricId, staleIds));
    await db.delete(metrics).where(
      and(eq(metrics.companyId, companyId), notInArray(metrics.name, DEFAULT_METRIC_NAMES))
    );
  }

  const canonical = existing.filter((m) => canonicalNameSet.has(m.name));
  const existingNames = new Set(canonical.map((m) => m.name));
  const toInsert = DEFAULT_METRICS.filter((m) => !existingNames.has(m.name));
  if (toInsert.length === 0 && stale.length === 0) {
    counts.track("metrics", false);
    return canonical;
  }
  if (toInsert.length === 0) {
    // Stale rows were purged but no new rows to insert — canonical set is already complete
    counts.track("metrics", false);
    return canonical;
  }
  const rows = toInsert.map((m) => ({
    companyId,
    name: m.name,
    description: m.description,
    category: m.category,
    unit: m.unit,
    frequency: m.frequency,
    dataOwner: m.dataOwner,
    enabled: true,
    isDefault: true,
    metricType: m.metricType,
    calculationType: m.calculationType ?? null,
    formulaText: m.formulaText ?? null,
    direction: m.direction,
    targetMin: m.targetMin ?? null,
    targetMax: m.targetMax ?? null,
    displayOrder: m.displayOrder,
    helpText: m.helpText,
    weight: "1",
    importance: "medium",
  } as any));
  const inserted = await db.insert(metrics).values(rows).returning();
  counts.track("metrics", true);
  return [...canonical, ...inserted];
}

async function ensureReportingPeriod(
  companyId: string,
  name: string,
  periodType: "annual" | "quarterly" | "monthly",
  startDate: Date,
  endDate: Date,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db
    .select()
    .from(reportingPeriods)
    .where(and(eq(reportingPeriods.companyId, companyId), eq(reportingPeriods.name, name)));
  if (existing) {
    // Patch stale period_type on existing rows (e.g. Q1 2025 previously seeded as "annual")
    if (existing.periodType !== periodType) {
      await db
        .update(reportingPeriods)
        .set({ periodType } as any)
        .where(eq(reportingPeriods.id, existing.id));
    }
    counts.track("reporting_periods", false);
    return { ...existing, periodType };
  }
  const [created] = await db
    .insert(reportingPeriods)
    .values({
      companyId,
      name,
      periodType,
      startDate,
      endDate,
      status: "closed" as const,
    } as any)
    .returning();
  counts.track("reporting_periods", true);
  return created;
}

/**
 * Idempotency keyed on (metricId, reportingPeriodId) — the semantic composite key.
 * periodName is stored in the period text column for display/filtering in the UI.
 */
async function ensureMetricValue(
  metricId: string,
  periodName: string,
  reportingPeriodId: string,
  value: string,
  submittedBy: string,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db
    .select()
    .from(metricValues)
    .where(
      and(
        eq(metricValues.metricId, metricId),
        eq(metricValues.reportingPeriodId, reportingPeriodId),
      ),
    );
  if (existing) { counts.track("metric_values", false); return; }
  await db.insert(metricValues).values({
    metricId,
    period: periodName,
    reportingPeriodId,
    value,
    status: "green",
    submittedBy,
    dataSourceType: "manual" as const,
    workflowStatus: "approved" as const,
    locked: true,
  } as any);
  counts.track("metric_values", true);
}

/**
 * fileType is derived from the filename extension so .xlsx files are not
 * incorrectly stored as "pdf".
 */
async function ensureEvidence(
  companyId: string,
  filename: string,
  description: string,
  uploadedBy: string,
  counts: ReturnType<typeof counter>,
) {
  const fileType = filename.split(".").pop()?.toLowerCase() ?? "pdf";
  const [existing] = await db
    .select()
    .from(evidenceFiles)
    .where(and(eq(evidenceFiles.companyId, companyId), eq(evidenceFiles.filename, filename)));
  if (existing) {
    // Patch stale file_type on existing rows (e.g. .xlsx files seeded as "pdf")
    if (existing.fileType !== fileType) {
      await db
        .update(evidenceFiles)
        .set({ fileType } as any)
        .where(eq(evidenceFiles.id, existing.id));
    }
    counts.track("evidence_files", false);
    return;
  }
  await db.insert(evidenceFiles).values({
    companyId,
    filename,
    fileType,
    description,
    evidenceStatus: "approved" as const,
    uploadedBy,
    linkedModule: "metrics",
  } as any);
  counts.track("evidence_files", true);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedPeDemo(): Promise<{ summary: string; counts: Record<string, { created: number; skipped: number }> }> {
  const counts = counter();
  const hashedPw = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Group ──────────────────────────────────────────────────────────────────
  const { group } = await findOrCreateGroup(GROUP_SLUG, "Apex PE Fund I (Demo)", counts);

  // ── Company 1: GreenTech Solutions (Demo) ─ HIGH completion ───────────────
  const { company: greentech } = await findOrCreateCompany("GreenTech Solutions (Demo)", {
    industry: "Technology",
    country: "United Kingdom",
    employeeCount: 120,
    revenueBand: "10M-50M",
    locations: 2,
    businessType: "SME",
    hasVehicles: false,
    operationalProfile: "office",
    reportingYearStart: "January",
    onboardingComplete: true,
    onboardingStep: 8,
    esgMaturity: "formal_programme",
    selectedModules: ["carbon_calculator", "policy_generator"],
    selectedMetrics: DEFAULT_METRIC_NAMES,
    lifecycleState: "active",
    demoMode: true,
    isSuperAdmin: false,
  }, counts);
  await ensureCompanySettings(greentech.id, counts);

  // ── Company 2: BuildRight Construction (Demo) ─ PARTIAL completion ─────────
  const brSelectedMetrics = [
    "Electricity Consumption",
    "Gas / Fuel Consumption",
    "Company Vehicle Fuel Use",
    "Scope 1 Emissions",
    "Waste Generated",
    "Total Employees",
    "Gender Split (% Female)",
    "Lost Time Incidents",
  ];
  const { company: buildright } = await findOrCreateCompany("BuildRight Construction (Demo)", {
    industry: "Construction",
    country: "United Kingdom",
    employeeCount: 250,
    revenueBand: "10M-50M",
    locations: 4,
    businessType: "SME",
    hasVehicles: true,
    operationalProfile: "manufacturing",
    reportingYearStart: "April",
    onboardingComplete: true,
    onboardingStep: 8,
    esgMaturity: "some_activity",
    selectedModules: ["carbon_calculator"],
    selectedMetrics: brSelectedMetrics,
    lifecycleState: "active",
    demoMode: true,
    isSuperAdmin: false,
  }, counts);
  await ensureCompanySettings(buildright.id, counts);

  // ── Company 3: RetailCo Brands (Demo) ─ LOW completion ────────────────────
  const rcSelectedMetrics = [
    "Electricity Consumption",
    "Total Employees",
  ];
  const { company: retailco } = await findOrCreateCompany("RetailCo Brands (Demo)", {
    industry: "Retail",
    country: "United Kingdom",
    employeeCount: 80,
    revenueBand: "1M-10M",
    locations: 3,
    businessType: "SME",
    hasVehicles: false,
    operationalProfile: "retail",
    reportingYearStart: "January",
    onboardingComplete: true,
    onboardingStep: 8,
    esgMaturity: "just_starting",
    selectedModules: [],
    selectedMetrics: rcSelectedMetrics,
    lifecycleState: "active",
    demoMode: true,
    isSuperAdmin: false,
  }, counts);
  await ensureCompanySettings(retailco.id, counts);

  // ── Company 4: Horizon Logistics (Demo) ─ EMPTY ───────────────────────────
  const { company: horizon } = await findOrCreateCompany("Horizon Logistics (Demo)", {
    industry: "Transportation",
    country: "United Kingdom",
    employeeCount: 45,
    revenueBand: "<1M",
    locations: 1,
    businessType: "SME",
    hasVehicles: true,
    operationalProfile: "mixed",
    reportingYearStart: "January",
    onboardingComplete: false,
    onboardingStep: 2,
    esgMaturity: "just_starting",
    selectedModules: [],
    selectedMetrics: [],
    lifecycleState: "onboarding_started",
    demoMode: true,
    isSuperAdmin: false,
  }, counts);
  await ensureCompanySettings(horizon.id, counts);

  // ── Users ─────────────────────────────────────────────────────────────────
  const { user: peAdmin } = await findOrCreateUser(
    "demo.pe.admin@simplyesg.demo",
    "demo_pe_admin",
    "admin",
    greentech.id,
    hashedPw,
    counts,
  );
  const { user: coAdmin } = await findOrCreateUser(
    "demo.co.admin@simplyesg.demo",
    "demo_co_admin",
    "admin",
    greentech.id,
    hashedPw,
    counts,
  );
  const { user: contributor } = await findOrCreateUser(
    "demo.contributor@simplyesg.demo",
    "demo_contributor",
    "contributor",
    buildright.id,
    hashedPw,
    counts,
  );

  // ── Group memberships ─────────────────────────────────────────────────────
  await ensureGroupCompany(group.id, greentech.id, counts);
  await ensureGroupCompany(group.id, buildright.id, counts);
  await ensureGroupCompany(group.id, retailco.id, counts);
  await ensureGroupCompany(group.id, horizon.id, counts);

  await ensureUserGroupRole(peAdmin.id, group.id, "portfolio_owner", counts);

  // ── Reporting periods ─────────────────────────────────────────────────────

  // GreenTech: 2 annual + 1 quarterly
  const gtP2023 = await ensureReportingPeriod(
    greentech.id, "FY 2023", "annual",
    new Date("2023-01-01"), new Date("2023-12-31"), counts,
  );
  const gtP2024 = await ensureReportingPeriod(
    greentech.id, "FY 2024", "annual",
    new Date("2024-01-01"), new Date("2024-12-31"), counts,
  );
  const gtP2025 = await ensureReportingPeriod(
    greentech.id, "Q1 2025", "quarterly",          // ← quarterly, not annual
    new Date("2025-01-01"), new Date("2025-03-31"), counts,
  );

  // BuildRight: 1 annual
  const brP2024 = await ensureReportingPeriod(
    buildright.id, "FY 2024", "annual",
    new Date("2024-04-01"), new Date("2025-03-31"), counts,
  );

  // RetailCo: 1 annual
  const rcP2024 = await ensureReportingPeriod(
    retailco.id, "FY 2024", "annual",
    new Date("2024-01-01"), new Date("2024-12-31"), counts,
  );

  // ── Metrics (all 28 canonical per company) ─────────────────────────────────
  const gtMetrics = await ensureMetrics(greentech.id, counts);
  const brMetrics = await ensureMetrics(buildright.id, counts);
  const rcMetrics = await ensureMetrics(retailco.id, counts);
  await ensureMetrics(horizon.id, counts);

  function findMetric(metricList: typeof gtMetrics, name: string) {
    return metricList.find((m) => m.name === name);
  }

  // ── GreenTech metric values ─────────────────────────────────────────────
  // High-maturity office technology company (no vehicles, 2 sites, improving YoY).
  // Annual periods: full set of env + social + governance metrics.
  // Quarterly period: operational metrics only (no annual-frequency policy metrics).

  const gtAnnualVals: Array<{ period: typeof gtP2023; vals: Record<string, string> }> = [
    {
      period: gtP2023,
      vals: {
        "Electricity Consumption":          "312000",
        "Gas / Fuel Consumption":           "48000",
        "Company Vehicle Fuel Use":         "0",
        "Scope 1 Emissions":               "8.8",
        "Scope 2 Emissions":               "64.8",
        "Waste Generated":                 "12.5",
        "Water Consumption":               "1800",
        "Total Employees":                 "102",
        "Gender Split (% Female)":         "44",
        "Employee Turnover Rate":          "8.2",
        "Training Hours per Employee":     "18",
        "Lost Time Incidents":             "2",
        "Employee Engagement Score":       "7.2",
        "Living Wage Coverage":            "92",
        "Board Meetings Held":             "4",
        "Anti-Bribery Policy in Place":    "1",
        "Whistleblowing Policy in Place":  "1",
        "Data Privacy Training Completion": "80",
        "Supplier Code of Conduct Adoption": "62",
        "Cybersecurity Policy in Place":   "1",
        "ESG Responsibility Assigned":     "1",
        "ESG Targets Set":                 "0",
      },
    },
    {
      period: gtP2024,
      vals: {
        "Electricity Consumption":          "287000",
        "Gas / Fuel Consumption":           "41000",
        "Company Vehicle Fuel Use":         "0",
        "Scope 1 Emissions":               "7.5",
        "Scope 2 Emissions":               "59.7",
        "Waste Generated":                 "10.8",
        "Water Consumption":               "1650",
        "Total Employees":                 "115",
        "Gender Split (% Female)":         "47",
        "Employee Turnover Rate":          "6.9",
        "Training Hours per Employee":     "22",
        "Lost Time Incidents":             "1",
        "Employee Engagement Score":       "7.6",
        "Living Wage Coverage":            "97",
        "Board Meetings Held":             "5",
        "Anti-Bribery Policy in Place":    "1",
        "Whistleblowing Policy in Place":  "1",
        "Data Privacy Training Completion": "91",
        "Supplier Code of Conduct Adoption": "78",
        "Cybersecurity Policy in Place":   "1",
        "ESG Responsibility Assigned":     "1",
        "ESG Targets Set":                 "1",
      },
    },
  ];

  for (const { period, vals } of gtAnnualVals) {
    for (const [metricName, value] of Object.entries(vals)) {
      const m = findMetric(gtMetrics, metricName);
      if (m) await ensureMetricValue(m.id, period.name, period.id, value, coAdmin.id, counts);
    }
  }

  // Q1 2025 — operational metrics only (no annual-frequency policy metrics)
  const gtQ1Vals: Record<string, string> = {
    "Electricity Consumption":      "71000",
    "Gas / Fuel Consumption":       "9800",
    "Company Vehicle Fuel Use":     "0",
    "Scope 1 Emissions":           "1.8",
    "Scope 2 Emissions":           "14.8",
    "Waste Generated":             "2.4",
    "Water Consumption":           "390",
    "Total Employees":             "120",
    "Gender Split (% Female)":     "49",
    "Lost Time Incidents":         "0",
    "Board Meetings Held":         "2",
  };
  for (const [metricName, value] of Object.entries(gtQ1Vals)) {
    const m = findMetric(gtMetrics, metricName);
    if (m) await ensureMetricValue(m.id, gtP2025.name, gtP2025.id, value, coAdmin.id, counts);
  }

  // ── BuildRight metric values (8 metrics, construction with vehicles) ───────
  const brVals: Record<string, string> = {
    "Electricity Consumption":    "198000",
    "Gas / Fuel Consumption":     "92000",
    "Company Vehicle Fuel Use":   "8400",
    "Scope 1 Emissions":         "70.5",
    "Waste Generated":           "38.4",
    "Total Employees":           "248",
    "Gender Split (% Female)":   "28",
    "Lost Time Incidents":       "7",
  };
  for (const [metricName, value] of Object.entries(brVals)) {
    const m = findMetric(brMetrics, metricName);
    if (m) await ensureMetricValue(m.id, brP2024.name, brP2024.id, value, contributor.id, counts);
  }

  // ── RetailCo metric values (2 metrics only) ────────────────────────────────
  const rcVals: Record<string, string> = {
    "Electricity Consumption": "145000",
    "Total Employees":         "79",
  };
  for (const [metricName, value] of Object.entries(rcVals)) {
    const m = findMetric(rcMetrics, metricName);
    if (m) await ensureMetricValue(m.id, rcP2024.name, rcP2024.id, value, coAdmin.id, counts);
  }

  // ── Evidence files ─────────────────────────────────────────────────────────
  // fileType is derived from filename extension (not hardcoded).

  // GreenTech: 6 evidence items across formats
  const gtEvidenceItems = [
    { filename: "GreenTech_Electricity_Invoice_Q4_2024.pdf",   description: "Q4 2024 electricity invoice from National Grid" },
    { filename: "GreenTech_ISO14001_Certificate_2024.pdf",     description: "ISO 14001 environmental management certification" },
    { filename: "GreenTech_Carbon_Audit_Report_FY2024.pdf",    description: "Third-party verified carbon emissions audit" },
    { filename: "GreenTech_Waste_Manifests_FY2024.xlsx",       description: "Annual waste disposal manifests and recycling records" },
    { filename: "GreenTech_HR_Diversity_Report_2024.pdf",      description: "Annual gender diversity and inclusion report" },
    { filename: "GreenTech_BoardAttendance_Register_2024.pdf", description: "Board meeting attendance register FY 2024" },
  ];
  for (const ev of gtEvidenceItems) {
    await ensureEvidence(greentech.id, ev.filename, ev.description, coAdmin.id, counts);
  }

  // BuildRight: 1 evidence item
  await ensureEvidence(
    buildright.id,
    "BuildRight_Electricity_Meter_Reading_2024.pdf",
    "Annual electricity meter reading summary",
    contributor.id,
    counts,
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const summaryLines = [
    "=== PE Demo Seed Complete ===",
    "",
    counts.summary(),
    "",
    "Demo credentials:",
    `  PE Admin      : demo.pe.admin@simplyesg.demo / ${DEMO_PASSWORD}`,
    `  Company Admin : demo.co.admin@simplyesg.demo / ${DEMO_PASSWORD}`,
    `  Contributor   : demo.contributor@simplyesg.demo / ${DEMO_PASSWORD}`,
    "",
    "Portfolio: Apex PE Fund I (Demo)",
    "  1. GreenTech Solutions (Demo)   — high completion (3 periods, 22 metric values, 6 evidence)",
    "  2. BuildRight Construction (Demo) — partial (1 period, 8 metric values, 1 evidence)",
    "  3. RetailCo Brands (Demo)       — low (1 period, 2 metric values, no evidence)",
    "  4. Horizon Logistics (Demo)     — empty (onboarding started only)",
    "",
    "Canonical metric source: server/default-metrics.ts (28 metrics)",
  ];
  const summary = summaryLines.join("\n");
  console.log(summary);
  return { summary, counts: counts.raw };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  seedPeDemo()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
