import { storage } from "./storage";
import type { InsertMetric } from "@shared/schema";

// ============================================================
// SECTOR-AWARE ESG DEFAULTS (Task #63)
// ============================================================

type MetricCategory = "environmental" | "social" | "governance";
type MetricFrequency = "monthly" | "quarterly" | "annual";

interface SectorMetricRule {
  name: string;
  description: string;
  category: MetricCategory;
  unit: string;
  frequency: MetricFrequency;
  dataOwner: string;
  metricType: string;
  calculationType?: string;
  formulaText?: string;
  direction: string;
  targetMin?: string;
  targetMax?: string;
  displayOrder: number;
  helpText: string;
  importance: string;
}

interface SectorTopicRule {
  topic: string;
  category: MetricCategory;
  selected: boolean;
}

interface SectorDefaults {
  metrics: SectorMetricRule[];
  topics: SectorTopicRule[];
  reportingCategories: string[];
  priorityNotes: string;
}

// ============================================================
// STANDARD METRIC DEFINITIONS (shared across sectors)
// ============================================================

const CORE_ENVIRONMENTAL_METRICS: SectorMetricRule[] = [
  { name: "Electricity Consumption", description: "Total electricity used across all sites", category: "environmental", unit: "kWh", frequency: "monthly", dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 1, helpText: "Enter your total electricity usage in kilowatt-hours from your utility bills", importance: "critical" },
  { name: "Gas / Fuel Consumption", description: "Natural gas and fuel oil consumption", category: "environmental", unit: "kWh", frequency: "monthly", dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 2, helpText: "Enter gas consumption in kWh from your gas bills", importance: "critical" },
  { name: "Scope 1 Emissions", description: "Direct GHG emissions from owned sources", category: "environmental", unit: "tCO2e", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "calculated", calculationType: "scope1", formulaText: "(Gas kWh × gas factor + Vehicle litres × fuel factor) / 1000", direction: "lower_is_better", displayOrder: 4, helpText: "Automatically calculated from gas/fuel and vehicle data", importance: "critical" },
  { name: "Scope 2 Emissions", description: "Indirect emissions from purchased electricity", category: "environmental", unit: "tCO2e", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "calculated", calculationType: "scope2", formulaText: "Electricity kWh × emission factor / 1000", direction: "lower_is_better", displayOrder: 5, helpText: "Automatically calculated from electricity consumption", importance: "critical" },
  { name: "Waste Generated", description: "Total waste produced", category: "environmental", unit: "tonnes", frequency: "monthly", dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 6, helpText: "Enter total waste in tonnes", importance: "standard" },
  { name: "Recycling Rate", description: "Percentage of waste recycled", category: "environmental", unit: "%", frequency: "monthly", dataOwner: "Facilities Manager", metricType: "calculated", calculationType: "recycling_rate", formulaText: "Recycled / Total × 100", direction: "higher_is_better", displayOrder: 7, helpText: "Auto-calculated from waste data", importance: "standard" },
];

const CORE_SOCIAL_METRICS: SectorMetricRule[] = [
  { name: "Total Employees", description: "Total employee headcount", category: "social", unit: "people", frequency: "monthly", dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 11, helpText: "Enter your total employee headcount", importance: "critical" },
  { name: "Gender Split (% Female)", description: "Percentage of female workforce", category: "social", unit: "%", frequency: "quarterly", dataOwner: "HR Manager", metricType: "manual", direction: "target_range", targetMin: "40", targetMax: "60", displayOrder: 12, helpText: "Enter percentage of female employees", importance: "standard" },
  { name: "Employee Turnover Rate", description: "Employee leaving rate", category: "social", unit: "%", frequency: "quarterly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "turnover_rate", formulaText: "Leavers / Headcount × 100", direction: "lower_is_better", displayOrder: 14, helpText: "Auto-calculated from HR data", importance: "standard" },
  { name: "Training Hours per Employee", description: "Average training hours", category: "social", unit: "hours", frequency: "quarterly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "training_per_employee", formulaText: "Total hours / Employees", direction: "higher_is_better", displayOrder: 16, helpText: "Auto-calculated from training data", importance: "standard" },
  { name: "Lost Time Incidents", description: "Workplace incidents with lost time", category: "social", unit: "incidents", frequency: "monthly", dataOwner: "H&S Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 17, helpText: "Enter number of lost-time incidents", importance: "standard" },
];

const CORE_GOVERNANCE_METRICS: SectorMetricRule[] = [
  { name: "Board Meetings Held", description: "Board or senior management meetings", category: "governance", unit: "meetings", frequency: "quarterly", dataOwner: "Company Secretary", metricType: "manual", direction: "target_range", targetMin: "4", targetMax: "12", displayOrder: 21, helpText: "Enter number of board meetings", importance: "standard" },
  { name: "Anti-Bribery Policy in Place", description: "Whether a formal anti-bribery and corruption policy exists", category: "governance", unit: "yes/no", frequency: "annual", dataOwner: "Compliance Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 22, helpText: "Enter 1 if you have a policy in place, 0 if not", importance: "standard" },
  { name: "Whistleblowing Policy in Place", description: "Whether a formal whistleblowing policy exists", category: "governance", unit: "yes/no", frequency: "annual", dataOwner: "Compliance Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 23, helpText: "Enter 1 if you have a policy in place, 0 if not", importance: "standard" },
  { name: "Cybersecurity Policy in Place", description: "Whether a formal cybersecurity policy exists", category: "governance", unit: "yes/no", frequency: "annual", dataOwner: "IT Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 26, helpText: "Enter 1 if you have a policy in place, 0 if not", importance: "standard" },
  { name: "ESG Responsibility Assigned", description: "Whether a named individual is responsible for ESG management", category: "governance", unit: "yes/no", frequency: "annual", dataOwner: "Managing Director", metricType: "manual", direction: "compliance_yes_no", displayOrder: 27, helpText: "Enter 1 if ESG responsibility is formally assigned, 0 if not", importance: "standard" },
  { name: "ESG Targets Set", description: "Whether formal ESG targets have been established", category: "governance", unit: "yes/no", frequency: "annual", dataOwner: "Managing Director", metricType: "manual", direction: "compliance_yes_no", displayOrder: 28, helpText: "Enter 1 if formal ESG targets are set, 0 if not", importance: "standard" },
];

// ============================================================
// SECTOR-SPECIFIC RULES
// ============================================================

const SECTOR_RULES: Record<string, SectorDefaults> = {
  manufacturing: {
    metrics: [
      ...CORE_ENVIRONMENTAL_METRICS,
      { name: "Company Vehicle Fuel Use", description: "Total fuel used by company-owned or leased vehicles", category: "environmental", unit: "litres", frequency: "monthly", dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 3, helpText: "Enter total fuel purchased for company vehicles in litres", importance: "critical" },
      { name: "Water Consumption", description: "Total water used", category: "environmental", unit: "m³", frequency: "monthly", dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 8, helpText: "Enter water consumption in cubic metres", importance: "critical" },
      { name: "Carbon Intensity", description: "Emissions per employee", category: "environmental", unit: "tCO2e/employee", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "derived", calculationType: "carbon_intensity", formulaText: "(Scope 1 + Scope 2 + Travel) / Employees", direction: "lower_is_better", displayOrder: 10, helpText: "Derived from total emissions and headcount", importance: "standard" },
      ...CORE_SOCIAL_METRICS,
      { name: "Absence Rate", description: "Employee absence percentage", category: "social", unit: "%", frequency: "monthly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Auto-calculated from absence data", importance: "standard" },
      ...CORE_GOVERNANCE_METRICS,
      { name: "Supplier Code of Conduct Adoption", description: "Percentage of suppliers who signed the code of conduct", category: "governance", unit: "%", frequency: "annual", dataOwner: "Procurement Manager", metricType: "calculated", calculationType: "supplier_code", formulaText: "Signed suppliers / Total suppliers × 100", direction: "higher_is_better", displayOrder: 25, helpText: "Calculated from signed and total supplier counts", importance: "standard" },
    ],
    topics: [
      { topic: "Energy Use", category: "environmental", selected: true },
      { topic: "Carbon Emissions", category: "environmental", selected: true },
      { topic: "Waste Management", category: "environmental", selected: true },
      { topic: "Water Consumption", category: "environmental", selected: true },
      { topic: "Employee Wellbeing", category: "social", selected: true },
      { topic: "Health & Safety", category: "social", selected: true },
      { topic: "Training & Development", category: "social", selected: true },
      { topic: "Anti-Bribery & Corruption", category: "governance", selected: true },
      { topic: "Supplier Standards", category: "governance", selected: true },
      { topic: "Data Privacy", category: "governance", selected: true },
      { topic: "Board Oversight", category: "governance", selected: false },
    ],
    reportingCategories: ["Environmental — Energy & Emissions", "Environmental — Waste & Water", "Social — Workforce", "Social — Health & Safety", "Governance — Compliance", "Governance — Supply Chain"],
    priorityNotes: "Manufacturing sector: Energy, emissions, waste, and water are material. Health & safety is critical. Supply chain governance is a key differentiator.",
  },

  logistics: {
    metrics: [
      ...CORE_ENVIRONMENTAL_METRICS,
      { name: "Company Vehicle Fuel Use", description: "Total fuel used by company-owned or leased vehicles", category: "environmental", unit: "litres", frequency: "monthly", dataOwner: "Fleet Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 3, helpText: "Enter total fuel purchased for company vehicles in litres", importance: "critical" },
      { name: "Business Travel Emissions", description: "Emissions from business travel", category: "environmental", unit: "tCO2e", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "calculated", calculationType: "travel_emissions", formulaText: "Sum of travel × emission factors / 1000", direction: "lower_is_better", displayOrder: 9, helpText: "Auto-calculated from travel data", importance: "critical" },
      { name: "Carbon Intensity", description: "Emissions per employee", category: "environmental", unit: "tCO2e/employee", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "derived", calculationType: "carbon_intensity", formulaText: "(Scope 1 + Scope 2 + Travel) / Employees", direction: "lower_is_better", displayOrder: 10, helpText: "Derived from total emissions and headcount", importance: "critical" },
      ...CORE_SOCIAL_METRICS,
      { name: "Absence Rate", description: "Employee absence percentage", category: "social", unit: "%", frequency: "monthly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Auto-calculated from absence data", importance: "standard" },
      ...CORE_GOVERNANCE_METRICS,
      { name: "Supplier Code of Conduct Adoption", description: "Percentage of suppliers who signed the code of conduct", category: "governance", unit: "%", frequency: "annual", dataOwner: "Procurement Manager", metricType: "calculated", calculationType: "supplier_code", formulaText: "Signed suppliers / Total suppliers × 100", direction: "higher_is_better", displayOrder: 25, helpText: "Calculated from signed and total supplier counts", importance: "critical" },
    ],
    topics: [
      { topic: "Energy Use", category: "environmental", selected: true },
      { topic: "Carbon Emissions", category: "environmental", selected: true },
      { topic: "Waste Management", category: "environmental", selected: true },
      { topic: "Water Consumption", category: "environmental", selected: false },
      { topic: "Employee Wellbeing", category: "social", selected: true },
      { topic: "Health & Safety", category: "social", selected: true },
      { topic: "Training & Development", category: "social", selected: true },
      { topic: "Anti-Bribery & Corruption", category: "governance", selected: true },
      { topic: "Supplier Standards", category: "governance", selected: true },
      { topic: "Data Privacy", category: "governance", selected: true },
      { topic: "Board Oversight", category: "governance", selected: false },
    ],
    reportingCategories: ["Environmental — Fleet Emissions", "Environmental — Energy", "Social — Workforce", "Social — Driver Safety", "Governance — Compliance", "Governance — Supply Chain"],
    priorityNotes: "Logistics sector: Fleet emissions and fuel are the dominant materiality. Driver health & safety is critical. Supply chain standards are increasingly scrutinised.",
  },

  professional_services: {
    metrics: [
      ...CORE_ENVIRONMENTAL_METRICS,
      { name: "Business Travel Emissions", description: "Emissions from business travel", category: "environmental", unit: "tCO2e", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "calculated", calculationType: "travel_emissions", formulaText: "Sum of travel × emission factors / 1000", direction: "lower_is_better", displayOrder: 9, helpText: "Auto-calculated from travel data", importance: "standard" },
      ...CORE_SOCIAL_METRICS,
      { name: "Management Gender Diversity", description: "Percentage of female managers", category: "social", unit: "%", frequency: "quarterly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "management_diversity", formulaText: "Female managers / Total managers × 100", direction: "target_range", targetMin: "30", targetMax: "60", displayOrder: 13, helpText: "Auto-calculated from management data", importance: "critical" },
      { name: "Absence Rate", description: "Employee absence percentage", category: "social", unit: "%", frequency: "monthly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Auto-calculated from absence data", importance: "standard" },
      { name: "Employee Engagement Score", description: "Engagement survey score", category: "social", unit: "score /10", frequency: "annual", dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 18, helpText: "Enter engagement score out of 10", importance: "standard" },
      { name: "Living Wage Coverage", description: "Percentage paid living wage or above", category: "social", unit: "%", frequency: "annual", dataOwner: "HR Manager", metricType: "calculated", calculationType: "living_wage", formulaText: "Living wage employees / Total × 100", direction: "higher_is_better", displayOrder: 19, helpText: "Auto-calculated from payroll data", importance: "standard" },
      ...CORE_GOVERNANCE_METRICS,
      { name: "Data Privacy Training Completion", description: "Percentage of staff who completed data privacy training", category: "governance", unit: "%", frequency: "annual", dataOwner: "Data Protection Officer", metricType: "calculated", calculationType: "privacy_training", formulaText: "Trained staff / Total staff × 100", direction: "higher_is_better", displayOrder: 24, helpText: "Calculated from trained staff count and total staff", importance: "critical" },
    ],
    topics: [
      { topic: "Energy Use", category: "environmental", selected: true },
      { topic: "Carbon Emissions", category: "environmental", selected: true },
      { topic: "Waste Management", category: "environmental", selected: false },
      { topic: "Water Consumption", category: "environmental", selected: false },
      { topic: "Employee Wellbeing", category: "social", selected: true },
      { topic: "Diversity & Inclusion", category: "social", selected: true },
      { topic: "Training & Development", category: "social", selected: true },
      { topic: "Health & Safety", category: "social", selected: false },
      { topic: "Anti-Bribery & Corruption", category: "governance", selected: true },
      { topic: "Supplier Standards", category: "governance", selected: false },
      { topic: "Data Privacy", category: "governance", selected: true },
      { topic: "Board Oversight", category: "governance", selected: true },
    ],
    reportingCategories: ["Environmental — Energy & Travel", "Social — Workforce & Wellbeing", "Social — Diversity & Inclusion", "Governance — Ethics & Compliance", "Governance — Data Privacy"],
    priorityNotes: "Professional services sector: People metrics (diversity, wellbeing, training) are the dominant materiality. Data privacy and ethics are critical governance topics.",
  },

  retail: {
    metrics: [
      ...CORE_ENVIRONMENTAL_METRICS,
      { name: "Water Consumption", description: "Total water used", category: "environmental", unit: "m³", frequency: "monthly", dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 8, helpText: "Enter water consumption in cubic metres", importance: "standard" },
      { name: "Carbon Intensity", description: "Emissions per employee", category: "environmental", unit: "tCO2e/employee", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "derived", calculationType: "carbon_intensity", formulaText: "(Scope 1 + Scope 2 + Travel) / Employees", direction: "lower_is_better", displayOrder: 10, helpText: "Derived from total emissions and headcount", importance: "standard" },
      ...CORE_SOCIAL_METRICS,
      { name: "Management Gender Diversity", description: "Percentage of female managers", category: "social", unit: "%", frequency: "quarterly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "management_diversity", formulaText: "Female managers / Total managers × 100", direction: "target_range", targetMin: "30", targetMax: "60", displayOrder: 13, helpText: "Auto-calculated from management data", importance: "standard" },
      { name: "Absence Rate", description: "Employee absence percentage", category: "social", unit: "%", frequency: "monthly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Auto-calculated from absence data", importance: "standard" },
      { name: "Living Wage Coverage", description: "Percentage paid living wage or above", category: "social", unit: "%", frequency: "annual", dataOwner: "HR Manager", metricType: "calculated", calculationType: "living_wage", formulaText: "Living wage employees / Total × 100", direction: "higher_is_better", displayOrder: 19, helpText: "Auto-calculated from payroll data", importance: "critical" },
      ...CORE_GOVERNANCE_METRICS,
      { name: "Supplier Code of Conduct Adoption", description: "Percentage of suppliers who signed the code of conduct", category: "governance", unit: "%", frequency: "annual", dataOwner: "Procurement Manager", metricType: "calculated", calculationType: "supplier_code", formulaText: "Signed suppliers / Total suppliers × 100", direction: "higher_is_better", displayOrder: 25, helpText: "Calculated from signed and total supplier counts", importance: "critical" },
    ],
    topics: [
      { topic: "Energy Use", category: "environmental", selected: true },
      { topic: "Carbon Emissions", category: "environmental", selected: true },
      { topic: "Waste Management", category: "environmental", selected: true },
      { topic: "Water Consumption", category: "environmental", selected: true },
      { topic: "Employee Wellbeing", category: "social", selected: true },
      { topic: "Diversity & Inclusion", category: "social", selected: true },
      { topic: "Health & Safety", category: "social", selected: true },
      { topic: "Training & Development", category: "social", selected: false },
      { topic: "Anti-Bribery & Corruption", category: "governance", selected: true },
      { topic: "Supplier Standards", category: "governance", selected: true },
      { topic: "Data Privacy", category: "governance", selected: true },
      { topic: "Board Oversight", category: "governance", selected: false },
    ],
    reportingCategories: ["Environmental — Energy & Emissions", "Environmental — Waste & Packaging", "Social — Workforce & Living Wage", "Social — Customer Welfare", "Governance — Supply Chain", "Governance — Compliance"],
    priorityNotes: "Retail sector: Energy/waste reduction and supply chain transparency are dominant material topics. Living wage and workforce diversity are increasingly scrutinised by customers and investors.",
  },

  generic: {
    metrics: [
      ...CORE_ENVIRONMENTAL_METRICS,
      { name: "Business Travel Emissions", description: "Emissions from business travel", category: "environmental", unit: "tCO2e", frequency: "quarterly", dataOwner: "Operations Manager", metricType: "calculated", calculationType: "travel_emissions", formulaText: "Sum of travel × emission factors / 1000", direction: "lower_is_better", displayOrder: 9, helpText: "Auto-calculated from travel data", importance: "standard" },
      ...CORE_SOCIAL_METRICS,
      { name: "Absence Rate", description: "Employee absence percentage", category: "social", unit: "%", frequency: "monthly", dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Auto-calculated from absence data", importance: "standard" },
      ...CORE_GOVERNANCE_METRICS,
      { name: "Data Privacy Training Completion", description: "Percentage of staff who completed data privacy training", category: "governance", unit: "%", frequency: "annual", dataOwner: "Data Protection Officer", metricType: "calculated", calculationType: "privacy_training", formulaText: "Trained staff / Total staff × 100", direction: "higher_is_better", displayOrder: 24, helpText: "Calculated from trained staff count and total staff", importance: "standard" },
    ],
    topics: [
      { topic: "Energy Use", category: "environmental", selected: true },
      { topic: "Carbon Emissions", category: "environmental", selected: true },
      { topic: "Waste Management", category: "environmental", selected: true },
      { topic: "Water Consumption", category: "environmental", selected: false },
      { topic: "Employee Wellbeing", category: "social", selected: true },
      { topic: "Diversity & Inclusion", category: "social", selected: true },
      { topic: "Training & Development", category: "social", selected: true },
      { topic: "Health & Safety", category: "social", selected: true },
      { topic: "Anti-Bribery & Corruption", category: "governance", selected: true },
      { topic: "Supplier Standards", category: "governance", selected: false },
      { topic: "Data Privacy", category: "governance", selected: true },
      { topic: "Board Oversight", category: "governance", selected: false },
    ],
    reportingCategories: ["Environmental — Energy & Emissions", "Environmental — Waste", "Social — Workforce", "Governance — Ethics & Compliance"],
    priorityNotes: "Generic: Standard ESG baseline covering energy, emissions, workforce, and governance compliance.",
  },
};

// ============================================================
// SECTOR NORMALISATION
// ============================================================

const SECTOR_ALIASES: Record<string, string> = {
  "manufacturing": "manufacturing",
  "logistics & transport": "logistics",
  "logistics": "logistics",
  "transport": "logistics",
  "transport_logistics": "logistics",
  "transport logistics": "logistics",
  "professional services": "professional_services",
  "professional_services": "professional_services",
  "consulting": "professional_services",
  "legal": "professional_services",
  "financial services": "professional_services",
  "retail": "retail",
  "ecommerce": "retail",
  "e-commerce": "retail",
};

function normaliseSector(industry: string | null | undefined): string {
  if (!industry) return "generic";
  const lower = industry.toLowerCase().trim();
  return SECTOR_ALIASES[lower] || "generic";
}

// ============================================================
// STANDARD ONBOARDING CHECKLIST TASKS
// ============================================================

export const STANDARD_CHECKLIST_TASKS = [
  {
    taskKey: "complete_profile",
    label: "Complete company profile",
    description: "Add your company name, industry, country, and employee count",
    displayOrder: 1,
  },
  {
    taskKey: "invite_team",
    label: "Invite team members",
    description: "Invite colleagues to contribute data and manage ESG reporting",
    displayOrder: 2,
  },
  {
    taskKey: "enter_first_metrics",
    label: "Enter first key metrics",
    description: "Add your first data values — energy usage, headcount, or any metric",
    displayOrder: 3,
  },
  {
    taskKey: "upload_first_evidence",
    label: "Upload first evidence",
    description: "Attach a supporting document such as a utility bill or invoice",
    displayOrder: 4,
  },
  {
    taskKey: "review_estimated_values",
    label: "Review estimated values",
    description: "Check and replace any AI-estimated values with your actual figures",
    displayOrder: 5,
  },
  {
    taskKey: "generate_first_report",
    label: "Generate first report",
    description: "Create your first ESG report or management summary",
    displayOrder: 6,
  },
];

// ============================================================
// MAIN PROVISIONING FUNCTION
// ============================================================

export async function seedCompanyDefaults(companyId: string, sector: string | null | undefined): Promise<void> {
  const normalisedSector = normaliseSector(sector);
  const rules = SECTOR_RULES[normalisedSector] || SECTOR_RULES.generic;

  // 1. Seed metrics — idempotent per metric by name (upsert-by-name semantics)
  // Fetching existing names first allows safe retry after partial failure.
  const existingMetrics = await storage.getMetrics(companyId);
  const existingMetricNames = new Set(existingMetrics.map(m => m.name.toLowerCase()));
  const dedupedMetrics = deduplicateByName(rules.metrics);
  for (const m of dedupedMetrics) {
    if (existingMetricNames.has(m.name.toLowerCase())) continue; // already exists — skip
    const insertPayload: InsertMetric = {
      companyId,
      name: m.name,
      description: m.description,
      category: m.category,
      unit: m.unit,
      frequency: m.frequency,
      dataOwner: m.dataOwner,
      metricType: m.metricType,
      calculationType: m.calculationType ?? null,
      formulaText: m.formulaText ?? null,
      direction: m.direction,
      targetMin: m.targetMin ?? null,
      targetMax: m.targetMax ?? null,
      displayOrder: m.displayOrder,
      helpText: m.helpText,
      importance: m.importance,
      enabled: true,
      isDefault: true,
    };
    await storage.createMetric(insertPayload);
  }

  // 2. Seed material topics — idempotent per topic by name (upsert uses onConflictDoNothing)
  const existingTopics = await storage.getMaterialTopics(companyId);
  const existingTopicNames = new Set(existingTopics.map(t => t.topic.toLowerCase()));
  const missingTopics = rules.topics
    .filter(t => !existingTopicNames.has(t.topic.toLowerCase()))
    .map(t => ({ topic: t.topic, category: t.category, selected: t.selected }));
  if (missingTopics.length > 0) {
    await storage.upsertMaterialTopics(companyId, missingTopics);
  }

  // 3. Persist sector-aware reporting categories and priority notes to onboardingAnswers
  // This is idempotent: only writes if the sector defaults haven't been stored yet.
  const company = await storage.getCompany(companyId);
  if (company) {
    const existingAnswers = (company.onboardingAnswers as Record<string, unknown>) ?? {};
    if (!existingAnswers.sectorReportingCategories) {
      await storage.updateCompany(companyId, {
        onboardingAnswers: {
          ...existingAnswers,
          sectorReportingCategories: rules.reportingCategories,
          sectorPriorityNotes: rules.priorityNotes,
          sectorNormalized: normalisedSector,
        },
      });
    }
  }

  // 4. Seed onboarding checklist (idempotent — upsert by company+task key)
  await seedOnboardingChecklist(companyId);
}

function deduplicateByName(metrics: SectorMetricRule[]): SectorMetricRule[] {
  const seen = new Set<string>();
  return metrics.filter(m => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });
}

// ============================================================
// CHECKLIST SEEDING
// ============================================================

export async function seedOnboardingChecklist(companyId: string): Promise<void> {
  const existing = await storage.getOnboardingChecklist(companyId);
  const existingKeys = new Set(existing.map(t => t.taskKey));

  for (const task of STANDARD_CHECKLIST_TASKS) {
    if (!existingKeys.has(task.taskKey)) {
      await storage.createOnboardingChecklistTask({
        companyId,
        taskKey: task.taskKey,
        label: task.label,
        description: task.description,
        displayOrder: task.displayOrder,
        status: "pending",
      });
    }
  }
}

// ============================================================
// ESTIMATED VS MEASURED GUARD
// ============================================================

/**
 * Returns true if writing a new value would overwrite a measured/evidenced value
 * with an estimated value — which is never allowed.
 *
 * The check is: if the NEW value being written has source = estimated,
 * and there is already an existing value with source = manual or evidenced,
 * the write should be blocked.
 */
export function wouldOverwriteMeasuredWithEstimate(
  existingSourceType: string | null | undefined,
  newSourceType: string | null | undefined,
): boolean {
  const MEASURED_SOURCES = ["manual", "evidenced"];
  const ESTIMATED_SOURCES = ["estimated"];

  if (!newSourceType || !ESTIMATED_SOURCES.includes(newSourceType)) return false;
  if (!existingSourceType || !MEASURED_SOURCES.includes(existingSourceType)) return false;

  return true;
}
