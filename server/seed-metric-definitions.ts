import { db } from "./storage";
import { metricDefinitions } from "@shared/schema";
import { DEFAULT_METRICS } from "./default-metrics";
import { resolveMetricDataType } from "@shared/data-entry-metrics";
import { eq, sql } from "drizzle-orm";
import {
  metricFormulaDependencies,
  metricFormulaDependencyError,
  normalizeMetricFormula,
} from "./metric-formula-contract";
import {
  METRIC_DEFINITION_CATALOGUE_LOCK_KEY,
  normalizeMetricDefinitionName,
} from "./admin-metric-definition-validation";

export interface MetricSeed {
  code: string;
  name: string;
  pillar: "environmental" | "social" | "governance";
  category: string;
  description: string;
  dataType: "numeric" | "text" | "boolean" | "json";
  unit?: string;
  inputFrequency: "monthly" | "quarterly" | "annual";
  isCore: boolean;
  isActive: boolean;
  isDerived: boolean;
  formulaJson?: object;
  frameworkTags?: string[];
  scoringWeight?: string;
  sortOrder: number;
  evidenceRequired?: boolean;
  rollupMethod: "sum" | "weighted_average" | "latest" | "none";
}

function replaceMetricFormulaCodes(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const formula = { ...(value as Record<string, unknown>) };
  const replaceDependency = (dependency: unknown): unknown => {
    if (typeof dependency === "string") return replacements.get(dependency) ?? dependency;
    if (Array.isArray(dependency)) return dependency.map((entry) => replaceDependency(entry));
    return dependency;
  };
  for (const field of ["sources", "inputs", "numerator", "denominator"] as const) {
    if (Object.prototype.hasOwnProperty.call(formula, field)) {
      formula[field] = replaceDependency(formula[field]);
    }
  }
  if (typeof formula.expression === "string") {
    let expression = formula.expression;
    for (const [legacyCode, canonicalCode] of Array.from(replacements.entries())) {
      const escapedCode = legacyCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expression = expression.replace(
        new RegExp(`(?<![A-Za-z0-9_])${escapedCode}(?![A-Za-z0-9_])`, "g"),
        canonicalCode,
      );
    }
    formula.expression = expression;
  }
  return formula;
}

export const METRIC_DEFINITIONS: MetricSeed[] = [
  // ── ENVIRONMENTAL – CORE (10) ──────────────────────────────────────────
  {
    code: "E001",
    name: "Electricity Consumption",
    pillar: "environmental",
    category: "energy",
    description: "Total electricity consumed from the grid during the reporting period.",
    dataType: "numeric",
    unit: "kWh",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GHG Protocol", "TCFD", "GRI 302"],
    scoringWeight: "1.5",
    sortOrder: 10,
    evidenceRequired: true,
    rollupMethod: "sum",
  },
  {
    code: "E002",
    name: "Natural Gas Consumption",
    pillar: "environmental",
    category: "energy",
    description: "Total natural gas consumed during the reporting period.",
    dataType: "numeric",
    unit: "kWh",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GHG Protocol", "GRI 302"],
    scoringWeight: "1.5",
    sortOrder: 20,
    evidenceRequired: true,
    rollupMethod: "sum",
  },
  {
    code: "E003",
    name: "Vehicle Fuel Consumption",
    pillar: "environmental",
    category: "transport",
    description: "Total fuel consumed by company-owned or leased vehicles.",
    dataType: "numeric",
    unit: "litres",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GHG Protocol", "GRI 305"],
    scoringWeight: "1",
    sortOrder: 30,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E004",
    name: "Scope 1 Emissions",
    pillar: "environmental",
    category: "emissions",
    description: "Direct GHG emissions from owned or controlled sources (gas combustion + vehicle fuel).",
    dataType: "numeric",
    unit: "tCO2e",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "custom", customFn: "scope1_emissions", inputs: ["E002", "E003"] },
    frameworkTags: ["GHG Protocol", "TCFD", "GRI 305-1"],
    scoringWeight: "2",
    sortOrder: 40,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E005",
    name: "Scope 2 Emissions",
    pillar: "environmental",
    category: "emissions",
    description: "Indirect GHG emissions from consumption of purchased electricity.",
    dataType: "numeric",
    unit: "tCO2e",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "custom", customFn: "scope2_emissions", inputs: ["E001"] },
    frameworkTags: ["GHG Protocol", "TCFD", "GRI 305-2"],
    scoringWeight: "2",
    sortOrder: 50,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E006",
    name: "Total GHG Emissions",
    pillar: "environmental",
    category: "emissions",
    description: "Total Scope 1 + Scope 2 greenhouse gas emissions.",
    dataType: "numeric",
    unit: "tCO2e",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "sum", inputs: ["E004", "E005"] },
    frameworkTags: ["GHG Protocol", "TCFD", "GRI 305"],
    scoringWeight: "2",
    sortOrder: 60,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E007",
    name: "Total Waste Generated",
    pillar: "environmental",
    category: "waste",
    description: "Total weight of waste generated during the reporting period.",
    dataType: "numeric",
    unit: "tonnes",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 306"],
    scoringWeight: "1",
    sortOrder: 70,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E008",
    name: "Waste Recycled",
    pillar: "environmental",
    category: "waste",
    description: "Total weight of waste diverted from landfill through recycling.",
    dataType: "numeric",
    unit: "tonnes",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 306"],
    scoringWeight: "1",
    sortOrder: 80,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E009",
    name: "Recycling Rate",
    pillar: "environmental",
    category: "waste",
    description: "Percentage of total waste that is recycled.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "E008", denominator: "E007", multiplier: 100 },
    frameworkTags: ["GRI 306"],
    scoringWeight: "1.5",
    sortOrder: 90,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "E010",
    name: "Total Water Consumption",
    pillar: "environmental",
    category: "water",
    description: "Total water withdrawn and consumed during the reporting period.",
    dataType: "numeric",
    unit: "m³",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 303"],
    scoringWeight: "1",
    sortOrder: 100,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  // ── SOCIAL – CORE (10) ────────────────────────────────────────────────
  {
    code: "S001",
    name: "Total Headcount",
    pillar: "social",
    category: "workforce",
    description: "Total number of employees at the end of the reporting period.",
    dataType: "numeric",
    unit: "employees",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 102-8", "GRI 401"],
    scoringWeight: "1",
    sortOrder: 110,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S002",
    name: "Employee Leavers",
    pillar: "social",
    category: "workforce",
    description: "Number of employees who left the organisation during the period.",
    dataType: "numeric",
    unit: "employees",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 401"],
    scoringWeight: "1",
    sortOrder: 120,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S003",
    name: "Employee Turnover Rate",
    pillar: "social",
    category: "workforce",
    description: "Percentage of employees who left the organisation during the period.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "S002", denominator: "S001", multiplier: 100 },
    frameworkTags: ["GRI 401"],
    scoringWeight: "1.5",
    sortOrder: 130,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S004",
    name: "Total Absence Days",
    pillar: "social",
    category: "wellbeing",
    description: "Total number of employee absence days during the reporting period.",
    dataType: "numeric",
    unit: "days",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 403"],
    scoringWeight: "1",
    sortOrder: 140,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S005",
    name: "Absence Rate",
    pillar: "social",
    category: "wellbeing",
    description: "Percentage of working days lost to absence.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    // The catalogue does not contain a total-working-days input. Absence days
    // and headcount alone cannot produce the percentage described here, so
    // keep this metric directly reportable instead of seeding a false formula.
    isDerived: false,
    frameworkTags: ["GRI 403"],
    scoringWeight: "1",
    sortOrder: 150,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S006",
    name: "Total Training Hours",
    pillar: "social",
    category: "development",
    description: "Total hours of employee training delivered during the period.",
    dataType: "numeric",
    unit: "hours",
    inputFrequency: "quarterly",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 404"],
    scoringWeight: "1",
    sortOrder: 160,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S007",
    name: "Training Hours per Employee",
    pillar: "social",
    category: "development",
    description: "Average training hours per employee during the period.",
    dataType: "numeric",
    unit: "hours",
    inputFrequency: "quarterly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "S006", denominator: "S001" },
    frameworkTags: ["GRI 404"],
    scoringWeight: "1.5",
    sortOrder: 170,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S008",
    name: "Female Employees",
    pillar: "social",
    category: "diversity",
    description: "Percentage of employees who identify as female.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 405"],
    scoringWeight: "1.5",
    sortOrder: 180,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S009",
    name: "Lost Time Injury Rate",
    pillar: "social",
    category: "health_safety",
    description: "Number of lost time injuries per 100 employees per year.",
    dataType: "numeric",
    unit: "per 100 employees",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 403-9"],
    scoringWeight: "2",
    sortOrder: 190,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S010",
    name: "Pay Gap",
    pillar: "social",
    category: "diversity",
    description: "Mean gender pay gap as a percentage of male median salary.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 405-2"],
    scoringWeight: "1.5",
    sortOrder: 200,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  // ── GOVERNANCE – CORE (8) ─────────────────────────────────────────────
  {
    code: "G001",
    name: "Board Size",
    pillar: "governance",
    category: "board",
    description: "Total number of members on the board of directors.",
    dataType: "numeric",
    unit: "members",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 102-22"],
    scoringWeight: "1",
    sortOrder: 210,
    evidenceRequired: false,
    rollupMethod: "latest",
  },
  {
    code: "G002",
    name: "Female Board Members",
    pillar: "governance",
    category: "board",
    description: "Percentage of board members who identify as female.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 405-1"],
    scoringWeight: "1.5",
    sortOrder: 220,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G003",
    name: "Independent Directors",
    pillar: "governance",
    category: "board",
    description: "Percentage of board members classified as independent non-executive directors.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 102-22"],
    scoringWeight: "1.5",
    sortOrder: 230,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G004",
    name: "Data Privacy Training",
    pillar: "governance",
    category: "compliance",
    description: "Percentage of employees who have completed data privacy training.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 418"],
    scoringWeight: "1.5",
    sortOrder: 240,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G005",
    name: "Anti-Corruption Training",
    pillar: "governance",
    category: "compliance",
    description: "Percentage of employees who have completed anti-corruption and ethics training.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 205"],
    scoringWeight: "1.5",
    sortOrder: 250,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G006",
    name: "Supplier Code Adoption",
    pillar: "governance",
    category: "supply_chain",
    description: "Percentage of key suppliers who have signed the code of conduct.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 308", "GRI 414"],
    scoringWeight: "1",
    sortOrder: 260,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G007",
    name: "Policy Review Completion",
    pillar: "governance",
    category: "compliance",
    description: "Percentage of scheduled policy reviews completed on time.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: true,
    isActive: true,
    isDerived: false,
    frameworkTags: ["GRI 102"],
    scoringWeight: "1",
    sortOrder: 270,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G008",
    name: "Carbon Intensity",
    // Keep the long-lived code stable because framework mappings reference it,
    // but classify the metric by what it measures rather than its legacy prefix.
    pillar: "environmental",
    category: "emissions",
    description: "Total GHG emissions per employee — a normalised efficiency measure.",
    dataType: "numeric",
    unit: "tCO2e/employee",
    inputFrequency: "quarterly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "E006", denominator: "S001" },
    frameworkTags: ["TCFD", "GHG Protocol"],
    scoringWeight: "2",
    sortOrder: 65,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },

  // ── ENVIRONMENTAL – ADVANCED (10) ─────────────────────────────────────
  {
    code: "E011",
    name: "Renewable Energy Usage",
    pillar: "environmental",
    category: "energy",
    description: "Electricity consumed from certified renewable sources (solar, wind, etc.).",
    dataType: "numeric",
    unit: "kWh",
    inputFrequency: "monthly",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 302-1", "RE100"],
    scoringWeight: "1.5",
    sortOrder: 310,
    evidenceRequired: true,
    rollupMethod: "sum",
  },
  {
    code: "E012",
    name: "Renewable Energy Percentage",
    pillar: "environmental",
    category: "energy",
    description: "Renewable energy as a percentage of total electricity consumed.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "monthly",
    isCore: false,
    isActive: false,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "E011", denominator: "E001", multiplier: 100 },
    frameworkTags: ["GRI 302", "RE100"],
    scoringWeight: "2",
    sortOrder: 320,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "E013",
    name: "Scope 3 Emissions",
    pillar: "environmental",
    category: "emissions",
    description: "Indirect GHG emissions from the value chain (supply chain, business travel, waste, etc.).",
    dataType: "numeric",
    unit: "tCO2e",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GHG Protocol", "GRI 305-3", "TCFD"],
    scoringWeight: "2",
    sortOrder: 330,
    evidenceRequired: true,
    rollupMethod: "sum",
  },
  {
    code: "E014",
    name: "Business Travel Emissions",
    pillar: "environmental",
    category: "transport",
    description: "GHG emissions from employee business travel (flights, rail, hotels, hire cars).",
    dataType: "numeric",
    unit: "tCO2e",
    inputFrequency: "quarterly",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GHG Protocol", "GRI 305-3"],
    scoringWeight: "1.5",
    sortOrder: 340,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "E015",
    name: "Fleet EV Percentage",
    pillar: "environmental",
    category: "transport",
    description: "Percentage of company fleet vehicles that are fully electric.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["TCFD"],
    scoringWeight: "1",
    sortOrder: 350,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "E016",
    name: "Refrigerant Leakage",
    pillar: "environmental",
    category: "emissions",
    description: "GHG emissions from refrigerant gas leakage (F-gases).",
    dataType: "numeric",
    unit: "tCO2e",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GHG Protocol", "GRI 305-1"],
    scoringWeight: "1",
    sortOrder: 360,
    evidenceRequired: true,
    rollupMethod: "sum",
  },
  {
    code: "E017",
    name: "Biodiversity Impact Score",
    pillar: "environmental",
    category: "biodiversity",
    description: "Self-assessed score indicating biodiversity net gain or loss from operations.",
    dataType: "numeric",
    unit: "score",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["TNFD"],
    scoringWeight: "1",
    sortOrder: 370,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "E018",
    name: "Sustainable Packaging",
    pillar: "environmental",
    category: "waste",
    description: "Percentage of packaging materials that are recyclable, reusable or compostable.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 306"],
    scoringWeight: "1",
    sortOrder: 380,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "E019",
    name: "Water Intensity",
    pillar: "environmental",
    category: "water",
    description: "Water consumed per employee — a normalised water efficiency measure.",
    dataType: "numeric",
    unit: "m³/employee",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "E010", denominator: "S001" },
    frameworkTags: ["GRI 303"],
    scoringWeight: "1",
    sortOrder: 390,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "E020",
    name: "Waste Intensity",
    pillar: "environmental",
    category: "waste",
    description: "Total waste generated per employee — a normalised waste efficiency measure.",
    dataType: "numeric",
    unit: "kg/employee",
    inputFrequency: "monthly",
    isCore: false,
    isActive: false,
    isDerived: true,
    formulaJson: { type: "ratio", numerator: "E007", denominator: "S001", multiplier: 1000 },
    frameworkTags: ["GRI 306"],
    scoringWeight: "1",
    sortOrder: 400,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },

  // ── SOCIAL – ADVANCED (10) ────────────────────────────────────────────
  {
    code: "S011",
    name: "Living Wage Coverage",
    pillar: "social",
    category: "pay_benefits",
    description: "Percentage of employees paid at or above the real living wage.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["Living Wage Foundation", "GRI 202"],
    scoringWeight: "1.5",
    sortOrder: 410,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S012",
    name: "Management Gender Diversity",
    pillar: "social",
    category: "diversity",
    description: "Percentage of managers who identify as female.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 405-1"],
    scoringWeight: "1.5",
    sortOrder: 420,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S013",
    name: "Parental Leave Take-up",
    pillar: "social",
    category: "wellbeing",
    description: "Percentage of eligible employees who took parental leave.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 401-3"],
    scoringWeight: "1",
    sortOrder: 430,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S014",
    name: "Employee Engagement Score",
    pillar: "social",
    category: "wellbeing",
    description: "Overall employee engagement score from the annual survey (0-100).",
    dataType: "numeric",
    unit: "score",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 401"],
    scoringWeight: "1.5",
    sortOrder: 440,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S015",
    name: "Disabled Employees",
    pillar: "social",
    category: "diversity",
    description: "Percentage of employees who have declared a disability.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 405-1"],
    scoringWeight: "1",
    sortOrder: 450,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S016",
    name: "Ethnically Diverse Employees",
    pillar: "social",
    category: "diversity",
    description: "Percentage of employees from ethnic minority backgrounds.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 405-1"],
    scoringWeight: "1",
    sortOrder: 460,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "S017",
    name: "Community Investment",
    pillar: "social",
    category: "community",
    description: "Total monetary value of contributions to community initiatives and charitable causes.",
    dataType: "numeric",
    unit: "£",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 413"],
    scoringWeight: "1",
    sortOrder: 470,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S018",
    name: "Volunteering Hours",
    pillar: "social",
    category: "community",
    description: "Total employee volunteering hours contributed during the period.",
    dataType: "numeric",
    unit: "hours",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 413"],
    scoringWeight: "1",
    sortOrder: 480,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S019",
    name: "Modern Slavery Checks",
    pillar: "social",
    category: "supply_chain",
    description: "Number of supplier due diligence checks completed for modern slavery risk.",
    dataType: "numeric",
    unit: "checks",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["Modern Slavery Act", "GRI 409"],
    scoringWeight: "1",
    sortOrder: 490,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "S020",
    name: "Human Rights Due Diligence",
    pillar: "social",
    category: "supply_chain",
    description: "Percentage of high-risk supplier relationships with completed human rights due diligence.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 412", "UN Guiding Principles"],
    scoringWeight: "1",
    sortOrder: 500,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },

  // ── GOVERNANCE – ADVANCED (10) ────────────────────────────────────────
  {
    code: "G009",
    name: "ESG Committee Meetings",
    pillar: "governance",
    category: "oversight",
    description: "Number of formal ESG or sustainability committee meetings held during the year.",
    dataType: "numeric",
    unit: "meetings",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 102-26"],
    scoringWeight: "1",
    sortOrder: 510,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "G010",
    name: "Whistleblowing Reports",
    pillar: "governance",
    category: "compliance",
    description: "Number of reports received through the whistleblowing mechanism.",
    dataType: "numeric",
    unit: "reports",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 102-17"],
    scoringWeight: "1",
    sortOrder: 520,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "G011",
    name: "Regulatory Fines",
    pillar: "governance",
    category: "compliance",
    description: "Number of regulatory fines or sanctions received during the period.",
    dataType: "numeric",
    unit: "count",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 307"],
    scoringWeight: "2",
    sortOrder: 530,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "G012",
    name: "Cybersecurity Incidents",
    pillar: "governance",
    category: "digital",
    description: "Number of significant cybersecurity incidents (breach attempts or confirmed incidents) in the period.",
    dataType: "numeric",
    unit: "incidents",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 418"],
    scoringWeight: "1.5",
    sortOrder: 540,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "G013",
    name: "Data Breaches",
    pillar: "governance",
    category: "digital",
    description: "Number of confirmed personal data breaches reported to regulators.",
    dataType: "numeric",
    unit: "breaches",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 418", "GDPR"],
    scoringWeight: "2",
    sortOrder: 550,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "G014",
    name: "Executive Pay Ratio",
    pillar: "governance",
    category: "pay_benefits",
    description: "Ratio of highest-paid executive remuneration to median employee remuneration.",
    dataType: "numeric",
    unit: "ratio",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 102-38"],
    scoringWeight: "1",
    sortOrder: 560,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G015",
    name: "Shareholder Approval Rate",
    pillar: "governance",
    category: "oversight",
    description: "Average percentage shareholder approval across all AGM resolutions.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 102-27"],
    scoringWeight: "1",
    sortOrder: 570,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
  {
    code: "G016",
    name: "Political Donations",
    pillar: "governance",
    category: "compliance",
    description: "Total monetary value of political donations or contributions during the period.",
    dataType: "numeric",
    unit: "£",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 415"],
    scoringWeight: "1",
    sortOrder: 580,
    evidenceRequired: false,
    rollupMethod: "sum",
  },
  {
    code: "G017",
    name: "Third-party ESG Audit Score",
    pillar: "governance",
    category: "oversight",
    description: "Score received from an independent third-party ESG audit (0–100).",
    dataType: "numeric",
    unit: "score",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["ISO 14001", "ISO 45001"],
    scoringWeight: "2",
    sortOrder: 590,
    evidenceRequired: true,
    rollupMethod: "weighted_average",
  },
  {
    code: "G018",
    name: "Tax Effective Rate",
    pillar: "governance",
    category: "compliance",
    description: "Effective corporate tax rate paid as a percentage of pre-tax profit.",
    dataType: "numeric",
    unit: "%",
    inputFrequency: "annual",
    isCore: false,
    isActive: false,
    isDerived: false,
    frameworkTags: ["GRI 207"],
    scoringWeight: "1",
    sortOrder: 600,
    evidenceRequired: false,
    rollupMethod: "weighted_average",
  },
];

/**
 * The original advanced catalogue and the SME starter catalogue were created
 * at different times. Ensure every metric actually enabled for a new SME is
 * represented in Metrics Library with the same name and input semantics.
 */
const SME_DEFAULT_FORMULAS: Record<string, object> = {
  scope1: { type: "custom", customFn: "scope1_emissions", inputs: ["E002", "E003"] },
  scope2: { type: "custom", customFn: "scope2_emissions", inputs: ["E001"] },
  recycling_rate: { type: "ratio", numerator: ["E008"], denominator: "E007", scale: 100 },
  turnover_rate: { type: "ratio", numerator: ["S002"], denominator: "S001", scale: 100 },
  training_per_employee: { type: "ratio", numerator: ["S006"], denominator: "S001" },
};

export const SME_DEFAULT_DEFINITIONS: MetricSeed[] = DEFAULT_METRICS.map((metric, index) => {
  // Several legacy default metrics describe calculations whose operands are
  // not represented in the metric-definition catalogue (working days,
  // manager counts, supplier counts, detailed travel activity, etc.). They
  // remain calculable in the guided raw-data workflow, but their catalogue
  // entries must be manual rather than carrying an unevaluable placeholder.
  const formulaJson = metric.calculationType
    ? SME_DEFAULT_FORMULAS[metric.calculationType]
    : undefined;
  return {
  code: `SME_DEFAULT_${String(index + 1).padStart(2, "0")}`,
  name: metric.name,
  pillar: metric.category,
  category: metric.category,
  description: metric.description,
  dataType: resolveMetricDataType(metric),
  unit: metric.unit,
  inputFrequency: metric.frequency,
  isCore: true,
  isActive: true,
  isDerived: Boolean(formulaJson),
  formulaJson: formulaJson
    ? { ...formulaJson, ...(metric.formulaText ? { description: metric.formulaText } : {}) }
    : undefined,
  frameworkTags: [],
  scoringWeight: "1",
  sortOrder: 2000 + index,
  evidenceRequired: false,
  rollupMethod: metric.unit === "%" || metric.unit === "yes/no" ? "none" : "sum",
  };
});

export const ALL_STARTUP_METRIC_DEFINITION_SEEDS = [
  ...METRIC_DEFINITIONS,
  ...SME_DEFAULT_DEFINITIONS,
];

export type MetricFormulaCatalogueDefinition = {
  code: string;
  dataType: "numeric" | "text" | "boolean" | "json";
  isActive: boolean;
  isDerived: boolean;
  formulaJson?: unknown;
};

export function metricDefinitionFormulaCatalogueErrors(
  definitions: readonly MetricFormulaCatalogueDefinition[] = ALL_STARTUP_METRIC_DEFINITION_SEEDS,
): string[] {
  const errors: string[] = [];
  const activeNumericCodes = new Set(
    definitions
      .filter((definition) => definition.isActive && definition.dataType === "numeric")
      .map((definition) => definition.code),
  );
  const dependenciesByDerivedCode = new Map<string, string[]>();

  for (const definition of definitions.filter((candidate) => candidate.isActive && candidate.isDerived)) {
    if (definition.dataType !== "numeric") {
      errors.push(`${definition.code}: derived formula target must use the numeric data type`);
      continue;
    }
    const normalized = normalizeMetricFormula(definition.formulaJson);
    if (normalized.status === "invalid") {
      errors.push(`${definition.code}: ${normalized.error}`);
      continue;
    }
    const dependencyError = metricFormulaDependencyError(normalized.formula, activeNumericCodes);
    if (dependencyError) {
      errors.push(`${definition.code}: ${dependencyError}`);
      continue;
    }
    dependenciesByDerivedCode.set(definition.code, metricFormulaDependencies(normalized.formula));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const visit = (code: string): void => {
    if (visiting.has(code)) {
      cyclic.add(code);
      return;
    }
    if (visited.has(code)) return;
    visiting.add(code);
    for (const dependency of dependenciesByDerivedCode.get(code) ?? []) {
      if (dependenciesByDerivedCode.has(dependency)) visit(dependency);
      if (cyclic.has(dependency)) cyclic.add(code);
    }
    visiting.delete(code);
    visited.add(code);
  };
  for (const code of Array.from(dependenciesByDerivedCode.keys())) visit(code);
  for (const code of Array.from(cyclic).sort()) errors.push(`${code}: circular derived-metric dependency`);
  return errors;
}

export function assertMetricDefinitionFormulaCatalogue(
  definitions: readonly MetricFormulaCatalogueDefinition[] = ALL_STARTUP_METRIC_DEFINITION_SEEDS,
): void {
  const errors = metricDefinitionFormulaCatalogueErrors(definitions);
  if (errors.length > 0) {
    throw new Error(`Seeded metric formula catalogue is invalid: ${errors.join("; ")}`);
  }
}

/**
 * A duplicate definition must remain a distinct formula source when a formula
 * deliberately references both it and another code that would resolve to the
 * same canonical owner. Merging in that case would either create duplicate
 * sources or silently collapse a numerator/denominator relationship.
 */
export function metricFormulaMergeProtectedCodes(
  definitions: readonly MetricFormulaCatalogueDefinition[],
  replacements: ReadonlyMap<string, string>,
): Set<string> {
  const protectedCodes = new Set<string>();
  for (const definition of definitions.filter((candidate) => candidate.isDerived)) {
    const normalized = normalizeMetricFormula(definition.formulaJson);
    if (normalized.status === "invalid") continue;

    const resolvedTargetCode = replacements.get(definition.code) ?? definition.code;
    const dependenciesByResolvedCode = new Map<string, Set<string>>();
    for (const dependency of metricFormulaDependencies(normalized.formula)) {
      const resolvedCode = replacements.get(dependency) ?? dependency;
      const sourceCodes = dependenciesByResolvedCode.get(resolvedCode) ?? new Set<string>();
      sourceCodes.add(dependency);
      dependenciesByResolvedCode.set(resolvedCode, sourceCodes);
    }

    for (const [resolvedCode, sourceCodes] of Array.from(dependenciesByResolvedCode.entries())) {
      if (sourceCodes.size < 2 && resolvedCode !== resolvedTargetCode) continue;
      if (replacements.has(definition.code)) protectedCodes.add(definition.code);
      for (const sourceCode of Array.from(sourceCodes)) {
        if (replacements.has(sourceCode)) protectedCodes.add(sourceCode);
      }
    }
  }
  return protectedCodes;
}

function metricFormulaReferencedReplacementCodes(
  definitions: readonly MetricFormulaCatalogueDefinition[],
  replacements: ReadonlyMap<string, string>,
): Set<string> {
  const referencedCodes = new Set<string>();
  for (const definition of definitions.filter((candidate) => candidate.isDerived)) {
    const normalized = normalizeMetricFormula(definition.formulaJson);
    if (normalized.status === "invalid") continue;
    for (const dependency of metricFormulaDependencies(normalized.formula)) {
      if (replacements.has(dependency)) referencedCodes.add(dependency);
    }
  }
  return referencedCodes;
}

export const REQUIRED_METRIC_DEFINITION_CODES = METRIC_DEFINITIONS.map((metric) => metric.code);
export const REQUIRED_SME_METRIC_NAMES = SME_DEFAULT_DEFINITIONS.map((metric) => metric.name);

export function metricDefinitionCatalogueErrors(
  rows: Array<{ code: string; name: string }>,
): string[] {
  const presentCodes = new Set(rows.map((row) => row.code));
  const presentNames = new Set(rows.map((row) => normalizeMetricDefinitionName(row.name)));
  const missingCodes = REQUIRED_METRIC_DEFINITION_CODES.filter((code) => !presentCodes.has(code));
  const missingSmeNames = REQUIRED_SME_METRIC_NAMES.filter(
    (name) => !presentNames.has(normalizeMetricDefinitionName(name)),
  );
  const errors: string[] = [];
  if (missingCodes.length > 0) {
    errors.push(`missing canonical metric codes: ${missingCodes.join(", ")}`);
  }
  if (missingSmeNames.length > 0) {
    errors.push(`missing SME starter metrics: ${missingSmeNames.join(", ")}`);
  }
  const codesByNormalizedName = new Map<string, string[]>();
  for (const row of rows) {
    const normalizedName = normalizeMetricDefinitionName(row.name);
    const codes = codesByNormalizedName.get(normalizedName) ?? [];
    codes.push(row.code);
    codesByNormalizedName.set(normalizedName, codes);
  }
  for (const [normalizedName, codes] of Array.from(codesByNormalizedName.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    if (codes.length > 1) {
      errors.push(`duplicate normalized metric name ${normalizedName}: ${codes.sort().join(", ")}`);
    }
  }
  return errors;
}

export function assertMetricDefinitionCatalogue(rows: Array<{ code: string; name: string }>): void {
  const errors = metricDefinitionCatalogueErrors(rows);
  if (errors.length > 0) {
    throw new Error(`Required metric-definition catalogue is invalid: ${errors.join("; ")}`);
  }
}

export async function seedMetricDefinitions() {
  assertMetricDefinitionFormulaCatalogue();
  const {
    seeded,
    skipped,
    mergedDuplicateCount,
    archivedDuplicateCount,
    formulaProtectedDuplicateCount,
  } = await db.transaction(async (tx) => {
    // Startup reconciliation and live admin mutations are all catalogue
    // writers. They must serialize on the same lock so no instance can
    // validate or overwrite a stale catalogue snapshot.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${METRIC_DEFINITION_CATALOGUE_LOCK_KEY}, 0))`);
    let seeded = 0;
    let skipped = 0;
    const existing = await tx.select({ code: metricDefinitions.code, name: metricDefinitions.name })
      .from(metricDefinitions);
    const existingCodes = new Set(existing.map((definition) => definition.code));
    const seedOwnerCodeByName = new Map<string, string>();
    for (const seed of ALL_STARTUP_METRIC_DEFINITION_SEEDS) {
      const normalizedName = normalizeMetricDefinitionName(seed.name);
      if (!seedOwnerCodeByName.has(normalizedName)) {
        seedOwnerCodeByName.set(normalizedName, seed.code);
      }
    }

    const seedValues = (m: MetricSeed) => ({
        code: m.code,
        name: m.name,
        pillar: m.pillar,
        category: m.category,
        description: m.description,
        dataType: m.dataType,
        unit: m.unit,
        inputFrequency: m.inputFrequency,
        isCore: m.isCore,
        isActive: m.isActive,
        isDerived: m.isDerived,
        formulaJson: m.formulaJson || null,
        frameworkTags: m.frameworkTags || null,
        scoringWeight: m.scoringWeight || "1",
        sortOrder: m.sortOrder,
        evidenceRequired: m.evidenceRequired || false,
        rollupMethod: m.rollupMethod,
    });

    const insertSeed = async (m: MetricSeed) => {
      await tx.insert(metricDefinitions).values(seedValues(m)).onConflictDoNothing({ target: metricDefinitions.code });
      existingCodes.add(m.code);
      seeded++;
    };

    // Canonical definitions are addressed by code because framework mappings
    // depend on those stable identifiers. A coincidentally matching custom
    // display name must not suppress a required canonical code.
    for (const m of METRIC_DEFINITIONS) {
      const existed = existingCodes.has(m.code);
      const values = seedValues(m);
      await tx.insert(metricDefinitions).values(values).onConflictDoUpdate({
        target: metricDefinitions.code,
        set: {
          name: values.name,
          pillar: values.pillar,
          category: values.category,
          description: values.description,
          dataType: values.dataType,
          unit: values.unit,
          inputFrequency: values.inputFrequency,
          isCore: values.isCore,
          isActive: values.isActive,
          isDerived: values.isDerived,
          formulaJson: values.formulaJson,
          frameworkTags: values.frameworkTags,
          scoringWeight: values.scoringWeight,
          sortOrder: values.sortOrder,
          evidenceRequired: values.evidenceRequired,
          rollupMethod: values.rollupMethod,
        },
      });
      existingCodes.add(m.code);
      if (existed) skipped++;
      else seeded++;
    }

    // A canonical definition owns any overlapping SME display name. Unique SME
    // starter names are always owned by their stable SME_DEFAULT code, even if
    // an older release left a legacy code with the same display name. The
    // duplicate merger below safely reparents that legacy row.
    for (const m of SME_DEFAULT_DEFINITIONS) {
      const normalizedName = normalizeMetricDefinitionName(m.name);
      if (seedOwnerCodeByName.get(normalizedName) !== m.code) {
        skipped++;
        continue;
      }
      if (existingCodes.has(m.code)) {
        const values = seedValues(m);
        await tx.insert(metricDefinitions).values(values).onConflictDoUpdate({
          target: metricDefinitions.code,
          set: {
            name: values.name,
            pillar: values.pillar,
            category: values.category,
            description: values.description,
            dataType: values.dataType,
            unit: values.unit,
            inputFrequency: values.inputFrequency,
            isCore: values.isCore,
            isActive: values.isActive,
            isDerived: values.isDerived,
            formulaJson: values.formulaJson,
            frameworkTags: values.frameworkTags,
            scoringWeight: values.scoringWeight,
            sortOrder: values.sortOrder,
            evidenceRequired: values.evidenceRequired,
            rollupMethod: values.rollupMethod,
          },
        });
        skipped++;
        continue;
      }
      await insertSeed(m);
    }

    // Older releases layered a second catalogue over the canonical one. Merge
    // every normalized-name duplicate into the seed-owned row while keeping
    // value/evidence identities intact. Rows with an unexpected natural-key
    // collision are archived under a unique legacy name instead of discarded.
    const catalogueBeforeMerge = await tx.select().from(metricDefinitions);
    const definitionsByName = new Map<string, typeof catalogueBeforeMerge>();
    for (const definition of catalogueBeforeMerge) {
      const normalizedName = normalizeMetricDefinitionName(definition.name);
      const group = definitionsByName.get(normalizedName) ?? [];
      group.push(definition);
      definitionsByName.set(normalizedName, group);
    }

    const duplicateMerges: Array<{
      ownerId: string;
      ownerCode: string;
      legacyId: string;
      legacyCode: string;
      legacyName: string;
    }> = [];
    for (const [normalizedName, group] of Array.from(definitionsByName.entries())) {
      if (group.length < 2) continue;
      const seedOwnerCode = seedOwnerCodeByName.get(normalizedName);
      const owner = group.find((definition) => definition.code === seedOwnerCode)
        ?? group.slice().sort((left, right) => {
          const activeDelta = Number(right.isActive) - Number(left.isActive);
          if (activeDelta !== 0) return activeDelta;
          const coreDelta = Number(right.isCore) - Number(left.isCore);
          if (coreDelta !== 0) return coreDelta;
          return left.code.localeCompare(right.code);
        })[0];
      for (const legacy of group) {
        if (legacy.id === owner.id) continue;
        duplicateMerges.push({
          ownerId: owner.id,
          ownerCode: owner.code,
          legacyId: legacy.id,
          legacyCode: legacy.code,
          legacyName: legacy.name,
        });
      }
    }

    const candidateFormulaCodeReplacements = new Map(
      duplicateMerges.map((merge) => [merge.legacyCode, merge.ownerCode]),
    );
    if (duplicateMerges.length > 0) {
      // Candidate startup can briefly overlap the previous release. Lock every
      // definition-reference table before formula/value conflict preflights so
      // no writer can introduce a collision between validation and reparenting.
      await tx.execute(sql`
        LOCK TABLE metric_values,
                   metric_definition_values,
                   metric_calculation_runs,
                   esg_targets,
                   metric_framework_mappings
        IN SHARE ROW EXCLUSIVE MODE
      `);
    }
    const formulaProtectedCodes = metricFormulaMergeProtectedCodes(
      catalogueBeforeMerge,
      candidateFormulaCodeReplacements,
    );
    const formulaReferencedCodes = metricFormulaReferencedReplacementCodes(
      catalogueBeforeMerge,
      candidateFormulaCodeReplacements,
    );
    for (const merge of duplicateMerges) {
      if (!formulaReferencedCodes.has(merge.legacyCode) || formulaProtectedCodes.has(merge.legacyCode)) {
        continue;
      }
      const collisionResult = await tx.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM metric_definition_values AS legacy
          JOIN metric_definition_values AS canonical
            ON canonical.metric_definition_id = ${merge.ownerId}
           AND canonical.business_id = legacy.business_id
           AND canonical.site_id IS NOT DISTINCT FROM legacy.site_id
           AND canonical.reporting_period_start = legacy.reporting_period_start
           AND canonical.reporting_period_end = legacy.reporting_period_end
          WHERE legacy.metric_definition_id = ${merge.legacyId}
        ) AS collision
      `);
      if (Boolean((collisionResult as any).rows?.[0]?.collision)) {
        formulaProtectedCodes.add(merge.legacyCode);
      }
    }
    const formulaProtectedMerges = duplicateMerges.filter((merge) => formulaProtectedCodes.has(merge.legacyCode));
    const mergeableDuplicates = duplicateMerges.filter((merge) => !formulaProtectedCodes.has(merge.legacyCode));

    // Keep semantically distinct or value-conflicted formula sources active,
    // but give each a unique display name so the SME catalogue is unambiguous.
    for (const merge of formulaProtectedMerges) {
      await tx.update(metricDefinitions)
        .set({
          name: `${merge.legacyName} (Legacy formula source ${merge.legacyCode})`,
          updatedAt: new Date(),
        })
        .where(eq(metricDefinitions.id, merge.legacyId));
    }

    const formulaCodeReplacements = new Map(
      mergeableDuplicates.map((merge) => [merge.legacyCode, merge.ownerCode]),
    );
    if (formulaCodeReplacements.size > 0) {
      for (const definition of catalogueBeforeMerge) {
        if (!definition.formulaJson) continue;
        const reconciledFormula = replaceMetricFormulaCodes(definition.formulaJson, formulaCodeReplacements);
        if (JSON.stringify(reconciledFormula) === JSON.stringify(definition.formulaJson)) continue;
        await tx.update(metricDefinitions)
          .set({ formulaJson: reconciledFormula as Record<string, unknown>, updatedAt: new Date() })
          .where(eq(metricDefinitions.id, definition.id));
      }
    }

    let mergedDuplicateCount = 0;
    let archivedDuplicateCount = 0;
    for (const merge of mergeableDuplicates) {
      await tx.execute(sql`
        UPDATE metric_values
        SET metric_definition_id = ${merge.ownerId}
        WHERE metric_definition_id = ${merge.legacyId}
      `);
      await tx.execute(sql`
        UPDATE metric_calculation_runs
        SET metric_definition_id = ${merge.ownerId}
        WHERE metric_definition_id = ${merge.legacyId}
      `);
      await tx.execute(sql`
        UPDATE esg_targets
        SET linked_metric_definition_id = ${merge.ownerId}, updated_at = NOW()
        WHERE linked_metric_definition_id = ${merge.legacyId}
      `);

      await tx.execute(sql`
        UPDATE metric_framework_mappings AS canonical
        SET mapping_strength = CASE
              WHEN canonical.mapping_strength = 'direct' OR legacy.mapping_strength = 'direct' THEN 'direct'::mapping_strength
              WHEN canonical.mapping_strength = 'partial' OR legacy.mapping_strength = 'partial' THEN 'partial'::mapping_strength
              ELSE 'supporting'::mapping_strength
            END,
            notes = COALESCE(canonical.notes, legacy.notes)
        FROM metric_framework_mappings AS legacy
        WHERE canonical.metric_definition_id = ${merge.ownerId}
          AND legacy.metric_definition_id = ${merge.legacyId}
          AND canonical.framework_requirement_id = legacy.framework_requirement_id
      `);
      await tx.execute(sql`
        UPDATE metric_framework_mappings AS legacy
        SET metric_definition_id = ${merge.ownerId}
        WHERE legacy.metric_definition_id = ${merge.legacyId}
          AND NOT EXISTS (
            SELECT 1
            FROM metric_framework_mappings AS canonical
            WHERE canonical.metric_definition_id = ${merge.ownerId}
              AND canonical.framework_requirement_id = legacy.framework_requirement_id
          )
      `);
      await tx.execute(sql`
        DELETE FROM metric_framework_mappings
        WHERE metric_definition_id = ${merge.legacyId}
      `);

      await tx.execute(sql`
        UPDATE metric_definition_values AS legacy
        SET metric_definition_id = ${merge.ownerId}, updated_at = NOW()
        WHERE legacy.metric_definition_id = ${merge.legacyId}
          AND NOT EXISTS (
            SELECT 1
            FROM metric_definition_values AS canonical
            WHERE canonical.metric_definition_id = ${merge.ownerId}
              AND canonical.business_id = legacy.business_id
              AND canonical.site_id IS NOT DISTINCT FROM legacy.site_id
              AND canonical.reporting_period_start = legacy.reporting_period_start
              AND canonical.reporting_period_end = legacy.reporting_period_end
          )
      `);
      const remainingLegacyValues = await tx.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM metric_definition_values
        WHERE metric_definition_id = ${merge.legacyId}
      `);
      const remainingCount = Number((remainingLegacyValues as any).rows?.[0]?.count ?? 0);
      if (remainingCount === 0) {
        await tx.delete(metricDefinitions).where(eq(metricDefinitions.id, merge.legacyId));
        mergedDuplicateCount++;
      } else {
        await tx.update(metricDefinitions)
          .set({
            name: `${merge.legacyName} (Legacy ${merge.legacyCode} ${merge.legacyId.slice(0, 8)})`,
            isActive: false,
            isCore: false,
            updatedAt: new Date(),
          })
          .where(eq(metricDefinitions.id, merge.legacyId));
        archivedDuplicateCount++;
      }
    }

    const reconciled = await tx.select({
      code: metricDefinitions.code,
      name: metricDefinitions.name,
      dataType: metricDefinitions.dataType,
      isActive: metricDefinitions.isActive,
      isDerived: metricDefinitions.isDerived,
      formulaJson: metricDefinitions.formulaJson,
    })
      .from(metricDefinitions);
    assertMetricDefinitionCatalogue(reconciled);
    assertMetricDefinitionFormulaCatalogue(reconciled);
    return {
      seeded,
      skipped,
      mergedDuplicateCount,
      archivedDuplicateCount,
      formulaProtectedDuplicateCount: formulaProtectedMerges.length,
    };
  });

  if (seeded > 0 || skipped === 0) {
    console.log(`[MetricDefs] Seeded ${seeded} metric definitions (${skipped} already existed)`);
  }
  if (mergedDuplicateCount > 0 || archivedDuplicateCount > 0 || formulaProtectedDuplicateCount > 0) {
    console.log(
      `[MetricDefs] Reconciled duplicate names (${mergedDuplicateCount} merged, ${archivedDuplicateCount} archived, ${formulaProtectedDuplicateCount} preserved as formula sources)`,
    );
  }
  return seeded;
}
