import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { db } from "./storage";
import {
  insertUserSchema, insertCompanySchema, insertMetricSchema,
  insertMetricValueSchema, insertActionPlanSchema, insertPolicyVersionSchema,
  hasPermission, type PermissionModule,
  emissionFactors as emissionFactorsTable,
  users,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import crypto from "crypto";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { POLICY_TEMPLATES } from "./policy-templates";
import { getTrafficLightStatus, runCalculationsForPeriod, calculateWeightedEsgScore, type RawInputs, type ScoredMetric, type EmissionFactorMap } from "./calculations";

function buildEmissionFactorMap(dbFactors: any[]): EmissionFactorMap {
  const map: EmissionFactorMap = {};
  for (const f of dbFactors) {
    const val = parseFloat(f.factor);
    if (isNaN(val)) continue;
    const cat = (f.category || "").toLowerCase();
    const name = (f.name || "").toLowerCase();
    const ft = (f.fuelType || "").toLowerCase();
    switch (cat) {
      case "electricity": map.electricity = val; break;
      case "gas": map.naturalGas = val; break;
      case "fuel":
        if (ft === "diesel" || name.includes("diesel")) map.diesel = val;
        else if (ft === "petrol" || name.includes("petrol")) map.petrol = val;
        break;
      case "vehicles":
        if (!ft || ft === "mixed" || ft === "average" || name.includes("average")) map.companyCar = val;
        break;
      case "travel":
        if (name.includes("domestic")) map.domesticFlight = val;
        else if (name.includes("short")) map.shortHaulFlight = val;
        else if (name.includes("long")) map.longHaulFlight = val;
        else if (name.includes("rail")) map.rail = val;
        else if (name.includes("hotel")) map.hotelNight = val;
        break;
    }
  }
  return map;
}

const { Pool } = pg;

const BCRYPT_ROUNDS = 12;

function legacyHashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "esg_salt_2024").digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    return bcrypt.compare(password, storedHash);
  }
  return storedHash === legacyHashPassword(password);
}

function requireAuth(req: Request, res: Response, next: Function) {
  if ((req.session as any).userId) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

function requirePermission(module: PermissionModule) {
  return async (req: Request, res: Response, next: Function) => {
    const userId = (req.session as any).userId;
    const user = await storage.getUser(userId);
    if (!user || !hasPermission(user.role, module)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

const ENVIRONMENTAL_RAW_KEYS = [
  "elec", "gas", "fuel", "waste", "water", "flight", "hotel", "rail", "car_miles",
];
const SOCIAL_RAW_KEYS = [
  "employee", "headcount", "absence", "training", "female", "manager", "living", "leaver",
];

function classifyRawDataCategory(inputName: string): "environmental" | "social" | "governance" {
  if (ENVIRONMENTAL_RAW_KEYS.some(k => inputName.includes(k))) return "environmental";
  if (SOCIAL_RAW_KEYS.some(k => inputName.includes(k))) return "social";
  return "governance";
}

const TOTAL_ONBOARDING_STEPS = 8;

const METRIC_KEY_MAP: Record<string, string> = {
  electricity: "Electricity Consumption",
  gas_fuel: "Gas / Fuel Consumption",
  scope1: "Scope 1 Emissions",
  scope2: "Scope 2 Emissions",
  waste: "Waste Generated",
  recycling: "Recycling Rate",
  water: "Water Consumption",
  vehicle_fuel: "Company Vehicle Fuel Use",
  travel_emissions: "Business Travel Emissions",
  carbon_intensity: "Carbon Intensity",
  headcount: "Total Employees",
  gender_diversity: "Gender Split (% Female)",
  turnover: "Employee Turnover Rate",
  training: "Training Hours per Employee",
  health_safety: "Lost Time Incidents",
  absence: "Absence Rate",
  engagement: "Employee Engagement Score",
  living_wage: "Living Wage Coverage",
  mgmt_diversity: "Management Gender Diversity",
  community: "Community Investment",
  board_meetings: "Board Meetings Held",
  esg_policy: "ESG Targets Set",
  supplier_screening: "Supplier Code of Conduct Adoption",
  privacy_training: "Data Privacy Training Completion",
  anti_bribery: "Anti-Bribery Policy in Place",
  whistleblowing: "Whistleblowing Policy in Place",
  cybersecurity: "Cybersecurity Policy in Place",
  esg_assigned: "ESG Responsibility Assigned",
};

async function seedMetricsFromSelection(companyId: string, selectedKeys: string[], answers?: any) {
  const allDefaultMetrics = [
    { name: "Electricity Consumption", description: "Total electricity used across all sites", category: "environmental" as const, unit: "kWh", frequency: "monthly" as const, dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 1, helpText: "Enter your total electricity usage in kilowatt-hours from your utility bills" },
    { name: "Gas / Fuel Consumption", description: "Natural gas and fuel oil consumption", category: "environmental" as const, unit: "kWh", frequency: "monthly" as const, dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 2, helpText: "Enter gas consumption in kWh from your gas bills" },
    { name: "Company Vehicle Fuel Use", description: "Total fuel used by company-owned or leased vehicles", category: "environmental" as const, unit: "litres", frequency: "monthly" as const, dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 3, helpText: "Enter total fuel purchased for company vehicles in litres" },
    { name: "Scope 1 Emissions", description: "Direct GHG emissions from owned sources", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "calculated", calculationType: "scope1", formulaText: "(Gas kWh × gas factor + Vehicle litres × fuel factor) / 1000", direction: "lower_is_better", displayOrder: 4, helpText: "Automatically calculated from gas/fuel and vehicle data" },
    { name: "Scope 2 Emissions", description: "Indirect emissions from purchased electricity", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "calculated", calculationType: "scope2", formulaText: "Electricity kWh × emission factor / 1000", direction: "lower_is_better", displayOrder: 5, helpText: "Automatically calculated from electricity consumption" },
    { name: "Waste Generated", description: "Total waste produced", category: "environmental" as const, unit: "tonnes", frequency: "monthly" as const, dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 6, helpText: "Enter total waste in tonnes" },
    { name: "Recycling Rate", description: "Percentage of waste recycled", category: "environmental" as const, unit: "%", frequency: "monthly" as const, dataOwner: "Facilities Manager", metricType: "calculated", calculationType: "recycling_rate", formulaText: "Recycled / Total × 100", direction: "higher_is_better", displayOrder: 7, helpText: "Auto-calculated from waste data" },
    { name: "Water Consumption", description: "Total water used", category: "environmental" as const, unit: "m³", frequency: "monthly" as const, dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 8, helpText: "Enter water consumption in cubic metres" },
    { name: "Business Travel Emissions", description: "Emissions from business travel", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "calculated", calculationType: "travel_emissions", formulaText: "Sum of travel × emission factors / 1000", direction: "lower_is_better", displayOrder: 9, helpText: "Auto-calculated from travel data" },
    { name: "Carbon Intensity", description: "Emissions per employee", category: "environmental" as const, unit: "tCO2e/employee", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "derived", calculationType: "carbon_intensity", formulaText: "(Scope 1 + Scope 2 + Travel) / Employees", direction: "lower_is_better", displayOrder: 10, helpText: "Derived from total emissions and headcount" },
    { name: "Total Employees", description: "Total employee headcount", category: "social" as const, unit: "people", frequency: "monthly" as const, dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 11, helpText: "Enter total employee headcount" },
    { name: "Gender Split (% Female)", description: "Percentage of female workforce", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "manual", direction: "target_range", targetMin: "40", targetMax: "60", displayOrder: 12, helpText: "Enter percentage of female employees" },
    { name: "Management Gender Diversity", description: "Percentage of female managers", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "management_diversity", formulaText: "Female managers / Total managers × 100", direction: "target_range", targetMin: "30", targetMax: "60", displayOrder: 13, helpText: "Auto-calculated from management data" },
    { name: "Employee Turnover Rate", description: "Employee leaving rate", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "turnover_rate", formulaText: "Leavers / Headcount × 100", direction: "lower_is_better", displayOrder: 14, helpText: "Auto-calculated from HR data" },
    { name: "Absence Rate", description: "Employee absence percentage", category: "social" as const, unit: "%", frequency: "monthly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Auto-calculated from absence data" },
    { name: "Training Hours per Employee", description: "Average training hours", category: "social" as const, unit: "hours", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "training_per_employee", formulaText: "Total hours / Employees", direction: "higher_is_better", displayOrder: 16, helpText: "Auto-calculated from training data" },
    { name: "Lost Time Incidents", description: "Workplace incidents with lost time", category: "social" as const, unit: "incidents", frequency: "monthly" as const, dataOwner: "H&S Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 17, helpText: "Enter number of lost-time incidents" },
    { name: "Employee Engagement Score", description: "Engagement survey score", category: "social" as const, unit: "score /10", frequency: "annual" as const, dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 18, helpText: "Enter engagement score out of 10" },
    { name: "Living Wage Coverage", description: "Percentage paid living wage or above", category: "social" as const, unit: "%", frequency: "annual" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "living_wage", formulaText: "Living wage employees / Total × 100", direction: "higher_is_better", displayOrder: 19, helpText: "Auto-calculated from payroll data" },
    { name: "Community Investment", description: "Community investment value", category: "social" as const, unit: "£", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 20, helpText: "Enter total community investment" },
    { name: "Board Meetings Held", description: "Board or senior management meetings", category: "governance" as const, unit: "meetings", frequency: "quarterly" as const, dataOwner: "Company Secretary", metricType: "manual", direction: "target_range", targetMin: "4", targetMax: "12", displayOrder: 21, helpText: "Enter number of board meetings" },
    { name: "Anti-Bribery Policy in Place", description: "Anti-bribery policy status", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Compliance Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 22, helpText: "Enter 1 if policy exists, 0 if not" },
    { name: "Whistleblowing Policy in Place", description: "Whistleblowing policy status", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Compliance Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 23, helpText: "Enter 1 if policy exists, 0 if not" },
    { name: "Data Privacy Training Completion", description: "Staff privacy training completion", category: "governance" as const, unit: "%", frequency: "annual" as const, dataOwner: "Data Protection Officer", metricType: "calculated", calculationType: "privacy_training", formulaText: "Trained / Total × 100", direction: "higher_is_better", displayOrder: 24, helpText: "Auto-calculated from training data" },
    { name: "Supplier Code of Conduct Adoption", description: "Suppliers with signed code of conduct", category: "governance" as const, unit: "%", frequency: "annual" as const, dataOwner: "Procurement Manager", metricType: "calculated", calculationType: "supplier_code", formulaText: "Signed / Total × 100", direction: "higher_is_better", displayOrder: 25, helpText: "Auto-calculated from supplier data" },
    { name: "Cybersecurity Policy in Place", description: "Cybersecurity policy status", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "IT Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 26, helpText: "Enter 1 if policy exists, 0 if not" },
    { name: "ESG Responsibility Assigned", description: "ESG ownership assigned", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Managing Director", metricType: "manual", direction: "compliance_yes_no", displayOrder: 27, helpText: "Enter 1 if assigned, 0 if not" },
    { name: "ESG Targets Set", description: "Formal ESG targets established", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Managing Director", metricType: "manual", direction: "compliance_yes_no", displayOrder: 28, helpText: "Enter 1 if targets set, 0 if not" },
  ];

  const selectedNames = new Set<string>();
  for (const key of selectedKeys) {
    const name = METRIC_KEY_MAP[key];
    if (name) selectedNames.add(name);
  }

  for (const m of allDefaultMetrics) {
    if (selectedNames.has(m.name)) {
      await storage.createMetric({ ...m, companyId, enabled: true, isDefault: true } as any);
    }
  }
}

async function seedDatabase(companyId: string, userId: string) {
  const existingMetrics = await storage.getMetrics(companyId);
  if (existingMetrics.length > 0) return;

  const defaultMetrics = [
    { name: "Electricity Consumption", description: "Total electricity used across all sites", category: "environmental" as const, unit: "kWh", frequency: "monthly" as const, dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 1, helpText: "Enter your total electricity usage in kilowatt-hours from your utility bills" },
    { name: "Gas / Fuel Consumption", description: "Natural gas and fuel oil consumption", category: "environmental" as const, unit: "kWh", frequency: "monthly" as const, dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 2, helpText: "Enter gas consumption in kWh from your gas bills" },
    { name: "Company Vehicle Fuel Use", description: "Total fuel used by company-owned or leased vehicles", category: "environmental" as const, unit: "litres", frequency: "monthly" as const, dataOwner: "Operations Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 3, helpText: "Enter total fuel purchased for company vehicles in litres" },
    { name: "Scope 1 Emissions", description: "Direct greenhouse gas emissions from owned sources (gas, fuel, vehicles)", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "calculated", calculationType: "scope1", formulaText: "(Gas kWh × gas factor + Vehicle litres × fuel factor) / 1000", direction: "lower_is_better", displayOrder: 4, helpText: "Automatically calculated from your gas/fuel consumption and vehicle fuel data" },
    { name: "Scope 2 Emissions", description: "Indirect emissions from purchased electricity", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "calculated", calculationType: "scope2", formulaText: "Electricity kWh × electricity emission factor / 1000", direction: "lower_is_better", displayOrder: 5, helpText: "Automatically calculated from your electricity consumption" },
    { name: "Waste Generated", description: "Total waste produced by the business", category: "environmental" as const, unit: "tonnes", frequency: "monthly" as const, dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 6, helpText: "Enter total waste in tonnes from your waste collection records" },
    { name: "Recycling Rate", description: "Percentage of waste that is recycled", category: "environmental" as const, unit: "%", frequency: "monthly" as const, dataOwner: "Facilities Manager", metricType: "calculated", calculationType: "recycling_rate", formulaText: "Recycled waste / Total waste × 100", direction: "higher_is_better", displayOrder: 7, helpText: "Automatically calculated from waste and recycled waste data" },
    { name: "Water Consumption", description: "Total water used across all sites", category: "environmental" as const, unit: "m³", frequency: "monthly" as const, dataOwner: "Facilities Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 8, helpText: "Enter water consumption in cubic metres from your water bills" },
    { name: "Business Travel Emissions", description: "Emissions from business travel including flights, rail, hotels, and car mileage", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "calculated", calculationType: "travel_emissions", formulaText: "Sum of (travel activity × emission factor) for each travel type / 1000", direction: "lower_is_better", displayOrder: 9, helpText: "Automatically calculated from your business travel activity data" },
    { name: "Carbon Intensity", description: "Total carbon emissions relative to business size (per employee or per £m revenue)", category: "environmental" as const, unit: "tCO2e/employee", frequency: "quarterly" as const, dataOwner: "Operations Manager", metricType: "derived", calculationType: "carbon_intensity", formulaText: "(Scope 1 + Scope 2 + Travel Emissions) / Total employees", direction: "lower_is_better", displayOrder: 10, helpText: "Derived from your total emissions and employee count or revenue" },
    { name: "Total Employees", description: "Total number of employees (headcount)", category: "social" as const, unit: "people", frequency: "monthly" as const, dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 11, helpText: "Enter your total employee headcount" },
    { name: "Gender Split (% Female)", description: "Percentage of workforce identifying as female", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "manual", direction: "target_range", targetMin: "40", targetMax: "60", displayOrder: 12, helpText: "Enter the percentage of your workforce identifying as female" },
    { name: "Management Gender Diversity", description: "Percentage of management positions held by women", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "management_diversity", formulaText: "Female managers / Total managers × 100", direction: "target_range", targetMin: "30", targetMax: "60", displayOrder: 13, helpText: "Calculated from female managers and total managers data" },
    { name: "Employee Turnover Rate", description: "Employees leaving as a percentage of average headcount", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "turnover_rate", formulaText: "Employee leavers / Average headcount × 100", direction: "lower_is_better", displayOrder: 14, helpText: "Calculated from leavers and headcount data" },
    { name: "Absence Rate", description: "Employee absence as a percentage of total working days", category: "social" as const, unit: "%", frequency: "monthly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "absence_rate", formulaText: "Absence days / Total working days × 100", direction: "lower_is_better", displayOrder: 15, helpText: "Calculated from absence days and total working days" },
    { name: "Training Hours per Employee", description: "Average training hours delivered per employee", category: "social" as const, unit: "hours", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "training_per_employee", formulaText: "Total training hours / Total employees", direction: "higher_is_better", displayOrder: 16, helpText: "Calculated from total training hours and headcount" },
    { name: "Lost Time Incidents", description: "Number of workplace incidents resulting in lost time", category: "social" as const, unit: "incidents", frequency: "monthly" as const, dataOwner: "H&S Manager", metricType: "manual", direction: "lower_is_better", displayOrder: 17, helpText: "Enter the number of incidents that resulted in time off work" },
    { name: "Employee Engagement Score", description: "Average employee engagement survey score", category: "social" as const, unit: "score /10", frequency: "annual" as const, dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 18, helpText: "Enter your latest employee engagement survey score (out of 10)" },
    { name: "Living Wage Coverage", description: "Percentage of employees paid at or above the real living wage", category: "social" as const, unit: "%", frequency: "annual" as const, dataOwner: "HR Manager", metricType: "calculated", calculationType: "living_wage", formulaText: "Employees paid living wage / Total employees × 100", direction: "higher_is_better", displayOrder: 19, helpText: "Calculated from living wage employee count and total headcount" },
    { name: "Community Investment", description: "Total value of community investment, donations, and volunteering", category: "social" as const, unit: "£", frequency: "quarterly" as const, dataOwner: "HR Manager", metricType: "manual", direction: "higher_is_better", displayOrder: 20, helpText: "Enter the total value of donations, sponsorship, and volunteering time" },
    { name: "Board Meetings Held", description: "Number of board or senior management meetings held", category: "governance" as const, unit: "meetings", frequency: "quarterly" as const, dataOwner: "Company Secretary", metricType: "manual", direction: "target_range", targetMin: "4", targetMax: "12", displayOrder: 21, helpText: "Enter the number of board or senior management meetings this period" },
    { name: "Anti-Bribery Policy in Place", description: "Whether a formal anti-bribery and corruption policy exists", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Compliance Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 22, helpText: "Enter 1 if you have a policy in place, 0 if not" },
    { name: "Whistleblowing Policy in Place", description: "Whether a formal whistleblowing policy exists", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Compliance Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 23, helpText: "Enter 1 if you have a policy in place, 0 if not" },
    { name: "Data Privacy Training Completion", description: "Percentage of staff who completed data privacy training", category: "governance" as const, unit: "%", frequency: "annual" as const, dataOwner: "Data Protection Officer", metricType: "calculated", calculationType: "privacy_training", formulaText: "Trained staff / Total staff × 100", direction: "higher_is_better", displayOrder: 24, helpText: "Calculated from trained staff count and total staff" },
    { name: "Supplier Code of Conduct Adoption", description: "Percentage of suppliers who signed the code of conduct", category: "governance" as const, unit: "%", frequency: "annual" as const, dataOwner: "Procurement Manager", metricType: "calculated", calculationType: "supplier_code", formulaText: "Signed suppliers / Total suppliers × 100", direction: "higher_is_better", displayOrder: 25, helpText: "Calculated from signed and total supplier counts" },
    { name: "Cybersecurity Policy in Place", description: "Whether a formal cybersecurity policy exists", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "IT Manager", metricType: "manual", direction: "compliance_yes_no", displayOrder: 26, helpText: "Enter 1 if you have a policy in place, 0 if not" },
    { name: "ESG Responsibility Assigned", description: "Whether a named individual is responsible for ESG management", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Managing Director", metricType: "manual", direction: "compliance_yes_no", displayOrder: 27, helpText: "Enter 1 if ESG responsibility is formally assigned, 0 if not" },
    { name: "ESG Targets Set", description: "Whether formal ESG targets have been established", category: "governance" as const, unit: "yes/no", frequency: "annual" as const, dataOwner: "Managing Director", metricType: "manual", direction: "compliance_yes_no", displayOrder: 28, helpText: "Enter 1 if formal ESG targets are set, 0 if not" },
  ];

  for (const m of defaultMetrics) {
    await storage.createMetric({ ...m, companyId, enabled: true, isDefault: true } as any);
  }

  // Seed material topics
  const topicsList = [
    { topic: "Energy Use", category: "environmental" as const, selected: true },
    { topic: "Carbon Emissions", category: "environmental" as const, selected: true },
    { topic: "Waste Management", category: "environmental" as const, selected: true },
    { topic: "Water Consumption", category: "environmental" as const, selected: false },
    { topic: "Employee Wellbeing", category: "social" as const, selected: true },
    { topic: "Diversity & Inclusion", category: "social" as const, selected: true },
    { topic: "Training & Development", category: "social" as const, selected: true },
    { topic: "Health & Safety", category: "social" as const, selected: true },
    { topic: "Anti-Bribery & Corruption", category: "governance" as const, selected: true },
    { topic: "Supplier Standards", category: "governance" as const, selected: false },
    { topic: "Data Privacy", category: "governance" as const, selected: true },
    { topic: "Board Oversight", category: "governance" as const, selected: false },
  ];
  await storage.upsertMaterialTopics(companyId, topicsList as any);

  const allMetrics = await storage.getMetrics(companyId);
  const periods = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];

  const sampleData: Record<string, number[]> = {
    "Electricity Consumption": [45200, 43800, 41500, 39200, 37800, 36100],
    "Gas / Fuel Consumption": [12400, 11800, 9600, 7200, 5800, 5100],
    "Company Vehicle Fuel Use": [420, 410, 395, 380, 370, 360],
    "Scope 1 Emissions": [3.4, 3.3, 2.9, 2.4, 2.1, 1.9],
    "Scope 2 Emissions": [9.4, 9.1, 8.6, 8.1, 7.8, 7.5],
    "Waste Generated": [8.4, 8.1, 7.9, 7.6, 7.3, 7.0],
    "Recycling Rate": [62, 64, 66, 68, 70, 72],
    "Water Consumption": [120, 115, 110, 108, 105, 102],
    "Business Travel Emissions": [1.2, 0.9, 1.1, 1.0, 0.8, 0.7],
    "Carbon Intensity": [0.29, 0.28, 0.25, 0.23, 0.21, 0.19],
    "Total Employees": [48, 48, 50, 51, 51, 52],
    "Gender Split (% Female)": [42, 42, 43, 43, 44, 44],
    "Management Gender Diversity": [30, 30, 33, 33, 35, 35],
    "Employee Turnover Rate": [4.2, 3.8, 3.5, 3.2, 3.0, 2.8],
    "Absence Rate": [2.1, 2.3, 1.9, 1.8, 2.0, 1.7],
    "Training Hours per Employee": [2.5, 3.0, 2.8, 3.2, 3.5, 3.8],
    "Lost Time Incidents": [1, 0, 0, 1, 0, 0],
    "Employee Engagement Score": [7.5, 7.5, 7.5, 7.5, 7.5, 7.8],
    "Living Wage Coverage": [95, 95, 96, 96, 97, 98],
    "Community Investment": [500, 250, 750, 300, 400, 600],
    "Board Meetings Held": [1, 1, 1, 1, 1, 1],
    "Anti-Bribery Policy in Place": [1, 1, 1, 1, 1, 1],
    "Whistleblowing Policy in Place": [1, 1, 1, 1, 1, 1],
    "Data Privacy Training Completion": [85, 88, 90, 92, 95, 97],
    "Supplier Code of Conduct Adoption": [40, 42, 45, 48, 50, 52],
    "Cybersecurity Policy in Place": [1, 1, 1, 1, 1, 1],
    "ESG Responsibility Assigned": [1, 1, 1, 1, 1, 1],
    "ESG Targets Set": [0, 0, 0, 1, 1, 1],
  };

  for (const metric of allMetrics) {
    const values = sampleData[metric.name];
    if (values) {
      for (let i = 0; i < periods.length; i++) {
        const prevValue = i > 0 ? values[i - 1] : null;
        const pctChange = prevValue && prevValue !== 0 ? Math.round(((values[i] - prevValue) / Math.abs(prevValue)) * 10000) / 100 : null;
        const status = getTrafficLightStatus(
          values[i],
          metric.targetValue ? Number(metric.targetValue) : null,
          metric.direction || "higher_is_better",
          Number(metric.amberThreshold || 5),
          Number(metric.redThreshold || 15),
          metric.targetMin ? Number(metric.targetMin) : null,
          metric.targetMax ? Number(metric.targetMax) : null,
          prevValue
        );
        await storage.createMetricValue({
          metricId: metric.id,
          period: periods[i],
          value: values[i].toString(),
          previousValue: prevValue?.toString() || null,
          targetValue: metric.targetValue?.toString() || null,
          status,
          percentChange: pctChange?.toString() || null,
          submittedBy: userId,
          notes: "",
          locked: i < 3,
        });
      }
    }
  }

  const sampleRawData: Record<string, Record<string, number>> = {
    "2025-01": {
      electricity_kwh: 45200, gas_kwh: 12400, vehicle_fuel_litres: 420,
      total_waste_tonnes: 8.4, recycled_waste_tonnes: 5.21, water_m3: 120,
      employee_headcount: 48, employee_leavers: 2, absence_days: 20,
      total_working_days: 960, total_training_hours: 120, trained_staff: 41,
      total_staff: 48, signed_suppliers: 20, total_suppliers: 50,
      female_managers: 6, total_managers: 20, living_wage_employees: 46,
      domestic_flight_km: 800, short_haul_flight_km: 2000, long_haul_flight_km: 0,
      rail_km: 500, hotel_nights: 5, car_miles: 1200,
    },
    "2025-02": {
      electricity_kwh: 43800, gas_kwh: 11800, vehicle_fuel_litres: 410,
      total_waste_tonnes: 8.1, recycled_waste_tonnes: 5.18, water_m3: 115,
      employee_headcount: 48, employee_leavers: 2, absence_days: 22,
      total_working_days: 960, total_training_hours: 144, trained_staff: 42,
      total_staff: 48, signed_suppliers: 21, total_suppliers: 50,
      female_managers: 6, total_managers: 20, living_wage_employees: 46,
      domestic_flight_km: 600, short_haul_flight_km: 1500, long_haul_flight_km: 0,
      rail_km: 400, hotel_nights: 3, car_miles: 1000,
    },
    "2025-03": {
      electricity_kwh: 41500, gas_kwh: 9600, vehicle_fuel_litres: 395,
      total_waste_tonnes: 7.9, recycled_waste_tonnes: 5.21, water_m3: 110,
      employee_headcount: 50, employee_leavers: 2, absence_days: 19,
      total_working_days: 1000, total_training_hours: 140, trained_staff: 45,
      total_staff: 50, signed_suppliers: 22, total_suppliers: 50,
      female_managers: 7, total_managers: 21, living_wage_employees: 48,
      domestic_flight_km: 500, short_haul_flight_km: 2500, long_haul_flight_km: 3000,
      rail_km: 600, hotel_nights: 6, car_miles: 800,
    },
    "2025-04": {
      electricity_kwh: 39200, gas_kwh: 7200, vehicle_fuel_litres: 380,
      total_waste_tonnes: 7.6, recycled_waste_tonnes: 5.17, water_m3: 108,
      employee_headcount: 51, employee_leavers: 2, absence_days: 18,
      total_working_days: 1020, total_training_hours: 163, trained_staff: 47,
      total_staff: 51, signed_suppliers: 24, total_suppliers: 50,
      female_managers: 7, total_managers: 21, living_wage_employees: 49,
      domestic_flight_km: 400, short_haul_flight_km: 2000, long_haul_flight_km: 2000,
      rail_km: 500, hotel_nights: 4, car_miles: 900,
    },
    "2025-05": {
      electricity_kwh: 37800, gas_kwh: 5800, vehicle_fuel_litres: 370,
      total_waste_tonnes: 7.3, recycled_waste_tonnes: 5.11, water_m3: 105,
      employee_headcount: 51, employee_leavers: 2, absence_days: 20,
      total_working_days: 1020, total_training_hours: 179, trained_staff: 49,
      total_staff: 51, signed_suppliers: 25, total_suppliers: 50,
      female_managers: 7, total_managers: 20, living_wage_employees: 49,
      domestic_flight_km: 300, short_haul_flight_km: 1800, long_haul_flight_km: 0,
      rail_km: 400, hotel_nights: 3, car_miles: 700,
    },
    "2025-06": {
      electricity_kwh: 36100, gas_kwh: 5100, vehicle_fuel_litres: 360,
      total_waste_tonnes: 7.0, recycled_waste_tonnes: 5.04, water_m3: 102,
      employee_headcount: 52, employee_leavers: 1, absence_days: 18,
      total_working_days: 1040, total_training_hours: 198, trained_staff: 50,
      total_staff: 52, signed_suppliers: 26, total_suppliers: 50,
      female_managers: 7, total_managers: 20, living_wage_employees: 51,
      domestic_flight_km: 200, short_haul_flight_km: 1500, long_haul_flight_km: 0,
      rail_km: 300, hotel_nights: 2, car_miles: 600,
    },
  };

  for (const [period, inputs] of Object.entries(sampleRawData)) {
    for (const [inputName, value] of Object.entries(inputs)) {
      await storage.createRawDataInput({
        companyId, inputName, inputCategory: classifyRawDataCategory(inputName),
        value: value.toString(), unit: "", period, enteredBy: userId,
      });
    }
  }

  // Seed action plans
  await storage.createActionPlan({
    companyId,
    title: "Switch to LED lighting across all offices",
    description: "Replace all fluorescent and halogen lights with energy-efficient LED alternatives to reduce electricity consumption by approximately 20%.",
    owner: "Facilities Manager",
    dueDate: new Date("2025-09-30"),
    status: "in_progress",
    notes: "Phase 1 complete - main office done. Phase 2 (warehouse) scheduled for August.",
  });
  await storage.createActionPlan({
    companyId,
    title: "Introduce supplier code of conduct",
    description: "Draft and roll out a supplier code of conduct covering environmental standards, labour rights, and anti-corruption requirements.",
    owner: "Procurement Manager",
    dueDate: new Date("2025-12-31"),
    status: "not_started",
    notes: "",
  });
  await storage.createActionPlan({
    companyId,
    title: "Improve gender diversity in senior roles",
    description: "Target 40% female representation in management positions by end of next year through targeted recruitment and mentoring.",
    owner: "HR Manager",
    dueDate: new Date("2026-03-31"),
    status: "in_progress",
    notes: "Mentoring programme launched. Two senior roles being actively recruited.",
  });
  await storage.createActionPlan({
    companyId,
    title: "Roll out data privacy training for all staff",
    description: "Ensure 100% of employees complete annual GDPR and data privacy training.",
    owner: "Data Protection Officer",
    dueDate: new Date("2025-07-31"),
    status: "complete",
    notes: "Training completed June 2025. Certificates filed.",
  });

  // Seed policy
  const policy = await storage.createPolicy(companyId);
  const policyContent = {
    purpose: "This ESG Policy sets out [Company Name]'s commitment to managing our environmental, social and governance responsibilities. We recognise that sustainable business practices are essential for long-term value creation and maintaining trust with our customers, employees, investors and wider communities.",
    environmental: "We are committed to reducing our environmental footprint through energy efficiency improvements, waste reduction, and responsible resource management. We will measure and report our carbon emissions, set science-based reduction targets, and work towards net zero by 2040.",
    social: "We are committed to providing a safe, inclusive and rewarding workplace for all our people. We will promote diversity and equal opportunities, invest in training and development, and maintain the highest standards of health and safety.",
    governance: "We are committed to high standards of corporate governance, including transparency, accountability and ethical conduct. We operate a zero-tolerance approach to bribery and corruption, and we expect the same from our suppliers and partners.",
    roles: "The Board of Directors has overall responsibility for ESG strategy and performance. Day-to-day responsibility is delegated to the Operations Director, supported by departmental managers who own specific ESG metrics.",
    dataCollection: "ESG data is collected monthly or quarterly by nominated data owners using this ESG management system. Data is reviewed by the Operations Director before being locked and included in external reports.",
    reviewCycle: "This policy will be reviewed annually by the Board of Directors, or sooner if there are material changes to the business or regulatory environment. The next scheduled review is in January 2026.",
  };
  await storage.createPolicyVersion({
    policyId: policy.id,
    versionNumber: 1,
    content: policyContent,
    createdBy: userId,
  });

  // Seed carbon calculation
  const carbonInputs = {
    electricity: "180000",
    gas: "45000",
    diesel: "2500",
    petrol: "1800",
    vehicleMileage: "35000",
    domesticFlights: "5000",
    shortHaulFlights: "15000",
    longHaulFlights: "8000",
    railTravel: "12000",
    hotelNights: "40",
    country: "UK",
  };
  const factors = await storage.getEmissionFactors("UK");
  if (factors.length > 0) {
    const results = calculateEmissions(carbonInputs, factors);
    await storage.createCarbonCalculation({
      companyId,
      reportingPeriod: "2024",
      periodType: "annual",
      inputs: carbonInputs,
      results,
      scope1Total: results.scope1Total.toFixed(4),
      scope2Total: results.scope2Total.toFixed(4),
      scope3Total: results.scope3Total.toFixed(4),
      totalEmissions: results.totalEmissions.toFixed(4),
      employeeCount: 48,
    });
  }

  await storage.updateCompany(companyId, {
    onboardingComplete: true,
    onboardingPath: "guided",
    onboardingStep: 8,
    onboardingProgressPercent: 100,
    onboardingCompletedAt: new Date(),
  });

  await storage.createAuditLog({
    companyId,
    userId,
    action: "Company setup completed",
    entityType: "company",
    entityId: companyId,
    details: { note: "Initial onboarding wizard completed" },
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const PgSession = connectPgSimple(session);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  app.set("trust proxy", 1);

  app.use(session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "none" as const,
      httpOnly: true,
    },
    proxy: true,
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => (req.body?.email || "").trim().toLowerCase() || req.ip || "unknown",
  });

  const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: "Too many password change attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
  });

  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: "Too many registration attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
  });

  // Auth routes
  app.post("/api/auth/register", registerLimiter, async (req, res) => {
    try {
      const { username, email, password, companyName } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: "Missing required fields" });

      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ error: "Email already registered" });

      const hashedPassword = await hashPassword(password);
      const company = await storage.createCompany({ name: companyName || "My Company" });
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        role: "admin",
        companyId: company.id,
      });

      await storage.createAuditLog({
        companyId: company.id,
        userId: user.id,
        action: "user_registered",
        entityType: "user",
        entityId: user.id,
        details: { email: user.email },
      });

      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: "Session error" });
        (req.session as any).userId = user.id;
        (req.session as any).companyId = company.id;
        req.session.save((err) => {
          if (err) return res.status(500).json({ error: "Session error" });
          res.json({ user: { ...user, password: undefined }, company });
        });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.getUserByEmail(email);
      if (!user) {
        await storage.createAuditLog({
          action: "login_failed",
          entityType: "auth",
          details: { email, reason: "user_not_found" },
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const passwordValid = await verifyPassword(password, user.password);
      if (!passwordValid) {
        await storage.createAuditLog({
          companyId: user.companyId || undefined,
          userId: user.id,
          action: "login_failed",
          entityType: "auth",
          details: { email, reason: "wrong_password" },
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (!user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
        const newHash = await hashPassword(password);
        await storage.updateUser(user.id, { password: newHash });
      }

      const company = user.companyId ? await storage.getCompany(user.companyId) : null;

      if (user.companyId) {
        try { await seedDatabase(user.companyId, user.id); } catch (e) { console.error("Seed error:", e); }
      }

      await storage.createAuditLog({
        companyId: user.companyId || undefined,
        userId: user.id,
        action: "login_success",
        entityType: "auth",
        details: { email: user.email },
      });

      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: "Session error" });
        (req.session as any).userId = user.id;
        (req.session as any).companyId = user.companyId;
        req.session.save((err) => {
          if (err) return res.status(500).json({ error: "Session error" });
          res.json({ user: { ...user, password: undefined }, company });
        });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const userId = (req.session as any).userId;
    const companyId = (req.session as any).companyId;
    if (userId) {
      await storage.createAuditLog({
        companyId,
        userId,
        action: "logout",
        entityType: "auth",
      });
    }
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.post("/api/auth/change-password", requireAuth, passwordChangeLimiter, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both current and new password are required" });
      if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

      const newHash = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: newHash });

      await storage.createAuditLog({
        companyId: (req.session as any).companyId,
        userId: user.id,
        action: "password_changed",
        entityType: "user",
        entityId: user.id,
      });

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;
    res.json({ user: { ...user, password: undefined }, company });
  });

  // Company routes
  app.get("/api/company", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const company = await storage.getCompany(companyId);
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(company);
  });

  app.put("/api/company", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const company = await storage.updateCompany(companyId, req.body);
      res.json(company);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/company/settings", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const settings = await storage.getCompanySettings(companyId);
    res.json(settings || {});
  });

  app.put("/api/company/settings", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const settings = await storage.upsertCompanySettings(companyId, req.body);
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Onboarding routes
  app.put("/api/onboarding/step", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const { step, path, companyProfile, esgMaturity, selectedModules, selectedMetrics, onboardingAnswers } = req.body;

      const stepNum = typeof step === "number" ? Math.min(Math.max(Math.round(step), 1), TOTAL_ONBOARDING_STEPS) : 1;
      const update: any = {
        onboardingStep: stepNum,
        onboardingProgressPercent: Math.min(Math.round((stepNum / TOTAL_ONBOARDING_STEPS) * 100), 100),
      };
      if (path) {
        update.onboardingPath = path;
        update.onboardingStartedAt = new Date();
      }
      if (companyProfile) {
        if (companyProfile.name) update.name = companyProfile.name;
        if (companyProfile.industry) update.industry = companyProfile.industry;
        if (companyProfile.businessType) update.businessType = companyProfile.businessType;
        if (companyProfile.employeeCount) update.employeeCount = companyProfile.employeeCount;
        if (companyProfile.locations) update.locations = companyProfile.locations;
        if (companyProfile.country) update.country = companyProfile.country;
        if (companyProfile.operationalProfile) update.operationalProfile = companyProfile.operationalProfile;
        if (companyProfile.reportingYearStart) update.reportingYearStart = companyProfile.reportingYearStart;
      }
      if (esgMaturity) update.esgMaturity = esgMaturity;
      if (selectedModules) update.selectedModules = selectedModules;
      if (selectedMetrics) update.selectedMetrics = selectedMetrics;
      if (onboardingAnswers) update.onboardingAnswers = onboardingAnswers;

      const company = await storage.updateCompany(companyId, update);
      res.json(company);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/onboarding/complete", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { path, companyProfile, esgMaturity, selectedModules, selectedMetrics, onboardingAnswers } = req.body;

      const isManual = path === "manual";

      const update: any = {
        onboardingComplete: true,
        onboardingCompletedAt: new Date(),
        onboardingProgressPercent: 100,
        onboardingStep: 8,
      };
      if (isManual) {
        update.onboardingPath = "manual";
      }
      if (companyProfile) {
        if (companyProfile.name) update.name = companyProfile.name;
        if (companyProfile.industry) update.industry = companyProfile.industry;
        if (companyProfile.businessType) update.businessType = companyProfile.businessType;
        if (companyProfile.employeeCount) update.employeeCount = companyProfile.employeeCount;
        if (companyProfile.locations) update.locations = companyProfile.locations;
        if (companyProfile.country) update.country = companyProfile.country;
        if (companyProfile.operationalProfile) update.operationalProfile = companyProfile.operationalProfile;
        if (companyProfile.reportingYearStart) update.reportingYearStart = companyProfile.reportingYearStart;
      }
      if (esgMaturity) update.esgMaturity = esgMaturity;
      if (selectedModules) update.selectedModules = selectedModules;
      if (selectedMetrics) update.selectedMetrics = selectedMetrics;
      if (onboardingAnswers) update.onboardingAnswers = onboardingAnswers;

      await storage.updateCompany(companyId, update);

      if (!isManual && selectedMetrics && Array.isArray(selectedMetrics)) {
        const existingMetrics = await storage.getMetrics(companyId);
        if (existingMetrics.length === 0) {
          await seedMetricsFromSelection(companyId, selectedMetrics, onboardingAnswers);
        }
      }

      if (isManual) {
        const existingMetrics = await storage.getMetrics(companyId);
        if (existingMetrics.length === 0) {
          await seedDatabase(companyId, userId);
        }
      }

      const existingTopics = await storage.getMaterialTopics(companyId);
      if (existingTopics.length === 0) {
        const topicsList = [
          { topic: "Energy Use", category: "environmental" as const, selected: true },
          { topic: "Carbon Emissions", category: "environmental" as const, selected: true },
          { topic: "Waste Management", category: "environmental" as const, selected: true },
          { topic: "Water Consumption", category: "environmental" as const, selected: false },
          { topic: "Employee Wellbeing", category: "social" as const, selected: true },
          { topic: "Diversity & Inclusion", category: "social" as const, selected: true },
          { topic: "Training & Development", category: "social" as const, selected: true },
          { topic: "Health & Safety", category: "social" as const, selected: true },
          { topic: "Anti-Bribery & Corruption", category: "governance" as const, selected: true },
          { topic: "Supplier Standards", category: "governance" as const, selected: false },
          { topic: "Data Privacy", category: "governance" as const, selected: true },
          { topic: "Board Oversight", category: "governance" as const, selected: false },
        ];
        await storage.upsertMaterialTopics(companyId, topicsList as any);
      }

      await storage.createAuditLog({
        companyId, userId,
        action: `Onboarding completed (${isManual ? "manual" : "guided"})`,
        entityType: "company",
        entityId: companyId,
        details: { path: isManual ? "manual" : "guided" },
      });

      const company = await storage.getCompany(companyId);
      res.json(company);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Policy routes
  app.get("/api/policy", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    let policy = await storage.getPolicy(companyId);
    if (!policy) {
      policy = await storage.createPolicy(companyId);
    }
    const latestVersion = await storage.getLatestPolicyVersion(policy.id);
    const versions = await storage.getPolicyVersions(policy.id);
    res.json({ policy, latestVersion, versions });
  });

  app.put("/api/policy", requireAuth, requirePermission("policy_editing"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      let policy = await storage.getPolicy(companyId);
      if (!policy) policy = await storage.createPolicy(companyId);

      const { content, status, reviewDate, action } = req.body;

      if (content) {
        const versions = await storage.getPolicyVersions(policy.id);
        const nextVersion = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
        await storage.createPolicyVersion({
          policyId: policy.id,
          versionNumber: nextVersion,
          content,
          createdBy: userId,
        });
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (reviewDate) updateData.reviewDate = new Date(reviewDate);
      if (status === "published") updateData.publishedAt = new Date();

      const updated = await storage.updatePolicy(policy.id, updateData);

      await storage.createAuditLog({
        companyId,
        userId,
        action: action || "Policy updated",
        entityType: "policy",
        entityId: policy.id,
        details: { status },
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Material Topics routes
  app.get("/api/topics", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const topics = await storage.getMaterialTopics(companyId);
    res.json(topics);
  });

  app.put("/api/topics/:id", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const { selected } = req.body;
      await storage.updateMaterialTopic(req.params.id, selected);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Metrics routes
  app.get("/api/metrics", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const metricsList = await storage.getMetrics(companyId);
    const targets = await Promise.all(metricsList.map(m => storage.getMetricTarget(m.id)));
    const withTargets = metricsList.map((m, i) => ({ ...m, target: targets[i] || null }));
    res.json(withTargets);
  });

  app.post("/api/metrics", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const parsed = insertMetricSchema.parse({ ...req.body, companyId });
      const metric = await storage.createMetric(parsed);
      res.json(metric);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/metrics/:id", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const metric = await storage.updateMetric(req.params.id, req.body);
      res.json(metric);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/metrics/:id/target", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const { targetValue, targetYear } = req.body;
      const target = await storage.upsertMetricTarget(req.params.id, targetValue, targetYear);
      res.json(target);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/metrics/:id/values", requireAuth, async (req, res) => {
    const values = await storage.getMetricValues(req.params.id);
    res.json(values);
  });

  app.get("/api/data-entry/template", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const metrics = await storage.getMetrics(companyId);

      const rawLabels = [
        "Electricity Consumption", "Gas / Fuel Consumption", "Company Vehicle Fuel",
        "Total Waste Generated", "Recycled Waste", "Water Consumption",
        "Domestic Flights", "Short-Haul Flights", "Long-Haul Flights",
        "Rail Travel", "Hotel Nights", "Business Car Miles",
        "Employee Headcount", "Employee Leavers", "Absence Days",
        "Total Working Days", "Total Training Hours", "Female Managers",
        "Total Managers", "Living Wage Employees",
        "Privacy-Trained Staff", "Total Staff (for training %)",
        "Suppliers Signed CoC", "Total Suppliers",
      ];

      const manualMetrics = metrics
        .filter(m => m.metricType === "manual" || !m.metricType)
        .map(m => m.name);

      const allRows = [...rawLabels, ...manualMetrics];

      const now = new Date();
      const periods: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      res.json({ rows: allRows, periods, categories: { raw: rawLabels, manual: manualMetrics } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Metric Values (data entry)
  app.get("/api/data-entry/:period", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const values = await storage.getMetricValuesByPeriod(companyId, req.params.period);
    const allMetrics = await storage.getMetrics(companyId);
    res.json({ values, metrics: allMetrics.filter(m => m.enabled) });
  });

  app.post("/api/data-entry", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const companyId = (req.session as any).companyId;
      const { metricId, period, value, notes, dataSourceType } = req.body;

      const existing = await storage.getMetricValues(metricId);
      const existingForPeriod = existing.find(v => v.period === period);

      let result;
      if (existingForPeriod) {
        if (existingForPeriod.locked) {
          return res.status(400).json({ error: "This period is locked and cannot be edited" });
        }
        const updateData: any = { value, notes, submittedBy: userId };
        if (dataSourceType) updateData.dataSourceType = dataSourceType;
        result = await storage.updateMetricValue(existingForPeriod.id, updateData);
      } else {
        const createData: any = { metricId, period, value, notes, submittedBy: userId, locked: false };
        if (dataSourceType) createData.dataSourceType = dataSourceType;
        result = await storage.createMetricValue(createData);
      }

      await storage.createAuditLog({
        companyId,
        userId,
        action: "Metric value submitted",
        entityType: "metric_value",
        entityId: result.id,
        details: { period, value },
      });

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/data-entry/:period/lock", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      await storage.lockPeriod(companyId, req.params.period);
      await storage.createAuditLog({
        companyId, userId,
        action: `Period ${req.params.period} locked`,
        entityType: "period",
        entityId: req.params.period,
        details: {},
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Raw Data Inputs
  app.get("/api/raw-data/:period", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const data = await storage.getRawDataByPeriod(companyId, req.params.period);
    res.json(data);
  });

  app.post("/api/raw-data", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { inputs, period } = req.body;

      const results: any[] = [];
      for (const [inputName, value] of Object.entries(inputs)) {
        if (value === null || value === undefined || value === "") continue;
        const cat = classifyRawDataCategory(inputName);
        const r = await storage.upsertRawDataInput(companyId, inputName, period, {
          inputCategory: cat, value: String(value), unit: "", enteredBy: userId,
        });
        results.push(r);
      }

      await storage.createAuditLog({
        companyId, userId,
        action: "Raw data submitted",
        entityType: "raw_data",
        entityId: period,
        details: { period, inputCount: results.length },
      });

      res.json({ saved: results.length, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/data-entry/bulk-upload", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { rows } = req.body as { rows: { name: string; period: string; value: number }[] };

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data rows provided" });
      }

      const allMetrics = await storage.getMetrics(companyId);
      const allRawFields = [
        ...Object.values({ environmental: ["electricity_kwh","gas_kwh","vehicle_fuel_litres","total_waste_tonnes","recycled_waste_tonnes","water_m3","domestic_flight_km","short_haul_flight_km","long_haul_flight_km","rail_km","hotel_nights","car_miles"], social: ["employee_headcount","employee_leavers","absence_days","total_working_days","total_training_hours","female_managers","total_managers","living_wage_employees"], governance: ["trained_staff","total_staff","signed_suppliers","total_suppliers","annual_revenue"] }).flat()
      ];

      const RAW_LABEL_MAP: Record<string, string> = {
        "electricity consumption": "electricity_kwh",
        "gas / fuel consumption": "gas_kwh",
        "gas/fuel consumption": "gas_kwh",
        "company vehicle fuel": "vehicle_fuel_litres",
        "company vehicle fuel use": "vehicle_fuel_litres",
        "total waste generated": "total_waste_tonnes",
        "waste generated": "total_waste_tonnes",
        "recycled waste": "recycled_waste_tonnes",
        "water consumption": "water_m3",
        "domestic flights": "domestic_flight_km",
        "short-haul flights": "short_haul_flight_km",
        "short haul flights": "short_haul_flight_km",
        "long-haul flights": "long_haul_flight_km",
        "long haul flights": "long_haul_flight_km",
        "rail travel": "rail_km",
        "hotel nights": "hotel_nights",
        "business car miles": "car_miles",
        "employee headcount": "employee_headcount",
        "total employees": "employee_headcount",
        "employee leavers": "employee_leavers",
        "absence days": "absence_days",
        "total working days": "total_working_days",
        "total training hours": "total_training_hours",
        "female managers": "female_managers",
        "total managers": "total_managers",
        "living wage employees": "living_wage_employees",
        "privacy-trained staff": "trained_staff",
        "privacy trained staff": "trained_staff",
        "total staff (for training %)": "total_staff",
        "total staff": "total_staff",
        "suppliers signed coc": "signed_suppliers",
        "suppliers signed code of conduct": "signed_suppliers",
        "total suppliers": "total_suppliers",
        "annual revenue": "annual_revenue",
        "revenue": "annual_revenue",
      };

      if (!rows.every((r: any) => r.name && typeof r.period === "string" && r.period.match(/^\d{4}-\d{2}$/))) {
        return res.status(400).json({ error: "Each row must have a name and a valid YYYY-MM period" });
      }
      if (rows.length > 10000) {
        return res.status(400).json({ error: "Maximum 10,000 data points per upload" });
      }

      const lockedPeriods = new Set<string>();
      const periodSet = [...new Set(rows.map((r: any) => r.period))];
      for (const p of periodSet) {
        const vals = await storage.getMetricValuesByPeriod(companyId, p);
        if (vals.some((v: any) => v.locked)) lockedPeriods.add(p);
      }

      let rawSaved = 0;
      let metricSaved = 0;
      let skipped = 0;
      const periodsAffected = new Set<string>();

      for (const row of rows) {
        if (row.value === null || row.value === undefined || isNaN(Number(row.value))) {
          skipped++;
          continue;
        }

        if (lockedPeriods.has(row.period)) {
          skipped++;
          continue;
        }

        const nameLower = row.name.trim().toLowerCase();
        const rawKey = RAW_LABEL_MAP[nameLower] || (allRawFields.includes(row.name.trim()) ? row.name.trim() : null);

        if (rawKey) {
          const cat = classifyRawDataCategory(rawKey);
          await storage.upsertRawDataInput(companyId, rawKey, row.period, {
            inputCategory: cat, value: String(row.value), unit: "", enteredBy: userId,
          });
          rawSaved++;
          periodsAffected.add(row.period);
        } else {
          const metric = allMetrics.find(m => m.name.toLowerCase() === nameLower);
          if (metric) {
            const existing = await storage.getMetricValues(metric.id);
            const existingForPeriod = existing.find(v => v.period === row.period);
            if (existingForPeriod) {
              if (!existingForPeriod.locked) {
                await storage.updateMetricValue(existingForPeriod.id, { value: String(row.value), notes: "Bulk upload", submittedBy: userId });
                metricSaved++;
              } else { skipped++; }
            } else {
              await storage.createMetricValue({ metricId: metric.id, period: row.period, value: String(row.value), notes: "Bulk upload", submittedBy: userId, locked: false });
              metricSaved++;
            }
            periodsAffected.add(row.period);
          } else {
            skipped++;
          }
        }
      }

      const bulkFactors = await storage.getEmissionFactors();
      const bulkFactorMap = buildEmissionFactorMap(bulkFactors);
      for (const period of periodsAffected) {
        try {
          const rawData = await storage.getRawDataByPeriod(companyId, period);
          const rawInputsMap: RawInputs = {};
          for (const d of rawData) {
            rawInputsMap[d.inputName] = d.value !== null && d.value !== undefined ? Number(d.value) : undefined;
          }
          const existingVals: Record<string, number | null> = {};
          for (const m of allMetrics) {
            const vals = await storage.getMetricValues(m.id);
            const pVal = vals.find(v => v.period === period);
            existingVals[m.name] = pVal?.value != null ? Number(pVal.value) : null;
          }
          const calculated = runCalculationsForPeriod(rawInputsMap, bulkFactorMap, existingVals);
          for (const [metricName, calcValue] of Object.entries(calculated)) {
            if (calcValue === null || calcValue === undefined) continue;
            const metric = allMetrics.find(m => m.name === metricName && (m.metricType === "calculated" || m.metricType === "derived"));
            if (!metric) continue;
            const status = getTrafficLightStatus(
              calcValue,
              metric.targetValue ? Number(metric.targetValue) : null,
              metric.direction || "higher_is_better",
              Number(metric.amberThreshold || 5),
              Number(metric.redThreshold || 15),
              metric.targetMin ? Number(metric.targetMin) : null,
              metric.targetMax ? Number(metric.targetMax) : null,
              null
            );
            const vals = await storage.getMetricValues(metric.id);
            const existing = vals.find(v => v.period === period);
            if (existing && !existing.locked) {
              await storage.updateMetricValue(existing.id, { value: String(calcValue), status, notes: "Auto-calculated (bulk)" });
            } else if (!existing) {
              await storage.createMetricValue({ metricId: metric.id, period, value: String(calcValue), status, notes: "Auto-calculated (bulk)", submittedBy: userId, locked: false });
            }
          }
        } catch (calcErr) {
          console.error(`Bulk recalc error for period ${period}:`, calcErr);
        }
      }

      await storage.createAuditLog({
        companyId, userId,
        action: "Bulk data uploaded",
        entityType: "bulk_upload",
        entityId: "excel",
        details: { rawSaved, metricSaved, skipped, periods: [...periodsAffected] },
      });

      res.json({ rawSaved, metricSaved, skipped, periodsRecalculated: periodsAffected.size });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recalculate metrics for a period
  app.post("/api/metrics/recalculate/:period", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const period = req.params.period;

      const rawData = await storage.getRawDataByPeriod(companyId, period);
      const rawInputs: RawInputs = {};
      for (const d of rawData) {
        rawInputs[d.inputName] = d.value !== null && d.value !== undefined ? Number(d.value) : undefined;
      }

      const allMetrics = await storage.getMetrics(companyId);
      const existingValues: Record<string, number | null> = {};
      for (const m of allMetrics) {
        const vals = await storage.getMetricValues(m.id);
        const periodVal = vals.find(v => v.period === period);
        if (periodVal) existingValues[m.name] = periodVal.value !== null ? Number(periodVal.value) : null;
      }

      const dbFactors = await storage.getEmissionFactors();
      const efMap = buildEmissionFactorMap(dbFactors);
      const calculated = runCalculationsForPeriod(rawInputs, efMap, existingValues);
      const updated: any[] = [];

      for (const [metricName, calcValue] of Object.entries(calculated)) {
        if (calcValue === null || calcValue === undefined) continue;
        const metric = allMetrics.find(m => m.name === metricName && (m.metricType === "calculated" || m.metricType === "derived"));
        if (!metric) continue;

        const vals = await storage.getMetricValues(metric.id);
        const existingForPeriod = vals.find(v => v.period === period);
        const sortedPrev = vals.filter(v => v.period < period).sort((a, b) => a.period.localeCompare(b.period));
        const previousPeriodVal = sortedPrev.length > 0 ? sortedPrev[sortedPrev.length - 1] : null;
        const prevVal = previousPeriodVal?.value !== null && previousPeriodVal?.value !== undefined ? Number(previousPeriodVal.value) : null;
        const pctChange = prevVal && prevVal !== 0 ? Math.round(((calcValue - prevVal) / Math.abs(prevVal)) * 10000) / 100 : null;
        const status = getTrafficLightStatus(
          calcValue,
          metric.targetValue ? Number(metric.targetValue) : null,
          metric.direction || "higher_is_better",
          Number(metric.amberThreshold || 5),
          Number(metric.redThreshold || 15),
          metric.targetMin ? Number(metric.targetMin) : null,
          metric.targetMax ? Number(metric.targetMax) : null,
          prevVal
        );

        if (existingForPeriod) {
          const r = await storage.updateMetricValue(existingForPeriod.id, {
            value: calcValue.toString(),
            previousValue: prevVal?.toString() || null,
            status,
            percentChange: pctChange?.toString() || null,
          });
          updated.push({ metric: metricName, value: calcValue, status, updated: true });
        } else {
          await storage.createMetricValue({
            metricId: metric.id,
            period,
            value: calcValue.toString(),
            previousValue: prevVal?.toString() || null,
            targetValue: metric.targetValue?.toString() || null,
            status,
            percentChange: pctChange?.toString() || null,
            submittedBy: userId,
            notes: "Auto-calculated",
            locked: false,
          });
          updated.push({ metric: metricName, value: calcValue, status, created: true });
        }
      }

      res.json({ period, updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Metric history with traffic lights
  app.get("/api/metrics/:id/history", requireAuth, async (req, res) => {
    const metric = await storage.getMetric(req.params.id);
    if (!metric) return res.status(404).json({ error: "Metric not found" });
    const values = await storage.getMetricValues(req.params.id);
    const sortedValues = values.sort((a, b) => a.period.localeCompare(b.period));
    const history = sortedValues.map((v, i) => {
      const val = v.value ? Number(v.value) : null;
      const prev = i > 0 && sortedValues[i - 1].value ? Number(sortedValues[i - 1].value) : null;
      const status = v.status || getTrafficLightStatus(
        val,
        metric.targetValue ? Number(metric.targetValue) : null,
        metric.direction || "higher_is_better",
        Number(metric.amberThreshold || 5),
        Number(metric.redThreshold || 15),
        metric.targetMin ? Number(metric.targetMin) : null,
        metric.targetMax ? Number(metric.targetMax) : null,
        prev
      );
      return { ...v, status, previousValue: prev };
    });
    res.json({ metric, history });
  });

  // Admin metric update
  app.get("/api/metrics/all", requireAuth, requirePermission("template_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const allMetrics = await storage.getMetrics(companyId);
      res.json(allMetrics);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/metrics/:id/admin", requireAuth, requirePermission("template_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const allMetrics = await storage.getMetrics(companyId);
      const metricBelongs = allMetrics.find((m: any) => m.id === req.params.id);
      if (!metricBelongs) return res.status(403).json({ error: "Metric does not belong to your company" });
      const { direction, targetValue, targetMin, targetMax, amberThreshold, redThreshold, enabled, helpText, dataOwner, weight, importance } = req.body;
      const result = await storage.updateMetric(req.params.id, {
        direction, targetValue, targetMin, targetMax, amberThreshold, redThreshold, enabled, helpText, dataOwner, weight, importance,
      });
      await storage.createAuditLog({
        companyId, userId,
        action: "Metric settings updated",
        entityType: "metric",
        entityId: req.params.id,
        details: req.body,
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Enhanced dashboard
  app.get("/api/dashboard/enhanced", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const allMetrics = await storage.getMetrics(companyId);
      const enabledMetrics = allMetrics.filter(m => m.enabled);
      const settings = await storage.getCompanySettings(companyId);
      const materialTopics = await storage.getMaterialTopics(companyId);

      let latestPeriod = "";
      for (const metric of enabledMetrics) {
        const vals = await storage.getMetricValues(metric.id);
        for (const v of vals) {
          if (v.period > latestPeriod) latestPeriod = v.period;
        }
      }
      if (!latestPeriod) latestPeriod = new Date().toISOString().slice(0, 7);
      const statusCounts = { green: 0, amber: 0, red: 0, missing: 0 };
      const categorySummary: Record<string, { green: number; amber: number; red: number; missing: number; total: number }> = {
        environmental: { green: 0, amber: 0, red: 0, missing: 0, total: 0 },
        social: { green: 0, amber: 0, red: 0, missing: 0, total: 0 },
        governance: { green: 0, amber: 0, red: 0, missing: 0, total: 0 },
      };

      const metricSummaries: any[] = [];
      const scoredMetricInputs: ScoredMetric[] = [];
      const missingDataAlerts: { metricName: string; category: string; period: string }[] = [];

      for (const metric of enabledMetrics) {
        const values = await storage.getMetricValues(metric.id);
        const latestVal = values.find(v => v.period === latestPeriod);
        const cat = metric.category;
        categorySummary[cat].total++;

        const isCompliance = metric.direction === "compliance_yes_no";
        const metricWeight = Number(metric.weight || 1);
        const metricImportance = (metric as any).importance || "standard";

        if (!latestVal || latestVal.value === null) {
          statusCounts.missing++;
          categorySummary[cat].missing++;
          metricSummaries.push({ ...metric, latestValue: null, status: "missing", trend: null });
          missingDataAlerts.push({ metricName: metric.name, category: cat, period: latestPeriod });
          scoredMetricInputs.push({
            id: metric.id, name: metric.name, category: cat, status: "missing",
            weight: metricWeight, importance: metricImportance,
            metricType: metric.metricType || "manual", direction: metric.direction || "higher_is_better",
            isCompliance, value: null, target: metric.targetValue ? Number(metric.targetValue) : null,
          });
          continue;
        }

        const val = Number(latestVal.value);
        const sortedVals = values.sort((a, b) => a.period.localeCompare(b.period));
        const prevEntry = sortedVals.filter(v => v.period < latestPeriod).pop();
        const prev = prevEntry?.value ? Number(prevEntry.value) : null;
        const status = latestVal.status || getTrafficLightStatus(
          val, metric.targetValue ? Number(metric.targetValue) : null,
          metric.direction || "higher_is_better",
          Number(metric.amberThreshold || 5), Number(metric.redThreshold || 15),
          metric.targetMin ? Number(metric.targetMin) : null, metric.targetMax ? Number(metric.targetMax) : null, prev
        );

        statusCounts[status as "green" | "amber" | "red"]++;
        categorySummary[cat][status as "green" | "amber" | "red"]++;

        const trend = sortedVals.slice(-6).map(v => ({ period: v.period, value: v.value ? Number(v.value) : null }));

        scoredMetricInputs.push({
          id: metric.id, name: metric.name, category: cat,
          status: status as any, weight: metricWeight, importance: metricImportance,
          metricType: metric.metricType || "manual", direction: metric.direction || "higher_is_better",
          isCompliance, value: val, target: metric.targetValue ? Number(metric.targetValue) : null,
        });

        metricSummaries.push({
          id: metric.id, name: metric.name, category: cat, unit: metric.unit,
          metricType: metric.metricType, direction: metric.direction,
          weight: metricWeight, importance: metricImportance,
          enabled: metric.enabled, dataOwner: metric.dataOwner,
          amberThreshold: metric.amberThreshold, redThreshold: metric.redThreshold,
          targetMin: metric.targetMin, targetMax: metric.targetMax,
          latestValue: val, previousValue: prev, status, trend,
          percentChange: prev && prev !== 0 ? Math.round(((val - prev) / Math.abs(prev)) * 10000) / 100 : null,
          target: metric.targetValue ? Number(metric.targetValue) : null,
          helpText: metric.helpText, formulaText: metric.formulaText,
        });
      }

      const weightedScore = calculateWeightedEsgScore(
        scoredMetricInputs,
        materialTopics.map(t => ({ category: t.category, selected: t.selected ?? false })),
      );

      const actions = await storage.getActionPlans(companyId);
      const now = new Date();
      const overdueActions = actions.filter(a => a.dueDate && new Date(a.dueDate) < now && a.status !== "complete");
      const policy = await storage.getPolicy(companyId);
      const upcomingPolicyReviews: { reviewDate: string; status: string }[] = [];
      if (policy?.reviewDate) {
        const rd = new Date(policy.reviewDate);
        const daysUntil = Math.ceil((rd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 90) {
          upcomingPolicyReviews.push({ reviewDate: rd.toISOString(), status: daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "urgent" : "upcoming" });
        }
      }

      const evidenceFiles = await storage.getEvidenceFiles(companyId);
      const uniqueMetricsWithEvidence = new Set(evidenceFiles.filter(e => e.linkedModule === "metric_value" && e.linkedEntityId).map(e => e.linkedEntityId)).size;
      const evidenceCoverage = enabledMetrics.length > 0 ? Math.min(100, Math.round((uniqueMetricsWithEvidence / enabledMetrics.length) * 100)) : 0;

      const submittedCount = metricSummaries.filter(m => m.status !== "missing").length;
      const submissionRate = enabledMetrics.length > 0 ? Math.round((submittedCount / enabledMetrics.length) * 100) : 0;

      const calculatedMetrics = metricSummaries.filter(m => m.metricType === "calculated" || m.metricType === "derived").length;
      const manualMetrics = metricSummaries.filter(m => m.metricType === "manual").length;

      res.json({
        totalMetrics: enabledMetrics.length,
        statusCounts,
        categorySummary,
        esgScore: weightedScore.overallScore,
        weightedScore,
        latestPeriod,
        metricSummaries,
        missingDataAlerts,
        overdueActions: overdueActions.map(a => ({ id: a.id, title: a.title, dueDate: a.dueDate, owner: a.owner })),
        upcomingPolicyReviews,
        evidenceCoverage,
        submissionRate,
        calculatedMetrics,
        manualMetrics,
      });

      generateReminders(companyId).catch(() => {});
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Action Plans routes
  app.get("/api/actions", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const actions = await storage.getActionPlans(companyId);
    res.json(actions);
  });

  app.post("/api/actions", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const plan = await storage.createActionPlan({ ...req.body, companyId });
      await storage.createAuditLog({
        companyId, userId,
        action: "Action created",
        entityType: "action",
        entityId: plan.id,
        details: { title: plan.title },
      });
      res.json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/actions/:id", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const plan = await storage.updateActionPlan(req.params.id, req.body);
      await storage.createAuditLog({
        companyId, userId,
        action: "Action updated",
        entityType: "action",
        entityId: req.params.id,
        details: { status: req.body.status },
      });
      res.json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/actions/:id", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      await storage.deleteActionPlan(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Dashboard
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const data = await storage.getDashboardData(companyId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reports
  app.get("/api/reports", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const reports = await storage.getReportRuns(companyId);
    res.json(reports);
  });

  app.post("/api/reports/generate", requireAuth, requirePermission("report_generation"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const {
        period, reportType, reportTemplate,
        includePolicy, includeTopics, includeMetrics, includeActions,
        includeSummary, includeCarbon, includeEvidence, includeMethodology, includeSignoff,
      } = req.body;

      const company = await storage.getCompany(companyId);
      const policy = await storage.getPolicy(companyId);
      const latestVersion = policy ? await storage.getLatestPolicyVersion(policy.id) : null;
      const topics = await storage.getMaterialTopics(companyId);
      const allMetrics = await storage.getMetrics(companyId);
      const enabledMetrics = allMetrics.filter((m: any) => m.enabled);
      const values = period ? await storage.getMetricValuesByPeriod(companyId, period) : [];
      const actions = await storage.getActionPlans(companyId);
      const evidenceCoverage = await storage.getEvidenceCoverage(companyId, period || undefined);
      const allEvidence = await storage.getEvidenceFiles(companyId);
      const carbonCalcs = await storage.getCarbonCalculations(companyId);
      const generatingUser = await storage.getUser(userId);

      const periodSchema = z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        reportType: z.enum(["pdf", "csv", "word"]).optional(),
        reportTemplate: z.enum(["management", "customer", "annual"]).optional(),
      });
      const validation = periodSchema.safeParse({ period, reportType, reportTemplate });
      if (!validation.success) {
        res.status(400).json({ error: "Invalid report parameters" });
        return;
      }

      const valuesWithLabels = values.map((v: any) => {
        const hasEvidence = allEvidence.some((e: any) => e.linkedModule === "metric_value" && e.linkedEntityId === v.id);
        const dataSourceLabel = hasEvidence ? "Evidenced" : (v.dataSourceType === "estimated" ? "Estimated" : "Manual");
        const workflowLabel = v.workflowStatus === "approved" ? "Approved" : v.workflowStatus === "submitted" ? "Submitted" : "Draft";
        return { ...v, dataSourceLabel, workflowLabel };
      });

      const metricsByCategory: Record<string, any[]> = {};
      for (const v of valuesWithLabels) {
        const cat = v.category || "other";
        if (!metricsByCategory[cat]) metricsByCategory[cat] = [];
        metricsByCategory[cat].push(v);
      }

      const scoredMetrics: ScoredMetric[] = enabledMetrics.map((m: any) => {
        const val = valuesWithLabels.find((v: any) => v.metricId === m.id);
        const status = val ? getTrafficLightStatus(m, val.value, null) : "missing";
        return {
          metricId: m.id, name: m.name, category: m.category,
          status, value: val?.value ?? null,
          weight: parseFloat(m.weight) || 1, importance: m.importance || "standard",
        };
      });
      const selectedTopics = topics.filter((t: any) => t.selected);
      const weightedScore = calculateWeightedEsgScore(scoredMetrics, selectedTopics);

      const periodCarbon = period
        ? carbonCalcs.find((c: any) => c.reportingPeriod === period || c.reportingPeriod?.startsWith(period.substring(0, 4)))
        : carbonCalcs[0];
      const matchedCarbon = periodCarbon || (carbonCalcs.length > 0 ? carbonCalcs[0] : null);
      const carbonPeriodMismatch = matchedCarbon && period && matchedCarbon.reportingPeriod !== period;
      const carbonSummary = matchedCarbon ? {
        scope1: parseFloat(matchedCarbon.scope1Total as string) || 0,
        scope2: parseFloat(matchedCarbon.scope2Total as string) || 0,
        scope3: parseFloat(matchedCarbon.scope3Total as string) || 0,
        total: parseFloat(matchedCarbon.totalEmissions as string) || 0,
        period: matchedCarbon.reportingPeriod,
        factorYear: matchedCarbon.factorYear || 2024,
        employeeCount: matchedCarbon.employeeCount,
        perEmployee: matchedCarbon.employeeCount
          ? Math.round((parseFloat(matchedCarbon.totalEmissions as string) || 0) / matchedCarbon.employeeCount * 100) / 100
          : null,
        dataQuality: matchedCarbon.dataQuality || {},
        assumptions: matchedCarbon.assumptions || [],
        methodologyNotes: matchedCarbon.methodologyNotes || [],
        lineItems: (matchedCarbon.results as any)?.lineItems || [],
        periodMismatch: carbonPeriodMismatch ? `Carbon data from ${matchedCarbon.reportingPeriod}, not current period ${period}` : null,
      } : null;

      const totalValues = valuesWithLabels.length;
      const approvedCount = valuesWithLabels.filter((v: any) => v.workflowStatus === "approved").length;
      const draftCount = valuesWithLabels.filter((v: any) => v.workflowStatus === "draft").length;
      const evidencedCount = valuesWithLabels.filter((v: any) => v.dataSourceLabel === "Evidenced").length;
      const estimatedCount = valuesWithLabels.filter((v: any) => v.dataSourceLabel === "Estimated").length;
      const manualCount = valuesWithLabels.filter((v: any) => v.dataSourceLabel === "Manual").length;
      const missingMetrics = enabledMetrics.filter((m: any) => !valuesWithLabels.find((v: any) => v.metricId === m.id));

      const dataQualityFlags = {
        totalValues, approvedCount, draftCount, evidencedCount, estimatedCount, manualCount,
        missingCount: missingMetrics.length,
        missingMetrics: missingMetrics.map((m: any) => ({ name: m.name, category: m.category })),
        approvalRate: totalValues > 0 ? Math.round((approvedCount / totalValues) * 100) : 0,
        evidenceRate: totalValues > 0 ? Math.round((evidencedCount / totalValues) * 100) : 0,
      };

      const actionsComplete = actions.filter((a: any) => a.status === "complete").length;
      const actionsOverdue = actions.filter((a: any) => a.status !== "complete" && a.dueDate && new Date(a.dueDate) < new Date()).length;
      const actionsSummary = {
        total: actions.length,
        complete: actionsComplete,
        inProgress: actions.filter((a: any) => a.status === "in_progress").length,
        notStarted: actions.filter((a: any) => a.status === "not_started").length,
        overdue: actionsOverdue,
        completionRate: actions.length > 0 ? Math.round((actionsComplete / actions.length) * 100) : 0,
        items: actions,
      };

      const policyContent = latestVersion?.content;
      const policySummary = policyContent ? {
        purpose: policyContent.purpose || null,
        environmentalCommitments: policyContent.environmentalCommitments || null,
        socialCommitments: policyContent.socialCommitments || null,
        governanceCommitments: policyContent.governanceCommitments || null,
        rolesAndResponsibilities: policyContent.rolesAndResponsibilities || null,
        workflowStatus: policy?.status || "draft",
      } : null;

      const emissionFactors = await db.select().from(emissionFactorsTable).orderBy(emissionFactorsTable.category);
      const factorMethodology = {
        factorYear: carbonSummary?.factorYear || emissionFactors[0]?.factorYear || 2024,
        source: emissionFactors[0]?.sourceLabel || "UK DEFRA",
        factorCount: emissionFactors.length,
        categories: [...new Set(emissionFactors.map((f: any) => f.category))],
      };

      const companySettings = await storage.getCompanySettings(companyId);
      const branding = companySettings ? {
        name: companySettings.reportBrandingName || null,
        tagline: companySettings.reportBrandingTagline || null,
        color: companySettings.reportBrandingColor || null,
        footer: companySettings.reportBrandingFooter || null,
      } : null;

      let dataQualityAssessment = null;
      if (req.body.includeDataQualityAssessment) {
        const dqResult = await db.execute(
          sql`SELECT mv.metric_id, mv.value, mv.notes, mv.workflow_status, mv.data_source_type, mv.id as mv_id
              FROM metric_values mv JOIN metrics m ON mv.metric_id = m.id
              WHERE m.company_id = ${companyId} AND mv.period = ${period || ""}`
        );
        const dqMap: Record<string, any> = {};
        dqResult.rows.forEach((v: any) => { dqMap[v.metric_id] = v; });
        const evidenceLinked = new Set(
          allEvidence.filter((e: any) => e.linkedModule === "metric_value" && e.linkedEntityId).map((e: any) => e.linkedEntityId)
        );
        const perMetric = enabledMetrics.map((m: any) => {
          const val = dqMap[m.id];
          let score = 0;
          if (val?.value != null) score += 30;
          const hasEvidence = val && (evidenceLinked.has(val.mv_id) || val.data_source_type === "evidenced");
          if (hasEvidence) score += 20;
          if (val?.workflow_status === "approved") score += 20;
          if (val?.value != null && val?.data_source_type !== "estimated") score += 15;
          if (val?.notes) score += 15;
          return { metricName: m.name, category: m.category, qualityScore: score };
        });
        const overall = perMetric.length > 0 ? Math.round(perMetric.reduce((s: number, m: any) => s + m.qualityScore, 0) / perMetric.length) : 0;
        const catBreakdown: Record<string, number> = {};
        ["environmental", "social", "governance"].forEach(cat => {
          const cm = perMetric.filter(m => m.category === cat);
          catBreakdown[cat] = cm.length > 0 ? Math.round(cm.reduce((s, m) => s + m.qualityScore, 0) / cm.length) : 0;
        });
        const recommendations: string[] = [];
        if (overall < 40) recommendations.push("Data quality is low. Prioritise uploading evidence files and adding notes to metrics.");
        if (dataQualityFlags.missingCount > 0) recommendations.push(`${dataQualityFlags.missingCount} metrics have no data entered for this period.`);
        if (dataQualityFlags.estimatedCount > 3) recommendations.push("Several metrics use estimated data. Consider obtaining actual values where possible.");
        if (dataQualityFlags.approvalRate < 50) recommendations.push("Less than half of submitted data has been approved. Complete the approval workflow.");
        dataQualityAssessment = { overallScore: overall, categoryBreakdown: catBreakdown, recommendations, perMetric };
      }

      let complianceStatusData = null;
      if (req.body.includeComplianceStatus) {
        const fws = await db.execute(sql`SELECT * FROM compliance_frameworks WHERE is_active = true`);
        const reqs = await db.execute(sql`SELECT * FROM compliance_requirements`);
        const metricNamesWithData = new Set(valuesWithLabels.filter((v: any) => v.value != null).map((v: any) => {
          const metric = enabledMetrics.find((m: any) => m.id === v.metricId);
          return metric?.name;
        }).filter(Boolean));
        complianceStatusData = fws.rows.map((fw: any) => {
          const fwReqs = reqs.rows.filter((r: any) => r.framework_id === fw.id);
          let met = 0;
          fwReqs.forEach((r: any) => {
            const linked = r.linked_metric_ids || [];
            if (linked.length > 0 && linked.some((name: string) => metricNamesWithData.has(name))) met++;
          });
          return {
            id: fw.id, name: fw.name, version: fw.version,
            totalRequirements: fwReqs.length, metRequirements: met,
            compliancePercent: fwReqs.length > 0 ? Math.round((met / fwReqs.length) * 100) : 0,
          };
        });
      }

      let periodComparisonData = null;
      if (req.body.includePeriodComparison && period) {
        const [yearStr, monthStr] = period.split("-");
        const prevMonth = parseInt(monthStr) - 1;
        const previousPeriod = prevMonth < 1
          ? `${parseInt(yearStr) - 1}-12`
          : `${yearStr}-${String(prevMonth).padStart(2, "0")}`;
        const prevValues = await storage.getMetricValuesByPeriod(companyId, previousPeriod);
        const compMetrics = enabledMetrics.map((m: any) => {
          const curr = valuesWithLabels.find((v: any) => v.metricId === m.id);
          const prev = prevValues.find((v: any) => v.metricId === m.id);
          const currentVal = curr?.value != null ? parseFloat(curr.value) : null;
          const prevVal = prev?.value != null ? parseFloat(prev.value as any) : null;
          const delta = currentVal != null && prevVal != null ? currentVal - prevVal : null;
          return { name: m.name, currentValue: currentVal, previousValue: prevVal, delta };
        });
        periodComparisonData = { currentPeriod: period, previousPeriod, metrics: compMetrics };
      }

      const reportData = {
        generatedAt: new Date().toISOString(),
        generatedBy: generatingUser?.username || userId,
        reportTemplate: reportTemplate || "management",
        period,
        company,
        branding,
        policySummary,
        selectedTopics,
        metricsByCategory,
        values: valuesWithLabels,
        weightedScore,
        carbonSummary,
        actionsSummary,
        dataQualityFlags,
        evidenceCoverage,
        factorMethodology,
        dataQualityAssessment,
        complianceStatus: complianceStatusData,
        periodComparison: periodComparisonData,
      };

      const report = await storage.createReportRun({
        companyId, period,
        reportType: reportType || "pdf",
        reportTemplate: reportTemplate || "management",
        generatedBy: userId,
        includePolicy, includeTopics, includeMetrics, includeActions,
        includeSummary: includeSummary ?? true,
        includeCarbon: includeCarbon ?? true,
        includeEvidence: includeEvidence ?? true,
        includeMethodology: includeMethodology ?? true,
        includeSignoff: includeSignoff ?? true,
        reportData,
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "Report generated",
        entityType: "report",
        entityId: report.id,
        details: { period, reportType, reportTemplate },
      });

      res.json({ report, data: reportData });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Audit logs
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const logs = await storage.getAuditLogs(companyId);
    const users = await storage.getUsersByCompany(companyId);
    const userMap = new Map(users.map(u => [u.id, u.username]));
    const enriched = logs.map(log => ({
      ...log,
      performedBy: log.userId ? userMap.get(log.userId) || null : null,
    }));
    res.json(enriched);
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const all = req.query.all === "true";
      const items = all
        ? await storage.getNotifications(companyId)
        : await storage.getActiveNotifications(companyId);
      res.json(items);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/notifications/count", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const active = await storage.getActiveNotifications(companyId);
      res.json({ count: active.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/notifications/refresh", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const count = await generateReminders(companyId);
      res.json({ generated: count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/notifications/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const result = await storage.dismissNotification(req.params.id, companyId, userId);
      if (!result) return res.status(404).json({ error: "Notification not found" });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/notifications/dismiss-all", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      await storage.dismissAllNotifications(companyId, userId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  async function generateReminders(companyId: string): Promise<number> {
    let created = 0;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const allMetrics = await storage.getMetrics(companyId);
    const enabledMetrics = allMetrics.filter((m: any) => m.enabled);
    const values = await storage.getMetricValuesByPeriod(companyId, currentPeriod);
    const submittedIds = new Set(values.map((v: any) => v.metricId));

    for (const m of enabledMetrics) {
      if (!submittedIds.has(m.id)) {
        const key = `metric_due:${m.id}:${currentPeriod}`;
        const existing = await storage.getNotificationBySourceKey(key, companyId);
        if (!existing) {
          await storage.createNotification({
            companyId, type: "metric_due",
            title: `Metric submission due: ${m.name}`,
            message: `No data submitted for ${m.name} in ${currentPeriod}.`,
            severity: "warning", linkedModule: "metric_value", linkedEntityId: m.id,
            linkUrl: "/data-entry", dueDate: now, autoGenerated: true, sourceKey: key,
          });
          created++;
        }
      }
    }

    const actions = await storage.getActionPlans(companyId);
    for (const a of actions) {
      if (a.status !== "complete" && a.dueDate && new Date(a.dueDate) < now) {
        const key = `action_overdue:${a.id}`;
        const existing = await storage.getNotificationBySourceKey(key, companyId);
        if (!existing) {
          await storage.createNotification({
            companyId, type: "action_overdue",
            title: `Overdue action: ${a.title}`,
            message: `Due ${new Date(a.dueDate).toLocaleDateString()}. Currently ${(a.status || "not_started").replace(/_/g, " ")}.`,
            severity: "critical", linkedModule: "action_plan", linkedEntityId: a.id,
            linkUrl: "/actions", dueDate: new Date(a.dueDate), autoGenerated: true, sourceKey: key,
          });
          created++;
        }
      }
    }

    const policy = await storage.getPolicy(companyId);
    if (policy?.reviewDate) {
      const reviewDate = new Date(policy.reviewDate);
      const daysUntil = Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 90) {
        const key = `policy_review:${policy.id}`;
        const existing = await storage.getNotificationBySourceKey(key, companyId);
        if (!existing) {
          const severity = daysUntil < 0 ? "critical" : daysUntil <= 30 ? "warning" : "info";
          const label = daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "due within 30 days" : "upcoming";
          await storage.createNotification({
            companyId, type: "policy_review",
            title: `Policy review ${label}`,
            message: `Your ESG policy review is ${label} (${reviewDate.toLocaleDateString()}).`,
            severity, linkedModule: "policy", linkedEntityId: policy.id,
            linkUrl: "/policy", dueDate: reviewDate, autoGenerated: true, sourceKey: key,
          });
          created++;
        }
      }
    }

    const generatedPoliciesData = await storage.getGeneratedPolicies(companyId);
    for (const gp of generatedPoliciesData) {
      if (gp.reviewDate) {
        const reviewDate = new Date(gp.reviewDate);
        const daysUntil = Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 90) {
          const key = `policy_template_review:${gp.id}`;
          const existing = await storage.getNotificationBySourceKey(key, companyId);
          if (!existing) {
            const severity = daysUntil < 0 ? "critical" : daysUntil <= 30 ? "warning" : "info";
            const label = daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "due within 30 days" : "upcoming";
            await storage.createNotification({
              companyId, type: "policy_review",
              title: `Policy review ${label}: ${gp.templateSlug}`,
              message: `Review is ${label} (${reviewDate.toLocaleDateString()}).`,
              severity, linkedModule: "generated_policy", linkedEntityId: gp.id,
              linkUrl: "/policy-templates", dueDate: reviewDate, autoGenerated: true, sourceKey: key,
            });
            created++;
          }
        }
      }
    }

    const evidenceFiles = await storage.getEvidenceFiles(companyId);
    for (const e of evidenceFiles) {
      if (e.expiryDate) {
        const expiryDate = new Date(e.expiryDate);
        const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 60) {
          const key = `evidence_expiry:${e.id}`;
          const existing = await storage.getNotificationBySourceKey(key, companyId);
          if (!existing) {
            const severity = daysUntil < 0 ? "critical" : daysUntil <= 14 ? "warning" : "info";
            const label = daysUntil < 0 ? "expired" : daysUntil <= 14 ? "expiring soon" : "expiring within 60 days";
            await storage.createNotification({
              companyId, type: "evidence_expiry",
              title: `Evidence ${label}: ${e.fileName}`,
              message: `${e.fileName} ${label} (${expiryDate.toLocaleDateString()}).`,
              severity, linkedModule: "evidence", linkedEntityId: e.id,
              linkUrl: "/evidence", dueDate: expiryDate, autoGenerated: true, sourceKey: key,
            });
            created++;
          }
        }
      }
    }

    const questionnaires = await storage.getQuestionnaires(companyId);
    for (const q of questionnaires) {
      if (q.status === "in_progress" && q.updatedAt) {
        const daysSinceUpdate = Math.ceil((now.getTime() - new Date(q.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate > 14) {
          const key = `questionnaire_stale:${q.id}`;
          const existing = await storage.getNotificationBySourceKey(key, companyId);
          if (!existing) {
            await storage.createNotification({
              companyId, type: "questionnaire_review",
              title: `Questionnaire review needed: ${q.name}`,
              message: `No updates for ${daysSinceUpdate} days. Consider completing or reviewing.`,
              severity: "info", linkedModule: "questionnaire", linkedEntityId: q.id,
              linkUrl: "/questionnaire", autoGenerated: true, sourceKey: key,
            });
            created++;
          }
        }
      }
    }

    const reports = await storage.getReportRuns(companyId);
    for (const r of reports) {
      if (r.workflowStatus === "submitted") {
        const key = `report_pending:${r.id}`;
        const existing = await storage.getNotificationBySourceKey(key, companyId);
        if (!existing) {
          await storage.createNotification({
            companyId, type: "report_approval",
            title: `Report approval pending`,
            message: `A ${r.reportTemplate || "management"} report for ${r.period} is awaiting approval.`,
            severity: "warning", linkedModule: "report", linkedEntityId: r.id,
            linkUrl: "/reports", autoGenerated: true, sourceKey: key,
          });
          created++;
        }
      }
    }

    const companyUsers = await storage.getUsersByCompany(companyId);
    for (const u of companyUsers) {
      const userTasks = await storage.getUserTasks(u.id, companyId);
      for (const t of userTasks) {
        const key = `task_assigned:${t.entityType}:${t.entityId}`;
        const existing = await storage.getNotificationBySourceKey(key, companyId);
        if (!existing) {
          await storage.createNotification({
            companyId, userId: u.id, type: "task_assigned",
            title: `Task assigned: ${t.title}`,
            message: `You have a ${t.entityType.replace(/_/g, " ")} task: ${t.title}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ""}.`,
            severity: t.isOverdue ? "critical" : "warning",
            linkedModule: t.entityType, linkedEntityId: t.entityId,
            linkUrl: t.linkUrl, autoGenerated: true, sourceKey: key,
          });
          created++;
        }
      }
    }

    const allEvidenceRequests = await storage.getEvidenceRequests(companyId);
    for (const er of allEvidenceRequests) {
      if (er.status === "requested" && er.dueDate) {
        const dueDate = new Date(er.dueDate);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue <= 7) {
          const key = `evidence_request_pending:${er.id}`;
          const existing = await storage.getNotificationBySourceKey(key, companyId);
          if (!existing) {
            const severity = daysUntilDue < 0 ? "critical" : daysUntilDue <= 3 ? "warning" : "info";
            const label = daysUntilDue < 0 ? "overdue" : daysUntilDue <= 3 ? "due in " + daysUntilDue + " days" : "due soon";
            await storage.createNotification({
              companyId, userId: er.assignedUserId, type: "evidence_request_pending",
              title: `Evidence request ${label}`,
              message: `Evidence request "${er.description}" is ${label} (${dueDate.toLocaleDateString()}).`,
              severity, linkedModule: "evidence_request", linkedEntityId: er.id,
              linkUrl: "/evidence", dueDate, autoGenerated: true, sourceKey: key,
            });
            created++;
          }
        }
      }
    }

    const reportingPeriodsData = await storage.getReportingPeriods(companyId);
    for (const rp of reportingPeriodsData) {
      if (rp.status === "open" && rp.endDate) {
        const endDate = new Date(rp.endDate);
        const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEnd <= 14 && daysUntilEnd >= 0) {
          const key = `period_closing:${rp.id}`;
          const existing = await storage.getNotificationBySourceKey(key, companyId);
          if (!existing) {
            const severity = daysUntilEnd <= 3 ? "critical" : daysUntilEnd <= 7 ? "warning" : "info";
            await storage.createNotification({
              companyId, type: "period_closing",
              title: `Reporting period closing: ${rp.name}`,
              message: `"${rp.name}" ends in ${daysUntilEnd} days (${endDate.toLocaleDateString()}). Ensure all data is submitted.`,
              severity, linkedModule: "reporting_period", linkedEntityId: rp.id,
              linkUrl: "/data-entry", dueDate: endDate, autoGenerated: true, sourceKey: key,
            });
            created++;
          }
        }
      }
    }

    const pendingApprovals = await storage.getWorkflowPendingItems(companyId);
    const approvalEntries: { entityType: string; entityId: string; name: string; submittedAt: Date | null }[] = [];
    for (const [entityType, items] of Object.entries(pendingApprovals)) {
      for (const item of items as any[]) {
        approvalEntries.push({
          entityType,
          entityId: item.id,
          name: item.name || item.title || entityType,
          submittedAt: item.submitted_at ? new Date(item.submitted_at) : null,
        });
      }
    }
    for (const entry of approvalEntries) {
      if (entry.submittedAt) {
        const daysSinceSubmission = Math.ceil((now.getTime() - entry.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceSubmission > 3) {
          const key = `approval_waiting:${entry.entityType}:${entry.entityId}`;
          const existing = await storage.getNotificationBySourceKey(key, companyId);
          if (!existing) {
            const linkMap: Record<string, string> = {
              metricValues: "/my-approvals",
              rawDataInputs: "/my-approvals",
              reportRuns: "/my-approvals",
              generatedPolicies: "/my-approvals",
              questionnaireQuestions: "/my-approvals",
            };
            await storage.createNotification({
              companyId, type: "approval_waiting",
              title: `Approval waiting: ${entry.name}`,
              message: `"${entry.name}" has been waiting for approval for ${daysSinceSubmission} days.`,
              severity: daysSinceSubmission > 7 ? "critical" : "warning",
              linkedModule: entry.entityType, linkedEntityId: entry.entityId,
              linkUrl: linkMap[entry.entityType] || "/my-approvals",
              autoGenerated: true, sourceKey: key,
            });
            created++;
          }
        }
      }
    }

    return created;
  }

  // ===== AI POLICY GENERATOR =====
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  app.post("/api/policy-generator/generate", requireAuth, requirePermission("policy_editing"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { inputs } = req.body;

      const saved = await storage.createPolicyGenerationInput({ companyId, inputs });

      const prompt = buildPolicyPrompt(inputs);
      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: "You are an ESG policy expert specialising in SME businesses. Write professional but accessible ESG policies in plain English. Do not give legal advice. Always include a note that the policy should be reviewed by management before formal adoption." },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
      });

      const generatedText = completion.choices[0]?.message?.content || "{}";
      let generatedContent;
      try {
        generatedContent = JSON.parse(generatedText);
      } catch {
        generatedContent = { rawText: generatedText };
      }

      await storage.updatePolicyGenerationInput(saved.id, { generatedContent });

      await storage.createAiGenerationLog({
        companyId,
        featureType: "policy_generator",
        modelName: "gpt-5.2",
        promptVersion: "v1",
        generatedBy: userId,
        sourceDataSummary: { inputs: req.body.inputs },
        promptText: "<system prompt summary>",
        outputSummary: "ESG policy generated with " + Object.keys(generatedContent).length + " sections",
        entityId: saved.id,
        entityType: "policy_generation_input",
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "ESG policy generated via AI",
        entityType: "policy_generation",
        entityId: saved.id,
        details: { sectorsUsed: inputs.sector },
      });

      res.json({ id: saved.id, generatedContent });
    } catch (e: any) {
      console.error("Policy generation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/policy-generator/history", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const history = await storage.getPolicyGenerationInputs(companyId);
    res.json(history);
  });

  app.post("/api/policy-generator/save-to-policy", requireAuth, requirePermission("policy_editing"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { content } = req.body;

      let policy = await storage.getPolicy(companyId);
      if (!policy) policy = await storage.createPolicy(companyId);

      const versions = await storage.getPolicyVersions(policy.id);
      const nextVersion = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
      await storage.createPolicyVersion({
        policyId: policy.id,
        versionNumber: nextVersion,
        content,
        createdBy: userId,
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "AI-generated policy saved as new version",
        entityType: "policy",
        entityId: policy.id,
        details: { versionNumber: nextVersion },
      });

      res.json({ ok: true, versionNumber: nextVersion });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== CARBON CALCULATOR =====
  app.get("/api/carbon/factors", requireAuth, async (req, res) => {
    const country = (req.query.country as string) || "UK";
    const factors = await storage.getEmissionFactors(country);
    res.json(factors);
  });

  app.get("/api/carbon/calculations/:id/export", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const calc = await storage.getCarbonCalculation(req.params.id);
      if (!calc || calc.companyId !== companyId) return res.status(404).json({ error: "Not found" });

      const results = calc.results as any;
      const methodNotes = (calc as any).methodologyNotes || results?.lineItems || [];
      const assumptions = (calc as any).assumptions || results?.assumptions || [];
      const factorYear = (calc as any).factorYear || results?.factorYear || 2024;

      let text = `CARBON FOOTPRINT ESTIMATE\n`;
      text += `========================\n\n`;
      text += `Period: ${calc.reportingPeriod} (${calc.periodType})\n`;
      text += `Factor Year: ${factorYear}\n`;
      text += `Calculated: ${calc.createdAt ? new Date(calc.createdAt).toLocaleDateString() : "N/A"}\n\n`;

      text += `SUMMARY\n-------\n`;
      text += `Scope 1 (Direct): ${parseFloat(String(calc.scope1Total || 0)).toFixed(2)} kgCO2e\n`;
      text += `Scope 2 (Electricity): ${parseFloat(String(calc.scope2Total || 0)).toFixed(2)} kgCO2e\n`;
      text += `Scope 3 (Travel): ${parseFloat(String(calc.scope3Total || 0)).toFixed(2)} kgCO2e\n`;
      text += `Total: ${parseFloat(String(calc.totalEmissions || 0)).toFixed(2)} kgCO2e\n`;
      if (calc.employeeCount) text += `Per Employee: ${(parseFloat(String(calc.totalEmissions || 0)) / calc.employeeCount).toFixed(2)} kgCO2e\n`;
      text += `\n`;

      if (methodNotes.length > 0) {
        text += `DETAILED BREAKDOWN\n------------------\n`;
        for (const n of methodNotes) {
          text += `\n${n.source} (Scope ${n.scope})\n`;
          text += `  Calculation: ${n.calculation}\n`;
          text += `  Data Quality: ${n.dataQuality}\n`;
          text += `  Factor Source: ${n.factorSource} (${n.factorYear})\n`;
          text += `  Methodology: ${n.methodology}\n`;
          if (n.fuelType) text += `  Fuel Type: ${n.fuelType}\n`;
          if (n.assumptions?.length) text += `  Assumptions: ${n.assumptions.join("; ")}\n`;
        }
        text += `\n`;
      }

      if (assumptions.length > 0) {
        text += `ASSUMPTIONS\n-----------\n`;
        for (const a of assumptions) {
          text += `- ${a}\n`;
        }
        text += `\n`;
      }

      text += `DISCLAIMER\n----------\n`;
      text += `This is an estimate produced by an SME carbon estimator. Emission factors sourced from UK DEFRA ${factorYear} GHG Conversion Factors.\n`;
      text += `Values should be reviewed before use in formal disclosures or regulatory submissions.\n`;
      text += `Data quality indicators: Actual = measured/invoiced data, Estimated = calculated from partial data, Proxy = derived from industry benchmarks.\n`;

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename=carbon-estimate-${calc.reportingPeriod}.txt`);
      res.send(text);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/carbon/calculations", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const calcs = await storage.getCarbonCalculations(companyId);
    res.json(calcs);
  });

  app.post("/api/carbon/calculate", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { inputs, reportingPeriod, periodType, employeeCount, dataQuality: dqMap } = req.body;

      const country = inputs.country || "UK";
      const factors = await storage.getEmissionFactors(country);

      const results = calculateEmissions(inputs, factors, dqMap || {});

      const calc = await storage.createCarbonCalculation({
        companyId,
        reportingPeriod,
        periodType: periodType || "annual",
        inputs,
        results,
        scope1Total: results.scope1Total.toFixed(4),
        scope2Total: results.scope2Total.toFixed(4),
        scope3Total: results.scope3Total.toFixed(4),
        totalEmissions: results.totalEmissions.toFixed(4),
        employeeCount: employeeCount || null,
        factorYear: results.factorYear,
        dataQuality: results.dataQuality,
        methodologyNotes: results.lineItems,
        assumptions: results.assumptions,
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "Carbon calculation completed",
        entityType: "carbon_calculation",
        entityId: calc.id,
        details: { reportingPeriod, totalEmissions: results.totalEmissions, factorYear: results.factorYear },
      });

      res.json(calc);
    } catch (e: any) {
      console.error("Carbon calculation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/carbon/calculations/:id", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const calc = await storage.getCarbonCalculation(req.params.id);
      if (!calc || calc.companyId !== companyId) return res.status(404).json({ error: "Not found" });
      await storage.deleteCarbonCalculation(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== QUESTIONNAIRE AUTOFILL =====
  app.get("/api/questionnaires", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const qs = await storage.getQuestionnaires(companyId);
    res.json(qs);
  });

  app.get("/api/questionnaires/:id", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const q = await storage.getQuestionnaire(req.params.id);
    if (!q || q.companyId !== companyId) return res.status(404).json({ error: "Questionnaire not found" });
    const questions = await storage.getQuestionnaireQuestions(q.id);
    res.json({ ...q, questions });
  });

  app.post("/api/questionnaires", requireAuth, requirePermission("questionnaire_access"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { title, source, questions } = req.body;

      const q = await storage.createQuestionnaire({ companyId, title, source, status: "draft" });

      if (questions && Array.isArray(questions)) {
        for (let i = 0; i < questions.length; i++) {
          await storage.createQuestionnaireQuestion({
            questionnaireId: q.id,
            questionText: questions[i],
            orderIndex: i,
          });
        }
      }

      await storage.createAuditLog({
        companyId, userId,
        action: "Questionnaire created",
        entityType: "questionnaire",
        entityId: q.id,
        details: { title, questionCount: questions?.length || 0 },
      });

      const savedQuestions = await storage.getQuestionnaireQuestions(q.id);
      res.json({ ...q, questions: savedQuestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/questionnaires/:id/autofill", requireAuth, requirePermission("questionnaire_access"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const questionnaireId = req.params.id;

      const qRecord = await storage.getQuestionnaire(questionnaireId);
      if (!qRecord || qRecord.companyId !== companyId) return res.status(404).json({ error: "Not found" });

      const questions = await storage.getQuestionnaireQuestions(questionnaireId);
      if (!questions.length) return res.status(400).json({ error: "No questions found" });

      // Gather company context
      const company = await storage.getCompany(companyId);
      const policy = await storage.getPolicy(companyId);
      const latestVersion = policy ? await storage.getLatestPolicyVersion(policy.id) : null;
      const topics = await storage.getMaterialTopics(companyId);
      const allMetrics = await storage.getMetrics(companyId);
      const actions = await storage.getActionPlans(companyId);
      const carbonCalcs = await storage.getCarbonCalculations(companyId);

      // Get recent metric values
      const metricData: Record<string, any> = {};
      for (const m of allMetrics.filter(m => m.enabled)) {
        const vals = await storage.getMetricValues(m.id);
        if (vals.length > 0) {
          metricData[m.name] = { latestValue: vals[0].value, unit: m.unit, period: vals[0].period };
        }
      }

      const context = buildCompanyContext(company, latestVersion?.content, topics, metricData, actions, carbonCalcs);

      const updatedQuestions = [];
      for (const q of questions) {
        const sanitizedText = sanitizeQuestionText(q.questionText);
        const ruleResult = matchQuestionByRules(sanitizedText, context);
        let suggestedAnswer = ruleResult.answer;
        let confidence = ruleResult.confidence;
        let sourceRef = ruleResult.source;
        let rationale: string | null = null;
        let sourceData: string[] | null = null;
        let category = categorizeQuestion(sanitizedText);

        if (confidence === "low" || !suggestedAnswer) {
          try {
            const aiResult = await generateAIAnswer(openai, sanitizedText, context);
            suggestedAnswer = aiResult.suggestedAnswer || aiResult.answer;
            confidence = aiResult.confidence || "medium";
            sourceRef = aiResult.source || sourceRef;
            rationale = aiResult.rationale || null;
            sourceData = aiResult.sourceDataUsed || null;
          } catch {
            suggestedAnswer = "Insufficient data available to generate a reliable answer for this question.";
            confidence = "low";
            sourceRef = "No source found";
            rationale = "Insufficient company data available in the system to provide a reliable answer.";
            sourceData = [];
          }
        }

        const updated = await storage.updateQuestionnaireQuestion(q.id, {
          category,
          suggestedAnswer,
          confidence: confidence as any,
          sourceRef,
          rationale,
          sourceData: sourceData as any,
          workflowStatus: "draft",
        });
        updatedQuestions.push(updated);
      }

      await storage.updateQuestionnaire(questionnaireId, { status: "in_progress" });

      await storage.createAiGenerationLog({
        companyId,
        featureType: "questionnaire_autofill",
        modelName: "gpt-5.2",
        promptVersion: "v1",
        generatedBy: userId,
        sourceDataSummary: { questionCount: questions.length },
        promptText: "<autofill system prompt>",
        outputSummary: questions.length + " questions autofilled",
        entityId: questionnaireId,
        entityType: "questionnaire",
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "Questionnaire autofill completed",
        entityType: "questionnaire",
        entityId: questionnaireId,
        details: { questionCount: questions.length },
      });

      res.json({ questions: updatedQuestions });
    } catch (e: any) {
      console.error("Autofill error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/questionnaires/:qId/questions/:id", requireAuth, requirePermission("questionnaire_access"), async (req, res) => {
    try {
      const updated = await storage.updateQuestionnaireQuestion(req.params.id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/questionnaires/:id", requireAuth, requirePermission("questionnaire_access"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const q = await storage.getQuestionnaire(req.params.id);
      if (!q || q.companyId !== companyId) return res.status(404).json({ error: "Not found" });
      await storage.deleteQuestionnaire(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== POLICY TEMPLATES MODULE =====
  await seedPolicyTemplates();

  app.get("/api/policy-templates", requireAuth, async (_req, res) => {
    const templates = await storage.getPolicyTemplates();
    res.json(templates);
  });

  app.get("/api/policy-templates/:slug", requireAuth, async (req, res) => {
    const template = await storage.getPolicyTemplate(req.params.slug);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  });

  app.post("/api/policy-templates/:slug/generate", requireAuth, requirePermission("policy_editing"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { answers } = req.body;

      const template = await storage.getPolicyTemplate(req.params.slug);
      if (!template) return res.status(404).json({ error: "Template not found" });
      if (template.enabled === false) return res.status(400).json({ error: "This template has been deactivated by your administrator" });

      const prompt = buildTemplatePrompt(template, answers);
      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: TEMPLATE_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 6000,
        response_format: { type: "json_object" },
      });

      const generatedText = completion.choices[0]?.message?.content || "{}";
      let content: Record<string, string>;
      try {
        content = JSON.parse(generatedText);
      } catch {
        content = { rawText: generatedText };
      }

      const tone = answers.tone?.includes("Audit") ? "audit_ready" as const : "simple_sme" as const;
      const slug = req.params.slug;
      const generatedPolicy = await storage.createGeneratedPolicy({
        companyId,
        templateId: template.id,
        templateSlug: template.slug,
        title: `${answers.companyName || "Company"} — ${template.name}`,
        content,
        questionnaireAnswers: answers,
        policyOwner: answers.policyOwner || null,
        approver: answers.approver || null,
        reviewDate: null,
        versionNumber: 1,
        tone,
        workflowStatus: "draft",
      });

      await storage.createAiGenerationLog({
        companyId,
        featureType: "policy_template",
        modelName: "gpt-5.2",
        promptVersion: "v1",
        generatedBy: userId,
        sourceDataSummary: { templateSlug: slug, answers: req.body.answers },
        promptText: "<template generation prompt>",
        outputSummary: "Policy template generated: " + template.name,
        entityId: generatedPolicy.id,
        entityType: "generated_policy",
      });

      await storage.createAuditLog({
        companyId, userId,
        action: `Policy generated: ${template.name}`,
        entityType: "generated_policy",
        entityId: generatedPolicy.id,
        details: { templateSlug: template.slug, tone },
      });

      res.json(generatedPolicy);
    } catch (e: any) {
      console.error("Template generation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/generated-policies", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const policies = await storage.getGeneratedPolicies(companyId);
    res.json(policies);
  });

  app.get("/api/generated-policies/:id", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const policy = await storage.getGeneratedPolicy(req.params.id);
    if (!policy || policy.companyId !== companyId) return res.status(404).json({ error: "Not found" });
    res.json(policy);
  });

  app.put("/api/generated-policies/:id", requireAuth, requirePermission("policy_editing"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const policy = await storage.getGeneratedPolicy(req.params.id);
      if (!policy || policy.companyId !== companyId) return res.status(404).json({ error: "Not found" });

      const updated = await storage.updateGeneratedPolicy(req.params.id, req.body);

      await storage.createAuditLog({
        companyId, userId,
        action: `Policy updated: ${policy.title}`,
        entityType: "generated_policy",
        entityId: policy.id,
        details: { status: req.body.status },
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/generated-policies/:id", requireAuth, requirePermission("policy_editing"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const policy = await storage.getGeneratedPolicy(req.params.id);
      if (!policy || policy.companyId !== companyId) return res.status(404).json({ error: "Not found" });
      await storage.deleteGeneratedPolicy(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/policy-templates/:slug/admin", requireAuth, requirePermission("template_admin"), async (req, res) => {
    try {
      const updated = await storage.updatePolicyTemplate(req.params.slug, req.body);
      if (!updated) return res.status(404).json({ error: "Template not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/emission-factor-sets", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const factors = await db.select({
        factorYear: emissionFactorsTable.factorYear,
        sourceLabel: emissionFactorsTable.sourceLabel,
      }).from(emissionFactorsTable);
      const setMap = new Map<string, { key: string; label: string; year: number; count: number }>();
      for (const f of factors) {
        const key = `UK_DEFRA_${f.factorYear}`;
        if (!setMap.has(key)) {
          setMap.set(key, { key, label: f.sourceLabel || `DEFRA ${f.factorYear}`, year: f.factorYear || 2024, count: 0 });
        }
        setMap.get(key)!.count++;
      }
      res.json(Array.from(setMap.values()));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/users", requireAuth, requirePermission("user_management"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const users = await storage.getUsersByCompany(companyId);
      const sanitized = users.map(({ password, ...rest }) => rest);
      res.json(sanitized);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/users/:id/role", requireAuth, requirePermission("user_management"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { role } = req.body;
      const validRoles = ["admin", "contributor", "approver", "viewer"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be one of: admin, contributor, approver, viewer" });
      }
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser || targetUser.companyId !== companyId) {
        return res.status(404).json({ error: "User not found" });
      }
      const previousRole = targetUser.role;
      const updated = await storage.updateUser(req.params.id, { role });
      await storage.createAuditLog({
        companyId,
        userId,
        action: "User role changed",
        entityType: "user",
        entityId: req.params.id,
        details: { previousRole, newRole: role, targetUsername: targetUser.username },
      });
      if (updated) {
        const { password, ...sanitized } = updated;
        res.json(sanitized);
      } else {
        res.status(500).json({ error: "Failed to update user role" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== WORKFLOW ROUTES =====
  app.post("/api/workflow/submit", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      if (!user || !["admin", "contributor", "editor"].includes(user.role)) {
        return res.status(403).json({ error: "Only contributors and admins can submit" });
      }
      const { entityType, entityIds } = req.body;
      const validTypes: Record<string, string> = {
        metric_value: "metric_values",
        raw_data: "raw_data_inputs",
        report: "report_runs",
        generated_policy: "generated_policies",
        questionnaire_question: "questionnaire_questions",
      };
      if (!validTypes[entityType]) {
        return res.status(400).json({ error: "Invalid entityType. Must be one of: metric_value, raw_data, report, generated_policy, questionnaire_question" });
      }
      if (!Array.isArray(entityIds) || entityIds.length === 0) {
        return res.status(400).json({ error: "entityIds must be a non-empty array" });
      }
      const table = validTypes[entityType];
      for (const id of entityIds) {
        await storage.updateWorkflowStatus(table, id, "submitted", userId, undefined, companyId);
      }
      await storage.createAuditLog({
        companyId, userId,
        action: `Workflow submitted: ${entityType}`,
        entityType,
        entityId: entityIds.join(","),
        details: { entityIds, entityType },
      });
      res.json({ ok: true, submitted: entityIds.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/workflow/review", requireAuth, requirePermission("report_generation"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { entityType, entityId, action, comment } = req.body;
      const validTypes: Record<string, string> = {
        metric_value: "metric_values",
        raw_data: "raw_data_inputs",
        report: "report_runs",
        generated_policy: "generated_policies",
        questionnaire_question: "questionnaire_questions",
      };
      if (!validTypes[entityType]) {
        return res.status(400).json({ error: "Invalid entityType" });
      }
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
      }
      const status = action === "approve" ? "approved" : "rejected";
      const table = validTypes[entityType];
      await storage.updateWorkflowStatus(table, entityId, status, userId, comment, companyId);
      await storage.createAuditLog({
        companyId, userId,
        action: `Workflow ${action}d: ${entityType}`,
        entityType,
        entityId,
        details: { action, comment, entityType },
      });
      res.json({ ok: true, status });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/workflow/bulk-review", requireAuth, requirePermission("report_generation"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { items, action, comment } = req.body;
      const validTypes: Record<string, string> = {
        metric_value: "metric_values",
        raw_data: "raw_data_inputs",
        report: "report_runs",
        generated_policy: "generated_policies",
        questionnaire_question: "questionnaire_questions",
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items array is required" });
      }
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
      }
      if (action === "reject" && (!comment || !comment.trim())) {
        return res.status(400).json({ error: "Comment is required for rejection" });
      }
      const status = action === "approve" ? "approved" : "rejected";
      let succeeded = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const item of items) {
        const table = validTypes[item.entityType];
        if (!table) {
          failed++;
          errors.push(`Invalid entityType: ${item.entityType}`);
          continue;
        }
        try {
          await storage.updateWorkflowStatus(table, item.entityId, status, userId, comment, companyId);
          await storage.createAuditLog({
            companyId, userId,
            action: `Bulk workflow ${action}d: ${item.entityType}`,
            entityType: item.entityType,
            entityId: item.entityId,
            details: { action, comment, entityType: item.entityType, bulk: true },
          });
          succeeded++;
        } catch (e: any) {
          failed++;
          errors.push(`${item.entityType}:${item.entityId} - ${e.message}`);
        }
      }
      res.json({ succeeded, failed, errors });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/workflow/pending", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const pending = await storage.getWorkflowPendingItems(companyId);
      res.json(pending);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/my-tasks", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const tasks = await storage.getUserTasks(userId, companyId);
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/my-approvals", requireAuth, requirePermission("report_generation"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const approvals = await storage.getUserApprovals(companyId);
      res.json(approvals);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/assign/:entityType/:entityId", requireAuth, requirePermission("user_management"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { entityType, entityId } = req.params;
      const { assignedUserId } = req.body;
      const validTypes = ["metrics", "raw_data_inputs", "action_plans", "esg_policies", "questionnaires", "evidence_files"];
      if (!validTypes.includes(entityType)) {
        return res.status(400).json({ error: "Invalid entityType" });
      }
      await storage.assignOwner(entityType, entityId, assignedUserId || "", companyId);
      await storage.createAuditLog({
        companyId, userId,
        action: "owner_assigned",
        entityType,
        entityId,
        details: { assignedUserId, performedBy: userId },
      });
      res.json({ ok: true });
    } catch (e: any) {
      if (e.message === "Entity not found" || e.message === "User not in company") {
        return res.status(404).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/assign/bulk", requireAuth, requirePermission("user_management"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { entityType, entityIds, assignedUserId } = req.body;
      const validTypes = ["metrics", "raw_data_inputs", "action_plans", "esg_policies", "questionnaires", "evidence_files"];
      if (!validTypes.includes(entityType) || !Array.isArray(entityIds) || !assignedUserId) {
        return res.status(400).json({ error: "entityType, entityIds (array), and assignedUserId are required" });
      }
      let succeeded = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const entityId of entityIds) {
        try {
          await storage.assignOwner(entityType, entityId, assignedUserId, companyId);
          await storage.createAuditLog({
            companyId, userId,
            action: "owner_assigned",
            entityType,
            entityId,
            details: { assignedUserId, performedBy: userId, bulk: true },
          });
          succeeded++;
        } catch (e: any) {
          failed++;
          errors.push(`${entityId}: ${e.message}`);
        }
      }
      res.json({ succeeded, failed, errors });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/evidence-requests", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const requests = await storage.getEvidenceRequests(companyId);
      res.json(requests);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/evidence-requests/mine", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const requests = await storage.getEvidenceRequestsByUser(userId, companyId);
      res.json(requests);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/evidence-requests", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { assignedUserId, linkedModule, linkedEntityId, description, dueDate } = req.body;
      if (!assignedUserId || !description) {
        return res.status(400).json({ error: "assignedUserId and description are required" });
      }
      const [targetUser] = await db.select().from(users).where(and(eq(users.id, assignedUserId), eq(users.companyId, companyId)));
      if (!targetUser) {
        return res.status(400).json({ error: "Assigned user not found in company" });
      }
      const request = await storage.createEvidenceRequest({
        companyId, requestedByUserId: userId, assignedUserId,
        linkedModule: linkedModule || null, linkedEntityId: linkedEntityId || null,
        description, dueDate: dueDate ? new Date(dueDate) : null,
      });
      await storage.createAuditLog({
        companyId, userId,
        action: "evidence_request_created",
        entityType: "evidence_request",
        entityId: request.id,
        details: { assignedUserId, linkedModule, description, dueDate },
      });
      res.status(201).json(request);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/evidence-requests/:id", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "admin";
      const existing = await storage.getEvidenceRequests(companyId);
      const current = existing.find(r => r.id === req.params.id);
      if (!current) return res.status(404).json({ error: "Evidence request not found" });
      if (!isAdmin && current.assignedUserId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this request" });
      }
      const allowedFields = isAdmin
        ? ["status", "description", "dueDate", "assignedUserId", "linkedModule", "linkedEntityId"]
        : ["status"];
      const data: any = {};
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) data[f] = req.body[f];
      }
      if (!isAdmin && data.status && !["uploaded"].includes(data.status)) {
        return res.status(403).json({ error: "Only admins can change status to " + data.status });
      }
      const result = await storage.updateEvidenceRequest(req.params.id, companyId, data);
      if (!result) return res.status(404).json({ error: "Evidence request not found" });
      if (data.status && data.status !== current.status) {
        await storage.createAuditLog({
          companyId, userId,
          action: "evidence_request_status_changed",
          entityType: "evidence_request",
          entityId: req.params.id,
          details: { previousStatus: current.status, newStatus: data.status, updatedBy: userId },
        });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/evidence-requests/:id/link", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      const { evidenceFileId } = req.body;
      if (!evidenceFileId) return res.status(400).json({ error: "evidenceFileId required" });
      const requests = await storage.getEvidenceRequests(companyId);
      const request = requests.find(r => r.id === req.params.id);
      if (!request) return res.status(404).json({ error: "Evidence request not found" });
      if (request.assignedUserId !== userId && user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized to link evidence to this request" });
      }
      const result = await storage.linkEvidenceToRequest(req.params.id, evidenceFileId, companyId);
      await storage.createAuditLog({
        companyId, userId,
        action: "evidence_linked_to_request",
        entityType: "evidence_request",
        entityId: req.params.id,
        details: { evidenceFileId, linkedBy: userId },
      });
      res.json(result);
    } catch (e: any) {
      if (e.message === "Evidence file not found") return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/reporting-periods", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const periods = await storage.getReportingPeriods(companyId);
      res.json(periods);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/reporting-periods", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { name, periodType, startDate, endDate } = req.body;
      if (!name || !periodType || !startDate || !endDate) {
        return res.status(400).json({ error: "name, periodType, startDate, endDate are required" });
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start >= end) {
        return res.status(400).json({ error: "startDate must be before endDate" });
      }
      const period = await storage.createReportingPeriod({
        companyId, name, periodType, startDate: start, endDate: end,
      });
      await storage.createAuditLog({
        companyId, userId,
        action: "reporting_period_created",
        entityType: "reporting_period",
        entityId: period.id,
        details: { name, periodType, startDate, endDate },
      });
      res.status(201).json(period);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/reporting-periods/:id/close", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const result = await storage.closeReportingPeriod(req.params.id, companyId);
      if (!result) return res.status(404).json({ error: "Period not found" });
      await storage.createAuditLog({
        companyId, userId,
        action: "reporting_period_closed",
        entityType: "reporting_period",
        entityId: req.params.id,
        details: { periodName: result.name, closedBy: userId },
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/reporting-periods/:id/lock", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const result = await storage.lockReportingPeriod(req.params.id, companyId);
      if (!result) return res.status(404).json({ error: "Period not found" });
      await storage.createAuditLog({
        companyId, userId,
        action: "reporting_period_locked",
        entityType: "reporting_period",
        entityId: req.params.id,
        details: { periodName: result.name, lockedBy: userId },
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/reporting-periods/:id/copy-forward", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { name, periodType, startDate, endDate } = req.body;
      if (!name || !periodType || !startDate || !endDate) {
        return res.status(400).json({ error: "name, periodType, startDate, endDate are required" });
      }
      if (new Date(startDate) >= new Date(endDate)) {
        return res.status(400).json({ error: "startDate must be before endDate" });
      }
      const result = await storage.copyForwardPeriod(req.params.id, companyId, {
        companyId, name, periodType,
        startDate: new Date(startDate), endDate: new Date(endDate),
      });
      await storage.createAuditLog({
        companyId, userId,
        action: "reporting_period_copied",
        entityType: "reporting_period",
        entityId: result.period.id,
        details: { sourcePeriodId: req.params.id, newPeriodId: result.period.id, copiedMetrics: result.copiedMetrics, copiedActions: result.copiedActions },
      });
      res.status(201).json(result);
    } catch (e: any) {
      if (e.message === "Source period not found") return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/reporting-periods/compare", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const current = req.query.current as string;
      const compare = req.query.compare as string;
      if (!current || !compare) {
        return res.status(400).json({ error: "current and compare query params are required" });
      }
      const comparison = await storage.getPeriodComparison(companyId, current, compare);
      res.json(comparison);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/ai-logs/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const logs = await storage.getAiGenerationLogs(companyId, req.params.entityType, req.params.entityId);
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/evidence", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const files = await storage.getEvidenceFiles(companyId);
      res.json(files);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/evidence/coverage", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const period = req.query.period as string | undefined;
      const coverage = await storage.getEvidenceCoverage(companyId, period);
      res.json(coverage);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/evidence/entity/:module/:entityId", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const files = await storage.getEvidenceByEntity(companyId, req.params.module, req.params.entityId);
      res.json(files);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/evidence", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { filename, fileUrl, fileType, description, linkedModule, linkedEntityId, linkedPeriod, expiryDate } = req.body;
      if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
      }
      const validModules = ["metric_value", "raw_data", "policy", "questionnaire_answer", "report"];
      if (linkedModule && !validModules.includes(linkedModule)) {
        return res.status(400).json({ error: "Invalid linkedModule" });
      }
      const file = await storage.createEvidenceFile({
        companyId,
        filename,
        fileUrl: fileUrl || null,
        fileType: fileType || null,
        description: description || null,
        linkedModule: linkedModule || null,
        linkedEntityId: linkedEntityId || null,
        linkedPeriod: linkedPeriod || null,
        evidenceStatus: "uploaded",
        reviewDate: null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        uploadedBy: userId,
      });

      if (linkedModule === "metric_value" && linkedEntityId) {
        await storage.updateMetricValue(linkedEntityId, { dataSourceType: "evidenced" } as any);
      }
      if (linkedModule === "raw_data" && linkedEntityId) {
        await storage.updateRawDataInput(linkedEntityId, { dataSourceType: "evidenced" } as any);
      }
      if (linkedModule === "questionnaire_answer" && linkedEntityId) {
        await storage.updateQuestionnaireQuestion(linkedEntityId, { dataSourceType: "evidenced" } as any);
      }

      await storage.createAuditLog({
        companyId,
        userId,
        action: "Evidence uploaded",
        entityType: linkedModule || "evidence",
        entityId: file.id,
        details: { filename, linkedModule, linkedEntityId, linkedPeriod },
      });
      res.json(file);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/evidence/:id", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const allFiles = await storage.getEvidenceFiles(companyId);
      const owned = allFiles.find(f => f.id === req.params.id);
      if (!owned) return res.status(404).json({ error: "Evidence not found" });
      const { description, evidenceStatus, expiryDate, reviewDate } = req.body;
      const updates: any = {};
      if (description !== undefined) updates.description = description;
      if (expiryDate !== undefined) updates.expiryDate = expiryDate ? new Date(expiryDate) : null;
      if (reviewDate !== undefined) updates.reviewDate = reviewDate ? new Date(reviewDate) : null;
      if (evidenceStatus) {
        const validStatuses = ["uploaded", "reviewed", "approved", "expired"];
        if (!validStatuses.includes(evidenceStatus)) {
          return res.status(400).json({ error: "Invalid evidence status" });
        }
        updates.evidenceStatus = evidenceStatus;
        if (evidenceStatus === "reviewed" || evidenceStatus === "approved") {
          updates.reviewedBy = userId;
          updates.reviewedAt = new Date();
        }
      }
      const file = await storage.updateEvidenceFile(req.params.id, updates);
      if (!file) return res.status(404).json({ error: "Evidence not found" });
      res.json(file);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/evidence/:id", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const allFiles = await storage.getEvidenceFiles(companyId);
      const owned = allFiles.find(f => f.id === req.params.id);
      if (!owned) return res.status(404).json({ error: "Evidence not found" });
      await storage.deleteEvidenceFile(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/data-quality", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const allMetrics = await storage.getMetrics(companyId);
      const enabledMetrics = allMetrics.filter(m => m.enabled);

      const evidenceFiles = await storage.getEvidenceFiles(companyId);
      const evidencedMetricValueIds = new Set(
        evidenceFiles.filter(e => e.linkedModule === "metric_value" && e.linkedEntityId).map(e => e.linkedEntityId)
      );

      const perMetric: any[] = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      for (const metric of enabledMetrics) {
        const values = await storage.getMetricValues(metric.id);
        const latestVal = values.length > 0 ? values.sort((a, b) => b.period.localeCompare(a.period))[0] : null;

        let score = 0;

        const hasValue = latestVal && latestVal.value !== null;
        if (hasValue) score += 30;

        const hasEvidence = hasValue && (
          evidencedMetricValueIds.has(latestVal!.id) ||
          latestVal!.dataSourceType === "evidenced"
        );
        if (hasEvidence) score += 20;

        const isApproved = latestVal?.workflowStatus === "approved";
        if (isApproved) score += 20;

        const isActual = latestVal?.dataSourceType !== "estimated";
        if (hasValue && isActual) score += 15;

        const hasNotes = latestVal?.notes && latestVal.notes.trim().length > 0;
        if (hasNotes) score += 15;

        const metricWeight = Number(metric.weight || 1);
        totalWeightedScore += score * metricWeight;
        totalWeight += metricWeight;

        perMetric.push({
          metricId: metric.id,
          metricName: metric.name,
          category: metric.category,
          score,
          hasValue: !!hasValue,
          hasEvidence: !!hasEvidence,
          isApproved: !!isApproved,
          isActual: hasValue ? isActual : false,
          hasNotes: !!hasNotes,
        });
      }

      const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

      const categoryScores: Record<string, { score: number; count: number }> = {};
      for (const pm of perMetric) {
        if (!categoryScores[pm.category]) categoryScores[pm.category] = { score: 0, count: 0 };
        categoryScores[pm.category].score += pm.score;
        categoryScores[pm.category].count++;
      }
      const categoryBreakdown: Record<string, number> = {};
      for (const [cat, data] of Object.entries(categoryScores)) {
        categoryBreakdown[cat] = data.count > 0 ? Math.round(data.score / data.count) : 0;
      }

      res.json({
        overallScore,
        totalMetrics: enabledMetrics.length,
        perMetric,
        categoryBreakdown,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/compliance/frameworks", requireAuth, async (req, res) => {
    try {
      const rows = await db.execute(sql`SELECT * FROM compliance_frameworks WHERE is_active = true ORDER BY name`);
      res.json(rows.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/compliance/requirements/:frameworkId", requireAuth, async (req, res) => {
    try {
      const rows = await db.execute(
        sql`SELECT * FROM compliance_requirements WHERE framework_id = ${req.params.frameworkId} ORDER BY code`
      );
      res.json(rows.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/compliance/status", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const frameworks = await db.execute(sql`SELECT * FROM compliance_frameworks WHERE is_active = true`);
      const requirements = await db.execute(sql`SELECT * FROM compliance_requirements`);
      const metricsResult = await db.execute(
        sql`SELECT name, id, enabled FROM metrics WHERE company_id = ${companyId}`
      );
      const metricNames = new Set(metricsResult.rows.filter((m: any) => m.enabled).map((m: any) => m.name));
      const latestPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      const valuesResult = await db.execute(
        sql`SELECT DISTINCT met.name FROM metric_values mv JOIN metrics met ON mv.metric_id = met.id WHERE met.company_id = ${companyId} AND mv.period = ${latestPeriod} AND mv.value IS NOT NULL`
      );
      const metricsWithData = new Set(valuesResult.rows.map((r: any) => r.name));
      const evidenceResult = await db.execute(
        sql`SELECT DISTINCT linked_module FROM evidence_files WHERE company_id = ${companyId}`
      );
      const hasEvidence = evidenceResult.rows.length > 0;

      const frameworkStatus = frameworks.rows.map((fw: any) => {
        const reqs = requirements.rows.filter((r: any) => r.framework_id === fw.id);
        let met = 0;
        const reqDetails = reqs.map((r: any) => {
          const linkedMetrics = r.linked_metric_ids || [];
          const hasLinkedMetrics = linkedMetrics.length > 0;
          const metricsHaveData = hasLinkedMetrics && linkedMetrics.some((name: string) => metricsWithData.has(name));
          const isMet = !hasLinkedMetrics ? false : metricsHaveData;
          if (isMet) met++;
          return {
            id: r.id, code: r.code, title: r.title, description: r.description,
            category: r.category, linkedMetricIds: linkedMetrics,
            linkedPolicySection: r.linked_policy_section,
            isMet, hasData: metricsHaveData, hasLinkedMetrics,
          };
        });
        return {
          id: fw.id, name: fw.name, description: fw.description, version: fw.version,
          totalRequirements: reqs.length, metRequirements: met,
          compliancePercent: reqs.length > 0 ? Math.round((met / reqs.length) * 100) : 0,
          requirements: reqDetails,
        };
      });

      res.json(frameworkStatus);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/control-centre", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      const allMetrics = await storage.getMetrics(companyId);
      const enabledMetrics = allMetrics.filter((m: any) => m.enabled);
      const values = await storage.getMetricValuesByPeriod(companyId, currentPeriod);
      const valueMap = new Map(values.map((v: any) => [v.metricId, v]));

      const missingData = enabledMetrics
        .filter((m: any) => !valueMap.has(m.id))
        .map((m: any) => ({ id: m.id, name: m.name, category: m.category, owner: m.dataOwner, linkUrl: "/data-entry" }));

      const dqResult = await db.execute(
        sql`SELECT metric_id, value, notes, workflow_status, data_source_type FROM metric_values mv JOIN metrics met ON mv.metric_id = met.id WHERE met.company_id = ${companyId} AND mv.period = ${currentPeriod}`
      );
      const evidenceFiles = await storage.getEvidenceFiles(companyId);
      const evidenceLinkedIds = new Set(evidenceFiles.filter((e: any) => e.linkedModule === "metric_value").map((e: any) => e.linkedEntityId));
      const lowQuality = enabledMetrics.map((m: any) => {
        const val = valueMap.get(m.id);
        if (!val) return null;
        let score = 0;
        if (val.value != null) score += 30;
        if (evidenceLinkedIds.has(val.id) || val.dataSourceType === "evidenced") score += 20;
        if (val.workflowStatus === "approved") score += 20;
        if (val.value != null && val.dataSourceType !== "estimated") score += 15;
        if (val.notes) score += 15;
        return score < 40 ? { id: m.id, name: m.name, category: m.category, score, owner: m.dataOwner, linkUrl: "/data-entry" } : null;
      }).filter(Boolean);

      const expiredEvidence = evidenceFiles
        .filter((e: any) => e.expiryDate && new Date(e.expiryDate) < new Date())
        .map((e: any) => ({ id: e.id, name: e.filename, expiryDate: e.expiryDate, linkedModule: e.linkedModule, linkUrl: "/evidence" }));

      const actions = await storage.getActionPlans(companyId);
      const overdueActions = actions
        .filter((a: any) => a.status !== "complete" && a.dueDate && new Date(a.dueDate) < new Date())
        .map((a: any) => ({ id: a.id, name: a.title, dueDate: a.dueDate, owner: a.assignedUserId, linkUrl: "/actions" }));

      const pendingApprovals: any[] = [];
      values.filter((v: any) => v.workflowStatus === "submitted").forEach((v: any) => {
        const m = enabledMetrics.find((met: any) => met.id === v.metricId);
        pendingApprovals.push({ id: v.id, name: m?.name || "Metric", entityType: "metric_value", period: v.period, linkUrl: "/my-approvals" });
      });
      const reports = await storage.getReportRuns(companyId);
      reports.filter((r: any) => r.workflowStatus === "submitted").forEach((r: any) => {
        pendingApprovals.push({ id: r.id, name: `Report — ${r.period}`, entityType: "report", linkUrl: "/my-approvals" });
      });

      const genPolicies = await storage.getGeneratedPolicies(companyId);
      const unapprovedPolicies = genPolicies
        .filter((p: any) => p.workflowStatus !== "approved")
        .map((p: any) => ({ id: p.id, name: p.templateId || "Policy", status: p.workflowStatus, linkUrl: "/policy-templates" }));

      let unmetCompliance: any[] = [];
      try {
        const fws = await db.execute(sql`SELECT * FROM compliance_frameworks WHERE is_active = true`);
        const reqs = await db.execute(sql`SELECT * FROM compliance_requirements`);
        const metricNamesWithData = new Set(values.filter((v: any) => v.value != null).map((v: any) => {
          const m = enabledMetrics.find((met: any) => met.id === v.metricId);
          return m?.name;
        }).filter(Boolean));
        reqs.rows.forEach((r: any) => {
          const linked = r.linked_metric_ids || [];
          const isMet = linked.length > 0 && linked.some((name: string) => metricNamesWithData.has(name));
          if (!isMet) {
            const fw = fws.rows.find((f: any) => f.id === r.framework_id);
            unmetCompliance.push({ id: r.id, code: r.code, title: r.title, framework: fw?.name || "", linkUrl: "/compliance" });
          }
        });
      } catch {}

      const weights = { missingData: 3, lowQuality: 2, expiredEvidence: 2, overdueActions: 3, pendingApprovals: 1, unapprovedPolicies: 1, unmetCompliance: 2 };
      const maxScore = enabledMetrics.length * weights.missingData + enabledMetrics.length * weights.lowQuality + 10 * weights.expiredEvidence + 10 * weights.overdueActions + 10 * weights.pendingApprovals + 5 * weights.unapprovedPolicies + 24 * weights.unmetCompliance;
      const rawGap = missingData.length * weights.missingData + lowQuality.length * weights.lowQuality + expiredEvidence.length * weights.expiredEvidence + overdueActions.length * weights.overdueActions + pendingApprovals.length * weights.pendingApprovals + unapprovedPolicies.length * weights.unapprovedPolicies + unmetCompliance.length * weights.unmetCompliance;
      const gapScore = maxScore > 0 ? Math.round(Math.min(100, (rawGap / maxScore) * 100)) : 0;

      res.json({
        missingData, lowQuality, expiredEvidence, overdueActions,
        pendingApprovals, unapprovedPolicies, unmetCompliance,
        gapScore,
        summary: {
          missingData: missingData.length, lowQuality: lowQuality.length,
          expiredEvidence: expiredEvidence.length, overdueActions: overdueActions.length,
          pendingApprovals: pendingApprovals.length, unapprovedPolicies: unapprovedPolicies.length,
          unmetCompliance: unmetCompliance.length,
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/procurement-answers", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const rows = await db.execute(
        sql`SELECT * FROM procurement_answers WHERE company_id = ${companyId} ORDER BY created_at DESC`
      );
      const evidenceFiles = await storage.getEvidenceFiles(companyId);
      const values = await storage.getMetricValuesByPeriod(companyId,
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
      );

      const answers = rows.rows.map((a: any) => {
        let needsReview = false;
        const reasons: string[] = [];
        if (a.status === "approved" && a.approved_at) {
          const approvedAt = new Date(a.approved_at);
          if (a.linked_metric_ids?.length) {
            const linkedIds = new Set(a.linked_metric_ids);
            const changedMetrics = values.filter((v: any) => {
              if (!linkedIds.has(v.metricId)) return false;
              const met = v.updatedAt ? new Date(v.updatedAt) : null;
              return met && met > approvedAt;
            });
            if (changedMetrics.length > 0) { needsReview = true; reasons.push("Linked metric data updated"); }
          }
          if (a.linked_evidence_ids?.length) {
            const expiredEvidence = evidenceFiles.filter((e: any) =>
              a.linked_evidence_ids.includes(e.id) && e.expiryDate && new Date(e.expiryDate) < new Date()
            );
            if (expiredEvidence.length > 0) { needsReview = true; reasons.push("Linked evidence expired"); }
          }
        }
        return { ...a, needsReview, reviewReasons: reasons };
      });

      res.json(answers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/procurement-answers", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const { question, answer, category, linkedMetricIds, linkedPolicySection, linkedEvidenceIds, linkedComplianceReqIds, status } = req.body;
      if (!question || !answer) { res.status(400).json({ error: "Question and answer required" }); return; }
      const result = await db.execute(
        sql`INSERT INTO procurement_answers (company_id, question, answer, category, linked_metric_ids, linked_policy_section, linked_evidence_ids, linked_compliance_req_ids, status)
            VALUES (${companyId}, ${question}, ${answer}, ${category || null}, ${linkedMetricIds || null}, ${linkedPolicySection || null}, ${linkedEvidenceIds || null}, ${linkedComplianceReqIds || null}, ${status || "draft"})
            RETURNING *`
      );
      await storage.createAuditLog({ companyId, userId: (req.session as any).userId, action: "Procurement answer created", entityType: "procurement_answer", entityId: result.rows[0].id, details: { question } });
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/procurement-answers/:id", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { question, answer, category, linkedMetricIds, linkedPolicySection, linkedEvidenceIds, linkedComplianceReqIds, status } = req.body;
      const approvedFields = status === "approved" ? sql`, approved_by_user_id = ${userId}, approved_at = NOW(), last_reviewed_at = NOW()` : sql``;
      const result = await db.execute(
        sql`UPDATE procurement_answers SET question = COALESCE(${question}, question), answer = COALESCE(${answer}, answer),
            category = COALESCE(${category || null}, category), linked_metric_ids = COALESCE(${linkedMetricIds || null}, linked_metric_ids),
            linked_policy_section = COALESCE(${linkedPolicySection || null}, linked_policy_section),
            linked_evidence_ids = COALESCE(${linkedEvidenceIds || null}, linked_evidence_ids),
            linked_compliance_req_ids = COALESCE(${linkedComplianceReqIds || null}, linked_compliance_req_ids),
            status = COALESCE(${status || null}, status), flagged_reason = ${req.body.flaggedReason || null}
            ${approvedFields}
            WHERE id = ${req.params.id} AND company_id = ${companyId} RETURNING *`
      );
      if (result.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
      await storage.createAuditLog({ companyId, userId, action: "Procurement answer updated", entityType: "procurement_answer", entityId: req.params.id, details: { status } });
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/procurement-answers/:id", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      await db.execute(sql`DELETE FROM procurement_answers WHERE id = ${req.params.id} AND company_id = ${companyId}`);
      await storage.createAuditLog({ companyId, userId: (req.session as any).userId, action: "Procurement answer deleted", entityType: "procurement_answer", entityId: req.params.id, details: {} });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/evidence/suggestions", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const { metricId, policySection, complianceReqId, category } = req.query;
      const allEvidence = await storage.getEvidenceFiles(companyId);
      const valid = allEvidence.filter((e: any) => !e.expiryDate || new Date(e.expiryDate) > new Date());
      const scored = valid.map((e: any) => {
        let relevance = 0;
        const eStatus = e.evidenceStatus || e.status;
        if (metricId && (e.linkedEntityId === metricId || e.linkedModule === "metric_value")) relevance = 50;
        else if (policySection && e.linkedModule === "policy") relevance = 40;
        else if (complianceReqId && e.linkedModule === "compliance") relevance = 30;
        else if (category && e.linkedModule === category) relevance = 20;
        else if (eStatus === "approved") relevance = 10;
        if (eStatus === "approved") relevance += 5;
        return { ...e, relevance };
      });
      scored.sort((a: any, b: any) => b.relevance - a.relevance);
      res.json(scored.filter((s: any) => s.relevance > 0).slice(0, 10));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/assurance-pack", requireAuth, requirePermission("report_generation"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const auditLogs = await storage.getAuditLogs(companyId);
      const users = await storage.getUsersByCompany(companyId);
      const userMap = new Map(users.map((u: any) => [u.id, u.username]));

      const approvalHistory = auditLogs
        .filter((l: any) => ["approved", "rejected", "submitted"].some(a => l.action?.toLowerCase().includes(a)))
        .map((l: any) => ({ ...l, actor: userMap.get(l.userId) || l.userId }));

      const evidenceFiles = await storage.getEvidenceFiles(companyId);
      const evidenceHistory = evidenceFiles.map((e: any) => ({
        id: e.id, fileName: e.fileName, status: e.status,
        linkedModule: e.linkedModule, linkedEntityId: e.linkedEntityId,
        uploadedAt: e.createdAt, expiryDate: e.expiryDate,
      }));

      const policy = await storage.getPolicy(companyId);
      let policyVersions: any[] = [];
      if (policy) {
        const versions = await storage.getPolicyVersions(policy.id);
        policyVersions = versions.map((v: any) => ({
          versionNumber: v.versionNumber, createdAt: v.createdAt,
          sections: v.content ? Object.keys(v.content) : [],
        }));
      }

      const allMetrics = await storage.getMetrics(companyId);
      const enabledMetrics = allMetrics.filter((m: any) => m.enabled);
      const periodSubmissions: any[] = [];
      const periods = [];
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      for (const period of periods) {
        const vals = await storage.getMetricValuesByPeriod(companyId, period);
        if (vals.length > 0) {
          periodSubmissions.push({
            period, totalValues: vals.length,
            approved: vals.filter((v: any) => v.workflowStatus === "approved").length,
            submitted: vals.filter((v: any) => v.workflowStatus === "submitted").length,
            draft: vals.filter((v: any) => v.workflowStatus === "draft").length,
          });
        }
      }

      res.json({
        generatedAt: new Date().toISOString(),
        auditLogs: auditLogs.slice(0, 200).map((l: any) => ({ ...l, actor: userMap.get(l.userId) || l.userId })),
        approvalHistory,
        evidenceHistory,
        policyVersions,
        periodSubmissions,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/demo/seed", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      await db.execute(sql`UPDATE companies SET demo_mode = true WHERE id = ${companyId}`);
      const allMetrics = await storage.getMetrics(companyId);
      const enabledMetrics = allMetrics.filter((m: any) => m.enabled).slice(0, 28);
      const now = new Date();
      const statuses = ["approved", "submitted", "draft"];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        for (const m of enabledMetrics) {
          const ws = statuses[Math.floor(Math.random() * (i < 2 ? 3 : 2))];
          const val = Math.round(Math.random() * 1000) / 10;
          try {
            await db.execute(sql`INSERT INTO metric_values (metric_id, period, value, workflow_status, data_source_type, notes) VALUES (${m.id}, ${period}, ${val}, ${ws}, ${Math.random() > 0.3 ? "manual" : "estimated"}, ${"Demo data"}) ON CONFLICT DO NOTHING`);
          } catch {}
        }
      }
      try {
        await db.execute(sql`INSERT INTO action_plans (company_id, title, status, due_date, assigned_user_id) VALUES (${companyId}, 'Implement waste sorting program', 'complete', ${new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString()}, ${userId})`);
        await db.execute(sql`INSERT INTO action_plans (company_id, title, status, due_date, assigned_user_id) VALUES (${companyId}, 'Conduct energy audit', 'in_progress', ${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()}, ${userId})`);
      } catch {}
      const demoAnswers = [
        { q: "What is your carbon reduction strategy?", a: "We target a 30% reduction in Scope 1 and 2 emissions by 2030 through energy efficiency, renewable procurement, and fleet electrification.", cat: "Environmental", st: "approved" },
        { q: "Do you have a modern slavery statement?", a: "Yes. Our Modern Slavery Statement is reviewed annually by the Board and published on our website.", cat: "Social", st: "approved" },
        { q: "How do you monitor supply chain ESG risks?", a: "We conduct annual supplier assessments covering environmental, labour, and governance criteria.", cat: "Supply Chain", st: "flagged" },
      ];
      for (const da of demoAnswers) {
        try {
          await db.execute(sql`INSERT INTO procurement_answers (company_id, question, answer, category, status) VALUES (${companyId}, ${da.q}, ${da.a}, ${da.cat}, ${da.st})`);
        } catch {}
      }
      for (let i = 0; i < 5; i++) {
        await storage.createAuditLog({ companyId, userId, action: `Demo action ${i + 1}`, entityType: "system", entityId: companyId, details: { demo: true } });
      }
      res.json({ success: true, message: "Demo data seeded" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/company/demo-status", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const result = await db.execute(sql`SELECT demo_mode FROM companies WHERE id = ${companyId}`);
      res.json({ demoMode: result.rows[0]?.demo_mode || false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/procurement-answers/:id/record-usage", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      await db.execute(sql`UPDATE procurement_answers SET usage_count = COALESCE(usage_count, 0) + 1, last_used_at = NOW() WHERE id = ${req.params.id} AND company_id = ${companyId}`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/reminders/generate", requireAuth, requirePermission("settings_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const settings = await storage.getCompanySettings(companyId);
      if (settings && !settings.reminderEnabled) { res.json({ generated: 0 }); return; }
      const generated = await generateScheduledReminders(companyId, storage, db, sql);
      res.json({ generated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  async function runDailyReminderJob() {
    try {
      const dayOfWeek = new Date().getDay();
      const result = await db.execute(sql`SELECT c.id, cs.reminder_frequency FROM companies c JOIN company_settings cs ON cs.company_id = c.id WHERE cs.reminder_enabled = true`);
      for (const row of result.rows) {
        try {
          if (row.reminder_frequency === "weekly" && dayOfWeek !== 1) continue;
          await generateScheduledReminders(row.id as string, storage, db, sql);
        } catch {}
      }
    } catch {}
  }

  setInterval(runDailyReminderJob, 24 * 60 * 60 * 1000);
  setTimeout(runDailyReminderJob, 60000);

  return httpServer;
}

async function generateScheduledReminders(companyId: string, storage: any, db: any, sql: any) {
  let count = 0;
  const now = new Date();
  const allMetrics = await storage.getMetrics(companyId);
  const enabledMetrics = allMetrics.filter((m: any) => m.enabled);
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const values = await storage.getMetricValuesByPeriod(companyId, currentPeriod);
  const valueMetricIds = new Set(values.map((v: any) => v.metricId));
  for (const m of enabledMetrics) {
    if (!valueMetricIds.has(m.id)) {
      const key = `metric_submission:${m.id}:${currentPeriod}`;
      try {
        await storage.createNotification({ companyId, type: "reminder", title: `Missing data: ${m.name}`, message: `No value submitted for ${m.name} in ${currentPeriod}`, sourceKey: key, link: "/data-entry" });
        count++;
      } catch {}
    }
  }
  const evidence = await storage.getEvidenceFiles(companyId);
  const tiers = [60, 30, 14, 7];
  for (const e of evidence) {
    if (e.expiryDate) {
      const daysUntil = Math.floor((new Date(e.expiryDate).getTime() - now.getTime()) / 86400000);
      for (const tier of tiers) {
        if (daysUntil <= tier && daysUntil > (tier === 60 ? 30 : tier === 30 ? 14 : tier === 14 ? 7 : 0)) {
          const key = `evidence_expiry:${e.id}:${tier}d`;
          try {
            await storage.createNotification({ companyId, type: "reminder", title: `Evidence expiring in ${daysUntil} days`, message: `${e.filename || e.fileName} expires ${new Date(e.expiryDate).toLocaleDateString()}`, sourceKey: key, link: "/evidence" });
            count++;
          } catch {}
          break;
        }
      }
    }
  }
  const actions = await storage.getActionPlans(companyId);
  for (const a of actions) {
    if (a.status !== "complete" && a.dueDate && new Date(a.dueDate) < now) {
      const key = `overdue_action:${a.id}:${currentPeriod}`;
      try {
        await storage.createNotification({ companyId, type: "reminder", title: `Overdue: ${a.title}`, message: `This action was due ${new Date(a.dueDate).toLocaleDateString()}`, sourceKey: key, link: "/actions" });
        count++;
      } catch {}
    }
  }
  const pendingValues = values.filter((v: any) => v.workflowStatus === "submitted");
  for (const v of pendingValues) {
    const daysSinceSubmit = v.updatedAt ? Math.floor((now.getTime() - new Date(v.updatedAt).getTime()) / 86400000) : 0;
    if (daysSinceSubmit >= 3) {
      const bucket = Math.floor(daysSinceSubmit / 3);
      const key = `pending_approval:${v.id}:bucket${bucket}`;
      try {
        const m = enabledMetrics.find((met: any) => met.id === v.metricId);
        await storage.createNotification({ companyId, type: "reminder", title: `Pending approval: ${m?.name || "Metric"}`, message: `Awaiting approval for ${daysSinceSubmit} days`, sourceKey: key, link: "/my-approvals" });
        count++;
      } catch {}
    }
  }
  return count;
}

function sanitizeQuestionText(text: string): string {
  let sanitized = text;
  const injectionPatterns = [
    /ignore previous instructions/gi,
    /forget your instructions/gi,
    /you are now/gi,
    /system:/gi,
    /assistant:/gi,
    /disregard all previous/gi,
    /override your/gi,
  ];
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "");
  }
  sanitized = sanitized.replace(/<[^>]*>/g, "");
  sanitized = sanitized.slice(0, 2000);
  return sanitized.trim();
}

// ===== HELPER FUNCTIONS =====

function buildPolicyPrompt(inputs: any): string {
  return `Generate a professional ESG policy for the following SME business. Return as a JSON object with these keys: titlePage, purposeAndScope, commitmentStatement, environmentalCommitments, socialCommitments, governanceCommitments, responsibilities, implementationAndMonitoring, reviewCycle, approvalSection.

Company Profile:
- Company Name: ${inputs.companyName || "[Company Name]"}
- Sector: ${inputs.sector || "General"}
- Country: ${inputs.country || "United Kingdom"}
- Number of Employees: ${inputs.employeeCount || "Not specified"}
- Number of Sites: ${inputs.numberOfSites || 1}
- Business Type: ${inputs.businessType || "Service business"}
- Has Vehicles: ${inputs.hasVehicles ? "Yes" : "No"}
- Has International Suppliers: ${inputs.hasInternationalSuppliers ? "Yes" : "No"}

Environmental:
- Tracks Electricity: ${inputs.trackElectricity ? "Yes" : "No"}
- Tracks Fuel/Gas: ${inputs.trackFuel ? "Yes" : "No"}
- Tracks Water: ${inputs.trackWater ? "Yes" : "No"}
- Tracks Waste/Recycling: ${inputs.trackWaste ? "Yes" : "No"}
- Carbon Reduction Commitment: ${inputs.carbonCommitment ? "Yes" : "No"}
- Environmental Certifications: ${inputs.envCertifications || "None"}

Social:
- Has Employee Handbook: ${inputs.hasHandbook ? "Yes" : "No"}
- Tracks Diversity Data: ${inputs.trackDiversity ? "Yes" : "No"}
- Provides Employee Training: ${inputs.providesTraining ? "Yes" : "No"}
- Tracks H&S Incidents: ${inputs.trackHealthSafety ? "Yes" : "No"}
- Wellbeing Initiatives: ${inputs.hasWellbeing ? "Yes" : "No"}
- Pays Living Wage: ${inputs.paysLivingWage ? "Yes" : "No"}

Governance:
- Anti-Bribery Rules: ${inputs.hasAntiBribery ? "Yes" : "No"}
- Whistleblowing Process: ${inputs.hasWhistleblowing ? "Yes" : "No"}
- Data Privacy Policy: ${inputs.hasDataPrivacy ? "Yes" : "No"}
- ESG Responsible Person: ${inputs.esgResponsible || "Not specified"}
- Review Frequency: ${inputs.reviewFrequency || "Annual"}

Write in plain English. Make it sound professional but not overly legal. Where data is missing use sensible defaults. Include "[Insert review month]" only where truly necessary. Add a footer note that the policy should be reviewed by management before formal adoption.`;
}

interface CarbonLineItem {
  key: string;
  label: string;
  scope: 1 | 2 | 3;
  activityValue: number;
  activityUnit: string;
  factor: number;
  factorUnit: string;
  factorSource: string;
  factorYear: number;
  emissions: number;
  dataQuality: "actual" | "estimated" | "proxy";
  methodology: string;
  assumptions: string[];
  fuelType?: string;
}

function calculateEmissions(inputs: any, factors: any[], dataQualityMap: Record<string, string> = {}): any {
  const findFactor = (category: string, fuelType?: string): any => {
    if (fuelType) {
      const specific = factors.find((f: any) => f.category === category && f.fuelType === fuelType);
      if (specific) return specific;
    }
    return factors.find((f: any) => f.category === category && (!f.fuelType || f.fuelType === "mixed" || f.fuelType === null)) || null;
  };
  const findFactorByName = (name: string): any => factors.find((f: any) => f.name === name) || null;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const dq = (key: string): "actual" | "estimated" | "proxy" => (dataQualityMap[key] as any) || "actual";
  const factorYear = factors[0]?.factorYear || 2024;

  const lineItems: CarbonLineItem[] = [];
  const assumptions: string[] = [];

  const elecVal = parseFloat(inputs.electricity) || 0;
  if (elecVal > 0) {
    const ef = findFactor("electricity");
    const fv = ef ? parseFloat(ef.factor) : 0.20707;
    lineItems.push({
      key: "electricity", label: "Grid Electricity", scope: 2,
      activityValue: elecVal, activityUnit: "kWh", factor: fv, factorUnit: "kgCO2e/kWh",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(elecVal * fv), dataQuality: dq("electricity"),
      methodology: ef?.methodology || "Location-based, UK national grid average.",
      assumptions: dq("electricity") === "proxy" ? ["Electricity estimated from floor area proxy"] : [],
    });
  }

  const gasVal = parseFloat(inputs.gas) || 0;
  if (gasVal > 0) {
    const ef = findFactor("gas");
    const fv = ef ? parseFloat(ef.factor) : 0.18293;
    lineItems.push({
      key: "gas", label: "Natural Gas", scope: 1,
      activityValue: gasVal, activityUnit: "kWh", factor: fv, factorUnit: "kgCO2e/kWh",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(gasVal * fv), dataQuality: dq("gas"), fuelType: "natural_gas",
      methodology: ef?.methodology || "Gross calorific value basis.",
      assumptions: [],
    });
  }

  const dieselVal = parseFloat(inputs.diesel) || 0;
  if (dieselVal > 0) {
    const ef = findFactor("fuel", "diesel") || findFactor("fuel");
    const fv = ef ? parseFloat(ef.factor) : 2.70559;
    lineItems.push({
      key: "diesel", label: "Diesel", scope: 1,
      activityValue: dieselVal, activityUnit: "litres", factor: fv, factorUnit: "kgCO2e/litre",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(dieselVal * fv), dataQuality: dq("diesel"), fuelType: "diesel",
      methodology: ef?.methodology || "Per litre of automotive diesel.",
      assumptions: [],
    });
  }

  const petrolVal = parseFloat(inputs.petrol) || 0;
  if (petrolVal > 0) {
    const ef = findFactor("fuel", "petrol") || findFactor("fuel");
    const fv = ef ? parseFloat(ef.factor) : 2.31482;
    lineItems.push({
      key: "petrol", label: "Petrol", scope: 1,
      activityValue: petrolVal, activityUnit: "litres", factor: fv, factorUnit: "kgCO2e/litre",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(petrolVal * fv), dataQuality: dq("petrol"), fuelType: "petrol",
      methodology: ef?.methodology || "Per litre of motor gasoline.",
      assumptions: [],
    });
  }

  const lpgVal = parseFloat(inputs.lpg) || 0;
  if (lpgVal > 0) {
    const ef = findFactor("fuel", "lpg") || findFactorByName("LPG");
    const fv = ef ? parseFloat(ef.factor) : 1.55537;
    lineItems.push({
      key: "lpg", label: "LPG", scope: 1,
      activityValue: lpgVal, activityUnit: "litres", factor: fv, factorUnit: "kgCO2e/litre",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(lpgVal * fv), dataQuality: dq("lpg"), fuelType: "lpg",
      methodology: ef?.methodology || "Per litre of LPG.",
      assumptions: [],
    });
  }

  const vehicleVal = parseFloat(inputs.vehicleMileage) || 0;
  const vehicleFuelType = inputs.vehicleFuelType && inputs.vehicleFuelType !== "avg" ? inputs.vehicleFuelType : null;
  if (vehicleVal > 0) {
    const ef = findFactor("vehicles", vehicleFuelType);
    const fv = ef ? parseFloat(ef.factor) : 0.27436;
    const vehicleLabel = vehicleFuelType
      ? `Company Vehicle (${vehicleFuelType.charAt(0).toUpperCase() + vehicleFuelType.slice(1)})`
      : "Company Vehicle (Average)";
    const vAssumptions: string[] = [];
    if (!vehicleFuelType) vAssumptions.push("Average fleet composition assumed (no fuel type specified)");
    lineItems.push({
      key: "vehicles", label: vehicleLabel, scope: 1,
      activityValue: vehicleVal, activityUnit: "miles", factor: fv, factorUnit: "kgCO2e/mile",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(vehicleVal * fv), dataQuality: dq("vehicleMileage"), fuelType: vehicleFuelType || "mixed",
      methodology: ef?.methodology || "Average company car per mile.",
      assumptions: vAssumptions,
    });
  }

  const travelItems: { key: string; inputKey: string; label: string; name: string; unit: string; fallback: number }[] = [
    { key: "domesticFlights", inputKey: "domesticFlights", label: "Domestic Flights", name: "Domestic Flight", unit: "passenger-km", fallback: 0.24587 },
    { key: "shortHaulFlights", inputKey: "shortHaulFlights", label: "Short-haul Flights", name: "Short-haul Flight", unit: "passenger-km", fallback: 0.15353 },
    { key: "longHaulFlights", inputKey: "longHaulFlights", label: "Long-haul Flights", name: "Long-haul Flight", unit: "passenger-km", fallback: 0.19309 },
    { key: "rail", inputKey: "railTravel", label: "Rail Travel", name: "Rail Travel", unit: "passenger-km", fallback: 0.03549 },
    { key: "hotelNights", inputKey: "hotelNights", label: "Hotel Nights", name: "Hotel Nights", unit: "nights", fallback: 10.24 },
  ];

  for (const ti of travelItems) {
    const val = parseFloat(inputs[ti.inputKey]) || 0;
    if (val > 0) {
      const ef = findFactorByName(ti.name);
      const fv = ef ? parseFloat(ef.factor) : ti.fallback;
      lineItems.push({
        key: ti.key, label: ti.label, scope: 3,
        activityValue: val, activityUnit: ti.unit, factor: fv, factorUnit: `kgCO2e/${ti.unit}`,
        factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
        emissions: r2(val * fv), dataQuality: dq(ti.inputKey),
        methodology: ef?.methodology || `Standard emission factor for ${ti.label.toLowerCase()}.`,
        assumptions: [],
      });
    }
  }

  const proxyElec = parseFloat(inputs.floorAreaM2) || 0;
  if (proxyElec > 0 && elecVal === 0) {
    const proxyFactor = 120;
    const annualKwh = proxyElec * proxyFactor;
    const ef = findFactor("electricity");
    const fv = ef ? parseFloat(ef.factor) : 0.20707;
    assumptions.push(`Electricity estimated from floor area: ${proxyElec} m2 x ${proxyFactor} kWh/m2/yr`);
    lineItems.push({
      key: "electricity", label: "Grid Electricity (Proxy)", scope: 2,
      activityValue: annualKwh, activityUnit: "kWh (estimated)", factor: fv, factorUnit: "kgCO2e/kWh",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(annualKwh * fv), dataQuality: "proxy",
      methodology: "Proxy calculation: floor area (m2) x typical energy use intensity (120 kWh/m2/yr for UK offices).",
      assumptions: [`Floor area ${proxyElec} m2`, `Energy use intensity assumed at ${proxyFactor} kWh/m2/yr`, "Based on CIBSE TM46 benchmark for general office"],
    });
  }

  const proxyGas = parseFloat(inputs.floorAreaM2) || 0;
  if (proxyGas > 0 && gasVal === 0) {
    const proxyFactor = 80;
    const annualKwh = proxyGas * proxyFactor;
    const ef = findFactor("gas");
    const fv = ef ? parseFloat(ef.factor) : 0.18293;
    assumptions.push(`Gas estimated from floor area: ${proxyGas} m2 x ${proxyFactor} kWh/m2/yr`);
    lineItems.push({
      key: "gas", label: "Natural Gas (Proxy)", scope: 1,
      activityValue: annualKwh, activityUnit: "kWh (estimated)", factor: fv, factorUnit: "kgCO2e/kWh",
      factorSource: ef?.sourceLabel || "UK DEFRA 2024", factorYear: ef?.factorYear || factorYear,
      emissions: r2(annualKwh * fv), dataQuality: "proxy", fuelType: "natural_gas",
      methodology: "Proxy calculation: floor area (m2) x typical gas use intensity (80 kWh/m2/yr for UK offices).",
      assumptions: [`Floor area ${proxyGas} m2`, `Gas use intensity assumed at ${proxyFactor} kWh/m2/yr`, "Based on CIBSE TM46 benchmark for general office"],
    });
  }

  const scope1Total = r(lineItems.filter(l => l.scope === 1).reduce((s, l) => s + l.emissions, 0));
  const scope2Total = r(lineItems.filter(l => l.scope === 2).reduce((s, l) => s + l.emissions, 0));
  const scope3Total = r(lineItems.filter(l => l.scope === 3).reduce((s, l) => s + l.emissions, 0));
  const totalEmissions = r(scope1Total + scope2Total + scope3Total);

  const breakdown: Record<string, number> = {};
  for (const li of lineItems) {
    breakdown[li.key] = (breakdown[li.key] || 0) + li.emissions;
  }

  const methodologyNotes = lineItems.map(li => ({
    source: li.label, scope: li.scope,
    calculation: `${li.activityValue.toLocaleString()} ${li.activityUnit} x ${li.factor} ${li.factorUnit} = ${li.emissions.toLocaleString()} kgCO2e`,
    methodology: li.methodology, factorSource: li.factorSource, factorYear: li.factorYear,
    dataQuality: li.dataQuality,
    ...(li.assumptions.length > 0 ? { assumptions: li.assumptions } : {}),
    ...(li.fuelType ? { fuelType: li.fuelType } : {}),
  }));

  const allAssumptions = [
    ...assumptions,
    ...lineItems.flatMap(l => l.assumptions),
  ];
  if (lineItems.some(l => l.dataQuality === "estimated")) allAssumptions.push("Some values marked as estimated and may be refined with actual data");
  if (lineItems.some(l => l.dataQuality === "proxy")) allAssumptions.push("Proxy values used where actual data was unavailable");

  const dataQuality: Record<string, string> = {};
  for (const li of lineItems) {
    dataQuality[li.key] = li.dataQuality;
  }

  return {
    scope1Total, scope2Total, scope3Total, totalEmissions,
    breakdown, lineItems: methodologyNotes,
    factorYear, dataQuality, assumptions: allAssumptions,
    unit: "kgCO2e",
  };
}

function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("carbon") || q.includes("emission") || q.includes("ghg") || q.includes("co2")) return "Carbon";
  if (q.includes("energy") || q.includes("electricity") || q.includes("fuel")) return "Environmental";
  if (q.includes("waste") || q.includes("recycl")) return "Environmental";
  if (q.includes("water")) return "Environmental";
  if (q.includes("environmental") || q.includes("pollution")) return "Environmental";
  if (q.includes("policy") || q.includes("esg policy") || q.includes("sustainability policy")) return "Policy";
  if (q.includes("training") || q.includes("development")) return "Training";
  if (q.includes("diversity") || q.includes("inclusion") || q.includes("equal")) return "Social";
  if (q.includes("health") || q.includes("safety") || q.includes("wellbeing")) return "Social";
  if (q.includes("employee") || q.includes("staff") || q.includes("workforce")) return "Social";
  if (q.includes("supplier") || q.includes("supply chain") || q.includes("procurement")) return "Supply Chain";
  if (q.includes("brib") || q.includes("corruption") || q.includes("whistleblow")) return "Governance";
  if (q.includes("privacy") || q.includes("data protection") || q.includes("gdpr")) return "Data Privacy";
  if (q.includes("governance") || q.includes("board") || q.includes("oversight")) return "Governance";
  return "General";
}

function buildCompanyContext(company: any, policyContent: any, topics: any[], metricData: Record<string, any>, actions: any[], carbonCalcs: any[]): string {
  let ctx = `Company: ${company?.name || "Unknown"}\nSector: ${company?.industry || "General"}\nCountry: ${company?.country || "UK"}\nEmployees: ${company?.employeeCount || "Unknown"}\n`;

  if (policyContent) {
    ctx += `\nESG Policy Content:\n`;
    if (typeof policyContent === "object") {
      for (const [key, val] of Object.entries(policyContent)) {
        ctx += `- ${key}: ${val}\n`;
      }
    }
  }

  const selectedTopics = topics.filter(t => t.selected);
  if (selectedTopics.length > 0) {
    ctx += `\nPriority ESG Topics: ${selectedTopics.map(t => t.topic).join(", ")}\n`;
  }

  if (Object.keys(metricData).length > 0) {
    ctx += `\nCurrent Metrics:\n`;
    for (const [name, data] of Object.entries(metricData)) {
      ctx += `- ${name}: ${data.latestValue} ${data.unit} (${data.period})\n`;
    }
  }

  if (actions.length > 0) {
    ctx += `\nAction Plans:\n`;
    for (const a of actions) {
      ctx += `- ${a.title} (Status: ${a.status})\n`;
    }
  }

  if (carbonCalcs.length > 0) {
    const latest = carbonCalcs[0];
    ctx += `\nLatest Carbon Calculation (${latest.reportingPeriod}): Total ${latest.totalEmissions} kgCO2e, Scope 1: ${latest.scope1Total}, Scope 2: ${latest.scope2Total}\n`;
  }

  return ctx;
}

function matchQuestionByRules(question: string, context: string): { answer: string; confidence: string; source: string } {
  const q = question.toLowerCase();

  if (q.includes("esg policy") || (q.includes("do you have") && q.includes("policy"))) {
    if (context.includes("ESG Policy Content")) {
      return { answer: "Yes, we have a formal ESG policy in place that covers environmental, social and governance commitments. The policy is reviewed regularly and available upon request.", confidence: "high", source: "ESG Policy" };
    }
    return { answer: "We are currently developing a formal ESG policy.", confidence: "medium", source: "System data" };
  }

  if (q.includes("carbon") || q.includes("emission") || q.includes("ghg")) {
    if (context.includes("Carbon Calculation")) {
      const match = context.match(/Total ([\d.]+) kgCO2e/);
      const total = match ? match[1] : "measured";
      return { answer: `Yes, we measure our carbon emissions. Our most recent calculation shows total emissions of ${total} kgCO2e. We track Scope 1 and Scope 2 emissions and are working to reduce them year on year.`, confidence: "high", source: "Carbon Calculator" };
    }
    if (context.includes("Scope 1") || context.includes("Scope 2")) {
      return { answer: "Yes, we track our carbon emissions through our ESG management system.", confidence: "medium", source: "Metric data" };
    }
  }

  if (q.includes("diversity") || q.includes("inclusion")) {
    if (context.includes("Gender Split") || context.includes("Diversity")) {
      const match = context.match(/Gender Split.*?: ([\d.]+)/);
      const pct = match ? match[1] : null;
      return { answer: `We are committed to diversity and inclusion. ${pct ? `Our current gender split shows ${pct}% female representation. ` : ""}We track diversity data and have active improvement plans in place.`, confidence: "high", source: "Metric data & Policy" };
    }
  }

  if (q.includes("training")) {
    if (context.includes("Training")) {
      return { answer: "Yes, we provide regular employee training including ESG awareness, health and safety, and role-specific development. Training hours are tracked through our ESG management system.", confidence: "high", source: "Metric data & Policy" };
    }
  }

  if (q.includes("waste") || q.includes("recycl")) {
    if (context.includes("Waste") || context.includes("Recycling")) {
      const wasteMatch = context.match(/Waste Generated.*?: ([\d.]+)/);
      const recycleMatch = context.match(/Recycling Rate.*?: ([\d.]+)/);
      let answer = "We track waste generation and recycling rates.";
      if (wasteMatch) answer += ` Current waste generated: ${wasteMatch[1]} tonnes.`;
      if (recycleMatch) answer += ` Current recycling rate: ${recycleMatch[1]}%.`;
      return { answer, confidence: "high", source: "Metric data" };
    }
  }

  if (q.includes("anti-bribery") || q.includes("corruption")) {
    if (context.includes("Anti-Bribery") || context.includes("governance")) {
      return { answer: "Yes, we have a formal anti-bribery and anti-corruption policy in place. All employees are made aware of their obligations and we operate a zero-tolerance approach.", confidence: "high", source: "ESG Policy" };
    }
  }

  if (q.includes("whistleblow")) {
    if (context.includes("Whistleblowing") || context.includes("governance")) {
      return { answer: "Yes, we have a whistleblowing policy and procedure in place that allows employees and stakeholders to raise concerns confidentially.", confidence: "high", source: "ESG Policy" };
    }
  }

  if (q.includes("privacy") || q.includes("data protection") || q.includes("gdpr")) {
    if (context.includes("Data Privacy")) {
      return { answer: "Yes, we have a data privacy policy in place and provide regular data protection training to all staff. We comply with applicable data protection regulations.", confidence: "high", source: "ESG Policy & Training data" };
    }
  }

  if (q.includes("supplier") || q.includes("supply chain")) {
    if (context.includes("Supplier")) {
      return { answer: "We are developing supplier standards and a code of conduct to ensure our supply chain meets our ESG requirements.", confidence: "medium", source: "Action Plans" };
    }
  }

  if (q.includes("health") && q.includes("safety")) {
    if (context.includes("Lost Time") || context.includes("Health & Safety")) {
      const match = context.match(/Lost Time Incidents.*?: ([\d.]+)/);
      let answer = "Yes, we track health and safety performance including incident rates.";
      if (match) answer += ` Our latest lost time incident count is ${match[1]}.`;
      return { answer, confidence: "high", source: "Metric data" };
    }
  }

  return { answer: "", confidence: "low", source: "No source found" };
}

async function seedPolicyTemplates() {
  try {
    const count = await storage.getPolicyTemplateCount();
    if (count === 0) {
      console.log("Seeding policy templates...");
      for (const t of POLICY_TEMPLATES) {
        await storage.createPolicyTemplate({
          slug: t.slug,
          name: t.name,
          category: t.category,
          description: t.description,
          sections: t.sections,
          questionnaire: t.questionnaire,
          complianceMapping: t.complianceMapping,
          defaultReviewCycle: t.defaultReviewCycle,
          isSystem: true,
        });
      }
      console.log(`Seeded ${POLICY_TEMPLATES.length} policy templates.`);
    } else {
      const existing = await storage.getPolicyTemplates();
      const existingSlugs = new Set(existing.map((t: any) => t.slug));
      let added = 0;
      for (const t of POLICY_TEMPLATES) {
        if (!existingSlugs.has(t.slug)) {
          await storage.createPolicyTemplate({
            slug: t.slug,
            name: t.name,
            category: t.category,
            description: t.description,
            sections: t.sections,
            questionnaire: t.questionnaire,
            complianceMapping: t.complianceMapping,
            defaultReviewCycle: t.defaultReviewCycle,
            isSystem: true,
          });
          added++;
        }
      }
      if (added > 0) console.log(`Added ${added} new policy templates.`);
    }
  } catch (e: any) {
    console.error("Error seeding templates:", e.message);
  }
}

const TEMPLATE_SYSTEM_PROMPT = `You are a policy and procedure drafting expert specialising in ISO management systems (9001, 14001, 45001, 27001) for UK SME businesses. You write professional, practical policies that are proportionate to the size of the business.

IMPORTANT GUARDRAILS:
- Do NOT claim this policy guarantees certification to any ISO standard.
- Do NOT claim this policy ensures full legal compliance.
- Always include a note that implementation, records, training, internal audits, and management review are also required for a functioning management system.
- Use UK English spelling throughout.
- Use active voice and plain language.

Adapt your wording based on company size, sector, ISO standards being targeted, whether the business is UK-only or multi-country, and whether they have employees, contractors, suppliers, or physical sites.`;

function buildTemplatePrompt(template: any, answers: any): string {
  const sections = template.sections as any[];
  const sectionKeys = sections.map((s: any) => s.key);
  const sectionHints = sections.map((s: any) => `  "${s.key}": "${s.aiPromptHint}"`).join(",\n");

  const tone = answers.tone?.includes("Audit")
    ? "Formal, detailed, ISO-aligned language suitable for external audit."
    : "Plain English, practical, proportionate for a small business.";

  const certList = Array.isArray(answers.certifications) ? answers.certifications.join(", ") : (answers.certifications || "None specified");
  const setupList = Array.isArray(answers.setupType) ? answers.setupType.join(", ") : (answers.setupType || "Not specified");

  let prompt = `Generate a structured "${template.name}" for the following organisation.

Return a JSON object with these exact keys (one per policy section):
{
${sectionHints}
}

Each value should be a string containing the full clause text for that section in Markdown format.

COMPANY PROFILE:
- Company Name: ${answers.companyName || "[Company Name]"}
- Legal Entity: ${answers.legalEntity || answers.companyName || "[Company Name]"}
- Sector: ${answers.sector || "General"}
- Employees: ${answers.employeeCount || "Not specified"}
- Countries: ${answers.countries || "United Kingdom"}
- Business Setup: ${setupList}
- Customer/Tender Requirements: ${answers.customerRequirements || "None specified"}
- ISO Certifications Sought: ${certList}
- Key Risks: ${answers.keyRisks || "Not specified"}
- Policy Owner: ${answers.policyOwner || "[Policy Owner]"}
- Approver: ${answers.approver || "[Approver]"}

TONE: ${tone}
`;

  const extraKeys = Object.keys(answers).filter(k => !["companyName", "legalEntity", "sector", "employeeCount", "countries", "setupType", "customerRequirements", "certifications", "keyRisks", "policyOwner", "approver", "tone"].includes(k));
  if (extraKeys.length > 0) {
    prompt += "\nADDITIONAL CONTEXT:\n";
    for (const k of extraKeys) {
      const val = answers[k];
      if (val === true) prompt += `- ${k}: Yes\n`;
      else if (val === false) prompt += `- ${k}: No\n`;
      else if (val) prompt += `- ${k}: ${val}\n`;
    }
  }

  prompt += `\nIMPORTANT: In the "versionControl" section, include a version control and approval table with fields for Version Number, Date, Author, Approver, and Next Review Date. Use the policy owner and approver names provided.`;

  return prompt;
}

async function generateAIAnswer(openai: OpenAI, question: string, context: string): Promise<{ answer: string; suggestedAnswer?: string; confidence: string; source: string; rationale?: string; sourceDataUsed?: string[] }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content: `You are an ESG questionnaire assistant for SME businesses. Generate concise, professional answers based ONLY on the company data provided. Never invent facts. Return JSON with these fields:
- suggestedAnswer: the answer text
- rationale: brief explanation of how the answer was derived
- sourceDataUsed: array of strings describing data sources used
- confidence: "high", "medium", or "low"

When insufficient data is available, set suggestedAnswer to "Insufficient data available to generate a reliable answer for this question.", confidence to "low", and rationale explaining what data is missing.`,
      },
      {
        role: "user",
        content: `Company context:\n${context}\n\nQuestion: ${question}\n\nGenerate a suggested answer as JSON.`,
      },
    ],
    max_completion_tokens: 512,
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(text);
    return {
      answer: parsed.suggestedAnswer || parsed.answer || text,
      suggestedAnswer: parsed.suggestedAnswer,
      confidence: parsed.confidence || "low",
      source: parsed.sourceDataUsed?.join(", ") || "AI generated",
      rationale: parsed.rationale,
      sourceDataUsed: parsed.sourceDataUsed,
    };
  } catch {
    return { answer: text, confidence: "low", source: "AI generated" };
  }
}
