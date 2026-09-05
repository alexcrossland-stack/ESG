export type ControlCentreSection =
  | "overdueActions"
  | "missingData"
  | "expiredEvidence"
  | "lowQuality"
  | "unmetCompliance"
  | "pendingApprovals"
  | "unapprovedPolicies";

export interface ControlCentreData {
  gapScore: number;
  missingData: Array<{
    id: string;
    name: string;
    category: string;
    owner?: string | null;
    linkUrl: string;
    metricType?: string | null;
  }>;
  lowQuality: Array<{
    id: string;
    name: string;
    category: string;
    score: number;
    owner?: string | null;
    linkUrl: string;
  }>;
  expiredEvidence: Array<{
    id: string;
    name: string;
    expiryDate: string;
    linkedModule: string;
    linkUrl: string;
  }>;
  overdueActions: Array<{
    id: string;
    name: string;
    dueDate: string;
    owner?: string | null;
    linkUrl: string;
  }>;
  pendingApprovals: Array<{
    id: string;
    name: string;
    entityType: string;
    period?: string;
    linkUrl: string;
  }>;
  unapprovedPolicies: Array<{
    id: string;
    name: string;
    status: string;
    linkUrl: string;
  }>;
  unmetCompliance: Array<{
    id: string;
    code: string;
    title: string;
    framework: string;
    readinessStatus?: "partial" | "missing";
    nextStep?: string;
    linkUrl: string;
  }>;
  summary: Record<ControlCentreSection, number>;
}

export type ImprovementPlanStatusTone = "destructive" | "secondary" | "outline";

export interface ImprovementPlanItem {
  key: string;
  id: string;
  type: ControlCentreSection;
  title: string;
  owner: string;
  dueDate: string | null;
  status: string;
  statusTone: ImprovementPlanStatusTone;
  evidenceOrResult: string;
  why: string;
  href: string;
  actionLabel: string;
}

export const SME_IMPROVEMENT_PLAN_LIMIT = 5;

const SECTION_PRIORITY: ControlCentreSection[] = [
  "overdueActions",
  "expiredEvidence",
  "pendingApprovals",
  "missingData",
  "lowQuality",
  "unmetCompliance",
  "unapprovedPolicies",
];

function cleanOwner(owner?: string | null): string {
  if (owner && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(owner)) return "Assigned team member";
  return owner?.trim() || "Unassigned";
}

function humaniseStatus(status?: string): string {
  if (!status?.trim()) return "Not approved";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timestamp(value?: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function itemName(item: Record<string, unknown>): string {
  return String(item.name || item.title || item.code || "ESG task");
}

function sortSectionItems(section: ControlCentreSection, items: Array<Record<string, unknown>>) {
  return [...items].sort((left, right) => {
    if (section === "missingData") {
      const rank = (item: Record<string, unknown>) => (item.metricType && item.metricType !== "manual" ? 10 : 0) + (/electricity|employees|headcount/i.test(itemName(item)) ? 0 : 1);
      const priority = rank(left) - rank(right);
      if (priority) return priority;
    }
    if (section === "lowQuality") {
      const byScore = Number(left.score ?? 100) - Number(right.score ?? 100);
      if (byScore !== 0) return byScore;
    }

    if (section === "overdueActions") {
      const byDueDate = timestamp(left.dueDate as string | undefined) - timestamp(right.dueDate as string | undefined);
      if (byDueDate !== 0) return byDueDate;
    }

    if (section === "expiredEvidence") {
      const byExpiry = timestamp(left.expiryDate as string | undefined) - timestamp(right.expiryDate as string | undefined);
      if (byExpiry !== 0) return byExpiry;
    }

    return itemName(left).localeCompare(itemName(right));
  });
}

function toPlanItem(section: ControlCentreSection, item: Record<string, any>): ImprovementPlanItem {
  const id = String(item.id);
  const href = item.linkUrl || "/control-centre";

  switch (section) {
    case "overdueActions":
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: item.name || "Complete overdue action",
        owner: cleanOwner(item.owner),
        dueDate: item.dueDate || null,
        status: "Overdue",
        statusTone: "destructive",
        evidenceOrResult: "Result not yet recorded",
        why: "Finishing overdue work keeps commitments credible and the improvement plan moving.",
        href,
        actionLabel: "Open action",
      };
    case "missingData":
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: `${item.metricType && item.metricType !== "manual" ? "Complete source inputs for" : "Add"} ${item.name || "missing ESG data"}`,
        owner: cleanOwner(item.owner),
        dueDate: null,
        status: "Data needed",
        statusTone: "destructive",
        evidenceOrResult: "No value recorded for the current period",
        why: "Current-period data is needed for a complete baseline and reliable reporting.",
        href,
        actionLabel: item.metricType && item.metricType !== "manual" ? "Update source figures" : "Add data",
      };
    case "expiredEvidence":
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: `Replace ${item.name || "expired evidence"}`,
        owner: "Unassigned",
        dueDate: item.expiryDate || null,
        status: "Evidence expired",
        statusTone: "destructive",
        evidenceOrResult: "The current source has expired",
        why: "Current evidence makes your figures defensible for customers, lenders and assurance.",
        href,
        actionLabel: "Replace evidence",
      };
    case "lowQuality":
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: `Strengthen ${item.name || "ESG data"}`,
        owner: cleanOwner(item.owner),
        dueDate: null,
        status: "Check quality",
        statusTone: Number(item.score) < 20 ? "destructive" : "secondary",
        evidenceOrResult: `Quality score: ${Number(item.score) || 0}/100`,
        why: "Stronger source data increases confidence in the number and decisions based on it.",
        href,
        actionLabel: "Check data",
      };
    case "unmetCompliance": {
      const reference = [item.framework, item.code].filter(Boolean).join(" · ");
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: `Close ${item.code ? `${item.code}: ` : ""}${item.title || "framework gap"}`,
        owner: "Unassigned",
        dueDate: null,
        status: item.readinessStatus === "partial" ? "In progress" : "Missing",
        statusTone: item.readinessStatus === "missing" ? "destructive" : "secondary",
        evidenceOrResult: item.nextStep || (reference ? `${reference} is not yet ready` : "Requirement is not yet ready"),
        why: `Closing this requirement improves readiness for ${item.framework || "customer and framework"} requests.`,
        href,
        actionLabel: "Review gap",
      };
    }
    case "pendingApprovals":
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: `Review ${item.name || "submitted ESG information"}`,
        owner: "Unassigned",
        dueDate: null,
        status: "Awaiting review",
        statusTone: "secondary",
        evidenceOrResult: item.period ? `Submitted for ${item.period}; review not recorded` : "Review not yet recorded",
        why: "A review is needed before this information can be treated as final or shared.",
        href,
        actionLabel: "Review",
      };
    case "unapprovedPolicies":
      return {
        key: `${section}:${id}`,
        id,
        type: section,
        title: `Approve ${item.name || "ESG policy"}`,
        owner: "Unassigned",
        dueDate: null,
        status: "Policy review",
        statusTone: "outline",
        evidenceOrResult: `Current state: ${humaniseStatus(item.status)}`,
        why: "Approval turns this draft into a clear, usable company commitment.",
        href,
        actionLabel: "Review policy",
      };
  }
}

/**
 * Creates one short, deterministic work queue from the existing Control Centre
 * response. Section priority reflects urgency; dates and quality scores break
 * ties within a section so the most overdue or weakest item appears first.
 */
export function buildSmeImprovementPlan(
  data: ControlCentreData,
  maxItems = SME_IMPROVEMENT_PLAN_LIMIT,
): ImprovementPlanItem[] {
  const safeLimit = Math.max(0, Math.floor(maxItems));
  const plan = SECTION_PRIORITY.flatMap((section) =>
    sortSectionItems(section, (data[section] || []) as Array<Record<string, unknown>>)
      .map((item) => toPlanItem(section, item)),
  );

  return plan.slice(0, safeLimit);
}

export function countOpenImprovementItems(data: ControlCentreData): number {
  return SECTION_PRIORITY.reduce((total, section) => total + (data.summary?.[section] || 0), 0);
}
