import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const optionalNullableText = (max: number) => nullableText(max).optional();

const dateInput = z.string().trim().refine((value) => {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}, "Must be a valid date").transform((value) => new Date(value));

const nullableDateInput = z.union([dateInput, z.literal("").transform(() => null), z.null()]);

const decimalInput = z.union([
  z.number().finite().transform(String),
  z.string().trim().regex(/^-?(?:\d+\.?\d*|\.\d+)$/, "Must be a number"),
]);

const nullableDecimalInput = z.union([decimalInput, z.literal("").transform(() => null), z.null()]);
const pillar = z.enum(["environmental", "social", "governance"]);
const boundedIdList = z.array(z.string().trim().min(1).max(200)).max(100);

export const companySettingsMutationSchema = z.object({
  trackEnergy: z.boolean().optional(),
  trackWaste: z.boolean().optional(),
  trackWater: z.boolean().optional(),
  trackDiversity: z.boolean().optional(),
  trackTraining: z.boolean().optional(),
  trackHealthSafety: z.boolean().optional(),
  trackGovernance: z.boolean().optional(),
  requireApprovalMetrics: z.boolean().optional(),
  requireApprovalReports: z.boolean().optional(),
  requireApprovalPolicies: z.boolean().optional(),
  autoLockApproved: z.boolean().optional(),
  reportBrandingName: optionalNullableText(200),
  reportBrandingTagline: optionalNullableText(500),
  reportBrandingColor: optionalNullableText(30),
  reportBrandingFooter: optionalNullableText(1_000),
  emissionFactorSet: z.string().trim().max(80).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderFrequency: z.enum(["daily", "weekly"]).optional(),
}).strict();

export const metricMutationSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  description: optionalNullableText(2_000),
  category: pillar.optional(),
  unit: optionalNullableText(100),
  frequency: z.enum(["monthly", "quarterly", "annual"]).optional(),
  dataOwner: optionalNullableText(300),
  enabled: z.boolean().optional(),
  direction: optionalNullableText(100),
  targetValue: nullableDecimalInput.optional(),
  targetMin: nullableDecimalInput.optional(),
  targetMax: nullableDecimalInput.optional(),
  helpText: optionalNullableText(3_000),
  amberThreshold: nullableDecimalInput.optional(),
  redThreshold: nullableDecimalInput.optional(),
  weight: nullableDecimalInput.optional(),
  importance: z.enum(["standard", "important", "critical"]).optional(),
}).strict();

const actionPlanFields = {
  title: z.string().trim().min(1).max(300),
  description: optionalNullableText(4_000),
  owner: optionalNullableText(300),
  dueDate: nullableDateInput.optional(),
  status: z.enum(["not_started", "in_progress", "complete", "overdue"]).optional(),
  relatedMetricId: z.string().trim().min(1).max(200).nullable().optional(),
  notes: optionalNullableText(4_000),
};

export const actionPlanCreateSchema = z.object(actionPlanFields).strict();
export const actionPlanUpdateSchema = z.object({
  ...actionPlanFields,
  title: actionPlanFields.title.optional(),
}).strict();

export const questionnaireCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  source: optionalNullableText(500),
  questions: z.array(z.string().trim().min(1).max(2_000)).min(1).max(500),
  siteId: z.string().trim().min(1).max(200).nullable().optional(),
  reportingPeriodId: z.string().trim().min(1).max(200).nullable().optional(),
}).strict();

export const QUESTIONNAIRE_IMPORT_MAX_BYTES = 1_000_000;
const questionnaireImportFormat = z.enum(["text", "csv"], {
  errorMap: () => ({ message: "Format must be text or csv" }),
});

export const questionnaireImportSchema = z.object({
  format: questionnaireImportFormat,
  title: z.string().trim().min(1).max(300),
  // CSV expands by roughly one third when represented as base64. The route
  // also checks the decoded byte length before parsing.
  content: z.string().min(1).max(Math.ceil(QUESTIONNAIRE_IMPORT_MAX_BYTES / 3) * 4),
  siteId: z.string().trim().min(1).max(200).nullable().optional(),
  reportingPeriodId: z.string().trim().min(1).max(200).nullable().optional(),
}).strict();

export const questionnaireImportQuestionsSchema = z
  .array(z.string().trim().min(1).max(2_000))
  .min(1)
  .max(500);

export const questionnaireQuestionUserUpdateSchema = z.object({
  editedAnswer: z.string().max(20_000).nullable().optional(),
  approved: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const generatedPolicyUserUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(["draft", "approved", "published"]).optional(),
  content: z.unknown().optional(),
  policyOwner: optionalNullableText(300),
  approver: optionalNullableText(300),
  reviewDate: nullableDateInput.optional(),
  tone: z.enum(["simple_sme", "audit_ready"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const policyTemplateAdminUpdateSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  description: optionalNullableText(2_000),
  sections: z.unknown().optional(),
  questionnaire: z.unknown().optional(),
  complianceMapping: z.unknown().nullable().optional(),
  defaultReviewCycle: z.enum(["quarterly", "bi-annual", "annual", "every-2-years"]).optional(),
  enabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must use YYYY-MM-DD").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Must be a valid calendar date");

export const reportingPeriodMutationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  periodType: z.enum(["monthly", "quarterly", "annual"]),
  startDate: dateOnly,
  endDate: dateOnly,
}).strict();

export const estimateRequestSchema = z.object({
  period: z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])|-Q[1-4])?$/, "Invalid reporting period").optional(),
  metricIds: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
  force: z.boolean().optional().default(false),
  siteId: z.string().trim().min(1).max(200).nullable().optional(),
}).strict();

export const materialTopicMutationSchema = z.object({
  selected: z.boolean().optional(),
  financialMateriality: z.number().int().min(1).max(5).nullable().optional(),
  impactMateriality: z.number().int().min(1).max(5).nullable().optional(),
  rationale: optionalNullableText(5_000),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const materialityAssessmentFields = {
  assessmentYear: z.number().int().min(2000).max(2200),
  status: z.enum(["draft", "in_progress", "completed"]).optional(),
  notes: optionalNullableText(10_000),
};
export const materialityAssessmentCreateSchema = z.object(materialityAssessmentFields).strict();
export const materialityAssessmentUpdateSchema = z.object({
  ...materialityAssessmentFields,
  assessmentYear: materialityAssessmentFields.assessmentYear.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const governanceAssignmentMutationSchema = z.object({
  ownerName: optionalNullableText(300),
  ownerTitle: optionalNullableText(300),
  responsibilities: optionalNullableText(5_000),
}).strict();
export const governanceAreaSchema = z.enum(["environment", "social", "governance", "climate", "privacy_cyber"]);

const esgTargetFields = {
  title: z.string().trim().min(1).max(300),
  description: optionalNullableText(5_000),
  pillar,
  linkedMetricId: z.string().trim().min(1).max(200).nullable().optional(),
  linkedMetricDefinitionId: z.string().trim().min(1).max(200).nullable().optional(),
  baselineValue: nullableDecimalInput.optional(),
  baselineYear: z.number().int().min(1900).max(2200).nullable().optional(),
  targetValue: nullableDecimalInput.optional(),
  targetYear: z.number().int().min(1900).max(2200).nullable().optional(),
  owner: optionalNullableText(300),
  status: z.enum(["not_started", "in_progress", "achieved", "missed", "cancelled"]).optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  notes: optionalNullableText(10_000),
  linkedMaterialTopicIds: boundedIdList.optional(),
};
export const esgTargetCreateSchema = z.object(esgTargetFields).strict();
export const esgTargetUpdateSchema = z.object({ ...esgTargetFields, title: esgTargetFields.title.optional(), pillar: pillar.optional() }).strict();

const esgActionFields = {
  targetId: z.string().trim().min(1).max(200).nullable().optional(),
  riskId: z.string().trim().min(1).max(200).nullable().optional(),
  title: z.string().trim().min(1).max(300),
  description: optionalNullableText(5_000),
  owner: optionalNullableText(300),
  dueDate: nullableDateInput.optional(),
  status: z.enum(["not_started", "in_progress", "complete", "overdue", "cancelled"]).optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  notes: optionalNullableText(10_000),
};
export const esgActionCreateSchema = z.object(esgActionFields).strict();
export const esgActionUpdateSchema = z.object({ ...esgActionFields, title: esgActionFields.title.optional() }).strict();

const riskLevel = z.enum(["very_low", "low", "medium", "high", "very_high"]);
const esgRiskFields = {
  pillar,
  riskType: z.enum(["physical", "transition", "regulatory", "reputational", "supply_chain", "operational", "financial", "social", "governance", "other"]),
  title: z.string().trim().min(1).max(300),
  description: optionalNullableText(5_000),
  likelihood: riskLevel,
  impact: riskLevel,
  mitigationPlan: optionalNullableText(10_000),
  owner: optionalNullableText(300),
  reviewDate: nullableDateInput.optional(),
  status: z.enum(["open", "mitigated", "accepted", "closed"]).optional(),
  linkedMaterialTopicIds: boundedIdList.optional(),
};
export const esgRiskCreateSchema = z.object(esgRiskFields).strict();
export const esgRiskUpdateSchema = z.object({
  ...esgRiskFields,
  pillar: pillar.optional(),
  riskType: esgRiskFields.riskType.optional(),
  title: esgRiskFields.title.optional(),
  likelihood: riskLevel.optional(),
  impact: riskLevel.optional(),
}).strict();

export const identityProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  providerType: z.string().trim().min(1).max(100),
  domain: optionalNullableText(300),
  config: z.record(z.unknown()).nullable().optional(),
  isEnabled: z.boolean().optional(),
}).strict();
export const identityProviderUpdateSchema = identityProviderCreateSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export function apiValidationError(error: z.ZodError): { error: string; details: z.ZodIssue[] } {
  return {
    error: error.issues[0]?.message || "Invalid request payload",
    details: error.issues,
  };
}

export function calculateRiskScore(likelihood: string, impact: string): number {
  const values: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
  return (values[likelihood] ?? 3) * (values[impact] ?? 3);
}
