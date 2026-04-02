/**
 * PE Demo Seed
 * Creates a realistic private-equity demo environment with 1 group,
 * 4 portfolio companies at varying ESG maturity, and 3 demo users.
 *
 * Run:  npx tsx server/seed-pe-demo.ts
 * API:  POST /api/admin/demo/pe-seed  (super_admin only)
 *
 * Fully idempotent — subsequent runs produce "skipped" counts, never duplicates.
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
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = "DemoAdmin1!";
const CONSENT_VERSION = "1.0";
const GROUP_SLUG = "pe-demo-fund-2025";

const CORE_METRICS = [
  { name: "Total Carbon Emissions",        category: "environmental" as const, unit: "tCO2e",           metricType: "manual",     calculationType: null },
  { name: "Electricity Consumption",       category: "environmental" as const, unit: "kWh",             metricType: "manual",     calculationType: null },
  { name: "Gas Consumption",               category: "environmental" as const, unit: "kWh",             metricType: "manual",     calculationType: null },
  { name: "Waste Generated",               category: "environmental" as const, unit: "tonnes",          metricType: "manual",     calculationType: null },
  { name: "Water Usage",                   category: "environmental" as const, unit: "m3",              metricType: "manual",     calculationType: null },
  { name: "Total Headcount",               category: "social"        as const, unit: "employees",      metricType: "manual",     calculationType: null },
  { name: "Gender Diversity",              category: "social"        as const, unit: "%",               metricType: "manual",     calculationType: null },
  { name: "Employee Turnover Rate",        category: "social"        as const, unit: "%",               metricType: "manual",     calculationType: null },
  { name: "Training Hours Per Employee",   category: "social"        as const, unit: "hours",          metricType: "manual",     calculationType: null },
  { name: "Health & Safety Incidents",     category: "social"        as const, unit: "incidents",      metricType: "manual",     calculationType: null },
  { name: "Board Meeting Attendance",      category: "governance"    as const, unit: "%",               metricType: "manual",     calculationType: null },
  { name: "Anti-Bribery Training",         category: "governance"    as const, unit: "%",               metricType: "manual",     calculationType: null },
  { name: "Data Breach Incidents",         category: "governance"    as const, unit: "incidents",      metricType: "manual",     calculationType: null },
  { name: "Supplier ESG Assessment Rate",  category: "governance"    as const, unit: "%",               metricType: "manual",     calculationType: null },
];

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
  const [existing] = await db.select().from(companies).where(eq(companies.name, name));
  if (existing) {
    counts.track("companies", false);
    return { company: existing, created: false };
  }
  const [created] = await db.insert(companies).values({ name, ...extra } as any).returning();
  counts.track("companies", true);
  return { company: created, created: true };
}

async function ensureCompanySettings(companyId: string, counts: ReturnType<typeof counter>) {
  const [existing] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId));
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
  const [created] = await db.insert(groups).values({ name, slug, type: "portfolio", description: "PE demo portfolio group" } as any).returning();
  counts.track("groups", true);
  return { group: created, created: true };
}

async function ensureGroupCompany(groupId: string, companyId: string, counts: ReturnType<typeof counter>) {
  const [existing] = await db.select().from(groupCompanies)
    .where(and(eq(groupCompanies.groupId, groupId), eq(groupCompanies.companyId, companyId)));
  if (existing) { counts.track("group_companies", false); return; }
  await db.insert(groupCompanies).values({ groupId, companyId } as any);
  counts.track("group_companies", true);
}

async function ensureUserGroupRole(userId: string, groupId: string, role: "portfolio_owner" | "portfolio_viewer", counts: ReturnType<typeof counter>) {
  const [existing] = await db.select().from(userGroupRoles)
    .where(and(eq(userGroupRoles.userId, userId), eq(userGroupRoles.groupId, groupId)));
  if (existing) { counts.track("user_group_roles", false); return; }
  await db.insert(userGroupRoles).values({ userId, groupId, role } as any);
  counts.track("user_group_roles", true);
}

async function ensureMetrics(companyId: string, counts: ReturnType<typeof counter>) {
  const existing = await db.select().from(metrics).where(eq(metrics.companyId, companyId));
  const existingNames = new Set(existing.map((m) => m.name));
  const toInsert = CORE_METRICS.filter((m) => !existingNames.has(m.name));
  if (toInsert.length === 0) {
    counts.track("metrics", false);
    return existing;
  }
  const inserted = await db.insert(metrics).values(
    toInsert.map((m) => ({
      companyId,
      name: m.name,
      description: `Track ${m.name.toLowerCase()}`,
      category: m.category,
      unit: m.unit,
      frequency: "monthly" as const,
      enabled: true,
      isDefault: true,
      metricType: m.metricType,
      calculationType: m.calculationType,
      direction: "lower_is_better" as const,
      weight: "1",
      importance: "medium",
    }) as any),
  ).returning();
  counts.track("metrics", true);
  return [...existing, ...inserted];
}

async function ensureReportingPeriod(
  companyId: string,
  name: string,
  startDate: Date,
  endDate: Date,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db.select().from(reportingPeriods)
    .where(and(eq(reportingPeriods.companyId, companyId), eq(reportingPeriods.name, name)));
  if (existing) { counts.track("reporting_periods", false); return existing; }
  const [created] = await db.insert(reportingPeriods).values({
    companyId, name,
    periodType: "annual" as const,
    startDate, endDate,
    status: "closed" as const,
  } as any).returning();
  counts.track("reporting_periods", true);
  return created;
}

async function ensureMetricValue(
  metricId: string,
  period: string,
  reportingPeriodId: string,
  value: string,
  submittedBy: string,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db.select().from(metricValues)
    .where(and(eq(metricValues.metricId, metricId), eq(metricValues.period, period)));
  if (existing) { counts.track("metric_values", false); return; }
  await db.insert(metricValues).values({
    metricId,
    period,
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

async function ensureEvidence(
  companyId: string,
  filename: string,
  description: string,
  uploadedBy: string,
  counts: ReturnType<typeof counter>,
) {
  const [existing] = await db.select().from(evidenceFiles)
    .where(and(eq(evidenceFiles.companyId, companyId), eq(evidenceFiles.filename, filename)));
  if (existing) { counts.track("evidence_files", false); return; }
  await db.insert(evidenceFiles).values({
    companyId,
    filename,
    fileType: "pdf",
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
  const now = new Date();

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
    selectedMetrics: CORE_METRICS.map((m) => m.name),
    lifecycleState: "active",
    demoMode: true,
    isSuperAdmin: false,
  }, counts);
  await ensureCompanySettings(greentech.id, counts);

  // ── Company 2: BuildRight Construction (Demo) ─ PARTIAL completion ─────────
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
    selectedMetrics: CORE_METRICS.slice(0, 8).map((m) => m.name),
    lifecycleState: "active",
    demoMode: true,
    isSuperAdmin: false,
  }, counts);
  await ensureCompanySettings(buildright.id, counts);

  // ── Company 3: RetailCo Brands (Demo) ─ LOW completion ────────────────────
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
    selectedMetrics: CORE_METRICS.slice(0, 2).map((m) => m.name),
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

  // GreenTech: 3 annual periods
  const gt2023Start = new Date("2023-01-01"); const gt2023End = new Date("2023-12-31");
  const gt2024Start = new Date("2024-01-01"); const gt2024End = new Date("2024-12-31");
  const gt2025Start = new Date("2025-01-01"); const gt2025End = new Date("2025-03-31");

  const gtP2023 = await ensureReportingPeriod(greentech.id, "FY 2023", gt2023Start, gt2023End, counts);
  const gtP2024 = await ensureReportingPeriod(greentech.id, "FY 2024", gt2024Start, gt2024End, counts);
  const gtP2025 = await ensureReportingPeriod(greentech.id, "Q1 2025", gt2025Start, gt2025End, counts);

  // BuildRight: 1 period
  const brP2024 = await ensureReportingPeriod(buildright.id, "FY 2024", new Date("2024-04-01"), new Date("2025-03-31"), counts);

  // RetailCo: 1 period
  const rcP2024 = await ensureReportingPeriod(retailco.id, "FY 2024", new Date("2024-01-01"), new Date("2024-12-31"), counts);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const gtMetrics   = await ensureMetrics(greentech.id,  counts);
  const brMetrics   = await ensureMetrics(buildright.id, counts);
  const rcMetrics   = await ensureMetrics(retailco.id,   counts);
  await ensureMetrics(horizon.id, counts);

  function findMetric(metricList: typeof gtMetrics, name: string) {
    return metricList.find((m) => m.name === name);
  }

  // ── GreenTech metric values (all core, 3 periods) ─────────────────────────
  const gtValueSets: Array<{ period: string; periodId: string; vals: Record<string, string> }> = [
    {
      period: "FY 2023", periodId: gtP2023.id,
      vals: {
        "Total Carbon Emissions": "185.2",
        "Electricity Consumption": "312000",
        "Gas Consumption": "48000",
        "Waste Generated": "12.5",
        "Water Usage": "1800",
        "Total Headcount": "102",
        "Gender Diversity": "44",
        "Employee Turnover Rate": "8.2",
        "Training Hours Per Employee": "18",
        "Health & Safety Incidents": "2",
        "Board Meeting Attendance": "94",
        "Anti-Bribery Training": "100",
        "Data Breach Incidents": "0",
        "Supplier ESG Assessment Rate": "62",
      },
    },
    {
      period: "FY 2024", periodId: gtP2024.id,
      vals: {
        "Total Carbon Emissions": "161.4",
        "Electricity Consumption": "287000",
        "Gas Consumption": "41000",
        "Waste Generated": "10.8",
        "Water Usage": "1650",
        "Total Headcount": "115",
        "Gender Diversity": "47",
        "Employee Turnover Rate": "6.9",
        "Training Hours Per Employee": "22",
        "Health & Safety Incidents": "1",
        "Board Meeting Attendance": "97",
        "Anti-Bribery Training": "100",
        "Data Breach Incidents": "0",
        "Supplier ESG Assessment Rate": "78",
      },
    },
    {
      period: "Q1 2025", periodId: gtP2025.id,
      vals: {
        "Total Carbon Emissions": "38.2",
        "Electricity Consumption": "71000",
        "Gas Consumption": "9800",
        "Waste Generated": "2.4",
        "Water Usage": "390",
        "Total Headcount": "120",
        "Gender Diversity": "49",
        "Employee Turnover Rate": "1.8",
        "Training Hours Per Employee": "6.5",
        "Health & Safety Incidents": "0",
        "Board Meeting Attendance": "100",
        "Anti-Bribery Training": "100",
        "Data Breach Incidents": "0",
        "Supplier ESG Assessment Rate": "82",
      },
    },
  ];

  for (const { period, periodId, vals } of gtValueSets) {
    for (const [metricName, value] of Object.entries(vals)) {
      const m = findMetric(gtMetrics, metricName);
      if (m) await ensureMetricValue(m.id, `${greentech.id}:${period}`, periodId, value, coAdmin.id, counts);
    }
  }

  // ── BuildRight metric values (~50% of core metrics, 1 period) ─────────────
  const brPartialMetrics = [
    "Total Carbon Emissions", "Electricity Consumption", "Gas Consumption",
    "Waste Generated", "Total Headcount", "Gender Diversity",
    "Employee Turnover Rate", "Health & Safety Incidents",
  ];
  const brVals: Record<string, string> = {
    "Total Carbon Emissions": "420.8",
    "Electricity Consumption": "198000",
    "Gas Consumption": "92000",
    "Waste Generated": "38.4",
    "Total Headcount": "248",
    "Gender Diversity": "28",
    "Employee Turnover Rate": "14.6",
    "Health & Safety Incidents": "7",
  };
  for (const metricName of brPartialMetrics) {
    const m = findMetric(brMetrics, metricName);
    if (m) await ensureMetricValue(m.id, `${buildright.id}:FY 2024`, brP2024.id, brVals[metricName], contributor.id, counts);
  }

  // ── RetailCo metric values (2 metrics only) ────────────────────────────────
  const rcOnlyMetrics = ["Total Carbon Emissions", "Total Headcount"];
  const rcVals: Record<string, string> = {
    "Total Carbon Emissions": "94.1",
    "Total Headcount": "79",
  };
  for (const metricName of rcOnlyMetrics) {
    const m = findMetric(rcMetrics, metricName);
    if (m) await ensureMetricValue(m.id, `${retailco.id}:FY 2024`, rcP2024.id, rcVals[metricName], coAdmin.id, counts);
  }

  // ── Evidence files ─────────────────────────────────────────────────────────

  // GreenTech: multiple evidence items
  const gtEvidenceItems = [
    { filename: "GreenTech_Electricity_Invoice_Q4_2024.pdf",       description: "Q4 2024 electricity invoice from National Grid" },
    { filename: "GreenTech_ISO14001_Certificate_2024.pdf",         description: "ISO 14001 environmental management certification" },
    { filename: "GreenTech_Carbon_Audit_Report_FY2024.pdf",        description: "Third-party verified carbon emissions audit" },
    { filename: "GreenTech_Waste_Manifests_FY2024.xlsx",           description: "Annual waste disposal manifests and recycling records" },
    { filename: "GreenTech_HR_Diversity_Report_2024.pdf",          description: "Annual gender diversity and inclusion report" },
    { filename: "GreenTech_BoardAttendance_Register_2024.pdf",     description: "Board meeting attendance register FY 2024" },
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
    "  1. GreenTech Solutions (Demo)   — high completion (3 periods, all metrics, 6 evidence)",
    "  2. BuildRight Construction (Demo) — partial (1 period, 8 metrics, 1 evidence)",
    "  3. RetailCo Brands (Demo)       — low (1 period, 2 metrics, no evidence)",
    "  4. Horizon Logistics (Demo)     — empty (onboarding started only)",
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
