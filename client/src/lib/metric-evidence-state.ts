export const INLINE_METRIC_EVIDENCE_LABELS = {
  missing: "Evidence needed",
  source_linked: "Source linked",
  reviewed: "Reviewed",
  evidence_backed: "Evidence-backed",
} as const;

export type InlineMetricEvidenceState = keyof typeof INLINE_METRIC_EVIDENCE_LABELS;

type EvidenceWithStatus = {
  evidenceStatus?: string | null;
};

/**
 * Resolve the strongest assurance state exposed by the evidence API.
 * A stored file is linked evidence; review and approval are deliberately kept
 * distinct so an upload is never presented as assured before review.
 */
export function getInlineMetricEvidenceState(
  evidence: readonly EvidenceWithStatus[],
): InlineMetricEvidenceState {
  if (evidence.length === 0) return "missing";

  const statuses = new Set(
    evidence.map(item => item.evidenceStatus?.trim().toLowerCase()).filter(Boolean),
  );

  if (statuses.has("approved")) return "evidence_backed";
  if (statuses.has("reviewed")) return "reviewed";
  return "source_linked";
}
