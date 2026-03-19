import { eq, and, desc, sql, lt, isNull, or, count, gte, lte } from "drizzle-orm";
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
  type AuthToken, type InsertAuthToken,
  type User, type InsertUser, type Company, type InsertCompany,
  type CompanySettings, type EsgPolicy, type PolicyVersion, type InsertPolicyVersion,
  type MaterialTopic, type Metric, type InsertMetric,
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
} from "@shared/schema";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

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
  getMetricValuesByPeriod(companyId: string, period: string): Promise<(MetricValue & { metricName: string; category: string; unit: string | null })[]>;
  createMetricValue(value: InsertMetricValue): Promise<MetricValue>;
  updateMetricValue(id: string, data: Partial<MetricValue>): Promise<MetricValue | undefined>;
  lockPeriod(companyId: string, period: string): Promise<void>;

  // Raw Data Inputs
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
  migrateLegacyData(companyId: string, siteId: string, entityTypes: string[]): Promise<Record<string, number>>;

  // Audit Logs
  getNotifications(companyId: string): Promise<Notification[]>;
  getActiveNotifications(companyId: string): Promise<Notification[]>;
  createNotification(n: InsertNotification): Promise<Notification>;
  dismissNotification(id: string, companyId: string, userId: string): Promise<Notification | undefined>;
  dismissAllNotifications(companyId: string, userId: string): Promise<void>;
  deleteNotificationsBySourceKey(sourceKeyPrefix: string, companyId: string): Promise<void>;
  getNotificationBySourceKey(sourceKey: string, companyId: string): Promise<Notification | undefined>;

  getAuditLogs(companyId: string): Promise<AuditLog[]>;
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
  getSitesSummary(companyId: string, period?: string): Promise<Array<{ siteId: string | null; siteName: string; status: string; metricCount: number; evidenceCount: number; questionnaireCount: number }>>;
  getSiteDashboard(siteId: string, companyId: string, period?: string): Promise<any>;

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
  revokeAgentApiKey(id: string): Promise<void>;
  updateAgentApiKeyLastUsed(id: string): Promise<void>;

  // Agent Runs / Actions / Escalations
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

  async updateMetricValue(id: string, data: Partial<MetricValue>) {
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
    const [mv] = await db.execute(sql`
      SELECT count(*)::int AS count FROM metric_values
      WHERE site_id IS NULL AND metric_id IN (SELECT id FROM metrics WHERE company_id = ${companyId})
    `);
    const [rdi] = await db.select({ count: sql<number>`count(*)::int` }).from(rawDataInputs)
      .where(and(eq(rawDataInputs.companyId, companyId), isNull(rawDataInputs.siteId)));
    const [ef] = await db.select({ count: sql<number>`count(*)::int` }).from(evidenceFiles)
      .where(and(eq(evidenceFiles.companyId, companyId), isNull(evidenceFiles.siteId)));
    const [cc] = await db.select({ count: sql<number>`count(*)::int` }).from(carbonCalculations)
      .where(and(eq(carbonCalculations.companyId, companyId), isNull(carbonCalculations.siteId)));
    const [qs] = await db.select({ count: sql<number>`count(*)::int` }).from(questionnaires)
      .where(and(eq(questionnaires.companyId, companyId), isNull(questionnaires.siteId)));
    const mvCount = (mv as any)?.count ?? 0;
    return {
      metric_values: typeof mvCount === "string" ? parseInt(mvCount, 10) : mvCount,
      raw_data_inputs: rdi?.count ?? 0,
      evidence_files: ef?.count ?? 0,
      carbon_calculations: cc?.count ?? 0,
      questionnaires: qs?.count ?? 0,
    };
  }

  async migrateLegacyData(companyId: string, siteId: string, entityTypes: string[]): Promise<Record<string, number>> {
    const updated: Record<string, number> = {};
    if (entityTypes.includes("metric_values")) {
      const result = await db.execute(sql`
        UPDATE metric_values SET site_id = ${siteId}
        WHERE site_id IS NULL AND metric_id IN (SELECT id FROM metrics WHERE company_id = ${companyId})
        RETURNING id
      `);
      updated.metric_values = ((result as any).rows ?? []).length;
    }
    if (entityTypes.includes("raw_data_inputs")) {
      const rows = await db.update(rawDataInputs).set({ siteId }).where(and(eq(rawDataInputs.companyId, companyId), isNull(rawDataInputs.siteId))).returning({ id: rawDataInputs.id });
      updated.raw_data_inputs = rows.length;
    }
    if (entityTypes.includes("evidence_files")) {
      const rows = await db.update(evidenceFiles).set({ siteId }).where(and(eq(evidenceFiles.companyId, companyId), isNull(evidenceFiles.siteId))).returning({ id: evidenceFiles.id });
      updated.evidence_files = rows.length;
    }
    if (entityTypes.includes("carbon_calculations")) {
      const rows = await db.update(carbonCalculations).set({ siteId }).where(and(eq(carbonCalculations.companyId, companyId), isNull(carbonCalculations.siteId))).returning({ id: carbonCalculations.id });
      updated.carbon_calculations = rows.length;
    }
    if (entityTypes.includes("questionnaires")) {
      const rows = await db.update(questionnaires).set({ siteId }).where(and(eq(questionnaires.companyId, companyId), isNull(questionnaires.siteId))).returning({ id: questionnaires.id });
      updated.questionnaires = rows.length;
    }
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

  async getAuditLogs(companyId: string) {
    return db.select().from(auditLogs).where(eq(auditLogs.companyId, companyId)).orderBy(desc(auditLogs.createdAt)).limit(100);
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
      const rp = await db.select().from(reportingPeriods).where(eq(reportingPeriods.id, reportingPeriodId)).limit(1);
      if (rp[0]?.startDate && rp[0]?.endDate) {
        conditions.push(gte(questionnaires.createdAt, rp[0].startDate));
        conditions.push(lte(questionnaires.createdAt, rp[0].endDate));
      }
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

  async revokeAgentApiKey(id: string) {
    await db.update(agentApiKeys).set({ revokedAt: new Date() }).where(eq(agentApiKeys.id, id));
  }

  async updateAgentApiKeyLastUsed(id: string) {
    await db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, id));
  }

  // Agent Runs
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
          AND action IN ('onboarding_complete', 'policy_created', 'policy_adopted', 'metric_entered',
                         'evidence_uploaded', 'report_generated', 'assistant_used', 'login')
        ORDER BY created_at DESC LIMIT 20
      `),
    ]);

    const r = (x: any) => (x as any).rows ?? [];

    return {
      id: company.id,
      name: company.name,
      industry: company.industry,
      country: company.country,
      status: company.status ?? "active",
      planTier: company.planTier ?? "free",
      isBetaCompany: company.isBetaCompany ?? false,
      betaExpiresAt: company.betaExpiresAt ?? null,
      betaGrantedBy: company.betaGrantedBy ?? null,
      onboardingComplete: company.onboardingComplete ?? false,
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
      lastMetricEntry: r(mvR)[0]?.last_entry ?? null,
      lastLogin: r(lastLoginR)[0]?.created_at ?? null,
      users: companyUsers.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role })),
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

  async getSitesSummary(companyId: string, period?: string) {
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
    const [uQqRow] = await db.select({ cnt: count() }).from(questionnaires).where(and(...uQqConds));

    if (Number(uMvRow?.cnt ?? 0) > 0 || Number(uEvRow?.cnt ?? 0) > 0 || Number(uQqRow?.cnt ?? 0) > 0) {
      rows.push({ siteId: null, siteName: "Unassigned", status: "active", metricCount: Number(uMvRow?.cnt ?? 0), evidenceCount: Number(uEvRow?.cnt ?? 0), questionnaireCount: Number(uQqRow?.cnt ?? 0) });
    }

    return rows;
  }

  async getSiteDashboard(siteId: string, companyId: string, period?: string) {
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

    const qqRows = await db.select().from(questionnaires)
      .where(and(eq(questionnaires.companyId, companyId), eq(questionnaires.siteId, siteId)))
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
    const [r] = await db.update(metricDefinitions).set({
      name: data.name,
      description: data.description,
      isCore: data.isCore,
      isActive: data.isActive,
      isDerived: data.isDerived,
      formulaJson: data.formulaJson,
      frameworkTags: data.frameworkTags,
      scoringWeight: data.scoringWeight,
      sortOrder: data.sortOrder,
      evidenceRequired: data.evidenceRequired,
      rollupMethod: data.rollupMethod,
      updatedAt: new Date(),
    }).where(eq(metricDefinitions.id, id)).returning();
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
    const conditions: any[] = [
      eq(metricDefinitionValues.businessId, businessId),
      eq(metricDefinitionValues.metricDefinitionId, metricDefinitionId),
      eq(metricDefinitionValues.reportingPeriodStart, periodStart),
      eq(metricDefinitionValues.reportingPeriodEnd, periodEnd),
    ];
    if (siteId === null) {
      conditions.push(isNull(metricDefinitionValues.siteId));
    } else {
      conditions.push(eq(metricDefinitionValues.siteId, siteId));
    }
    const [existing] = await db.select().from(metricDefinitionValues).where(and(...conditions));
    if (existing) {
      const { valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status, enteredByUserId } = data;
      const [r] = await db.update(metricDefinitionValues)
        .set({ valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status, enteredByUserId, updatedAt: new Date() })
        .where(eq(metricDefinitionValues.id, existing.id))
        .returning();
      return r;
    } else {
      const { valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status, enteredByUserId } = data;
      const [r] = await db.insert(metricDefinitionValues).values({
        businessId, metricDefinitionId, siteId, reportingPeriodStart: periodStart, reportingPeriodEnd: periodEnd,
        valueNumeric, valueText, valueBoolean, valueJson, sourceType, notes, status, enteredByUserId,
      }).returning();
      return r;
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
}

export const storage = new DatabaseStorage();
