import { eq, and, desc, sql, lt, isNull, or, count, gte, lte, gt, inArray, asc, ilike, avg } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  assessMetricValueProtectionWithPgClient,
  createCanonicalProtectedValueError,
  createProtectedValueError,
  getCanonicalValueProtectionReason,
  type CanonicalValueProtectionReason,
} from "./value-mutation-protection";
import {
  acquirePeriodMutationLocks,
  dataEntryPeriodMonths,
  findLockedPeriodsInTransaction,
  reportingMonthsForMonthBounds,
  reportingMonthBounds,
} from "./period-locks";
import {
  pgTimestampWithoutTimeZoneToUtc,
  toCanonicalPgTimestamp,
} from "./canonical-reporting-date";
import {
  users, companies, companySettings, esgPolicies, policyVersions,
  materialTopics, metrics, metricTargets, metricValues, evidenceFiles,
  actionPlans, reportRuns, auditLogs, rawDataInputs, dataEntryPeriodLocks,
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
  frameworks, frameworkRequirements, metricFrameworkMappings, businessFrameworkSelections, frameworkRequirementResponses,
  type Framework, type InsertFramework,
  type FrameworkRequirement, type InsertFrameworkRequirement,
  type MetricFrameworkMapping, type InsertMetricFrameworkMapping,
  type BusinessFrameworkSelection, type InsertBusinessFrameworkSelection,
  type FrameworkRequirementResponse,
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
import { isPlatformSuperAdmin } from "./permissions";
import {
  ACTION_PLAN_MUTABLE_FIELDS,
  COMPANY_SETTINGS_MUTABLE_FIELDS,
  ESG_ACTION_MUTABLE_FIELDS,
  ESG_RISK_MUTABLE_FIELDS,
  ESG_TARGET_MUTABLE_FIELDS,
  GENERATED_POLICY_MUTABLE_FIELDS,
  GOVERNANCE_ASSIGNMENT_MUTABLE_FIELDS,
  IDENTITY_PROVIDER_MUTABLE_FIELDS,
  MATERIALITY_ASSESSMENT_MUTABLE_FIELDS,
  MATERIAL_TOPIC_MUTABLE_FIELDS,
  METRIC_MUTABLE_FIELDS,
  POLICY_RECORD_MUTABLE_FIELDS,
  POLICY_TEMPLATE_MUTABLE_FIELDS,
  QUESTIONNAIRE_MUTABLE_FIELDS,
  QUESTIONNAIRE_QUESTION_MUTABLE_FIELDS,
  pickMutableFields,
} from "./mutation-field-allowlists";
import {
  evaluateFrameworkRequirement,
  frameworkResponseSourceIsEligible,
  isUsableEvidenceStatus,
  normalizeFrameworkMetricName,
  parseFrameworkReadinessPeriod,
  type FrameworkMetricFact,
  type FrameworkRequirementEvidenceFact,
  type FrameworkRequirementResponseFact,
  type FrameworkReadinessScope,
} from "./framework-readiness";
import {
  METRIC_DEFINITION_CATALOGUE_LOCK_KEY,
  normalizeMetricDefinitionName,
  validateActiveMetricDefinitionCatalogue,
} from "./admin-metric-definition-validation";

export type MetricValueScope =
  | { scope: "all" }
  | { scope: "organisation" }
  | { scope: "site"; siteId: string };

export type CanonicalCalculationMutationResult = {
  outcome: "created" | "updated" | "unchanged" | "cleared" | "missing" | "protected";
  value: MetricDefinitionValue | null;
  reason?: CanonicalValueProtectionReason;
};

export type CanonicalRollupResult = CanonicalCalculationMutationResult & {
  rollupValue: number | null;
};

export type MetricDefinitionCatalogueMutation =
  | { type: "create"; data: InsertMetricDefinition }
  | { type: "update"; id: string; data: Partial<MetricDefinition> }
  | { type: "toggle_active"; id: string };

export type MetricDefinitionSeedReservation = {
  code: string;
  name: string;
};

export type MetricDefinitionCatalogueMutationResult =
  | { outcome: "created"; definition: MetricDefinition }
  | { outcome: "updated"; definition: MetricDefinition; previous: MetricDefinition }
  | { outcome: "invalid"; errors: string[] }
  | { outcome: "duplicate_code" }
  | { outcome: "duplicate_name" }
  | { outcome: "reserved_code" }
  | { outcome: "seed_name_immutable" }
  | { outcome: "not_found" };

const CANONICAL_VALUE_FIELDS = [
  "valueNumeric",
  "valueText",
  "valueBoolean",
  "valueJson",
  "sourceType",
  "notes",
] as const;

function canonicalJsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => canonicalJsonEqual(value, right[index]));
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every((key) => canonicalJsonEqual(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function canonicalDecimalString(value: unknown): string | null {
  const match = String(value).trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const isZero = whole === "0" && fraction.length === 0;
  const sign = match[1] === "-" && !isZero ? "-" : "";
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

function canonicalFieldEqual(field: typeof CANONICAL_VALUE_FIELDS[number], left: unknown, right: unknown): boolean {
  if (field === "valueNumeric") {
    if (left === null || left === undefined || left === "") return right === null || right === undefined || right === "";
    if (right === null || right === undefined || right === "") return false;
    const leftDecimal = canonicalDecimalString(left);
    const rightDecimal = canonicalDecimalString(right);
    return leftDecimal !== null && leftDecimal === rightDecimal;
  }
  if (field === "valueJson") return canonicalJsonEqual(left ?? null, right ?? null);
  return (left ?? null) === (right ?? null);
}

function canonicalNextValue(
  existing: MetricDefinitionValue,
  data: Partial<InsertMetricDefinitionValue> | Partial<MetricDefinitionValue>,
): MetricDefinitionValue {
  const next = { ...existing };
  for (const field of CANONICAL_VALUE_FIELDS) {
    if (data[field] !== undefined) (next as any)[field] = data[field] ?? null;
  }
  return next;
}

function canonicalMutableValuesEqual(left: MetricDefinitionValue, right: MetricDefinitionValue): boolean {
  return CANONICAL_VALUE_FIELDS.every((field) => canonicalFieldEqual(field, left[field], right[field]));
}

export type MetricTrendValueRow = MetricValue & {
  companyId: string;
  metricName: string;
  category: string;
  unit: string | null;
  metricType: string | null;
  direction: string | null;
  enabled: boolean | null;
};

export type WorkflowEntityType =
  | "metric_value"
  | "raw_data"
  | "report"
  | "generated_policy"
  | "questionnaire_question";

export type WorkflowStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

export type WorkflowSubmitOutcome = "submitted" | "already_submitted" | "already_approved" | "ineligible" | "not_found";

export interface WorkflowSubmitItem {
  entityType: WorkflowEntityType;
  entityId: string;
}

export interface WorkflowSubmitResult {
  requested: number;
  unique: number;
  duplicates: number;
  submitted: number;
  alreadySubmitted: number;
  alreadyApproved: number;
  ineligible: number;
  notFound: number;
  results: Array<WorkflowSubmitItem & { outcome: WorkflowSubmitOutcome; currentStatus?: WorkflowStatus }>;
}

export type WorkflowReviewResult =
  | { outcome: "reviewed"; entityType: WorkflowEntityType; entityId: string; status: "approved" | "rejected" }
  | { outcome: "not_submitted"; entityType: WorkflowEntityType; entityId: string; currentStatus: WorkflowStatus }
  | { outcome: "not_found"; entityType: WorkflowEntityType; entityId: string };

export interface WorkflowBulkReviewResult {
  requested: number;
  unique: number;
  duplicates: number;
  reviewed: number;
  notSubmitted: number;
  notFound: number;
  results: WorkflowReviewResult[];
}

export type WorkflowReviseResult =
  | { outcome: "revised"; entityType: "metric_value" | "raw_data"; entityId: string; status: "draft" }
  | { outcome: "not_rejected"; entityType: "metric_value" | "raw_data"; entityId: string; currentStatus: WorkflowStatus }
  | { outcome: "not_found"; entityType: "metric_value" | "raw_data"; entityId: string };

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Session-level calculation gates must never consume clients from the pool
// used by the callback's Drizzle queries. Keeping these clients in a small,
// dedicated pool prevents N concurrent calculations from holding all N work
// connections while each waits for one more connection to finish its run.
export const calculationLockPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  application_name: "simplyesg-calculation-locks",
});
export const db = drizzle(pool);

function metricDefinitionInsertValues(data: InsertMetricDefinition) {
  return {
    code: data.code,
    name: data.name,
    pillar: data.pillar,
    category: data.category,
    description: data.description ?? null,
    dataType: data.dataType ?? "numeric" as const,
    unit: data.unit ?? null,
    inputFrequency: data.inputFrequency ?? "quarterly" as const,
    isCore: data.isCore ?? true,
    isActive: data.isActive ?? true,
    isDerived: data.isDerived ?? false,
    formulaJson: data.formulaJson ?? null,
    frameworkTags: data.frameworkTags ?? null,
    scoringWeight: data.scoringWeight ?? "1",
    sortOrder: data.sortOrder ?? 0,
    evidenceRequired: data.evidenceRequired ?? false,
    rollupMethod: data.rollupMethod ?? "sum" as const,
  };
}

function metricDefinitionUpdateFields(data: Partial<MetricDefinition>): Record<string, any> {
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
  return updateFields;
}


function pgRowToCamelCase<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, val]) => [
      key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()),
      // Drizzle treats PostgreSQL `timestamp without time zone` values as UTC,
      // while node-postgres raw clients parse the same wall clock in the
      // process timezone. Rebuild raw Date values from their local calendar
      // components so raw transactional paths return the same instant as the
      // normal Drizzle reads (and optimistic versions compare consistently).
      val instanceof Date
        ? pgTimestampWithoutTimeZoneToUtc(val)
        : val,
    ]),
  ) as unknown as T;
}

function storageError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function normalizeWorkflowStatus(value: unknown): WorkflowStatus {
  if (value === "submitted" || value === "approved" || value === "rejected" || value === "archived") {
    return value;
  }
  return "draft";
}

function workflowTable(entityType: WorkflowEntityType): string {
  const tables: Record<WorkflowEntityType, string> = {
    metric_value: "metric_values",
    raw_data: "raw_data_inputs",
    report: "report_runs",
    generated_policy: "generated_policies",
    questionnaire_question: "questionnaire_questions",
  };
  return tables[entityType];
}

async function selectOwnedWorkflowRowsForUpdate(
  client: pg.PoolClient,
  entityType: WorkflowEntityType,
  entityIds: string[],
  companyId: string,
): Promise<Map<string, WorkflowStatus>> {
  if (entityIds.length === 0) return new Map();

  let query: string;
  switch (entityType) {
    case "metric_value":
      query = `
        SELECT mv.id, COALESCE(mv.workflow_status, 'draft') AS workflow_status
        FROM metric_values mv
        INNER JOIN metrics m ON m.id = mv.metric_id
        WHERE mv.id = ANY($1::varchar[]) AND m.company_id = $2
        ORDER BY mv.id
        FOR UPDATE OF mv
      `;
      break;
    case "questionnaire_question":
      query = `
        SELECT qq.id, COALESCE(qq.workflow_status, 'draft') AS workflow_status
        FROM questionnaire_questions qq
        INNER JOIN questionnaires q ON q.id = qq.questionnaire_id
        WHERE qq.id = ANY($1::varchar[]) AND q.company_id = $2
        ORDER BY qq.id
        FOR UPDATE OF qq
      `;
      break;
    default:
      query = `
        SELECT id, COALESCE(workflow_status, 'draft') AS workflow_status
        FROM ${workflowTable(entityType)}
        WHERE id = ANY($1::varchar[]) AND company_id = $2
        ORDER BY id
        FOR UPDATE
      `;
  }

  const result = await client.query(query, [entityIds, companyId]);
  return new Map(result.rows.map((row: { id: string; workflow_status: unknown }) => [
    String(row.id),
    normalizeWorkflowStatus(row.workflow_status),
  ]));
}

async function insertWorkflowAudit(
  client: pg.PoolClient,
  input: {
    companyId: string;
    userId: string;
    action: string;
    entityType: WorkflowEntityType;
    entityId: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [input.companyId, input.userId, input.action, input.entityType, input.entityId, JSON.stringify(input.details)],
  );
}

async function acquireUnlockedReportingRange(
  client: any,
  companyId: string,
  startMonth: string,
  endMonth: string,
  options: { calculationRunLockHeld?: boolean } = {},
): Promise<string[]> {
  let months: string[];
  try {
    months = reportingMonthsForMonthBounds(startMonth, endMonth);
  } catch (error) {
    if (error instanceof RangeError) throw storageError(400, error.message);
    throw error;
  }
  await acquirePeriodMutationLocks(client, companyId, months, options);
  const lockedPeriods = await findLockedPeriodsInTransaction(client, companyId, months);
  if (lockedPeriods.length > 0) {
    throw storageError(400, `This reporting range includes locked period${lockedPeriods.length === 1 ? "" : "s"}: ${lockedPeriods.join(", ")}`);
  }
  return months;
}

async function validatePersistedReportingRange(
  startDate: Date,
  endDate: Date,
): Promise<string[]> {
  const result = await pool.query<{ start_month: string; end_month: string }>(
    `SELECT
       to_char($1::timestamp, 'YYYY-MM') AS start_month,
       to_char($2::timestamp, 'YYYY-MM') AS end_month`,
    [startDate, endDate],
  );
  const bounds = result.rows[0];
  if (!bounds) throw storageError(400, "Reporting period dates are required");
  try {
    // Validate the same calendar months PostgreSQL will persist for its
    // timestamp-without-time-zone columns. UTC getters can disagree with that
    // representation at a process-timezone month boundary.
    return reportingMonthsForMonthBounds(bounds.start_month, bounds.end_month);
  } catch (error) {
    if (error instanceof RangeError) throw storageError(400, error.message);
    throw error;
  }
}

async function assertUniqueReportingPeriod(
  tx: any,
  data: Pick<InsertReportingPeriod, "companyId" | "name" | "periodType" | "startDate" | "endDate">,
): Promise<void> {
  // Reporting periods are intentionally allowed to overlap (for example an
  // annual period alongside its quarters). This tenant-scoped lock closes the
  // retry/concurrency race only for duplicate names or identical period keys.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`reporting-period:create:${data.companyId}`}, 0))`);
  const [duplicate] = await tx.select({ id: reportingPeriods.id })
    .from(reportingPeriods)
    .where(and(
      eq(reportingPeriods.companyId, data.companyId),
      or(
        sql`lower(btrim(${reportingPeriods.name})) = lower(btrim(${data.name}))`,
        and(
          eq(reportingPeriods.periodType, data.periodType),
          eq(reportingPeriods.startDate, data.startDate),
          eq(reportingPeriods.endDate, data.endDate),
        ),
      ),
    ))
    .limit(1);
  if (duplicate) {
    throw storageError(409, "A reporting period with this name or exact date range already exists");
  }
}

function localCalendarDateKey(value: Date | string): string {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function utcCalendarDateKey(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
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
  updateMetric(id: string, companyId: string, data: Partial<Metric>): Promise<Metric | undefined>;
  getMetricTarget(metricId: string): Promise<MetricTarget | undefined>;
  upsertMetricTarget(metricId: string, targetValue: string, targetYear: number): Promise<MetricTarget>;

  // Metric Values
  getMetricValuesForMetric(companyId: string, metricId: string, scope: MetricValueScope): Promise<MetricValue[]>;
  getMetricValueForPeriodSite(metricId: string, period: string, siteId: string | null): Promise<MetricValue | undefined>;
  getMetricValuesByPeriod(companyId: string, period: string, siteId?: string | null): Promise<(MetricValue & { metricName: string; category: string; unit: string | null })[]>;
  getMetricTrendValues(companyId: string, periods: string[], scope: MetricValueScope): Promise<MetricTrendValueRow[]>;
  hasAnyData(companyId: string): Promise<boolean>;
  countEstimatedValues(companyId: string): Promise<number>;
  createMetricValue(value: InsertMetricValue): Promise<MetricValue>;
  updateMetricValue(id: string, data: Partial<MetricValue>): Promise<MetricValue | undefined>;
  upsertMetricValue(value: InsertMetricValue, options?: { calculationRunLockHeld?: boolean }): Promise<MetricValue>;
  promoteMetricValueToEvidenced(companyId: string, metricValueId: string, expectedSubmittedAt: Date | string | null): Promise<MetricValue>;
  lockPeriod(companyId: string, period: string, userId?: string | null): Promise<void>;
  isPeriodLocked(companyId: string, period: string): Promise<boolean>;

  // Raw Data Inputs
  // RawDataInput / InsertRawDataInput include estimation fields added in Task #56:
  // estimateMethod, estimateConfidence, estimateBasisJson, isUserReviewed, lastEstimatedAt
  getRawDataByPeriod(companyId: string, period: string, siteId?: string | null): Promise<RawDataInput[]>;
  createRawDataInput(data: InsertRawDataInput): Promise<RawDataInput>;
  updateRawDataInput(id: string, data: Partial<RawDataInput>): Promise<RawDataInput | undefined>;
  upsertRawDataInput(companyId: string, inputName: string, period: string, data: Partial<InsertRawDataInput>): Promise<RawDataInput>;
  deleteRawDataInput(companyId: string, inputName: string, period: string, siteId: string | null): Promise<void>;

  // Evidence Files
  getEvidenceFiles(companyId: string, siteId?: string | null, period?: string): Promise<EvidenceFile[]>;
  getEvidenceByEntity(companyId: string, linkedModule: string, linkedEntityId: string, siteId?: string | null): Promise<EvidenceFile[]>;
  getEvidenceCoverage(companyId: string, period?: string, siteId?: string | null): Promise<any>;
  createEvidenceFile(file: Omit<EvidenceFile, "id" | "uploadedAt" | "reviewedBy" | "reviewedAt">): Promise<EvidenceFile>;
  updateEvidenceFile(id: string, data: Partial<EvidenceFile>): Promise<EvidenceFile | undefined>;
  deleteEvidenceFile(id: string): Promise<void>;
  deleteEvidenceFileForCompany(id: string, companyId: string): Promise<boolean>;

  // Action Plans
  getActionPlans(companyId: string): Promise<ActionPlan[]>;
  getActionPlan(id: string): Promise<ActionPlan | undefined>;
  createActionPlan(plan: InsertActionPlan): Promise<ActionPlan>;
  updateActionPlan(id: string, companyId: string, data: Partial<ActionPlan>): Promise<ActionPlan | undefined>;
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
  getFrameworkRequirement(id: string): Promise<FrameworkRequirement | undefined>;
  getFrameworkRequirements(frameworkId: string): Promise<FrameworkRequirement[]>;
  getAllFrameworkRequirements(): Promise<FrameworkRequirement[]>;
  getMetricFrameworkMappings(metricDefinitionId: string): Promise<MetricFrameworkMapping[]>;
  getMappingsForRequirement(frameworkRequirementId: string): Promise<MetricFrameworkMapping[]>;
  getAllMappings(): Promise<MetricFrameworkMapping[]>;
  getBusinessFrameworkSelections(businessId: string): Promise<BusinessFrameworkSelection[]>;
  upsertBusinessFrameworkSelection(businessId: string, frameworkId: string, isEnabled: boolean): Promise<BusinessFrameworkSelection>;
  getFrameworkRequirementResponses(companyId: string, filters?: { frameworkRequirementId?: string; period?: string; siteId?: string | null }): Promise<FrameworkRequirementResponse[]>;
  getFrameworkRequirementResponse(id: string, companyId: string): Promise<FrameworkRequirementResponse | undefined>;
  upsertFrameworkRequirementResponse(input: {
    companyId: string;
    frameworkRequirementId: string;
    period: string;
    siteId: string | null;
    responseText: string | null;
    linkedEntityType: "policy" | "target" | "risk" | null;
    linkedEntityId: string | null;
    workflowStatus: "draft" | "submitted";
    actorUserId: string;
  }): Promise<FrameworkRequirementResponse>;
  reviewFrameworkRequirementResponse(id: string, companyId: string, input: {
    workflowStatus: "approved" | "rejected";
    reviewComment?: string | null;
    reviewerUserId: string;
  }): Promise<FrameworkRequirementResponse | undefined>;
  getFrameworkReadiness(businessId: string, filters?: { period?: string; siteId?: string | null; frameworkCodes?: string[] }): Promise<any>;
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
  getAllAuditLogs(limit?: number, filters?: { action?: string; actorType?: string; outcome?: string }): Promise<AuditLog[]>;
  queryAuditLogs(filters: { companyId?: string; userId?: string; entityType?: string; action?: string; outcome?: string; dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<AuditLog[]>;
  createAuditLog(log: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog>;

  // Dashboard
  getDashboardData(companyId: string): Promise<any>;

  // Policy Generation
  createPolicyGenerationInput(data: InsertPolicyGenerationInput): Promise<PolicyGenerationInput>;
  getPolicyGenerationInputs(companyId: string): Promise<PolicyGenerationInput[]>;
  updatePolicyGenerationInput(id: string, data: Partial<PolicyGenerationInput>): Promise<PolicyGenerationInput | undefined>;

  // Emission Factors
  getEmissionFactors(country?: string, factorYear?: number): Promise<EmissionFactor[]>;
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
  getQuestionnaire(id: string, companyId: string): Promise<Questionnaire | undefined>;
  createQuestionnaire(q: InsertQuestionnaire): Promise<Questionnaire>;
  createQuestionnaireWithQuestions(
    q: InsertQuestionnaire,
    questions: Array<Omit<InsertQuestionnaireQuestion, "questionnaireId">>,
  ): Promise<{ questionnaire: Questionnaire; questions: QuestionnaireQuestion[] }>;
  updateQuestionnaire(id: string, companyId: string, data: Partial<Questionnaire>): Promise<Questionnaire | undefined>;
  deleteQuestionnaire(id: string, companyId: string): Promise<boolean>;
  getQuestionnaireQuestions(questionnaireId: string): Promise<QuestionnaireQuestion[]>;
  createQuestionnaireQuestion(q: InsertQuestionnaireQuestion): Promise<QuestionnaireQuestion>;
  updateQuestionnaireQuestion(
    id: string,
    questionnaireId: string,
    companyId: string,
    data: Partial<QuestionnaireQuestion>,
  ): Promise<QuestionnaireQuestion | undefined>;
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
  updateGeneratedPolicy(
    id: string,
    companyId: string,
    data: Partial<GeneratedPolicy>,
    options?: { approveTransition?: boolean },
  ): Promise<GeneratedPolicy | undefined>;
  deleteGeneratedPolicy(id: string): Promise<void>;

  // AI Generation Logs
  createAiGenerationLog(log: InsertAiGenerationLog): Promise<AiGenerationLog>;
  getAiGenerationLogs(companyId: string, entityType?: string, entityId?: string): Promise<AiGenerationLog[]>;

  // Workflow
  submitWorkflowItems(items: WorkflowSubmitItem[], companyId: string, userId: string): Promise<WorkflowSubmitResult>;
  submitWorkflowEntities(entityType: WorkflowEntityType, entityIds: string[], companyId: string, userId: string): Promise<WorkflowSubmitResult>;
  reviewWorkflowEntity(entityType: WorkflowEntityType, entityId: string, action: "approve" | "reject", companyId: string, userId: string, comment?: string): Promise<WorkflowReviewResult>;
  bulkReviewWorkflowEntities(items: Array<{ entityType: WorkflowEntityType; entityId: string }>, action: "approve" | "reject", companyId: string, userId: string, comment?: string): Promise<WorkflowBulkReviewResult>;
  reviseWorkflowEntity(entityType: "metric_value" | "raw_data", entityId: string, companyId: string, userId: string): Promise<WorkflowReviseResult>;
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
  copyForwardPeriod(sourcePeriodId: string, companyId: string, newPeriodData: InsertReportingPeriod): Promise<{
    period: ReportingPeriod;
    copiedMetrics: number;
    copiedActions: number;
    carriedForwardMetrics: number;
    carriedForwardActions: number;
  }>;
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
  adminListCompanies(search?: string, page?: number, pageSize?: number, statusFilter?: string, planFilter?: string): Promise<{ companies: any[]; total: number }>;
  adminListUsers(search?: string, page?: number, pageSize?: number, roleFilter?: string, companyStatusFilter?: string): Promise<{ users: any[]; total: number }>;
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
  mutateMetricDefinitionCatalogue(
    mutation: MetricDefinitionCatalogueMutation,
    seedReservations: readonly MetricDefinitionSeedReservation[],
  ): Promise<MetricDefinitionCatalogueMutationResult>;

  // Metric Definition Values
  getMetricDefinitionValues(businessId: string, filters?: { metricDefinitionId?: string; siteId?: string | null; periodStart?: Date; periodEnd?: Date }): Promise<MetricDefinitionValue[]>;
  getMetricDefinitionValuesExact(businessId: string, siteId: string | null, periodStart: Date, periodEnd: Date): Promise<MetricDefinitionValue[]>;
  getMetricDefinitionValueById(id: string, businessId: string): Promise<MetricDefinitionValue | undefined>;
  createMetricDefinitionValue(data: InsertMetricDefinitionValue): Promise<MetricDefinitionValue>;
  updateMetricDefinitionValue(id: string, businessId: string, data: Partial<MetricDefinitionValue>): Promise<MetricDefinitionValue | undefined>;
  upsertMetricDefinitionValue(businessId: string, metricDefinitionId: string, siteId: string | null, periodStart: Date, periodEnd: Date, data: Partial<InsertMetricDefinitionValue>): Promise<MetricDefinitionValue>;
  upsertCalculatedMetricDefinitionValue(businessId: string, metricDefinitionId: string, siteId: string | null, periodStart: Date, periodEnd: Date, valueNumeric: string): Promise<CanonicalCalculationMutationResult>;
  clearCalculatedMetricDefinitionValue(businessId: string, metricDefinitionId: string, siteId: string | null, periodStart: Date, periodEnd: Date): Promise<CanonicalCalculationMutationResult>;
  transitionMetricDefinitionValue(id: string, businessId: string, actorUserId: string, action: "submit" | "approve" | "reject" | "revise", comment?: string | null): Promise<MetricDefinitionValue | undefined>;
  rollupSiteValuesToCompany(businessId: string, metricDefinitionId: string, periodStart: Date, periodEnd: Date): Promise<CanonicalRollupResult>;

  // Metric Evidence
  getMetricEvidence(metricValueId: string): Promise<MetricEvidence[]>;
  getMetricEvidenceById(id: string, businessId: string): Promise<MetricEvidence | undefined>;
  createMetricEvidence(data: InsertMetricEvidence): Promise<MetricEvidence>;
  createLegacyMetricEvidence(businessId: string, data: InsertMetricEvidence): Promise<MetricEvidence>;
  createCanonicalMetricEvidence(businessId: string, data: InsertMetricEvidence): Promise<MetricEvidence>;
  deleteMetricEvidence(id: string): Promise<void>;
  deleteLegacyMetricEvidence(id: string, businessId: string): Promise<boolean>;
  deleteCanonicalMetricEvidence(id: string, businessId: string): Promise<boolean>;

  // Metric Calculation Runs
  createMetricCalculationRun(data: InsertMetricCalculationRun): Promise<MetricCalculationRun>;
  updateMetricCalculationRun(id: string, data: Partial<MetricCalculationRun>): Promise<MetricCalculationRun | undefined>;
  getMetricCalculationRuns(businessId: string, metricDefinitionId?: string): Promise<MetricCalculationRun[]>;

  // Materiality Assessments
  getMaterialTopic(id: string): Promise<MaterialTopic | undefined>;
  upsertMaterialTopicScores(id: string, companyId: string, data: Partial<MaterialTopic>): Promise<MaterialTopic | undefined>;
  seedDefaultMaterialTopics(companyId: string): Promise<void>;
  getMaterialityAssessments(companyId: string): Promise<BusinessMaterialityAssessment[]>;
  createMaterialityAssessment(data: InsertBusinessMaterialityAssessment, actorUserId?: string): Promise<BusinessMaterialityAssessment>;
  updateMaterialityAssessment(
    id: string,
    companyId: string,
    data: Partial<BusinessMaterialityAssessment>,
    actorUserId?: string,
  ): Promise<BusinessMaterialityAssessment | undefined>;

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
  updateIdentityProvider(id: string, companyId: string, data: Partial<IdentityProvider>): Promise<IdentityProvider | undefined>;
  deleteIdentityProvider(id: string, companyId: string): Promise<void>;

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
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
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
    const mutable = pickMutableFields(data, COMPANY_SETTINGS_MUTABLE_FIELDS) as Partial<CompanySettings>;
    const existing = await this.getCompanySettings(companyId);
    if (existing) {
      const [s] = await db.update(companySettings).set(mutable).where(eq(companySettings.companyId, companyId)).returning();
      return s;
    } else {
      const [s] = await db.insert(companySettings).values({ ...mutable, companyId } as any).returning();
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

  async updateMetric(id: string, companyId: string, data: Partial<Metric>) {
    const mutable = pickMutableFields(data, METRIC_MUTABLE_FIELDS) as Partial<Metric>;
    const [m] = await db.update(metrics).set(mutable)
      .where(and(eq(metrics.id, id), eq(metrics.companyId, companyId)))
      .returning();
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

  async getMetricValuesForMetric(companyId: string, metricId: string, scope: MetricValueScope) {
    const conditions: any[] = [
      eq(metricValues.metricId, metricId),
      sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId})`,
    ];
    if (scope.scope === "organisation") {
      conditions.push(isNull(metricValues.siteId));
    } else if (scope.scope === "site") {
      conditions.push(eq(metricValues.siteId, scope.siteId));
    }
    return db.select().from(metricValues).where(and(...conditions)).orderBy(desc(metricValues.period));
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

  async getMetricValuesByPeriod(companyId: string, period: string, siteId?: string | null) {
    const conditions: any[] = [eq(metrics.companyId, companyId), eq(metricValues.period, period)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, siteId));
    }

    const result = await db
      .select({
        id: metricValues.id,
        metricId: metricValues.metricId,
        period: metricValues.period,
        value: metricValues.value,
        valueNumeric: metricValues.valueNumeric,
        valueText: metricValues.valueText,
        valueBoolean: metricValues.valueBoolean,
        valueJson: metricValues.valueJson,
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
      .where(and(...conditions));
    return result as any[];
  }

  async getMetricTrendValues(companyId: string, periods: string[], scope: MetricValueScope): Promise<MetricTrendValueRow[]> {
    const uniquePeriods = Array.from(new Set(periods.filter(Boolean)));
    if (uniquePeriods.length === 0) return [];

    const conditions: any[] = [
      eq(metrics.companyId, companyId),
      eq(metrics.enabled, true),
      inArray(metricValues.period, uniquePeriods),
    ];
    if (scope.scope === "organisation") {
      conditions.push(isNull(metricValues.siteId));
    } else if (scope.scope === "site") {
      conditions.push(eq(metricValues.siteId, scope.siteId));
    }

    const result = await db
      .select({
        id: metricValues.id,
        metricId: metricValues.metricId,
        period: metricValues.period,
        value: metricValues.value,
        previousValue: metricValues.previousValue,
        targetValue: metricValues.targetValue,
        status: metricValues.status,
        percentChange: metricValues.percentChange,
        submittedBy: metricValues.submittedBy,
        submittedAt: metricValues.submittedAt,
        notes: metricValues.notes,
        locked: metricValues.locked,
        dataSourceType: metricValues.dataSourceType,
        workflowStatus: metricValues.workflowStatus,
        reviewedBy: metricValues.reviewedBy,
        reviewedAt: metricValues.reviewedAt,
        reviewComment: metricValues.reviewComment,
        reportingPeriodId: metricValues.reportingPeriodId,
        siteId: metricValues.siteId,
        metricDefinitionId: metricValues.metricDefinitionId,
        reportingPeriodStart: metricValues.reportingPeriodStart,
        reportingPeriodEnd: metricValues.reportingPeriodEnd,
        valueNumeric: metricValues.valueNumeric,
        valueText: metricValues.valueText,
        valueBoolean: metricValues.valueBoolean,
        valueJson: metricValues.valueJson,
        sourceType: metricValues.sourceType,
        enteredByUserId: metricValues.enteredByUserId,
        companyId: metrics.companyId,
        metricName: metrics.name,
        category: metrics.category,
        unit: metrics.unit,
        metricType: metrics.metricType,
        direction: metrics.direction,
        enabled: metrics.enabled,
      })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(...conditions))
      .orderBy(metricValues.period, metrics.category, metrics.name);

    return result as MetricTrendValueRow[];
  }

  async createMetricValue(value: InsertMetricValue) {
    const [v] = await db.insert(metricValues).values(value).returning();
    return v;
  }

  async upsertMetricValue(value: InsertMetricValue, options: { calculationRunLockHeld?: boolean } = {}) {
    const mutationPeriods = dataEntryPeriodMonths(value.period);
    if (!mutationPeriods) {
      throw storageError(400, "period must use YYYY-MM, YYYY-Q1..Q4, or YYYY format");
    }
    const lockKey = `metric_values:${value.metricId}:${value.period}:${value.siteId ?? "__org__"}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const metricCompanyResult = await client.query<{ company_id: string }>(
        "SELECT company_id FROM metrics WHERE id = $1 LIMIT 1",
        [value.metricId],
      );
      const companyId = metricCompanyResult.rows[0]?.company_id;
      if (!companyId) {
        throw storageError(404, "Metric not found");
      }
      // Period lock ordering is always tenant+period first, then the narrower
      // metric-value scope lock. This matches guided, CSV and bulk mutations.
      await acquirePeriodMutationLocks(client, companyId, mutationPeriods, options);
      const lockedPeriods = await findLockedPeriodsInTransaction(client, companyId, mutationPeriods);
      if (lockedPeriods.length > 0) {
        throw storageError(400, "This period is locked and cannot be edited");
      }
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
        const protection = await assessMetricValueProtectionWithPgClient(client as any, {
          metricValueId: existing.id,
          lockForUpdate: true,
        });
        const protectionReason = protection?.reason ?? null;
        if (protectionReason) {
          throw createProtectedValueError("This metric value", protectionReason, {
            metricId: value.metricId,
            period: value.period,
            siteId: value.siteId ?? null,
          });
        }
        const updateResult = await client.query(
          `
            UPDATE metric_values
            SET
              value = $2,
              value_numeric = $3,
              value_text = $4,
              value_boolean = $5,
              value_json = $6,
              submitted_by = $7,
              submitted_at = NOW(),
              notes = $8,
              data_source_type = $9
            WHERE id = $1
            RETURNING *
          `,
          [
            existing.id,
            value.value ?? null,
            value.valueNumeric ?? null,
            value.valueText ?? null,
            value.valueBoolean ?? null,
            value.valueJson ?? null,
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
            metric_id, period, value, value_numeric, value_text, value_boolean, value_json, submitted_by, submitted_at, notes, locked, data_source_type, site_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12)
          RETURNING *
        `,
        [
          value.metricId,
          value.period,
          value.value ?? null,
          value.valueNumeric ?? null,
          value.valueText ?? null,
          value.valueBoolean ?? null,
          value.valueJson ?? null,
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

  async promoteMetricValueToEvidenced(
    companyId: string,
    metricValueId: string,
    expectedSubmittedAt: Date | string | null,
  ): Promise<MetricValue> {
    const expectedTimestamp = expectedSubmittedAt ? new Date(expectedSubmittedAt) : null;
    if (!expectedTimestamp || !Number.isFinite(expectedTimestamp.getTime())) {
      throw storageError(409, "The saved metric value changed before its evidence provenance could be confirmed");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const scopeResult = await client.query<{
        metric_id: string;
        period: string;
        site_id: string | null;
      }>(
        `SELECT mv.metric_id, mv.period, mv.site_id
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1`,
        [metricValueId, companyId],
      );
      const scope = scopeResult.rows[0];
      if (!scope) throw storageError(404, "Metric value not found");

      const mutationPeriods = dataEntryPeriodMonths(scope.period);
      if (!mutationPeriods) throw storageError(400, "Metric value has an invalid reporting period");
      await acquirePeriodMutationLocks(client, companyId, mutationPeriods);
      const lockedPeriods = await findLockedPeriodsInTransaction(client, companyId, mutationPeriods);
      if (lockedPeriods.length > 0) {
        throw Object.assign(
          storageError(409, "The value and evidence were saved, but the source label could not be changed because the reporting period is now locked"),
          { code: "PROVENANCE_PERIOD_LOCKED" },
        );
      }

      const lockKey = `metric_values:${scope.metric_id}:${scope.period}:${scope.site_id ?? "__org__"}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      const currentResult = await client.query(
        `SELECT mv.*
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1
         FOR UPDATE OF mv`,
        [metricValueId, companyId],
      );
      const current = currentResult.rows[0];
      if (!current) throw storageError(404, "Metric value not found");
      const currentValue = pgRowToCamelCase<MetricValue>(current);
      const currentSubmittedAt = currentValue.submittedAt ? new Date(currentValue.submittedAt) : null;
      if (!currentSubmittedAt || currentSubmittedAt.getTime() !== expectedTimestamp.getTime()) {
        throw storageError(409, "The metric value changed while its evidence was uploading; the evidence was not linked");
      }

      const durableEvidenceResult = await client.query(
        `SELECT 1
         FROM evidence_files
         WHERE company_id = $1
           AND linked_module = 'metric_value'
           AND linked_entity_id = $2
           AND file_url IS NOT NULL
           AND storage_path IS NOT NULL
         LIMIT 1`,
        [companyId, metricValueId],
      );
      if (durableEvidenceResult.rowCount !== 1) {
        throw storageError(409, "Evidence provenance cannot be confirmed until at least one file is durably stored");
      }

      const updatedResult = await client.query(
        `UPDATE metric_values
         SET data_source_type = 'evidenced'
         WHERE id = $1
         RETURNING *`,
        [metricValueId],
      );
      await client.query("COMMIT");
      return pgRowToCamelCase<MetricValue>(updatedResult.rows[0]);
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

  async lockPeriod(companyId: string, period: string, userId?: string | null) {
    if (!reportingMonthBounds(period)) {
      throw storageError(400, "period must use YYYY-MM format");
    }
    await db.transaction(async (tx) => {
      await acquirePeriodMutationLocks(tx, companyId, [period]);
      await tx.insert(dataEntryPeriodLocks)
        .values({ companyId, period, lockedBy: userId ?? null })
        .onConflictDoUpdate({
          target: [dataEntryPeriodLocks.companyId, dataEntryPeriodLocks.period],
          set: { lockedBy: userId ?? null, lockedAt: new Date() },
        });
      await tx
        .update(metricValues)
        .set({ locked: true })
        .where(
          sql`${metricValues.metricId} IN (SELECT id FROM metrics WHERE company_id = ${companyId}) AND ${metricValues.period} = ${period}`
        );
    });
  }

  async isPeriodLocked(companyId: string, period: string) {
    const mutationPeriods = dataEntryPeriodMonths(period);
    if (!mutationPeriods) return false;
    const [lock] = await db.select({ id: dataEntryPeriodLocks.id })
      .from(dataEntryPeriodLocks)
      .where(and(
        eq(dataEntryPeriodLocks.companyId, companyId),
        inArray(dataEntryPeriodLocks.period, mutationPeriods),
      ))
      .limit(1);
    if (lock) return true;

    // Backward compatibility for periods locked before the durable lock table
    // was introduced.
    const [legacyLock] = await db.select({ id: metricValues.id })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(
        eq(metrics.companyId, companyId),
        inArray(metricValues.period, Array.from(new Set([period, ...mutationPeriods]))),
        eq(metricValues.locked, true),
      ))
      .limit(1);
    if (legacyLock) return true;

    // A locked reporting range protects every month it overlaps, including
    // months that do not yet contain raw inputs or metric-value rows.
    const rangeStart = `${mutationPeriods[0]}-01 00:00:00`;
    const rangeEndStart = `${mutationPeriods[mutationPeriods.length - 1]}-01 00:00:00`;
    const [reportingRangeLock] = await db.select({ id: reportingPeriods.id })
      .from(reportingPeriods)
      .where(and(
        eq(reportingPeriods.companyId, companyId),
        eq(reportingPeriods.status, "locked"),
        sql`${reportingPeriods.startDate} < (${rangeEndStart}::timestamp + INTERVAL '1 month')`,
        sql`${reportingPeriods.endDate} >= ${rangeStart}::timestamp`,
      ))
      .limit(1);
    return Boolean(reportingRangeLock);
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

  async deleteRawDataInput(companyId: string, inputName: string, period: string, siteId: string | null) {
    await db.delete(rawDataInputs).where(and(
      eq(rawDataInputs.companyId, companyId),
      eq(rawDataInputs.inputName, inputName),
      eq(rawDataInputs.period, period),
      siteId === null ? isNull(rawDataInputs.siteId) : eq(rawDataInputs.siteId, siteId),
    ));
  }

  async getEvidenceFiles(companyId: string, siteId?: string | null, period?: string) {
    const conditions: any[] = [eq(evidenceFiles.companyId, companyId)];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(evidenceFiles.siteId) : eq(evidenceFiles.siteId, siteId));
    }
    if (period) conditions.push(eq(evidenceFiles.linkedPeriod, period));
    return db.select().from(evidenceFiles).where(and(...conditions)).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async getEvidenceByEntity(companyId: string, linkedModule: string, linkedEntityId: string, siteId?: string | null) {
    const conditions: any[] = [
      eq(evidenceFiles.companyId, companyId),
      eq(evidenceFiles.linkedModule, linkedModule),
      eq(evidenceFiles.linkedEntityId, linkedEntityId),
    ];
    if (siteId !== undefined) {
      conditions.push(siteId === null ? isNull(evidenceFiles.siteId) : eq(evidenceFiles.siteId, siteId));
    }
    return db.select().from(evidenceFiles).where(
      and(...conditions)
    ).orderBy(desc(evidenceFiles.uploadedAt));
  }

  async getEvidenceCoverage(companyId: string, period?: string, siteId?: string | null) {
    const evidenceConditions: any[] = [eq(evidenceFiles.companyId, companyId)];
    if (period) {
      evidenceConditions.push(eq(evidenceFiles.linkedPeriod, period));
    }
    if (siteId !== undefined) {
      evidenceConditions.push(siteId === null ? isNull(evidenceFiles.siteId) : eq(evidenceFiles.siteId, siteId));
    }
    const allEvidence = await db.select().from(evidenceFiles).where(and(...evidenceConditions));
    const allMetrics = await db.select({ id: metrics.id, name: metrics.name, category: metrics.category }).from(metrics).where(eq(metrics.companyId, companyId));

    const metricValueConditions: any[] = [eq(metrics.companyId, companyId)];
    if (siteId !== undefined) {
      metricValueConditions.push(siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, siteId));
    }
    const allMetricValues = await db.select({
      id: metricValues.id,
      metricId: metricValues.metricId,
      period: metricValues.period,
      dataSourceType: metricValues.dataSourceType,
    }).from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(...metricValueConditions));

    const relevantValues = period
      ? allMetricValues.filter(v => v.period === period)
      : allMetricValues;

    const evidenceByMetricValue = allEvidence.filter(e => e.linkedModule === "metric_value");
    const evidencedEntityIds = new Set(evidenceByMetricValue.map(e => e.linkedEntityId));
    const directEvidenceMetricIds = new Set(
      allEvidence
        .map((e: any) => e.metricId || (e.linkedModule === "metric" ? e.linkedEntityId : null))
        .filter(Boolean)
    );

    const metricsWithEvidence = new Set<string>();
    for (const mv of relevantValues) {
      if (evidencedEntityIds.has(mv.id) || mv.dataSourceType === "evidenced") {
        metricsWithEvidence.add(mv.metricId);
      }
    }
    directEvidenceMetricIds.forEach((metricId) => {
      metricsWithEvidence.add(metricId as string);
    });

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

  /**
   * User-facing evidence deletion remains tenant scoped and, for an evidence
   * file linked directly to a legacy metric value, is one atomic provenance
   * mutation. Removing the final evidence record returns a draft value to the
   * truthful manual fallback; submitted/reviewed values and locked periods are
   * never changed through the evidence surface.
   */
  async deleteEvidenceFileForCompany(id: string, companyId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fileResult = await client.query<{
        id: string;
        linked_module: string | null;
        linked_entity_id: string | null;
      }>(
        `SELECT id, linked_module, linked_entity_id
         FROM evidence_files
         WHERE id = $1 AND company_id = $2
         LIMIT 1`,
        [id, companyId],
      );
      const file = fileResult.rows[0];
      if (!file) {
        await client.query("COMMIT");
        return false;
      }

      if (file.linked_module !== "metric_value" || !file.linked_entity_id) {
        const deleted = await client.query(
          "DELETE FROM evidence_files WHERE id = $1 AND company_id = $2 RETURNING id",
          [id, companyId],
        );
        await client.query("COMMIT");
        return deleted.rowCount === 1;
      }

      const scopeResult = await client.query<{
        metric_id: string;
        period: string;
        site_id: string | null;
      }>(
        `SELECT mv.metric_id, mv.period, mv.site_id
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1`,
        [file.linked_entity_id, companyId],
      );
      const scope = scopeResult.rows[0];
      if (!scope) {
        // The owned evidence row is orphaned, so there is no protected value
        // whose provenance can be changed by removing it.
        const deleted = await client.query(
          "DELETE FROM evidence_files WHERE id = $1 AND company_id = $2 RETURNING id",
          [id, companyId],
        );
        await client.query("COMMIT");
        return deleted.rowCount === 1;
      }

      const mutationPeriods = dataEntryPeriodMonths(scope.period);
      if (!mutationPeriods) throw storageError(409, "Evidence cannot be changed because the linked metric value has an invalid reporting period");
      await acquirePeriodMutationLocks(client, companyId, mutationPeriods);
      const lockedPeriods = await findLockedPeriodsInTransaction(client, companyId, mutationPeriods);
      if (lockedPeriods.length > 0) {
        throw storageError(409, "Evidence cannot be changed while the linked reporting period is locked");
      }

      const naturalKey = `metric_values:${scope.metric_id}:${scope.period}:${scope.site_id ?? "__org__"}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [naturalKey]);
      const valueResult = await client.query(
        `SELECT mv.*
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1
         FOR UPDATE OF mv`,
        [file.linked_entity_id, companyId],
      );
      const value = valueResult.rows[0];
      if (!value) {
        await client.query("COMMIT");
        return false;
      }
      if (
        value.locked === true
        || (value.workflow_status ?? "draft") !== "draft"
        || value.reviewed_by !== null
        || value.reviewed_at !== null
      ) {
        throw Object.assign(new Error("Evidence cannot be removed from a locked, submitted or reviewed metric value"), {
          status: 409,
          code: "VALUE_PROTECTED",
        });
      }

      const deleted = await client.query(
        `DELETE FROM evidence_files
         WHERE id = $1 AND company_id = $2
           AND linked_module = 'metric_value' AND linked_entity_id = $3
         RETURNING id`,
        [id, companyId, file.linked_entity_id],
      );
      if (deleted.rowCount !== 1) {
        await client.query("COMMIT");
        return false;
      }

      const remainingEvidence = await client.query(
        `SELECT (
           EXISTS (
             SELECT 1 FROM evidence_files ef
             WHERE ef.company_id = $1
               AND ef.site_id IS NOT DISTINCT FROM $4::varchar
               AND (
                 (ef.linked_module = 'metric_value' AND ef.linked_entity_id = $2)
                 OR (
                   ef.linked_period = $5
                   AND (
                     ef.metric_id = $3
                     OR (ef.linked_module = 'metric' AND ef.linked_entity_id = $3)
                   )
                 )
               )
           )
           OR EXISTS (SELECT 1 FROM metric_evidence me WHERE me.metric_value_id = $2)
         ) AS present`,
        [companyId, file.linked_entity_id, scope.metric_id, scope.site_id, scope.period],
      );
      if (remainingEvidence.rows[0]?.present !== true && value.data_source_type === "evidenced") {
        await client.query(
          "UPDATE metric_values SET data_source_type = 'manual' WHERE id = $1",
          [file.linked_entity_id],
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getActionPlans(companyId: string) {
    return db.select().from(actionPlans).where(eq(actionPlans.companyId, companyId)).orderBy(desc(actionPlans.createdAt));
  }

  async getActionPlan(id: string) {
    const [plan] = await db.select().from(actionPlans).where(eq(actionPlans.id, id));
    return plan;
  }

  async createActionPlan(plan: InsertActionPlan) {
    const mutable = pickMutableFields(plan, ACTION_PLAN_MUTABLE_FIELDS);
    const [p] = await db.insert(actionPlans).values({ ...mutable, companyId: plan.companyId } as InsertActionPlan).returning();
    return p;
  }

  async updateActionPlan(id: string, companyId: string, data: Partial<ActionPlan>) {
    const mutable = pickMutableFields(data, ACTION_PLAN_MUTABLE_FIELDS) as Partial<ActionPlan>;
    const [p] = await db.update(actionPlans).set({ ...mutable, updatedAt: new Date() })
      .where(and(eq(actionPlans.id, id), eq(actionPlans.companyId, companyId)))
      .returning();
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

  async getAllAuditLogs(limit = 200, filters?: { action?: string; actorType?: string; outcome?: string }) {
    const conditions: any[] = [];
    if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters?.actorType) conditions.push(eq(auditLogs.actorType, filters.actorType));
    if (filters?.outcome) conditions.push(sql`${auditLogs.details}->>'outcome' = ${filters.outcome}`);
    let query = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit) as any;
    if (conditions.length > 0) query = db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit) as any;
    return query;
  }

  async queryAuditLogs(filters: { companyId?: string; userId?: string; entityType?: string; action?: string; outcome?: string; dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<AuditLog[]> {
    const conditions: any[] = [];
    if (filters.companyId) conditions.push(eq(auditLogs.companyId, filters.companyId));
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.outcome) conditions.push(sql`${auditLogs.details}->>'outcome' = ${filters.outcome}`);
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
  async getEmissionFactors(country?: string, factorYear?: number) {
    const conditions = [];
    if (country) conditions.push(eq(emissionFactors.country, country));
    if (factorYear) conditions.push(eq(emissionFactors.factorYear, factorYear));

    const rows = await db.select()
      .from(emissionFactors)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(emissionFactors.factorYear), asc(emissionFactors.category), asc(emissionFactors.name));

    // A factor set must never mix publication years. Callers that do not ask
    // for a specific year receive the newest complete set available.
    if (factorYear || rows.length === 0) return rows;
    const latestYear = rows[0].factorYear;
    return rows.filter((factor) => factor.factorYear === latestYear);
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

  async getQuestionnaire(id: string, companyId: string) {
    const [r] = await db.select().from(questionnaires).where(and(
      eq(questionnaires.id, id),
      eq(questionnaires.companyId, companyId),
    ));
    return r;
  }

  async createQuestionnaire(q: InsertQuestionnaire) {
    const [r] = await db.insert(questionnaires).values(q as any).returning();
    return r;
  }

  async createQuestionnaireWithQuestions(
    q: InsertQuestionnaire,
    questions: Array<Omit<InsertQuestionnaireQuestion, "questionnaireId">>,
  ) {
    return db.transaction(async (tx) => {
      const [questionnaire] = await tx.insert(questionnaires).values(q as any).returning();
      const createdQuestions = questions.length > 0
        ? await tx.insert(questionnaireQuestions).values(questions.map((question) => ({
          ...question,
          questionnaireId: questionnaire.id,
        })) as any).returning()
        : [];
      return { questionnaire, questions: createdQuestions };
    });
  }

  async updateQuestionnaire(id: string, companyId: string, data: Partial<Questionnaire>) {
    const mutable = pickMutableFields(data, QUESTIONNAIRE_MUTABLE_FIELDS) as Partial<Questionnaire>;
    const [r] = await db.update(questionnaires)
      .set({ ...mutable, updatedAt: new Date() })
      .where(and(eq(questionnaires.id, id), eq(questionnaires.companyId, companyId)))
      .returning();
    return r;
  }

  async deleteQuestionnaire(id: string, companyId: string) {
    return db.transaction(async (tx) => {
      const [owned] = await tx.select({ id: questionnaires.id })
        .from(questionnaires)
        .where(and(eq(questionnaires.id, id), eq(questionnaires.companyId, companyId)))
        .limit(1)
        .for("update");
      if (!owned) return false;

      await tx.delete(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, id));
      const [deleted] = await tx.delete(questionnaires)
        .where(and(eq(questionnaires.id, id), eq(questionnaires.companyId, companyId)))
        .returning({ id: questionnaires.id });
      return Boolean(deleted);
    });
  }

  async getQuestionnaireQuestions(questionnaireId: string) {
    return db.select().from(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, questionnaireId)).orderBy(questionnaireQuestions.orderIndex);
  }

  async createQuestionnaireQuestion(q: InsertQuestionnaireQuestion) {
    const [r] = await db.insert(questionnaireQuestions).values(q as any).returning();
    return r;
  }

  async updateQuestionnaireQuestion(id: string, questionnaireId: string, companyId: string, data: Partial<QuestionnaireQuestion>) {
    const mutable = pickMutableFields(data, QUESTIONNAIRE_QUESTION_MUTABLE_FIELDS) as Partial<QuestionnaireQuestion>;
    const [r] = await db.update(questionnaireQuestions)
      .set(mutable)
      .where(and(
        eq(questionnaireQuestions.id, id),
        eq(questionnaireQuestions.questionnaireId, questionnaireId),
        sql`EXISTS (
          SELECT 1 FROM questionnaires q
          WHERE q.id = ${questionnaireQuestions.questionnaireId}
            AND q.company_id = ${companyId}
        )`,
      ))
      .returning();
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
    const mutable = pickMutableFields(data, POLICY_TEMPLATE_MUTABLE_FIELDS) as Partial<PolicyTemplate>;
    const [r] = await db.update(policyTemplates).set(mutable).where(eq(policyTemplates.slug, slug)).returning();
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

  async updateGeneratedPolicy(
    id: string,
    companyId: string,
    data: Partial<GeneratedPolicy>,
    options?: { approveTransition?: boolean },
  ) {
    const mutable = pickMutableFields(data, GENERATED_POLICY_MUTABLE_FIELDS) as Partial<GeneratedPolicy>;
    const serverManaged = options?.approveTransition
      ? {
          approvedAt: new Date(),
          versionNumber: sql`coalesce(${generatedPolicies.versionNumber}, 0) + 1`,
        }
      : {};
    const [r] = await db.update(generatedPolicies).set({ ...mutable, ...serverManaged, updatedAt: new Date() })
      .where(and(eq(generatedPolicies.id, id), eq(generatedPolicies.companyId, companyId)))
      .returning();
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

  async submitWorkflowItems(
    items: WorkflowSubmitItem[],
    companyId: string,
    userId: string,
  ): Promise<WorkflowSubmitResult> {
    const seen = new Set<string>();
    const uniqueItems = items.filter((item) => {
      const key = `${item.entityType}:${item.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const result: WorkflowSubmitResult = {
      requested: items.length,
      unique: uniqueItems.length,
      duplicates: items.length - uniqueItems.length,
      submitted: 0,
      alreadySubmitted: 0,
      alreadyApproved: 0,
      ineligible: 0,
      notFound: 0,
      results: [],
    };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const statuses = new Map<string, WorkflowStatus>();
      const typeOrder: WorkflowEntityType[] = [
        "metric_value",
        "raw_data",
        "report",
        "generated_policy",
        "questionnaire_question",
      ];
      for (const entityType of typeOrder) {
        const entityIds = uniqueItems
          .filter((item) => item.entityType === entityType)
          .map((item) => item.entityId)
          .sort();
        const owned = await selectOwnedWorkflowRowsForUpdate(client, entityType, entityIds, companyId);
        owned.forEach((status, entityId) => statuses.set(`${entityType}:${entityId}`, status));
      }

      for (const item of uniqueItems) {
        const { entityType, entityId } = item;
        const currentStatus = statuses.get(`${entityType}:${entityId}`);
        if (!currentStatus) {
          result.notFound += 1;
          result.results.push({ entityType, entityId, outcome: "not_found" });
          continue;
        }
        if (currentStatus === "submitted") {
          result.alreadySubmitted += 1;
          result.results.push({ entityType, entityId, outcome: "already_submitted", currentStatus });
          continue;
        }
        if (currentStatus === "approved") {
          result.alreadyApproved += 1;
          result.results.push({ entityType, entityId, outcome: "already_approved", currentStatus });
          continue;
        }
        if (currentStatus !== "draft") {
          result.ineligible += 1;
          result.results.push({ entityType, entityId, outcome: "ineligible", currentStatus });
          continue;
        }

        const updated = await client.query(
          `UPDATE ${workflowTable(entityType)}
           SET workflow_status = 'submitted', submitted_by = $2, submitted_at = NOW(),
               reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL
           WHERE id = $1 AND COALESCE(workflow_status, 'draft') = 'draft'`,
          [entityId, userId],
        );
        if (updated.rowCount !== 1) {
          throw new Error(`Workflow submit transition was not applied for ${entityType}:${entityId}`);
        }
        await insertWorkflowAudit(client, {
          companyId,
          userId,
          action: `Workflow submitted: ${entityType}`,
          entityType,
          entityId,
          details: { outcome: "success", transition: { from: currentStatus, to: "submitted" } },
        });
        result.submitted += 1;
        result.results.push({ entityType, entityId, outcome: "submitted", currentStatus });
      }

      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async submitWorkflowEntities(
    entityType: WorkflowEntityType,
    entityIds: string[],
    companyId: string,
    userId: string,
  ): Promise<WorkflowSubmitResult> {
    return this.submitWorkflowItems(
      entityIds.map((entityId) => ({ entityType, entityId })),
      companyId,
      userId,
    );
  }

  async reviewWorkflowEntity(
    entityType: WorkflowEntityType,
    entityId: string,
    action: "approve" | "reject",
    companyId: string,
    userId: string,
    comment?: string,
  ): Promise<WorkflowReviewResult> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ownedStatuses = await selectOwnedWorkflowRowsForUpdate(client, entityType, [entityId], companyId);
      const currentStatus = ownedStatuses.get(entityId);
      if (!currentStatus) {
        await client.query("COMMIT");
        return { outcome: "not_found", entityType, entityId };
      }
      if (currentStatus !== "submitted") {
        await client.query("COMMIT");
        return { outcome: "not_submitted", entityType, entityId, currentStatus };
      }

      const status = action === "approve" ? "approved" : "rejected";
      const updated = await client.query(
        `UPDATE ${workflowTable(entityType)}
         SET workflow_status = $2, reviewed_by = $3, reviewed_at = NOW(), review_comment = $4
         WHERE id = $1 AND workflow_status = 'submitted'`,
        [entityId, status, userId, comment?.trim() || null],
      );
      if (updated.rowCount !== 1) {
        throw new Error(`Workflow review transition was not applied for ${entityType}:${entityId}`);
      }
      await insertWorkflowAudit(client, {
        companyId,
        userId,
        action: `Workflow ${status}: ${entityType}`,
        entityType,
        entityId,
        details: { outcome: "success", action, comment: comment?.trim() || null, transition: { from: "submitted", to: status } },
      });
      await client.query("COMMIT");
      return { outcome: "reviewed", entityType, entityId, status };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkReviewWorkflowEntities(
    items: Array<{ entityType: WorkflowEntityType; entityId: string }>,
    action: "approve" | "reject",
    companyId: string,
    userId: string,
    comment?: string,
  ): Promise<WorkflowBulkReviewResult> {
    const seen = new Set<string>();
    const uniqueItems = items.filter((item) => {
      const key = `${item.entityType}:${item.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const result: WorkflowBulkReviewResult = {
      requested: items.length,
      unique: uniqueItems.length,
      duplicates: items.length - uniqueItems.length,
      reviewed: 0,
      notSubmitted: 0,
      notFound: 0,
      results: [],
    };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const statuses = new Map<string, WorkflowStatus>();
      const typeOrder: WorkflowEntityType[] = [
        "metric_value",
        "raw_data",
        "report",
        "generated_policy",
        "questionnaire_question",
      ];
      for (const entityType of typeOrder) {
        const ids = uniqueItems
          .filter((item) => item.entityType === entityType)
          .map((item) => item.entityId)
          .sort();
        const owned = await selectOwnedWorkflowRowsForUpdate(client, entityType, ids, companyId);
        owned.forEach((ownedStatus, entityId) => statuses.set(`${entityType}:${entityId}`, ownedStatus));
      }

      const status = action === "approve" ? "approved" : "rejected";
      for (const item of uniqueItems) {
        const key = `${item.entityType}:${item.entityId}`;
        const currentStatus = statuses.get(key);
        if (!currentStatus) {
          result.notFound += 1;
          result.results.push({ outcome: "not_found", ...item });
          continue;
        }
        if (currentStatus !== "submitted") {
          result.notSubmitted += 1;
          result.results.push({ outcome: "not_submitted", ...item, currentStatus });
          continue;
        }

        const updated = await client.query(
          `UPDATE ${workflowTable(item.entityType)}
           SET workflow_status = $2, reviewed_by = $3, reviewed_at = NOW(), review_comment = $4
           WHERE id = $1 AND workflow_status = 'submitted'`,
          [item.entityId, status, userId, comment?.trim() || null],
        );
        if (updated.rowCount !== 1) {
          throw new Error(`Bulk workflow review transition was not applied for ${key}`);
        }
        await insertWorkflowAudit(client, {
          companyId,
          userId,
          action: `Bulk workflow ${status}: ${item.entityType}`,
          entityType: item.entityType,
          entityId: item.entityId,
          details: {
            outcome: "success",
            action,
            comment: comment?.trim() || null,
            bulk: true,
            transition: { from: "submitted", to: status },
          },
        });
        result.reviewed += 1;
        result.results.push({ outcome: "reviewed", ...item, status });
      }

      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async reviseWorkflowEntity(
    entityType: "metric_value" | "raw_data",
    entityId: string,
    companyId: string,
    userId: string,
  ): Promise<WorkflowReviseResult> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ownedStatuses = await selectOwnedWorkflowRowsForUpdate(client, entityType, [entityId], companyId);
      const currentStatus = ownedStatuses.get(entityId);
      if (!currentStatus) {
        await client.query("COMMIT");
        return { outcome: "not_found", entityType, entityId };
      }
      if (currentStatus !== "rejected") {
        await client.query("COMMIT");
        return { outcome: "not_rejected", entityType, entityId, currentStatus };
      }

      const updated = await client.query(
        `UPDATE ${workflowTable(entityType)}
         SET workflow_status = 'draft', submitted_by = NULL, submitted_at = NULL,
             reviewed_by = NULL, reviewed_at = NULL
         WHERE id = $1 AND workflow_status = 'rejected'`,
        [entityId],
      );
      if (updated.rowCount !== 1) {
        throw new Error(`Workflow revise transition was not applied for ${entityType}:${entityId}`);
      }
      await insertWorkflowAudit(client, {
        companyId,
        userId,
        action: `Workflow revision started: ${entityType}`,
        entityType,
        entityId,
        details: { outcome: "success", transition: { from: "rejected", to: "draft" } },
      });
      await client.query("COMMIT");
      return { outcome: "revised", entityType, entityId, status: "draft" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
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
    await validatePersistedReportingRange(data.startDate, data.endDate);
    return db.transaction(async (tx) => {
      await assertUniqueReportingPeriod(tx, data);
      const [r] = await tx.insert(reportingPeriods).values(data as any).returning();
      return r;
    });
  }

  async closeReportingPeriod(id: string, companyId: string) {
    const [closed] = await db.update(reportingPeriods)
      .set({ status: "closed" as any })
      .where(and(
        eq(reportingPeriods.id, id),
        eq(reportingPeriods.companyId, companyId),
        sql`${reportingPeriods.status} <> 'locked'`,
      ))
      .returning();
    if (closed) return closed;

    const [existing] = await db.select({ status: reportingPeriods.status })
      .from(reportingPeriods)
      .where(and(eq(reportingPeriods.id, id), eq(reportingPeriods.companyId, companyId)))
      .limit(1);
    if (existing?.status === "locked") {
      throw storageError(409, "Locked reporting periods cannot be closed");
    }
    return undefined;
  }

  async lockReportingPeriod(id: string, companyId: string) {
    return db.transaction(async (tx) => {
      const [period] = await tx.select({
        startMonth: sql<string>`to_char(${reportingPeriods.startDate}, 'YYYY-MM')`,
        endMonth: sql<string>`to_char(${reportingPeriods.endDate}, 'YYYY-MM')`,
      }).from(reportingPeriods).where(and(
        eq(reportingPeriods.id, id),
        eq(reportingPeriods.companyId, companyId),
      )).limit(1).for("update");
      if (!period) return undefined;

      let months: string[];
      try {
        // These calendar bounds come directly from PostgreSQL's timestamp
        // without time zone values, avoiding process-local Date conversion at
        // month boundaries.
        months = reportingMonthsForMonthBounds(period.startMonth, period.endMonth);
      } catch (error) {
        if (error instanceof RangeError) throw storageError(400, error.message);
        throw error;
      }
      await acquirePeriodMutationLocks(tx, companyId, months);

      const [locked] = await tx.update(reportingPeriods)
        .set({ status: "locked" as any })
        .where(and(eq(reportingPeriods.id, id), eq(reportingPeriods.companyId, companyId)))
        .returning();
      return locked;
    });
  }

  async copyForwardPeriod(sourcePeriodId: string, companyId: string, newPeriodData: InsertReportingPeriod) {
    await validatePersistedReportingRange(newPeriodData.startDate, newPeriodData.endDate);
    return db.transaction(async (tx) => {
      const [source] = await tx.select({ id: reportingPeriods.id })
        .from(reportingPeriods)
        .where(and(eq(reportingPeriods.id, sourcePeriodId), eq(reportingPeriods.companyId, companyId)))
        .limit(1)
        .for("update");
      if (!source) throw storageError(404, "Source period not found");

      await assertUniqueReportingPeriod(tx, newPeriodData);

      // Targets and action plans are company-level in the current data model;
      // they remain visible in the new period and must not be duplicated.
      const [targetCount] = await tx.select({ value: count() })
        .from(metricTargets)
        .innerJoin(metrics, eq(metricTargets.metricId, metrics.id))
        .where(eq(metrics.companyId, companyId));
      const [actionCount] = await tx.select({ value: count() })
        .from(actionPlans)
        .where(and(eq(actionPlans.companyId, companyId), sql`${actionPlans.status} <> 'complete'`));

      const [newPeriod] = await tx.insert(reportingPeriods)
        .values({ ...newPeriodData, companyId, previousPeriodId: sourcePeriodId } as any)
        .returning();

      return {
        period: newPeriod,
        copiedMetrics: 0,
        copiedActions: 0,
        carriedForwardMetrics: Number(targetCount?.value ?? 0),
        carriedForwardActions: Number(actionCount?.value ?? 0),
      };
    });
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

  async adminListCompanies(search = "", page = 1, pageSize = 50, statusFilter = "", planFilter = "") {
    const offset = (page - 1) * pageSize;
    const searchCond = search ? sql`AND c.name ILIKE ${`%${search}%`}` : sql``;
    const statusCond = statusFilter ? sql`AND c.status = ${statusFilter}` : sql``;
    const planCond = planFilter ? sql`AND c.plan_tier = ${planFilter}` : sql``;
    const companiesResult = await db.execute(sql`
      SELECT
        c.id, c.name, c.industry, c.country, c.plan_tier, c.status,
        c.onboarding_complete, c.created_at,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS user_count,
        (SELECT COUNT(*)::int FROM esg_policies p WHERE p.company_id = c.id) AS policy_count,
        (SELECT COUNT(*)::int FROM metrics m WHERE m.company_id = c.id) AS metric_count,
        (SELECT COUNT(*)::int FROM report_runs r WHERE r.company_id = c.id) AS report_count,
        (SELECT saa.action FROM super_admin_actions saa WHERE saa.target_company_id = c.id ORDER BY saa.created_at DESC LIMIT 1) AS last_admin_action,
        (SELECT saa.created_at FROM super_admin_actions saa WHERE saa.target_company_id = c.id ORDER BY saa.created_at DESC LIMIT 1) AS last_action_at
      FROM companies c
      WHERE 1=1 ${searchCond} ${statusCond} ${planCond}
      ORDER BY c.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM companies c
      WHERE 1=1 ${searchCond} ${statusCond} ${planCond}
    `);
    const rows = (companiesResult as any).rows ?? [];
    const countRows = (countResult as any).rows ?? [];
    return { companies: rows as any[], total: (countRows[0]?.total ?? 0) as number };
  }

  async adminListUsers(search = "", page = 1, pageSize = 50, roleFilter = "", companyStatusFilter = "") {
    const offset = (page - 1) * pageSize;
    const searchCond = search ? sql`AND (u.email ILIKE ${`%${search}%`} OR u.username ILIKE ${`%${search}%`})` : sql``;
    const roleCond = roleFilter ? sql`AND u.role = ${roleFilter}` : sql``;
    const companyStatusCond = companyStatusFilter ? sql`AND c.status = ${companyStatusFilter}` : sql``;
    const usersResult = await db.execute(sql`
      SELECT
        u.id, u.username, u.email, u.role, u.created_at,
        c.id AS company_id, c.name AS company_name, c.status AS company_status
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE 1=1 ${searchCond} ${roleCond} ${companyStatusCond}
      ORDER BY u.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE 1=1 ${searchCond} ${roleCond} ${companyStatusCond}
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
      const now = new Date();
      const companyUsers = await tx.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
      const companyUserIds = companyUsers.map((user) => user.id);
      if (companyUserIds.length > 0) {
        await tx.update(userSessions)
          .set({ revokedAt: now })
          .where(and(inArray(userSessions.userId, companyUserIds), isNull(userSessions.revokedAt)));
      }
      await tx.update(accessGrants)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(accessGrants.companyId, companyId), isNull(accessGrants.revokedAt)));
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
      const targetIsPlatformSuperAdmin = isPlatformSuperAdmin(user);
      if (targetIsPlatformSuperAdmin) {
        const result = await tx.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE anonymised_at IS NULL
            AND role = 'super_admin'
        `);
        const remaining = Number((result as any).rows?.[0]?.count ?? 0);
        if (remaining <= 1) {
          throw storageError(400, "Cannot delete the last remaining super admin");
        }
      }
      if (user.id === currentSuperAdminUserId) {
        throw storageError(400, "You cannot delete your own super admin account");
      }

      if (user.companyId && (user.role === "admin" || isPlatformSuperAdmin(user))) {
        const alternateAdmins = await tx.select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.companyId, user.companyId),
            or(eq(users.role, "admin"), eq(users.role, "super_admin")),
            isNull(users.anonymisedAt),
            sql`${users.id} <> ${userId}`
          ));

        if (alternateAdmins.length === 0) {
          throw storageError(400, "Cannot delete the only admin for this company");
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
      INSERT INTO super_admin_actions (admin_user_id, action, target_company_id, target_user_id, metadata, ip_address, user_agent)
      VALUES (${data.adminUserId ?? null}, ${data.action}, ${data.targetCompanyId ?? null}, ${data.targetUserId ?? null}, ${data.metadata ? JSON.stringify(data.metadata) : null}, ${data.ipAddress ?? null}, ${data.userAgent ?? null})
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

    const [migrationHistoryR, groupMembershipsR, provisioningEventsR, milestonesR, grantsR] = await Promise.all([
      db.execute(sql`
        SELECT id, user_id, action, entity_id, details, created_at
        FROM audit_logs
        WHERE company_id = ${companyId} AND action = 'legacy_site_migration'
        ORDER BY created_at DESC LIMIT 20
      `),
      db.execute(sql`
        SELECT g.id, g.name, g.slug, g.type, gc.created_at AS linked_at
        FROM group_companies gc
        JOIN groups g ON g.id = gc.group_id
        WHERE gc.company_id = ${companyId}
        ORDER BY gc.created_at ASC
      `),
      db.execute(sql`
        SELECT action, entity_type, entity_id, details, created_at, user_id
        FROM audit_logs
        WHERE company_id = ${companyId}
          AND action IN ('company_created', 'company_linked_to_group', 'user_invited', 'user_role_changed',
                         'onboarding_completed', 'first_report_generated')
        ORDER BY created_at ASC
      `),
      // Activation milestones — use MIN to get the first-ever occurrence
      db.execute(sql`
        SELECT
          MIN(CASE WHEN event_name IN ('first_data_added','metric_value_submitted','FIRST_DATA_ADDED') THEN recorded_at END) AS first_data_at,
          MIN(CASE WHEN event_name IN ('first_evidence_uploaded','evidence_uploaded','EVIDENCE_UPLOADED') THEN recorded_at END) AS first_evidence_at,
          MIN(CASE WHEN event_name IN ('first_report_generated','report_generated','REPORT_GENERATED','FIRST_REPORT_GENERATED') THEN recorded_at END) AS first_report_at,
          MAX(recorded_at) AS last_event_at
        FROM telemetry_events
        WHERE company_id = ${companyId}
      `),
      // Access grants for this company
      db.execute(sql`
        SELECT
          ag.id, ag.plan_type, ag.grant_type, ag.starts_at, ag.ends_at,
          ag.revoked_at, ag.reason, ag.created_at,
          c.name AS company_name,
          cu.username AS created_by_name, cu.email AS created_by_email
        FROM access_grants ag
        LEFT JOIN companies c ON c.id = ag.company_id
        LEFT JOIN users cu ON cu.id = ag.created_by
        WHERE ag.company_id = ${companyId}
        ORDER BY ag.created_at DESC
      `),
    ]);

    const migrationHistory = (migrationHistoryR as any).rows ?? [];
    const groupMemberships = (groupMembershipsR as any).rows ?? [];
    const provisioningEvents = (provisioningEventsR as any).rows ?? [];

    // Activation milestones: fallback to audit_logs if telemetry doesn't have them
    const milestoneRow = ((milestonesR as any).rows ?? [])[0] ?? {};
    const accessGrantsForCompany = (grantsR as any).rows ?? [];

    const auditMilestonesR = await db.execute(sql`
      SELECT
        MIN(CASE WHEN action IN ('metric_entered','metric_value_submitted') THEN created_at END) AS first_data_at,
        MIN(CASE WHEN action IN ('evidence_uploaded','evidence_linked') THEN created_at END) AS first_evidence_at,
        MIN(CASE WHEN action IN ('report_generated','first_report_generated') THEN created_at END) AS first_report_at,
        MAX(created_at) AS last_activity_at
      FROM audit_logs
      WHERE company_id = ${companyId}
    `);
    const auditMilestone = ((auditMilestonesR as any).rows ?? [])[0] ?? {};

    const activationMilestones = {
      firstDataAt: milestoneRow.first_data_at ?? auditMilestone.first_data_at ?? null,
      firstEvidenceAt: milestoneRow.first_evidence_at ?? auditMilestone.first_evidence_at ?? null,
      firstReportAt: milestoneRow.first_report_at ?? auditMilestone.first_report_at ?? null,
      lastActiveAt: milestoneRow.last_event_at ?? auditMilestone.last_activity_at ?? null,
    };

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
      activationMilestones,
      accessGrants: accessGrantsForCompany,
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

  async mutateMetricDefinitionCatalogue(
    mutation: MetricDefinitionCatalogueMutation,
    seedReservations: readonly MetricDefinitionSeedReservation[],
  ): Promise<MetricDefinitionCatalogueMutationResult> {
    return db.transaction(async (tx) => {
      // The lock, catalogue read, prospective validation, and mutation all
      // share one transaction. Concurrent admins therefore validate against
      // the state committed by the previous catalogue writer.
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${METRIC_DEFINITION_CATALOGUE_LOCK_KEY}, 0)
        )
      `);

      const definitions = await tx.select().from(metricDefinitions);
      const seedReservationByCode = new Map(
        seedReservations.map((reservation) => [reservation.code, reservation]),
      );
      const seedReservationByName = new Map<string, MetricDefinitionSeedReservation>();
      for (const reservation of seedReservations) {
        const normalizedName = normalizeMetricDefinitionName(reservation.name);
        if (!seedReservationByName.has(normalizedName)) {
          seedReservationByName.set(normalizedName, reservation);
        }
      }
      if (mutation.type === "create") {
        if (definitions.some((definition) => definition.code === mutation.data.code)) {
          return { outcome: "duplicate_code" };
        }
        if (seedReservationByCode.has(mutation.data.code)) {
          return { outcome: "reserved_code" };
        }
        const normalizedName = normalizeMetricDefinitionName(mutation.data.name);
        if (
          seedReservationByName.has(normalizedName)
          || definitions.some((definition) => normalizeMetricDefinitionName(definition.name) === normalizedName)
        ) {
          return { outcome: "duplicate_name" };
        }
        const prospective = [...definitions, metricDefinitionInsertValues(mutation.data)];
        const errors = validateActiveMetricDefinitionCatalogue(prospective);
        if (errors.length > 0) return { outcome: "invalid", errors };

        const [definition] = await tx.insert(metricDefinitions)
          .values(metricDefinitionInsertValues(mutation.data))
          .returning();
        return { outcome: "created", definition };
      }

      const previous = definitions.find((definition) => definition.id === mutation.id);
      if (!previous) return { outcome: "not_found" };
      const updates = mutation.type === "toggle_active"
        ? { isActive: !previous.isActive }
        : mutation.data;
      const seedReservation = seedReservationByCode.get(previous.code);
      if (
        updates.name !== undefined
        && updates.name !== previous.name
        && seedReservation
        && updates.name !== seedReservation.name
      ) {
        return { outcome: "seed_name_immutable" };
      }
      if (
        updates.name !== undefined
        && (
          (!seedReservation && seedReservationByName.has(normalizeMetricDefinitionName(updates.name)))
          || definitions.some((definition) =>
            definition.id !== mutation.id
            && normalizeMetricDefinitionName(definition.name) === normalizeMetricDefinitionName(updates.name),
          )
        )
      ) {
        return { outcome: "duplicate_name" };
      }
      const prospective = definitions.map((definition) =>
        definition.id === mutation.id ? { ...definition, ...updates } : definition,
      );
      const errors = validateActiveMetricDefinitionCatalogue(prospective);
      if (errors.length > 0) return { outcome: "invalid", errors };

      const [definition] = await tx.update(metricDefinitions)
        .set(metricDefinitionUpdateFields(updates))
        .where(eq(metricDefinitions.id, mutation.id))
        .returning();
      if (!definition) return { outcome: "not_found" };
      return { outcome: "updated", definition, previous };
    });
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

  async getMetricDefinitionValuesExact(
    businessId: string,
    siteId: string | null,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MetricDefinitionValue[]> {
    return db.select().from(metricDefinitionValues).where(and(
      eq(metricDefinitionValues.businessId, businessId),
      siteId === null ? isNull(metricDefinitionValues.siteId) : eq(metricDefinitionValues.siteId, siteId),
      eq(metricDefinitionValues.reportingPeriodStart, periodStart),
      eq(metricDefinitionValues.reportingPeriodEnd, periodEnd),
    ));
  }

  async getMetricDefinitionValueById(id: string, businessId: string): Promise<MetricDefinitionValue | undefined> {
    const [r] = await db.select().from(metricDefinitionValues)
      .where(and(eq(metricDefinitionValues.id, id), eq(metricDefinitionValues.businessId, businessId)));
    return r;
  }

  async createMetricDefinitionValue(data: InsertMetricDefinitionValue): Promise<MetricDefinitionValue> {
    return this.upsertMetricDefinitionValue(
      data.businessId,
      data.metricDefinitionId,
      data.siteId ?? null,
      data.reportingPeriodStart,
      data.reportingPeriodEnd,
      data,
    );
  }

  async updateMetricDefinitionValue(id: string, businessId: string, data: Partial<MetricDefinitionValue>): Promise<MetricDefinitionValue | undefined> {
    const existing = await this.getMetricDefinitionValueById(id, businessId);
    if (!existing) return undefined;
    const mutation = await this.mutateMetricDefinitionValueNaturalKey(
      businessId,
      existing.metricDefinitionId,
      existing.siteId ?? null,
      existing.reportingPeriodStart,
      existing.reportingPeriodEnd,
      data,
      "user",
    );
    return mutation.value ?? undefined;
  }

  async upsertMetricDefinitionValue(businessId: string, metricDefinitionId: string, siteId: string | null, periodStart: Date, periodEnd: Date, data: Partial<InsertMetricDefinitionValue>) {
    const mutation = await this.mutateMetricDefinitionValueNaturalKey(
      businessId,
      metricDefinitionId,
      siteId,
      periodStart,
      periodEnd,
      data,
      "user",
    );
    if (!mutation.value) throw storageError(500, "Canonical metric value mutation did not return a value");
    return mutation.value;
  }

  async upsertCalculatedMetricDefinitionValue(
    businessId: string,
    metricDefinitionId: string,
    siteId: string | null,
    periodStart: Date,
    periodEnd: Date,
    valueNumeric: string,
  ): Promise<CanonicalCalculationMutationResult> {
    return this.mutateMetricDefinitionValueNaturalKey(
      businessId,
      metricDefinitionId,
      siteId,
      periodStart,
      periodEnd,
      { valueNumeric, valueText: null, valueBoolean: null, valueJson: null, sourceType: "calculated", notes: null },
      "calculation",
    );
  }

  async clearCalculatedMetricDefinitionValue(
    businessId: string,
    metricDefinitionId: string,
    siteId: string | null,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CanonicalCalculationMutationResult> {
    return this.mutateMetricDefinitionValueNaturalKey(
      businessId,
      metricDefinitionId,
      siteId,
      periodStart,
      periodEnd,
      {},
      "clear-calculation",
    );
  }

  private async mutateMetricDefinitionValueNaturalKey(
    businessId: string,
    metricDefinitionId: string,
    siteId: string | null,
    periodStart: Date,
    periodEnd: Date,
    data: Partial<InsertMetricDefinitionValue> | Partial<MetricDefinitionValue>,
    mode: "user" | "calculation" | "clear-calculation",
  ): Promise<CanonicalCalculationMutationResult> {
    if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart > periodEnd) {
      throw storageError(400, "Reporting period dates must form a valid ascending range");
    }
    if (mode === "user" && data.sourceType === "calculated") {
      throw storageError(400, "Calculated provenance is reserved for the calculation engine");
    }
    const periodStartParameter = toCanonicalPgTimestamp(periodStart);
    const periodEndParameter = toCanonicalPgTimestamp(periodEnd);
    const lockKey = `metric_definition_values:${businessId}:${metricDefinitionId}:${periodStart.toISOString()}:${periodEnd.toISOString()}:${siteId ?? "__org__"}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const calendarBounds = await client.query<{ start_month: string; end_month: string }>(
        `SELECT
           to_char($1::timestamp, 'YYYY-MM') AS start_month,
           to_char($2::timestamp, 'YYYY-MM') AS end_month`,
        [periodStartParameter, periodEndParameter],
      );
      const bounds = calendarBounds.rows[0];
      if (!bounds) throw storageError(400, "Reporting period dates are required");
      // Lock every overlapped month before the narrower canonical-value key,
      // then recheck after waiting so a concurrent period/range lock wins.
      await acquireUnlockedReportingRange(client, businessId, bounds.start_month, bounds.end_month, {
        calculationRunLockHeld: mode !== "user",
      });
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
        ? [businessId, metricDefinitionId, periodStartParameter, periodEndParameter]
        : [businessId, metricDefinitionId, periodStartParameter, periodEndParameter, siteId];
      const existingResult = await client.query(selectSql, selectParams);
      const existing = existingResult.rows[0]
        ? pgRowToCamelCase<MetricDefinitionValue>(existingResult.rows[0])
        : undefined;

      if (existing) {
        const evidenceResult = await client.query(
          "SELECT 1 FROM metric_evidence WHERE metric_value_id = $1 LIMIT 1",
          [existing.id],
        );
        const hasEvidence = evidenceResult.rowCount === 1;
        const protectionReason = getCanonicalValueProtectionReason({ ...existing, hasEvidence });
        const next = canonicalNextValue(existing, data);

        if (mode === "user") {
          if (protectionReason && !canonicalMutableValuesEqual(existing, next)) {
            throw createCanonicalProtectedValueError(protectionReason, {
              metricDefinitionId,
              siteId,
              reportingPeriodStart: periodStart.toISOString(),
              reportingPeriodEnd: periodEnd.toISOString(),
            });
          }
          if (canonicalMutableValuesEqual(existing, next)) {
            await client.query("COMMIT");
            return { outcome: "unchanged", value: existing, ...(protectionReason ? { reason: protectionReason } : {}) };
          }
        } else {
          if (hasEvidence || existing.status !== "draft") {
            const reason = hasEvidence ? "evidenced" : "workflow";
            await client.query("COMMIT");
            return { outcome: "protected", value: existing, reason };
          }
          if (existing.sourceType !== "calculated") {
            await client.query("COMMIT");
            return { outcome: "protected", value: existing, reason: "authoritative" };
          }
          if (mode === "clear-calculation") {
            await client.query("DELETE FROM metric_definition_values WHERE id = $1", [existing.id]);
            await client.query("COMMIT");
            return { outcome: "cleared", value: null };
          }
          if (canonicalMutableValuesEqual(existing, next)) {
            await client.query("COMMIT");
            return { outcome: "unchanged", value: existing };
          }
        }

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
              entered_by_user_id = $8,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [
            existing.id,
            next.valueNumeric ?? null,
            next.valueText ?? null,
            next.valueBoolean ?? null,
            next.valueJson ?? null,
            next.sourceType ?? "manual",
            next.notes ?? null,
            data.enteredByUserId ?? existing.enteredByUserId ?? null,
          ],
        );
        await client.query("COMMIT");
        return {
          outcome: "updated",
          value: pgRowToCamelCase<MetricDefinitionValue>(updateResult.rows[0]),
        };
      }

      if (mode === "clear-calculation") {
        await client.query("COMMIT");
        return { outcome: "missing", value: null };
      }

      const sourceType = mode === "calculation" ? "calculated" : data.sourceType ?? "manual";

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
          periodStartParameter,
          periodEndParameter,
          data.valueNumeric ?? null,
          data.valueText ?? null,
          data.valueBoolean ?? null,
          data.valueJson ?? null,
          sourceType,
          data.notes ?? null,
          "draft",
          data.enteredByUserId ?? null,
        ],
      );
      await client.query("COMMIT");
      return {
        outcome: "created",
        value: pgRowToCamelCase<MetricDefinitionValue>(insertResult.rows[0]),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async transitionMetricDefinitionValue(
    id: string,
    businessId: string,
    actorUserId: string,
    action: "submit" | "approve" | "reject" | "revise",
    comment?: string | null,
  ): Promise<MetricDefinitionValue | undefined> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const scopeResult = await client.query<{ start_month: string; end_month: string }>(
        `SELECT
           to_char(reporting_period_start, 'YYYY-MM') AS start_month,
           to_char(reporting_period_end, 'YYYY-MM') AS end_month
         FROM metric_definition_values
         WHERE id = $1 AND business_id = $2
         LIMIT 1`,
        [id, businessId],
      );
      const scope = scopeResult.rows[0];
      if (!scope) {
        await client.query("COMMIT");
        return undefined;
      }
      await acquireUnlockedReportingRange(client, businessId, scope.start_month, scope.end_month);
      const currentResult = await client.query(
        `SELECT * FROM metric_definition_values
         WHERE id = $1 AND business_id = $2
         LIMIT 1
         FOR UPDATE`,
        [id, businessId],
      );
      const current = currentResult.rows[0]
        ? pgRowToCamelCase<MetricDefinitionValue>(currentResult.rows[0])
        : undefined;
      if (!current) {
        await client.query("COMMIT");
        return undefined;
      }

      const targetStatus = action === "submit"
        ? "submitted"
        : action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "draft";
      const allowedCurrent = action === "submit"
        ? ["draft"]
        : action === "revise"
          ? ["rejected"]
          : ["submitted"];
      if (current.status === targetStatus) {
        await client.query("COMMIT");
        return current;
      }
      if (!allowedCurrent.includes(current.status)) {
        throw Object.assign(
          new Error(`Cannot ${action} a canonical metric value while its status is ${current.status}`),
          { status: 409, code: "INVALID_WORKFLOW_TRANSITION" },
        );
      }

      const updatedResult = await client.query(
        `UPDATE metric_definition_values
         SET status = $3, updated_at = NOW()
         WHERE id = $1 AND business_id = $2
         RETURNING *`,
        [id, businessId, targetStatus],
      );
      await client.query(
        `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, 'metric_definition_value', $4, $5::jsonb)`,
        [
          businessId,
          actorUserId,
          `metric_definition_value_${action}`,
          id,
          JSON.stringify({ before: current.status, after: targetStatus, comment: comment ?? null }),
        ],
      );
      await client.query("COMMIT");
      return pgRowToCamelCase<MetricDefinitionValue>(updatedResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async rollupSiteValuesToCompany(businessId: string, metricDefinitionId: string, periodStart: Date, periodEnd: Date): Promise<CanonicalRollupResult> {
    const defn = await this.getMetricDefinition(metricDefinitionId);
    if (!defn || defn.rollupMethod === "none") {
      return { outcome: "missing", value: null, rollupValue: null };
    }

    const siteValueRows = await db.select({ value: metricDefinitionValues }).from(metricDefinitionValues)
      .innerJoin(organisationSites, and(
        eq(organisationSites.id, metricDefinitionValues.siteId),
        eq(organisationSites.companyId, businessId),
        eq(organisationSites.status, "active"),
      ))
      .where(
        and(
          eq(metricDefinitionValues.businessId, businessId),
          eq(metricDefinitionValues.metricDefinitionId, metricDefinitionId),
          eq(metricDefinitionValues.reportingPeriodStart, periodStart),
          eq(metricDefinitionValues.reportingPeriodEnd, periodEnd),
          sql`${metricDefinitionValues.siteId} IS NOT NULL`,
          sql`${metricDefinitionValues.status} <> 'rejected'`,
        )
      )
      .orderBy(desc(metricDefinitionValues.updatedAt));

    const siteValues = siteValueRows.map((row) => row.value);

    const validSiteValues = siteValues.filter(v => v.valueNumeric !== null && !isNaN(parseFloat(v.valueNumeric!)));
    if (validSiteValues.length === 0) {
      const cleared = await this.clearCalculatedMetricDefinitionValue(
        businessId,
        metricDefinitionId,
        null,
        periodStart,
        periodEnd,
      );
      return { ...cleared, rollupValue: null };
    }

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

    if (rollupValue === null) return { outcome: "missing", value: null, rollupValue: null };
    const mutation = await this.upsertCalculatedMetricDefinitionValue(
      businessId,
      metricDefinitionId,
      null,
      periodStart,
      periodEnd,
      String(rollupValue),
    );
    return { ...mutation, rollupValue };
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

  async createLegacyMetricEvidence(businessId: string, data: InsertMetricEvidence): Promise<MetricEvidence> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const scopeResult = await client.query<{
        metric_id: string;
        period: string;
        site_id: string | null;
      }>(
        `SELECT mv.metric_id, mv.period, mv.site_id
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1`,
        [data.metricValueId, businessId],
      );
      const scope = scopeResult.rows[0];
      if (!scope) throw storageError(404, "Metric value not found");

      const mutationPeriods = dataEntryPeriodMonths(scope.period);
      if (!mutationPeriods) throw storageError(409, "Evidence cannot be changed because the linked metric value has an invalid reporting period");
      await acquirePeriodMutationLocks(client, businessId, mutationPeriods);
      const lockedPeriods = await findLockedPeriodsInTransaction(client, businessId, mutationPeriods);
      if (lockedPeriods.length > 0) {
        throw storageError(409, "Evidence cannot be changed while the linked reporting period is locked");
      }
      const naturalKey = `metric_values:${scope.metric_id}:${scope.period}:${scope.site_id ?? "__org__"}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [naturalKey]);

      const valueResult = await client.query(
        `SELECT mv.*
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1
         FOR UPDATE OF mv`,
        [data.metricValueId, businessId],
      );
      const value = valueResult.rows[0];
      if (!value) throw storageError(404, "Metric value not found");
      // Match the direct-entry append policy: an existing workflow-protected
      // value may receive additional evidence without changing its measured
      // fields, but a period/value lock still blocks every mutation.
      if (value.locked === true) {
        throw Object.assign(new Error("Evidence cannot be attached to a locked metric value"), {
          status: 409,
          code: "VALUE_PROTECTED",
        });
      }

      const createdResult = await client.query(
        `INSERT INTO metric_evidence (
           metric_value_id, file_url, storage_key, file_name, file_type,
           uploaded_by_user_id, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          data.metricValueId,
          data.fileUrl ?? null,
          data.storageKey ?? null,
          data.fileName,
          data.fileType ?? null,
          data.uploadedByUserId ?? null,
          data.notes ?? null,
        ],
      );
      if (value.data_source_type !== "evidenced") {
        await client.query("UPDATE metric_values SET data_source_type = 'evidenced' WHERE id = $1", [data.metricValueId]);
      }
      await client.query("COMMIT");
      return pgRowToCamelCase<MetricEvidence>(createdResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async createCanonicalMetricEvidence(businessId: string, data: InsertMetricEvidence): Promise<MetricEvidence> {
    return db.transaction(async (tx) => {
      const [scope] = await tx.select({
        startMonth: sql<string>`to_char(${metricDefinitionValues.reportingPeriodStart}, 'YYYY-MM')`,
        endMonth: sql<string>`to_char(${metricDefinitionValues.reportingPeriodEnd}, 'YYYY-MM')`,
      }).from(metricDefinitionValues).where(and(
        eq(metricDefinitionValues.id, data.metricValueId),
        eq(metricDefinitionValues.businessId, businessId),
      )).limit(1);
      if (!scope) throw storageError(404, "Metric value not found");
      await acquireUnlockedReportingRange(tx, businessId, scope.startMonth, scope.endMonth);

      const [value] = await tx.select().from(metricDefinitionValues).where(and(
        eq(metricDefinitionValues.id, data.metricValueId),
        eq(metricDefinitionValues.businessId, businessId),
      )).limit(1).for("update");
      if (!value) throw storageError(404, "Metric value not found");
      if (value.status !== "draft") {
        throw Object.assign(new Error("Evidence cannot be changed after a canonical metric value is submitted for review"), {
          status: 409,
          code: "VALUE_PROTECTED",
        });
      }
      if (value.sourceType === "calculated") {
        throw Object.assign(new Error("Attach evidence to the source values, not an automatically calculated value"), {
          status: 409,
          code: "CALCULATED_VALUE",
        });
      }

      const [created] = await tx.insert(metricEvidence).values({
        metricValueId: data.metricValueId,
        fileUrl: data.fileUrl ?? null,
        storageKey: data.storageKey ?? null,
        fileName: data.fileName,
        fileType: data.fileType ?? null,
        uploadedByUserId: data.uploadedByUserId ?? null,
        notes: data.notes ?? null,
      }).returning();
      return created;
    });
  }

  async deleteMetricEvidence(id: string): Promise<void> {
    await db.delete(metricEvidence).where(eq(metricEvidence.id, id));
  }

  async deleteLegacyMetricEvidence(id: string, businessId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const scopeResult = await client.query<{
        metric_value_id: string;
        metric_id: string;
        period: string;
        site_id: string | null;
      }>(
        `SELECT me.metric_value_id, mv.metric_id, mv.period, mv.site_id
         FROM metric_evidence me
         INNER JOIN metric_values mv ON mv.id = me.metric_value_id
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE me.id = $1 AND m.company_id = $2
         LIMIT 1`,
        [id, businessId],
      );
      const scope = scopeResult.rows[0];
      if (!scope) {
        await client.query("COMMIT");
        return false;
      }

      const mutationPeriods = dataEntryPeriodMonths(scope.period);
      if (!mutationPeriods) throw storageError(409, "Evidence cannot be changed because the linked metric value has an invalid reporting period");
      await acquirePeriodMutationLocks(client, businessId, mutationPeriods);
      const lockedPeriods = await findLockedPeriodsInTransaction(client, businessId, mutationPeriods);
      if (lockedPeriods.length > 0) {
        throw storageError(409, "Evidence cannot be changed while the linked reporting period is locked");
      }
      const naturalKey = `metric_values:${scope.metric_id}:${scope.period}:${scope.site_id ?? "__org__"}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [naturalKey]);

      const valueResult = await client.query(
        `SELECT mv.*
         FROM metric_values mv
         INNER JOIN metrics m ON m.id = mv.metric_id
         WHERE mv.id = $1 AND m.company_id = $2
         LIMIT 1
         FOR UPDATE OF mv`,
        [scope.metric_value_id, businessId],
      );
      const value = valueResult.rows[0];
      if (!value) {
        await client.query("COMMIT");
        return false;
      }
      if (
        value.locked === true
        || (value.workflow_status ?? "draft") !== "draft"
        || value.reviewed_by !== null
        || value.reviewed_at !== null
      ) {
        throw Object.assign(new Error("Evidence cannot be removed from a locked, submitted or reviewed metric value"), {
          status: 409,
          code: "VALUE_PROTECTED",
        });
      }

      const deleted = await client.query(
        "DELETE FROM metric_evidence WHERE id = $1 AND metric_value_id = $2 RETURNING id",
        [id, scope.metric_value_id],
      );
      if (deleted.rowCount !== 1) {
        await client.query("COMMIT");
        return false;
      }
      const remainingEvidence = await client.query(
        `SELECT (
           EXISTS (SELECT 1 FROM metric_evidence me WHERE me.metric_value_id = $2)
           OR EXISTS (
             SELECT 1 FROM evidence_files ef
             WHERE ef.company_id = $1
               AND ef.site_id IS NOT DISTINCT FROM $4::varchar
               AND (
                 (ef.linked_module = 'metric_value' AND ef.linked_entity_id = $2)
                 OR (
                   ef.linked_period = $5
                   AND (
                     ef.metric_id = $3
                     OR (ef.linked_module = 'metric' AND ef.linked_entity_id = $3)
                   )
                 )
               )
           )
         ) AS present`,
        [businessId, scope.metric_value_id, scope.metric_id, scope.site_id, scope.period],
      );
      if (remainingEvidence.rows[0]?.present !== true && value.data_source_type === "evidenced") {
        await client.query("UPDATE metric_values SET data_source_type = 'manual' WHERE id = $1", [scope.metric_value_id]);
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteCanonicalMetricEvidence(id: string, businessId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [scope] = await tx.select({
        metricValueId: metricEvidence.metricValueId,
        startMonth: sql<string>`to_char(${metricDefinitionValues.reportingPeriodStart}, 'YYYY-MM')`,
        endMonth: sql<string>`to_char(${metricDefinitionValues.reportingPeriodEnd}, 'YYYY-MM')`,
      }).from(metricEvidence)
        .innerJoin(metricDefinitionValues, eq(metricEvidence.metricValueId, metricDefinitionValues.id))
        .where(and(eq(metricEvidence.id, id), eq(metricDefinitionValues.businessId, businessId)))
        .limit(1);
      if (!scope) return false;
      await acquireUnlockedReportingRange(tx, businessId, scope.startMonth, scope.endMonth);

      const [value] = await tx.select().from(metricDefinitionValues).where(and(
        eq(metricDefinitionValues.id, scope.metricValueId),
        eq(metricDefinitionValues.businessId, businessId),
      )).limit(1).for("update");
      if (!value) return false;
      if (value.status !== "draft") {
        throw Object.assign(new Error("Evidence cannot be changed after a canonical metric value is submitted for review"), {
          status: 409,
          code: "VALUE_PROTECTED",
        });
      }
      const deleted = await tx.delete(metricEvidence).where(and(
        eq(metricEvidence.id, id),
        eq(metricEvidence.metricValueId, value.id),
      )).returning({ id: metricEvidence.id });
      return deleted.length === 1;
    });
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

  async getFrameworkRequirement(id: string): Promise<FrameworkRequirement | undefined> {
    const [row] = await db.select().from(frameworkRequirements)
      .where(eq(frameworkRequirements.id, id))
      .limit(1);
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

  async getFrameworkRequirementResponses(
    companyId: string,
    filters: { frameworkRequirementId?: string; period?: string; siteId?: string | null } = {},
  ): Promise<FrameworkRequirementResponse[]> {
    const conditions: any[] = [eq(frameworkRequirementResponses.companyId, companyId)];
    if (filters.frameworkRequirementId) {
      conditions.push(eq(frameworkRequirementResponses.frameworkRequirementId, filters.frameworkRequirementId));
    }
    if (filters.period) conditions.push(eq(frameworkRequirementResponses.period, filters.period));
    if (filters.siteId !== undefined) {
      conditions.push(filters.siteId === null
        ? isNull(frameworkRequirementResponses.siteId)
        : eq(frameworkRequirementResponses.siteId, filters.siteId));
    }
    return db.select().from(frameworkRequirementResponses)
      .where(and(...conditions))
      .orderBy(desc(frameworkRequirementResponses.updatedAt));
  }

  async getFrameworkRequirementResponse(id: string, companyId: string): Promise<FrameworkRequirementResponse | undefined> {
    const [response] = await db.select().from(frameworkRequirementResponses)
      .where(and(
        eq(frameworkRequirementResponses.id, id),
        eq(frameworkRequirementResponses.companyId, companyId),
      ))
      .limit(1);
    return response;
  }

  async upsertFrameworkRequirementResponse(input: {
    companyId: string;
    frameworkRequirementId: string;
    period: string;
    siteId: string | null;
    responseText: string | null;
    linkedEntityType: "policy" | "target" | "risk" | null;
    linkedEntityId: string | null;
    workflowStatus: "draft" | "submitted";
    actorUserId: string;
  }): Promise<FrameworkRequirementResponse> {
    const lockKey = `framework_requirement_response:${input.companyId}:${input.frameworkRequirementId}:${input.period}:${input.siteId ?? "__org__"}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);

      const existingResult = input.siteId === null
        ? await client.query(
            `SELECT id FROM framework_requirement_responses
             WHERE company_id = $1 AND framework_requirement_id = $2 AND period = $3 AND site_id IS NULL
             LIMIT 1 FOR UPDATE`,
            [input.companyId, input.frameworkRequirementId, input.period],
          )
        : await client.query(
            `SELECT id FROM framework_requirement_responses
             WHERE company_id = $1 AND framework_requirement_id = $2 AND period = $3 AND site_id = $4
             LIMIT 1 FOR UPDATE`,
            [input.companyId, input.frameworkRequirementId, input.period, input.siteId],
          );

      const existingId = existingResult.rows[0]?.id as string | undefined;
      const submittedAt = input.workflowStatus === "submitted" ? new Date() : null;
      const submittedByUserId = input.workflowStatus === "submitted" ? input.actorUserId : null;
      const result = existingId
        ? await client.query(
            `UPDATE framework_requirement_responses
             SET response_text = $2,
                 linked_entity_type = $3,
                 linked_entity_id = $4,
                 workflow_status = $5,
                 updated_by_user_id = $6,
                 submitted_by_user_id = $7,
                 submitted_at = $8,
                 reviewed_by_user_id = NULL,
                 reviewed_at = NULL,
                 review_comment = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
              existingId,
              input.responseText,
              input.linkedEntityType,
              input.linkedEntityId,
              input.workflowStatus,
              input.actorUserId,
              submittedByUserId,
              submittedAt,
            ],
          )
        : await client.query(
            `INSERT INTO framework_requirement_responses (
               company_id, framework_requirement_id, period, site_id, response_text,
               linked_entity_type, linked_entity_id, workflow_status,
               created_by_user_id, updated_by_user_id, submitted_by_user_id, submitted_at,
               created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, NOW(), NOW())
             RETURNING *`,
            [
              input.companyId,
              input.frameworkRequirementId,
              input.period,
              input.siteId,
              input.responseText,
              input.linkedEntityType,
              input.linkedEntityId,
              input.workflowStatus,
              input.actorUserId,
              submittedByUserId,
              submittedAt,
            ],
          );

      await client.query("COMMIT");
      return pgRowToCamelCase<FrameworkRequirementResponse>(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async reviewFrameworkRequirementResponse(
    id: string,
    companyId: string,
    input: {
      workflowStatus: "approved" | "rejected";
      reviewComment?: string | null;
      reviewerUserId: string;
    },
  ): Promise<FrameworkRequirementResponse | undefined> {
    const [response] = await db.update(frameworkRequirementResponses)
      .set({
        workflowStatus: input.workflowStatus,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewComment: input.reviewComment ?? null,
        updatedByUserId: input.reviewerUserId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(frameworkRequirementResponses.id, id),
        eq(frameworkRequirementResponses.companyId, companyId),
        eq(frameworkRequirementResponses.workflowStatus, "submitted"),
      ))
      .returning();
    return response;
  }

  async getFrameworkReadiness(
    businessId: string,
    filters: { period?: string; siteId?: string | null; frameworkCodes?: string[] } = {},
  ): Promise<any> {
    const selections = await this.getBusinessFrameworkSelections(businessId);
    const enabledFrameworkIds = selections.filter(s => s.isEnabled).map(s => s.frameworkId);
    const allFrameworks = await this.getFrameworks(true);
    const requestedFrameworkCodes = new Set(
      (filters.frameworkCodes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean),
    );
    const selectedFrameworks = requestedFrameworkCodes.size > 0
      ? allFrameworks.filter((framework) => requestedFrameworkCodes.has(framework.code.toUpperCase()))
      : allFrameworks.filter((framework) => enabledFrameworkIds.includes(framework.id));
    if (selectedFrameworks.length === 0) return [];

    const allReqs = await this.getAllFrameworkRequirements();
    const allMappings = await this.getAllMappings();

    const metricDefs = await this.getMetricDefinitions({ isActive: true });
    const activeMetricDefIds = new Set(metricDefs.map(m => m.id));
    const metricDefinitionIdByName = new Map(
      metricDefs.map((definition) => [normalizeFrameworkMetricName(definition.name), definition.id]),
    );

    // Whole-organisation readiness includes organisation-level facts and facts
    // from the organisation's current operating boundary. Historical records
    // attached only to archived (or otherwise unknown) sites must not keep a
    // current readiness requirement covered. Explicit organisation/site scopes
    // retain their existing exact-match semantics.
    const activeSiteIds = filters.siteId === undefined
      ? new Set((await this.getSites(businessId, false)).map((site) => site.id))
      : null;
    const siteIsWithinReadinessBoundary = (siteId: string | null | undefined): boolean => {
      if (filters.siteId === null) return siteId === null || siteId === undefined;
      if (typeof filters.siteId === "string") return siteId === filters.siteId;
      return siteId === null || siteId === undefined || activeSiteIds!.has(siteId);
    };

    const requestedPeriod = filters.period?.trim() || undefined;
    let resolvedPeriod = requestedPeriod;
    let periodBounds: { start: Date; end: Date } | null = null;
    let requestedPeriodDateKeys: { start: string; end: string } | null = null;
    if (requestedPeriod) {
      const reportingPeriod = (await this.getReportingPeriods(businessId)).find((period) =>
        period.id === requestedPeriod || period.name === requestedPeriod,
      );
      if (reportingPeriod) {
        resolvedPeriod = reportingPeriod.name;
        periodBounds = {
          start: new Date(reportingPeriod.startDate),
          end: new Date(reportingPeriod.endDate),
        };
        requestedPeriodDateKeys = {
          start: localCalendarDateKey(reportingPeriod.startDate),
          end: localCalendarDateKey(reportingPeriod.endDate),
        };
      } else {
        periodBounds = parseFrameworkReadinessPeriod(requestedPeriod);
        if (periodBounds) {
          requestedPeriodDateKeys = {
            start: utcCalendarDateKey(periodBounds.start),
            end: utcCalendarDateKey(periodBounds.end),
          };
        }
      }
    }

    const canonicalValues = (requestedPeriod && !periodBounds
      ? []
      : await this.getMetricDefinitionValues(businessId, {
          siteId: filters.siteId,
          periodStart: periodBounds?.start,
          periodEnd: periodBounds?.end,
        })).filter((value) => siteIsWithinReadinessBoundary(value.siteId));

    const legacyPeriodCoverage = (valuePeriod: string): "full" | "subperiod" | null => {
      if (!requestedPeriod) return "full";
      if (valuePeriod === requestedPeriod || valuePeriod === resolvedPeriod) return "full";
      if (!requestedPeriodDateKeys) return null;

      const valueBounds = parseFrameworkReadinessPeriod(valuePeriod);
      if (!valueBounds) return null;
      const valueDateKeys = {
        start: utcCalendarDateKey(valueBounds.start),
        end: utcCalendarDateKey(valueBounds.end),
      };
      if (
        valueDateKeys.start < requestedPeriodDateKeys.start
        || valueDateKeys.end > requestedPeriodDateKeys.end
      ) {
        return null;
      }
      return valueDateKeys.start === requestedPeriodDateKeys.start
        && valueDateKeys.end === requestedPeriodDateKeys.end
        ? "full"
        : "subperiod";
    };

    const legacyConditions: any[] = [eq(metrics.companyId, businessId)];
    // Known annual/quarterly/monthly bounds need all contained legacy rows so
    // that, for example, a monthly Data Entry fact is visible as partial annual
    // coverage. Unparseable custom periods retain exact-match behaviour.
    if (resolvedPeriod && !requestedPeriodDateKeys) legacyConditions.push(eq(metricValues.period, resolvedPeriod));
    if (filters.siteId !== undefined) {
      legacyConditions.push(filters.siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, filters.siteId));
    }
    const legacyValues = (await db.select({
      valueId: metricValues.id,
      metricId: metricValues.metricId,
      metricDefinitionId: metricValues.metricDefinitionId,
      metricName: metrics.name,
      period: metricValues.period,
      siteId: metricValues.siteId,
      value: metricValues.value,
      valueNumeric: metricValues.valueNumeric,
      valueText: metricValues.valueText,
      valueBoolean: metricValues.valueBoolean,
      valueJson: metricValues.valueJson,
      workflowStatus: metricValues.workflowStatus,
    }).from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(...legacyConditions)))
      .flatMap((value) => {
        if (!siteIsWithinReadinessBoundary(value.siteId)) return [];
        const periodCoverage = legacyPeriodCoverage(value.period);
        return periodCoverage ? [{ ...value, periodCoverage }] : [];
      });

    const canonicalEvidenceCounts = new Map<string, number>();
    if (canonicalValues.length > 0) {
      const canonicalEvidenceRows = await db.select({
        metricValueId: metricEvidence.metricValueId,
      }).from(metricEvidence)
        .innerJoin(metricDefinitionValues, eq(metricEvidence.metricValueId, metricDefinitionValues.id))
        .where(and(
          eq(metricDefinitionValues.businessId, businessId),
          inArray(metricDefinitionValues.id, canonicalValues.map((value) => value.id)),
        ));
      for (const evidence of canonicalEvidenceRows) {
        canonicalEvidenceCounts.set(
          evidence.metricValueId,
          (canonicalEvidenceCounts.get(evidence.metricValueId) ?? 0) + 1,
        );
      }
    }

    const companyEvidence = (await this.getEvidenceFiles(businessId, filters.siteId))
      .filter((evidence) => siteIsWithinReadinessBoundary(evidence.siteId));
    const metricFacts: FrameworkMetricFact[] = canonicalValues.map((value) => {
      const coversFullRequestedPeriod = !requestedPeriodDateKeys || (
        localCalendarDateKey(value.reportingPeriodStart) === requestedPeriodDateKeys.start
        && localCalendarDateKey(value.reportingPeriodEnd) === requestedPeriodDateKeys.end
      );
      return {
        businessId,
        valueId: value.id,
        metricDefinitionId: value.metricDefinitionId,
        siteId: value.siteId,
        period: resolvedPeriod ?? `${value.reportingPeriodStart.toISOString()}/${value.reportingPeriodEnd.toISOString()}`,
        periodCoverage: coversFullRequestedPeriod ? "full" : "subperiod",
        valueNumeric: value.valueNumeric,
        valueText: value.valueText,
        valueBoolean: value.valueBoolean,
        valueJson: value.valueJson,
        approvalStatus: value.status,
        evidenceCount: canonicalEvidenceCounts.get(value.id) ?? 0,
        approvedEvidenceCount: 0,
      };
    });

    for (const value of legacyValues) {
      const metricDefinitionId = value.metricDefinitionId && activeMetricDefIds.has(value.metricDefinitionId)
        ? value.metricDefinitionId
        : metricDefinitionIdByName.get(normalizeFrameworkMetricName(value.metricName));
      if (!metricDefinitionId) continue;

      const linkedEvidence = companyEvidence.filter((evidence) => {
        if (!isUsableEvidenceStatus(evidence.evidenceStatus)) return false;
        const linkedToValue = evidence.linkedModule === "metric_value" && evidence.linkedEntityId === value.valueId;
        const linkedToMetric = evidence.metricId === value.metricId ||
          (evidence.linkedModule === "metric" && evidence.linkedEntityId === value.metricId);
        if (!linkedToValue && !linkedToMetric) return false;
        if (!resolvedPeriod || linkedToValue) return true;
        return evidence.linkedPeriod === resolvedPeriod;
      });

      metricFacts.push({
        businessId,
        valueId: value.valueId,
        metricDefinitionId,
        siteId: value.siteId,
        // Contained legacy rows participate in the requested readiness scope;
        // periodCoverage retains whether the row itself spans the whole scope.
        period: resolvedPeriod ?? value.period,
        valueNumeric: value.valueNumeric ?? value.value,
        valueText: value.valueText,
        valueBoolean: value.valueBoolean,
        valueJson: value.valueJson,
        approvalStatus: value.workflowStatus,
        periodCoverage: value.periodCoverage,
        evidenceCount: linkedEvidence.length,
        approvedEvidenceCount: linkedEvidence.filter((evidence) =>
          evidence.evidenceStatus === "approved" || evidence.evidenceStatus === "reviewed",
        ).length,
      });
    }

    const requirementEvidenceFacts: FrameworkRequirementEvidenceFact[] = companyEvidence
      .filter((evidence) => {
        const linkedModule = (evidence.linkedModule ?? "").replace(/[-_]/g, "").toLowerCase();
        return linkedModule === "frameworkrequirement" && Boolean(evidence.linkedEntityId);
      })
      .map((evidence) => ({
        businessId,
        requirementId: evidence.linkedEntityId!,
        siteId: evidence.siteId,
        period: evidence.linkedPeriod,
        evidenceStatus: evidence.evidenceStatus,
      }));

    const responseRows = (await this.getFrameworkRequirementResponses(businessId, {
      period: resolvedPeriod,
      siteId: filters.siteId,
    })).filter((response) => siteIsWithinReadinessBoundary(response.siteId));
    const [companyPolicies, companyTargets, companyRisks] = await Promise.all([
      this.getPolicyRecords(businessId),
      this.getEsgTargets(businessId),
      this.getEsgRisks(businessId),
    ]);
    const policyById = new Map(companyPolicies.map((policy) => [policy.id, policy]));
    const targetById = new Map(companyTargets.map((target) => [target.id, target]));
    const riskById = new Map(companyRisks.map((risk) => [risk.id, risk]));
    const requirementResponseFacts: FrameworkRequirementResponseFact[] = responseRows.map((response) => {
      let sourceIsEligible = response.linkedEntityType === null;
      if (response.linkedEntityType === "policy") {
        const source = response.linkedEntityId ? policyById.get(response.linkedEntityId) : undefined;
        sourceIsEligible = Boolean(source && frameworkResponseSourceIsEligible({
          linkedEntityType: "policy",
          status: source.status,
        }));
      } else if (response.linkedEntityType === "target") {
        const source = response.linkedEntityId ? targetById.get(response.linkedEntityId) : undefined;
        sourceIsEligible = Boolean(source && frameworkResponseSourceIsEligible({
          linkedEntityType: "target",
          status: source.status,
          targetValue: source.targetValue,
          targetYear: source.targetYear,
        }));
      } else if (response.linkedEntityType === "risk") {
        const source = response.linkedEntityId ? riskById.get(response.linkedEntityId) : undefined;
        sourceIsEligible = Boolean(source && frameworkResponseSourceIsEligible({
          linkedEntityType: "risk",
          status: source.status,
          riskScore: source.riskScore,
        }));
      }

      return {
        businessId,
        requirementId: response.frameworkRequirementId,
        siteId: response.siteId,
        period: response.period,
        responseText: response.responseText,
        linkedEntityType: response.linkedEntityType,
        linkedEntityId: response.linkedEntityId,
        responseStatus: response.workflowStatus,
        sourceIsEligible,
      };
    });

    const scope: FrameworkReadinessScope = {
      businessId,
      period: resolvedPeriod,
      siteId: filters.siteId,
    };

    const result = [];

    for (const framework of selectedFrameworks) {
      const reqs = allReqs.filter(r => r.frameworkId === framework.id);

      const reqReadiness = reqs.map(req => {
        const evaluation = evaluateFrameworkRequirement({
          requirement: req,
          mappings: allMappings,
          metricDefinitions: metricDefs,
          metricFacts,
          requirementEvidenceFacts,
          requirementResponseFacts,
          scope,
        });
        return {
          ...req,
          ...evaluation,
        };
      });

      const covered = reqReadiness.filter(r => r.status === "covered").length;
      const partial = reqReadiness.filter(r => r.status === "partial").length;
      const missing = reqReadiness.filter(r => r.status === "missing").length;
      const total = reqs.length;
      const responseFacts = reqReadiness.reduce((sum, requirement) => sum + requirement.factSummary.requirementResponses, 0);
      const approvedResponseFacts = reqReadiness.reduce((sum, requirement) => sum + requirement.factSummary.approvedRequirementResponses, 0);
      const evidenceFacts = reqReadiness.reduce((sum, requirement) => sum + requirement.factSummary.requirementLinkedEvidence, 0);
      const approvedEvidenceFacts = reqReadiness.reduce((sum, requirement) => sum + requirement.factSummary.approvedRequirementLinkedEvidence, 0);

      const priorityCoreReqs = reqReadiness
        .filter(r => r.status !== "covered" && r.mandatoryLevel === "core")
        .sort((a, b) => (a.status === "missing" ? 0 : 1) - (b.status === "missing" ? 0 : 1));
      const nextBestActions = priorityCoreReqs.slice(0, 3).map(r => ({
        requirementCode: r.code,
        title: r.title,
        action: r.additionalNeeded[0] ?? "Complete this requirement",
      }));

      result.push({
        framework,
        requirements: reqReadiness,
        summary: { covered, partial, missing, total, responseFacts, approvedResponseFacts, evidenceFacts, approvedEvidenceFacts },
        nextBestActions,
        scope: {
          period: resolvedPeriod ?? null,
          siteMode: filters.siteId === undefined ? "all" : filters.siteId === null ? "organisation" : "site",
          siteId: typeof filters.siteId === "string" ? filters.siteId : null,
        },
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
    const mutable = pickMutableFields(data, MATERIAL_TOPIC_MUTABLE_FIELDS) as Partial<MaterialTopic>;
    const [t] = await db.update(materialTopics)
      .set(mutable)
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

  async createMaterialityAssessment(data: InsertBusinessMaterialityAssessment, actorUserId?: string): Promise<BusinessMaterialityAssessment> {
    const mutable = pickMutableFields(data, MATERIALITY_ASSESSMENT_MUTABLE_FIELDS);
    const completion = mutable.status === "completed"
      ? { completedAt: new Date(), completedBy: actorUserId ?? null }
      : {};
    const [a] = await db.insert(businessMaterialityAssessments)
      .values({ ...mutable, ...completion, companyId: data.companyId } as InsertBusinessMaterialityAssessment)
      .returning();
    return a;
  }

  async updateMaterialityAssessment(
    id: string,
    companyId: string,
    data: Partial<BusinessMaterialityAssessment>,
    actorUserId?: string,
  ): Promise<BusinessMaterialityAssessment | undefined> {
    const mutable = pickMutableFields(data, MATERIALITY_ASSESSMENT_MUTABLE_FIELDS) as Partial<BusinessMaterialityAssessment>;
    const completion = mutable.status === "completed"
      ? { completedAt: new Date(), completedBy: actorUserId ?? null }
      : mutable.status !== undefined
        ? { completedAt: null, completedBy: null }
        : {};
    const [a] = await db.update(businessMaterialityAssessments)
      .set({ ...mutable, ...completion, updatedAt: new Date() })
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
    const mutable = pickMutableFields(data, POLICY_RECORD_MUTABLE_FIELDS);
    const [r] = await db.insert(policyRecords)
      .values({ ...mutable, companyId: data.companyId } as InsertPolicyRecord)
      .returning();
    return r;
  }

  async updatePolicyRecord(id: string, companyId: string, data: Partial<PolicyRecord>): Promise<PolicyRecord | undefined> {
    const mutable = pickMutableFields(data, POLICY_RECORD_MUTABLE_FIELDS) as Partial<PolicyRecord>;
    const [r] = await db.update(policyRecords)
      .set({ ...mutable, updatedAt: new Date() })
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
    const mutable = pickMutableFields(data, GOVERNANCE_ASSIGNMENT_MUTABLE_FIELDS) as Partial<InsertGovernanceAssignment>;
    const existing = await db.select().from(governanceAssignments)
      .where(and(eq(governanceAssignments.companyId, companyId), eq(governanceAssignments.area, area as any)));
    if (existing.length > 0) {
      const [r] = await db.update(governanceAssignments)
        .set({ ...mutable, updatedAt: new Date() })
        .where(and(eq(governanceAssignments.companyId, companyId), eq(governanceAssignments.area, area as any)))
        .returning();
      return r;
    } else {
      const [r] = await db.insert(governanceAssignments)
        .values({ ...mutable, companyId, area: area as any } as any)
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
    const mutable = pickMutableFields(data, ESG_TARGET_MUTABLE_FIELDS);
    const [t] = await db.insert(esgTargets).values({ ...mutable, companyId: data.companyId } as InsertEsgTarget).returning();
    return t;
  }

  async updateEsgTarget(id: string, companyId: string, data: Partial<EsgTarget>): Promise<EsgTarget | undefined> {
    const mutable = pickMutableFields(data, ESG_TARGET_MUTABLE_FIELDS) as Partial<EsgTarget>;
    const [t] = await db.update(esgTargets)
      .set({ ...mutable, updatedAt: new Date() })
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
    const mutable = pickMutableFields(data, ESG_ACTION_MUTABLE_FIELDS);
    const [a] = await db.insert(esgActions).values({ ...mutable, companyId: data.companyId } as InsertEsgAction).returning();
    return a;
  }

  async updateEsgAction(id: string, companyId: string, data: Partial<EsgAction>): Promise<EsgAction | undefined> {
    const mutable = pickMutableFields(data, ESG_ACTION_MUTABLE_FIELDS) as Partial<EsgAction>;
    const [a] = await db.update(esgActions)
      .set({ ...mutable, updatedAt: new Date() })
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
    const mutable = pickMutableFields(data, ESG_RISK_MUTABLE_FIELDS);
    const [r] = await db.insert(esgRisks).values({ ...mutable, companyId: data.companyId } as InsertEsgRisk).returning();
    return r;
  }

  async updateEsgRisk(id: string, companyId: string, data: Partial<EsgRisk>): Promise<EsgRisk | undefined> {
    const mutable = pickMutableFields(data, ESG_RISK_MUTABLE_FIELDS) as Partial<EsgRisk>;
    const [r] = await db.update(esgRisks)
      .set({ ...mutable, updatedAt: new Date() })
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
    const mutable = pickMutableFields(data, IDENTITY_PROVIDER_MUTABLE_FIELDS);
    const [p] = await db.insert(identityProviders)
      .values({ ...mutable, companyId: data.companyId, createdBy: data.createdBy } as InsertIdentityProvider)
      .returning();
    return p;
  }

  async updateIdentityProvider(id: string, companyId: string, data: Partial<IdentityProvider>): Promise<IdentityProvider | undefined> {
    const mutable = pickMutableFields(data, IDENTITY_PROVIDER_MUTABLE_FIELDS) as Partial<IdentityProvider>;
    const [p] = await db.update(identityProviders)
      .set({ ...mutable, updatedAt: new Date() })
      .where(and(eq(identityProviders.id, id), eq(identityProviders.companyId, companyId)))
      .returning();
    return p;
  }

  async deleteIdentityProvider(id: string, companyId: string): Promise<void> {
    await db.delete(identityProviders).where(and(eq(identityProviders.id, id), eq(identityProviders.companyId, companyId)));
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
    const [s] = await db.insert(userSessions).values({ ...data, lastSeenAt: sql`NOW()` } as any).returning();
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
    await db.update(userSessions).set({ lastSeenAt: sql`NOW()` } as any).where(eq(userSessions.sessionId, sessionId));
  }

  async revokeUserSession(sessionId: string): Promise<void> {
    await db.update(userSessions).set({ revokedAt: sql`NOW()` } as any).where(eq(userSessions.sessionId, sessionId));
  }

  async revokeAllUserSessionsExcept(userId: string, currentSessionId: string): Promise<number> {
    const result = await db.update(userSessions)
      .set({ revokedAt: sql`NOW()` } as any)
      .where(and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        sql`${userSessions.sessionId} != ${currentSessionId}`
      ))
      .returning();
    return result.length;
  }

  async setUserSessionStepUp(sessionId: string): Promise<void> {
    await db.update(userSessions).set({ stepUpAt: sql`NOW()` } as any).where(eq(userSessions.sessionId, sessionId));
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
        u.username AS user_name,
        cu.username AS created_by_name
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
