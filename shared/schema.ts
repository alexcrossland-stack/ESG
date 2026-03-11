import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, decimal, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["admin", "editor", "contributor", "approver", "viewer"]);
export const metricCategoryEnum = pgEnum("metric_category", ["environmental", "social", "governance"]);
export const metricFrequencyEnum = pgEnum("metric_frequency", ["monthly", "quarterly", "annual"]);
export const metricTypeEnum = pgEnum("metric_type", ["manual", "calculated", "derived"]);
export const metricDirectionEnum = pgEnum("metric_direction", ["higher_is_better", "lower_is_better", "target_range", "compliance_yes_no"]);
export const trafficLightEnum = pgEnum("traffic_light", ["green", "amber", "red"]);
export const actionStatusEnum = pgEnum("action_status", ["not_started", "in_progress", "complete", "overdue"]);
export const policyStatusEnum = pgEnum("policy_status", ["draft", "published"]);
export const reportTypeEnum = pgEnum("report_type", ["pdf", "csv", "word"]);
export const workflowStatusEnum = pgEnum("workflow_status", ["draft", "submitted", "approved", "rejected", "archived"]);
export const dataSourceTypeEnum = pgEnum("data_source_type", ["evidenced", "estimated", "manual"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default("contributor"),
  companyId: varchar("company_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry"),
  country: text("country"),
  employeeCount: integer("employee_count"),
  revenueBand: text("revenue_band"),
  locations: integer("locations").default(1),
  businessType: text("business_type"),
  hasVehicles: boolean("has_vehicles").default(false),
  operationalProfile: text("operational_profile"),
  reportingYearStart: text("reporting_year_start"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  onboardingPath: text("onboarding_path"),
  onboardingStep: integer("onboarding_step").default(0),
  onboardingProgressPercent: integer("onboarding_progress_percent").default(0),
  onboardingStartedAt: timestamp("onboarding_started_at"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  esgMaturity: text("esg_maturity"),
  selectedModules: jsonb("selected_modules"),
  selectedMetrics: jsonb("selected_metrics"),
  onboardingAnswers: jsonb("onboarding_answers"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  trackEnergy: boolean("track_energy").default(true),
  trackWaste: boolean("track_waste").default(true),
  trackWater: boolean("track_water").default(false),
  trackDiversity: boolean("track_diversity").default(true),
  trackTraining: boolean("track_training").default(true),
  trackHealthSafety: boolean("track_health_safety").default(true),
  trackGovernance: boolean("track_governance").default(true),
});

export const esgPolicies = pgTable("esg_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  status: policyStatusEnum("status").default("draft"),
  publishedAt: timestamp("published_at"),
  reviewDate: timestamp("review_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const policyVersions = pgTable("policy_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  content: jsonb("content"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const materialTopics = pgTable("material_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  topic: text("topic").notNull(),
  category: metricCategoryEnum("category").notNull(),
  selected: boolean("selected").default(false),
});

export const metrics = pgTable("metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: metricCategoryEnum("category").notNull(),
  unit: text("unit"),
  frequency: metricFrequencyEnum("frequency").default("monthly"),
  dataOwner: text("data_owner"),
  enabled: boolean("enabled").default(true),
  isDefault: boolean("is_default").default(false),
  metricType: text("metric_type").default("manual"),
  calculationType: text("calculation_type"),
  formulaText: text("formula_text"),
  direction: text("direction").default("higher_is_better"),
  targetValue: decimal("target_value", { precision: 15, scale: 4 }),
  targetMin: decimal("target_min", { precision: 15, scale: 4 }),
  targetMax: decimal("target_max", { precision: 15, scale: 4 }),
  displayOrder: integer("display_order").default(0),
  helpText: text("help_text"),
  amberThreshold: decimal("amber_threshold", { precision: 5, scale: 2 }).default("5"),
  redThreshold: decimal("red_threshold", { precision: 5, scale: 2 }).default("15"),
  weight: decimal("weight", { precision: 5, scale: 2 }).default("1"),
  importance: text("importance").default("standard"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const metricTargets = pgTable("metric_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricId: varchar("metric_id").notNull(),
  targetValue: decimal("target_value", { precision: 15, scale: 4 }),
  targetYear: integer("target_year"),
});

export const metricValues = pgTable("metric_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricId: varchar("metric_id").notNull(),
  period: text("period").notNull(),
  value: decimal("value", { precision: 15, scale: 4 }),
  previousValue: decimal("previous_value", { precision: 15, scale: 4 }),
  targetValue: decimal("target_value", { precision: 15, scale: 4 }),
  status: text("status"),
  percentChange: decimal("percent_change", { precision: 10, scale: 2 }),
  submittedBy: varchar("submitted_by"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  notes: text("notes"),
  locked: boolean("locked").default(false),
  dataSourceType: dataSourceTypeEnum("data_source_type").default("manual"),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
});

export const rawDataInputs = pgTable("raw_data_inputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  inputName: text("input_name").notNull(),
  inputCategory: text("input_category").notNull(),
  value: decimal("value", { precision: 15, scale: 4 }),
  unit: text("unit"),
  periodType: text("period_type").default("monthly"),
  period: text("period").notNull(),
  source: text("source"),
  enteredBy: varchar("entered_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  dataSourceType: dataSourceTypeEnum("data_source_type").default("manual"),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
});

export const evidenceStatusEnum = pgEnum("evidence_status", ["uploaded", "reviewed", "approved", "expired"]);

export const evidenceFiles = pgTable("evidence_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  filename: text("filename").notNull(),
  fileUrl: text("file_url"),
  fileType: text("file_type"),
  description: text("description"),
  linkedModule: text("linked_module"),
  linkedEntityId: varchar("linked_entity_id"),
  linkedPeriod: text("linked_period"),
  evidenceStatus: evidenceStatusEnum("evidence_status").default("uploaded"),
  reviewDate: timestamp("review_date"),
  expiryDate: timestamp("expiry_date"),
  uploadedBy: varchar("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
});

export const actionPlans = pgTable("action_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  dueDate: timestamp("due_date"),
  status: actionStatusEnum("status").default("not_started"),
  relatedMetricId: varchar("related_metric_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportRuns = pgTable("report_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  period: text("period"),
  reportType: reportTypeEnum("report_type").default("pdf"),
  reportTemplate: text("report_template").default("management"),
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: varchar("generated_by"),
  includePolicy: boolean("include_policy").default(true),
  includeTopics: boolean("include_topics").default(true),
  includeMetrics: boolean("include_metrics").default(true),
  includeActions: boolean("include_actions").default(true),
  includeSummary: boolean("include_summary").default(true),
  includeCarbon: boolean("include_carbon").default(true),
  includeEvidence: boolean("include_evidence").default(true),
  includeMethodology: boolean("include_methodology").default(true),
  includeSignoff: boolean("include_signoff").default(true),
  reportData: jsonb("report_data"),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  userId: varchar("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Policy Generation Inputs
export const policyGenerationInputs = pgTable("policy_generation_inputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  inputs: jsonb("inputs").notNull(),
  generatedContent: jsonb("generated_content"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiGenerationLogs = pgTable("ai_generation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  featureType: text("feature_type").notNull(),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: varchar("generated_by"),
  sourceDataSummary: jsonb("source_data_summary"),
  promptText: text("prompt_text"),
  outputSummary: text("output_summary"),
  entityId: varchar("entity_id"),
  entityType: text("entity_type"),
});

// Emission Factors
export const emissionFactors = pgTable("emission_factors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  country: text("country").notNull().default("UK"),
  unit: text("unit").notNull(),
  factor: decimal("factor", { precision: 15, scale: 6 }).notNull(),
  sourceLabel: text("source_label"),
  factorYear: integer("factor_year").default(2024),
  version: integer("version").default(1),
  fuelType: text("fuel_type"),
  methodology: text("methodology"),
  effectiveDate: timestamp("effective_date").defaultNow(),
});

export const carbonCalculations = pgTable("carbon_calculations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  reportingPeriod: text("reporting_period").notNull(),
  periodType: text("period_type").notNull().default("annual"),
  inputs: jsonb("inputs").notNull(),
  results: jsonb("results"),
  scope1Total: decimal("scope1_total", { precision: 15, scale: 4 }),
  scope2Total: decimal("scope2_total", { precision: 15, scale: 4 }),
  scope3Total: decimal("scope3_total", { precision: 15, scale: 4 }),
  totalEmissions: decimal("total_emissions", { precision: 15, scale: 4 }),
  employeeCount: integer("employee_count"),
  factorYear: integer("factor_year").default(2024),
  dataQuality: jsonb("data_quality"),
  methodologyNotes: jsonb("methodology_notes"),
  assumptions: jsonb("assumptions"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Questionnaires
export const questionnaireStatusEnum = pgEnum("questionnaire_status", ["draft", "in_progress", "completed"]);
export const confidenceEnum = pgEnum("confidence_level", ["high", "medium", "low"]);

export const questionnaires = pgTable("questionnaires", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  title: text("title").notNull(),
  source: text("source"),
  status: questionnaireStatusEnum("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const questionnaireQuestions = pgTable("questionnaire_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionnaireId: varchar("questionnaire_id").notNull(),
  questionText: text("question_text").notNull(),
  category: text("category"),
  orderIndex: integer("order_index").default(0),
  suggestedAnswer: text("suggested_answer"),
  editedAnswer: text("edited_answer"),
  confidence: confidenceEnum("confidence"),
  sourceRef: text("source_ref"),
  rationale: text("rationale"),
  sourceData: jsonb("source_data"),
  approved: boolean("approved").default(false),
  dataSourceType: dataSourceTypeEnum("data_source_type").default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
});

// Policy Templates & Generated Policies
export const policyTemplateStatusEnum = pgEnum("policy_template_status", ["draft", "approved", "published"]);
export const policyToneEnum = pgEnum("policy_tone", ["simple_sme", "audit_ready"]);

export const policyTemplates = pgTable("policy_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  sections: jsonb("sections").notNull(),
  questionnaire: jsonb("questionnaire").notNull(),
  complianceMapping: jsonb("compliance_mapping"),
  defaultReviewCycle: text("default_review_cycle").default("annual"),
  isSystem: boolean("is_system").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const generatedPolicies = pgTable("generated_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  templateId: varchar("template_id").notNull(),
  templateSlug: text("template_slug").notNull(),
  title: text("title").notNull(),
  status: policyTemplateStatusEnum("status").default("draft"),
  content: jsonb("content"),
  questionnaireAnswers: jsonb("questionnaire_answers"),
  policyOwner: text("policy_owner"),
  approver: text("approver"),
  approvedAt: timestamp("approved_at"),
  reviewDate: timestamp("review_date"),
  versionNumber: integer("version_number").default(1),
  tone: policyToneEnum("tone").default("simple_sme"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true });
export const insertMetricSchema = createInsertSchema(metrics).omit({ id: true, createdAt: true });
export const insertMetricValueSchema = createInsertSchema(metricValues).omit({ id: true, submittedAt: true });
export const insertActionPlanSchema = createInsertSchema(actionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEsgPolicySchema = createInsertSchema(esgPolicies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPolicyVersionSchema = createInsertSchema(policyVersions).omit({ id: true, createdAt: true });
export const insertMaterialTopicSchema = createInsertSchema(materialTopics).omit({ id: true });
export const insertMetricTargetSchema = createInsertSchema(metricTargets).omit({ id: true });
export const insertEvidenceFileSchema = createInsertSchema(evidenceFiles).omit({ id: true, uploadedAt: true, reviewedBy: true, reviewedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertPolicyGenerationInputSchema = createInsertSchema(policyGenerationInputs).omit({ id: true, createdAt: true });
export const insertRawDataInputSchema = createInsertSchema(rawDataInputs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmissionFactorSchema = createInsertSchema(emissionFactors).omit({ id: true, effectiveDate: true });
export const insertCarbonCalculationSchema = createInsertSchema(carbonCalculations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionnaireSchema = createInsertSchema(questionnaires).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionnaireQuestionSchema = createInsertSchema(questionnaireQuestions).omit({ id: true, createdAt: true });
export const insertPolicyTemplateSchema = createInsertSchema(policyTemplates).omit({ id: true, createdAt: true });
export const insertGeneratedPolicySchema = createInsertSchema(generatedPolicies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiGenerationLogSchema = createInsertSchema(aiGenerationLogs).omit({ id: true, generatedAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type CompanySettings = typeof companySettings.$inferSelect;
export type EsgPolicy = typeof esgPolicies.$inferSelect;
export type PolicyVersion = typeof policyVersions.$inferSelect;
export type InsertPolicyVersion = z.infer<typeof insertPolicyVersionSchema>;
export type MaterialTopic = typeof materialTopics.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type MetricTarget = typeof metricTargets.$inferSelect;
export type MetricValue = typeof metricValues.$inferSelect;
export type InsertMetricValue = z.infer<typeof insertMetricValueSchema>;
export type EvidenceFile = typeof evidenceFiles.$inferSelect;
export type InsertEvidenceFile = z.infer<typeof insertEvidenceFileSchema>;
export type DataSourceType = "evidenced" | "estimated" | "manual";
export type ActionPlan = typeof actionPlans.$inferSelect;
export type InsertActionPlan = z.infer<typeof insertActionPlanSchema>;
export type ReportRun = typeof reportRuns.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type PolicyGenerationInput = typeof policyGenerationInputs.$inferSelect;
export type InsertPolicyGenerationInput = z.infer<typeof insertPolicyGenerationInputSchema>;
export type RawDataInput = typeof rawDataInputs.$inferSelect;
export type InsertRawDataInput = z.infer<typeof insertRawDataInputSchema>;
export type EmissionFactor = typeof emissionFactors.$inferSelect;
export type InsertEmissionFactor = z.infer<typeof insertEmissionFactorSchema>;
export type CarbonCalculation = typeof carbonCalculations.$inferSelect;
export type InsertCarbonCalculation = z.infer<typeof insertCarbonCalculationSchema>;
export type Questionnaire = typeof questionnaires.$inferSelect;
export type InsertQuestionnaire = z.infer<typeof insertQuestionnaireSchema>;
export type QuestionnaireQuestion = typeof questionnaireQuestions.$inferSelect;
export type InsertQuestionnaireQuestion = z.infer<typeof insertQuestionnaireQuestionSchema>;
export type PolicyTemplate = typeof policyTemplates.$inferSelect;
export type InsertPolicyTemplate = z.infer<typeof insertPolicyTemplateSchema>;
export type GeneratedPolicy = typeof generatedPolicies.$inferSelect;
export type InsertGeneratedPolicy = z.infer<typeof insertGeneratedPolicySchema>;
export type AiGenerationLog = typeof aiGenerationLogs.$inferSelect;
export type InsertAiGenerationLog = z.infer<typeof insertAiGenerationLogSchema>;
export type WorkflowStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

export type UserRole = "admin" | "contributor" | "approver" | "viewer";
export type PermissionModule =
  | "metrics_data_entry"
  | "policy_editing"
  | "report_generation"
  | "questionnaire_access"
  | "settings_admin"
  | "template_admin"
  | "user_management";

export const ROLE_PERMISSIONS: Record<UserRole, PermissionModule[]> = {
  admin: [
    "metrics_data_entry",
    "policy_editing",
    "report_generation",
    "questionnaire_access",
    "settings_admin",
    "template_admin",
    "user_management",
  ],
  contributor: [
    "metrics_data_entry",
    "policy_editing",
    "questionnaire_access",
  ],
  approver: [
    "report_generation",
  ],
  viewer: [],
};

function normalizeRole(role: string): UserRole {
  if (role === "editor") return "contributor";
  return role as UserRole;
}

export function hasPermission(role: string | undefined, module: PermissionModule): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[normalizeRole(role)];
  if (!permissions) return false;
  return permissions.includes(module);
}

export function getUserPermissions(role: string | undefined): PermissionModule[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}
