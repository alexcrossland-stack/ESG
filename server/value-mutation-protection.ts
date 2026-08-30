import { evidenceFiles, metricEvidence, metrics, metricValues } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

export type ProtectedValueState = {
  locked?: boolean | null;
  dataSourceType?: string | null;
  workflowStatus?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | string | null;
  isUserReviewed?: boolean | null;
  hasEvidence?: boolean | null;
};

export type ValueProtectionReason = "locked" | "evidenced" | "workflow" | "reviewed";

export type CanonicalValueProtectionReason = "evidenced" | "workflow" | "calculated" | "authoritative";

export type CanonicalValueProtectionState = {
  status?: string | null;
  sourceType?: string | null;
  hasEvidence?: boolean | null;
};

export function getCanonicalValueProtectionReason(
  value: CanonicalValueProtectionState | null | undefined,
): CanonicalValueProtectionReason | null {
  if (!value) return null;
  if (value.hasEvidence) return "evidenced";
  if (value.status && value.status !== "draft") return "workflow";
  if (value.sourceType === "calculated") return "calculated";
  return null;
}

export function createCanonicalProtectedValueError(
  reason: CanonicalValueProtectionReason,
  details: Record<string, unknown> = {},
): Error & { status: number; code: string; details: Record<string, unknown> } {
  const message = reason === "evidenced"
    ? "This canonical metric value has linked evidence and cannot be changed until the evidence is removed."
    : reason === "workflow"
      ? "This canonical metric value is submitted, approved or rejected and must follow the workflow transition endpoints."
      : reason === "calculated"
        ? "This canonical metric value is calculated automatically and cannot be overwritten by direct data entry."
        : "This canonical metric value was entered from an authoritative source and cannot be overwritten by an automatic calculation.";
  return Object.assign(new Error(message), {
    status: 409,
    code: "VALUE_PROTECTED",
    details: { reason, ...details },
  });
}

export type MetricValueProtectionAssessment = {
  value: {
    id: string;
    metricId: string;
    period: string;
    siteId: string | null;
    locked: boolean | null;
    dataSourceType: string | null;
    workflowStatus: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
  };
  hasEvidence: boolean;
  reason: ValueProtectionReason | null;
};

export function getValueProtectionReason(value: ProtectedValueState | null | undefined): ValueProtectionReason | null {
  if (!value) return null;
  if (value.locked) return "locked";
  if (value.dataSourceType === "evidenced" || value.hasEvidence) return "evidenced";
  if (value.workflowStatus && value.workflowStatus !== "draft") return "workflow";
  if (value.reviewedBy || value.reviewedAt || value.isUserReviewed) return "reviewed";
  return null;
}

export function protectedValueMessage(entityLabel: string, reason: ValueProtectionReason): string {
  if (reason === "locked") return `${entityLabel} is locked and cannot be changed.`;
  if (reason === "evidenced") return `${entityLabel} has linked evidence and cannot be changed until that protection is removed.`;
  if (reason === "workflow") return `${entityLabel} is submitted, approved, rejected or archived and cannot be changed until it is returned to draft.`;
  return `${entityLabel} has been reviewed and cannot be changed until its review protection is removed.`;
}

export function createProtectedValueError(
  entityLabel: string,
  reason: ValueProtectionReason,
  details: Record<string, unknown> = {},
): Error & { status: number; code: string; details: Record<string, unknown> } {
  return Object.assign(new Error(protectedValueMessage(entityLabel, reason)), {
    status: 409,
    code: "VALUE_PROTECTED",
    details: { reason, ...details },
  });
}

/**
 * Load the protection state from the same database client that will perform a
 * metric-value mutation. This deliberately treats both evidence systems as
 * authoritative: evidence_files is used by the current UI/API and
 * metric_evidence contains canonical value-level attachments.
 */
export async function assessMetricValueProtection(
  mutationClient: any,
  options: { companyId: string; metricValueId: string; lockForUpdate?: boolean },
): Promise<MetricValueProtectionAssessment | null> {
  const baseQuery = mutationClient
    .select({
      id: metricValues.id,
      metricId: metricValues.metricId,
      period: metricValues.period,
      siteId: metricValues.siteId,
      locked: metricValues.locked,
      dataSourceType: metricValues.dataSourceType,
      workflowStatus: metricValues.workflowStatus,
      reviewedBy: metricValues.reviewedBy,
      reviewedAt: metricValues.reviewedAt,
      hasEvidence: sql<boolean>`(
        EXISTS (
          SELECT 1
          FROM ${evidenceFiles}
          WHERE ${evidenceFiles.companyId} = ${options.companyId}
            AND ${evidenceFiles.siteId} IS NOT DISTINCT FROM ${metricValues.siteId}
            AND ${evidenceFiles.evidenceStatus} IN ('uploaded', 'available', 'reviewed', 'approved')
            AND (${evidenceFiles.expiryDate} IS NULL OR ${evidenceFiles.expiryDate} >= NOW())
            AND (
              (${evidenceFiles.linkedModule} = 'metric_value' AND ${evidenceFiles.linkedEntityId} = ${metricValues.id})
              OR (
                ${evidenceFiles.linkedPeriod} = ${metricValues.period}
                AND (
                  ${evidenceFiles.metricId} = ${metricValues.metricId}
                  OR (${evidenceFiles.linkedModule} = 'metric' AND ${evidenceFiles.linkedEntityId} = ${metricValues.metricId})
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM ${metricEvidence}
          WHERE ${metricEvidence.metricValueId} = ${metricValues.id}
        )
      )`,
    })
    .from(metricValues)
    .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
    .where(and(
      eq(metrics.companyId, options.companyId),
      eq(metricValues.id, options.metricValueId),
    ))
    .limit(1);

  const rows = options.lockForUpdate ? await baseQuery.for("update") : await baseQuery;
  const value = rows[0];
  if (!value) return null;

  const hasEvidence = value.hasEvidence === true;
  const normalizedValue = value.dataSourceType === "evidenced" && !hasEvidence
    ? { ...value, dataSourceType: "manual" }
    : value;
  return {
    value: normalizedValue,
    hasEvidence,
    reason: getValueProtectionReason({ ...normalizedValue, hasEvidence }),
  };
}

/**
 * pg-client equivalent used by storage's advisory-lock upsert path. Keeping
 * the evidence joins and classification here prevents individual writers from
 * silently drifting to a weaker definition of "protected".
 */
export async function assessMetricValueProtectionWithPgClient(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  options: { companyId?: string; metricValueId: string; lockForUpdate?: boolean },
): Promise<MetricValueProtectionAssessment | null> {
  const result = await client.query(
    `
      SELECT
        mv.id,
        mv.metric_id AS "metricId",
        mv.period,
        mv.site_id AS "siteId",
        mv.locked,
        mv.data_source_type AS "dataSourceType",
        mv.workflow_status AS "workflowStatus",
        mv.reviewed_by AS "reviewedBy",
        mv.reviewed_at AS "reviewedAt",
        (
          EXISTS (
            SELECT 1
            FROM evidence_files ef
            WHERE ef.company_id = m.company_id
              AND ef.site_id IS NOT DISTINCT FROM mv.site_id
              AND ef.evidence_status IN ('uploaded', 'available', 'reviewed', 'approved')
              AND (ef.expiry_date IS NULL OR ef.expiry_date >= NOW())
              AND (
                (ef.linked_module = 'metric_value' AND ef.linked_entity_id = mv.id)
                OR (
                  ef.linked_period = mv.period
                  AND (
                    ef.metric_id = mv.metric_id
                    OR (ef.linked_module = 'metric' AND ef.linked_entity_id = mv.metric_id)
                  )
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM metric_evidence me
            WHERE me.metric_value_id = mv.id
          )
        ) AS "hasEvidence"
      FROM metric_values mv
      INNER JOIN metrics m ON m.id = mv.metric_id
      WHERE ($1::varchar IS NULL OR m.company_id = $1) AND mv.id = $2
      ${options.lockForUpdate ? "FOR UPDATE OF mv" : ""}
    `,
    [options.companyId ?? null, options.metricValueId],
  );
  const value = result.rows[0];
  if (!value) return null;

  const hasEvidence = value.hasEvidence === true;
  const normalizedValue = value.dataSourceType === "evidenced" && !hasEvidence
    ? { ...value, dataSourceType: "manual" }
    : value;
  return {
    value: normalizedValue,
    hasEvidence,
    reason: getValueProtectionReason({ ...normalizedValue, hasEvidence }),
  };
}
