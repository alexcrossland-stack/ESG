import {
  buildSmeImprovementPlan,
  type ControlCentreData,
  type ImprovementPlanItem,
} from "./sme-improvement-plan";

export interface OverviewTaskPermissions {
  canEnterData: boolean;
  canReview: boolean;
  canEditPolicies: boolean;
}

export interface OverviewTask extends ImprovementPlanItem {
  ownerLabel: string;
}

type Candidate = {
  item: ImprovementPlanItem;
  index: number;
  family: string;
  category: string | null;
};

function candidateFor(item: ImprovementPlanItem, index: number, data: ControlCentreData): Candidate {
  const source = data[item.type]?.find((entry) => entry.id === item.id);
  const isMetric = item.type === "missingData" || item.type === "lowQuality";
  const name = source && "name" in source && typeof source.name === "string" ? source.name : item.title;
  // A short Overview should not spend all three slots on headcount variants.
  // This only diversifies recommendations: each metric retains its own record/link.
  const isHeadcount = isMetric && /head\s*count|number of (employees|staff|workers)|full[ -]time equivalent|\bfte\b|^(total )?(employees|staff|workforce)( count| total)?$/i.test(name.trim());
  return {
    item,
    index,
    family: isHeadcount ? "metric:headcount" : isMetric ? `metric:${item.id}` : item.key,
    category: isMetric && source && "category" in source && typeof source.category === "string" ? source.category.trim().toLowerCase() || null : null,
  };
}

function mapTaskForPermissions(
  task: ImprovementPlanItem,
  data: ControlCentreData,
  permissions: OverviewTaskPermissions,
  month: string,
): OverviewTask {
  const result: OverviewTask = {
    ...task,
    ownerLabel: task.owner === "Unassigned"
      ? ["missingData", "lowQuality", "overdueActions"].includes(task.type) ? "Owner not assigned" : "Company-wide work"
      : `Owner: ${task.owner}`,
  };
  if (task.type === "missingData") result.evidenceOrResult = "No value recorded for the selected reporting period";
  const period = encodeURIComponent(month);
  if (task.type === "pendingApprovals" && !permissions.canReview) {
    const source = data.pendingApprovals.find((item) => item.id === task.id);
    result.title = `${source?.name || "Submitted information"} awaits review`;
    result.href = source?.entityType === "report" ? `/reports?period=${period}` : `/data-entry?period=${encodeURIComponent(source?.period || month)}`;
    result.actionLabel = source?.entityType === "report" ? "View reports" : "View data";
    result.why = "An Approver or Company Admin needs to review this submission.";
  } else if (task.type === "unapprovedPolicies") {
    const source = data.unapprovedPolicies.find((item) => item.id === task.id);
    result.title = `${source?.name || "ESG policy"} needs review`;
    result.actionLabel = permissions.canEditPolicies ? "Review policy" : "View policy";
    if (!permissions.canEditPolicies) result.why = "A Company Admin can prepare this policy for approval.";
  } else if (!permissions.canEnterData) {
    if (task.type === "missingData") {
      const source = data.missingData.find((item) => item.id === task.id);
      result.title = `Data needed: ${source?.name || "ESG figures"}`;
      result.actionLabel = "View data";
      result.why = "An Editor or Company Admin can add the figures needed for this reporting period.";
    } else if (task.type === "expiredEvidence") {
      const source = data.expiredEvidence.find((item) => item.id === task.id);
      result.title = `${source?.name || "Evidence"} has expired`;
      result.actionLabel = "View evidence";
      result.why = "An Editor or Company Admin can replace this source with current evidence.";
    } else if (task.type === "lowQuality") {
      result.actionLabel = "View data";
      result.why = "Review the source and ask an Editor or Company Admin to improve the supporting data.";
    } else if (task.type === "overdueActions") {
      result.actionLabel = "View action";
    }
  }
  return result;
}

/** Overview-only selection. The complete Action plan and its ordering are untouched. */
export function buildSmeOverviewTasks(
  data: ControlCentreData | null | undefined,
  permissions: OverviewTaskPermissions,
  month: string,
): OverviewTask[] {
  if (!data) return [];
  const candidates = buildSmeImprovementPlan(data, Number.MAX_SAFE_INTEGER)
    .map((item, index) => candidateFor(item, index, data));
  const selected: Candidate[] = [];
  const remaining = [...candidates];
  while (remaining.length && selected.length < 3) {
    // Date-sensitive work and submitted approvals always keep their original priority.
    // Diversity only reorders routine work, never pushes an urgent task out of view.
    const urgentIndex = remaining.findIndex(({ item }) => ["overdueActions", "expiredEvidence", "pendingApprovals"].includes(item.type));
    let nextIndex = urgentIndex;
    if (nextIndex < 0) {
      const score = (candidate: Candidate) => [
        Number(selected.some((entry) => entry.family === candidate.family)),
        Number(selected.some((entry) => entry.item.type === candidate.item.type)),
        Number(Boolean(candidate.category) && selected.some((entry) => entry.category === candidate.category)),
        candidate.index,
      ];
      nextIndex = remaining.reduce((bestIndex, candidate, index) => {
        const candidateScore = score(candidate);
        const bestScore = score(remaining[bestIndex]);
        const differingIndex = candidateScore.findIndex((value, position) => value !== bestScore[position]);
        return differingIndex >= 0 && candidateScore[differingIndex] < bestScore[differingIndex] ? index : bestIndex;
      }, 0);
    }
    selected.push(remaining.splice(nextIndex, 1)[0]);
  }
  return selected.map(({ item }) => mapTaskForPermissions(item, data, permissions, month));
}

export function formatOverviewTaskDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
