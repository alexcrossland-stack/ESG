import { eq, and, desc, sql, lt, isNull, or, count, gte, lte, gt, inArray, asc, ilike, avg } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users, companies, companySettings, esgPolicies, policyVersions,
  materialTopics, metrics, metricTargets, metricValues, evidenceFiles,
  actionPlans, reportRuns, auditLogs, rawDataInputs,
  policyGenerationInputs, emissionFactors, carbonCalculations,
  questionnaires, questionnaireQuestions,
  aiGenerationLogs, evidenceRequests, reportingPeriods,
  backgroundJobs, platformHealthEvents, generatedFiles, userActivity,
  authTokens, superAdminActions, organisationSites,
  metricDefinitions, metricDefinitionValues, metricEvidence, metricCalculationRuns,
  businessMaterialityAssessments, policyRecords, governanceAssignments,
  esgTargets, esgActions, esgRisks,
  identityProviders, dataExportJobs, dataDeletionRequests,
  userSessions,
  groups, groupCompanies, userGroupRoles,
  type Group, type InsertGroup,
  type GroupCompany, type InsertGroupCompany,
  type UserGroupRole, type InsertUserGroupRole,
  type UserSession, type InsertUserSession,
  type AuthToken, type InsertAuthToken,
  type User, type InsertUser, type Company, type InsertCompany,
  type CompanySettings, type EsgPolicy, type PolicyVersion, type InsertPolicyVersion,
  type MaterialTopic, type InsertMaterialTopic, type Metric, type InsertMetric,
  type MetricTarget, type MetricValue, type InsertMetricValue,
  type EvidenceFile, type ActionPlan, type InsertActionPlan,
  type ReportRun, type AuditLog,
  type RawDataInput, type InsertRawDataInput,
  type PolicyGenerationInput, type InsertPolicyGenerationInput,
  type EmissionFactor, type InsertEmissionFactor,
  type CarbonCalculation, type InsertCarbonCalculation,
  type Questionnaire, type InsertQuestionnaire,
  type QuestionnaireQuestion, type InsertQuestionnaireQuestion,
  policyTemplates, generatedPolicies,
  type PolicyTemplate, type InsertPolicyTemplate,
  type GeneratedPolicy, type InsertGeneratedPolicy,
  type AiGenerationLog, type InsertAiGenerationLog,
  notifications,
  type Notification, type InsertNotification,
  type EvidenceRequest, type InsertEvidenceRequest,
  type ReportingPeriod, type InsertReportingPeriod,
  type BackgroundJob, type InsertBackgroundJob,
  type PlatformHealthEvent, type InsertPlatformHealthEvent,
  type GeneratedFile, type InsertGeneratedFile,
  type UserActivity, type InsertUserActivity,
  supportRequests,
  type SupportRequest,
  agentApiKeys, agentRuns, agentActions, agentEscalations, chatSessions, chatMessages,
  type AgentApiKey, type InsertAgentApiKey,
  type AgentRun, type InsertAgentRun,
  type AgentAction, type InsertAgentAction,
  type AgentEscalation, type InsertAgentEscalation,
  type ChatSession, type InsertChatSession,
  type ChatMessage, type InsertChatMessage,
  type SuperAdminAction, type InsertSuperAdminAction,
  type OrganisationSite, type InsertOrganisationSite,
  type MetricDefinition, type InsertMetricDefinition,
  type MetricDefinitionValue, type InsertMetricDefinitionValue,
  type MetricEvidence, type InsertMetricEvidence,
  type MetricCalculationRun, type InsertMetricCalculationRun,
  frameworks, frameworkRequirements, metricFrameworkMappings, businessFrameworkSelections,
  type Framework, type InsertFramework,
  type FrameworkRequirement, type InsertFrameworkRequirement,
  type MetricFrameworkMapping, type InsertMetricFrameworkMapping,
  type BusinessFrameworkSelection, type InsertBusinessFrameworkSelection,
  type BusinessMaterialityAssessment, type InsertBusinessMaterialityAssessment,
  type PolicyRecord, type InsertPolicyRecord,
  type GovernanceAssignment, type InsertGovernanceAssignment,
  type EsgTarget, type InsertEsgTarget,
  type EsgAction, type InsertEsgAction,
  type EsgRisk, type InsertEsgRisk,
  type IdentityProvider, type InsertIdentityProvider,
  type DataExportJob, type InsertDataExportJob,
  type DataDeletionRequest, type InsertDataDeletionRequest,
  telemetryEvents,
  type TelemetryEvent, type InsertTelemetryEvent,
  companyOnboardingChecklist,
  type CompanyOnboardingChecklist, type InsertOnboardingChecklist,
  accessGrants,
  type AccessGrant, type InsertAccessGrant,
} from "@shared/schema";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);


function pgRowToCamelCase<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, val]) => [
      key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()),
      val,
    ]),
  ) as unknown as T;
}

function storageError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

async function anonymiseUserRecord(tx: any, userId: string): Promise<void> {
  const anonEmail = `deleted-${userId}@anonymised.local`;
  const anonUsername = `deleted_${userId}`;
  await tx.update(users).set({
    email: anonEmail,
    username: anonUsername,
    password: "ANONYMISED",
    role: "viewer",
    companyId: null,
    mfaSecretEncrypted: null,
    mfaBackupCodesHash: null,
    mfaEnabled: false,
    externalId: null,
    identityProviderId: null,
    anonymisedAt: new Date(),
  }).where(eq(users.id, userId));
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getUsersByCompany(companyId: string): Promise<User[]>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<Company>): Promise<Company | undefined>;

  // Company Settings
  getCompanySettings(companyId: string): Promise<CompanySettings | undefined>;
  upsertCompanySettings(companyId: string, data: Partial<CompanySettings>): Promise<CompanySettings>;

  // ESG Policies
  getPolicy(companyId: string): Promise<EsgPolicy | undefined>;
  createPolicy(companyId: string): Promise<EsgPolicy>;
  updatePolicy(id: string, data: Partial<EsgPolicy>): Promise<EsgPolicy | undefined>;
  getPolicyVersions(policyId: string): Promise<PolicyVersion[]>;
  createPolicyVersion(version: InsertPolicyVersion): Promise<PolicyVersion>;
  getLatestPolicyVersion(policyId: string): Promise<PolicyVersion | undefined>;

  // Material Topics
  getMaterialTopics(companyId: string): Promise<MaterialTopic[]>;
  upsertMaterialTopics(companyId: string, topics: Omit<MaterialTopic, "id" | "companyId">[]): Promise<void>;
  updateMaterialTopic(id: string, selected: boolean): Promise<void>;

  // Metrics
  getMetrics(companyId: string): Promise<Metric[]>;
  getMetric(id: string): Promise<Metric | undefined>;
  createMetric(metric: InsertMetric): Promise<Metric>;
  updateMetric(id: string, data: Partial<Metric>): Promise<Metric | undefined>;
  getMetricTarget(metricId: string): Promise<MetricTarget | undefined>;
  upsertMetricTarget(metricId: string, targetValue: string, targetYear: number): Promise<MetricTarget>;

  // Metric Values
  getMetricValues(metricId: string): Promise<MetricValue[]>;
  getMetricValueForPeriodSite(metricId: string, period: string, siteId: string | null): Promise<MetricValue | undefined>;
  getMetricValuesByPeriod(companyId: string, period: string): Promise<(MetricValue & { metricName: string; category: string; unit: string | null })[]>;
  hasAnyData(companyId: string): Promise<boolean>;
  countEstimatedValues(companyId: string): Promise<number>;
  createMetricValue(value: InsertMetricValue): Promise<MetricValue>;
  updateMetricValue(id: string, data: Partial<MetricValue>): Promise<MetricValue | undefined>;
  upsertMetricValue(value: InsertMetricValue): Promise<MetricValue>;
  lockPeriod(companyId: string, period: string): Promise<void>;

  // Raw Data Inputs
  // RawDataInput / InsertRawDataInput include estimation fields added in Task #56:
  // estimateMethod, estimateConfidence, estimateBasisJson, isUserReviewed, lastEstimatedAt
  getRawDataByPeriod(companyId: string, period: string, siteId?: string | null): Promise<RawDataInput[]>;
  createRawDataInput(data: InsertRawDataInput): Promise<RawDataInput>;
  updateRawDataInput(id: string, data: Partial<RawDataInput>): Promise<RawDataInput | undefined>;
  upsertRawDataInput(companyId: string, inputName: string, period: string, data: Partial<InsertRawDataInput>): Promise<RawDataInput>;

  // Evidence Files
  getEvidenceFiles(companyId: string, siteId?: string | null, period?: string): Promise<EvidenceFile[]>;
  getEvidenceByEntity(companyId: string, linkedModule: string, linkedEntityId: string): Promise<EvidenceFile[]>;
  getEvidenceCoverage(companyId: string, period?: string): Promise<any>;
  createEvidenceFile(file: Omit<EvidenceFile, "id" | "uploadedAt" | "reviewedBy" | "reviewedAt">): Promise<EvidenceFile>;
  updateEvidenceFile(id: string, data: Partial<EvidenceFile>): Promise<EvidenceFile | undefined>;
  deleteEvidenceFile(id: string): Promise<void>;

  // Action Plans
  getActionPlans(companyId: string): Promise<ActionPlan[]>;
  getActionPlan(id: string): Promise<ActionPlan | undefined>;
  createActionPlan(plan: InsertActionPlan): Promise<ActionPlan>;
  updateActionPlan(id: string, data: Partial<ActionPlan>): Promise<ActionPlan | undefined>;
  deleteActionPlan(id: string): Promise<void>;

  // Reports
  getReportRuns(companyId: string, siteId?: string | null): Promise<ReportRun[]>;
  createReportRun(report: Omit<ReportRun, "id" | "generatedAt">): Promise<ReportRun>;

  // Legacy migration
  getUnassignedCounts(companyId: string): Promise<Record<string, number>>;
  migrateLegacyData(companyId: string, siteId: string): Promise<Record<string, number>>;

  // ESG Phase 2: Framework Mapping & Readiness
  getFrameworks(activeOnly?: boolean): Promise<Framework[]>;
  getFramework(id: string): Promise<Framework | undefined>;
  getFrameworkByCode(code: string): Promise<Framework | undefined>;
  getFrameworkRequirements(frameworkId: string): Promise<FrameworkRequirement[]>;
  getAllFrameworkRequirements(): Promise<FrameworkRequirement[]>;
  getMetricFrameworkMappings(metricDefinitionId: string): Promise<MetricFrameworkMapping[]>;
  getMappingsForRequirement(frameworkRequirementId: string): Promise<MetricFrameworkMapping[]>;
  getAllMappings(): Promise<MetricFrameworkMapping[]>;
  getBusinessFrameworkSelections(businessId: string): Promise<BusinessFrameworkSelection[]>;
  upsertBusinessFrameworkSelection(businessId: string, frameworkId: string, isEnabled: boolean): Promise<BusinessFrameworkSelection>;
  getFrameworkReadiness(businessId: string): Promise<any>;
  getMetricDefinitionFrameworkAlignment(metricDefinitionId: string): Promise<any>;

  // Audit Logs
  getNotifications(companyId: string): Promise<Notification[]>;
  getActiveNotifications(companyId: string): Promise<Notification[]>;
  createNotification(n: InsertNotification): Promise<Notification>;
  dismissNotification(id: string, companyId: string, userId: string): Promise<Notification | undefined>;
  dismissAllNotifications(companyId: string, userId: string): Promise<void>;
  deleteNotificationsBySourceKey(sourceKeyPrefix: string, companyId: string): Promise<void>;
  getNotificationBySourceKey(sourceKey: string, companyId: string): Promise<Notification | undefined>;

  getAuditLogs(companyId: string, limit?: number): Promise<AuditLog[]>;
  getAllAuditLogs(limit?: number, filters?: { action?: string; actorType?: string }): Promise<AuditLog[]>;
  queryAuditLogs(filters: { companyId?: string; userId?: string; entityType?: string; action?: string; dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<AuditLog[]>;
  createAuditLog(log: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog>;

  // Dashboard
  getDashboardData(companyId: string): Promise<any>;

  // Policy Generation
  createPolicyGenerationInput(data: InsertPolicyGenerationInput): Promise<PolicyGenerationInput>;
  getPolicyGenerationInputs(companyId: string): Promise<PolicyGenerationInput[]>;
  updatePolicyGenerationInput(id: string, data: Partial<PolicyGenerationInput>): Promise<PolicyGenerationInput | undefined>;

  // Emission Factors
  getEmissionFactors(country?: string): Promise<EmissionFactor[]>;
  createEmissionFactor(factor: InsertEmissionFactor): Promise<EmissionFactor>;
  updateEmissionFactor(id: string, data: Partial<EmissionFactor>): Promise<EmissionFactor | undefined>;

  // Carbon Calculations
  getCarbonCalculations(companyId: string, siteId?: string | null, period?: string): Promise<CarbonCalculation[]>;
  getCarbonCalculation(id: string): Promise<CarbonCalculation | undefined>;
  createCarbonCalculation(calc: InsertCarbonCalculation): Promise<CarbonCalculation>;
  updateCarbonCalculation(id: string, data: Partial<CarbonCalculation>): Promise<CarbonCalculation | undefined>;
  deleteCarbonCalculation(id: string): Promise<void>;

  // Questionnaires
  getQuestionnaires(companyId: string, siteId?: string | null, reportingPeriodId?: string): Promise<Questionnaire[]>;
  getQuestionnaire(id: string): Promise<Questionnaire | undefined>;
  createQuestionnaire(q: InsertQuestionnaire): Promise<Questionnaire>;
  updateQuestionnaire(id: string, data: Partial<Questionnaire>): Promise<Questionnaire | undefined>;
  deleteQuestionnaire(id: string): Promise<void>;
  getQuestionnaireQuestions(questionnaireId: string): Promise<QuestionnaireQuestion[]>;
  createQuestionnaireQuestion(q: InsertQuestionnaireQuestion): Promise<QuestionnaireQuestion>;
  updateQuestionnaireQuestion(id: string, data: Partial<QuestionnaireQuestion>): Promise<QuestionnaireQuestion | undefined>;
  deleteQuestionnaireQuestions(questionnaireId: string): Promise<void>;

  // Organisation Sites
  getSites(companyId: string, includeArchived?: boolean): Promise<OrganisationSite[]>;
  getSite(id: string, companyId: string): Promise<OrganisationSite | undefined>;
  createSite(data: InsertOrganisationSite): Promise<OrganisationSite>;
  updateSite(id: string, companyId: string, data: Partial<InsertOrganisationSite>): Promise<OrganisationSite | undefined>;
  archiveSite(id: string, companyId: string): Promise<OrganisationSite | undefined>;
  getSitesSummary(companyId: string, period?: string, reportingPeriodId?: string): Promise<Array<{ siteId: string | null; siteName: string; status: string; metricCount: number; evidenceCount: number; questionnaireCount: number }>>;
  getSiteDashboard(siteId: string, companyId: string, period?: string, reportingPeriodId?: string): Promise<any>;

  // Policy Templates
  getPolicyTemplates(): Promise<PolicyTemplate[]>;
  getPolicyTemplate(slug: string): Promise<PolicyTemplate | undefined>;
  createPolicyTemplate(t: InsertPolicyTemplate): Promise<PolicyTemplate>;
  updatePolicyTemplate(slug: string, data: Partial<PolicyTemplate>): Promise<PolicyTemplate | undefined>;
  getPolicyTemplateCount(): Promise<number>;

  // Generated Policies
  getGeneratedPolicies(companyId: string): Promise<GeneratedPolicy[]>;
  getGeneratedPolicy(id: string): Promise<GeneratedPolicy | undefined>;
  createGeneratedPolicy(p: InsertGeneratedPolicy): Promise<GeneratedPolicy>;
  updateGeneratedPolicy(id: string, data: Partial<GeneratedPolicy>): Promise<GeneratedPolicy | undefined>;
  deleteGeneratedPolicy(id: string): Promise<void>;

  // AI Generation Logs
  createAiGenerationLog(log: InsertAiGenerationLog): Promise<AiGenerationLog>;
  getAiGenerationLogs(companyId: string, entityType?: string, entityId?: string): Promise<AiGenerationLog[]>;

  // Workflow
  updateWorkflowStatus(table: string, id: string, status: string, userId: string, comment?: string, companyId?: string): Promise<void>;
  getWorkflowPendingItems(companyId: string): Promise<any>;

  // Task Ownership
  assignOwner(entityType: string, entityId: string, assignedUserId: string, companyId: string): Promise<void>;
  getUserTasks(userId: string, companyId: string): Promise<any[]>;
  getUserApprovals(companyId: string): Promise<any>;

  // Evidence Requests
  getEvidenceRequests(companyId: string): Promise<EvidenceRequest[]>;
  getEvidenceRequestsByUser(userId: string, companyId: string): Promise<EvidenceRequest[]>;
  createEvidenceRequest(data: InsertEvidenceRequest): Promise<EvidenceRequest>;
  updateEvidenceRequest(id: string, companyId: string, data: Partial<EvidenceRequest>): Promise<EvidenceRequest | undefined>;
  linkEvidenceToRequest(requestId: string, evidenceFileId: string, companyId: string): Promise<EvidenceRequest | undefined>;

  // Reporting Periods
  getReportingPeriods(companyId: string): Promise<ReportingPeriod[]>;
  createReportingPeriod(data: InsertReportingPeriod): Promise<ReportingPeriod>;
  closeReportingPeriod(id: string, companyId: string): Promise<ReportingPeriod | undefined>;
  lockReportingPeriod(id: string, companyId: string): Promise<ReportingPeriod | undefined>;
  copyForwardPeriod(sourcePeriodId: string, companyId: string, newPeriodData: InsertReportingPeriod): Promise<{ period: ReportingPeriod; copiedMetrics: number; copiedActions: number }>;
  getPeriodComparison(companyId: string, currentPeriod: string, comparePeriod: string): Promise<any[]>;

  createBackgroundJob(job: InsertBackgroundJob): Promise<BackgroundJob>;
  getBackgroundJob(id: string): Promise<BackgroundJob | undefined>;
  updateBackgroundJob(id: string, data: Partial<BackgroundJob>): Promise<BackgroundJob | undefined>;
  getPendingJobs(limit?: number): Promise<BackgroundJob[]>;
  getJobsByCompany(companyId: string): Promise<BackgroundJob[]>;
  getRecentJobs(limit?: number): Promise<BackgroundJob[]>;
  getJobByIdempotencyKey(key: string): Promise<BackgroundJob | undefined>;

  createPlatformHealthEvent(event: InsertPlatformHealthEvent): Promise<PlatformHealthEvent>;
  getPlatformHealthEvents(limit?: number, offset?: number, severity?: string, eventType?: string): Promise<PlatformHealthEvent[]>;

  createGeneratedFile(file: InsertGeneratedFile): Promise<GeneratedFile>;
  getGeneratedFile(id: string): Promise<GeneratedFile | undefined>;
  getGeneratedFilesByReportRun(reportRunId: string): Promise<GeneratedFile[]>;

  createUserActivity(activity: InsertUserActivity): Promise<UserActivity>;
  getActivityAnalytics(days?: number): Promise<any>;
  getActivityTimeline(days?: number): Promise<any[]>;
  cleanupOldActivity(retentionDays?: number): Promise<number>;

  // Support Requests
  createSupportRequest(data: Omit<SupportRequest, "id" | "createdAt" | "updatedAt">): Promise<SupportRequest>;
  getSupportRequests(limit?: number): Promise<SupportRequest[]>;
  getSupportRequest(id: string): Promise<SupportRequest | undefined>;
  updateSupportRequest(id: string, data: Partial<SupportRequest>): Promise<SupportRequest | undefined>;
  getSupportRequestsByCompany(companyId: string): Promise<SupportRequest[]>;

  // Auth Tokens
  createAuthToken(data: InsertAuthToken): Promise<AuthToken>;
  getAuthTokenByHash(hash: string): Promise<AuthToken | undefined>;
  markAuthTokenUsed(id: string): Promise<void>;
  cleanupExpiredAuthTokens(): Promise<number>;

  // Billing
  updateCompanyBilling(companyId: string, data: { planTier?: string; planStatus?: string; currentPeriodEnd?: Date | null; stripeCustomerId?: string; stripeSubscriptionId?: string }): Promise<void>;
  getHealthEventCounts(since: Date): Promise<{ total: number; byType: Record<string, number>; bySeverity: Record<string, number> }>;

  // Agent API Keys
  createAgentApiKey(data: InsertAgentApiKey): Promise<AgentApiKey>;
  getAgentApiKeyByHash(hash: string): Promise<AgentApiKey | undefined>;
  listAgentApiKeys(): Promise<AgentApiKey[]>;
  listAgentApiKeysByCompany(companyId: string): Promise<AgentApiKey[]>;
  getAgentApiKey(id: string): Promise<AgentApiKey | undefined>;
  revokeAgentApiKey(id: string): Promise<void>;
  updateAgentApiKeyLastUsed(id: string): Promise<void>;

  // Agent Runs / Actions / Escalations
  getAgentRuns(filters?: { companyId?: string; siteId?: string; limit?: number }): Promise<AgentRun[]>;
  createAgentRun(data: InsertAgentRun): Promise<AgentRun>;
  updateAgentRun(id: string, updates: Partial<AgentRun>): Promise<AgentRun | undefined>;
  createAgentAction(data: InsertAgentAction): Promise<AgentAction>;
  createAgentEscalation(data: InsertAgentEscalation): Promise<AgentEscalation>;
  listAgentEscalations(filters?: { status?: string; companyId?: string; limit?: number }): Promise<AgentEscalation[]>;

  // Chat
  createChatSession(data: InsertChatSession): Promise<ChatSession>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  listChatSessions(filters?: { userId?: string; companyId?: string }): Promise<ChatSession[]>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(sessionId: string): Promise<ChatMessage[]>;

  // Super Admin
  adminListCompanies(search?: string, page?: number, pageSize?: number): Promise<{ companies: any[]; total: number }>;
  adminListUsers(search?: string, page?: number, pageSize?: number): Promise<{ users: any[]; total: number }>;
  adminGetCompanyDetail(companyId: string): Promise<any>;
  adminSuspendCompany(companyId: string): Promise<void>;
  adminReactivateCompany(companyId: string): Promise<void>;
  adminArchiveCompany(companyId: string): Promise<Company>;
  adminDeleteCompany(companyId: string): Promise<Company>;
  adminDeleteUser(userId: string, currentSuperAdminUserId: string): Promise<User>;
  createSuperAdminAction(data: Omit<InsertSuperAdminAction, "id" | "createdAt">): Promise<SuperAdminAction>;
  getCompanyStatus(companyId: string): Promise<string | null>;
  adminGetCompanyDiagnostics(companyId: string): Promise<any>;

  // Metric Definitions
  getMetricDefinitions(filters?: { pillar?: string; isCore?: boolean; isActive?: boolean; search?: string }): Promise<MetricDefinition[]>;
  getMetricDefinition(id: string): Promise<MetricDefinition | undefined>;
  getMetricDefinitionByCode(code: string): Promise<MetricDefinition | undefined>;
  createMetricDefinition(data: InsertMetricDefinition): Promise<MetricDefinition>;
  updateMetricDefinition(id: string, data: Partial<MetricDefinition>): Promise<MetricDefinition | undefined>;
  seedMetricDefinitions(definitions: InsertMetricDefinition[]): Promise<number>;

  // Metric Definition Values
  getMetricDefinitionValues(businessId: string, filters?: { metricDefinitionId?: string; siteId?: string | null; periodStart?: Date; periodEnd?: Date }): Promise<MetricDefinitionValue[]>;
  getMetricDefinitionValueById(id: string, businessId: string): Promise<MetricDefinitionValue | undefined>;
  createMetricDefinitionValue(data: InsertMetricDefinitionValue): Promise<MetricDefinitionValue>;
  updateMetricDefinitionValue(id: string, businessId: string, data: Partial<MetricDefinitionValue>): Promise<MetricDefinitionValue | undefined>;
  upsertMetricDefinitionValue(businessId: string, metricDefinitionId: string, siteId: string | null, periodStart: Date, periodEnd: Date, data: Partial<InsertMetricDefinitionValue>): Promise<MetricDefinitionValue>;
  rollupSiteValuesToCompany(businessId: string, metricDefinitionId: string, periodStart: Date, periodEnd: Date): Promise<number | null>;

  // Metric Evidence
  getMetricEvidence(metricValueId: string): Promise<MetricEvidence[]>;
  getMetricEvidenceById(id: string, businessId: string): Promise<MetricEvidence | undefined>;
  createMetricEvidence(data: InsertMetricEvidence): Promise<MetricEvidence>;
  deleteMetricEvidence(id: string): Promise<void>;

  // Metric Calculation Runs
  createMetricCalculationRun(data: InsertMetricCalculationRun): Promise<MetricCalculationRun>;
  updateMetricCalculationRun(id: string, data: Partial<MetricCalculationRun>): Promise<MetricCalculationRun | undefined>;
  getMetricCalculationRuns(businessId: string, metricDefinitionId?: string): Promise<MetricCalculationRun[]>;

  // Materiality Assessments
  getMaterialTopic(id: string): Promise<MaterialTopic | undefined>;
  upsertMaterialTopicScores(id: string, companyId: string, data: Partial<MaterialTopic>): Promise<MaterialTopic | undefined>;
  seedDefaultMaterialTopics(companyId: string): Promise<void>;
  getMaterialityAssessments(companyId: string): Promise<BusinessMaterialityAssessment[]>;
  createMaterialityAssessment(data: InsertBusinessMaterialityAssessment): Promise<BusinessMaterialityAssessment>;
  updateMaterialityAssessment(id: string, companyId: string, data: Partial<BusinessMaterialityAssessment>): Promise<BusinessMaterialityAssessment | undefined>;

  // Policy Records
  getPolicyRecords(companyId: string): Promise<PolicyRecord[]>;
  getPolicyRecord(id: string, companyId: string): Promise<PolicyRecord | undefined>;
  createPolicyRecord(data: InsertPolicyRecord): Promise<PolicyRecord>;
  updatePolicyRecord(id: string, companyId: string, data: Partial<PolicyRecord>): Promise<PolicyRecord | undefined>;
  deletePolicyRecord(id: string, companyId: string): Promise<void>;

  // Governance Assignments
  getGovernanceAssignments(companyId: string): Promise<GovernanceAssignment[]>;
  upsertGovernanceAssignment(companyId: string, area: string, data: Partial<InsertGovernanceAssignment>): Promise<GovernanceAssignment>;
  deleteGovernanceAssignment(id: string, companyId: string): Promise<void>;

  // ESG Targets
  getEsgTargets(companyId: string): Promise<EsgTarget[]>;
  getEsgTarget(id: string, companyId: string): Promise<EsgTarget | undefined>;
  createEsgTarget(data: InsertEsgTarget): Promise<EsgTarget>;
  updateEsgTarget(id: string, companyId: string, data: Partial<EsgTarget>): Promise<EsgTarget | undefined>;
  deleteEsgTarget(id: string, companyId: string): Promise<void>;

  // ESG Actions
  getEsgActions(companyId: string, targetId?: string, riskId?: string): Promise<EsgAction[]>;
  getEsgAction(id: string, companyId: string): Promise<EsgAction | undefined>;
  createEsgAction(data: InsertEsgAction): Promise<EsgAction>;
  updateEsgAction(id: string, companyId: string, data: Partial<EsgAction>): Promise<EsgAction | undefined>;
  deleteEsgAction(id: string, companyId: string): Promise<void>;

  // ESG Risks
  getEsgRisks(companyId: string, pillar?: string, riskType?: string): Promise<EsgRisk[]>;
  getEsgRisk(id: string, companyId: string): Promise<EsgRisk | undefined>;
  createEsgRisk(data: InsertEsgRisk): Promise<EsgRisk>;
  updateEsgRisk(id: string, companyId: string, data: Partial<EsgRisk>): Promise<EsgRisk | undefined>;
  deleteEsgRisk(id: string, companyId: string): Promise<void>;

  // Identity Providers
  getIdentityProviders(companyId: string): Promise<IdentityProvider[]>;
  getIdentityProvider(id: string): Promise<IdentityProvider | undefined>;
  createIdentityProvider(data: InsertIdentityProvider): Promise<IdentityProvider>;
  updateIdentityProvider(id: string, data: Partial<IdentityProvider>): Promise<IdentityProvider | undefined>;
  deleteIdentityProvider(id: string): Promise<void>;

  // Data Export Jobs
  createDataExportJob(data: InsertDataExportJob): Promise<DataExportJob>;
  getDataExportJob(id: string): Promise<DataExportJob | undefined>;
  getDataExportJobByToken(token: string): Promise<DataExportJob | undefined>;
  updateDataExportJob(id: string, data: Partial<DataExportJob>): Promise<DataExportJob | undefined>;
  getDataExportJobs(companyId: string): Promise<DataExportJob[]>;
  getPendingDataExportJobs(limit?: number): Promise<DataExportJob[]>;
  cleanupExpiredExportJobs(): Promise<number>;

  // Data Deletion Requests
  createDataDeletionRequest(data: InsertDataDeletionRequest): Promise<DataDeletionRequest>;
  getDataDeletionRequest(id: string): Promise<DataDeletionRequest | undefined>;
  getDataDeletionRequests(companyId: string): Promise<DataDeletionRequest[]>;
  updateDataDeletionRequest(id: string, data: Partial<DataDeletionRequest>): Promise<DataDeletionRequest | undefined>;
  anonymiseUser(userId: string): Promise<void>;
  deleteCompanyData(companyId: string): Promise<void>;

  // User Sessions (extended tracking)
  createUserSession(data: InsertUserSession): Promise<UserSession>;
  getUserSession(sessionId: string): Promise<UserSession | undefined>;
  getUserSessions(userId: string): Promise<UserSession[]>;
  updateUserSessionLastSeen(sessionId: string): Promise<void>;
  revokeUserSession(sessionId: string): Promise<void>;
  revokeAllUserSessionsExcept(userId: string, currentSessionId: string): Promise<number>;
  setUserSessionStepUp(sessionId: string): Promise<void>;
  cleanupExpiredUserSessions(): Promise<number>;

  // Portfolio Groups
  createGroup(data: InsertGroup): Promise<Group>;
  getGroupById(id: string): Promise<Group | undefined>;
  getGroupsForUser(userId: string): Promise<Group[]>;
  getGroupCompanies(groupId: string): Promise<Company[]>;
  addCompanyToGroup(groupId: string, companyId: string): Promise<GroupCompany>;
  removeCompanyFromGroup(groupId: string, companyId: string): Promise<void>;
  assignUserGroupRole(userId: string, groupId: string, role: string): Promise<UserGroupRole>;
  removeUserGroupRole(userId: string, groupId: string): Promise<void>;
  getUserGroupRoles(userId: string): Promise<UserGroupRole[]>;
  getGroupsForUserWithRoleContext(userId: string): Promise<Array<Group & { role: string; companyCount: number }>>;
  getPortfolioGroupSummary(groupId: string, authorizedCompanyIds: string[]): Promise<{
    totalCompanies: number;
    averageEsgScore: number | null;
    missingDataCount: number;
    overdueUpdatesCount: number;
    reportsReadyCount: number;
    highRiskFlagsCount: number;
  }>;
  getPortfolioGroupCompanies(groupId: string, authorizedCompanyIds: string[], options: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    search?: string;
    sector?: string;
    status?: string;
    scoreBand?: string;
    alertsOnly?: boolean;
  }): Promise<{ rows: any[]; total: number }>;
  getPortfolioGroupAlerts(groupId: string, authorizedCompanyIds: string[]): Promise<{
    neverOnboarded: Array<{ companyId: string; companyName: string; reason: string }>;
    missingEvidence: Array<{ companyId: string; companyName: string; reason: string }>;
    overdueUpdates: Array<{ companyId: string; companyName: string; reason: string }>;
    noRecentReport: Array<{ companyId: string; companyName: string; reason: string }>;
  }>;
  getPortfolioGroupActivity(groupId: string, authorizedCompanyIds: string[], limit?: number): Promise<Array<{
    companyId: string;
    companyName: string;
    action: string;
    actor: string | null;
    timestamp: Date;
  }>>;

  // Telemetry Events (Task #59)
  createTelemetryEvent(data: InsertTelemetryEvent): Promise<TelemetryEvent>;
  getTelemetryEvents(filters?: { eventName?: string; companyId?: string; userId?: string; limit?: number }): Promise<TelemetryEvent[]>;

  // Onboarding Checklist (Task #63)
  getOnboardingChecklist(companyId: string): Promise<CompanyOnboardingChecklist[]>;
  createOnboardingChecklistTask(data: InsertOnboardingChecklist): Promise<CompanyOnboardingChecklist>;
  updateOnboardingChecklistTask(companyId: string, taskKey: string, data: Partial<CompanyOnboardingChecklist>): Promise<CompanyOnboardingChecklist | undefined>;

  // Access Grants (Task #67)
  createAccessGrant(data: InsertAccessGrant): Promise<AccessGrant>;
  listAccessGrants(filter?: { status?: "active" | "expired" | "revoked" }): Promise<any[]>;
  getAccessGrant(id: string): Promise<AccessGrant | undefined>;
  revokeAccessGrant(id: string): Promise<AccessGrant | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getUsersByCompany(companyId: string) {
    return db.select().from(users).where(eq(users.companyId, companyId));
  }

  async getCompany(id: string) {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async createCompany(company: InsertCompany) {
    const [c] = await db.insert(companies).values(company).returning();
    return c;
  }

  async updateCompany(id: string, data: Partial<Company>) {
    const [c] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    return c;
  }

  async getCompanySettings(companyId: string) {
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId));
    return settings;
  }

  async upsertCompanySettings(companyId: string, data: Partial<CompanySettings>) {
    const existing = await this.getCompanySettings(companyId);
    if (existing) {
      const [s] = await db.update(companySettings).set(data).where(eq(companySettings.companyId, companyId)).returning();
      return s;
    } else {
      const [s] = await db.insert(companySettings).values({ companyId, ...data } as any).returning();
      return s;
    }
  }

  async getPolicy(companyId: string) {
    const [policy] = await db.select().from(esgPolicies).where(eq(esgPolicies.companyId, companyId));
    return policy;
  }

  async createPolicy(companyId: string) {
    const [policy] = await db.insert(esgPolicies).values({ companyId }).returning();
    return policy;
  }

  async updatePolicy(id: string, data: Partial<EsgPolicy>) {
    const [policy] = await db.update(esgPolicies).set({ ...data, updatedAt: new Date() }).where(eq(esgPolicies.id, id)).returning();
    return policy;
  }

  async getPolicyVersions(policyId: string) {
    return db.select().from(policyVersions).where(eq(policyVersions.policyId, policyId)).orderBy(desc(policyVersions.versionNumber));
  }

  async createPolicyVersion(version: InsertPolicyVersion) {
    const [v] = await db.insert(policyVersions).values(version).returning();
    return v;
  }

  async getLatestPolicyVersion(policyId: string) {
    const [v] = await db.select().from(policyVersions).where(eq(policyVersions.policyId, policyId)).orderBy(desc(policyVersions.versionNumber)).limit(1);
    return v;
  }

  async getMaterialTopics(companyId: string) {
    return db.select().from(materialTopics).where(eq(materialTopics.companyId, companyId));
  }

  async upsertMaterialTopics(companyId: string, topics: Omit<MaterialTopic, "id" | "companyId">[]) {
    for (const topic of topics) {
      await db.insert(materialTopics).values({ companyId, ...topic } as any).onConflictDoNothing();
    }
  }

  async updateMaterialTopic(id: string, selected: boolean) {
    await db.update(materialTopics).set({ selected }).where(eq(materialTopics.id, id));
  }

  async getMetrics(companyId: string) {
    return db.select().from(metrics).where(eq(metrics.companyId, companyId)).orderBy(metrics.category, metrics.name);
  }

  async getMetric(id: string) {
    const [m] = await db.select().from(metrics).where(eq(metrics.id, id));
    return m;
  }

  async createMetric(metric: InsertMetric) {
    const [m] = await db.insert(metrics).values(metric).returning();
    return m;
  }

  async updateMetric(id: string, data: Partial<Metric>) {
    const [m] = await db.update(metrics).set(data).where(eq(metrics.id, id)).returning();
    return m;
  }

  async getMetricTarget(metricId: string) {
    const [t] = await db.select().from(metricTargets).where(eq(metricTargets.metricId, metricId));
    return t;
  }

  async upsertMetricTarget(metricId: string, targetValue: string, targetYear: number) {
    const existing = await this.getMetricTarget(metricId);
    if (existing) {
      const [t] = await db.update(metricTargets).set({ targetValue, targetYear }).where(eq(metricTargets.metricId, metricId)).returning();
      return t;
    } else {
      const [t] = await db.insert(metricTargets).values({ metricId, targetValue, targetYear }).returning();
      return t;
    }
  }

  async getMetricValues(metricId: string) {
    return db.select().from(metricValues).where(eq(metricValues.metricId, metricId)).orderBy(desc(metricValues.period));
  }

  async getMetricValueForPeriodSite(metricId: string, period: string, siteId: string | null) {
    const conditions: any[] = [eq(metricValues.metricId, metricId), eq(metricValues.period, period)];
    if (siteId === null) {
      conditions.push(isNull(metricValues.siteId));
    } else {
      conditions.push(eq(metricValues.siteId, siteId));
    }
    const [v] = await db.select().from(metricValues).where(and(...conditions)).limit(1);
    return v;
  }

  async getMetricValuesByPeriod(companyId: string, period: string) {
    const result = await db
      .select({
        id: metricValues.id,
        metricId: metricValues.metricId,
        period: metricValues.period,
        value: metricValues.value,
        submittedBy: metricValues.submittedBy,
        submittedAt: metricValues.submittedAt,
        notes: metricValues.notes,
        locked: metricValues.locked,
        dataSourceType: metricValues.dataSourceType,
        workflowStatus: metricValues.workflowStatus,
        reviewedBy: metricValues.reviewedBy,
        reviewedAt: metricValues.reviewedAt,
        reviewComment: metricValues.reviewComment,
        siteId: metricValues.siteId,
        metricName: metrics.name,
        category: metrics.category,
        unit: metrics.unit,
      })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(eq(metrics.companyId, companyId), eq(metricValues.period, period)));
    return result as any[];
  }

  async createMetricValue(value: InsertMetricValue) {
    const [v] = await db.insert(metricValues).values(value).returning();
    return v;
  }

  async upsertMetricValue(value: InsertMetricValue) {
    const lockKey = `metric_values:${value.metricId}:${value.period}:${value.siteId ?? "__org__"}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      await client.query("LOCK TABLE metric_values IN SHARE ROW EXCLUSIVE MODE");

      const selectSql = value.siteId == null
        ? `
            SELECT *
            FROM metric_values
            WHERE metric_id = $1
              AND period = $2
              AND site_id IS NULL
            LIMIT 1
            FOR UPDATE
          `
        : `
            SELECT *
            FROM metric_values
            WHERE metric_id = $1
              AND period = $2
              AND site_id = $3
            LIMIT 1
            FOR UPDATE
          `;
      const selectParams = value.siteId == null
        ? [value.metricId, value.period]
        : [value.metricId, value.period, value.siteId];
      const existingResult = await client.query(selectSql, selectParams);
      const existing = existingResult.rows[0]
        ? pgRowToCamelCase<MetricValue>(existingResult.rows[0])
        : undefined;

      if (existing) {
        if (existing.locked) {
          await client.query("COMMIT");
          return existing;
        }
        const updateResult = await client.query(
          `
            UPDATE metric_values
            SET
              value = $2,
              submitted_by = $3,
              submitted_at = NOW(),
              notes = $4,
              data_source_type = $5
            WHERE id = $1
            RETURNING *
          `,
          [
            existing.id,
            value.value ?? null,
            value.submittedBy ?? null,
            value.notes ?? null,
            value.dataSourceType ?? "manual",
          ],
        );
        await client.query("COMMIT");
        return pgRowToCamelCase<MetricValue>(updateResult.rows[0]);
      }

      const insertResult = await client.query(
        `
          INSERT INTO metric_values (
            metric_id, period, value, submitted_by, submitted_at, notes, locked, data_source_type, site_id
          )
          VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
          RETURNING *
        `,
        [
          value.metricId,
          value.period,
          value.value ?? null,
          value.submittedBy ?? null,
          value.notes ?? null,
          value.locked ?? false,
          value.dataSourceType ?? "manual",
          value.siteId ?? null,
        ],
      );
      const inserted = pgRowToCamelCase<MetricValue>(insertResult.rows[0]);
      const dedupeSql = value.siteId == null
        ? `
            SELECT id
            FROM metric_values
            WHERE metric_id = $1
              AND period = $2
              AND site_id IS NULL
            ORDER BY submitted_at DESC NULLS LAST, id DESC
          `
        : `
            SELECT id
            FROM metric_values
            WHERE metric_id = $1
              AND period = $2
              AND site_id = $3
            ORDER BY submitted_at DESC NULLS LAST, id DESC
          `;
      const dedupeParams = value.siteId == null
        ? [value.metricId, value.period]
        : [value.metricId, value.period, value.siteId];
      const dupes = await client.query(dedupeSql, dedupeParams);
      const duplicateIds = dupes.rows.slice(1).map((row: { id: string }) => row.id);
      if (duplicateIds.length > 0) {
        await client.query("DELETE FROM metric_values WHERE id = ANY($1::varchar[])", [duplicateIds]);
      }
      await client.query("COMMIT");
      return inserted;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updateMetricValue(id: string, data: Partial<MetricValue>) {
    // Guard: never overwrite a measured (manual/evidenced) value with an estimate
    const MEASURED_SOURCES: string[] = ["manual", "evidenced"];
    const incomingSourceType = data.dataSourceType;
    if (incomingSourceType === "estimated") {
      const [existing] = await db.select().from(metricValues).where(eq(metricValues.id, id));
      if (existing?.dataSourceType && MEASURED_SOURCES.includes(existing.dataSourceType)) {
        return existing;
      }
    }
    const [v] = await db.update(metricValues).set(data).where(eq(metricValues.id, id)).returning();
    return v;
  }

  async lockPeriod(companyId: string, period: string) {
    await db
      .update(metricValues)
      .set({ locked: true })
      .where(
        sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId}) AND ${metricValues.period} = ${period}`
      );
  }

  async hasAnyData(companyId: string): Promise<boolean> {
    const rawResult = await db
      .select({ id: rawDataInputs.id })
      .from(rawDataInputs)
      .where(eq(rawDataInputs.companyId, companyId))
      .limit(1);
    if (rawResult.length > 0) return true;
    const mvResult = await db
      .select({ id: metricValues.id })
      .from(metricValues)
      .where(
        sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId})`
      )
      .limit(1);
    return mvResult.length > 0;
  }

  async countEstimatedValues(companyId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(metricValues)
      .where(
        sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId})
            AND ${metricValues.dataSourceType} = 'estimated'`
      );
    return result[0]?.count ?? 0;
  }

  async getRawDataByPeriod(companyId: string, period: string, siteId?: string | null) {
    const conditions = [eq(rawDataInputs.companyId, companyId), eq(rawDataInputs.period, period)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(rawDataInputs.siteId) : eq(rawDataInputs.siteId, siteId));
    }
    return db.select().from(rawDataInputs)
      .where(and(...conditions))
      .orderBy(rawDataInputs.inputCategory, rawDataInputs.inputName);
  }

  async createRawDataInput(data: InsertRawDataInput) {
    const [r] = await db.insert(rawDataInputs).values(data as any).returning();
    return r;
  }

  async updateRawDataInput(id: string, data: Partial<RawDataInput>) {
    // Guard: never overwrite a measured (manual/evidenced) value with an estimate
    const MEASURED_SOURCES: string[] = ["manual", "evidenced"];
    const incomingSourceType: string | null | undefined = data.dataSourceType ?? data.source;
    if (incomingSourceType && incomingSourceType === "estimated") {
      const [existing] = await db.select().from(rawDataInputs).where(eq(rawDataInputs.id, id));
      const existingSourceType: string | null | undefined = existing?.dataSourceType ?? existing?.source;
      if (existing && existingSourceType && MEASURED_SOURCES.includes(existingSourceType)) {
        return existing;
      }
    }
    const [r] = await db.update(rawDataInputs).set({ ...data, updatedAt: new Date() }).where(eq(rawDataInputs.id, id)).returning();
    return r;
  }

  async upsertRawDataInput(companyId: string, inputName: string, period: string, data: Partial<InsertRawDataInput>) {
    const incomingSiteId = (data as any).siteId ?? null;
    const siteCondition = incomingSiteId
      ? eq(rawDataInputs.siteId, incomingSiteId)
      : isNull(rawDataInputs.siteId);
    const [existing] = await db.select().from(rawDataInputs)
      .where(and(
        eq(rawDataInputs.companyId, companyId),
        eq(rawDataInputs.inputName, inputName),
        eq(rawDataInputs.period, period),
        siteCondition,
      ));
    if (existing) {
      // Guard: never overwrite a measured (manual/evidenced) value with an estimate
      const MEASURED_SOURCES: string[] = ["manual", "evidenced"];
      const incomingSourceType: string | null | undefined = data.dataSourceType ?? data.source;
      const existingSourceType: string | null | undefined = existing.dataSourceType ?? existing.source;
      if (
        incomingSourceType === "estimated" &&
        existingSourceType && MEASURED_SOURCES.includes(existingSourceType)
      ) {
        // Return existing record unchanged — measured data wins
        return existing;
      }
      const [r] = await db.update(rawDataInputs).set({ ...data, updatedAt: new Date() }).where(eq(rawDataInputs.id, existing.id)).returning();
      return r;
    } else {
      const [r] = await db.insert(rawDataInputs).values({ companyId, inputName, period, ...data } as any).returning();
      return r;
    }
  }

  async getEvidenceFiles(companyId: string, siteId?: string | null, period?: string) {
    const conditions: any[] = [eq(evidenceFiles.companyId, companyId)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(evidenceFiles.siteId) : eq(evidenceFiles.siteId, siteId));
    }
    if (period) conditions.push(eq(evidenceFiles.linkedPeriod, period));
    return db.select().from(evidenceFiles).where(and(...conditions)).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async getEvidenceByEntity(companyId: string, linkedModule: string, linkedEntityId: string) {
    return db.select().from(evidenceFiles).where(
      and(
        eq(evidenceFiles.companyId, companyId),
        eq(evidenceFiles.linkedModule, linkedModule),
        eq(evidenceFiles.linkedEntityId, linkedEntityId)
      )
    ).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async getEvidenceCoverage(companyId: string, period?: string) {
    const allEvidence = await db.select().from(evidenceFiles).where(eq(evidenceFiles.companyId, companyId));
    const allMetrics = await db.select({ id: metrics.id, name: metrics.name, category: metrics.category }).from(metrics).where(eq(metrics.companyId, companyId));

    const allMetricValues = await db.select({
      id: metricValues.id,
      metricId: metricValues.metricId,
      period: metricValues.period,
      dataSourceType: metricValues.dataSourceType,
    }).from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(eq(metrics.companyId, companyId));

    const relevantValues = period
      ? allMetricValues.filter(v => v.period === period)
      : allMetricValues;

    const evidenceByModule = allEvidence.filter(e => e.linkedModule === "metric_value");
    const evidencedEntityIds = new Set(evidenceByModule.map(e => e.linkedEntityId));

    const metricsWithEvidence = new Set<string>();
    for (const mv of relevantValues) {
      if (evidencedEntityIds.has(mv.id) || mv.dataSourceType === "evidenced") {
        metricsWithEvidence.add(mv.metricId);
      }
    }

    const metricCoverage = allMetrics.map(m => {
      const mvs = relevantValues.filter(v => v.metricId === m.id);
      const hasEvidence = metricsWithEvidence.has(m.id);
      const latestMv = mvs[0];
      return {
        metricId: m.id,
        metricName: m.name,
        category: m.category,
        hasEvidence,
        dataSourceType: latestMv?.dataSourceType || "manual",
      };
    });

    const expiredEvidence = allEvidence.filter(e => e.expiryDate && new Date(e.expiryDate) < new Date());
    const periodCoverage: Record<string, number> = {};
    allEvidence.filter(e => e.linkedPeriod).forEach(e => {
      periodCoverage[e.linkedPeriod!] = (periodCoverage[e.linkedPeriod!] || 0) + 1;
    });

    return {
      totalEvidence: allEvidence.length,
      evidencedCount: metricsWithEvidence.size,
      totalMetrics: allMetrics.length,
      coveragePercent: allMetrics.length > 0 ? Math.round((metricsWithEvidence.size / allMetrics.length) * 100) : 0,
      expiredCount: expiredEvidence.length,
      metricCoverage,
      periodCoverage,
      byStatus: {
        uploaded: allEvidence.filter(e => e.evidenceStatus === "uploaded").length,
        reviewed: allEvidence.filter(e => e.evidenceStatus === "reviewed").length,
        approved: allEvidence.filter(e => e.evidenceStatus === "approved").length,
        expired: expiredEvidence.length,
      },
    };
  }

  async createEvidenceFile(file: Omit<EvidenceFile, "id" | "uploadedAt" | "reviewedBy" | "reviewedAt">) {
    const [f] = await db.insert(evidenceFiles).values(file as any).returning();
    return f;
  }

  async updateEvidenceFile(id: string, data: Partial<EvidenceFile>) {
    const [f] = await db.update(evidenceFiles).set(data).where(eq(evidenceFiles.id, id)).returning();
    return f;
  }

  async deleteEvidenceFile(id: string) {
    await db.delete(evidenceFiles).where(eq(evidenceFiles.id, id));
  }

  async getActionPlans(companyId: string) {
    return db.select().from(actionPlans).where(eq(actionPlans.companyId, companyId)).orderBy(desc(actionPlans.createdAt));
  }

  async getActionPlan(id: string) {
    const [plan] = await db.select().from(actionPlans).where(eq(actionPlans.id, id));
    return plan;
  }

  async createActionPlan(plan: InsertActionPlan) {
    const [p] = await db.insert(actionPlans).values(plan).returning();
    return p;
  }

  async updateActionPlan(id: string, data: Partial<ActionPlan>) {
    const [p] = await db.update(actionPlans).set({ ...data, updatedAt: new Date() }).where(eq(actionPlans.id, id)).returning();
    return p;
  }

  async deleteActionPlan(id: string) {
    await db.delete(actionPlans).where(eq(actionPlans.id, id));
  }

  async getReportRuns(companyId: string, siteId?: string | null) {
    const conditions = [eq(reportRuns.companyId, companyId)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(reportRuns.siteId) : eq(reportRuns.siteId, siteId));
    }
    return db.select().from(reportRuns).where(and(...conditions)).orderBy(desc(reportRuns.generatedAt));
  }

  async createReportRun(report: Omit<ReportRun, "id" | "generatedAt">) {
    const [r] = await db.insert(reportRuns).values(report as any).returning();
    return r;
  }

  async getUnassignedCounts(companyId: string): Promise<Record<string, number>> {
    const toInt = (v: any) => (typeof v === "string" ? parseInt(v, 10) : (v ?? 0));
    const [mvR] = await db.execute(sql`
      SELECT count(*)::int AS count FROM metric_values
      WHERE site_id IS NULL AND metric_id IN (SELECT id FROM metrics WHERE company_id = ${companyId})
    `);
    const [rdiR] = await db.select({ count: sql<number>`count(*)::int` }).from(rawDataInputs)
      .where(and(eq(rawDataInputs.companyId, companyId), isNull(rawDataInputs.siteId)));
    const [efR] = await db.select({ count: sql<number>`count(*)::int` }).from(evidenceFiles)
      .where(and(eq(evidenceFiles.companyId, companyId), isNull(evidenceFiles.siteId)));
    const [ccR] = await db.select({ count: sql<number>`count(*)::int` }).from(carbonCalculations)
      .where(and(eq(carbonCalculations.companyId, companyId), isNull(carbonCalculations.siteId)));
    const [qsR] = await db.select({ count: sql<number>`count(*)::int` }).from(questionnaires)
      .where(and(eq(questionnaires.companyId, companyId), isNull(questionnaires.siteId)));
    const [gpR] = await db.select({ count: sql<number>`count(*)::int` }).from(generatedPolicies)
      .where(and(eq(generatedPolicies.companyId, companyId), isNull(generatedPolicies.siteId)));
    const [rrR] = await db.select({ count: sql<number>`count(*)::int` }).from(reportRuns)
      .where(and(eq(reportRuns.companyId, companyId), isNull(reportRuns.siteId)));
    const [uaR] = await db.select({ count: sql<number>`count(*)::int` }).from(userActivity)
      .where(and(eq(userActivity.companyId, companyId), isNull(userActivity.siteId)));
    const [arR] = await db.select({ count: sql<number>`count(*)::int` }).from(agentRuns)
      .where(and(eq(agentRuns.companyId, companyId), isNull(agentRuns.siteId)));
    const [csR] = await db.select({ count: sql<number>`count(*)::int` }).from(chatSessions)
      .where(and(eq(chatSessions.companyId, companyId), isNull(chatSessions.siteId)));
    return {
      metric_values: toInt((mvR as any)?.count),
      raw_data_inputs: toInt(rdiR?.count),
      evidence_files: toInt(efR?.count),
      carbon_calculations: toInt(ccR?.count),
      questionnaires: toInt(qsR?.count),
      generated_policies: toInt(gpR?.count),
      report_runs: toInt(rrR?.count),
      user_activity: toInt(uaR?.count),
      agent_runs: toInt(arR?.count),
      chat_sessions: toInt(csR?.count),
    };
  }

  async migrateLegacyData(companyId: string, siteId: string): Promise<Record<string, number>> {
    const updated: Record<string, number> = {};
    const mvResult = await db.execute(sql`
      UPDATE metric_values SET site_id = ${siteId}
      WHERE site_id IS NULL AND metric_id IN (SELECT id FROM metrics WHERE company_id = ${companyId})
      RETURNING id
    `);
    updated.metric_values = ((mvResult as any).rows ?? []).length;
    const rdiRows = await db.update(rawDataInputs).set({ siteId }).where(and(eq(rawDataInputs.companyId, companyId), isNull(rawDataInputs.siteId))).returning({ id: rawDataInputs.id });
    updated.raw_data_inputs = rdiRows.length;
    const efRows = await db.update(evidenceFiles).set({ siteId }).where(and(eq(evidenceFiles.companyId, companyId), isNull(evidenceFiles.siteId))).returning({ id: evidenceFiles.id });
    updated.evidence_files = efRows.length;
    const ccRows = await db.update(carbonCalculations).set({ siteId }).where(and(eq(carbonCalculations.companyId, companyId), isNull(carbonCalculations.siteId))).returning({ id: carbonCalculations.id });
    updated.carbon_calculations = ccRows.length;
    const qsRows = await db.update(questionnaires).set({ siteId }).where(and(eq(questionnaires.companyId, companyId), isNull(questionnaires.siteId))).returning({ id: questionnaires.id });
    updated.questionnaires = qsRows.length;
    const gpRows = await db.update(generatedPolicies).set({ siteId }).where(and(eq(generatedPolicies.companyId, companyId), isNull(generatedPolicies.siteId))).returning({ id: generatedPolicies.id });
    updated.generated_policies = gpRows.length;
    const rrRows = await db.update(reportRuns).set({ siteId }).where(and(eq(reportRuns.companyId, companyId), isNull(reportRuns.siteId))).returning({ id: reportRuns.id });
    updated.report_runs = rrRows.length;
    const uaRows = await db.update(userActivity).set({ siteId }).where(and(eq(userActivity.companyId, companyId), isNull(userActivity.siteId))).returning({ id: userActivity.id });
    updated.user_activity = uaRows.length;
    const arRows = await db.update(agentRuns).set({ siteId }).where(and(eq(agentRuns.companyId, companyId), isNull(agentRuns.siteId))).returning({ id: agentRuns.id });
    updated.agent_runs = arRows.length;
    const csRows = await db.update(chatSessions).set({ siteId }).where(and(eq(chatSessions.companyId, companyId), isNull(chatSessions.siteId))).returning({ id: chatSessions.id });
    updated.chat_sessions = csRows.length;
    return updated;
  }

  async getNotifications(companyId: string) {
    return db.select().from(notifications).where(eq(notifications.companyId, companyId)).orderBy(desc(notifications.createdAt)).limit(200);
  }

  async getActiveNotifications(companyId: string) {
    return db.select().from(notifications)
      .where(and(eq(notifications.companyId, companyId), eq(notifications.dismissed, false)))
      .orderBy(desc(notifications.createdAt)).limit(100);
  }

  async createNotification(n: InsertNotification) {
    const [r] = await db.insert(notifications).values(n as any).onConflictDoNothing().returning();
    return r;
  }

  async dismissNotification(id: string, companyId: string, userId: string) {
    const [r] = await db.update(notifications)
      .set({ dismissed: true, dismissedAt: new Date(), dismissedBy: userId })
      .where(and(eq(notifications.id, id), eq(notifications.companyId, companyId))).returning();
    return r;
  }

  async dismissAllNotifications(companyId: string, userId: string) {
    await db.update(notifications)
      .set({ dismissed: true, dismissedAt: new Date(), dismissedBy: userId })
      .where(and(eq(notifications.companyId, companyId), eq(notifications.dismissed, false)));
  }

  async deleteNotificationsBySourceKey(sourceKeyPrefix: string, companyId: string) {
    await db.delete(notifications)
      .where(and(
        eq(notifications.companyId, companyId),
        sql`${notifications.sourceKey} LIKE ${sourceKeyPrefix + '%'}`
      ));
  }

  async getNotificationBySourceKey(sourceKey: string, companyId: string) {
    const [r] = await db.select().from(notifications)
      .where(and(eq(notifications.sourceKey, sourceKey), eq(notifications.companyId, companyId)));
    return r;
  }

  async getAuditLogs(companyId: string, limit = 100) {
    return db.select().from(auditLogs).where(eq(auditLogs.companyId, companyId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async getAllAuditLogs(limit = 200, filters?: { action?: string; actorType?: string }) {
    const conditions: any[] = [];
    if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters?.actorType) conditions.push(eq(auditLogs.actorType, filters.actorType));
    let query = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit) as any;
    if (conditions.length > 0) query = db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit) as any;
    return query;
  }

  async queryAuditLogs(filters: { companyId?: string; userId?: string; entityType?: string; action?: string; dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<AuditLog[]> {
    const conditions: any[] = [];
    if (filters.companyId) conditions.push(eq(auditLogs.companyId, filters.companyId));
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.dateFrom) conditions.push(gte(auditLogs.createdAt, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(auditLogs.createdAt, filters.dateTo));
    const limit = filters.limit ?? 200;
    if (conditions.length > 0) {
      return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit);
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async createAuditLog(log: Omit<AuditLog, "id" | "createdAt">) {
    const [l] = await db.insert(auditLogs).values(log as any).returning();
    return l;
  }

  async getDashboardData(companyId: string) {
    const allMetrics = await this.getMetrics(companyId);
    const enabledMetrics = allMetrics.filter(m => m.enabled);

    // Get last 6 periods of metric values
    const recentValues = await db
      .select({
        metricId: metricValues.metricId,
        period: metricValues.period,
        value: metricValues.value,
        category: metrics.category,
        name: metrics.name,
        unit: metrics.unit,
      })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(eq(metrics.companyId, companyId))
      .orderBy(desc(metricValues.period))
      .limit(200);

    const actions = await this.getActionPlans(companyId);
    const topics = await this.getMaterialTopics(companyId);

    // Compute completion score
    const periods = [...new Set(recentValues.map(v => v.period))].slice(0, 3);
    const latestPeriod = periods[0];
    const latestValues = recentValues.filter(v => v.period === latestPeriod);
    const completionScore = enabledMetrics.length > 0
      ? Math.round((latestValues.length / enabledMetrics.length) * 100)
      : 0;

    return {
      totalMetrics: enabledMetrics.length,
      completionScore,
      latestPeriod,
      recentValues,
      actions,
      selectedTopics: topics.filter(t => t.selected),
      actionSummary: {
        total: actions.length,
        complete: actions.filter(a => a.status === "complete").length,
        inProgress: actions.filter(a => a.status === "in_progress").length,
        overdue: actions.filter(a => a.status === "overdue").length,
      },
    };
  }

  // Policy Generation
  async createPolicyGenerationInput(data: InsertPolicyGenerationInput) {
    const [r] = await db.insert(policyGenerationInputs).values(data as any).returning();
    return r;
  }

  async getPolicyGenerationInputs(companyId: string) {
    return db.select().from(policyGenerationInputs).where(eq(policyGenerationInputs.companyId, companyId)).orderBy(desc(policyGenerationInputs.createdAt));
  }

  async updatePolicyGenerationInput(id: string, data: Partial<PolicyGenerationInput>) {
    const [r] = await db.update(policyGenerationInputs).set(data).where(eq(policyGenerationInputs.id, id)).returning();
    return r;
  }

  // Emission Factors
  async getEmissionFactors(country?: string) {
    if (country) {
      return db.select().from(emissionFactors).where(eq(emissionFactors.country, country));
    }
    return db.select().from(emissionFactors);
  }

  async createEmissionFactor(factor: InsertEmissionFactor) {
    const [r] = await db.insert(emissionFactors).values(factor as any).returning();
    return r;
  }

  async updateEmissionFactor(id: string, data: Partial<EmissionFactor>) {
    const [r] = await db.update(emissionFactors).set(data).where(eq(emissionFactors.id, id)).returning();
    return r;
  }

  // Carbon Calculations
  async getCarbonCalculations(companyId: string, siteId?: string | null, period?: string) {
    const conditions: any[] = [eq(carbonCalculations.companyId, companyId)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(carbonCalculations.siteId) : eq(carbonCalculations.siteId, siteId));
    }
    if (period) conditions.push(eq(carbonCalculations.reportingPeriod, period));
    return db.select().from(carbonCalculations).where(and(...conditions)).orderBy(desc(carbonCalculations.createdAt));
  }

  async getCarbonCalculation(id: string) {
    const [r] = await db.select().from(carbonCalculations).where(eq(carbonCalculations.id, id));
    return r;
  }

  async createCarbonCalculation(calc: InsertCarbonCalculation) {
    const [r] = await db.insert(carbonCalculations).values(calc as any).returning();
    return r;
  }

  async updateCarbonCalculation(id: string, data: Partial<CarbonCalculation>) {
    const [r] = await db.update(carbonCalculations).set({ ...data, updatedAt: new Date() }).where(eq(carbonCalculations.id, id)).returning();
    return r;
  }

  async deleteCarbonCalculation(id: string) {
    await db.delete(carbonCalculations).where(eq(carbonCalculations.id, id));
  }

  // Questionnaires
  async getQuestionnaires(companyId: string, siteId?: string | null, reportingPeriodId?: string) {
    const conditions: any[] = [eq(questionnaires.companyId, companyId)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(questionnaires.siteId) : eq(questionnaires.siteId, siteId));
    }
    if (reportingPeriodId) {
      conditions.push(eq(questionnaires.reportingPeriodId, reportingPeriodId));
    }
    return db.select().from(questionnaires).where(and(...conditions)).orderBy(desc(questionnaires.createdAt));
  }

  async getQuestionnaire(id: string) {
    const [r] = await db.select().from(questionnaires).where(eq(questionnaires.id, id));
    return r;
  }

  async createQuestionnaire(q: InsertQuestionnaire) {
    const [r] = await db.insert(questionnaires).values(q as any).returning();
    return r;
  }

  async updateQuestionnaire(id: string, data: Partial<Questionnaire>) {
    const [r] = await db.update(questionnaires).set({ ...data, updatedAt: new Date() }).where(eq(questionnaires.id, id)).returning();
    return r;
  }

  async deleteQuestionnaire(id: string) {
    await db.delete(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, id));
    await db.delete(questionnaires).where(eq(questionnaires.id, id));
  }

  async getQuestionnaireQuestions(questionnaireId: string) {
    return db.select().from(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, questionnaireId)).orderBy(questionnaireQuestions.orderIndex);
  }

  async createQuestionnaireQuestion(q: InsertQuestionnaireQuestion) {
    const [r] = await db.insert(questionnaireQuestions).values(q as any).returning();
    return r;
  }

  async updateQuestionnaireQuestion(id: string, data: Partial<QuestionnaireQuestion>) {
    const [r] = await db.update(questionnaireQuestions).set(data).where(eq(questionnaireQuestions.id, id)).returning();
    return r;
  }

  async deleteQuestionnaireQuestions(questionnaireId: string) {
    await db.delete(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, questionnaireId));
  }

  // Policy Templates
  async getPolicyTemplates() {
    return db.select().from(policyTemplates).orderBy(policyTemplates.name);
  }

  async getPolicyTemplate(slug: string) {
    const [r] = await db.select().from(policyTemplates).where(eq(policyTemplates.slug, slug));
    return r;
  }

  async createPolicyTemplate(t: InsertPolicyTemplate) {
    const [r] = await db.insert(policyTemplates).values(t as any).returning();
    return r;
  }

  async updatePolicyTemplate(slug: string, data: Partial<PolicyTemplate>) {
    const [r] = await db.update(policyTemplates).set(data).where(eq(policyTemplates.slug, slug)).returning();
    return r;
  }

  async getPolicyTemplateCount() {
    const result = await db.select({ count: sql<number>`count(*)` }).from(policyTemplates);
    return Number(result[0].count);
  }

  // Generated Policies
  async getGeneratedPolicies(companyId: string) {
    return db.select().from(generatedPolicies).where(eq(generatedPolicies.companyId, companyId)).orderBy(desc(generatedPolicies.updatedAt));
  }

  async getGeneratedPolicy(id: string) {
    const [r] = await db.select().from(generatedPolicies).where(eq(generatedPolicies.id, id));
    return r;
  }

  async createGeneratedPolicy(p: InsertGeneratedPolicy) {
    const [r] = await db.insert(generatedPolicies).values(p as any).returning();
    return r;
  }

  async updateGeneratedPolicy(id: string, data: Partial<GeneratedPolicy>) {
    const [r] = await db.update(generatedPolicies).set({ ...data, updatedAt: new Date() }).where(eq(generatedPolicies.id, id)).returning();
    return r;
  }

  async deleteGeneratedPolicy(id: string) {
    await db.delete(generatedPolicies).where(eq(generatedPolicies.id, id));
  }

  async createAiGenerationLog(log: InsertAiGenerationLog) {
    const [r] = await db.insert(aiGenerationLogs).values(log as any).returning();
    return r;
  }

  async getAiGenerationLogs(companyId: string, entityType?: string, entityId?: string) {
    const conditions = [eq(aiGenerationLogs.companyId, companyId)];
    if (entityType) conditions.push(eq(aiGenerationLogs.entityType, entityType));
    if (entityId) conditions.push(eq(aiGenerationLogs.entityId, entityId));
    return db.select().from(aiGenerationLogs).where(and(...conditions)).orderBy(desc(aiGenerationLogs.generatedAt));
  }

  async updateWorkflowStatus(table: string, id: string, status: string, reviewedBy: string, comment?: string, companyId?: string) {
    const allowedTables = ["metric_values", "raw_data_inputs", "report_runs", "generated_policies", "questionnaire_questions"];
    if (!allowedTables.includes(table)) throw new Error("Invalid table for workflow status update");

    if (companyId) {
      let ownershipQuery;
      if (table === "metric_values") {
        ownershipQuery = sql`SELECT mv.id FROM metric_values mv INNER JOIN metrics m ON mv.metric_id = m.id WHERE mv.id = ${id} AND m.company_id = ${companyId}`;
      } else if (table === "questionnaire_questions") {
        ownershipQuery = sql`SELECT qq.id FROM questionnaire_questions qq INNER JOIN questionnaires q ON qq.questionnaire_id = q.id WHERE qq.id = ${id} AND q.company_id = ${companyId}`;
      } else {
        ownershipQuery = sql`SELECT id FROM ${sql.raw(table)} WHERE id = ${id} AND company_id = ${companyId}`;
      }
      const result = await db.execute(ownershipQuery);
      if (!result.rows || result.rows.length === 0) {
        throw new Error("Entity not found or does not belong to your company");
      }
    }

    const validTransitions: Record<string, string[]> = {
      draft: ["submitted"],
      submitted: ["approved", "rejected"],
      rejected: ["draft", "submitted"],
      approved: ["archived"],
    };
    const currentResult = await db.execute(
      sql`SELECT workflow_status FROM ${sql.raw(table)} WHERE id = ${id}`
    );
    const currentStatus = currentResult.rows?.[0]?.workflow_status || "draft";
    if (validTransitions[currentStatus as string] && !validTransitions[currentStatus as string].includes(status)) {
      throw new Error(`Cannot transition from ${currentStatus} to ${status}`);
    }

    if (status === "submitted") {
      await db.execute(
        sql`UPDATE ${sql.raw(table)} SET workflow_status = ${status}, submitted_by = ${reviewedBy}, submitted_at = NOW() WHERE id = ${id}`
      );
    } else {
      await db.execute(
        sql`UPDATE ${sql.raw(table)} SET workflow_status = ${status}, reviewed_by = ${reviewedBy}, reviewed_at = NOW(), review_comment = ${comment || null} WHERE id = ${id}`
      );
    }
  }

  async getWorkflowPendingItems(companyId: string) {
    const pendingMetricValues = await db.execute(
      sql`SELECT mv.id, m.name, mv.period, mv.workflow_status, mv.submitted_by, mv.submitted_at, mv.review_comment FROM metric_values mv INNER JOIN metrics m ON mv.metric_id = m.id WHERE m.company_id = ${companyId} AND mv.workflow_status = 'submitted'`
    );
    const pendingRawData = await db.execute(
      sql`SELECT id, input_name as name, period, workflow_status, submitted_by, submitted_at, review_comment FROM raw_data_inputs WHERE company_id = ${companyId} AND workflow_status = 'submitted'`
    );
    const pendingReports = await db.execute(
      sql`SELECT id, period, report_type as name, workflow_status, submitted_by, submitted_at, review_comment FROM report_runs WHERE company_id = ${companyId} AND workflow_status = 'submitted'`
    );
    const pendingPolicies = await db.execute(
      sql`SELECT id, title as name, workflow_status, submitted_by, submitted_at, review_comment FROM generated_policies WHERE company_id = ${companyId} AND workflow_status = 'submitted'`
    );
    const pendingQuestions = await db.execute(
      sql`SELECT qq.id, qq.question_text as name, qq.workflow_status, qq.submitted_by, qq.submitted_at, qq.review_comment FROM questionnaire_questions qq INNER JOIN questionnaires q ON qq.questionnaire_id = q.id WHERE q.company_id = ${companyId} AND qq.workflow_status = 'submitted'`
    );
    return {
      metricValues: pendingMetricValues.rows,
      rawDataInputs: pendingRawData.rows,
      reportRuns: pendingReports.rows,
      generatedPolicies: pendingPolicies.rows,
      questionnaireQuestions: pendingQuestions.rows,
    };
  }

  async assignOwner(entityType: string, entityId: string, assignedUserId: string, companyId: string) {
    const tableMap: Record<string, string> = {
      metrics: "metrics",
      raw_data_inputs: "raw_data_inputs",
      action_plans: "action_plans",
      esg_policies: "esg_policies",
      questionnaires: "questionnaires",
      evidence_files: "evidence_files",
    };
    const table = tableMap[entityType];
    if (!table) throw new Error("Invalid entity type for assignment");

    let ownershipQuery;
    if (table === "evidence_files") {
      ownershipQuery = sql`SELECT id FROM evidence_files WHERE id = ${entityId} AND company_id = ${companyId}`;
    } else {
      ownershipQuery = sql`SELECT id FROM ${sql.raw(table)} WHERE id = ${entityId} AND company_id = ${companyId}`;
    }
    const entity = await db.execute(ownershipQuery);
    if (!entity.rows || entity.rows.length === 0) {
      throw new Error("Entity not found");
    }

    if (assignedUserId) {
      const [targetUser] = await db.select().from(users).where(and(eq(users.id, assignedUserId), eq(users.companyId, companyId)));
      if (!targetUser) throw new Error("User not in company");
    }

    await db.execute(
      sql`UPDATE ${sql.raw(table)} SET assigned_user_id = ${assignedUserId || null} WHERE id = ${entityId}`
    );
  }

  async getUserTasks(userId: string, companyId: string) {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const tasks: any[] = [];

    const metricRows = await db.execute(
      sql`SELECT m.id, m.name, m.assigned_due_date FROM metrics m WHERE m.company_id = ${companyId} AND m.assigned_user_id = ${userId} AND m.id NOT IN (SELECT metric_id FROM metric_values WHERE period = ${currentPeriod})`
    );
    for (const r of metricRows.rows) {
      const dueDate = (r as any).assigned_due_date ? new Date((r as any).assigned_due_date) : null;
      tasks.push({
        entityType: "metric", entityId: (r as any).id, title: (r as any).name,
        dueDate: dueDate?.toISOString() || null, status: "data_needed",
        isOverdue: dueDate ? dueDate < now : false, linkUrl: "/data-entry",
      });
    }

    const actionRows = await db.execute(
      sql`SELECT id, title, due_date, status FROM action_plans WHERE company_id = ${companyId} AND assigned_user_id = ${userId} AND status != 'complete'`
    );
    for (const r of actionRows.rows) {
      const dueDate = (r as any).due_date ? new Date((r as any).due_date) : null;
      tasks.push({
        entityType: "action", entityId: (r as any).id, title: (r as any).title,
        dueDate: dueDate?.toISOString() || null, status: (r as any).status,
        isOverdue: dueDate ? dueDate < now : false, linkUrl: "/actions",
      });
    }

    const evidenceRows = await db.execute(
      sql`SELECT id, description, due_date, status FROM evidence_requests WHERE company_id = ${companyId} AND assigned_user_id = ${userId} AND status IN ('requested', 'uploaded', 'under_review')`
    );
    for (const r of evidenceRows.rows) {
      const dueDate = (r as any).due_date ? new Date((r as any).due_date) : null;
      tasks.push({
        entityType: "evidence_request", entityId: (r as any).id, title: (r as any).description,
        dueDate: dueDate?.toISOString() || null, status: (r as any).status,
        isOverdue: dueDate ? dueDate < now : false, linkUrl: "/evidence",
      });
    }

    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const policyRows = await db.execute(
      sql`SELECT id, review_date FROM esg_policies WHERE company_id = ${companyId} AND assigned_user_id = ${userId} AND review_date IS NOT NULL AND review_date <= ${ninetyDaysFromNow}`
    );
    for (const r of policyRows.rows) {
      const dueDate = (r as any).review_date ? new Date((r as any).review_date) : null;
      tasks.push({
        entityType: "policy", entityId: (r as any).id, title: "ESG Policy",
        dueDate: dueDate?.toISOString() || null, status: "review_due",
        isOverdue: dueDate ? dueDate < now : false, linkUrl: "/policy",
      });
    }

    const questionnaireRows = await db.execute(
      sql`SELECT id, title, assigned_due_date FROM questionnaires WHERE company_id = ${companyId} AND assigned_user_id = ${userId} AND status = 'in_progress'`
    );
    for (const r of questionnaireRows.rows) {
      const dueDate = (r as any).assigned_due_date ? new Date((r as any).assigned_due_date) : null;
      tasks.push({
        entityType: "questionnaire", entityId: (r as any).id, title: (r as any).title,
        dueDate: dueDate?.toISOString() || null, status: "in_progress",
        isOverdue: dueDate ? dueDate < now : false, linkUrl: "/questionnaire",
      });
    }

    return tasks;
  }

  async getUserApprovals(companyId: string) {
    const pending = await this.getWorkflowPendingItems(companyId);
    const userIds = new Set<string>();
    for (const key of Object.keys(pending)) {
      for (const item of (pending as any)[key]) {
        if (item.submitted_by) userIds.add(item.submitted_by);
      }
    }
    const userMap: Record<string, string> = {};
    for (const uid of userIds) {
      const u = await this.getUser(uid);
      if (u) userMap[uid] = u.username;
    }
    const enrich = (items: any[]) => items.map(i => ({
      ...i,
      submitterUsername: i.submitted_by ? (userMap[i.submitted_by] || "Unknown") : "Unknown",
    }));
    return {
      metricValues: enrich(pending.metricValues),
      rawDataInputs: enrich(pending.rawDataInputs),
      reportRuns: enrich(pending.reportRuns),
      generatedPolicies: enrich(pending.generatedPolicies),
      questionnaireQuestions: enrich(pending.questionnaireQuestions),
    };
  }

  async getEvidenceRequests(companyId: string) {
    return db.select().from(evidenceRequests).where(eq(evidenceRequests.companyId, companyId)).orderBy(desc(evidenceRequests.createdAt));
  }

  async getEvidenceRequestsByUser(userId: string, companyId: string) {
    return db.select().from(evidenceRequests).where(and(eq(evidenceRequests.companyId, companyId), eq(evidenceRequests.assignedUserId, userId))).orderBy(desc(evidenceRequests.createdAt));
  }

  async createEvidenceRequest(data: InsertEvidenceRequest) {
    const [r] = await db.insert(evidenceRequests).values(data as any).returning();
    return r;
  }

  async updateEvidenceRequest(id: string, companyId: string, data: Partial<EvidenceRequest>) {
    const [r] = await db.update(evidenceRequests).set({ ...data, updatedAt: new Date() } as any).where(and(eq(evidenceRequests.id, id), eq(evidenceRequests.companyId, companyId))).returning();
    return r;
  }

  async linkEvidenceToRequest(requestId: string, evidenceFileId: string, companyId: string) {
    const [ev] = await db.select().from(evidenceFiles).where(and(eq(evidenceFiles.id, evidenceFileId), eq(evidenceFiles.companyId, companyId)));
    if (!ev) throw new Error("Evidence file not found");
    const [r] = await db.update(evidenceRequests).set({ evidenceFileId, status: "uploaded" as any, updatedAt: new Date() } as any).where(and(eq(evidenceRequests.id, requestId), eq(evidenceRequests.companyId, companyId))).returning();
    return r;
  }

  async getReportingPeriods(companyId: string) {
    return db.select().from(reportingPeriods).where(eq(reportingPeriods.companyId, companyId)).orderBy(desc(reportingPeriods.startDate));
  }

  async createReportingPeriod(data: InsertReportingPeriod) {
    const [r] = await db.insert(reportingPeriods).values(data as any).returning();
    return r;
  }

  async closeReportingPeriod(id: string, companyId: string) {
    const [r] = await db.update(reportingPeriods).set({ status: "closed" as any }).where(and(eq(reportingPeriods.id, id), eq(reportingPeriods.companyId, companyId))).returning();
    return r;
  }

  async lockReportingPeriod(id: string, companyId: string) {
    const [r] = await db.update(reportingPeriods).set({ status: "locked" as any }).where(and(eq(reportingPeriods.id, id), eq(reportingPeriods.companyId, companyId))).returning();
    return r;
  }

  async copyForwardPeriod(sourcePeriodId: string, companyId: string, newPeriodData: InsertReportingPeriod) {
    const [source] = await db.select().from(reportingPeriods).where(and(eq(reportingPeriods.id, sourcePeriodId), eq(reportingPeriods.companyId, companyId)));
    if (!source) throw new Error("Source period not found");

    const [newPeriod] = await db.insert(reportingPeriods).values({ ...newPeriodData, previousPeriodId: sourcePeriodId } as any).returning();

    const targetRows = await db.execute(
      sql`SELECT id FROM metric_targets WHERE metric_id IN (SELECT id FROM metrics WHERE company_id = ${companyId})`
    );
    const copiedMetrics = targetRows.rows.length;

    const incompleteActions = await db.execute(
      sql`SELECT title, description, related_metric_id, assigned_user_id, owner FROM action_plans WHERE company_id = ${companyId} AND status != 'complete'`
    );
    let copiedActions = 0;
    for (const a of incompleteActions.rows) {
      await db.execute(
        sql`INSERT INTO action_plans (id, company_id, title, description, status, related_metric_id, assigned_user_id, owner) VALUES (gen_random_uuid(), ${companyId}, ${(a as any).title}, ${(a as any).description}, 'not_started', ${(a as any).related_metric_id}, ${(a as any).assigned_user_id}, ${(a as any).owner})`
      );
      copiedActions++;
    }

    return { period: newPeriod, copiedMetrics, copiedActions };
  }

  async getPeriodComparison(companyId: string, currentPeriod: string, comparePeriod: string) {
    const result = await db.execute(
      sql`SELECT m.id as metric_id, m.name as metric_name, m.category,
          curr.value as current_value, comp.value as compare_value,
          m.direction
          FROM metrics m
          LEFT JOIN metric_values curr ON curr.metric_id = m.id AND curr.period = ${currentPeriod}
          LEFT JOIN metric_values comp ON comp.metric_id = m.id AND comp.period = ${comparePeriod}
          WHERE m.company_id = ${companyId}
          AND (curr.id IS NOT NULL OR comp.id IS NOT NULL)`
    );
    return result.rows.map((r: any) => {
      const cv = r.current_value ? parseFloat(r.current_value) : null;
      const pv = r.compare_value ? parseFloat(r.compare_value) : null;
      const delta = cv !== null && pv !== null ? cv - pv : null;
      const percentChange = delta !== null && pv !== null && pv !== 0 ? (delta / pv) * 100 : null;
      return {
        metricId: r.metric_id, metricName: r.metric_name, category: r.category,
        currentValue: cv, compareValue: pv, delta, percentChange,
        direction: r.direction,
      };
    });
  }

  async createBackgroundJob(job: InsertBackgroundJob) {
    const [result] = await db.insert(backgroundJobs).values(job).returning();
    return result;
  }

  async getBackgroundJob(id: string) {
    const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id));
    return job;
  }

  async updateBackgroundJob(id: string, data: Partial<BackgroundJob>) {
    const [result] = await db.update(backgroundJobs).set(data).where(eq(backgroundJobs.id, id)).returning();
    return result;
  }

  async getPendingJobs(limit = 10) {
    return db.select().from(backgroundJobs)
      .where(eq(backgroundJobs.status, "pending"))
      .orderBy(backgroundJobs.scheduledAt)
      .limit(limit);
  }

  async getJobsByCompany(companyId: string) {
    return db.select().from(backgroundJobs)
      .where(eq(backgroundJobs.companyId, companyId))
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(50);
  }

  async getRecentJobs(limit = 50) {
    return db.select().from(backgroundJobs)
      .orderBy(desc(backgroundJobs.createdAt))
      .limit(limit);
  }

  async getJobByIdempotencyKey(key: string) {
    const [job] = await db.select().from(backgroundJobs)
      .where(eq(backgroundJobs.idempotencyKey, key));
    return job;
  }

  async createPlatformHealthEvent(event: InsertPlatformHealthEvent) {
    const [result] = await db.insert(platformHealthEvents).values(event).returning();
    return result;
  }

  async getPlatformHealthEvents(limit = 50, offset = 0, severity?: string, eventType?: string) {
    let query = db.select().from(platformHealthEvents).orderBy(desc(platformHealthEvents.createdAt));
    if (severity) {
      query = query.where(eq(platformHealthEvents.severity, severity)) as any;
    }
    if (eventType) {
      query = query.where(eq(platformHealthEvents.eventType, eventType)) as any;
    }
    return (query as any).limit(limit).offset(offset);
  }

  async createGeneratedFile(file: InsertGeneratedFile) {
    const [result] = await db.insert(generatedFiles).values(file).returning();
    return result;
  }

  async getGeneratedFile(id: string) {
    const [file] = await db.select().from(generatedFiles).where(eq(generatedFiles.id, id));
    return file;
  }

  async getGeneratedFilesByReportRun(reportRunId: string) {
    return db.select().from(generatedFiles)
      .where(eq(generatedFiles.reportRunId, reportRunId))
      .orderBy(desc(generatedFiles.generatedAt));
  }

  async createUserActivity(activity: InsertUserActivity) {
    const [result] = await db.insert(userActivity).values(activity).returning();
    return result;
  }

  async getActivityAnalytics(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const since7 = new Date(Date.now() - 7 * 86400000);
    const activeUsers30dResult = await db.execute(
      sql`SELECT COUNT(DISTINCT user_id) as count FROM user_activity WHERE created_at >= ${since} AND user_id IS NOT NULL`
    );
    const activeUsers7dResult = await db.execute(
      sql`SELECT COUNT(DISTINCT user_id) as count FROM user_activity WHERE created_at >= ${since7} AND user_id IS NOT NULL`
    );
    const featureUsage = await db.execute(
      sql`SELECT action, COUNT(*) as count FROM user_activity WHERE created_at >= ${since} GROUP BY action ORDER BY count DESC`
    );
    const topPages = await db.execute(
      sql`SELECT page, COUNT(*) as count FROM user_activity WHERE created_at >= ${since} AND action = 'page_view' AND page IS NOT NULL GROUP BY page ORDER BY count DESC LIMIT 20`
    );
    const reportCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM user_activity WHERE created_at >= ${since} AND action = 'report_generated'`
    );
    return {
      activeUsers7d: parseInt((activeUsers7dResult as any).rows?.[0]?.count || "0"),
      activeUsers30d: parseInt((activeUsers30dResult as any).rows?.[0]?.count || "0"),
      featureUsageCounts: (featureUsage as any).rows || [],
      topPages: (topPages as any).rows || [],
      reportGenerationCount: parseInt((reportCount as any).rows?.[0]?.count || "0"),
    };
  }

  async getActivityTimeline(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const result = await db.execute(
      sql`SELECT DATE(created_at) as date, COUNT(*) as count FROM user_activity WHERE created_at >= ${since} GROUP BY DATE(created_at) ORDER BY date`
    );
    return (result as any).rows || [];
  }

  async cleanupOldActivity(retentionDays = 90) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await db.execute(
      sql`DELETE FROM user_activity WHERE created_at < ${cutoff}`
    );
    return (result as any).rowCount || 0;
  }

  async createSupportRequest(data: Omit<SupportRequest, "id" | "createdAt" | "updatedAt">) {
    const [req] = await db.insert(supportRequests).values({ ...data, updatedAt: new Date() }).returning();
    return req;
  }

  async getSupportRequests(limit = 200) {
    return db.select().from(supportRequests).orderBy(desc(supportRequests.createdAt)).limit(limit);
  }

  async getSupportRequest(id: string) {
    const [req] = await db.select().from(supportRequests).where(eq(supportRequests.id, id));
    return req;
  }

  async updateSupportRequest(id: string, data: Partial<SupportRequest>) {
    const [req] = await db.update(supportRequests).set({ ...data, updatedAt: new Date() }).where(eq(supportRequests.id, id)).returning();
    return req;
  }

  async getSupportRequestsByCompany(companyId: string) {
    return db.select().from(supportRequests).where(eq(supportRequests.companyId, companyId)).orderBy(desc(supportRequests.createdAt));
  }

  async createAuthToken(data: InsertAuthToken) {
    const [token] = await db.insert(authTokens).values(data).returning();
    return token;
  }

  async getAuthTokenByHash(hash: string) {
    const [token] = await db.select().from(authTokens).where(eq(authTokens.tokenHash, hash));
    return token;
  }

  async markAuthTokenUsed(id: string) {
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id));
  }

  async cleanupExpiredAuthTokens() {
    const result = await db.execute(
      sql`DELETE FROM auth_tokens WHERE expires_at < NOW() AND used_at IS NULL`
    );
    return (result as any).rowCount || 0;
  }

  async updateCompanyBilling(companyId: string, data: { planTier?: string; planStatus?: string; currentPeriodEnd?: Date | null; stripeCustomerId?: string; stripeSubscriptionId?: string }) {
    await db.update(companies).set(data as any).where(eq(companies.id, companyId));
  }

  async getHealthEventCounts(since: Date) {
    const result = await db.execute(
      sql`SELECT event_type, severity, COUNT(*) as count FROM platform_health_events WHERE created_at >= ${since} GROUP BY event_type, severity`
    );
    const rows = (result as any).rows || [];
    let total = 0;
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const row of rows) {
      const n = parseInt(row.count);
      total += n;
      byType[row.event_type] = (byType[row.event_type] || 0) + n;
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + n;
    }
    return { total, byType, bySeverity };
  }

  // Agent API Keys
  async createAgentApiKey(data: InsertAgentApiKey) {
    const [key] = await db.insert(agentApiKeys).values(data as any).returning();
    return key;
  }

  async getAgentApiKeyByHash(hash: string) {
    const [key] = await db.select().from(agentApiKeys).where(eq(agentApiKeys.keyHash, hash));
    return key;
  }

  async listAgentApiKeys() {
    return db.select().from(agentApiKeys).orderBy(desc(agentApiKeys.createdAt));
  }

  async listAgentApiKeysByCompany(companyId: string) {
    return db.select().from(agentApiKeys).where(eq(agentApiKeys.companyId, companyId)).orderBy(desc(agentApiKeys.createdAt));
  }

  async getAgentApiKey(id: string) {
    const [key] = await db.select().from(agentApiKeys).where(eq(agentApiKeys.id, id));
    return key;
  }

  async revokeAgentApiKey(id: string) {
    await db.update(agentApiKeys).set({ revokedAt: new Date() }).where(eq(agentApiKeys.id, id));
  }

  async updateAgentApiKeyLastUsed(id: string) {
    await db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, id));
  }

  // Agent Runs
  async getAgentRuns(filters?: { companyId?: string; siteId?: string; limit?: number }) {
    const conditions: any[] = [];
    if (filters?.companyId) conditions.push(eq(agentRuns.companyId, filters.companyId));
    if (filters?.siteId) conditions.push(eq(agentRuns.siteId, filters.siteId));
    return db.select().from(agentRuns)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(agentRuns.createdAt))
      .limit(filters?.limit ?? 100);
  }

  async createAgentRun(data: InsertAgentRun) {
    const [run] = await db.insert(agentRuns).values(data as any).returning();
    return run;
  }

  async updateAgentRun(id: string, updates: Partial<AgentRun>) {
    const [run] = await db.update(agentRuns).set(updates as any).where(eq(agentRuns.id, id)).returning();
    return run;
  }

  async createAgentAction(data: InsertAgentAction) {
    const [action] = await db.insert(agentActions).values(data as any).returning();
    return action;
  }

  async createAgentEscalation(data: InsertAgentEscalation) {
    const [esc] = await db.insert(agentEscalations).values(data as any).returning();
    return esc;
  }

  async listAgentEscalations(filters?: { status?: string; companyId?: string; limit?: number }) {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(agentEscalations.status, filters.status));
    if (filters?.companyId) conditions.push(eq(agentEscalations.companyId, filters.companyId));
    const query = db.select().from(agentEscalations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentEscalations.createdAt))
      .limit(filters?.limit ?? 100);
    return query;
  }

  // Chat
  async createChatSession(data: InsertChatSession) {
    const [session] = await db.insert(chatSessions).values(data as any).returning();
    return session;
  }

  async getChatSession(id: string) {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }

  async listChatSessions(filters?: { userId?: string; companyId?: string }) {
    const conditions: any[] = [];
    if (filters?.userId) conditions.push(eq(chatSessions.userId, filters.userId));
    if (filters?.companyId) conditions.push(eq(chatSessions.companyId, filters.companyId));
    return db.select().from(chatSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(chatSessions.createdAt));
  }

  async createChatMessage(data: InsertChatMessage) {
    const [msg] = await db.insert(chatMessages).values(data as any).returning();
    return msg;
  }

  async getChatMessages(sessionId: string) {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
  }

  async adminListCompanies(search = "", page = 1, pageSize = 50) {
    const offset = (page - 1) * pageSize;
    const companiesResult = await db.execute(sql`
      SELECT
        c.id, c.name, c.industry, c.country, c.plan_tier, c.status,
        c.onboarding_complete, c.created_at,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS user_count,
        (SELECT COUNT(*)::int FROM esg_policies p WHERE p.company_id = c.id) AS policy_count,
        (SELECT COUNT(*)::int FROM metrics m WHERE m.company_id = c.id) AS metric_count,
        (SELECT COUNT(*)::int FROM report_runs r WHERE r.company_id = c.id) AS report_count
      FROM companies c
      WHERE (${search} = '' OR c.name ILIKE ${'%' + search + '%'})
      ORDER BY c.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM companies c
      WHERE (${search} = '' OR c.name ILIKE ${'%' + search + '%'})
    `);
    const rows = (companiesResult as any).rows ?? [];
    const countRows = (countResult as any).rows ?? [];
    return { companies: rows as any[], total: (countRows[0]?.total ?? 0) as number };
  }

  async adminListUsers(search = "", page = 1, pageSize = 50) {
    const offset = (page - 1) * pageSize;
    const usersResult = await db.execute(sql`
      SELECT
        u.id, u.username, u.email, u.role, u.created_at,
        c.id AS company_id, c.name AS company_name, c.status AS company_status
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE (${search} = '' OR u.email ILIKE ${'%' + search + '%'} OR u.username ILIKE ${'%' + search + '%'})
      ORDER BY u.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM users u
      WHERE (${search} = '' OR u.email ILIKE ${'%' + search + '%'} OR u.username ILIKE ${'%' + search + '%'})
    `);
    const rows = (usersResult as any).rows ?? [];
    const countRows = (countResult as any).rows ?? [];
    return { users: rows as any[], total: (countRows[0]?.total ?? 0) as number };
  }

  async adminGetCompanyDetail(companyId: string) {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return null;
    const companyUsers = await db.select().from(users).where(eq(users.companyId, companyId));
    const mcResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM metrics WHERE company_id = ${companyId}`);
    const pcResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM esg_policies WHERE company_id = ${companyId}`);
    const rcResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM report_runs WHERE company_id = ${companyId}`);
    const actResult = await db.execute(sql`
      SELECT * FROM super_admin_actions WHERE target_company_id = ${companyId} ORDER BY created_at DESC LIMIT 10
    `);
    const mcRows = (mcResult as any).rows ?? [];
    const pcRows = (pcResult as any).rows ?? [];
    const rcRows = (rcResult as any).rows ?? [];
    const actRows = (actResult as any).rows ?? [];
    return {
      ...company,
      users: companyUsers,
      counts: {
        users: companyUsers.length,
        metrics: mcRows[0]?.count ?? 0,
        policies: pcRows[0]?.count ?? 0,
        reports: rcRows[0]?.count ?? 0,
      },
      recentAdminActions: actRows,
    };
  }

  async adminSuspendCompany(companyId: string) {
    await db.execute(sql`UPDATE companies SET status = 'suspended' WHERE id = ${companyId}`);
  }

  async adminReactivateCompany(companyId: string) {
    await db.execute(sql`UPDATE companies SET status = 'active' WHERE id = ${companyId}`);
  }

  async adminArchiveCompany(companyId: string): Promise<Company> {
    return db.transaction(async (tx) => {
      const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
      if (!company) {
        throw storageError(404, "Company not found");
      }
      const [updated] = await tx.update(companies).set({
        status: "archived",
        lifecycleState: "archived",
      }).where(eq(companies.id, companyId)).returning();
      return updated;
    });
  }

  async adminDeleteCompany(companyId: string): Promise<Company> {
    return db.transaction(async (tx) => {
      const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
      if (!company) {
        throw storageError(404, "Company not found");
      }

      const now = new Date();
      const companyUsers = await tx.select({
        id: users.id,
      }).from(users).where(eq(users.companyId, companyId));
      const companyUserIds = companyUsers.map((user) => user.id);

      if (companyUserIds.length > 0) {
        await tx.update(userSessions)
          .set({ revokedAt: now })
          .where(and(inArray(userSessions.userId, companyUserIds), isNull(userSessions.revokedAt)));

        await tx.delete(userGroupRoles)
          .where(inArray(userGroupRoles.userId, companyUserIds));

        await tx.update(accessGrants)
          .set({ revokedAt: now, updatedAt: now })
          .where(and(inArray(accessGrants.userId, companyUserIds), isNull(accessGrants.revokedAt)));

        for (const userId of companyUserIds) {
          await anonymiseUserRecord(tx, userId);
        }
      }

      await tx.delete(groupCompanies).where(eq(groupCompanies.companyId, companyId));

      await tx.update(accessGrants)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(accessGrants.companyId, companyId), isNull(accessGrants.revokedAt)));

      await tx.update(organisationSites)
        .set({ status: "archived", updatedAt: now })
        .where(eq(organisationSites.companyId, companyId));

      const [updated] = await tx.update(companies).set({
        status: "deleted",
        lifecycleState: "archived",
        name: `deleted_${companyId}`,
        deletionPendingAt: now,
        deletionScheduledAt: now,
      }).where(eq(companies.id, companyId)).returning();

      return updated;
    });
  }

  async adminDeleteUser(userId: string, currentSuperAdminUserId: string): Promise<User> {
    return db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw storageError(404, "User not found");
      }
      if (user.id === currentSuperAdminUserId) {
        throw storageError(400, "You cannot delete your own super admin account");
      }

      if (user.companyId && (user.role === "admin" || user.role === "super_admin")) {
        const alternateAdmins = await tx.select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.companyId, user.companyId),
            or(eq(users.role, "admin"), eq(users.role, "super_admin")),
            isNull(users.anonymisedAt),
            sql`${users.id} <> ${userId}`
          ));

        if (alternateAdmins.length === 0) {
          throw storageError(409, "Cannot delete the only admin for this company");
        }
      }

      const now = new Date();
      await tx.update(userSessions)
        .set({ revokedAt: now })
        .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));

      await tx.delete(userGroupRoles).where(eq(userGroupRoles.userId, userId));

      await tx.update(accessGrants)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(accessGrants.userId, userId), isNull(accessGrants.revokedAt)));

      await anonymiseUserRecord(tx, userId);

      const [updated] = await tx.select().from(users).where(eq(users.id, userId));
      return updated;
    });
  }

  async createSuperAdminAction(data: Omit<InsertSuperAdminAction, "id" | "createdAt">) {
    const result = await db.execute(sql`
      INSERT INTO super_admin_actions (admin_user_id, action, target_company_id, target_user_id, metadata)
      VALUES (${data.adminUserId ?? null}, ${data.action}, ${data.targetCompanyId ?? null}, ${data.targetUserId ?? null}, ${data.metadata ? JSON.stringify(data.metadata) : null})
      RETURNING *
    `);
    const rows = (result as any).rows ?? [];
    return rows[0] as SuperAdminAction;
  }

  async getCompanyStatus(companyId: string) {
    const result = await db.execute(sql`SELECT status FROM companies WHERE id = ${companyId}`);
    const rows = (result as any).rows ?? [];
    return rows[0]?.status ?? null;
  }

  async adminGetCompanyDiagnostics(companyId: string) {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return null;

    const companyUsers = await db.select().from(users).where(eq(users.companyId, companyId));

    const [policiesR, metricsR, evidenceR, reportsR, mvR, aiR, lastLoginR, errorsR, activityR] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM esg_policies WHERE company_id = ${companyId}`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM metrics WHERE company_id = ${companyId}`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM evidence_files WHERE company_id = ${companyId}`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM report_runs WHERE company_id = ${companyId}`),
      db.execute(sql`
        SELECT MAX(mv.submitted_at) AS last_entry FROM metric_values mv
        JOIN metrics m ON mv.metric_id = m.id
        WHERE m.company_id = ${companyId}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM user_activity
        WHERE company_id = ${companyId}
          AND (action ILIKE '%assist%' OR action ILIKE '%chat%')
          AND created_at >= NOW() - INTERVAL '30 days'
      `),
      db.execute(sql`
        SELECT created_at FROM audit_logs
        WHERE company_id = ${companyId} AND action = 'login'
        ORDER BY created_at DESC LIMIT 1
      `),
      db.execute(sql`
        SELECT id, event_type, severity, message, created_at FROM platform_health_events
        WHERE company_id = ${companyId} AND severity IN ('error', 'critical')
        ORDER BY created_at DESC LIMIT 5
      `),
      db.execute(sql`
        SELECT action, entity_type, created_at FROM audit_logs
        WHERE company_id = ${companyId}
          AND action IN ('onboarding_complete', 'onboarding_completed', 'policy_created', 'policy_adopted',
                         'metric_entered', 'evidence_uploaded', 'report_generated', 'first_report_generated',
                         'company_created', 'company_linked_to_group', 'user_invited', 'user_role_changed',
                         'assistant_used', 'login')
        ORDER BY created_at DESC LIMIT 20
      `),
    ]);

    const r = (x: any) => (x as any).rows ?? [];

    const companySites = await this.getSites(companyId, true);

    const migrationHistoryR = await db.execute(sql`
      SELECT id, user_id, action, entity_id, details, created_at
      FROM audit_logs
      WHERE company_id = ${companyId} AND action = 'legacy_site_migration'
      ORDER BY created_at DESC LIMIT 20
    `);

    const migrationHistory = (migrationHistoryR as any).rows ?? [];

    // Load group memberships for this company (provisioning health)
    const groupMembershipsR = await db.execute(sql`
      SELECT g.id, g.name, g.slug, g.type, gc.created_at AS linked_at
      FROM group_companies gc
      JOIN groups g ON g.id = gc.group_id
      WHERE gc.company_id = ${companyId}
      ORDER BY gc.created_at ASC
    `);
    const groupMemberships = (groupMembershipsR as any).rows ?? [];

    // Load provisioning audit events
    const provisioningEventsR = await db.execute(sql`
      SELECT action, entity_type, entity_id, details, created_at, user_id
      FROM audit_logs
      WHERE company_id = ${companyId}
        AND action IN ('company_created', 'company_linked_to_group', 'user_invited', 'user_role_changed',
                       'onboarding_completed', 'first_report_generated')
      ORDER BY created_at ASC
    `);
    const provisioningEvents = (provisioningEventsR as any).rows ?? [];

    // Determine data readiness flags
    const hasMetricData = r(mvR)[0]?.last_entry != null;
    const hasEvidence = (r(evidenceR)[0]?.count ?? 0) > 0;
    const hasReport = (r(reportsR)[0]?.count ?? 0) > 0;
    const hasMetrics = (r(metricsR)[0]?.count ?? 0) > 0;
    const hasPolicy = (r(policiesR)[0]?.count ?? 0) > 0;

    return {
      id: company.id,
      name: company.name,
      industry: company.industry,
      country: company.country,
      status: company.status ?? "active",
      lifecycleState: company.lifecycleState ?? "created",
      planTier: company.planTier ?? "free",
      isBetaCompany: company.isBetaCompany ?? false,
      betaExpiresAt: company.betaExpiresAt ?? null,
      betaGrantedBy: company.betaGrantedBy ?? null,
      onboardingComplete: company.onboardingComplete ?? false,
      onboardingCompletedAt: company.onboardingCompletedAt ?? null,
      maturityLevel: company.esgMaturity ?? null,
      employeeCount: company.employeeCount,
      createdAt: company.createdAt,
      counts: {
        users: companyUsers.length,
        policies: r(policiesR)[0]?.count ?? 0,
        metrics: r(metricsR)[0]?.count ?? 0,
        evidenceFiles: r(evidenceR)[0]?.count ?? 0,
        reports: r(reportsR)[0]?.count ?? 0,
        aiUsageLast30Days: r(aiR)[0]?.count ?? 0,
      },
      dataReadiness: {
        hasMetrics,
        hasMetricData,
        hasEvidence,
        hasPolicy,
        hasReport,
        isDataReady: hasMetrics && hasMetricData && hasEvidence && hasReport,
      },
      lastMetricEntry: r(mvR)[0]?.last_entry ?? null,
      lastLogin: r(lastLoginR)[0]?.created_at ?? null,
      users: companyUsers.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role })),
      sites: companySites.map(s => ({ id: s.id, name: s.name, status: s.status, type: s.type })),
      groupMemberships,
      provisioningEvents,
      migrationHistory,
      recentErrors: r(errorsR),
      activityTimeline: r(activityR),
    };
  }

  // --- Organisation Sites ---

  async getSites(companyId: string, includeArchived = false): Promise<OrganisationSite[]> {
    const conditions = includeArchived
      ? [eq(organisationSites.companyId, companyId)]
      : [eq(organisationSites.companyId, companyId), eq(organisationSites.status, "active")];
    return db
      .select()
      .from(organisationSites)
      .where(and(...conditions))
      .orderBy(organisationSites.name);
  }

  async getSite(id: string, companyId: string): Promise<OrganisationSite | undefined> {
    const [site] = await db
      .select()
      .from(organisationSites)
      .where(and(eq(organisationSites.id, id), eq(organisationSites.companyId, companyId)));
    return site;
  }

  async createSite(data: InsertOrganisationSite): Promise<OrganisationSite> {
    const [site] = await db.insert(organisationSites).values(data).returning();
    return site;
  }

  async updateSite(id: string, companyId: string, data: Partial<InsertOrganisationSite>): Promise<OrganisationSite | undefined> {
    const [site] = await db
      .update(organisationSites)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(organisationSites.id, id), eq(organisationSites.companyId, companyId)))
      .returning();
    return site;
  }

  async archiveSite(id: string, companyId: string): Promise<OrganisationSite | undefined> {
    const [site] = await db
      .update(organisationSites)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(organisationSites.id, id), eq(organisationSites.companyId, companyId)))
      .returning();
    return site;
  }

  async getSitesSummary(companyId: string, period?: string, reportingPeriodId?: string) {
    const activeSites = await db
      .select()
      .from(organisationSites)
      .where(and(eq(organisationSites.companyId, companyId), eq(organisationSites.status, "active")))
      .orderBy(organisationSites.name);

    const rows: Array<{ siteId: string | null; siteName: string; status: string; metricCount: number; evidenceCount: number; questionnaireCount: number }> = [];

    for (const site of activeSites) {
      const mvConditions: any[] = [
        sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId})`,
        eq(metricValues.siteId, site.id),
      ];
      if (period) mvConditions.push(eq(metricValues.period, period));

      const [mvRow] = await db.select({ cnt: count() }).from(metricValues).where(and(...mvConditions));

      const evConditions: any[] = [eq(evidenceFiles.companyId, companyId), eq(evidenceFiles.siteId, site.id)];
      if (period) evConditions.push(eq(evidenceFiles.linkedPeriod, period));
      const [evRow] = await db.select({ cnt: count() }).from(evidenceFiles).where(and(...evConditions));

      const qqConditions: any[] = [eq(questionnaires.companyId, companyId), eq(questionnaires.siteId, site.id)];
      if (reportingPeriodId) qqConditions.push(eq(questionnaires.reportingPeriodId, reportingPeriodId));
      const [qqRow] = await db.select({ cnt: count() }).from(questionnaires).where(and(...qqConditions));

      rows.push({
        siteId: site.id,
        siteName: site.name,
        status: site.status,
        metricCount: Number(mvRow?.cnt ?? 0),
        evidenceCount: Number(evRow?.cnt ?? 0),
        questionnaireCount: Number(qqRow?.cnt ?? 0),
      });
    }

    // Unassigned row — null site_id records within period
    const unassignedMvConds: any[] = [
      sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId})`,
      isNull(metricValues.siteId),
    ];
    if (period) unassignedMvConds.push(eq(metricValues.period, period));
    const [uMvRow] = await db.select({ cnt: count() }).from(metricValues).where(and(...unassignedMvConds));

    const uEvConds: any[] = [eq(evidenceFiles.companyId, companyId), isNull(evidenceFiles.siteId)];
    if (period) uEvConds.push(eq(evidenceFiles.linkedPeriod, period));
    const [uEvRow] = await db.select({ cnt: count() }).from(evidenceFiles).where(and(...uEvConds));
    const uQqConds: any[] = [eq(questionnaires.companyId, companyId), isNull(questionnaires.siteId)];
    if (reportingPeriodId) uQqConds.push(eq(questionnaires.reportingPeriodId, reportingPeriodId));
    const [uQqRow] = await db.select({ cnt: count() }).from(questionnaires).where(and(...uQqConds));

    if (Number(uMvRow?.cnt ?? 0) > 0 || Number(uEvRow?.cnt ?? 0) > 0 || Number(uQqRow?.cnt ?? 0) > 0) {
      rows.push({ siteId: null, siteName: "Unassigned", status: "active", metricCount: Number(uMvRow?.cnt ?? 0), evidenceCount: Number(uEvRow?.cnt ?? 0), questionnaireCount: Number(uQqRow?.cnt ?? 0) });
    }

    return rows;
  }

  async getSiteDashboard(siteId: string, companyId: string, period?: string, reportingPeriodId?: string) {
    const site = await this.getSite(siteId, companyId);
    if (!site) return null;

    const mvConditions: any[] = [
      sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId})`,
      eq(metricValues.siteId, siteId),
    ];
    if (period) mvConditions.push(eq(metricValues.period, period));

    const mvRows = await db.select({
      id: metricValues.id,
      metricId: metricValues.metricId,
      period: metricValues.period,
      value: metricValues.value,
      notes: metricValues.notes,
    }).from(metricValues).where(and(...mvConditions)).orderBy(desc(metricValues.submittedAt)).limit(20);

    const evConds: any[] = [eq(evidenceFiles.companyId, companyId), eq(evidenceFiles.siteId, siteId)];
    if (period) evConds.push(eq(evidenceFiles.linkedPeriod, period));
    const evRows = await db.select().from(evidenceFiles)
      .where(and(...evConds))
      .orderBy(desc(evidenceFiles.uploadedAt)).limit(10);

    const qqConds: any[] = [eq(questionnaires.companyId, companyId), eq(questionnaires.siteId, siteId)];
    if (reportingPeriodId) qqConds.push(eq(questionnaires.reportingPeriodId, reportingPeriodId));
    const qqRows = await db.select().from(questionnaires)
      .where(and(...qqConds))
      .orderBy(desc(questionnaires.createdAt)).limit(10);

    return {
      site,
      metricValues: mvRows,
      evidenceFiles: evRows,
      questionnaires: qqRows,
    };
  }

  // ============================================================
  // METRIC DEFINITIONS
  // ============================================================

  async getMetricDefinitions(filters?: { pillar?: string; isCore?: boolean; isActive?: boolean; search?: string }) {
    const conditions: any[] = [];
    if (filters?.pillar) conditions.push(sql`${metricDefinitions.pillar} = ${filters.pillar}`);
    if (filters?.isCore !== undefined) conditions.push(eq(metricDefinitions.isCore, filters.isCore));
    if (filters?.isActive !== undefined) conditions.push(eq(metricDefinitions.isActive, filters.isActive));
    if (filters?.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      conditions.push(sql`(lower(${metricDefinitions.name}) LIKE ${s} OR lower(${metricDefinitions.code}) LIKE ${s} OR lower(coalesce(${metricDefinitions.description}, '')) LIKE ${s})`);
    }
    const q = conditions.length > 0
      ? db.select().from(metricDefinitions).where(and(...conditions))
      : db.select().from(metricDefinitions);
    return q.orderBy(metricDefinitions.sortOrder, metricDefinitions.name);
  }

  async getMetricDefinition(id: string) {
    const [r] = await db.select().from(metricDefinitions).where(eq(metricDefinitions.id, id));
    return r;
  }

  async getMetricDefinitionByCode(code: string) {
    const [r] = await db.select().from(metricDefinitions).where(eq(metricDefinitions.code, code));
    return r;
  }

  async createMetricDefinition(data: InsertMetricDefinition): Promise<MetricDefinition> {
    const [r] = await db.insert(metricDefinitions).values({
      code: data.code,
      name: data.name,
      pillar: data.pillar,
      category: data.category,
      description: data.description ?? null,
      dataType: data.dataType ?? "numeric",
      unit: data.unit ?? null,
      inputFrequency: data.inputFrequency ?? "quarterly",
      isCore: data.isCore ?? true,
      isActive: data.isActive ?? true,
      isDerived: data.isDerived ?? false,
      formulaJson: data.formulaJson ?? null,
      frameworkTags: data.frameworkTags ?? null,
      scoringWeight: data.scoringWeight ?? "1",
      sortOrder: data.sortOrder ?? 0,
      evidenceRequired: data.evidenceRequired ?? false,
      rollupMethod: data.rollupMethod ?? "sum",
    }).returning();
    return r;
  }

  async updateMetricDefinition(id: string, data: Partial<MetricDefinition>): Promise<MetricDefinition | undefined> {
    const updateFields: Record<string, any> = { updatedAt: new Date() };
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.description !== undefined) updateFields.description = data.description;
    if (data.pillar !== undefined) updateFields.pillar = data.pillar;
    if (data.category !== undefined) updateFields.category = data.category;
    if (data.unit !== undefined) updateFields.unit = data.unit;
    if (data.inputFrequency !== undefined) updateFields.inputFrequency = data.inputFrequency;
    if (data.dataType !== undefined) updateFields.dataType = data.dataType;
    if (data.isCore !== undefined) updateFields.isCore = data.isCore;
    if (data.isActive !== undefined) updateFields.isActive = data.isActive;
    if (data.isDerived !== undefined) updateFields.isDerived = data.isDerived;
    if (data.formulaJson !== undefined) updateFields.formulaJson = data.formulaJson;
    if (data.frameworkTags !== undefined) updateFields.frameworkTags = data.frameworkTags;
    if (data.scoringWeight !== undefined) updateFields.scoringWeight = data.scoringWeight;
    if (data.sortOrder !== undefined) updateFields.sortOrder = data.sortOrder;
    if (data.evidenceRequired !== undefined) updateFields.evidenceRequired = data.evidenceRequired;
    if (data.rollupMethod !== undefined) updateFields.rollupMethod = data.rollupMethod;
    const [r] = await db.update(metricDefinitions).set(updateFields).where(eq(metricDefinitions.id, id)).returning();
    return r;
  }

  async seedMetricDefinitions(definitions: InsertMetricDefinition[]): Promise<number> {
    let seeded = 0;
    for (const def of definitions) {
      const existing = await this.getMetricDefinitionByCode(def.code);
      if (!existing) {
        await this.createMetricDefinition(def);
        seeded++;
      }
    }
    return seeded;
  }

  // ============================================================
  // METRIC DEFINITION VALUES
  // ============================================================

  async getMetricDefinitionValues(businessId: string, filters?: { metricDefinitionId?: string; siteId?: string | null; periodStart?: Date; periodEnd?: Date }) {
    const conditions: any[] = [eq(metricDefinitionValues.businessId, businessId)];
    if (filters?.metricDefinitionId) conditions.push(eq(metricDefinitionValues.metricDefinitionId, filters.metricDefinitionId));
    if (filters?.siteId !== undefined) {
      conditions.push(filters.siteId === null ? isNull(metricDefinitionValues.siteId) : eq(metricDefinitionValues.siteId, filters.siteId));
    }
    if (filters?.periodStart) conditions.push(sql`${metricDefinitionValues.reportingPeriodStart} >= ${filters.periodStart}`);
    if (filters?.periodEnd) conditions.push(sql`${metricDefinitionValues.reportingPeriodEnd} <= ${filters.periodEnd}`);
    return db.select().from(metricDefinitionValues).where(and(...conditions)).orderBy(desc(metricDefinitionValues.reportingPeriodStart));
  }

  async getMetricDefinitionValueById(id: string, businessId: string): Promise<MetricDefinitionValue | undefined> {
    const [r] = await db.select().from(metricDefinitionValues)
      .where(and(eq(metricDefinitionValues.id, id), eq(metricDefinitionValues.businessId, businessId)));
    return r;
  }

  async createMetricDefinitionValue(data: InsertMetricDefinitionValue): Promise<MetricDefinitionValue> {
    const insertData: typeof metricDefinitionValues.$inferInsert = {
      businessId: data.businessId,
      metricDefinitionId: data.metricDefinitionId,
      siteId: data.siteId ?? null,
      reportingPeriodStart: data.reportingPeriodStart,
      reportingPeriodEnd: data.reportingPeriodEnd,
      valueNumeric: data.valueNumeric ?? null,
      valueText: data.valueText ?? null,
      valueBoolean: data.valueBoolean ?? null,
      valueJson: data.valueJson ?? null,
      sourceType: data.sourceType ?? undefined,
      notes: data.notes ?? null,
      enteredByUserId: data.enteredByUserId ?? null,
      status: data.status ?? undefined,
    };
    const [r] = await db.insert(metricDefinitionValues).values(insertData).returning();
    return r;
  }

  async updateMetricDefinitionValue(id: string, businessId: string, data: Partial<MetricDefinitionValue>): Promise<MetricDefinitionValue | undefined> {
    const { valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status } = data;
    const [r] = await db.update(metricDefinitionValues)
      .set({ valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status, updatedAt: new Date() })
      .where(and(eq(metricDefinitionValues.id, id), eq(metricDefinitionValues.businessId, businessId)))
      .returning();
    return r;
  }

  async upsertMetricDefinitionValue(businessId: string, metricDefinitionId: string, siteId: string | null, periodStart: Date, periodEnd: Date, data: Partial<InsertMetricDefinitionValue>) {
    const { valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status, enteredByUserId } = data;
    const lockKey = `metric_definition_values:${businessId}:${metricDefinitionId}:${periodStart.toISOString()}:${periodEnd.toISOString()}:${siteId ?? "__org__"}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);

      const selectSql = siteId === null
        ? `
            SELECT *
            FROM metric_definition_values
            WHERE business_id = $1
              AND metric_definition_id = $2
              AND reporting_period_start = $3
              AND reporting_period_end = $4
              AND site_id IS NULL
            LIMIT 1
            FOR UPDATE
          `
        : `
            SELECT *
            FROM metric_definition_values
            WHERE business_id = $1
              AND metric_definition_id = $2
              AND reporting_period_start = $3
              AND reporting_period_end = $4
              AND site_id = $5
            LIMIT 1
            FOR UPDATE
          `;
      const selectParams = siteId === null
        ? [businessId, metricDefinitionId, periodStart, periodEnd]
        : [businessId, metricDefinitionId, periodStart, periodEnd, siteId];
      const existingResult = await client.query(selectSql, selectParams);
      const existing = existingResult.rows[0] as MetricDefinitionValue | undefined;

      if (existing) {
        const updateResult = await client.query(
          `
            UPDATE metric_definition_values
            SET
              value_numeric = $2,
              value_text = $3,
              value_boolean = $4,
              value_json = $5,
              source_type = $6,
              notes = $7,
              status = $8,
              entered_by_user_id = $9,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [
            existing.id,
            valueNumeric ?? null,
            valueText ?? null,
            valueBoolean ?? null,
            valueJson ?? null,
            sourceType ?? "manual",
            notes ?? null,
            status ?? "draft",
            enteredByUserId ?? null,
          ],
        );
        await client.query("COMMIT");
        return updateResult.rows[0] as MetricDefinitionValue;
      }

      const insertResult = await client.query(
        `
          INSERT INTO metric_definition_values (
            business_id, metric_definition_id, site_id, reporting_period_start, reporting_period_end,
            value_numeric, value_text, value_boolean, value_json, source_type, notes, status, entered_by_user_id,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          RETURNING *
        `,
        [
          businessId,
          metricDefinitionId,
          siteId ?? null,
          periodStart,
          periodEnd,
          valueNumeric ?? null,
          valueText ?? null,
          valueBoolean ?? null,
          valueJson ?? null,
          sourceType ?? "manual",
          notes ?? null,
          status ?? "draft",
          enteredByUserId ?? null,
        ],
      );
      await client.query("COMMIT");
      return insertResult.rows[0] as MetricDefinitionValue;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async rollupSiteValuesToCompany(businessId: string, metricDefinitionId: string, periodStart: Date, periodEnd: Date): Promise<number | null> {
    const defn = await this.getMetricDefinition(metricDefinitionId);
    if (!defn || defn.rollupMethod === "none") return null;

    const siteValues = await db.select().from(metricDefinitionValues)
      .where(
        and(
          eq(metricDefinitionValues.businessId, businessId),
          eq(metricDefinitionValues.metricDefinitionId, metricDefinitionId),
          eq(metricDefinitionValues.reportingPeriodStart, periodStart),
          eq(metricDefinitionValues.reportingPeriodEnd, periodEnd),
          sql`${metricDefinitionValues.siteId} IS NOT NULL`,
        )
      )
      .orderBy(desc(metricDefinitionValues.updatedAt));

    if (siteValues.length === 0) return null;

    const validSiteValues = siteValues.filter(v => v.valueNumeric !== null && !isNaN(parseFloat(v.valueNumeric!)));
    if (validSiteValues.length === 0) return null;

    let rollupValue: number | null = null;
    if (defn.rollupMethod === "sum") {
      rollupValue = validSiteValues.reduce((a, v) => a + parseFloat(v.valueNumeric!), 0);
    } else if (defn.rollupMethod === "weighted_average") {
      // Weighted average: sites are weighted by scoringWeight from metricDefinitionValues if available,
      // otherwise each site contributes an equal weight of 1.
      // For percentage-type metrics (e.g. % female in management), equal-weight mean is semantically correct
      // when no site headcount weight is available.
      const totalWeight = validSiteValues.reduce((a, v) => {
        const w = v.sourceType === "manual" ? 1 : 1; // extend here when per-site weights are introduced
        return a + w;
      }, 0);
      const weightedSum = validSiteValues.reduce((a, v) => {
        const w = 1; // uniform weight per site — extend when weight column added to metricDefinitionValues
        return a + parseFloat(v.valueNumeric!) * w;
      }, 0);
      rollupValue = totalWeight > 0 ? weightedSum / totalWeight : null;
    } else if (defn.rollupMethod === "latest") {
      // ORDER BY updatedAt DESC already applied; first record is the most recently updated
      rollupValue = parseFloat(validSiteValues[0].valueNumeric!);
    }

    if (rollupValue !== null) {
      await this.upsertMetricDefinitionValue(businessId, metricDefinitionId, null, periodStart, periodEnd, {
        valueNumeric: String(rollupValue),
        sourceType: "calculated",
      });
    }

    return rollupValue;
  }

  // ============================================================
  // METRIC EVIDENCE
  // ============================================================

  async getMetricEvidence(metricValueId: string): Promise<MetricEvidence[]> {
    return db.select().from(metricEvidence).where(eq(metricEvidence.metricValueId, metricValueId)).orderBy(desc(metricEvidence.uploadedAt));
  }

  async getMetricEvidenceById(id: string, businessId: string): Promise<MetricEvidence | undefined> {
    const [ev] = await db.select({ ev: metricEvidence })
      .from(metricEvidence)
      .innerJoin(metricDefinitionValues, eq(metricEvidence.metricValueId, metricDefinitionValues.id))
      .where(and(eq(metricEvidence.id, id), eq(metricDefinitionValues.businessId, businessId)));
    return ev?.ev;
  }

  async createMetricEvidence(data: InsertMetricEvidence): Promise<MetricEvidence> {
    const [r] = await db.insert(metricEvidence).values({
      metricValueId: data.metricValueId,
      fileUrl: data.fileUrl ?? null,
      storageKey: data.storageKey ?? null,
      fileName: data.fileName,
      fileType: data.fileType ?? null,
      uploadedByUserId: data.uploadedByUserId ?? null,
      notes: data.notes ?? null,
    }).returning();
    return r;
  }

  async deleteMetricEvidence(id: string): Promise<void> {
    await db.delete(metricEvidence).where(eq(metricEvidence.id, id));
  }

  // ============================================================
  // METRIC CALCULATION RUNS
  // ============================================================

  async createMetricCalculationRun(data: InsertMetricCalculationRun): Promise<MetricCalculationRun> {
    const [r] = await db.insert(metricCalculationRuns).values({
      businessId: data.businessId,
      metricDefinitionId: data.metricDefinitionId,
      siteId: data.siteId ?? null,
      reportingPeriodStart: data.reportingPeriodStart,
      reportingPeriodEnd: data.reportingPeriodEnd,
      status: data.status ?? "pending",
      inputsJson: data.inputsJson ?? null,
      outputJson: data.outputJson ?? null,
      errorText: data.errorText ?? null,
      triggeredByMetricValueId: data.triggeredByMetricValueId ?? null,
    }).returning();
    return r;
  }

  async updateMetricCalculationRun(id: string, data: Partial<MetricCalculationRun>): Promise<MetricCalculationRun | undefined> {
    const [r] = await db.update(metricCalculationRuns)
      .set({
        status: data.status,
        outputJson: data.outputJson,
        errorText: data.errorText,
      })
      .where(eq(metricCalculationRuns.id, id))
      .returning();
    return r;
  }

  async getMetricCalculationRuns(businessId: string, metricDefinitionId?: string): Promise<MetricCalculationRun[]> {
    const baseCondition = eq(metricCalculationRuns.businessId, businessId);
    const whereClause = metricDefinitionId
      ? and(baseCondition, eq(metricCalculationRuns.metricDefinitionId, metricDefinitionId))
      : baseCondition;
    return db.select().from(metricCalculationRuns).where(whereClause).orderBy(desc(metricCalculationRuns.createdAt)).limit(100);
  }

  // ESG Phase 2: Framework Mapping & Readiness
  async getFrameworks(activeOnly = false): Promise<Framework[]> {
    if (activeOnly) {
      return db.select().from(frameworks).where(eq(frameworks.isActive, true)).orderBy(frameworks.name);
    }
    return db.select().from(frameworks).orderBy(frameworks.name);
  }

  async getFramework(id: string): Promise<Framework | undefined> {
    const [row] = await db.select().from(frameworks).where(eq(frameworks.id, id)).limit(1);
    return row;
  }

  async getFrameworkByCode(code: string): Promise<Framework | undefined> {
    const [row] = await db.select().from(frameworks).where(eq(frameworks.code, code)).limit(1);
    return row;
  }

  async getFrameworkRequirements(frameworkId: string): Promise<FrameworkRequirement[]> {
    return db.select().from(frameworkRequirements)
      .where(eq(frameworkRequirements.frameworkId, frameworkId))
      .orderBy(frameworkRequirements.sortOrder, frameworkRequirements.code);
  }

  async getAllFrameworkRequirements(): Promise<FrameworkRequirement[]> {
    return db.select().from(frameworkRequirements)
      .orderBy(frameworkRequirements.frameworkId, frameworkRequirements.sortOrder);
  }

  async getMetricFrameworkMappings(metricDefinitionId: string): Promise<MetricFrameworkMapping[]> {
    return db.select().from(metricFrameworkMappings)
      .where(eq(metricFrameworkMappings.metricDefinitionId, metricDefinitionId));
  }

  async getMappingsForRequirement(frameworkRequirementId: string): Promise<MetricFrameworkMapping[]> {
    return db.select().from(metricFrameworkMappings)
      .where(eq(metricFrameworkMappings.frameworkRequirementId, frameworkRequirementId));
  }

  async getAllMappings(): Promise<MetricFrameworkMapping[]> {
    return db.select().from(metricFrameworkMappings);
  }

  async getBusinessFrameworkSelections(businessId: string): Promise<BusinessFrameworkSelection[]> {
    return db.select().from(businessFrameworkSelections)
      .where(eq(businessFrameworkSelections.businessId, businessId));
  }

  async upsertBusinessFrameworkSelection(businessId: string, frameworkId: string, isEnabled: boolean): Promise<BusinessFrameworkSelection> {
    const existing = await db.select().from(businessFrameworkSelections)
      .where(and(eq(businessFrameworkSelections.businessId, businessId), eq(businessFrameworkSelections.frameworkId, frameworkId)))
      .limit(1);
    if (existing.length > 0) {
      const [row] = await db.update(businessFrameworkSelections)
        .set({ isEnabled, updatedAt: new Date() })
        .where(and(eq(businessFrameworkSelections.businessId, businessId), eq(businessFrameworkSelections.frameworkId, frameworkId)))
        .returning();
      return row;
    } else {
      const [row] = await db.insert(businessFrameworkSelections)
        .values({ businessId, frameworkId, isEnabled })
        .returning();
      return row;
    }
  }

  async getFrameworkReadiness(businessId: string): Promise<any> {
    const selections = await this.getBusinessFrameworkSelections(businessId);
    const enabledFrameworkIds = selections.filter(s => s.isEnabled).map(s => s.frameworkId);
    if (enabledFrameworkIds.length === 0) return [];

    const allFrameworks = await this.getFrameworks(true);
    const selectedFrameworks = allFrameworks.filter(f => enabledFrameworkIds.includes(f.id));

    const allReqs = await this.getAllFrameworkRequirements();
    const allMappings = await this.getAllMappings();

    const metricDefs = await this.getMetricDefinitions({ isActive: true });
    const activeMetricDefIds = new Set(metricDefs.map(m => m.id));

    const result = [];

    for (const framework of selectedFrameworks) {
      const reqs = allReqs.filter(r => r.frameworkId === framework.id);

      const reqReadiness = reqs.map(req => {
        const mappings = allMappings.filter(m => m.frameworkRequirementId === req.id);
        const activeMappings = mappings.filter(m => activeMetricDefIds.has(m.metricDefinitionId));

        let status: "covered" | "partial" | "missing";
        let mappedMetrics: string[] = [];

        if (activeMappings.length === 0) {
          status = "missing";
        } else {
          const hasDirect = activeMappings.some(m => m.mappingStrength === "direct");
          const hasPartial = activeMappings.some(m => m.mappingStrength === "partial");
          if (hasDirect) {
            status = req.requirementType === "metric" ? "covered" : "partial";
          } else if (hasPartial) {
            status = "partial";
          } else {
            status = "partial";
          }
          mappedMetrics = activeMappings.map(m => m.metricDefinitionId);
        }

        const additionalNeeded: string[] = [];
        if (req.requirementType !== "metric" && status === "partial") {
          additionalNeeded.push(`${req.requirementType} documentation required`);
        }
        if (req.requirementType === "narrative") additionalNeeded.push("narrative statement needed");
        if (req.requirementType === "policy") additionalNeeded.push("formal policy document needed");
        if (req.requirementType === "evidence") additionalNeeded.push("supporting evidence needed");
        if (req.requirementType === "target") additionalNeeded.push("quantified target needed");
        if (req.requirementType === "risk") additionalNeeded.push("risk assessment needed");

        return {
          ...req,
          status,
          mappedMetricIds: mappedMetrics,
          mappedMetricCount: mappedMetrics.length,
          additionalNeeded,
        };
      });

      const covered = reqReadiness.filter(r => r.status === "covered").length;
      const partial = reqReadiness.filter(r => r.status === "partial").length;
      const missing = reqReadiness.filter(r => r.status === "missing").length;
      const total = reqs.length;

      const missingCoreReqs = reqReadiness.filter(r => r.status === "missing" && r.mandatoryLevel === "core");
      const nextBestActions = missingCoreReqs.slice(0, 3).map(r => ({
        requirementCode: r.code,
        title: r.title,
        action: r.requirementType === "metric"
          ? "Add and enter data for this metric in the Metrics Library"
          : r.requirementType === "policy"
          ? "Create a formal policy document for this area"
          : r.requirementType === "narrative"
          ? "Add a narrative statement for this disclosure"
          : r.requirementType === "target"
          ? "Set a quantified target for this area"
          : r.requirementType === "evidence"
          ? "Upload supporting evidence documentation"
          : "Complete this requirement",
      }));

      result.push({
        framework,
        requirements: reqReadiness,
        summary: { covered, partial, missing, total },
        nextBestActions,
      });
    }

    return result;
  }

  async getMetricDefinitionFrameworkAlignment(metricDefinitionId: string): Promise<any> {
    const mappings = await this.getMetricFrameworkMappings(metricDefinitionId);
    if (mappings.length === 0) return { mappings: [], frameworks: [] };

    const allReqs = await this.getAllFrameworkRequirements();
    const allFrameworks = await this.getFrameworks(true);

    const enriched = mappings.map(m => {
      const req = allReqs.find(r => r.id === m.frameworkRequirementId);
      const fw = req ? allFrameworks.find(f => f.id === req.frameworkId) : undefined;
      const additionalNeeded: string[] = [];
      if (req) {
        if (req.requirementType !== "metric") {
          additionalNeeded.push(`${req.requirementType} documentation also required`);
        }
        if (req.requirementType === "narrative") additionalNeeded.push("Narrative disclosure statement");
        if (req.requirementType === "policy") additionalNeeded.push("Formal policy document");
        if (req.requirementType === "evidence") additionalNeeded.push("Supporting evidence files");
        if (req.requirementType === "target") additionalNeeded.push("Quantified target value");
        if (req.requirementType === "risk") additionalNeeded.push("Risk assessment documentation");
      }
      return {
        mappingId: m.id,
        mappingStrength: m.mappingStrength,
        notes: m.notes,
        requirement: req,
        framework: fw,
        additionalNeeded,
      };
    });

    const frameworkGroups: Record<string, any> = {};
    for (const e of enriched) {
      if (!e.framework) continue;
      const fwId = e.framework.id;
      if (!frameworkGroups[fwId]) {
        frameworkGroups[fwId] = { framework: e.framework, alignments: [] };
      }
      frameworkGroups[fwId].alignments.push(e);
    }

    return {
      metricDefinitionId,
      frameworks: Object.values(frameworkGroups),
    };
  }

  // ============================================================
  // MATERIALITY
  // ============================================================

  async getMaterialTopic(id: string): Promise<MaterialTopic | undefined> {
    const [t] = await db.select().from(materialTopics).where(eq(materialTopics.id, id));
    return t;
  }

  async upsertMaterialTopicScores(id: string, companyId: string, data: Partial<MaterialTopic>): Promise<MaterialTopic | undefined> {
    const [t] = await db.update(materialTopics)
      .set(data)
      .where(and(eq(materialTopics.id, id), eq(materialTopics.companyId, companyId)))
      .returning();
    return t;
  }

  async seedDefaultMaterialTopics(companyId: string): Promise<void> {
    const existing = await db.select().from(materialTopics).where(eq(materialTopics.companyId, companyId));
    if (existing.length > 0) return;

    const DEFAULT_TOPICS = [
      // Environmental
      { topic: "Climate Change & GHG Emissions", category: "environmental" as const, isDefault: true, recommendedPolicySlugs: ["climate", "environmental"] },
      { topic: "Energy Efficiency", category: "environmental" as const, isDefault: true, recommendedPolicySlugs: ["environmental"] },
      { topic: "Water Stewardship", category: "environmental" as const, isDefault: true, recommendedPolicySlugs: ["environmental"] },
      { topic: "Waste & Circular Economy", category: "environmental" as const, isDefault: true, recommendedPolicySlugs: ["environmental"] },
      { topic: "Biodiversity & Land Use", category: "environmental" as const, isDefault: true, recommendedPolicySlugs: ["environmental"] },
      { topic: "Air Quality & Pollution", category: "environmental" as const, isDefault: true, recommendedPolicySlugs: ["environmental"] },
      // Social
      { topic: "Health & Safety", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["health_safety"] },
      { topic: "Diversity, Equity & Inclusion", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["social"] },
      { topic: "Employee Wellbeing & Engagement", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["social"] },
      { topic: "Fair Pay & Living Wage", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["social"] },
      { topic: "Training & Skills Development", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["social"] },
      { topic: "Human Rights & Labour Standards", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["social"] },
      { topic: "Community Impact", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["social"] },
      { topic: "Supply Chain Responsibility", category: "social" as const, isDefault: true, recommendedPolicySlugs: ["supplier"] },
      // Governance
      { topic: "Business Ethics & Anti-Bribery", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["anti_bribery"] },
      { topic: "Data Privacy & Cybersecurity", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["data_privacy", "cybersecurity"] },
      { topic: "Whistleblowing & Speak-Up Culture", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["whistleblowing"] },
      { topic: "Board Oversight & Governance", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["governance"] },
      { topic: "Regulatory Compliance", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["governance"] },
      { topic: "Transparency & Disclosure", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["governance"] },
      { topic: "ESG Strategy & Target-Setting", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["governance"] },
      { topic: "Tax Responsibility", category: "governance" as const, isDefault: true, recommendedPolicySlugs: ["governance"] },
    ];

    for (const topic of DEFAULT_TOPICS) {
      await db.insert(materialTopics).values({ companyId, ...topic, selected: false }).onConflictDoNothing();
    }
  }

  async getMaterialityAssessments(companyId: string): Promise<BusinessMaterialityAssessment[]> {
    return db.select().from(businessMaterialityAssessments)
      .where(eq(businessMaterialityAssessments.companyId, companyId))
      .orderBy(desc(businessMaterialityAssessments.assessmentYear));
  }

  async createMaterialityAssessment(data: InsertBusinessMaterialityAssessment): Promise<BusinessMaterialityAssessment> {
    const [a] = await db.insert(businessMaterialityAssessments).values(data).returning();
    return a;
  }

  async updateMaterialityAssessment(id: string, companyId: string, data: Partial<BusinessMaterialityAssessment>): Promise<BusinessMaterialityAssessment | undefined> {
    const [a] = await db.update(businessMaterialityAssessments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(businessMaterialityAssessments.id, id), eq(businessMaterialityAssessments.companyId, companyId)))
      .returning();
    return a;
  }

  // ============================================================
  // POLICY RECORDS
  // ============================================================

  async getPolicyRecords(companyId: string): Promise<PolicyRecord[]> {
    return db.select().from(policyRecords)
      .where(eq(policyRecords.companyId, companyId))
      .orderBy(policyRecords.title);
  }

  async getPolicyRecord(id: string, companyId: string): Promise<PolicyRecord | undefined> {
    const [r] = await db.select().from(policyRecords)
      .where(and(eq(policyRecords.id, id), eq(policyRecords.companyId, companyId)));
    return r;
  }

  async createPolicyRecord(data: InsertPolicyRecord): Promise<PolicyRecord> {
    const [r] = await db.insert(policyRecords).values(data).returning();
    return r;
  }

  async updatePolicyRecord(id: string, companyId: string, data: Partial<PolicyRecord>): Promise<PolicyRecord | undefined> {
    const [r] = await db.update(policyRecords)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(policyRecords.id, id), eq(policyRecords.companyId, companyId)))
      .returning();
    return r;
  }

  async deletePolicyRecord(id: string, companyId: string): Promise<void> {
    await db.delete(policyRecords)
      .where(and(eq(policyRecords.id, id), eq(policyRecords.companyId, companyId)));
  }

  // ============================================================
  // GOVERNANCE ASSIGNMENTS
  // ============================================================

  async getGovernanceAssignments(companyId: string): Promise<GovernanceAssignment[]> {
    return db.select().from(governanceAssignments)
      .where(eq(governanceAssignments.companyId, companyId))
      .orderBy(governanceAssignments.area);
  }

  async upsertGovernanceAssignment(companyId: string, area: string, data: Partial<InsertGovernanceAssignment>): Promise<GovernanceAssignment> {
    const existing = await db.select().from(governanceAssignments)
      .where(and(eq(governanceAssignments.companyId, companyId), eq(governanceAssignments.area, area as any)));
    if (existing.length > 0) {
      const [r] = await db.update(governanceAssignments)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(governanceAssignments.companyId, companyId), eq(governanceAssignments.area, area as any)))
        .returning();
      return r;
    } else {
      const [r] = await db.insert(governanceAssignments)
        .values({ companyId, area: area as any, ...data } as any)
        .returning();
      return r;
    }
  }

  async deleteGovernanceAssignment(id: string, companyId: string): Promise<void> {
    await db.delete(governanceAssignments)
      .where(and(eq(governanceAssignments.id, id), eq(governanceAssignments.companyId, companyId)));
  }

  // ============================================================
  // ESG TARGETS
  // ============================================================

  async getEsgTargets(companyId: string): Promise<EsgTarget[]> {
    return db.select().from(esgTargets)
      .where(eq(esgTargets.companyId, companyId))
      .orderBy(desc(esgTargets.targetYear), esgTargets.pillar);
  }

  async getEsgTarget(id: string, companyId: string): Promise<EsgTarget | undefined> {
    const [t] = await db.select().from(esgTargets)
      .where(and(eq(esgTargets.id, id), eq(esgTargets.companyId, companyId)));
    return t;
  }

  async createEsgTarget(data: InsertEsgTarget): Promise<EsgTarget> {
    const [t] = await db.insert(esgTargets).values(data).returning();
    return t;
  }

  async updateEsgTarget(id: string, companyId: string, data: Partial<EsgTarget>): Promise<EsgTarget | undefined> {
    const [t] = await db.update(esgTargets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(esgTargets.id, id), eq(esgTargets.companyId, companyId)))
      .returning();
    return t;
  }

  async deleteEsgTarget(id: string, companyId: string): Promise<void> {
    await db.delete(esgTargets)
      .where(and(eq(esgTargets.id, id), eq(esgTargets.companyId, companyId)));
  }

  // ============================================================
  // ESG ACTIONS
  // ============================================================

  async getEsgActions(companyId: string, targetId?: string, riskId?: string): Promise<EsgAction[]> {
    let whereClause: any = eq(esgActions.companyId, companyId);
    if (targetId) whereClause = and(whereClause, eq(esgActions.targetId, targetId));
    if (riskId) whereClause = and(whereClause, eq(esgActions.riskId, riskId));
    return db.select().from(esgActions).where(whereClause).orderBy(desc(esgActions.dueDate));
  }

  async getEsgAction(id: string, companyId: string): Promise<EsgAction | undefined> {
    const [a] = await db.select().from(esgActions)
      .where(and(eq(esgActions.id, id), eq(esgActions.companyId, companyId)));
    return a;
  }

  async createEsgAction(data: InsertEsgAction): Promise<EsgAction> {
    const [a] = await db.insert(esgActions).values(data).returning();
    return a;
  }

  async updateEsgAction(id: string, companyId: string, data: Partial<EsgAction>): Promise<EsgAction | undefined> {
    const [a] = await db.update(esgActions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(esgActions.id, id), eq(esgActions.companyId, companyId)))
      .returning();
    return a;
  }

  async deleteEsgAction(id: string, companyId: string): Promise<void> {
    await db.delete(esgActions)
      .where(and(eq(esgActions.id, id), eq(esgActions.companyId, companyId)));
  }

  // ============================================================
  // ESG RISKS
  // ============================================================

  async getEsgRisks(companyId: string, pillar?: string, riskType?: string): Promise<EsgRisk[]> {
    let whereClause: any = eq(esgRisks.companyId, companyId);
    if (pillar) whereClause = and(whereClause, eq(esgRisks.pillar, pillar as any));
    if (riskType) whereClause = and(whereClause, eq(esgRisks.riskType, riskType as any));
    return db.select().from(esgRisks).where(whereClause)
      .orderBy(desc(esgRisks.riskScore), esgRisks.title);
  }

  async getEsgRisk(id: string, companyId: string): Promise<EsgRisk | undefined> {
    const [r] = await db.select().from(esgRisks)
      .where(and(eq(esgRisks.id, id), eq(esgRisks.companyId, companyId)));
    return r;
  }

  async createEsgRisk(data: InsertEsgRisk): Promise<EsgRisk> {
    const [r] = await db.insert(esgRisks).values(data).returning();
    return r;
  }

  async updateEsgRisk(id: string, companyId: string, data: Partial<EsgRisk>): Promise<EsgRisk | undefined> {
    const [r] = await db.update(esgRisks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(esgRisks.id, id), eq(esgRisks.companyId, companyId)))
      .returning();
    return r;
  }

  async deleteEsgRisk(id: string, companyId: string): Promise<void> {
    await db.delete(esgRisks)
      .where(and(eq(esgRisks.id, id), eq(esgRisks.companyId, companyId)));
  }

  async getIdentityProviders(companyId: string): Promise<IdentityProvider[]> {
    return db.select().from(identityProviders)
      .where(eq(identityProviders.companyId, companyId))
      .orderBy(identityProviders.name);
  }

  async getIdentityProvider(id: string): Promise<IdentityProvider | undefined> {
    const [p] = await db.select().from(identityProviders).where(eq(identityProviders.id, id));
    return p;
  }

  async createIdentityProvider(data: InsertIdentityProvider): Promise<IdentityProvider> {
    const [p] = await db.insert(identityProviders).values(data).returning();
    return p;
  }

  async updateIdentityProvider(id: string, data: Partial<IdentityProvider>): Promise<IdentityProvider | undefined> {
    const [p] = await db.update(identityProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(identityProviders.id, id))
      .returning();
    return p;
  }

  async deleteIdentityProvider(id: string): Promise<void> {
    await db.delete(identityProviders).where(eq(identityProviders.id, id));
  }

  async createDataExportJob(data: InsertDataExportJob): Promise<DataExportJob> {
    const [j] = await db.insert(dataExportJobs).values(data).returning();
    return j;
  }

  async getDataExportJob(id: string): Promise<DataExportJob | undefined> {
    const [j] = await db.select().from(dataExportJobs).where(eq(dataExportJobs.id, id));
    return j;
  }

  async getDataExportJobByToken(token: string): Promise<DataExportJob | undefined> {
    const [j] = await db.select().from(dataExportJobs).where(eq(dataExportJobs.downloadToken, token));
    return j;
  }

  async updateDataExportJob(id: string, data: Partial<DataExportJob>): Promise<DataExportJob | undefined> {
    const [j] = await db.update(dataExportJobs).set(data).where(eq(dataExportJobs.id, id)).returning();
    return j;
  }

  async getDataExportJobs(companyId: string): Promise<DataExportJob[]> {
    return db.select().from(dataExportJobs)
      .where(eq(dataExportJobs.companyId, companyId))
      .orderBy(desc(dataExportJobs.createdAt));
  }

  async getPendingDataExportJobs(limit = 10): Promise<DataExportJob[]> {
    return db.select().from(dataExportJobs)
      .where(eq(dataExportJobs.status, "pending"))
      .orderBy(dataExportJobs.createdAt)
      .limit(limit);
  }

  async cleanupExpiredExportJobs(): Promise<number> {
    const now = new Date();
    const expired = await db.select({ id: dataExportJobs.id }).from(dataExportJobs)
      .where(and(lt(dataExportJobs.expiresAt, now), eq(dataExportJobs.status, "completed")));
    if (expired.length > 0) {
      await db.update(dataExportJobs)
        .set({ fileData: null, status: "expired" })
        .where(lt(dataExportJobs.expiresAt, now));
    }
    return expired.length;
  }

  async createDataDeletionRequest(data: InsertDataDeletionRequest): Promise<DataDeletionRequest> {
    const [r] = await db.insert(dataDeletionRequests).values(data).returning();
    return r;
  }

  async getDataDeletionRequest(id: string): Promise<DataDeletionRequest | undefined> {
    const [r] = await db.select().from(dataDeletionRequests).where(eq(dataDeletionRequests.id, id));
    return r;
  }

  async getDataDeletionRequests(companyId: string): Promise<DataDeletionRequest[]> {
    return db.select().from(dataDeletionRequests)
      .where(eq(dataDeletionRequests.companyId, companyId))
      .orderBy(desc(dataDeletionRequests.createdAt));
  }

  async updateDataDeletionRequest(id: string, data: Partial<DataDeletionRequest>): Promise<DataDeletionRequest | undefined> {
    const [r] = await db.update(dataDeletionRequests).set(data).where(eq(dataDeletionRequests.id, id)).returning();
    return r;
  }

  async anonymiseUser(userId: string): Promise<void> {
    await anonymiseUserRecord(db, userId);
  }

  async deleteCompanyData(companyId: string): Promise<void> {
    const companyUsers = await db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
    for (const u of companyUsers) {
      await this.anonymiseUser(u.id);
    }
    await db.update(companies).set({
      status: "deleted",
      name: `deleted_${companyId}`,
      deletionScheduledAt: new Date(),
    }).where(eq(companies.id, companyId));
  }

  async createUserSession(data: InsertUserSession): Promise<UserSession> {
    const [s] = await db.insert(userSessions).values(data).returning();
    return s;
  }

  async getUserSession(sessionId: string): Promise<UserSession | undefined> {
    const [s] = await db.select().from(userSessions).where(eq(userSessions.sessionId, sessionId));
    return s;
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    return db.select().from(userSessions)
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .orderBy(desc(userSessions.lastSeenAt));
  }

  async updateUserSessionLastSeen(sessionId: string): Promise<void> {
    await db.update(userSessions).set({ lastSeenAt: new Date() }).where(eq(userSessions.sessionId, sessionId));
  }

  async revokeUserSession(sessionId: string): Promise<void> {
    await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.sessionId, sessionId));
  }

  async revokeAllUserSessionsExcept(userId: string, currentSessionId: string): Promise<number> {
    const result = await db.update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        sql`${userSessions.sessionId} != ${currentSessionId}`
      ))
      .returning();
    return result.length;
  }

  async setUserSessionStepUp(sessionId: string): Promise<void> {
    await db.update(userSessions).set({ stepUpAt: new Date() }).where(eq(userSessions.sessionId, sessionId));
  }

  async cleanupExpiredUserSessions(): Promise<number> {
    const result = await db.delete(userSessions)
      .where(lt(userSessions.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  // Portfolio Groups implementation

  async createGroup(data: InsertGroup): Promise<Group> {
    const [g] = await db.insert(groups).values(data).returning();
    return g;
  }

  async getGroupById(id: string): Promise<Group | undefined> {
    const [g] = await db.select().from(groups).where(eq(groups.id, id));
    return g;
  }

  async getGroupsForUser(userId: string): Promise<Group[]> {
    return db.select({ group: groups })
      .from(userGroupRoles)
      .innerJoin(groups, eq(userGroupRoles.groupId, groups.id))
      .where(eq(userGroupRoles.userId, userId))
      .then(rows => rows.map(r => r.group));
  }

  async getGroupCompanies(groupId: string): Promise<Company[]> {
    return db.select({ company: companies })
      .from(groupCompanies)
      .innerJoin(companies, eq(groupCompanies.companyId, companies.id))
      .where(eq(groupCompanies.groupId, groupId))
      .then(rows => rows.map(r => r.company));
  }

  async addCompanyToGroup(groupId: string, companyId: string): Promise<GroupCompany> {
    const [gc] = await db.insert(groupCompanies).values({ groupId, companyId }).returning();
    return gc;
  }

  async removeCompanyFromGroup(groupId: string, companyId: string): Promise<void> {
    await db.delete(groupCompanies).where(
      and(eq(groupCompanies.groupId, groupId), eq(groupCompanies.companyId, companyId))
    );
  }

  async assignUserGroupRole(userId: string, groupId: string, role: string): Promise<UserGroupRole> {
    const typedRole = role as "portfolio_owner" | "portfolio_viewer";
    const [existing] = await db.select().from(userGroupRoles).where(
      and(eq(userGroupRoles.userId, userId), eq(userGroupRoles.groupId, groupId))
    );
    if (existing) {
      const [updated] = await db.update(userGroupRoles)
        .set({ role: typedRole, updatedAt: new Date() })
        .where(and(eq(userGroupRoles.userId, userId), eq(userGroupRoles.groupId, groupId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userGroupRoles).values({ userId, groupId, role: typedRole }).returning();
    return created;
  }

  async removeUserGroupRole(userId: string, groupId: string): Promise<void> {
    await db.delete(userGroupRoles).where(
      and(eq(userGroupRoles.userId, userId), eq(userGroupRoles.groupId, groupId))
    );
  }

  async getUserGroupRoles(userId: string): Promise<UserGroupRole[]> {
    return db.select().from(userGroupRoles).where(eq(userGroupRoles.userId, userId));
  }

  async getGroupsForUserWithRoleContext(userId: string): Promise<Array<Group & { role: string; companyCount: number }>> {
    const rows = await db.select({
      group: groups,
      role: userGroupRoles.role,
      companyCount: count(groupCompanies.id),
    })
      .from(userGroupRoles)
      .innerJoin(groups, eq(userGroupRoles.groupId, groups.id))
      .leftJoin(groupCompanies, eq(groupCompanies.groupId, groups.id))
      .where(eq(userGroupRoles.userId, userId))
      .groupBy(groups.id, userGroupRoles.role);
    return rows.map(r => ({ ...r.group, role: r.role, companyCount: Number(r.companyCount) }));
  }

  async getPortfolioGroupSummary(groupId: string, authorizedCompanyIds: string[]): Promise<{
    totalCompanies: number;
    averageEsgScore: number | null;
    missingDataCount: number;
    overdueUpdatesCount: number;
    reportsReadyCount: number;
    highRiskFlagsCount: number;
  }> {
    if (authorizedCompanyIds.length === 0) {
      return { totalCompanies: 0, averageEsgScore: null, missingDataCount: 0, overdueUpdatesCount: 0, reportsReadyCount: 0, highRiskFlagsCount: 0 };
    }

    // All companies in group visible to this user, via indexed join
    const companiesInGroup = await db.select({ company: companies })
      .from(groupCompanies)
      .innerJoin(companies, eq(groupCompanies.companyId, companies.id))
      .where(
        and(
          eq(groupCompanies.groupId, groupId),
          inArray(groupCompanies.companyId, authorizedCompanyIds)
        )
      );

    const totalCompanies = companiesInGroup.length;
    if (totalCompanies === 0) {
      return { totalCompanies: 0, averageEsgScore: null, missingDataCount: 0, overdueUpdatesCount: 0, reportsReadyCount: 0, highRiskFlagsCount: 0 };
    }

    const companyIds = companiesInGroup.map(r => r.company.id);

    // missingDataCount: unique companies where onboardingComplete is false OR no metric values recorded.
    // Use set union to avoid double-counting companies that satisfy both conditions.
    const notOnboardedRows = await db.select({ id: companies.id })
      .from(companies)
      .where(
        and(
          inArray(companies.id, companyIds),
          eq(companies.onboardingComplete, false)
        )
      );
    const notOnboardedIds = new Set(notOnboardedRows.map(r => r.id));

    const metricsWithValues = await db.selectDistinct({ companyId: metrics.companyId })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(inArray(metrics.companyId, companyIds));
    const companiesWithValues = new Set(metricsWithValues.map(r => r.companyId));

    // Union: not onboarded OR no metric values (avoids double-counting)
    const missingDataIds = new Set([
      ...notOnboardedIds,
      ...companyIds.filter(id => !companiesWithValues.has(id)),
    ]);
    const missingDataCount = missingDataIds.size;

    // overdueUpdatesCount: no metric values updated within staleness window (90 days per existing platform conventions).
    // The platform uses 90-day staleness across all data workflows; we reuse the same window.
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentUpdateCompanies = await db.selectDistinct({ companyId: metrics.companyId })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(
        and(
          inArray(metrics.companyId, companyIds),
          gte(metricValues.submittedAt, cutoff)
        )
      );
    const companiesWithRecentUpdates = new Set(recentUpdateCompanies.map(r => r.companyId));
    const overdueUpdatesCount = companyIds.filter(id => !companiesWithRecentUpdates.has(id)).length;

    // reportsReadyCount: companies with a generated report in the current reporting year.
    // "Current reporting year" = calendar year of today, consistent with existing report run conventions.
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const recentReportCompanies = await db.selectDistinct({ companyId: reportRuns.companyId })
      .from(reportRuns)
      .where(
        and(
          inArray(reportRuns.companyId, companyIds),
          gte(reportRuns.generatedAt, yearStart)
        )
      );
    const reportsReadyCount = recentReportCompanies.length;

    // highRiskFlagsCount: companies with at least one open ESG risk with high or very_high impact AND likelihood.
    // This matches the existing esgRiskImpactEnum and esgRiskLikelihoodEnum definitions.
    const highRiskCompanies = await db.selectDistinct({ companyId: esgRisks.companyId })
      .from(esgRisks)
      .where(
        and(
          inArray(esgRisks.companyId, companyIds),
          eq(esgRisks.status, "open"),
          inArray(esgRisks.impact, ["high", "very_high"]),
          inArray(esgRisks.likelihood, ["high", "very_high"])
        )
      );
    const highRiskFlagsCount = highRiskCompanies.length;

    // averageEsgScore: simple average across companies of each company's average metric value (0–100 range).
    // ESG score = simple average of all valid numeric metric values for each company, then averaged across companies.
    const metricValuesForGroup = await db.select({
      companyId: metrics.companyId,
      value: metricValues.value,
    })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(inArray(metrics.companyId, companyIds));

    const byCompany = new Map<string, number[]>();
    for (const row of metricValuesForGroup) {
      const n = parseFloat(row.value ?? "NaN");
      if (!isNaN(n) && n >= 0 && n <= 100) {
        const arr = byCompany.get(row.companyId) ?? [];
        arr.push(n);
        byCompany.set(row.companyId, arr);
      }
    }
    let esgScoreSum = 0, esgScoreCount = 0;
    for (const vals of byCompany.values()) {
      if (vals.length > 0) {
        esgScoreSum += vals.reduce((a, b) => a + b, 0) / vals.length;
        esgScoreCount++;
      }
    }
    const averageEsgScore = esgScoreCount > 0 ? Math.round((esgScoreSum / esgScoreCount) * 10) / 10 : null;

    return { totalCompanies, averageEsgScore, missingDataCount, overdueUpdatesCount, reportsReadyCount, highRiskFlagsCount };
  }

  async getPortfolioGroupCompanies(groupId: string, authorizedCompanyIds: string[], options: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    search?: string;
    sector?: string;
    status?: string;
    scoreBand?: string;
    alertsOnly?: boolean;
  }): Promise<{ rows: any[]; total: number }> {
    const { page = 1, pageSize = 20, sortBy = "companyName", sortDir = "asc", search, sector, status, scoreBand, alertsOnly } = options;

    if (authorizedCompanyIds.length === 0) return { rows: [], total: 0 };

    // Build DB-level filter conditions (columns available in the companies table)
    const conditions = [
      eq(groupCompanies.groupId, groupId),
      inArray(groupCompanies.companyId, authorizedCompanyIds),
    ];
    if (search) {
      conditions.push(ilike(companies.name, `%${search}%`));
    }
    if (sector) {
      conditions.push(eq(companies.industry, sector));
    }
    if (status === "onboarded") {
      conditions.push(eq(companies.onboardingComplete, true));
    } else if (status === "not_onboarded") {
      conditions.push(eq(companies.onboardingComplete, false));
    }

    // Sort at query layer for DB-sortable fields
    let orderExpr;
    if (sortBy === "companyName") {
      orderExpr = sortDir === "desc" ? desc(companies.name) : asc(companies.name);
    } else if (sortBy === "sector") {
      orderExpr = sortDir === "desc" ? desc(companies.industry) : asc(companies.industry);
    } else {
      orderExpr = asc(companies.name);
    }

    // Fetch all rows matching DB-level conditions (no pagination yet — scoreBand/alertsOnly are post-computed)
    const allRows = await db.select({ company: companies })
      .from(groupCompanies)
      .innerJoin(companies, eq(groupCompanies.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(orderExpr);

    if (allRows.length === 0) return { rows: [], total: 0 };

    const allCompanyIds = allRows.map(r => r.company.id);

    // Batch-fetch last data update per company using aggregate
    const lastUpdateRows = await db.select({
      companyId: metrics.companyId,
      lastUpdate: sql<Date | null>`MAX(${metricValues.submittedAt})`,
    })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(inArray(metrics.companyId, allCompanyIds))
      .groupBy(metrics.companyId);
    const lastUpdateMap = new Map(lastUpdateRows.map(r => [r.companyId, r.lastUpdate]));

    // Batch-fetch alert (open risk) count per company using aggregate
    const alertCountRows = await db.select({
      companyId: esgRisks.companyId,
      alertCount: count(),
    })
      .from(esgRisks)
      .where(
        and(
          inArray(esgRisks.companyId, allCompanyIds),
          eq(esgRisks.status, "open")
        )
      )
      .groupBy(esgRisks.companyId);
    const alertCountMap = new Map(alertCountRows.map(r => [r.companyId, Number(r.alertCount)]));

    // Batch-fetch per-pillar metric values for ESG score computation
    const metricValuesForAll = await db.select({
      companyId: metrics.companyId,
      category: metrics.category,
      value: metricValues.value,
    })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(inArray(metrics.companyId, allCompanyIds));

    // Compute per-company scores
    const scoreData = new Map<string, { env: number[]; social: number[]; gov: number[] }>();
    for (const { companyId, category, value } of metricValuesForAll) {
      const n = parseFloat(value ?? "NaN");
      if (isNaN(n) || n < 0 || n > 100) continue;
      const d = scoreData.get(companyId) ?? { env: [], social: [], gov: [] };
      if (category === "environmental") d.env.push(n);
      else if (category === "social") d.social.push(n);
      else if (category === "governance") d.gov.push(n);
      scoreData.set(companyId, d);
    }

    const mean = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

    // Build all computed rows
    let computedRows = allRows.map(r => {
      const c = r.company;
      const scores = scoreData.get(c.id);
      const envScore = scores ? mean(scores.env) : null;
      const socialScore = scores ? mean(scores.social) : null;
      const govScore = scores ? mean(scores.gov) : null;
      const allVals = [...(scores?.env ?? []), ...(scores?.social ?? []), ...(scores?.gov ?? [])];
      const esgScore = allVals.length > 0 ? mean(allVals) : null;
      const alertCount = alertCountMap.get(c.id) ?? 0;

      return {
        companyId: c.id,
        companyName: c.name,
        sector: c.industry,
        sizeBand: c.revenueBand,
        esgScore,
        environmentalScore: envScore,
        socialScore,
        governanceScore: govScore,
        lastDataUpdate: lastUpdateMap.get(c.id) ?? null,
        reportingStatus: c.onboardingComplete ? "active" : "not_onboarded",
        alertCount,
      };
    });

    // Apply post-computed filters — these affect the total count as they require computed fields
    if (alertsOnly) {
      computedRows = computedRows.filter(r => r.alertCount > 0);
    }

    // scoreBand filter: "high" = esgScore >= 70, "medium" = 40-69, "low" = < 40, "none" = no score
    // Bands represent the platform's standard ESG performance tiers (0–100 scale).
    if (scoreBand) {
      computedRows = computedRows.filter(r => {
        if (scoreBand === "none") return r.esgScore === null;
        if (r.esgScore === null) return false;
        if (scoreBand === "high") return r.esgScore >= 70;
        if (scoreBand === "medium") return r.esgScore >= 40 && r.esgScore < 70;
        if (scoreBand === "low") return r.esgScore < 40;
        return true;
      });
    }

    // If sorting by computed field (esgScore, alertCount), sort after computation
    if (sortBy === "esgScore") {
      computedRows.sort((a, b) => {
        const av = a.esgScore ?? -1;
        const bv = b.esgScore ?? -1;
        return sortDir === "desc" ? bv - av : av - bv;
      });
    } else if (sortBy === "alertCount") {
      computedRows.sort((a, b) => sortDir === "desc" ? b.alertCount - a.alertCount : a.alertCount - b.alertCount);
    }

    const total = computedRows.length;
    const offset = (page - 1) * pageSize;
    const paginatedRows = computedRows.slice(offset, offset + pageSize);

    return { rows: paginatedRows, total };
  }

  async getPortfolioGroupAlerts(groupId: string, authorizedCompanyIds: string[]): Promise<{
    neverOnboarded: Array<{ companyId: string; companyName: string; reason: string }>;
    missingEvidence: Array<{ companyId: string; companyName: string; reason: string }>;
    overdueUpdates: Array<{ companyId: string; companyName: string; reason: string }>;
    noRecentReport: Array<{ companyId: string; companyName: string; reason: string }>;
  }> {
    if (authorizedCompanyIds.length === 0) {
      return { neverOnboarded: [], missingEvidence: [], overdueUpdates: [], noRecentReport: [] };
    }

    // Fetch all companies in the group visible to user — single join query
    const gcRows = await db.select({ company: companies })
      .from(groupCompanies)
      .innerJoin(companies, eq(groupCompanies.companyId, companies.id))
      .where(
        and(
          eq(groupCompanies.groupId, groupId),
          inArray(groupCompanies.companyId, authorizedCompanyIds)
        )
      );

    const allCompanies = gcRows.map(r => r.company);
    const neverOnboarded: Array<{ companyId: string; companyName: string; reason: string }> = [];
    const onboardedCompanies = allCompanies.filter(c => {
      if (!c.onboardingComplete) {
        neverOnboarded.push({ companyId: c.id, companyName: c.name, reason: "Onboarding not completed" });
        return false;
      }
      return true;
    });

    if (onboardedCompanies.length === 0) {
      return { neverOnboarded, missingEvidence: [], overdueUpdates: [], noRecentReport: [] };
    }

    const onboardedIds = onboardedCompanies.map(c => c.id);
    const companyNameMap = new Map(allCompanies.map(c => [c.id, c.name]));

    // Missing evidence: onboarded companies with no approved evidence files (single batch query)
    const approvedEvidenceCompanies = await db.selectDistinct({ companyId: evidenceFiles.companyId })
      .from(evidenceFiles)
      .where(
        and(
          inArray(evidenceFiles.companyId, onboardedIds),
          eq(evidenceFiles.evidenceStatus, "approved")
        )
      );
    const companiesWithApprovedEvidence = new Set(approvedEvidenceCompanies.map(r => r.companyId));
    const missingEvidence = onboardedIds
      .filter(id => !companiesWithApprovedEvidence.has(id))
      .map(id => ({ companyId: id, companyName: companyNameMap.get(id) ?? "", reason: "No approved evidence files" }));

    // Overdue updates: no metric values submitted within staleness window (90 days — platform staleness convention)
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentUpdateCompanies = await db.selectDistinct({ companyId: metrics.companyId })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(
        and(
          inArray(metrics.companyId, onboardedIds),
          gte(metricValues.submittedAt, cutoff)
        )
      );
    const companiesWithRecentUpdates = new Set(recentUpdateCompanies.map(r => r.companyId));
    const overdueUpdates = onboardedIds
      .filter(id => !companiesWithRecentUpdates.has(id))
      .map(id => ({ companyId: id, companyName: companyNameMap.get(id) ?? "", reason: "No metric data submitted in the last 90 days" }));

    // No recent report: no report run in the current calendar year (matches existing platform reporting period logic)
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const recentReportCompanies = await db.selectDistinct({ companyId: reportRuns.companyId })
      .from(reportRuns)
      .where(
        and(
          inArray(reportRuns.companyId, onboardedIds),
          gte(reportRuns.generatedAt, yearStart)
        )
      );
    const companiesWithRecentReports = new Set(recentReportCompanies.map(r => r.companyId));
    const noRecentReport = onboardedIds
      .filter(id => !companiesWithRecentReports.has(id))
      .map(id => ({ companyId: id, companyName: companyNameMap.get(id) ?? "", reason: "No report generated in the current year" }));

    return { neverOnboarded, missingEvidence, overdueUpdates, noRecentReport };
  }

  async getPortfolioGroupActivity(groupId: string, authorizedCompanyIds: string[], limit = 20): Promise<Array<{
    companyId: string;
    companyName: string;
    action: string;
    actor: string | null;
    timestamp: Date;
  }>> {
    if (authorizedCompanyIds.length === 0) return [];

    // Single join query with indexed companyId filter — no N+1
    const logs = await db.select({
      companyId: auditLogs.companyId,
      companyName: companies.name,
      action: auditLogs.action,
      actor: auditLogs.userId,
      timestamp: auditLogs.createdAt,
    })
      .from(auditLogs)
      .innerJoin(companies, eq(auditLogs.companyId, companies.id))
      .where(inArray(auditLogs.companyId, authorizedCompanyIds))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs.map(r => ({
      companyId: r.companyId ?? "",
      companyName: r.companyName,
      action: r.action,
      actor: r.actor ?? null,
      timestamp: r.timestamp ?? new Date(),
    }));
  }

  async createTelemetryEvent(data: InsertTelemetryEvent): Promise<TelemetryEvent> {
    const [event] = await db.insert(telemetryEvents).values(data).returning();
    return event;
  }

  async getTelemetryEvents(filters?: { eventName?: string; companyId?: string; userId?: string; limit?: number }): Promise<TelemetryEvent[]> {
    const conditions = [];
    if (filters?.eventName) conditions.push(eq(telemetryEvents.eventName, filters.eventName));
    if (filters?.companyId) conditions.push(eq(telemetryEvents.companyId, filters.companyId));
    if (filters?.userId) conditions.push(eq(telemetryEvents.userId, filters.userId));

    const query = db.select().from(telemetryEvents);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(telemetryEvents.recordedAt)).limit(filters?.limit ?? 100);
    }
    return query.orderBy(desc(telemetryEvents.recordedAt)).limit(filters?.limit ?? 100);
  }

  async getOnboardingChecklist(companyId: string): Promise<CompanyOnboardingChecklist[]> {
    return db.select().from(companyOnboardingChecklist)
      .where(eq(companyOnboardingChecklist.companyId, companyId))
      .orderBy(companyOnboardingChecklist.displayOrder);
  }

  async createOnboardingChecklistTask(data: InsertOnboardingChecklist): Promise<CompanyOnboardingChecklist> {
    const [task] = await db.insert(companyOnboardingChecklist).values(data).returning();
    return task;
  }

  async updateOnboardingChecklistTask(companyId: string, taskKey: string, data: Partial<CompanyOnboardingChecklist>): Promise<CompanyOnboardingChecklist | undefined> {
    const [updated] = await db.update(companyOnboardingChecklist)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(companyOnboardingChecklist.companyId, companyId),
        eq(companyOnboardingChecklist.taskKey, taskKey),
      ))
      .returning();
    return updated;
  }

  async createAccessGrant(data: InsertAccessGrant): Promise<AccessGrant> {
    const [grant] = await db.insert(accessGrants).values(data).returning();
    return grant;
  }

  async listAccessGrants(filter?: { status?: "active" | "expired" | "revoked" }): Promise<any[]> {
    const now = new Date();
    const rows = await db.execute(sql`
      SELECT
        ag.*,
        c.name AS company_name,
        u.name AS user_name,
        cu.name AS created_by_name
      FROM access_grants ag
      LEFT JOIN companies c ON c.id = ag.company_id
      LEFT JOIN users u ON u.id = ag.user_id
      LEFT JOIN users cu ON cu.id = ag.created_by
      ORDER BY ag.created_at DESC
    `);
    const grants = rows.rows as any[];
    if (!filter?.status) return grants;
    return grants.filter((g) => {
      if (filter.status === "revoked") return g.revoked_at !== null;
      if (filter.status === "active") {
        return g.revoked_at === null && new Date(g.starts_at) <= now && new Date(g.ends_at) > now;
      }
      if (filter.status === "expired") {
        return g.revoked_at === null && new Date(g.ends_at) <= now;
      }
      return true;
    });
  }

  async getAccessGrant(id: string): Promise<AccessGrant | undefined> {
    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.id, id));
    return grant;
  }

  async revokeAccessGrant(id: string): Promise<AccessGrant | undefined> {
    const [grant] = await db.update(accessGrants)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(accessGrants.id, id))
      .returning();
    return grant;
  }
}

export const storage = new DatabaseStorage();
