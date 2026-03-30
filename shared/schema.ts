import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, serial, timestamp, jsonb, decimal, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["admin", "editor", "contributor", "approver", "viewer", "super_admin", "portfolio_owner", "portfolio_viewer"]);
export const planTierEnum = pgEnum("plan_tier", ["free", "pro"]);
export const planStatusEnum = pgEnum("plan_status", ["active", "past_due", "cancelled", "over_limit"]);
export const authTokenTypeEnum = pgEnum("auth_token_type", ["invitation", "password_reset"]);
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

export const supportRequestCategoryEnum = pgEnum("support_request_category", ["bug", "billing", "onboarding", "report_issue", "import_issue", "feature_request", "data_rights", "general"]);
export const supportRequestStatusEnum = pgEnum("support_request_status", ["new", "in_review", "resolved", "closed"]);
export const supportRequestPriorityEnum = pgEnum("support_request_priority", ["low", "normal", "high", "urgent"]);

export const siteTypeEnum = pgEnum("site_type", ["operational", "office", "manufacturing", "warehouse", "retail", "data_centre", "other"]);
export const siteStatusEnum = pgEnum("site_status", ["active", "archived"]);

export const companyLifecycleStateEnum = pgEnum("company_lifecycle_state", ["created", "onboarding_started", "onboarding_completed", "active", "archived"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default("contributor"),
  companyId: varchar("company_id"),
  createdAt: timestamp("created_at").defaultNow(),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  privacyAcceptedAt: timestamp("privacy_accepted_at"),
  termsVersionAccepted: text("terms_version_accepted"),
  privacyVersionAccepted: text("privacy_version_accepted"),
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaSecretEncrypted: text("mfa_secret_encrypted"),
  mfaBackupCodesHash: text("mfa_backup_codes_hash").array(),
  mfaEnabledAt: timestamp("mfa_enabled_at"),
  externalId: text("external_id"),
  identityProviderId: varchar("identity_provider_id"),
  anonymisedAt: timestamp("anonymised_at"),
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
  onboardingVersion: integer("onboarding_version").default(1),
  demoMode: boolean("demo_mode").default(false),
  profileShareEnabled: boolean("profile_share_enabled").default(false),
  profileShareToken: varchar("profile_share_token"),
  profileShareExpiresAt: timestamp("profile_share_expires_at"),
  profileVisibleSections: jsonb("profile_visible_sections"),
  isSuperAdmin: boolean("is_super_admin").default(false),
  esgMaturity: text("esg_maturity"),
  selectedModules: jsonb("selected_modules"),
  selectedMetrics: jsonb("selected_metrics"),
  onboardingAnswers: jsonb("onboarding_answers"),
  esgActionPlan: jsonb("esg_action_plan"),
  esgRoadmap: jsonb("esg_roadmap"),
  activationCardDismissedAt: timestamp("activation_card_dismissed_at"),
  planTier: planTierEnum("plan_tier").default("free"),
  planStatus: planStatusEnum("plan_status").default("active"),
  currentPeriodEnd: timestamp("current_period_end"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  isBetaCompany: boolean("is_beta_company").default(false),
  betaExpiresAt: timestamp("beta_expires_at"),
  betaAccessLevel: text("beta_access_level"),
  betaGrantedBy: text("beta_granted_by"),
  betaReason: text("beta_reason"),
  status: text("status").default("active"),
  lifecycleState: companyLifecycleStateEnum("lifecycle_state").default("created"),
  createdAt: timestamp("created_at").defaultNow(),
  mfaPolicy: text("mfa_policy").default("optional"),
  deletionPendingAt: timestamp("deletion_pending_at"),
  deletionScheduledAt: timestamp("deletion_scheduled_at"),
  deletionRequestedBy: varchar("deletion_requested_by"),
});

export const identityProviders = pgTable("identity_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  providerType: text("provider_type").notNull().default("saml"),
  name: text("name").notNull(),
  domain: text("domain"),
  config: jsonb("config"),
  isEnabled: boolean("is_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const dataExportJobs = pgTable("data_export_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  requestedBy: varchar("requested_by").notNull(),
  exportScope: text("export_scope").notNull().default("personal"),
  status: text("status").notNull().default("pending"),
  downloadToken: varchar("download_token"),
  downloadTokenUsed: boolean("download_token_used").default(false),
  fileData: text("file_data"),
  fileSize: integer("file_size"),
  expiresAt: timestamp("expires_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dataDeletionRequests = pgTable("data_deletion_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  requestedBy: varchar("requested_by").notNull(),
  deletionScope: text("deletion_scope").notNull().default("user"),
  targetUserId: varchar("target_user_id"),
  status: text("status").notNull().default("pending"),
  confirmationText: text("confirmation_text"),
  processedAt: timestamp("processed_at"),
  scheduledAt: timestamp("scheduled_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const organisationSites = pgTable("organisation_sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: siteTypeEnum("type").notNull().default("operational"),
  status: siteStatusEnum("status").notNull().default("active"),
  country: text("country"),
  city: text("city"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueCompanySlug: uniqueIndex("idx_org_sites_company_slug_unique").on(table.companyId, table.slug),
  companyIdIdx: index("idx_org_sites_company_id").on(table.companyId),
  companyStatusIdx: index("idx_org_sites_company_status").on(table.companyId, table.status),
}));

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
  requireApprovalMetrics: boolean("require_approval_metrics").default(false),
  requireApprovalReports: boolean("require_approval_reports").default(true),
  requireApprovalPolicies: boolean("require_approval_policies").default(true),
  autoLockApproved: boolean("auto_lock_approved").default(true),
  reportBrandingName: text("report_branding_name"),
  reportBrandingTagline: text("report_branding_tagline"),
  reportBrandingColor: text("report_branding_color"),
  reportBrandingFooter: text("report_branding_footer"),
  emissionFactorSet: text("emission_factor_set").default("UK_DEFRA_2024"),
  reminderEnabled: boolean("reminder_enabled").default(true),
  reminderFrequency: text("reminder_frequency").default("daily"),
});

export const esgPolicies = pgTable("esg_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  status: policyStatusEnum("status").default("draft"),
  publishedAt: timestamp("published_at"),
  reviewDate: timestamp("review_date"),
  assignedUserId: varchar("assigned_user_id"),
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
  isDefault: boolean("is_default").default(true),
  financialMateriality: integer("financial_materiality"),
  impactMateriality: integer("impact_materiality"),
  rationale: text("rationale"),
  recommendedMetricIds: text("recommended_metric_ids").array(),
  recommendedPolicySlugs: text("recommended_policy_slugs").array(),
});

export const businessMaterialityAssessments = pgTable("business_materiality_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  assessmentYear: integer("assessment_year").notNull(),
  status: text("status").default("draft"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const policyRecordStatusEnum = pgEnum("policy_record_status", ["draft", "active", "under_review", "retired"]);
export const policyRecordTypeEnum = pgEnum("policy_record_type", ["environmental", "social", "governance", "health_safety", "data_privacy", "anti_bribery", "whistleblowing", "cybersecurity", "supplier", "climate", "other"]);
export const governanceAreaEnum = pgEnum("governance_area", ["environment", "social", "governance", "climate", "privacy_cyber"]);

export const policyRecords = pgTable("policy_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  title: text("title").notNull(),
  policyType: policyRecordTypeEnum("policy_type").notNull().default("other"),
  owner: text("owner"),
  ownerUserId: varchar("owner_user_id"),
  status: policyRecordStatusEnum("status").notNull().default("draft"),
  effectiveDate: timestamp("effective_date"),
  reviewDate: timestamp("review_date"),
  documentLink: text("document_link"),
  notes: text("notes"),
  linkedMaterialTopicIds: text("linked_material_topic_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const governanceAssignments = pgTable("governance_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  area: governanceAreaEnum("area").notNull(),
  ownerName: text("owner_name"),
  ownerUserId: varchar("owner_user_id"),
  ownerTitle: text("owner_title"),
  responsibilities: text("responsibilities"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const esgTargetStatusEnum = pgEnum("esg_target_status", ["not_started", "in_progress", "achieved", "missed", "cancelled"]);

export const esgTargets = pgTable("esg_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  pillar: metricCategoryEnum("pillar").notNull(),
  linkedMetricId: varchar("linked_metric_id"),
  linkedMetricDefinitionId: varchar("linked_metric_definition_id"),
  baselineValue: decimal("baseline_value", { precision: 15, scale: 4 }),
  baselineYear: integer("baseline_year"),
  targetValue: decimal("target_value", { precision: 15, scale: 4 }),
  targetYear: integer("target_year"),
  owner: text("owner"),
  ownerUserId: varchar("owner_user_id"),
  status: esgTargetStatusEnum("status").notNull().default("not_started"),
  progressPercent: integer("progress_percent").default(0),
  notes: text("notes"),
  linkedMaterialTopicIds: text("linked_material_topic_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const esgActionStatusEnum = pgEnum("esg_action_status", ["not_started", "in_progress", "complete", "overdue", "cancelled"]);

export const esgActions = pgTable("esg_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  targetId: varchar("target_id"),
  riskId: varchar("risk_id"),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  ownerUserId: varchar("owner_user_id"),
  dueDate: timestamp("due_date"),
  status: esgActionStatusEnum("status").notNull().default("not_started"),
  progressPercent: integer("progress_percent").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const esgRiskLikelihoodEnum = pgEnum("esg_risk_likelihood", ["very_low", "low", "medium", "high", "very_high"]);
export const esgRiskImpactEnum = pgEnum("esg_risk_impact", ["very_low", "low", "medium", "high", "very_high"]);
export const esgRiskStatusEnum = pgEnum("esg_risk_status", ["open", "mitigated", "accepted", "closed"]);
export const esgRiskTypeEnum = pgEnum("esg_risk_type", ["physical", "transition", "regulatory", "reputational", "supply_chain", "operational", "financial", "social", "governance", "other"]);

export const esgRisks = pgTable("esg_risks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  pillar: metricCategoryEnum("pillar").notNull(),
  riskType: esgRiskTypeEnum("risk_type").notNull().default("other"),
  title: text("title").notNull(),
  description: text("description"),
  likelihood: esgRiskLikelihoodEnum("likelihood").notNull().default("medium"),
  impact: esgRiskImpactEnum("impact").notNull().default("medium"),
  riskScore: integer("risk_score"),
  mitigationPlan: text("mitigation_plan"),
  owner: text("owner"),
  ownerUserId: varchar("owner_user_id"),
  reviewDate: timestamp("review_date"),
  status: esgRiskStatusEnum("status").notNull().default("open"),
  linkedMaterialTopicIds: text("linked_material_topic_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  assignedUserId: varchar("assigned_user_id"),
  assignedDueDate: timestamp("assigned_due_date"),
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
  reportingPeriodId: varchar("reporting_period_id"),
  siteId: varchar("site_id"),
  // Phase 1 new-path columns (nullable for backward compat)
  metricDefinitionId: varchar("metric_definition_id"),
  reportingPeriodStart: timestamp("reporting_period_start"),
  reportingPeriodEnd: timestamp("reporting_period_end"),
  valueNumeric: decimal("value_numeric", { precision: 15, scale: 4 }),
  valueText: text("value_text"),
  valueBoolean: boolean("value_boolean"),
  valueJson: jsonb("value_json"),
  sourceType: text("source_type"),
  enteredByUserId: varchar("entered_by_user_id"),
}, (table) => ({
  siteIdIdx: index("idx_metric_values_site_id").on(table.siteId),
  metricDefIdIdx: index("idx_metric_values_metric_def_id").on(table.metricDefinitionId),
}));

export const estimateConfidenceEnum = pgEnum("estimate_confidence", ["high", "medium", "low"]);

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
  assignedUserId: varchar("assigned_user_id"),
  assignedDueDate: timestamp("assigned_due_date"),
  submittedBy: varchar("submitted_by"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  dataSourceType: dataSourceTypeEnum("data_source_type").default("manual"),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
  reportingPeriodId: varchar("reporting_period_id"),
  siteId: varchar("site_id"),
  estimateMethod: text("estimate_method"),
  estimateConfidence: estimateConfidenceEnum("estimate_confidence"),
  estimateBasisJson: jsonb("estimate_basis_json"),
  isUserReviewed: boolean("is_user_reviewed").default(false),
  lastEstimatedAt: timestamp("last_estimated_at"),
}, (table) => ({
  siteIdIdx: index("idx_raw_data_site_id").on(table.siteId),
}));

export const evidenceStatusEnum = pgEnum("evidence_status", ["pending", "available", "quarantined", "rejected", "deleted", "uploaded", "reviewed", "approved", "expired"]);

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
  evidenceStatus: evidenceStatusEnum("evidence_status").default("pending"),
  reviewDate: timestamp("review_date"),
  expiryDate: timestamp("expiry_date"),
  uploadedBy: varchar("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  assignedUserId: varchar("assigned_user_id"),
  siteId: varchar("site_id"),
  fileStatusChangedAt: timestamp("file_status_changed_at"),
  scanResult: text("scan_result"),
}, (table) => ({
  siteIdIdx: index("idx_evidence_files_site_id").on(table.siteId),
}));

export const actionPlans = pgTable("action_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  assignedUserId: varchar("assigned_user_id"),
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
  submittedBy: varchar("submitted_by"),
  submittedAt: timestamp("submitted_at"),
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
  siteId: varchar("site_id"),
}, (table) => ({
  siteIdIdx: index("idx_report_runs_site_id").on(table.siteId),
}));

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  userId: varchar("user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  severity: text("severity").default("info"),
  linkedModule: text("linked_module"),
  linkedEntityId: varchar("linked_entity_id"),
  linkUrl: text("link_url"),
  dueDate: timestamp("due_date"),
  dismissed: boolean("dismissed").default(false),
  dismissedAt: timestamp("dismissed_at"),
  dismissedBy: varchar("dismissed_by"),
  autoGenerated: boolean("auto_generated").default(false),
  sourceKey: text("source_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  userId: varchar("user_id"),
  actorType: text("actor_type").default("user"),
  actorAgentId: varchar("actor_agent_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supportRequests = pgTable("support_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  userId: varchar("user_id"),
  refNumber: text("ref_number").notNull(),
  category: supportRequestCategoryEnum("category").notNull().default("general"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  pageContext: text("page_context"),
  userName: text("user_name"),
  userEmail: text("user_email"),
  companyName: text("company_name"),
  adminNotes: text("admin_notes"),
  status: supportRequestStatusEnum("status").notNull().default("new"),
  priority: supportRequestPriorityEnum("priority").notNull().default("normal"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportRequestSchema = createInsertSchema(supportRequests).omit({ id: true, refNumber: true, createdAt: true, updatedAt: true });
export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
export type SupportRequest = typeof supportRequests.$inferSelect;

export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull().unique(),
  type: authTokenTypeEnum("type").notNull(),
  userId: varchar("user_id"),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({ id: true, createdAt: true });
export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;

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
  siteId: varchar("site_id"),
}, (table) => ({
  siteIdIdx: index("idx_carbon_calcs_site_id").on(table.siteId),
}));

// Questionnaires
export const questionnaireStatusEnum = pgEnum("questionnaire_status", ["draft", "in_progress", "completed"]);
export const confidenceEnum = pgEnum("confidence_level", ["high", "medium", "low"]);

export const questionnaires = pgTable("questionnaires", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  title: text("title").notNull(),
  source: text("source"),
  status: questionnaireStatusEnum("status").default("draft"),
  assignedUserId: varchar("assigned_user_id"),
  assignedDueDate: timestamp("assigned_due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  siteId: varchar("site_id"),
  reportingPeriodId: varchar("reporting_period_id"),
}, (table) => ({
  siteIdIdx: index("idx_questionnaires_site_id").on(table.siteId),
}));

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
  submittedBy: varchar("submitted_by"),
  submittedAt: timestamp("submitted_at"),
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
  enabled: boolean("enabled").default(true),
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
  submittedBy: varchar("submitted_by"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  workflowStatus: workflowStatusEnum("workflow_status").default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
  siteId: varchar("site_id"),
}, (table) => ({
  siteIdIdx: index("idx_generated_policies_site_id").on(table.siteId),
}));

export const evidenceRequestStatusEnum = pgEnum("evidence_request_status", ["requested", "uploaded", "under_review", "approved", "rejected", "expired"]);

export const evidenceRequests = pgTable("evidence_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  requestedByUserId: varchar("requested_by_user_id").notNull(),
  assignedUserId: varchar("assigned_user_id").notNull(),
  linkedModule: text("linked_module"),
  linkedEntityId: varchar("linked_entity_id"),
  description: text("description").notNull(),
  dueDate: timestamp("due_date"),
  status: evidenceRequestStatusEnum("status").default("requested"),
  evidenceFileId: varchar("evidence_file_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportingPeriodTypeEnum = pgEnum("reporting_period_type", ["monthly", "quarterly", "annual"]);
export const reportingPeriodStatusEnum = pgEnum("reporting_period_status", ["open", "closed", "locked"]);

export const reportingPeriods = pgTable("reporting_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  name: text("name").notNull(),
  periodType: reportingPeriodTypeEnum("period_type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: reportingPeriodStatusEnum("status").default("open"),
  previousPeriodId: varchar("previous_period_id"),
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
export const insertBusinessMaterialityAssessmentSchema = createInsertSchema(businessMaterialityAssessments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPolicyRecordSchema = createInsertSchema(policyRecords).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGovernanceAssignmentSchema = createInsertSchema(governanceAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEsgTargetSchema = createInsertSchema(esgTargets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEsgActionSchema = createInsertSchema(esgActions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEsgRiskSchema = createInsertSchema(esgRisks).omit({ id: true, createdAt: true, updatedAt: true });
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
export const insertEvidenceRequestSchema = createInsertSchema(evidenceRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReportingPeriodSchema = createInsertSchema(reportingPeriods).omit({ id: true, createdAt: true });

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
export type InsertMaterialTopic = z.infer<typeof insertMaterialTopicSchema>;
export type BusinessMaterialityAssessment = typeof businessMaterialityAssessments.$inferSelect;
export type InsertBusinessMaterialityAssessment = z.infer<typeof insertBusinessMaterialityAssessmentSchema>;
export type PolicyRecord = typeof policyRecords.$inferSelect;
export type InsertPolicyRecord = z.infer<typeof insertPolicyRecordSchema>;
export type GovernanceAssignment = typeof governanceAssignments.$inferSelect;
export type InsertGovernanceAssignment = z.infer<typeof insertGovernanceAssignmentSchema>;
export type EsgTarget = typeof esgTargets.$inferSelect;
export type InsertEsgTarget = z.infer<typeof insertEsgTargetSchema>;
export type EsgAction = typeof esgActions.$inferSelect;
export type InsertEsgAction = z.infer<typeof insertEsgActionSchema>;
export type EsgRisk = typeof esgRisks.$inferSelect;
export type InsertEsgRisk = z.infer<typeof insertEsgRiskSchema>;
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
export type EvidenceRequest = typeof evidenceRequests.$inferSelect;
export type InsertEvidenceRequest = z.infer<typeof insertEvidenceRequestSchema>;
export type ReportingPeriod = typeof reportingPeriods.$inferSelect;
export type InsertReportingPeriod = z.infer<typeof insertReportingPeriodSchema>;
export const complianceFrameworks = pgTable("compliance_frameworks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  version: text("version"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const complianceRequirements = pgTable("compliance_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  frameworkId: varchar("framework_id").notNull(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  linkedMetricIds: text("linked_metric_ids").array(),
  linkedPolicySection: text("linked_policy_section"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const backgroundJobs = pgTable("background_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload"),
  result: jsonb("result"),
  error: text("error"),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  idempotencyKey: varchar("idempotency_key"),
  lockedAt: timestamp("locked_at"),
  workerId: varchar("worker_id"),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformHealthEvents = pgTable("platform_health_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  details: jsonb("details"),
  companyId: varchar("company_id"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const generatedFiles = pgTable("generated_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportRunId: varchar("report_run_id"),
  companyId: varchar("company_id").notNull(),
  fileType: text("file_type").notNull(),
  filename: text("filename").notNull(),
  fileData: text("file_data"),
  fileSize: integer("file_size"),
  generatedAt: timestamp("generated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const userActivity = pgTable("user_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  companyId: varchar("company_id"),
  action: text("action").notNull(),
  page: text("page"),
  details: jsonb("details"),
  siteId: varchar("site_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  siteIdIdx: index("idx_user_activity_site_id").on(table.siteId),
}));

export const insertBackgroundJobSchema = createInsertSchema(backgroundJobs).omit({ id: true, createdAt: true });
export const insertPlatformHealthEventSchema = createInsertSchema(platformHealthEvents).omit({ id: true, createdAt: true });
export const insertGeneratedFileSchema = createInsertSchema(generatedFiles).omit({ id: true, generatedAt: true });
export const insertUserActivitySchema = createInsertSchema(userActivity).omit({ id: true, createdAt: true });

export type BackgroundJob = typeof backgroundJobs.$inferSelect;
export type InsertBackgroundJob = z.infer<typeof insertBackgroundJobSchema>;
export type PlatformHealthEvent = typeof platformHealthEvents.$inferSelect;
export type InsertPlatformHealthEvent = z.infer<typeof insertPlatformHealthEventSchema>;
export type GeneratedFile = typeof generatedFiles.$inferSelect;
export type InsertGeneratedFile = z.infer<typeof insertGeneratedFileSchema>;
export type UserActivity = typeof userActivity.$inferSelect;
export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;

export const insertComplianceFrameworkSchema = createInsertSchema(complianceFrameworks).omit({ id: true, createdAt: true });
export const insertComplianceRequirementSchema = createInsertSchema(complianceRequirements).omit({ id: true, createdAt: true });

export type ComplianceFramework = typeof complianceFrameworks.$inferSelect;
export type InsertComplianceFramework = z.infer<typeof insertComplianceFrameworkSchema>;
export type ComplianceRequirement = typeof complianceRequirements.$inferSelect;
export type InsertComplianceRequirement = z.infer<typeof insertComplianceRequirementSchema>;

export const procurementAnswerStatusEnum = pgEnum("procurement_answer_status", ["draft", "approved", "flagged"]);

export const procurementAnswers = pgTable("procurement_answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  linkedMetricIds: text("linked_metric_ids").array(),
  linkedPolicySection: text("linked_policy_section"),
  linkedEvidenceIds: text("linked_evidence_ids").array(),
  linkedComplianceReqIds: text("linked_compliance_req_ids").array(),
  status: procurementAnswerStatusEnum("status").default("draft"),
  approvedByUserId: varchar("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  flaggedReason: text("flagged_reason"),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProcurementAnswerSchema = createInsertSchema(procurementAnswers).omit({ id: true, createdAt: true });
export type ProcurementAnswer = typeof procurementAnswers.$inferSelect;
export type InsertProcurementAnswer = z.infer<typeof insertProcurementAnswerSchema>;

export type WorkflowStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

export const superAdminActions = pgTable("super_admin_actions", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id"),
  action: text("action").notNull(),
  targetCompanyId: integer("target_company_id"),
  targetUserId: integer("target_user_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SuperAdminAction = typeof superAdminActions.$inferSelect;
export type InsertSuperAdminAction = typeof superAdminActions.$inferInsert;

export type UserRole = "admin" | "contributor" | "approver" | "viewer" | "super_admin";
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
  super_admin: [
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

// ============================================================
// AI AGENT INTEGRATION LAYER
// ============================================================

export const agentTypeEnum = pgEnum("agent_type", [
  "technical_agent",
  "customer_success_agent",
  "esg_specialist_agent",
  "marketing_agent",
  "master_orchestrator",
]);

export const agentApiKeys = pgTable("agent_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentType: agentTypeEnum("agent_type").notNull(),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: jsonb("scopes").notNull(),
  companyId: varchar("company_id"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentRuns = pgTable("agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: text("agent_name").notNull(),
  agentType: agentTypeEnum("agent_type").notNull(),
  triggerType: text("trigger_type").notNull(),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  status: text("status").notNull(),
  durationMs: integer("duration_ms"),
  companyId: varchar("company_id"),
  userId: varchar("user_id"),
  siteId: varchar("site_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index("idx_agent_runs_site_id").on(table.siteId),
}));

export const agentActions = pgTable("agent_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentEscalations = pgTable("agent_escalations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id"),
  agentName: text("agent_name").notNull(),
  escalationType: text("escalation_type").notNull(),
  priority: text("priority").notNull(),
  summary: text("summary").notNull(),
  companyId: varchar("company_id"),
  userId: varchar("user_id"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: varchar("related_entity_id"),
  status: text("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id"),
  userId: varchar("user_id"),
  agentType: agentTypeEnum("agent_type"),
  title: text("title"),
  status: text("status").notNull().default("open"),
  siteId: varchar("site_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index("idx_chat_sessions_site_id").on(table.siteId),
}));

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentApiKeySchema = createInsertSchema(agentApiKeys).omit({ id: true, createdAt: true });
export type InsertAgentApiKey = z.infer<typeof insertAgentApiKeySchema>;
export type AgentApiKey = typeof agentApiKeys.$inferSelect;

export const insertAgentRunSchema = createInsertSchema(agentRuns).omit({ id: true, createdAt: true });
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type AgentRun = typeof agentRuns.$inferSelect;

export const insertAgentActionSchema = createInsertSchema(agentActions).omit({ id: true, createdAt: true });
export type InsertAgentAction = z.infer<typeof insertAgentActionSchema>;
export type AgentAction = typeof agentActions.$inferSelect;

export const insertAgentEscalationSchema = createInsertSchema(agentEscalations).omit({ id: true, createdAt: true });
export type InsertAgentEscalation = z.infer<typeof insertAgentEscalationSchema>;
export type AgentEscalation = typeof agentEscalations.$inferSelect;

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const insertOrganisationSiteSchema = createInsertSchema(organisationSites).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganisationSite = z.infer<typeof insertOrganisationSiteSchema>;
export type OrganisationSite = typeof organisationSites.$inferSelect;

// ============================================================
// ESG METRIC DEFINITIONS (Phase 1)
// ============================================================

export const metricPillarEnum = pgEnum("metric_pillar", ["environmental", "social", "governance"]);
export const metricDataTypeEnum = pgEnum("metric_data_type", ["numeric", "text", "boolean", "json"]);
export const metricInputFrequencyEnum = pgEnum("metric_input_frequency", ["monthly", "quarterly", "annual"]);
export const metricRollupMethodEnum = pgEnum("metric_rollup_method", ["sum", "weighted_average", "latest", "none"]);
export const metricValueSourceTypeEnum = pgEnum("metric_value_source_type", ["manual", "calculated", "imported", "api"]);
export const metricValueStatusEnum = pgEnum("metric_value_status_new", ["draft", "submitted", "approved", "rejected"]);

export const metricDefinitions = pgTable("metric_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  pillar: metricPillarEnum("pillar").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  dataType: metricDataTypeEnum("data_type").notNull().default("numeric"),
  unit: text("unit"),
  inputFrequency: metricInputFrequencyEnum("input_frequency").notNull().default("quarterly"),
  isCore: boolean("is_core").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  isDerived: boolean("is_derived").notNull().default(false),
  formulaJson: jsonb("formula_json"),
  frameworkTags: text("framework_tags").array(),
  scoringWeight: decimal("scoring_weight", { precision: 5, scale: 2 }).default("1"),
  sortOrder: integer("sort_order").default(0),
  evidenceRequired: boolean("evidence_required").notNull().default(false),
  rollupMethod: metricRollupMethodEnum("rollup_method").notNull().default("sum"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const metricDefinitionValues = pgTable("metric_definition_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: varchar("business_id").notNull(),
  siteId: varchar("site_id"),
  metricDefinitionId: varchar("metric_definition_id").notNull(),
  reportingPeriodStart: timestamp("reporting_period_start").notNull(),
  reportingPeriodEnd: timestamp("reporting_period_end").notNull(),
  valueNumeric: decimal("value_numeric", { precision: 20, scale: 6 }),
  valueText: text("value_text"),
  valueBoolean: boolean("value_boolean"),
  valueJson: jsonb("value_json"),
  sourceType: metricValueSourceTypeEnum("source_type").notNull().default("manual"),
  status: metricValueStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  enteredByUserId: varchar("entered_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const metricEvidence = pgTable("metric_evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricValueId: varchar("metric_value_id").notNull(),
  fileUrl: text("file_url"),
  storageKey: text("storage_key"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  uploadedByUserId: varchar("uploaded_by_user_id"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  notes: text("notes"),
});

export const metricCalculationRuns = pgTable("metric_calculation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: varchar("business_id").notNull(),
  metricDefinitionId: varchar("metric_definition_id").notNull(),
  siteId: varchar("site_id"),
  reportingPeriodStart: timestamp("reporting_period_start").notNull(),
  reportingPeriodEnd: timestamp("reporting_period_end").notNull(),
  status: text("status").notNull().default("pending"),
  inputsJson: jsonb("inputs_json"),
  outputJson: jsonb("output_json"),
  errorText: text("error_text"),
  triggeredByMetricValueId: varchar("triggered_by_metric_value_id"),
  createdAt: timestamp("created_at").defaultNow(),
});


export const insertMetricDefinitionSchema = createInsertSchema(metricDefinitions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMetricDefinition = z.infer<typeof insertMetricDefinitionSchema>;
export type MetricDefinition = typeof metricDefinitions.$inferSelect;

export const insertMetricDefinitionValueSchema = createInsertSchema(metricDefinitionValues).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMetricDefinitionValue = z.infer<typeof insertMetricDefinitionValueSchema>;
export type MetricDefinitionValue = typeof metricDefinitionValues.$inferSelect;


export const insertMetricEvidenceSchema = createInsertSchema(metricEvidence).omit({ id: true, uploadedAt: true });
export type InsertMetricEvidence = z.infer<typeof insertMetricEvidenceSchema>;
export type MetricEvidence = typeof metricEvidence.$inferSelect;

export const insertMetricCalculationRunSchema = createInsertSchema(metricCalculationRuns).omit({ id: true, createdAt: true });
export type InsertMetricCalculationRun = z.infer<typeof insertMetricCalculationRunSchema>;
export type MetricCalculationRun = typeof metricCalculationRuns.$inferSelect;

// ============================================================
// ESG PHASE 2: FRAMEWORK MAPPING & READINESS
// ============================================================

export const frameworkRequirementTypeEnum = pgEnum("framework_requirement_type", [
  "metric", "narrative", "policy", "target", "risk", "evidence",
]);
export const mandatoryLevelEnum = pgEnum("mandatory_level", ["core", "conditional", "advanced"]);
export const mappingStrengthEnum = pgEnum("mapping_strength", ["direct", "partial", "supporting"]);

export const frameworks = pgTable("frameworks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  fullName: text("full_name"),
  description: text("description"),
  version: text("version"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  codeIdx: uniqueIndex("idx_frameworks_code").on(table.code),
}));

export const frameworkRequirements = pgTable("framework_requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  frameworkId: varchar("framework_id").notNull(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  requirementType: frameworkRequirementTypeEnum("requirement_type").notNull().default("metric"),
  pillar: text("pillar"),
  mandatoryLevel: mandatoryLevelEnum("mandatory_level").notNull().default("core"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  frameworkIdIdx: index("idx_fw_reqs_framework_id").on(table.frameworkId),
  codeIdx: uniqueIndex("idx_fw_reqs_code").on(table.code),
}));

export const metricFrameworkMappings = pgTable("metric_framework_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricDefinitionId: varchar("metric_definition_id").notNull(),
  frameworkRequirementId: varchar("framework_requirement_id").notNull(),
  mappingStrength: mappingStrengthEnum("mapping_strength").notNull().default("direct"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  metricDefIdx: index("idx_mfm_metric_def").on(table.metricDefinitionId),
  reqIdx: index("idx_mfm_req").on(table.frameworkRequirementId),
  uniqueMapping: uniqueIndex("idx_mfm_unique").on(table.metricDefinitionId, table.frameworkRequirementId),
}));

export const businessFrameworkSelections = pgTable("business_framework_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: varchar("business_id").notNull(),
  frameworkId: varchar("framework_id").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  businessIdx: index("idx_bfs_business").on(table.businessId),
  uniqueSelection: uniqueIndex("idx_bfs_unique").on(table.businessId, table.frameworkId),
}));

export const insertFrameworkSchema = createInsertSchema(frameworks).omit({ id: true, createdAt: true });
export type Framework = typeof frameworks.$inferSelect;
export type InsertFramework = z.infer<typeof insertFrameworkSchema>;

export const insertFrameworkRequirementSchema = createInsertSchema(frameworkRequirements).omit({ id: true, createdAt: true });
export type FrameworkRequirement = typeof frameworkRequirements.$inferSelect;
export type InsertFrameworkRequirement = z.infer<typeof insertFrameworkRequirementSchema>;

export const insertMetricFrameworkMappingSchema = createInsertSchema(metricFrameworkMappings).omit({ id: true, createdAt: true });
export type MetricFrameworkMapping = typeof metricFrameworkMappings.$inferSelect;
export type InsertMetricFrameworkMapping = z.infer<typeof insertMetricFrameworkMappingSchema>;

export const insertBusinessFrameworkSelectionSchema = createInsertSchema(businessFrameworkSelections).omit({ id: true, createdAt: true, updatedAt: true });
export type BusinessFrameworkSelection = typeof businessFrameworkSelections.$inferSelect;
export type InsertBusinessFrameworkSelection = z.infer<typeof insertBusinessFrameworkSelectionSchema>;

export const insertIdentityProviderSchema = createInsertSchema(identityProviders).omit({ id: true, createdAt: true, updatedAt: true });
export type IdentityProvider = typeof identityProviders.$inferSelect;
export type InsertIdentityProvider = z.infer<typeof insertIdentityProviderSchema>;

export const insertDataExportJobSchema = createInsertSchema(dataExportJobs).omit({ id: true, createdAt: true });
export type DataExportJob = typeof dataExportJobs.$inferSelect;
export type InsertDataExportJob = z.infer<typeof insertDataExportJobSchema>;

export const insertDataDeletionRequestSchema = createInsertSchema(dataDeletionRequests).omit({ id: true, createdAt: true });
export type DataDeletionRequest = typeof dataDeletionRequests.$inferSelect;
export type InsertDataDeletionRequest = z.infer<typeof insertDataDeletionRequestSchema>;

// ============================================================
// USER SESSIONS (extended session tracking)
// ============================================================

export const userSessions = pgTable("user_sessions_ext", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  companyId: varchar("company_id"),
  sessionId: text("session_id").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceSummary: text("device_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  stepUpAt: timestamp("step_up_at"),
}, (table) => ({
  userIdIdx: index("idx_user_sessions_ext_user_id").on(table.userId),
  sessionIdIdx: uniqueIndex("idx_user_sessions_ext_session_id").on(table.sessionId),
}));

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true, createdAt: true });
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;

// ============================================================
// SECURITY ALERTS
// ============================================================

export const securityAlerts = pgTable("security_alerts", {
  id: varchar("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  ruleName: text("rule_name").notNull(),
  severity: text("severity").notNull().default("medium"),
  action: text("action").notNull(),
  userId: varchar("user_id"),
  companyId: varchar("company_id"),
  ipAddress: text("ip_address"),
  details: jsonb("details"),
  firedAt: timestamp("fired_at").defaultNow(),
  notificationSentAt: timestamp("notification_sent_at"),
  notificationChannel: text("notification_channel"),
  notificationFailure: text("notification_failure"),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by"),
}, (table) => ({
  firedAtIdx: index("idx_security_alerts_fired_at").on(table.firedAt),
  severityIdx: index("idx_security_alerts_severity").on(table.severity),
}));

export type SecurityAlert = typeof securityAlerts.$inferSelect;

// ============================================================
// PORTFOLIO GROUPS
// ============================================================

export const groupTypeEnum = pgEnum("group_type", ["portfolio", "holding_company", "advisor_group", "other"]);
export const groupUserRoleEnum = pgEnum("group_user_role", ["portfolio_owner", "portfolio_viewer"]);

export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: groupTypeEnum("type").notNull().default("portfolio"),
  description: text("description"),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex("idx_groups_slug").on(table.slug),
}));

export const groupCompanies = pgTable("group_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  companyId: varchar("company_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  groupIdIdx: index("idx_group_companies_group_id").on(table.groupId),
  companyIdIdx: index("idx_group_companies_company_id").on(table.companyId),
  uniqueGroupCompany: uniqueIndex("idx_group_companies_unique").on(table.groupId, table.companyId),
}));

export const userGroupRoles = pgTable("user_group_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  groupId: varchar("group_id").notNull(),
  role: groupUserRoleEnum("role").notNull().default("portfolio_viewer"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_user_group_roles_user_id").on(table.userId),
  groupIdIdx: index("idx_user_group_roles_group_id").on(table.groupId),
  uniqueUserGroup: uniqueIndex("idx_user_group_roles_unique").on(table.userId, table.groupId),
}));

export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true, updatedAt: true });
export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export const insertGroupCompanySchema = createInsertSchema(groupCompanies).omit({ id: true, createdAt: true });
export type GroupCompany = typeof groupCompanies.$inferSelect;
export type InsertGroupCompany = z.infer<typeof insertGroupCompanySchema>;

export const insertUserGroupRoleSchema = createInsertSchema(userGroupRoles).omit({ id: true, createdAt: true, updatedAt: true });
export type UserGroupRole = typeof userGroupRoles.$inferSelect;
export type InsertUserGroupRole = z.infer<typeof insertUserGroupRoleSchema>;

// ============================================================
// COMPANY ONBOARDING CHECKLIST (Task #63)
// ============================================================

export const onboardingChecklistStatusEnum = pgEnum("onboarding_checklist_status", ["pending", "in_progress", "complete", "skipped"]);

export const companyOnboardingChecklist = pgTable("company_onboarding_checklist", {
  id: serial("id").primaryKey(),
  companyId: varchar("company_id").notNull(),
  taskKey: varchar("task_key").notNull(),
  label: varchar("label").notNull().default(""),
  description: text("description").default(""),
  status: onboardingChecklistStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  skippedAt: timestamp("skipped_at"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueCompanyTask: uniqueIndex("company_onboarding_checklist_company_task_key").on(table.companyId, table.taskKey),
}));

export const insertOnboardingChecklistSchema = createInsertSchema(companyOnboardingChecklist).omit({ id: true, createdAt: true, updatedAt: true });
export type CompanyOnboardingChecklist = typeof companyOnboardingChecklist.$inferSelect;
export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;

// ============================================================
// TELEMETRY EVENTS (Task #59)
// ============================================================

export const telemetryEvents = pgTable("telemetry_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventName: text("event_name").notNull(),
  userId: varchar("user_id"),
  companyId: varchar("company_id"),
  groupId: varchar("group_id"),
  properties: jsonb("properties"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => ({
  eventNameIdx: index("idx_telemetry_event_name").on(table.eventName),
  companyIdIdx: index("idx_telemetry_company_id").on(table.companyId),
  recordedAtIdx: index("idx_telemetry_recorded_at").on(table.recordedAt),
}));

export const insertTelemetryEventSchema = createInsertSchema(telemetryEvents).omit({ id: true, recordedAt: true });
export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type InsertTelemetryEvent = z.infer<typeof insertTelemetryEventSchema>;
