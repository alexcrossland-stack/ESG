export type AssuranceEvidenceHistoryEntry = {
  id: string;
  fileName: string | null;
  status: string | null;
  linkedModule: string | null;
  linkedEntityId: string | null;
  metricId: string | null;
  linkedPeriod: string | null;
  siteId: string | null;
  uploadedAt: Date | string | null;
  uploadedBy: string | null;
  reviewedAt: Date | string | null;
  reviewedBy: string | null;
  reviewDate: Date | string | null;
  expiryDate: Date | string | null;
};

export function buildAssuranceEvidenceHistoryEntry(evidence: any): AssuranceEvidenceHistoryEntry {
  return {
    id: evidence.id,
    fileName: evidence.filename ?? evidence.fileName ?? null,
    status: evidence.evidenceStatus ?? evidence.status ?? null,
    linkedModule: evidence.linkedModule ?? null,
    linkedEntityId: evidence.linkedEntityId ?? null,
    metricId: evidence.metricId ?? null,
    linkedPeriod: evidence.linkedPeriod ?? null,
    siteId: evidence.siteId ?? null,
    uploadedAt: evidence.uploadedAt ?? evidence.createdAt ?? null,
    uploadedBy: evidence.uploadedBy ?? null,
    reviewedAt: evidence.reviewedAt ?? null,
    reviewedBy: evidence.reviewedBy ?? null,
    reviewDate: evidence.reviewDate ?? null,
    expiryDate: evidence.expiryDate ?? null,
  };
}
