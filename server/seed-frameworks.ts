import { db } from "./storage";
import { frameworks, frameworkRequirements, metricFrameworkMappings, metricDefinitions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export const FRAMEWORK_SEEDS = [
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
  {
    code: "VSME",
    name: "VSME",
    fullName: "EU Voluntary Sustainability Reporting Standard for Smaller Undertakings",
    description: "Proportionate voluntary sustainability reporting for smaller undertakings and value-chain information requests.",
    version: "2026 Voluntary Standard (C(2026) 5011)",
  },
  {
    code: "PPN006",
    name: "PPN 006",
    fullName: "UK Procurement Policy Note 006 Carbon Reduction Plan",
    description: "UK central-government supplier Carbon Reduction Plan requirements for relevant major procurements.",
    version: "February 2025 technical standard",
  },
];

export const REQUIREMENT_SEEDS: Array<{
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

  // EU Voluntary Standard for smaller undertakings (VSME lineage)
  { frameworkCode: "VSME", code: "VSME-B1", title: "Basis for preparation and undertaking facts", description: "Selected module, reporting basis and boundary, legal form, sector, assets, turnover, workforce, country and significant sites", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "VSME", code: "VSME-B2", title: "Sustainability practices, policies, initiatives and targets", description: "Plain description of the practices, policies, future initiatives and targets already in place", requirementType: "policy", pillar: "governance", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "VSME", code: "VSME-B3-ENERGY", title: "Energy consumption and renewable mix", description: "Total energy use in MWh with renewable and non-renewable electricity and fuel breakdown where available", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "VSME", code: "VSME-B3-SCOPE1", title: "Gross Scope 1 GHG emissions", description: "Estimated gross Scope 1 emissions in tCO2e", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 31 },
  { frameworkCode: "VSME", code: "VSME-B3-SCOPE2", title: "Location-based Scope 2 GHG emissions", description: "Estimated location-based Scope 2 emissions in tCO2e", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 32 },
  { frameworkCode: "VSME", code: "VSME-B3-INTENSITY", title: "GHG intensity by turnover", description: "Gross Scope 1 and 2 emissions divided by turnover", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 33 },
  { frameworkCode: "VSME", code: "VSME-B4", title: "Pollution of air, water and soil", description: "Applicable pollutant emissions already reported to authorities or voluntarily under an environmental management system", requirementType: "narrative", pillar: "environmental", mandatoryLevel: "conditional", sortOrder: 40 },
  { frameworkCode: "VSME", code: "VSME-B5", title: "Biodiversity-sensitive sites and land use", description: "Number and area of owned, leased or managed sites in or near biodiversity-sensitive areas", requirementType: "risk", pillar: "environmental", mandatoryLevel: "conditional", sortOrder: 50 },
  { frameworkCode: "VSME", code: "VSME-B6", title: "Water withdrawal and consumption", description: "Total water withdrawal and, for water-intensive production, water consumption", requirementType: "metric", pillar: "environmental", mandatoryLevel: "conditional", sortOrder: 60 },
  { frameworkCode: "VSME", code: "VSME-B7", title: "Resource use, circular economy and waste", description: "Circular-economy application, waste generated, waste diverted and material flows where significant", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 70 },
  { frameworkCode: "VSME", code: "VSME-B8", title: "Workforce characteristics and turnover", description: "Employees by contract, gender and country, plus turnover when the workforce threshold applies", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 80 },
  { frameworkCode: "VSME", code: "VSME-B9", title: "Workforce health and safety", description: "Recordable work-related accidents, accident rate and fatalities", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 90 },
  { frameworkCode: "VSME", code: "VSME-B10", title: "Pay, collective bargaining and training", description: "Minimum-wage coverage, applicable pay gap, collective bargaining and training hours by gender", requirementType: "metric", pillar: "social", mandatoryLevel: "core", sortOrder: 100 },
  { frameworkCode: "VSME", code: "VSME-B11", title: "Corruption and bribery convictions and fines", description: "Number of convictions and amount of fines during the reporting period", requirementType: "metric", pillar: "governance", mandatoryLevel: "core", sortOrder: 110 },
  { frameworkCode: "VSME", code: "VSME-C1", title: "Business model, markets and sustainability strategy", description: "Products and services, markets, main business relationships and sustainability-related strategy", requirementType: "narrative", pillar: "governance", mandatoryLevel: "advanced", sortOrder: 120 },
  { frameworkCode: "VSME", code: "VSME-C2", title: "Detailed practices, policies and initiatives", description: "Description, actions, targets and senior accountability for sustainability practices and policies", requirementType: "policy", pillar: "governance", mandatoryLevel: "advanced", sortOrder: 130 },
  { frameworkCode: "VSME", code: "VSME-C3", title: "GHG reduction targets and transition", description: "Scope 1, 2 and relevant Scope 3 target values, base year, target year, units and transition actions", requirementType: "target", pillar: "environmental", mandatoryLevel: "advanced", sortOrder: 140 },
  { frameworkCode: "VSME", code: "VSME-C4", title: "Climate risks", description: "Physical and transition hazards, exposure assessment, time horizons and adaptation actions", requirementType: "risk", pillar: "environmental", mandatoryLevel: "advanced", sortOrder: 150 },
  { frameworkCode: "VSME", code: "VSME-C5-C7", title: "Additional workforce and human-rights information", description: "Additional workforce characteristics, human-rights policies and severe incidents", requirementType: "policy", pillar: "social", mandatoryLevel: "advanced", sortOrder: 160 },
  { frameworkCode: "VSME", code: "VSME-C8", title: "Revenues from sensitive activities", description: "Applicable revenues from specified weapons, tobacco, fossil-fuel and chemicals activities", requirementType: "narrative", pillar: "governance", mandatoryLevel: "conditional", sortOrder: 170 },
  { frameworkCode: "VSME", code: "VSME-C9", title: "Gender diversity in governance body", description: "Female-to-male diversity ratio in the governance body", requirementType: "metric", pillar: "governance", mandatoryLevel: "advanced", sortOrder: 180 },

  // UK PPN 006 Carbon Reduction Plan technical standard (February 2025)
  { frameworkCode: "PPN006", code: "PPN006-ENTITY", title: "Bidding entity and reporting boundary", description: "The Carbon Reduction Plan covers the bidding entity, or clearly meets the permitted parent-organisation criteria", requirementType: "narrative", pillar: "governance", mandatoryLevel: "core", sortOrder: 10 },
  { frameworkCode: "PPN006", code: "PPN006-NETZERO", title: "Commitment to UK Net Zero by 2050", description: "A clear commitment to achieving Net Zero for UK operations by 2050", requirementType: "target", pillar: "environmental", mandatoryLevel: "core", sortOrder: 20 },
  { frameworkCode: "PPN006", code: "PPN006-BASELINE", title: "Baseline emissions footprint", description: "Baseline year, additional details and Scope 1, Scope 2 and required Scope 3 baseline emissions", requirementType: "evidence", pillar: "environmental", mandatoryLevel: "core", sortOrder: 30 },
  { frameworkCode: "PPN006", code: "PPN006-CURRENT-S1", title: "Current Scope 1 emissions", description: "Current reporting-year Scope 1 emissions in tCO2e", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 40 },
  { frameworkCode: "PPN006", code: "PPN006-CURRENT-S2", title: "Current Scope 2 emissions", description: "Current reporting-year Scope 2 emissions in tCO2e", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 41 },
  { frameworkCode: "PPN006", code: "PPN006-CURRENT-S3", title: "Current required Scope 3 emissions", description: "Current reporting-year emissions for the five required Scope 3 categories", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 42 },
  { frameworkCode: "PPN006", code: "PPN006-CURRENT-TOTAL", title: "Current total emissions", description: "Total current reporting-year emissions in tCO2e", requirementType: "metric", pillar: "environmental", mandatoryLevel: "core", sortOrder: 43 },
  { frameworkCode: "PPN006", code: "PPN006-SCOPE3", title: "Required Scope 3 category breakdown", description: "Upstream transportation and distribution, waste, business travel, employee commuting and downstream transportation and distribution", requirementType: "evidence", pillar: "environmental", mandatoryLevel: "core", sortOrder: 50 },
  { frameworkCode: "PPN006", code: "PPN006-MEASURES", title: "Completed and planned carbon reduction measures", description: "Environmental management measures completed and measures intended for the contract", requirementType: "narrative", pillar: "environmental", mandatoryLevel: "core", sortOrder: 60 },
  { frameworkCode: "PPN006", code: "PPN006-PUBLICATION", title: "Publication and annual update", description: "Plan published on the supplier website, clearly signposted, dated and updated within the required cycle", requirementType: "evidence", pillar: "governance", mandatoryLevel: "core", sortOrder: 70 },
  { frameworkCode: "PPN006", code: "PPN006-SIGNOFF", title: "Board or director approval and sign-off", description: "Plan approved by the board or a director and signed using the required declaration", requirementType: "evidence", pillar: "governance", mandatoryLevel: "core", sortOrder: 80 },
];

export const METRIC_MAPPINGS: Array<{
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

  // VSME Basic environmental metrics. Multi-datapoint disclosures remain
  // partial until a requirement-specific disclosure/evidence completes them.
  { metricCode: "E001", requirementCode: "VSME-B3-ENERGY", strength: "partial" },
  { metricCode: "E002", requirementCode: "VSME-B3-ENERGY", strength: "partial" },
  { metricCode: "E011", requirementCode: "VSME-B3-ENERGY", strength: "partial" },
  { metricCode: "E012", requirementCode: "VSME-B3-ENERGY", strength: "partial" },
  { metricCode: "E004", requirementCode: "VSME-B3-SCOPE1", strength: "direct" },
  { metricCode: "E005", requirementCode: "VSME-B3-SCOPE2", strength: "direct" },
  { metricCode: "G008", requirementCode: "VSME-B3-INTENSITY", strength: "direct" },
  { metricCode: "E010", requirementCode: "VSME-B6", strength: "direct" },
  { metricCode: "E007", requirementCode: "VSME-B7", strength: "partial" },
  { metricCode: "E008", requirementCode: "VSME-B7", strength: "partial" },
  { metricCode: "E009", requirementCode: "VSME-B7", strength: "partial" },
  { metricCode: "S001", requirementCode: "VSME-B8", strength: "partial" },
  { metricCode: "S003", requirementCode: "VSME-B8", strength: "partial" },
  { metricCode: "S008", requirementCode: "VSME-B8", strength: "partial" },
  { metricCode: "S009", requirementCode: "VSME-B9", strength: "partial" },
  { metricCode: "S007", requirementCode: "VSME-B10", strength: "partial" },
  { metricCode: "S010", requirementCode: "VSME-B10", strength: "partial" },
  { metricCode: "S011", requirementCode: "VSME-B10", strength: "partial" },
  { metricCode: "G011", requirementCode: "VSME-B11", strength: "partial" },
  { metricCode: "G001", requirementCode: "VSME-C9", strength: "partial" },
  { metricCode: "G002", requirementCode: "VSME-C9", strength: "partial" },

  // PPN 006 current footprint. Baseline, category breakdown, publication and
  // sign-off intentionally require requirement-linked records/evidence.
  { metricCode: "E004", requirementCode: "PPN006-CURRENT-S1", strength: "direct" },
  { metricCode: "E005", requirementCode: "PPN006-CURRENT-S2", strength: "direct" },
  { metricCode: "E013", requirementCode: "PPN006-CURRENT-S3", strength: "direct" },
  { metricCode: "E006", requirementCode: "PPN006-CURRENT-TOTAL", strength: "direct" },
];

type FrameworkCatalogueSnapshot = {
  frameworks: Array<{ id: string; code: string }>;
  requirements: Array<{ id: string; frameworkId: string; code: string }>;
  metricDefinitions: Array<{ id: string; code: string }>;
  mappings: Array<{
    metricDefinitionId: string;
    frameworkRequirementId: string;
    mappingStrength: string;
    notes?: string | null;
  }>;
};

const FRAMEWORK_SEED_LOCK = "simplyesg:seed:framework-catalogue";

export function frameworkCatalogueErrors(snapshot: FrameworkCatalogueSnapshot): string[] {
  const errors: string[] = [];
  const frameworksByCode = new Map(snapshot.frameworks.map((framework) => [framework.code, framework]));
  const requirementsByCode = new Map(snapshot.requirements.map((requirement) => [requirement.code, requirement]));
  const metricsByCode = new Map(snapshot.metricDefinitions.map((metric) => [metric.code, metric]));

  for (const seed of FRAMEWORK_SEEDS) {
    if (!frameworksByCode.has(seed.code)) {
      errors.push(`missing framework ${seed.code}`);
    }
  }

  for (const seed of REQUIREMENT_SEEDS) {
    const requirement = requirementsByCode.get(seed.code);
    const framework = frameworksByCode.get(seed.frameworkCode);
    if (!requirement) {
      errors.push(`missing requirement ${seed.code}`);
    } else if (!framework || requirement.frameworkId !== framework.id) {
      errors.push(`requirement ${seed.code} is not linked to ${seed.frameworkCode}`);
    }
  }

  for (const seed of METRIC_MAPPINGS) {
    const metric = metricsByCode.get(seed.metricCode);
    const requirement = requirementsByCode.get(seed.requirementCode);
    if (!metric) {
      errors.push(`mapping ${seed.metricCode}->${seed.requirementCode} is missing metric ${seed.metricCode}`);
      continue;
    }
    if (!requirement) {
      errors.push(`mapping ${seed.metricCode}->${seed.requirementCode} is missing requirement ${seed.requirementCode}`);
      continue;
    }
    const matchingMappings = snapshot.mappings.filter((mapping) =>
      mapping.metricDefinitionId === metric.id
      && mapping.frameworkRequirementId === requirement.id,
    );
    if (matchingMappings.length !== 1) {
      errors.push(
        `mapping ${seed.metricCode}->${seed.requirementCode}: expected exactly one row, found ${matchingMappings.length}`,
      );
      continue;
    }
    const [actualMapping] = matchingMappings;
    if (
      actualMapping.mappingStrength !== seed.strength
      || (actualMapping.notes ?? null) !== (seed.notes ?? null)
    ) {
      errors.push(`mapping ${seed.metricCode}->${seed.requirementCode}: stale strength or notes`);
    }
  }

  return errors;
}

export function assertFrameworkCatalogue(snapshot: FrameworkCatalogueSnapshot): void {
  const errors = frameworkCatalogueErrors(snapshot);
  if (errors.length > 0) {
    throw new Error(`Required framework catalogue is invalid: ${errors.join("; ")}`);
  }
}

export async function seedFrameworks() {
  console.log("[seed-frameworks] Starting framework seed...");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${FRAMEWORK_SEED_LOCK}, 0))`);

    const existingFrameworks = await tx.select().from(frameworks);
    const existingFrameworkByCode = new Map(existingFrameworks.map((framework) => [framework.code, framework]));
    const fwMap: Record<string, string> = {};
    let frameworksCreated = 0;
    for (const fw of FRAMEWORK_SEEDS) {
      const existing = existingFrameworkByCode.get(fw.code);
      if (existing) {
        await tx.update(frameworks).set(fw).where(eq(frameworks.id, existing.id));
        fwMap[fw.code] = existing.id;
        continue;
      }
      const [inserted] = await tx.insert(frameworks).values(fw).returning();
      fwMap[fw.code] = inserted.id;
      frameworksCreated++;
    }

    const existingRequirements = await tx.select().from(frameworkRequirements);
    const existingRequirementByCode = new Map(existingRequirements.map((requirement) => [requirement.code, requirement]));
    const reqMap: Record<string, string> = {};
    for (const req of REQUIREMENT_SEEDS) {
      const frameworkId = fwMap[req.frameworkCode];
      if (!frameworkId) {
        throw new Error(`Cannot seed requirement ${req.code}: framework ${req.frameworkCode} is missing`);
      }
      const values = {
        frameworkId,
        code: req.code,
        title: req.title,
        description: req.description,
        requirementType: req.requirementType,
        pillar: req.pillar,
        mandatoryLevel: req.mandatoryLevel,
        sortOrder: req.sortOrder,
      };
      const existing = existingRequirementByCode.get(req.code);
      if (existing) {
        await tx.update(frameworkRequirements).set(values).where(eq(frameworkRequirements.id, existing.id));
        reqMap[req.code] = existing.id;
        continue;
      }
      const [inserted] = await tx.insert(frameworkRequirements).values(values).returning();
      reqMap[req.code] = inserted.id;
    }

    const metricDefs = await tx.select().from(metricDefinitions);
    const metricCodeMap: Record<string, string> = {};
    for (const md of metricDefs) metricCodeMap[md.code] = md.id;

    for (const mapping of METRIC_MAPPINGS) {
      const metricDefinitionId = metricCodeMap[mapping.metricCode];
      const frameworkRequirementId = reqMap[mapping.requirementCode];
      if (!metricDefinitionId || !frameworkRequirementId) {
        throw new Error(
          `Cannot seed mapping ${mapping.metricCode}->${mapping.requirementCode}: required catalogue entry is missing`,
        );
      }
      await tx.insert(metricFrameworkMappings).values({
        metricDefinitionId,
        frameworkRequirementId,
        mappingStrength: mapping.strength,
        notes: mapping.notes ?? null,
      }).onConflictDoUpdate({
        target: [metricFrameworkMappings.metricDefinitionId, metricFrameworkMappings.frameworkRequirementId],
        set: {
          mappingStrength: mapping.strength,
          notes: mapping.notes ?? null,
        },
      });
    }

    const reconciledFrameworks = await tx.select({ id: frameworks.id, code: frameworks.code }).from(frameworks);
    const reconciledRequirements = await tx.select({
      id: frameworkRequirements.id,
      frameworkId: frameworkRequirements.frameworkId,
      code: frameworkRequirements.code,
    }).from(frameworkRequirements);
    const reconciledMappings = await tx.select({
      metricDefinitionId: metricFrameworkMappings.metricDefinitionId,
      frameworkRequirementId: metricFrameworkMappings.frameworkRequirementId,
      mappingStrength: metricFrameworkMappings.mappingStrength,
      notes: metricFrameworkMappings.notes,
    }).from(metricFrameworkMappings);
    assertFrameworkCatalogue({
      frameworks: reconciledFrameworks,
      requirements: reconciledRequirements,
      metricDefinitions: metricDefs.map(({ id, code }) => ({ id, code })),
      mappings: reconciledMappings,
    });

    return { frameworksCreated };
  });

  console.log(`[seed-frameworks] Reconciled ${FRAMEWORK_SEEDS.length} frameworks (${result.frameworksCreated} created)`);
  console.log(`[seed-frameworks] Reconciled ${REQUIREMENT_SEEDS.length} framework requirements`);
  console.log(`[seed-frameworks] Reconciled ${METRIC_MAPPINGS.length} metric-framework mappings`);
  console.log("[seed-frameworks] Framework seeding complete.");
}
