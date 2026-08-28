export type DataEntryWorkflowEntityType = "metric_value" | "raw_data";
export type DataEntryWorkflowStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

export interface DataEntryWorkflowRow {
  id?: string | null;
  workflowStatus?: string | null;
}

export interface DataEntryWorkflowItem {
  entityType: DataEntryWorkflowEntityType;
  entityId: string;
}

export interface DataEntryWorkflowCounts {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  archived: number;
}

export interface WorkflowSubmitResponse {
  requested: number;
  submitted: number;
  alreadySubmitted: number;
  alreadyApproved: number;
  ineligible: number;
  notFound: number;
  duplicates: number;
}

export function normalizeDataEntryWorkflowStatus(status: unknown): DataEntryWorkflowStatus {
  if (status === "submitted" || status === "approved" || status === "rejected" || status === "archived") {
    return status;
  }
  return "draft";
}

export function selectDataEntryWorkflowItems(
  metricValues: DataEntryWorkflowRow[],
  rawData: DataEntryWorkflowRow[],
  statuses: DataEntryWorkflowStatus[],
): DataEntryWorkflowItem[] {
  const wanted = new Set(statuses);
  const seen = new Set<string>();
  const items: DataEntryWorkflowItem[] = [];
  const add = (entityType: DataEntryWorkflowEntityType, rows: DataEntryWorkflowRow[]) => {
    for (const row of rows) {
      const entityId = typeof row.id === "string" ? row.id.trim() : "";
      if (!entityId || !wanted.has(normalizeDataEntryWorkflowStatus(row.workflowStatus))) continue;
      const key = `${entityType}:${entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ entityType, entityId });
    }
  };
  add("metric_value", metricValues);
  add("raw_data", rawData);
  return items;
}

export function summarizeDataEntryWorkflow(
  metricValues: DataEntryWorkflowRow[],
  rawData: DataEntryWorkflowRow[],
): DataEntryWorkflowCounts {
  const counts: DataEntryWorkflowCounts = {
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    archived: 0,
  };
  for (const row of [...metricValues, ...rawData]) {
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    counts.total += 1;
    counts[normalizeDataEntryWorkflowStatus(row.workflowStatus)] += 1;
  }
  return counts;
}

export function combineWorkflowSubmitResponses(
  requested: number,
  responses: WorkflowSubmitResponse[],
  requestFailures = 0,
  unconfirmed = 0,
) {
  const combined = responses.reduce((summary, response) => ({
    submitted: summary.submitted + response.submitted,
    alreadySubmitted: summary.alreadySubmitted + response.alreadySubmitted,
    alreadyApproved: summary.alreadyApproved + response.alreadyApproved,
    ineligible: summary.ineligible + response.ineligible,
    notFound: summary.notFound + response.notFound,
    duplicates: summary.duplicates + response.duplicates,
  }), {
    submitted: 0,
    alreadySubmitted: 0,
    alreadyApproved: 0,
    ineligible: 0,
    notFound: 0,
    duplicates: 0,
  });
  return { requested, requestFailures, unconfirmed, ...combined };
}

export function workflowSubmitNotice(result: ReturnType<typeof combineWorkflowSubmitResponses>) {
  const skipped = result.alreadySubmitted + result.alreadyApproved + result.ineligible + result.notFound;
  const details: string[] = [];
  if (skipped > 0) {
    details.push(`${skipped} item${skipped === 1 ? " was" : "s were"} skipped because ${skipped === 1 ? "its" : "their"} status changed or ${skipped === 1 ? "it was" : "they were"} no longer available.`);
  }
  if (result.requestFailures > 0) {
    details.push(`${result.unconfirmed} item outcome${result.unconfirmed === 1 ? "" : "s"} could not be confirmed across ${result.requestFailures} failed request${result.requestFailures === 1 ? "" : "s"}. Refresh before retrying.`);
  }
  return {
    title: `Submitted ${result.submitted} of ${result.requested} item${result.requested === 1 ? "" : "s"}`,
    description: details.length > 0 ? details.join(" ") : "All eligible draft items are awaiting review.",
    isPartial: result.requestFailures > 0 || skipped > 0,
  };
}

export function workflowReviewNotice(result: {
  requested: number;
  reviewed: number;
  notSubmitted: number;
  notFound: number;
}, action: "approve" | "reject") {
  const skipped = result.notSubmitted + result.notFound;
  return {
    title: `${action === "approve" ? "Approved" : "Rejected"} ${result.reviewed} of ${result.requested} item${result.requested === 1 ? "" : "s"}`,
    description: skipped > 0
      ? `${skipped} item${skipped === 1 ? " was" : "s were"} skipped because ${skipped === 1 ? "its" : "their"} status changed or ${skipped === 1 ? "it was" : "they were"} no longer available.`
      : "All selected items were updated.",
    isPartial: skipped > 0,
  };
}
