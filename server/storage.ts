import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users, companies, companySettings, esgPolicies, policyVersions,
  materialTopics, metrics, metricTargets, metricValues, evidenceFiles,
  actionPlans, reportRuns, auditLogs,
  policyGenerationInputs, emissionFactors, carbonCalculations,
  questionnaires, questionnaireQuestions,
  type User, type InsertUser, type Company, type InsertCompany,
  type CompanySettings, type EsgPolicy, type PolicyVersion, type InsertPolicyVersion,
  type MaterialTopic, type Metric, type InsertMetric,
  type MetricTarget, type MetricValue, type InsertMetricValue,
  type EvidenceFile, type ActionPlan, type InsertActionPlan,
  type ReportRun, type AuditLog,
  type PolicyGenerationInput, type InsertPolicyGenerationInput,
  type EmissionFactor, type InsertEmissionFactor,
  type CarbonCalculation, type InsertCarbonCalculation,
  type Questionnaire, type InsertQuestionnaire,
  type QuestionnaireQuestion, type InsertQuestionnaireQuestion,
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

  // Evidence Files
  getEvidenceFiles(companyId: string): Promise<EvidenceFile[]>;
  createEvidenceFile(file: Omit<EvidenceFile, "id" | "uploadedAt">): Promise<EvidenceFile>;

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

  async getEvidenceFiles(companyId: string) {
    return db.select().from(evidenceFiles).where(eq(evidenceFiles.companyId, companyId)).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async createEvidenceFile(file: Omit<EvidenceFile, "id" | "uploadedAt">) {
    const [f] = await db.insert(evidenceFiles).values(file as any).returning();
    return f;
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
}

export const storage = new DatabaseStorage();
