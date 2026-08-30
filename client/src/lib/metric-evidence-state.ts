export const INLINE_METRIC_EVIDENCE_LABELS = {
  missing: "Evidence needed",
  source_linked: "Source linked",
  reviewed: "Reviewed",
  evidence_backed: "Evidence-backed",
} as const;

export type InlineMetricEvidenceState = keyof typeof INLINE_METRIC_EVIDENCE_LABELS;

type EvidenceWithStatus = {
  evidenceStatus?: string | null;
  expiryDate?: string | Date | null;
};

const USABLE_EVIDENCE_STATUSES = new Set(["uploaded", "available", "reviewed", "approved"]);

/** Match the server assurance policy: only available files in an authoritative usable status provide coverage. */
export function isUsableMetricEvidence(
  evidence: EvidenceWithStatus,
  now: Date = new Date(),
): boolean {
  const status = evidence.evidenceStatus?.trim().toLowerCase() || "";
  if (!USABLE_EVIDENCE_STATUSES.has(status)) return false;
  if (!evidence.expiryDate) return true;
  const expiry = evidence.expiryDate instanceof Date ? evidence.expiryDate : new Date(evidence.expiryDate);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() >= now.getTime();
}

/**
 * Resolve the strongest assurance state exposed by the evidence API.
 * A stored file is linked evidence; review and approval are deliberately kept
 * distinct so an upload is never presented as assured before review.
 */
export function getInlineMetricEvidenceState(
  evidence: readonly EvidenceWithStatus[],
): InlineMetricEvidenceState {
  const usableEvidence = evidence.filter((item) => isUsableMetricEvidence(item));
  if (usableEvidence.length === 0) return "missing";

  const statuses = new Set(
    usableEvidence.map(item => item.evidenceStatus?.trim().toLowerCase()).filter(Boolean),
  );

  if (statuses.has("approved")) return "evidence_backed";
  if (statuses.has("reviewed")) return "reviewed";
  return "source_linked";
}
