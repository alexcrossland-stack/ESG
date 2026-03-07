import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, decimal, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["admin", "editor"]);
export const metricCategoryEnum = pgEnum("metric_category", ["environmental", "social", "governance"]);
export const metricFrequencyEnum = pgEnum("metric_frequency", ["monthly", "quarterly", "annual"]);
export const actionStatusEnum = pgEnum("action_status", ["not_started", "in_progress", "complete", "overdue"]);
export const policyStatusEnum = pgEnum("policy_status", ["draft", "published"]);
export const reportTypeEnum = pgEnum("report_type", ["pdf", "csv", "word"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default("editor"),
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
  onboardingComplete: boolean("onboarding_complete").default(false),
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
  submittedBy: varchar("submitted_by"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  notes: text("notes"),
  locked: boolean("locked").default(false),
});

export const evidenceFiles = pgTable("evidence_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  metricValueId: varchar("metric_value_id"),
  filename: text("filename").notNull(),
  fileUrl: text("file_url"),
  fileType: text("file_type"),
  uploadedBy: varchar("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
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
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: varchar("generated_by"),
  includePolicy: boolean("include_policy").default(true),
  includeTopics: boolean("include_topics").default(true),
  includeMetrics: boolean("include_metrics").default(true),
  includeActions: boolean("include_actions").default(true),
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

// Emission Factors
export const emissionFactors = pgTable("emission_factors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  country: text("country").notNull().default("UK"),
  unit: text("unit").notNull(),
  factor: decimal("factor", { precision: 15, scale: 6 }).notNull(),
  sourceLabel: text("source_label"),
  effectiveDate: timestamp("effective_date").defaultNow(),
});

// Carbon Calculations
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
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
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
export const insertEvidenceFileSchema = createInsertSchema(evidenceFiles).omit({ id: true, uploadedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertPolicyGenerationInputSchema = createInsertSchema(policyGenerationInputs).omit({ id: true, createdAt: true });
export const insertEmissionFactorSchema = createInsertSchema(emissionFactors).omit({ id: true, effectiveDate: true });
export const insertCarbonCalculationSchema = createInsertSchema(carbonCalculations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionnaireSchema = createInsertSchema(questionnaires).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionnaireQuestionSchema = createInsertSchema(questionnaireQuestions).omit({ id: true, createdAt: true });

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
export type ActionPlan = typeof actionPlans.$inferSelect;
export type InsertActionPlan = z.infer<typeof insertActionPlanSchema>;
export type ReportRun = typeof reportRuns.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type PolicyGenerationInput = typeof policyGenerationInputs.$inferSelect;
export type InsertPolicyGenerationInput = z.infer<typeof insertPolicyGenerationInputSchema>;
export type EmissionFactor = typeof emissionFactors.$inferSelect;
export type InsertEmissionFactor = z.infer<typeof insertEmissionFactorSchema>;
export type CarbonCalculation = typeof carbonCalculations.$inferSelect;
export type InsertCarbonCalculation = z.infer<typeof insertCarbonCalculationSchema>;
export type Questionnaire = typeof questionnaires.$inferSelect;
export type InsertQuestionnaire = z.infer<typeof insertQuestionnaireSchema>;
export type QuestionnaireQuestion = typeof questionnaireQuestions.$inferSelect;
export type InsertQuestionnaireQuestion = z.infer<typeof insertQuestionnaireQuestionSchema>;
