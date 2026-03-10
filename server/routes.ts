import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { db } from "./storage";
import {
  insertUserSchema, insertCompanySchema, insertMetricSchema,
  insertMetricValueSchema, insertActionPlanSchema, insertPolicyVersionSchema,
  hasPermission, type PermissionModule,
} from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import crypto from "crypto";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { POLICY_TEMPLATES } from "./policy-templates";
import { getTrafficLightStatus, runCalculationsForPeriod, calculateWeightedEsgScore, type RawInputs, type ScoredMetric } from "./calculations";

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

  app.use(session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: sessionSecret,
    resave: true,
    saveUninitialized: false,
    cookie: {
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax" as const,
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
        ...Object.values({ environmental: ["electricity_kwh","gas_kwh","vehicle_fuel_litres","total_waste_tonnes","recycled_waste_tonnes","water_m3","domestic_flight_km","short_haul_flight_km","long_haul_flight_km","rail_km","hotel_nights","car_miles"], social: ["employee_headcount","employee_leavers","absence_days","total_working_days","total_training_hours","female_managers","total_managers","living_wage_employees"], governance: ["trained_staff","total_staff","signed_suppliers","total_suppliers"] }).flat()
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
          const calculated = runCalculationsForPeriod(rawInputsMap, {}, existingVals);
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

      const calculated = runCalculationsForPeriod(rawInputs, {}, existingValues);
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
  app.put("/api/metrics/:id/admin", requireAuth, requirePermission("template_admin"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { direction, targetValue, targetMin, targetMax, amberThreshold, redThreshold, enabled, helpText, dataOwner } = req.body;
      const result = await storage.updateMetric(req.params.id, {
        direction, targetValue, targetMin, targetMax, amberThreshold, redThreshold, enabled, helpText, dataOwner,
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
      const { period, reportType, includePolicy, includeTopics, includeMetrics, includeActions } = req.body;

      const report = await storage.createReportRun({
        companyId,
        period,
        reportType: reportType || "pdf",
        generatedBy: userId,
        includePolicy,
        includeTopics,
        includeMetrics,
        includeActions,
      });

      // Build report data
      const company = await storage.getCompany(companyId);
      const policy = await storage.getPolicy(companyId);
      const latestVersion = policy ? await storage.getLatestPolicyVersion(policy.id) : null;
      const topics = await storage.getMaterialTopics(companyId);
      const allMetrics = await storage.getMetrics(companyId);
      const values = period ? await storage.getMetricValuesByPeriod(companyId, period) : [];
      const actions = await storage.getActionPlans(companyId);
      const evidenceCoverage = await storage.getEvidenceCoverage(companyId, period || undefined);
      const allEvidence = await storage.getEvidenceFiles(companyId);

      const valuesWithEvidence = values.map((v: any) => {
        const hasEvidence = allEvidence.some(e => e.linkedModule === "metric_value" && e.linkedEntityId === v.id);
        return {
          ...v,
          dataSourceLabel: hasEvidence ? "Evidenced" : (v.dataSourceType === "estimated" ? "Estimated" : "Manual"),
        };
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "Report generated",
        entityType: "report",
        entityId: report.id,
        details: { period, reportType },
      });

      res.json({
        report,
        data: {
          company,
          policy: latestVersion?.content,
          selectedTopics: topics.filter(t => t.selected),
          metrics: allMetrics.filter(m => m.enabled),
          values: valuesWithEvidence,
          actions,
          evidenceCoverage,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Audit logs
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const logs = await storage.getAuditLogs(companyId);
    res.json(logs);
  });

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

  app.get("/api/carbon/calculations", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const calcs = await storage.getCarbonCalculations(companyId);
    res.json(calcs);
  });

  app.post("/api/carbon/calculate", requireAuth, requirePermission("metrics_data_entry"), async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { inputs, reportingPeriod, periodType, employeeCount } = req.body;

      const country = inputs.country || "UK";
      const factors = await storage.getEmissionFactors(country);

      const results = calculateEmissions(inputs, factors);

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
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "Carbon calculation completed",
        entityType: "carbon_calculation",
        entityId: calc.id,
        details: { reportingPeriod, totalEmissions: results.totalEmissions },
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

  app.get("/api/workflow/pending", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const pending = await storage.getWorkflowPendingItems(companyId);
      res.json(pending);
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

  return httpServer;
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

function calculateEmissions(inputs: any, factors: any[]): any {
  const findFactor = (category: string) => {
    const f = factors.find((f: any) => f.category === category);
    return f ? parseFloat(f.factor) : 0;
  };

  const electricity = (parseFloat(inputs.electricity) || 0) * findFactor("electricity");
  const gas = (parseFloat(inputs.gas) || 0) * findFactor("gas");
  const diesel = (parseFloat(inputs.diesel) || 0) * findFactor("fuel");
  const petrol = (parseFloat(inputs.petrol) || 0) * findFactor("fuel");
  const vehicles = (parseFloat(inputs.vehicleMileage) || 0) * findFactor("vehicles");

  const scope1Total = gas + diesel + petrol + vehicles;
  const scope2Total = electricity;

  const domesticFlights = (parseFloat(inputs.domesticFlights) || 0) * (factors.find((f: any) => f.name === "Domestic Flight")?.factor || 0.24587);
  const shortHaulFlights = (parseFloat(inputs.shortHaulFlights) || 0) * (factors.find((f: any) => f.name === "Short-haul Flight")?.factor || 0.15353);
  const longHaulFlights = (parseFloat(inputs.longHaulFlights) || 0) * (factors.find((f: any) => f.name === "Long-haul Flight")?.factor || 0.19309);
  const rail = (parseFloat(inputs.railTravel) || 0) * findFactor("travel");
  const hotelNights = (parseFloat(inputs.hotelNights) || 0) * (factors.find((f: any) => f.name === "Hotel Nights")?.factor || 10.24);

  const scope3Total = domesticFlights + shortHaulFlights + longHaulFlights + rail + hotelNights;
  const totalEmissions = scope1Total + scope2Total + scope3Total;

  return {
    scope1Total: Math.round(scope1Total * 10000) / 10000,
    scope2Total: Math.round(scope2Total * 10000) / 10000,
    scope3Total: Math.round(scope3Total * 10000) / 10000,
    totalEmissions: Math.round(totalEmissions * 10000) / 10000,
    breakdown: {
      electricity: Math.round(electricity * 100) / 100,
      gas: Math.round(gas * 100) / 100,
      diesel: Math.round(diesel * 100) / 100,
      petrol: Math.round(petrol * 100) / 100,
      vehicles: Math.round(vehicles * 100) / 100,
      domesticFlights: Math.round(domesticFlights * 100) / 100,
      shortHaulFlights: Math.round(shortHaulFlights * 100) / 100,
      longHaulFlights: Math.round(longHaulFlights * 100) / 100,
      rail: Math.round(rail * 100) / 100,
      hotelNights: Math.round(hotelNights * 100) / 100,
    },
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
