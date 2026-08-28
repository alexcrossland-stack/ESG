/**
 * Storage-boundary allowlists for user-editable business fields.
 *
 * Route validation is the primary API contract. These allowlists are a
 * defence-in-depth invariant so an accidentally broad Partial<T> can never
 * change record identity, tenant/site ownership, workflow ownership, or audit
 * timestamps.
 */
export const COMPANY_SETTINGS_MUTABLE_FIELDS = [
  "trackEnergy",
  "trackWaste",
  "trackWater",
  "trackDiversity",
  "trackTraining",
  "trackHealthSafety",
  "trackGovernance",
  "requireApprovalMetrics",
  "requireApprovalReports",
  "requireApprovalPolicies",
  "autoLockApproved",
  "reportBrandingName",
  "reportBrandingTagline",
  "reportBrandingColor",
  "reportBrandingFooter",
  "emissionFactorSet",
  "reminderEnabled",
  "reminderFrequency",
] as const;

export const METRIC_MUTABLE_FIELDS = [
  "name",
  "description",
  "category",
  "unit",
  "frequency",
  "dataOwner",
  "enabled",
  "direction",
  "targetValue",
  "targetMin",
  "targetMax",
  "helpText",
  "amberThreshold",
  "redThreshold",
  "weight",
  "importance",
] as const;

export const ACTION_PLAN_MUTABLE_FIELDS = [
  "title",
  "description",
  "owner",
  "dueDate",
  "status",
  "relatedMetricId",
  "notes",
] as const;

export const QUESTIONNAIRE_MUTABLE_FIELDS = ["title", "source", "status"] as const;

export const QUESTIONNAIRE_QUESTION_MUTABLE_FIELDS = [
  "category",
  "suggestedAnswer",
  "editedAnswer",
  "confidence",
  "sourceRef",
  "rationale",
  "sourceData",
  "approved",
] as const;

export const POLICY_TEMPLATE_MUTABLE_FIELDS = [
  "name",
  "category",
  "description",
  "sections",
  "questionnaire",
  "complianceMapping",
  "defaultReviewCycle",
  "enabled",
] as const;

export const GENERATED_POLICY_MUTABLE_FIELDS = [
  "title",
  "status",
  "content",
  "policyOwner",
  "approver",
  "reviewDate",
  "tone",
] as const;

export const MATERIAL_TOPIC_MUTABLE_FIELDS = [
  "selected",
  "financialMateriality",
  "impactMateriality",
  "rationale",
] as const;

export const MATERIALITY_ASSESSMENT_MUTABLE_FIELDS = [
  "assessmentYear",
  "status",
  "notes",
] as const;

export const POLICY_RECORD_MUTABLE_FIELDS = [
  "title",
  "policyType",
  "owner",
  "status",
  "effectiveDate",
  "reviewDate",
  "documentLink",
  "notes",
  "linkedMaterialTopicIds",
] as const;

export const GOVERNANCE_ASSIGNMENT_MUTABLE_FIELDS = [
  "ownerName",
  "ownerTitle",
  "responsibilities",
] as const;

export const ESG_TARGET_MUTABLE_FIELDS = [
  "title",
  "description",
  "pillar",
  "linkedMetricId",
  "linkedMetricDefinitionId",
  "baselineValue",
  "baselineYear",
  "targetValue",
  "targetYear",
  "owner",
  "status",
  "progressPercent",
  "notes",
  "linkedMaterialTopicIds",
] as const;

export const ESG_ACTION_MUTABLE_FIELDS = [
  "targetId",
  "riskId",
  "title",
  "description",
  "owner",
  "dueDate",
  "status",
  "progressPercent",
  "notes",
] as const;

export const ESG_RISK_MUTABLE_FIELDS = [
  "pillar",
  "riskType",
  "title",
  "description",
  "likelihood",
  "impact",
  "riskScore",
  "mitigationPlan",
  "owner",
  "reviewDate",
  "status",
  "linkedMaterialTopicIds",
] as const;

export const IDENTITY_PROVIDER_MUTABLE_FIELDS = [
  "name",
  "providerType",
  "domain",
  "config",
  "isEnabled",
] as const;

export function pickMutableFields<T extends readonly string[]>(
  input: unknown,
  allowedFields: T,
): Partial<Record<T[number], unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result as Partial<Record<T[number], unknown>>;
}
