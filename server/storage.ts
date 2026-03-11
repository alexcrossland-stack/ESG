import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users, companies, companySettings, esgPolicies, policyVersions,
  materialTopics, metrics, metricTargets, metricValues, evidenceFiles,
  actionPlans, reportRuns, auditLogs, rawDataInputs,
  policyGenerationInputs, emissionFactors, carbonCalculations,
  questionnaires, questionnaireQuestions,
  aiGenerationLogs,
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
  getRawDataByPeriod(companyId: string, period: string): Promise<RawDataInput[]>;
  createRawDataInput(data: InsertRawDataInput): Promise<RawDataInput>;
  updateRawDataInput(id: string, data: Partial<RawDataInput>): Promise<RawDataInput | undefined>;
  upsertRawDataInput(companyId: string, inputName: string, period: string, data: Partial<InsertRawDataInput>): Promise<RawDataInput>;

  // Evidence Files
  getEvidenceFiles(companyId: string): Promise<EvidenceFile[]>;
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
  getReportRuns(companyId: string): Promise<ReportRun[]>;
  createReportRun(report: Omit<ReportRun, "id" | "generatedAt">): Promise<ReportRun>;

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
  getCarbonCalculations(companyId: string): Promise<CarbonCalculation[]>;
  getCarbonCalculation(id: string): Promise<CarbonCalculation | undefined>;
  createCarbonCalculation(calc: InsertCarbonCalculation): Promise<CarbonCalculation>;
  updateCarbonCalculation(id: string, data: Partial<CarbonCalculation>): Promise<CarbonCalculation | undefined>;
  deleteCarbonCalculation(id: string): Promise<void>;

  // Questionnaires
  getQuestionnaires(companyId: string): Promise<Questionnaire[]>;
  getQuestionnaire(id: string): Promise<Questionnaire | undefined>;
  createQuestionnaire(q: InsertQuestionnaire): Promise<Questionnaire>;
  updateQuestionnaire(id: string, data: Partial<Questionnaire>): Promise<Questionnaire | undefined>;
  deleteQuestionnaire(id: string): Promise<void>;
  getQuestionnaireQuestions(questionnaireId: string): Promise<QuestionnaireQuestion[]>;
  createQuestionnaireQuestion(q: InsertQuestionnaireQuestion): Promise<QuestionnaireQuestion>;
  updateQuestionnaireQuestion(id: string, data: Partial<QuestionnaireQuestion>): Promise<QuestionnaireQuestion | undefined>;
  deleteQuestionnaireQuestions(questionnaireId: string): Promise<void>;

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
  updateWorkflowStatus(table: string, id: string, status: string, reviewedBy: string, comment?: string, companyId?: string): Promise<void>;
  getWorkflowPendingItems(companyId: string): Promise<any>;
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

  async getRawDataByPeriod(companyId: string, period: string) {
    return db.select().from(rawDataInputs)
      .where(and(eq(rawDataInputs.companyId, companyId), eq(rawDataInputs.period, period)))
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
    const [existing] = await db.select().from(rawDataInputs)
      .where(and(eq(rawDataInputs.companyId, companyId), eq(rawDataInputs.inputName, inputName), eq(rawDataInputs.period, period)));
    if (existing) {
      const [r] = await db.update(rawDataInputs).set({ ...data, updatedAt: new Date() }).where(eq(rawDataInputs.id, existing.id)).returning();
      return r;
    } else {
      const [r] = await db.insert(rawDataInputs).values({ companyId, inputName, period, ...data } as any).returning();
      return r;
    }
  }

  async getEvidenceFiles(companyId: string) {
    return db.select().from(evidenceFiles).where(eq(evidenceFiles.companyId, companyId)).orderBy(desc(evidenceFiles.uploadedAt));
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

  async getReportRuns(companyId: string) {
    return db.select().from(reportRuns).where(eq(reportRuns.companyId, companyId)).orderBy(desc(reportRuns.generatedAt));
  }

  async createReportRun(report: Omit<ReportRun, "id" | "generatedAt">) {
    const [r] = await db.insert(reportRuns).values(report as any).returning();
    return r;
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
  async getCarbonCalculations(companyId: string) {
    return db.select().from(carbonCalculations).where(eq(carbonCalculations.companyId, companyId)).orderBy(desc(carbonCalculations.createdAt));
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
  async getQuestionnaires(companyId: string) {
    return db.select().from(questionnaires).where(eq(questionnaires.companyId, companyId)).orderBy(desc(questionnaires.createdAt));
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

    await db.execute(
      sql`UPDATE ${sql.raw(table)} SET workflow_status = ${status}, reviewed_by = ${reviewedBy}, reviewed_at = NOW(), review_comment = ${comment || null} WHERE id = ${id}`
    );
  }

  async getWorkflowPendingItems(companyId: string) {
    const pendingMetricValues = await db.execute(
      sql`SELECT mv.id, m.name, mv.period, mv.workflow_status, mv.submitted_by, mv.submitted_at FROM metric_values mv INNER JOIN metrics m ON mv.metric_id = m.id WHERE m.company_id = ${companyId} AND mv.workflow_status = 'submitted'`
    );
    const pendingRawData = await db.execute(
      sql`SELECT id, input_name as name, period, workflow_status, entered_by as submitted_by, created_at as submitted_at FROM raw_data_inputs WHERE company_id = ${companyId} AND workflow_status = 'submitted'`
    );
    const pendingReports = await db.execute(
      sql`SELECT id, period, report_type as name, workflow_status, generated_by as submitted_by, generated_at as submitted_at FROM report_runs WHERE company_id = ${companyId} AND workflow_status = 'submitted'`
    );
    const pendingPolicies = await db.execute(
      sql`SELECT id, title as name, workflow_status, created_at as submitted_at FROM generated_policies WHERE company_id = ${companyId} AND workflow_status = 'submitted'`
    );
    const pendingQuestions = await db.execute(
      sql`SELECT qq.id, qq.question_text as name, qq.workflow_status, qq.created_at as submitted_at FROM questionnaire_questions qq INNER JOIN questionnaires q ON qq.questionnaire_id = q.id WHERE q.company_id = ${companyId} AND qq.workflow_status = 'submitted'`
    );
    return {
      metricValues: pendingMetricValues.rows,
      rawDataInputs: pendingRawData.rows,
      reportRuns: pendingReports.rows,
      generatedPolicies: pendingPolicies.rows,
      questionnaireQuestions: pendingQuestions.rows,
    };
  }
}

export const storage = new DatabaseStorage();
