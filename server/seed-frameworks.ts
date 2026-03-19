import { db } from "./storage";
import { frameworks, frameworkRequirements, metricFrameworkMappings, metricDefinitions } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const FRAMEWORK_SEEDS = [
  {
    code: "GRI",
    name: "GRI",
    fullName: "Global Reporting Initiative",
    description: "The GRI Standards are the world's most widely used standards for sustainability reporting.",
    version: "2021",
  },
  {
    code: "ISSB",
    name: "ISSB",
    fullName: "International Sustainability Standards Board",
    description: "IFRS Sustainability Disclosure Standards for climate-related and sustainability-related financial information.",
    version: "IFRS S1/S2",
  },
  {
    code: "TCFD",
    name: "TCFD",
    fullName: "Task Force on Climate-related Financial Disclosures",
    description: "Recommendations for consistent climate-related financial risk disclosures.",
    version: "2021",
  },
  {
    code: "ESRS",
    name: "ESRS",
    fullName: "European Sustainability Reporting Standards",
    description: "EU mandatory sustainability reporting standards under CSRD for large companies.",
    version: "2023",
  },
  {
    code: "CDP",
    name: "CDP",
    fullName: "Carbon Disclosure Project",
    description: "Global disclosure system for environmental impacts, particularly climate, water, and forests.",
    version: "2024",
  },
  {
    code: "UNGC",
    name: "UNGC",
    fullName: "UN Global Compact",
    description: "A voluntary initiative for businesses committed to ten principles in human rights, labour, environment, and anti-corruption.",
    version: "CoP",
  },
];

const REQUIREMENT_SEEDS: Array<{
  frameworkCode: string;
  code: string;
  title: string;
  description: string;
  requirementType: "metric" | "narrative" | "policy" | "target" | "risk" | "evidence";
  pillar: string;
  mandatoryLevel: "core" | "conditional" | "advanced";
  sortOrder: number;
}> = [
  // GRI Requirements
  { frameworkCode: "GRI", code: "GRI-302-1", title: "Energy consumption within the organisation", description: "Total fuel consumption, electricity consumption, heating/cooling consumption", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "GRI", code: "GRI-302-3", title: "Energy intensity", description: "Energy intensity ratio for the organisation", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 11 },
  { frameworkCode: "GRI", code: "GRI-303-5", title: "Water consumption", description: "Total water consumption from all areas", requirementType: "metric", pillar: "environmental", mandatoryLevel: "conditional", sortOrder: 20 },
  { frameworkCode: "GRI", code: "GRI-305-1", title: "Scope 1 GHG emissions", description: "Direct greenhouse gas emissions from owned/controlled sources", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "GRI", code: "GRI-305-2", title: "Scope 2 GHG emissions", description: "Indirect greenhouse gas emissions from purchased energy", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 31 },
  { frameworkCode: "GRI", code: "GRI-305-4", title: "GHG emissions intensity", description: "GHG emissions intensity ratio", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 32 },
  { frameworkCode: "GRI", code: "GRI-306-3", title: "Waste generated", description: "Total weight of waste generated", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 40 },
  { frameworkCode: "GRI", code: "GRI-2-7", title: "Employees", description: "Total number of employees by employment contract, gender, and region", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 50 },
  { frameworkCode: "GRI", code: "GRI-2-8", title: "Workers who are not employees", description: "Total workers who are not employees", requirementType: "metric", pillar: "social", mandatoryLevel: "advanced", sortOrder: 51 },
  { frameworkCode: "GRI", code: "GRI-401-1", title: "New employee hires and employee turnover", description: "Total number and rate of new employee hires and turnover", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 60 },
  { frameworkCode: "GRI", code: "GRI-403-9", title: "Work-related injuries", description: "Number and rate of recordable work-related injuries", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 70 },
  { frameworkCode: "GRI", code: "GRI-404-1", title: "Average hours of training per year per employee", description: "Average hours of training provided to employees", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 80 },
  { frameworkCode: "GRI", code: "GRI-405-1", title: "Diversity of governance bodies and employees", description: "Percentage of individuals within governance bodies and employees by gender", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 90 },
  { frameworkCode: "GRI", code: "GRI-2-23", title: "Policy commitments", description: "Statements of policy commitments on responsible business conduct", requirementType: "policy", pillar: "governance", mandatoryLevel: "core", sortOrder: 100 },
  { frameworkCode: "GRI", code: "GRI-2-12", title: "Role of highest governance body", description: "Narrative on governance body's role in overseeing ESG impacts", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 110 },
  { frameworkCode: "GRI", code: "GRI-205-1", title: "Operations assessed for corruption risks", description: "Operations assessed for corruption-related risks", requirementType: "policy", pillar: "governance", mandatoryLevel: "core", sortOrder: 120 },

  // ISSB Requirements
  { frameworkCode: "ISSB", code: "ISSB-S1-GOV", title: "Governance — sustainability oversight", description: "Governance processes, controls and procedures to monitor sustainability-related risks", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "ISSB", code: "ISSB-S1-STRAT", title: "Strategy — business model and sustainability risks", description: "Sustainability-related risks and opportunities and their effect on business model", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "ISSB", code: "ISSB-S1-RISK", title: "Risk management processes", description: "Processes for identifying, assessing, and managing sustainability risks", requirementType: "risk", pillar: "governance", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "ISSB", code: "ISSB-S2-SCOPE1", title: "Scope 1 GHG emissions", description: "Gross Scope 1 greenhouse gas emissions", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 40 },
  { frameworkCode: "ISSB", code: "ISSB-S2-SCOPE2", title: "Scope 2 GHG emissions", description: "Gross Scope 2 greenhouse gas emissions (location-based and market-based)", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 41 },
  { frameworkCode: "ISSB", code: "ISSB-S2-INTENSITY", title: "GHG emissions intensity", description: "GHG emissions intensity per unit of production or revenue", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 42 },
  { frameworkCode: "ISSB", code: "ISSB-S2-TARGET", title: "Climate-related targets", description: "Climate-related targets including any GHG emissions reduction targets", requirementType: "target", pillar: "environmental", mandatoryLevel: "core", sortOrder: 50 },
  { frameworkCode: "ISSB", code: "ISSB-S2-ENERGY", title: "Energy consumption and mix", description: "Total energy consumed, proportion from renewables", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 60 },

  // TCFD Requirements
  { frameworkCode: "TCFD", code: "TCFD-GOV-A", title: "Board oversight of climate risks", description: "Describe the board's oversight of climate-related risks and opportunities", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "TCFD", code: "TCFD-GOV-B", title: "Management's role in climate risks", description: "Describe management's role in assessing and managing climate-related risks", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 11 },
  { frameworkCode: "TCFD", code: "TCFD-STRAT-A", title: "Climate risks and opportunities identified", description: "Short-, medium-, and long-term climate-related risks and opportunities", requirementType: "risk", pillar: "governance", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "TCFD", code: "TCFD-STRAT-B", title: "Impact on business strategy", description: "Impact of climate risks on the organisation's businesses, strategy, and financial planning", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 21 },
  { frameworkCode: "TCFD", code: "TCFD-RISK-A", title: "Climate risk identification process", description: "Organisation's processes for identifying and assessing climate-related risks", requirementType: "risk", pillar: "governance", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "TCFD", code: "TCFD-METRICS-A", title: "Climate metrics", description: "Metrics used to assess climate-related risks and opportunities", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 40 },
  { frameworkCode: "TCFD", code: "TCFD-METRICS-B", title: "Scope 1, 2, 3 GHG emissions", description: "Scope 1, Scope 2, and if appropriate, Scope 3 GHG emissions", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 41 },
  { frameworkCode: "TCFD", code: "TCFD-METRICS-C", title: "Climate-related targets", description: "Targets used to manage climate-related risks and opportunities", requirementType: "target", pillar: "environmental", mandatoryLevel: "core", sortOrder: 42 },

  // ESRS Requirements
  { frameworkCode: "ESRS", code: "ESRS-E1-GHG", title: "GHG emissions (Scope 1, 2, 3)", description: "Gross Scope 1, 2, and 3 greenhouse gas emissions", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "ESRS", code: "ESRS-E1-ENERGY", title: "Energy consumption and mix", description: "Total energy consumption and proportion from renewable sources", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "ESRS", code: "ESRS-E1-TARGET", title: "GHG reduction targets", description: "Science-based or other GHG reduction targets", requirementType: "target", pillar: "environmental", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "ESRS", code: "ESRS-E3-WATER", title: "Water consumption", description: "Total water consumption and water intensity", requirementType: "metric", pillar: "environmental", mandatoryLevel: "conditional", sortOrder: 40 },
  { frameworkCode: "ESRS", code: "ESRS-E5-WASTE", title: "Waste generation and diversion", description: "Total waste generated and diversion rates", requirementType: "metric", pillar: "environmental", mandatoryLevel: "conditional", sortOrder: 50 },
  { frameworkCode: "ESRS", code: "ESRS-S1-EMPLOYEES", title: "Own workforce — headcount", description: "Total number of employees by gender and contract type", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 60 },
  { frameworkCode: "ESRS", code: "ESRS-S1-TURNOVER", title: "Employee turnover rate", description: "Rate of employees who left and joined during reporting period", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 70 },
  { frameworkCode: "ESRS", code: "ESRS-S1-TRAINING", title: "Training and skills development", description: "Average hours of training per employee", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 80 },
  { frameworkCode: "ESRS", code: "ESRS-S1-HEALTH", title: "Health and safety — incidents", description: "Work-related injuries, accidents, and lost-time incidents", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 90 },
  { frameworkCode: "ESRS", code: "ESRS-G1-GOV", title: "Business conduct and governance", description: "Governance structures, anti-corruption, and whistleblowing", requirementType: "policy", pillar: "governance", mandatoryLevel: "core", sortOrder: 100 },

  // CDP Requirements
  { frameworkCode: "CDP", code: "CDP-C1-GOVERNANCE", title: "Climate governance", description: "Board-level and management-level governance of climate change", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "CDP", code: "CDP-C2-RISKS", title: "Climate risks and opportunities", description: "Assessment of climate-related risks and opportunities", requirementType: "risk", pillar: "governance", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "CDP", code: "CDP-C4-TARGETS", title: "GHG reduction targets", description: "Emissions reduction targets and strategies", requirementType: "target", pillar: "environmental", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "CDP", code: "CDP-C6-SCOPE1", title: "Scope 1 GHG emissions", description: "Gross global Scope 1 emissions", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 40 },
  { frameworkCode: "CDP", code: "CDP-C6-SCOPE2", title: "Scope 2 GHG emissions", description: "Gross global Scope 2 emissions (location-based and market-based)", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 41 },
  { frameworkCode: "CDP", code: "CDP-C6-INTENSITY", title: "GHG emissions intensity", description: "Scope 1 and 2 GHG intensity ratio", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 42 },
  { frameworkCode: "CDP", code: "CDP-C8-ENERGY", title: "Energy consumption", description: "Total electricity and energy consumption", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 50 },

  // UNGC Requirements
  { frameworkCode: "UNGC", code: "UNGC-HR1", title: "Human rights policy", description: "Policy and commitments to support human rights principles", requirementType: "policy", pillar: "social", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "UNGC", code: "UNGC-HR2", title: "Human rights due diligence", description: "Processes to assess human rights impacts in operations and supply chain", requirementType: "narrative", pillar: "social", mandatoryLevel: "core", sortOrder: 11 },
  { frameworkCode: "UNGC", code: "UNGC-LAB1", title: "Freedom of association and collective bargaining", description: "Support for employees' right to freedom of association", requirementType: "policy", pillar: "social", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "UNGC", code: "UNGC-LAB2", title: "Elimination of forced labour", description: "Actions to eliminate forced and compulsory labour", requirementType: "policy", pillar: "social", mandatoryLevel: "core", sortOrder: 21 },
  { frameworkCode: "UNGC", code: "UNGC-LAB3", title: "Elimination of child labour", description: "Actions to eliminate child labour", requirementType: "policy", pillar: "social", mandatoryLevel: "core", sortOrder: 22 },
  { frameworkCode: "UNGC", code: "UNGC-LAB4", title: "Non-discrimination in employment", description: "Actions to eliminate discrimination in employment", requirementType: "policy", pillar: "social", mandatoryLevel: "core", sortOrder: 23 },
  { frameworkCode: "UNGC", code: "UNGC-ENV1", title: "Environmental precautionary approach", description: "Support a precautionary approach to environmental challenges", requirementType: "narrative", pillar: "environmental", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "UNGC", code: "UNGC-ENV2", title: "Environmental responsibility initiatives", description: "Undertake initiatives to promote greater environmental responsibility", requirementType: "narrative", pillar: "environmental", mandatoryLevel: "core", sortOrder: 31 },
  { frameworkCode: "UNGC", code: "UNGC-ENV3", title: "Environmentally friendly technologies", description: "Encourage the development and diffusion of environmentally friendly technologies", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 32 },
  { frameworkCode: "UNGC", code: "UNGC-ANTI1", title: "Anti-corruption policy", description: "Work against corruption in all its forms including extortion and bribery", requirementType: "policy", pillar: "governance", mandatoryLevel: "core", sortOrder: 40 },
  { frameworkCode: "UNGC", code: "UNGC-ANTI2", title: "Anti-corruption narrative", description: "Narrative on anti-corruption programs and initiatives", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 41 },
];

const METRIC_MAPPINGS: Array<{
  metricCode: string;
  requirementCode: string;
  strength: "direct" | "partial" | "supporting";
  notes?: string;
}> = [
  // E001 — Electricity Consumption
  { metricCode: "E001", requirementCode: "GRI-302-1", strength: "direct" },
  { metricCode: "E001", requirementCode: "ISSB-S2-ENERGY", strength: "direct" },
  { metricCode: "E001", requirementCode: "ESRS-E1-ENERGY", strength: "direct" },
  { metricCode: "E001", requirementCode: "CDP-C8-ENERGY", strength: "direct" },

  // E002 — Natural Gas Consumption
  { metricCode: "E002", requirementCode: "GRI-302-1", strength: "direct" },
  { metricCode: "E002", requirementCode: "ISSB-S2-ENERGY", strength: "partial" },
  { metricCode: "E002", requirementCode: "ESRS-E1-ENERGY", strength: "partial" },
  { metricCode: "E002", requirementCode: "CDP-C8-ENERGY", strength: "partial" },

  // E003 — Vehicle Fuel Consumption
  { metricCode: "E003", requirementCode: "GRI-305-1", strength: "supporting" },
  { metricCode: "E003", requirementCode: "ESRS-E1-GHG", strength: "supporting" },

  // E004 — Scope 1 Emissions
  { metricCode: "E004", requirementCode: "GRI-305-1", strength: "direct" },
  { metricCode: "E004", requirementCode: "ISSB-S2-SCOPE1", strength: "direct" },
  { metricCode: "E004", requirementCode: "TCFD-METRICS-B", strength: "direct" },
  { metricCode: "E004", requirementCode: "ESRS-E1-GHG", strength: "direct" },
  { metricCode: "E004", requirementCode: "CDP-C6-SCOPE1", strength: "direct" },
  { metricCode: "E004", requirementCode: "UNGC-ENV3", strength: "supporting" },

  // E005 — Scope 2 Emissions
  { metricCode: "E005", requirementCode: "GRI-305-2", strength: "direct" },
  { metricCode: "E005", requirementCode: "ISSB-S2-SCOPE2", strength: "direct" },
  { metricCode: "E005", requirementCode: "TCFD-METRICS-B", strength: "direct" },
  { metricCode: "E005", requirementCode: "ESRS-E1-GHG", strength: "direct" },
  { metricCode: "E005", requirementCode: "CDP-C6-SCOPE2", strength: "direct" },

  // E006 — Total GHG Emissions
  { metricCode: "E006", requirementCode: "GRI-305-1", strength: "partial" },
  { metricCode: "E006", requirementCode: "GRI-305-2", strength: "partial" },
  { metricCode: "E006", requirementCode: "TCFD-METRICS-B", strength: "supporting" },
  { metricCode: "E006", requirementCode: "ESRS-E1-GHG", strength: "supporting" },

  // E007 — Total Waste Generated
  { metricCode: "E007", requirementCode: "GRI-306-3", strength: "direct" },
  { metricCode: "E007", requirementCode: "ESRS-E5-WASTE", strength: "direct" },

  // E008 — Waste Recycled
  { metricCode: "E008", requirementCode: "GRI-306-3", strength: "partial" },
  { metricCode: "E008", requirementCode: "ESRS-E5-WASTE", strength: "partial" },

  // E009 — Recycling Rate
  { metricCode: "E009", requirementCode: "GRI-306-3", strength: "partial" },
  { metricCode: "E009", requirementCode: "ESRS-E5-WASTE", strength: "partial" },

  // E010 — Total Water Consumption
  { metricCode: "E010", requirementCode: "GRI-303-5", strength: "direct" },
  { metricCode: "E010", requirementCode: "ESRS-E3-WATER", strength: "direct" },

  // E013 — Scope 3 Emissions
  { metricCode: "E013", requirementCode: "TCFD-METRICS-B", strength: "partial" },
  { metricCode: "E013", requirementCode: "ESRS-E1-GHG", strength: "partial" },

  // E014 — Business Travel Emissions
  { metricCode: "E014", requirementCode: "GRI-305-2", strength: "supporting" },
  { metricCode: "E014", requirementCode: "TCFD-METRICS-B", strength: "supporting" },
  { metricCode: "E014", requirementCode: "ESRS-E1-GHG", strength: "supporting" },

  // G008 — Carbon Intensity
  { metricCode: "G008", requirementCode: "GRI-305-4", strength: "direct" },
  { metricCode: "G008", requirementCode: "ISSB-S2-INTENSITY", strength: "direct" },
  { metricCode: "G008", requirementCode: "CDP-C6-INTENSITY", strength: "direct" },
  { metricCode: "G008", requirementCode: "TCFD-METRICS-A", strength: "supporting" },

  // S001 — Total Headcount
  { metricCode: "S001", requirementCode: "GRI-2-7", strength: "direct" },
  { metricCode: "S001", requirementCode: "ESRS-S1-EMPLOYEES", strength: "direct" },

  // S002 — Employee Leavers (input for turnover)
  { metricCode: "S002", requirementCode: "GRI-401-1", strength: "partial" },
  { metricCode: "S002", requirementCode: "ESRS-S1-TURNOVER", strength: "partial" },

  // S003 — Employee Turnover Rate
  { metricCode: "S003", requirementCode: "GRI-401-1", strength: "direct" },
  { metricCode: "S003", requirementCode: "ESRS-S1-TURNOVER", strength: "direct" },

  // S005 — Absence Rate
  { metricCode: "S005", requirementCode: "GRI-403-9", strength: "supporting" },
  { metricCode: "S005", requirementCode: "ESRS-S1-HEALTH", strength: "supporting" },

  // S006 — Total Training Hours
  { metricCode: "S006", requirementCode: "GRI-404-1", strength: "partial" },
  { metricCode: "S006", requirementCode: "ESRS-S1-TRAINING", strength: "partial" },

  // S007 — Training Hours per Employee
  { metricCode: "S007", requirementCode: "GRI-404-1", strength: "direct" },
  { metricCode: "S007", requirementCode: "ESRS-S1-TRAINING", strength: "direct" },

  // S008 — Female Employees
  { metricCode: "S008", requirementCode: "GRI-405-1", strength: "partial" },
  { metricCode: "S008", requirementCode: "ESRS-S1-EMPLOYEES", strength: "partial" },
  { metricCode: "S008", requirementCode: "UNGC-LAB4", strength: "supporting" },

  // S009 — Lost Time Injury Rate
  { metricCode: "S009", requirementCode: "GRI-403-9", strength: "direct" },
  { metricCode: "S009", requirementCode: "ESRS-S1-HEALTH", strength: "direct" },

  // S011 — Living Wage Coverage
  { metricCode: "S011", requirementCode: "UNGC-LAB2", strength: "supporting" },

  // S012 — Management Gender Diversity
  { metricCode: "S012", requirementCode: "GRI-405-1", strength: "direct" },
  { metricCode: "S012", requirementCode: "ESRS-S1-EMPLOYEES", strength: "supporting" },
  { metricCode: "S012", requirementCode: "UNGC-LAB4", strength: "supporting" },

  // G004 — Data Privacy Training
  { metricCode: "G004", requirementCode: "GRI-2-23", strength: "supporting" },

  // G005 — Anti-Corruption Training
  { metricCode: "G005", requirementCode: "GRI-205-1", strength: "partial" },
  { metricCode: "G005", requirementCode: "UNGC-ANTI1", strength: "partial" },
  { metricCode: "G005", requirementCode: "ESRS-G1-GOV", strength: "supporting" },

  // G006 — Supplier Code Adoption
  { metricCode: "G006", requirementCode: "GRI-2-23", strength: "partial" },
  { metricCode: "G006", requirementCode: "UNGC-HR2", strength: "partial" },
  { metricCode: "G006", requirementCode: "UNGC-LAB2", strength: "supporting" },

  // G007 — Policy Review Completion
  { metricCode: "G007", requirementCode: "GRI-2-23", strength: "partial" },
  { metricCode: "G007", requirementCode: "ESRS-G1-GOV", strength: "supporting" },
];

export async function seedFrameworks() {
  console.log("[seed-frameworks] Starting framework seed...");

  const existingFrameworks = await db.select().from(frameworks);
  if (existingFrameworks.length > 0) {
    console.log(`[seed-frameworks] Frameworks already seeded (${existingFrameworks.length} found), skipping.`);
    return;
  }

  const fwMap: Record<string, string> = {};
  for (const fw of FRAMEWORK_SEEDS) {
    const [inserted] = await db.insert(frameworks).values(fw).returning();
    fwMap[fw.code] = inserted.id;
    console.log(`[seed-frameworks] Created framework: ${fw.code}`);
  }

  const reqMap: Record<string, string> = {};
  for (const req of REQUIREMENT_SEEDS) {
    const frameworkId = fwMap[req.frameworkCode];
    if (!frameworkId) continue;
    const [inserted] = await db.insert(frameworkRequirements).values({
      frameworkId,
      code: req.code,
      title: req.title,
      description: req.description,
      requirementType: req.requirementType,
      pillar: req.pillar,
      mandatoryLevel: req.mandatoryLevel,
      sortOrder: req.sortOrder,
    }).returning();
    reqMap[req.code] = inserted.id;
  }
  console.log(`[seed-frameworks] Created ${Object.keys(reqMap).length} framework requirements`);

  const metricDefs = await db.select().from(metricDefinitions);
  const metricCodeMap: Record<string, string> = {};
  for (const md of metricDefs) {
    metricCodeMap[md.code] = md.id;
  }

  let mappingsCreated = 0;
  for (const mapping of METRIC_MAPPINGS) {
    const metricDefinitionId = metricCodeMap[mapping.metricCode];
    const frameworkRequirementId = reqMap[mapping.requirementCode];
    if (!metricDefinitionId || !frameworkRequirementId) continue;
    await db.insert(metricFrameworkMappings).values({
      metricDefinitionId,
      frameworkRequirementId,
      mappingStrength: mapping.strength,
      notes: mapping.notes ?? null,
    }).onConflictDoNothing();
    mappingsCreated++;
  }
  console.log(`[seed-frameworks] Created ${mappingsCreated} metric-framework mappings`);
  console.log("[seed-frameworks] Framework seeding complete.");
}
