export interface TemplateSection {
  key: string;
  label: string;
  defaultClauseText: string;
  aiPromptHint: string;
}

export interface QuestionDef {
  key: string;
  label: string;
  type: "text" | "select" | "multiselect" | "checkbox" | "number";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export interface ComplianceMapping {
  isoStandards: string[];
  legalDrivers: string[];
  customerQuestionnaireUses: string[];
}

export interface PolicyTemplateData {
  slug: string;
  name: string;
  category: string;
  description: string;
  sections: TemplateSection[];
  questionnaire: QuestionDef[];
  complianceMapping: ComplianceMapping;
  defaultReviewCycle: string;
}

const STANDARD_SECTIONS: TemplateSection[] = [
  { key: "purpose", label: "Purpose", defaultClauseText: "", aiPromptHint: "Write a clear purpose statement for this policy, explaining why it exists and what it aims to achieve." },
  { key: "scope", label: "Scope", defaultClauseText: "", aiPromptHint: "Define who and what this policy applies to — employees, contractors, suppliers, sites, geographies." },
  { key: "commitments", label: "Policy Commitments", defaultClauseText: "", aiPromptHint: "List the core commitments the organisation makes under this policy, using active language." },
  { key: "roles", label: "Roles & Responsibilities", defaultClauseText: "", aiPromptHint: "Define who is responsible for policy ownership, implementation, monitoring, and compliance. Include board, management, and staff roles." },
  { key: "controls", label: "Operating Rules & Controls", defaultClauseText: "", aiPromptHint: "Describe the key operational controls, procedures, and rules that implement this policy day-to-day." },
  { key: "reporting", label: "Reporting & Escalation", defaultClauseText: "", aiPromptHint: "Explain how incidents, concerns, or non-compliance should be reported and escalated." },
  { key: "training", label: "Training & Awareness", defaultClauseText: "", aiPromptHint: "Describe the training and awareness programme to ensure all relevant parties understand this policy." },
  { key: "monitoring", label: "Monitoring & Review", defaultClauseText: "", aiPromptHint: "Explain how the policy will be monitored for effectiveness and when it will be reviewed." },
  { key: "relatedDocs", label: "Related Documents", defaultClauseText: "", aiPromptHint: "List related policies, procedures, standards, and legislation that support this policy." },
  { key: "versionControl", label: "Version Control & Approval", defaultClauseText: "", aiPromptHint: "Provide version control block including version number, date, author, approver, and next review date." },
];

const COMMON_QUESTIONS: QuestionDef[] = [
  { key: "companyName", label: "Company Name", type: "text", required: true, placeholder: "e.g. Acme Manufacturing Ltd" },
  { key: "legalEntity", label: "Legal Entity Name", type: "text", placeholder: "e.g. Acme Holdings PLC" },
  { key: "sector", label: "Industry Sector", type: "select", required: true, options: ["Manufacturing", "Technology", "Professional Services", "Retail", "Construction", "Healthcare", "Hospitality", "Education", "Energy", "Transport & Logistics", "Financial Services", "Other"] },
  { key: "employeeCount", label: "Number of Employees", type: "number", required: true, placeholder: "e.g. 50" },
  { key: "countries", label: "Countries of Operation", type: "text", required: true, placeholder: "e.g. United Kingdom, Ireland" },
  { key: "setupType", label: "Business Setup", type: "multiselect", options: ["Office", "Warehouse", "Manufacturing Site", "Remote Workers", "Retail Premises", "Construction Sites", "Laboratories"] },
  { key: "customerRequirements", label: "Customer or Tender Requirements", type: "text", placeholder: "e.g. ISO 9001 required by major clients" },
  { key: "certifications", label: "Certifications Sought", type: "multiselect", options: ["ISO 9001 (Quality)", "ISO 14001 (Environmental)", "ISO 45001 (Health & Safety)", "ISO 27001 (Information Security)", "ISO 50001 (Energy)", "None / Not sure"] },
  { key: "keyRisks", label: "Key Risks Relevant to This Policy", type: "text", placeholder: "Describe the main risks..." },
  { key: "policyOwner", label: "Policy Owner (Named Person)", type: "text", required: true, placeholder: "e.g. Jane Smith, Operations Director" },
  { key: "approver", label: "Policy Approver (Named Person)", type: "text", required: true, placeholder: "e.g. John Davies, Managing Director" },
  { key: "tone", label: "Desired Tone", type: "select", required: true, options: ["Simple SME — plain language, practical", "Audit-ready — formal, detailed, ISO-aligned"] },
];

export const POLICY_TEMPLATES: PolicyTemplateData[] = [
  {
    slug: "quality-policy",
    name: "Quality Policy",
    category: "Quality",
    description: "Defines the organisation's commitment to delivering consistent quality in products and services, meeting customer requirements, and driving continual improvement.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "productsServices", label: "Main Products or Services", type: "text", placeholder: "e.g. Precision-machined metal components" },
      { key: "qualityObjectives", label: "Key Quality Objectives", type: "text", placeholder: "e.g. Zero customer complaints, on-time delivery >98%" },
      { key: "hasQMS", label: "Do you have a Quality Management System?", type: "checkbox" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015"],
      legalDrivers: ["Consumer Rights Act 2015", "Supply of Goods and Services Act 1982", "Product safety regulations"],
      customerQuestionnaireUses: ["Quality management approach", "Continual improvement process", "Customer complaint handling"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "environmental-policy",
    name: "Environmental Policy",
    category: "Environmental",
    description: "Sets out the organisation's commitment to minimising environmental impact, preventing pollution, and meeting environmental legal requirements.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "significantAspects", label: "Significant Environmental Aspects", type: "text", placeholder: "e.g. Energy use, waste, water, emissions" },
      { key: "hasEnvironmentalPermits", label: "Do you hold any environmental permits or licences?", type: "checkbox" },
      { key: "carbonTarget", label: "Carbon Reduction Target", type: "text", placeholder: "e.g. Net zero by 2050" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 14001:2015"],
      legalDrivers: ["Environmental Protection Act 1990", "Climate Change Act 2008", "ESOS / SECR regulations", "Waste duty of care"],
      customerQuestionnaireUses: ["Environmental management approach", "Carbon reduction plans", "Waste management practices"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "health-safety-policy",
    name: "Health & Safety Policy",
    category: "Health & Safety",
    description: "Outlines the organisation's commitment to providing a safe and healthy workplace, managing risks, and complying with health and safety legislation.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "highRiskActivities", label: "High-Risk Activities", type: "text", placeholder: "e.g. Working at height, manual handling, machinery" },
      { key: "hasCompetentPerson", label: "Do you have a competent person for H&S advice?", type: "checkbox" },
      { key: "accidentRate", label: "Recent Accident/Incident Rate", type: "text", placeholder: "e.g. 2 RIDDOR reports in last 12 months" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 45001:2018"],
      legalDrivers: ["Health and Safety at Work etc. Act 1974", "Management of Health and Safety at Work Regulations 1999", "RIDDOR 2013", "COSHH 2002"],
      customerQuestionnaireUses: ["H&S management system", "Risk assessment approach", "Incident reporting procedures"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "information-security-policy",
    name: "Information Security Policy",
    category: "Information Security",
    description: "Establishes the framework for protecting information assets, managing cyber risks, and ensuring confidentiality, integrity, and availability of data.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "dataTypes", label: "Types of Sensitive Data Handled", type: "text", placeholder: "e.g. Customer PII, financial records, IP" },
      { key: "hasITTeam", label: "Do you have an in-house IT team?", type: "checkbox" },
      { key: "cloudServices", label: "Key Cloud Services Used", type: "text", placeholder: "e.g. Microsoft 365, AWS, Salesforce" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 27001:2022"],
      legalDrivers: ["UK GDPR", "Data Protection Act 2018", "Computer Misuse Act 1990", "NIS Regulations 2018"],
      customerQuestionnaireUses: ["Information security management", "Cyber security measures", "Data handling procedures"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "data-protection-policy",
    name: "Data Protection Policy",
    category: "Governance",
    description: "Sets out how the organisation collects, processes, stores, and protects personal data in compliance with data protection legislation.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "dataSubjects", label: "Data Subjects", type: "text", placeholder: "e.g. Employees, customers, suppliers, website visitors" },
      { key: "hasDPO", label: "Do you have a Data Protection Officer?", type: "checkbox" },
      { key: "internationalTransfers", label: "Do you transfer data outside the UK/EEA?", type: "checkbox" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 27001:2022", "ISO 27701:2019"],
      legalDrivers: ["UK GDPR", "Data Protection Act 2018", "Privacy and Electronic Communications Regulations 2003"],
      customerQuestionnaireUses: ["Data protection practices", "GDPR compliance", "Data retention policies"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "risk-management-procedure",
    name: "Risk Management Procedure",
    category: "Governance",
    description: "Describes how risks are identified, assessed, mitigated, and monitored across the organisation to protect against threats and exploit opportunities.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "riskCategories", label: "Key Risk Categories", type: "text", placeholder: "e.g. Operational, financial, compliance, strategic" },
      { key: "hasRiskRegister", label: "Do you maintain a risk register?", type: "checkbox" },
      { key: "riskAppetite", label: "Organisation's Risk Appetite", type: "select", options: ["Risk averse", "Cautious", "Balanced", "Open to risk"] },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015", "ISO 14001:2015", "ISO 45001:2018", "ISO 31000:2018"],
      legalDrivers: ["Companies Act 2006 (strategic report)", "Corporate governance codes", "Industry-specific regulations"],
      customerQuestionnaireUses: ["Risk management approach", "Business continuity planning", "Supply chain risk management"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "document-control-procedure",
    name: "Document Control Procedure",
    category: "Quality",
    description: "Defines how documents and records are created, approved, distributed, updated, and archived to maintain integrity and traceability.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "documentTypes", label: "Key Document Types Managed", type: "text", placeholder: "e.g. Policies, procedures, work instructions, forms" },
      { key: "hasDMS", label: "Do you use a document management system?", type: "checkbox" },
      { key: "retentionPeriod", label: "Default Record Retention Period", type: "text", placeholder: "e.g. 7 years" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015 (7.5)", "ISO 14001:2015 (7.5)", "ISO 45001:2018 (7.5)"],
      legalDrivers: ["Limitation Act 1980", "Companies Act 2006", "HMRC record-keeping requirements"],
      customerQuestionnaireUses: ["Document control procedures", "Record retention", "Change management"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "nonconformity-corrective-action",
    name: "Nonconformity & Corrective Action Procedure",
    category: "Quality",
    description: "Establishes the process for identifying, recording, investigating, and resolving nonconformities, and implementing corrective actions to prevent recurrence.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "ncSources", label: "Common Sources of Nonconformity", type: "text", placeholder: "e.g. Customer complaints, audits, inspections" },
      { key: "hasNCRegister", label: "Do you maintain a nonconformity register?", type: "checkbox" },
      { key: "rootCauseMethod", label: "Root Cause Analysis Method Used", type: "text", placeholder: "e.g. 5 Whys, fishbone diagram" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015 (10.2)", "ISO 14001:2015 (10.2)", "ISO 45001:2018 (10.2)"],
      legalDrivers: ["Product liability regulations", "Consumer protection legislation", "Industry-specific quality requirements"],
      customerQuestionnaireUses: ["Nonconformity handling", "Corrective action process", "Root cause analysis"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "internal-audit-procedure",
    name: "Internal Audit Procedure",
    category: "Governance",
    description: "Describes how internal audits are planned, conducted, reported, and followed up to verify management system effectiveness and compliance.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "auditFrequency", label: "Planned Audit Frequency", type: "select", options: ["Monthly", "Quarterly", "Bi-annual", "Annual"] },
      { key: "hasTrainedAuditors", label: "Do you have trained internal auditors?", type: "checkbox" },
      { key: "auditScope", label: "Audit Scope", type: "text", placeholder: "e.g. All departments and processes" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015 (9.2)", "ISO 14001:2015 (9.2)", "ISO 45001:2018 (9.2)", "ISO 19011:2018"],
      legalDrivers: ["Regulatory audit requirements", "Industry-specific compliance audits"],
      customerQuestionnaireUses: ["Internal audit programme", "Audit findings and follow-up", "Continual improvement evidence"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "management-review-procedure",
    name: "Management Review Procedure",
    category: "Governance",
    description: "Defines how top management reviews the management system at planned intervals to ensure its continuing suitability, adequacy, and effectiveness.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "reviewFrequency", label: "Management Review Frequency", type: "select", options: ["Monthly", "Quarterly", "Bi-annual", "Annual"] },
      { key: "attendees", label: "Typical Attendees", type: "text", placeholder: "e.g. MD, Operations Director, Quality Manager" },
      { key: "kpiReviewed", label: "KPIs Reviewed", type: "text", placeholder: "e.g. Customer satisfaction, audit results, NC trends" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015 (9.3)", "ISO 14001:2015 (9.3)", "ISO 45001:2018 (9.3)"],
      legalDrivers: ["Corporate governance requirements", "Directors' duties under Companies Act 2006"],
      customerQuestionnaireUses: ["Management commitment evidence", "Continual improvement planning", "Strategic direction"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "incident-reporting-procedure",
    name: "Incident Reporting & Investigation Procedure",
    category: "Health & Safety",
    description: "Establishes how workplace incidents, accidents, near misses, and dangerous occurrences are reported, investigated, and followed up.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "incidentTypes", label: "Types of Incidents to Report", type: "text", placeholder: "e.g. Injuries, near misses, dangerous occurrences, environmental spills" },
      { key: "hasFirstAiders", label: "Do you have trained first aiders on site?", type: "checkbox" },
      { key: "reportingSystem", label: "Current Reporting System", type: "text", placeholder: "e.g. Paper forms, software, email" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 45001:2018 (10.2)"],
      legalDrivers: ["RIDDOR 2013", "Health and Safety at Work etc. Act 1974", "Social Security (Claims and Payments) Regulations 1979"],
      customerQuestionnaireUses: ["Incident reporting procedures", "Investigation methodology", "Lessons learned process"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "emergency-preparedness-procedure",
    name: "Emergency Preparedness & Response Procedure",
    category: "Health & Safety",
    description: "Defines how the organisation prepares for, responds to, and recovers from emergency situations including fire, chemical spills, and natural disasters.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "emergencyTypes", label: "Potential Emergency Scenarios", type: "text", placeholder: "e.g. Fire, flood, chemical spill, power failure, pandemic" },
      { key: "hasEvacPlan", label: "Do you have evacuation plans and routes?", type: "checkbox" },
      { key: "drillFrequency", label: "Emergency Drill Frequency", type: "select", options: ["Monthly", "Quarterly", "Bi-annual", "Annual"] },
    ],
    complianceMapping: {
      isoStandards: ["ISO 14001:2015 (8.2)", "ISO 45001:2018 (8.2)"],
      legalDrivers: ["Regulatory Reform (Fire Safety) Order 2005", "COMAH Regulations 2015", "Civil Contingencies Act 2004"],
      customerQuestionnaireUses: ["Emergency response planning", "Business continuity", "Site safety procedures"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "supplier-code-of-conduct",
    name: "Supplier Code of Conduct",
    category: "Supply Chain",
    description: "Sets out the minimum ethical, environmental, social, and governance standards expected of all suppliers and subcontractors.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "supplierCount", label: "Approximate Number of Active Suppliers", type: "number", placeholder: "e.g. 150" },
      { key: "highRiskSuppliers", label: "High-Risk Supply Chain Areas", type: "text", placeholder: "e.g. Raw materials from Asia, sub-contracted labour" },
      { key: "hasSupplierAudits", label: "Do you audit or assess suppliers?", type: "checkbox" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015 (8.4)", "ISO 14001:2015 (8.1)", "ISO 20400:2017"],
      legalDrivers: ["Modern Slavery Act 2015", "Bribery Act 2010", "Environmental Protection Act 1990"],
      customerQuestionnaireUses: ["Supply chain management", "Ethical sourcing", "Supplier ESG requirements"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "modern-slavery-policy",
    name: "Modern Slavery Policy",
    category: "Social",
    description: "Sets out the organisation's commitment to preventing modern slavery, human trafficking, and forced or compulsory labour in its operations and supply chain.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "turnover", label: "Annual Turnover", type: "text", placeholder: "e.g. £36m (note: MSA statement legally required if >£36m)" },
      { key: "supplyChainRisks", label: "Supply Chain Slavery Risks", type: "text", placeholder: "e.g. Overseas manufacturing, agency labour, cleaning contracts" },
      { key: "hasDueDiligence", label: "Do you conduct modern slavery due diligence on suppliers?", type: "checkbox" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 45001:2018", "SA8000"],
      legalDrivers: ["Modern Slavery Act 2015", "Human Rights Act 1998", "Gangmasters (Licensing) Act 2004"],
      customerQuestionnaireUses: ["Modern slavery statement", "Supply chain due diligence", "Worker welfare practices"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "anti-bribery-corruption-policy",
    name: "Anti-Bribery & Corruption Policy",
    category: "Governance",
    description: "Establishes zero tolerance for bribery and corruption, setting out the controls, reporting mechanisms, and responsibilities to prevent improper conduct.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "giftThreshold", label: "Gifts & Hospitality Threshold", type: "text", placeholder: "e.g. £50 reporting threshold" },
      { key: "highRiskCountries", label: "High-Risk Countries for Bribery", type: "text", placeholder: "e.g. Countries on Transparency International watchlist" },
      { key: "hasGiftRegister", label: "Do you maintain a gifts & hospitality register?", type: "checkbox" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 37001:2016"],
      legalDrivers: ["Bribery Act 2010", "Proceeds of Crime Act 2002", "Criminal Finances Act 2017"],
      customerQuestionnaireUses: ["Anti-bribery measures", "Ethics and compliance", "Gifts and hospitality policy"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "sustainability-carbon-reduction-policy",
    name: "Sustainability / Carbon Reduction Policy",
    category: "Environmental",
    description: "Outlines the organisation's strategy and commitments for reducing carbon emissions, improving resource efficiency, and contributing to sustainable development.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "baselineYear", label: "Carbon Baseline Year", type: "text", placeholder: "e.g. 2022" },
      { key: "netZeroTarget", label: "Net Zero Target Year", type: "text", placeholder: "e.g. 2050" },
      { key: "scope3Included", label: "Do you measure Scope 3 emissions?", type: "checkbox" },
      { key: "reportingFramework", label: "Reporting Framework Used", type: "text", placeholder: "e.g. GHG Protocol, SECR, TCFD" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 14001:2015", "ISO 50001:2018", "ISO 14064:2018"],
      legalDrivers: ["Climate Change Act 2008", "SECR Regulations", "ESOS Regulations", "Environment Act 2021"],
      customerQuestionnaireUses: ["Carbon reduction plans", "Net zero commitments", "Environmental sustainability strategy"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "equality-diversity-inclusion-policy",
    name: "Equality, Diversity & Inclusion Policy",
    category: "Social",
    description: "Commits the organisation to promoting equality, valuing diversity, and fostering an inclusive workplace free from discrimination, harassment, and victimisation.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "protectedCharacteristics", label: "Areas of Focus", type: "text", placeholder: "e.g. Gender pay gap, ethnic diversity, disability inclusion" },
      { key: "hasEDITraining", label: "Do you provide EDI training?", type: "checkbox" },
      { key: "diversityReporting", label: "Do you publish diversity data?", type: "checkbox" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 45001:2018", "ISO 30415:2021"],
      legalDrivers: ["Equality Act 2010", "Gender Pay Gap Regulations 2017", "Public Sector Equality Duty"],
      customerQuestionnaireUses: ["Diversity and inclusion practices", "Equal opportunities", "Workplace culture"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "whistleblowing-policy",
    name: "Whistleblowing Policy",
    category: "Governance",
    description: "Provides a safe, confidential mechanism for employees and stakeholders to raise concerns about wrongdoing, malpractice, or unethical conduct without fear of retaliation.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "reportingChannels", label: "Reporting Channels Available", type: "text", placeholder: "e.g. Line manager, HR, anonymous hotline, external body" },
      { key: "hasAnonymousChannel", label: "Do you offer an anonymous reporting channel?", type: "checkbox" },
      { key: "whistleblowingOfficer", label: "Named Whistleblowing Officer", type: "text", placeholder: "e.g. HR Director" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 37002:2021"],
      legalDrivers: ["Public Interest Disclosure Act 1998", "Employment Rights Act 1996", "Financial Conduct Authority requirements"],
      customerQuestionnaireUses: ["Whistleblowing procedures", "Ethics and integrity", "Reporting mechanisms"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "net-zero-climate-change-policy",
    name: "Net Zero / Climate Change Policy",
    category: "Environmental",
    description: "Sets out the organisation's commitment to achieving net zero carbon emissions, including targets, reduction actions, and governance of climate-related risks.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "netZeroTargetYear", label: "Target Year for Net Zero", type: "text", required: true, placeholder: "e.g. 2050" },
      { key: "measuresScope1", label: "Do you currently measure Scope 1 emissions?", type: "checkbox" },
      { key: "measuresScope2", label: "Do you currently measure Scope 2 emissions?", type: "checkbox" },
      { key: "includeScope3", label: "Do you want to mention Scope 3 emissions?", type: "checkbox" },
      { key: "reductionActions", label: "Main Reduction Actions", type: "multiselect", options: ["Energy efficiency", "Renewable electricity", "Travel reduction", "Supplier engagement", "Fleet electrification", "Process improvements"] },
      { key: "climateReviewer", label: "Who is responsible for reviewing this policy?", type: "text", placeholder: "e.g. Sustainability Manager" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 14001:2015", "ISO 14064:2018", "ISO 50001:2018"],
      legalDrivers: ["Climate Change Act 2008", "Environment Act 2021", "SECR Regulations", "TCFD recommendations"],
      customerQuestionnaireUses: ["Net zero commitments", "Carbon reduction strategy", "Climate risk management"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "energy-management-policy",
    name: "Energy Management Policy",
    category: "Environmental",
    description: "Defines how the organisation monitors, manages, and reduces energy consumption across its operations to improve efficiency and lower costs.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "energySources", label: "Main Sources of Energy Use", type: "multiselect", options: ["Electricity", "Natural gas", "Diesel / fuel oil", "LPG", "Renewable on-site generation", "District heating"] },
      { key: "monitorsMonthly", label: "Do you monitor electricity consumption monthly?", type: "checkbox" },
      { key: "usesGasOrFuel", label: "Does the company use gas, fuels, or both?", type: "select", options: ["Gas only", "Fuels only", "Both gas and fuels", "Neither"] },
      { key: "hasReductionTargets", label: "Are there energy reduction targets?", type: "checkbox" },
      { key: "usesRenewable", label: "Is renewable electricity used?", type: "checkbox" },
      { key: "energyDataOwner", label: "Who owns energy data?", type: "text", placeholder: "e.g. Facilities Manager" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 50001:2018", "ISO 14001:2015"],
      legalDrivers: ["ESOS Regulations", "SECR Regulations", "Building Regulations Part L", "Climate Change Agreements"],
      customerQuestionnaireUses: ["Energy management approach", "Energy reduction targets", "Renewable energy use"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "waste-management-policy",
    name: "Waste Management Policy",
    category: "Environmental",
    description: "Establishes the organisation's approach to minimising waste generation, maximising recycling, and ensuring compliant disposal of all waste streams.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "wasteStreams", label: "What waste streams exist?", type: "multiselect", options: ["General waste", "Dry mixed recycling", "Hazardous waste", "Electronic waste (WEEE)", "Food waste", "Construction waste", "Metal / scrap"] },
      { key: "tracksVolumes", label: "Does the business track waste volumes?", type: "checkbox" },
      { key: "hasRecyclingTargets", label: "Are there recycling targets?", type: "checkbox" },
      { key: "usesLicensedContractors", label: "Are licensed waste contractors used?", type: "checkbox" },
      { key: "wasteResponsible", label: "Who is responsible for waste management?", type: "text", placeholder: "e.g. Operations Manager" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 14001:2015"],
      legalDrivers: ["Environmental Protection Act 1990", "Waste (England and Wales) Regulations 2011", "Hazardous Waste Regulations 2005", "WEEE Regulations 2013", "Duty of Care regulations"],
      customerQuestionnaireUses: ["Waste management practices", "Recycling rates", "Hazardous waste handling"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "code-of-conduct",
    name: "Code of Conduct",
    category: "Governance",
    description: "Sets out the ethical standards, behaviours, and responsibilities expected of all employees and, where applicable, suppliers and partners.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "appliesToSuppliers", label: "Should this apply to employees only or employees plus suppliers?", type: "select", options: ["Employees only", "Employees and suppliers", "Employees, suppliers, and partners"] },
      { key: "includeAntiBribery", label: "Should it include anti-bribery language?", type: "checkbox" },
      { key: "includeHumanRights", label: "Should it include human rights language?", type: "checkbox" },
      { key: "includeEnvironmental", label: "Should it include environmental responsibility language?", type: "checkbox" },
      { key: "concernsReporting", label: "How should concerns be reported?", type: "text", placeholder: "e.g. Line manager, HR, anonymous hotline" },
      { key: "codeOwner", label: "Who owns and reviews the policy?", type: "text", placeholder: "e.g. HR Director" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 37001:2016", "ISO 37301:2021"],
      legalDrivers: ["Bribery Act 2010", "Equality Act 2010", "Modern Slavery Act 2015", "Employment Rights Act 1996"],
      customerQuestionnaireUses: ["Ethical standards", "Employee conduct expectations", "Supplier code of conduct"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "esg-sustainability-policy",
    name: "ESG / Sustainability Policy",
    category: "Governance",
    description: "Provides an overarching framework for the organisation's environmental, social, and governance commitments, linking ESG principles to business strategy.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "esgTopicsInScope", label: "Which ESG topics are in scope?", type: "multiselect", options: ["Carbon reduction", "Energy management", "Waste and recycling", "Diversity and inclusion", "Health and safety", "Supply chain ethics", "Data protection", "Anti-bribery", "Community engagement"] },
      { key: "reportsMetrics", label: "Does the company report ESG metrics?", type: "checkbox" },
      { key: "mentionCarbon", label: "Does it want to mention carbon reduction?", type: "checkbox" },
      { key: "mentionDiversity", label: "Does it want to mention diversity and inclusion?", type: "checkbox" },
      { key: "mentionSupplierStandards", label: "Does it want to mention supplier standards?", type: "checkbox" },
      { key: "esgReviewer", label: "Who reviews the policy?", type: "text", placeholder: "e.g. ESG Lead, Managing Director" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 14001:2015", "ISO 45001:2018", "ISO 26000:2010"],
      legalDrivers: ["Companies Act 2006 (s172 statement)", "SECR Regulations", "Modern Slavery Act 2015", "Equality Act 2010"],
      customerQuestionnaireUses: ["ESG strategy and commitments", "Sustainability reporting", "Stakeholder engagement"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "business-continuity-policy",
    name: "Business Continuity Policy",
    category: "Governance",
    description: "Defines how the organisation prepares for, responds to, and recovers from disruptions to maintain critical business functions and minimise downtime.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "mainRisks", label: "What are the main business risks?", type: "text", placeholder: "e.g. IT failure, supply chain disruption, key person dependency" },
      { key: "siteCount", label: "Does the company depend on one site or multiple sites?", type: "select", options: ["Single site", "Multiple sites", "Primarily remote / hybrid"] },
      { key: "cloudCritical", label: "Are cloud systems critical to operations?", type: "checkbox" },
      { key: "hasDisasterRecovery", label: "Is there already a disaster recovery process?", type: "checkbox" },
      { key: "incidentResponsible", label: "Who is responsible during an incident?", type: "text", placeholder: "e.g. IT Manager, Operations Director" },
      { key: "bcpReviewFrequency", label: "How often should continuity planning be reviewed?", type: "select", options: ["Quarterly", "Bi-annual", "Annual"] },
    ],
    complianceMapping: {
      isoStandards: ["ISO 22301:2019"],
      legalDrivers: ["Civil Contingencies Act 2004", "FCA operational resilience requirements", "Companies Act 2006 (directors' duties)"],
      customerQuestionnaireUses: ["Business continuity planning", "Disaster recovery capability", "Operational resilience"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "conflicts-of-interest-policy",
    name: "Conflicts of Interest Policy",
    category: "Governance",
    description: "Establishes the framework for identifying, declaring, and managing actual or potential conflicts of interest to protect the integrity of decision-making.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "policyAppliesTo", label: "Who does the policy apply to?", type: "select", options: ["Directors and senior managers only", "All employees", "All employees plus contractors"] },
      { key: "conflictTypes", label: "What types of conflicts should be disclosed?", type: "multiselect", options: ["Financial interests", "External employment", "Family or personal relationships", "Gifts and hospitality", "Board memberships", "Shareholdings in competitors or suppliers"] },
      { key: "includeGifts", label: "Should gifts and hospitality be referenced?", type: "checkbox" },
      { key: "disclosureRecipient", label: "Who receives disclosures?", type: "text", placeholder: "e.g. HR Director, Company Secretary" },
      { key: "escalationProcess", label: "What is the escalation process?", type: "text", placeholder: "e.g. Disclosed to line manager, escalated to board if material" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 37001:2016", "ISO 37301:2021"],
      legalDrivers: ["Companies Act 2006 (s175-177)", "Bribery Act 2010", "Charity Commission guidance (if applicable)"],
      customerQuestionnaireUses: ["Conflict of interest management", "Governance and ethics", "Decision-making integrity"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "employee-wellbeing-policy",
    name: "Employee Wellbeing Policy",
    category: "Social",
    description: "Outlines the organisation's commitment to supporting employee physical and mental health, managing workplace stress, and fostering a positive working environment.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "wellbeingTopics", label: "What wellbeing topics should be included?", type: "multiselect", options: ["Mental health", "Stress management", "Workload management", "Employee support services", "Physical health", "Work-life balance"] },
      { key: "offersFlexibleWorking", label: "Does the company offer flexible working?", type: "checkbox" },
      { key: "managerCheckIns", label: "Are managers expected to support wellbeing check-ins?", type: "checkbox" },
      { key: "hasEAP", label: "Is there an employee assistance programme?", type: "checkbox" },
      { key: "wellbeingOwner", label: "Who owns the policy?", type: "text", placeholder: "e.g. HR Manager" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 45001:2018", "ISO 45003:2021"],
      legalDrivers: ["Health and Safety at Work etc. Act 1974", "Management of Health and Safety at Work Regulations 1999", "Equality Act 2010 (reasonable adjustments)"],
      customerQuestionnaireUses: ["Employee welfare practices", "Mental health support", "Workplace culture"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "training-development-policy",
    name: "Training & Development Policy",
    category: "Social",
    description: "Defines how the organisation plans, delivers, records, and evaluates training to ensure workforce competence, compliance, and professional development.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "requiresAnnualPlans", label: "Does the company require annual training plans?", type: "checkbox" },
      { key: "includesComplianceESG", label: "Are compliance and ESG topics included in training?", type: "checkbox" },
      { key: "managerReviews", label: "Should managers hold development reviews?", type: "checkbox" },
      { key: "trainingTrackedCentrally", label: "Is training tracked centrally?", type: "checkbox" },
      { key: "trainingApprover", label: "Who approves training priorities?", type: "text", placeholder: "e.g. HR Manager, Department Heads" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 9001:2015 (7.2)", "ISO 14001:2015 (7.2)", "ISO 45001:2018 (7.2)"],
      legalDrivers: ["Health and Safety at Work etc. Act 1974", "Equality Act 2010", "Industry-specific competence requirements"],
      customerQuestionnaireUses: ["Staff competence and training", "CPD programmes", "Compliance training records"],
    },
    defaultReviewCycle: "annual",
  },
  {
    slug: "data-retention-classification-policy",
    name: "Data Retention & Classification Policy",
    category: "Information Security",
    description: "Establishes how the organisation classifies, retains, and securely disposes of data across all categories to meet legal, regulatory, and business requirements.",
    sections: STANDARD_SECTIONS,
    questionnaire: [
      ...COMMON_QUESTIONS,
      { key: "dataCategories", label: "What data categories exist?", type: "multiselect", options: ["Employee data", "Customer data", "Supplier data", "Financial data", "Operational data", "Health and safety records", "Legal and contractual"] },
      { key: "classificationLevels", label: "Does the company want classification levels?", type: "select", options: ["Yes — Public / Internal / Confidential", "Yes — Public / Internal / Confidential / Restricted", "No — not yet defined"] },
      { key: "retentionDefined", label: "Are retention periods already defined?", type: "checkbox" },
      { key: "deletionApprover", label: "Who approves deletion or disposal?", type: "text", placeholder: "e.g. Data Protection Officer, IT Manager" },
      { key: "dataRetentionOwner", label: "Who owns the policy?", type: "text", placeholder: "e.g. IT Manager, Compliance Officer" },
    ],
    complianceMapping: {
      isoStandards: ["ISO 27001:2022", "ISO 27701:2019"],
      legalDrivers: ["UK GDPR (Article 5, 17)", "Data Protection Act 2018", "Limitation Act 1980", "HMRC record-keeping requirements"],
      customerQuestionnaireUses: ["Data retention practices", "Data classification framework", "Information lifecycle management"],
    },
    defaultReviewCycle: "annual",
  },
];
