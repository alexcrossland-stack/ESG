import { storage } from "./storage";
import { isPeriodWithinDateRange } from "@shared/report-periods";
import { hasMetricReportedValue } from "@shared/data-entry-metrics";
import {
  filterMetricsDueForPeriod,
  isSiteWithinReportingBoundary,
  type CanonicalReportingContext,
} from "./reporting-context";

export type EsgState = "IN_PROGRESS" | "DRAFT" | "PROVISIONAL" | "CONFIRMED";

export interface EsgStatusResult {
  state: EsgState;
  label: string;
  plainMeaning: string;
  explanation: string;
  completenessPercentage: number;
  missingItems: string[];
  evidenceCoverage: number;
  evidenceConfidence: EvidenceConfidenceSummary;
  estimateCount: number;
  measuredCount: number;
  derivedCount: number;
  approvedCount: number;
  pendingApprovalCount: number;
  approvedCoverage: number;
  totalMetrics: number;
  filledMetrics: number;
  missingMetrics: number;
  nextRecommendedAction: string;
  minViableThresholdMet: boolean;
}

export interface EvidenceConfidenceSummary {
  sourceLinked: number;
  reviewed: number;
  evidenceBacked: number;
  independentlyAssured: number;
  sourceLinkedCoverage: number;
  reviewedCoverage: number;
  evidenceBackedCoverage: number;
}

type EvidenceForConfidence = {
  metricId?: string | null;
  linkedModule?: string | null;
  linkedEntityId?: string | null;
  linkedPeriod?: string | null;
  siteId?: string | null;
  evidenceStatus?: string | null;
  expiryDate?: Date | string | null;
  tags?: string[] | null;
};

type PeriodBoundedRecord = {
  period?: string | null;
  reportingPeriodStart?: Date | string | null;
  reportingPeriodEnd?: Date | string | null;
};

type CalendarPeriodBounds = {
  start: number;
  end: number;
};

function calendarDay(value: Date | string | null | undefined): number | null {
  if (!value) return null;

  let year: number;
  let month: number;
  let day: number;
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    if (Number.isNaN(value.getTime())) return null;
    year = value.getFullYear();
    month = value.getMonth() + 1;
    day = value.getDate();
  }

  const timestamp = Date.UTC(year, month - 1, day);
  const normalized = new Date(timestamp);
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
    ? timestamp
    : null;
}

function legacyPeriodBounds(period: string | null | undefined): CalendarPeriodBounds | null {
  if (!period) return null;

  const monthly = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]);
    return {
      start: Date.UTC(year, month - 1, 1),
      end: Date.UTC(year, month, 0),
    };
  }

  const quarterly = /^(\d{4})-Q([1-4])$/i.exec(period);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const startMonth = (Number(quarterly[2]) - 1) * 3;
    return {
      start: Date.UTC(year, startMonth, 1),
      end: Date.UTC(year, startMonth + 3, 0),
    };
  }

  const annual = /^(\d{4})$/.exec(period);
  if (annual) {
    const year = Number(annual[1]);
    return {
      start: Date.UTC(year, 0, 1),
      end: Date.UTC(year, 11, 31),
    };
  }

  return null;
}

function recordIsWithinReportingContext(
  record: PeriodBoundedRecord,
  reportingContext: CanonicalReportingContext,
): boolean {
  if (record.period === reportingContext.period.name) return true;

  const contextStart = calendarDay(reportingContext.period.startDate);
  const contextEnd = calendarDay(reportingContext.period.endDate);
  if (contextStart === null || contextEnd === null || contextStart > contextEnd) return false;

  const explicitStart = calendarDay(record.reportingPeriodStart);
  const explicitEnd = calendarDay(record.reportingPeriodEnd);
  const recordBounds = explicitStart !== null && explicitEnd !== null
    ? { start: explicitStart, end: explicitEnd }
    : legacyPeriodBounds(record.period);
  if (!recordBounds || recordBounds.start > recordBounds.end) return false;

  return recordBounds.start >= contextStart && recordBounds.end <= contextEnd;
}

const STATE_META: Record<EsgState, { label: string; shortLabel: string; plainMeaning: string }> = {
  IN_PROGRESS: {
    label: "Baseline in progress",
    shortLabel: "In progress",
    plainMeaning: "Add your first figures to establish your ESG baseline.",
  },
  DRAFT: {
    label: "ESG baseline — Draft",
    shortLabel: "Draft",
    plainMeaning: "Most figures are estimates. Replace them with measured data to improve confidence.",
  },
  PROVISIONAL: {
    label: "ESG baseline — Building confidence",
    shortLabel: "Provisional",
    plainMeaning: "Your baseline is taking shape. Add measured data and supporting evidence to make it share-ready.",
  },
  CONFIRMED: {
    label: "ESG baseline — Evidence-backed",
    shortLabel: "Confirmed",
    plainMeaning: "Your baseline has sufficient measured data and supporting evidence to share with appropriate caveats.",
  },
};

function buildExplanation(
  state: EsgState,
  estimatedPercent: number,
  completenessPercentage: number,
  evidenceCoverage: number,
  approvedCoverage = 100,
): string {
  switch (state) {
    case "IN_PROGRESS":
      return "Add your first figures to establish your ESG baseline.";
    case "DRAFT":
      return `${estimatedPercent}% of your figures are estimates — replace them with measured data to improve confidence.`;
    case "PROVISIONAL":
      if (approvedCoverage < 60) {
        return `Your baseline has data, but only ${approvedCoverage}% of tracked metrics have approved values for this reporting period.`;
      }
      return evidenceCoverage < 50
        ? `Your starter data is in place, but only ${evidenceCoverage}% of tracked metrics have supporting evidence.`
        : completenessPercentage < 60
          ? `Your baseline covers ${completenessPercentage}% of tracked metrics. Add relevant figures over time to improve confidence.`
          : "Looking good. Replace the remaining estimates with measured data to make the baseline evidence-backed.";
    case "CONFIRMED":
      return `Your baseline combines measured data with ${evidenceCoverage}% evidence coverage and is ready to share with its stated caveats.`;
  }
}

export function resolveEsgState({
  filledMetrics,
  estimatedPercent,
  completenessPercentage,
  evidenceCoverage,
  approvedCoverage = 100,
}: {
  filledMetrics: number;
  estimatedPercent: number;
  completenessPercentage: number;
  evidenceCoverage: number;
  approvedCoverage?: number;
}): EsgState {
  if (filledMetrics === 0) return "IN_PROGRESS";
  if (estimatedPercent > 50) return "DRAFT";
  if (estimatedPercent > 20 || completenessPercentage < 60 || evidenceCoverage < 50 || approvedCoverage < 60) {
    return "PROVISIONAL";
  }
  return "CONFIRMED";
}

export function calculateEvidenceCoverage(
  enabledMetricIds: string[],
  evidenceFiles: EvidenceForConfidence[],
  context: { period?: string; siteId?: string | null; now?: Date } = {},
): number {
  return calculateEvidenceConfidence(enabledMetricIds, evidenceFiles, context).evidenceBackedCoverage;
}

export function calculateEvidenceConfidence(
  enabledMetricIds: string[],
  evidenceFiles: EvidenceForConfidence[],
  context: { period?: string; siteId?: string | null; now?: Date } = {},
): EvidenceConfidenceSummary {
  if (enabledMetricIds.length === 0) {
    return {
      sourceLinked: 0,
      reviewed: 0,
      evidenceBacked: 0,
      independentlyAssured: 0,
      sourceLinkedCoverage: 0,
      reviewedCoverage: 0,
      evidenceBackedCoverage: 0,
    };
  }

  const enabledIds = new Set(enabledMetricIds);
  const now = context.now ?? new Date();
  const sourceLinkedIds = new Set<string>();
  const reviewedIds = new Set<string>();
  const evidenceBackedIds = new Set<string>();
  const independentlyAssuredIds = new Set<string>();

  const resolveMetricId = (evidence: EvidenceForConfidence): string | null => {
    if (evidence.metricId && enabledIds.has(evidence.metricId)) return evidence.metricId;
    if (
      (evidence.linkedModule === "metric" || evidence.linkedModule === "metrics")
      && evidence.linkedEntityId
      && enabledIds.has(evidence.linkedEntityId)
    ) {
      return evidence.linkedEntityId;
    }
    return null;
  };

  for (const evidence of evidenceFiles) {
    const metricId = resolveMetricId(evidence);
    if (!metricId) continue;

    if (context.period && evidence.linkedPeriod !== context.period) continue;
    if (context.siteId !== undefined && (evidence.siteId ?? null) !== context.siteId) continue;

    const expiresAt = evidence.expiryDate ? new Date(evidence.expiryDate) : null;
    const isCurrent = !expiresAt || expiresAt.getTime() >= now.getTime();
    const status = evidence.evidenceStatus ?? "pending";
    const isUsableStatus = ["uploaded", "available", "reviewed", "approved"].includes(status);
    if (!isCurrent || !isUsableStatus) continue;

    sourceLinkedIds.add(metricId);
    if (status === "reviewed" || status === "approved") reviewedIds.add(metricId);
    if (status === "approved") evidenceBackedIds.add(metricId);
    if (status === "approved" && evidence.tags?.includes("independently_assured")) {
      independentlyAssuredIds.add(metricId);
    }
  }

  const coverage = (count: number) => Math.min(100, Math.round((count / enabledMetricIds.length) * 100));

  return {
    sourceLinked: sourceLinkedIds.size,
    reviewed: reviewedIds.size,
    evidenceBacked: evidenceBackedIds.size,
    independentlyAssured: independentlyAssuredIds.size,
    sourceLinkedCoverage: coverage(sourceLinkedIds.size),
    reviewedCoverage: coverage(reviewedIds.size),
    evidenceBackedCoverage: coverage(evidenceBackedIds.size),
  };
}

function buildNextAction(
  state: EsgState,
  missingItems: string[],
  evidenceCoverage: number
): string {
  switch (state) {
    case "IN_PROGRESS":
      return "Enter your first figures — start with electricity use or headcount.";
    case "DRAFT":
      if (missingItems.length > 0) {
        return `Enter real data for: ${missingItems.slice(0, 3).join(", ")}${missingItems.length > 3 ? ` and ${missingItems.length - 3} more` : ""}.`;
      }
      return "Replace estimated figures with measured data to build confidence in your baseline.";
    case "PROVISIONAL":
      if (evidenceCoverage < 50) {
        return "Upload supporting documents — energy bills, invoices, or HR records — to back up your figures.";
      }
      if (missingItems.length > 0) {
        return `Fill in ${missingItems.length} remaining metric${missingItems.length === 1 ? "" : "s"} to strengthen your baseline.`;
      }
      return "Replace remaining estimates with real data to reach Confirmed.";
    case "CONFIRMED":
      return "Keep your data up to date and generate your ESG report.";
  }
}

export async function evaluateEsgStatus(
  companyId: string,
  periodOrContext?: string | CanonicalReportingContext,
  requestedSiteId?: string | null,
  dateRange: { dateFrom?: string; dateTo?: string } = {},
): Promise<EsgStatusResult> {
  const reportingContext = typeof periodOrContext === "object" && periodOrContext !== null
    ? periodOrContext
    : undefined;
  const period = reportingContext
    ? reportingContext.period.name
    : typeof periodOrContext === "string"
      ? periodOrContext
      : undefined;
  const siteId = reportingContext ? reportingContext.siteBoundary.siteId : requestedSiteId;
  const useDateRange = Boolean(dateRange.dateFrom || dateRange.dateTo);
  const useReportingContextBounds = Boolean(
    reportingContext?.period.startDate && reportingContext.period.endDate,
  );
  const metricScope = siteId === undefined
    ? { scope: "all" as const }
    : siteId === null
      ? { scope: "organisation" as const }
      : { scope: "site" as const, siteId };
  const [allMetrics, rawEvidenceFiles] = await Promise.all([
    storage.getMetrics(companyId),
    storage.getEvidenceFiles(
      companyId,
      siteId,
      useDateRange || useReportingContextBounds ? undefined : period,
    ),
  ]);
  const periodEvidenceFiles = useDateRange
    ? rawEvidenceFiles.filter((file) => isPeriodWithinDateRange(file.linkedPeriod, dateRange.dateFrom, dateRange.dateTo))
    : reportingContext
      ? rawEvidenceFiles.filter((file) => recordIsWithinReportingContext(
          { period: file.linkedPeriod },
          reportingContext,
        ))
    : rawEvidenceFiles;
  const evidenceFiles = reportingContext
    ? periodEvidenceFiles.filter((file) => isSiteWithinReportingBoundary(file.siteId, reportingContext.siteBoundary))
    : periodEvidenceFiles;

  const enabledMetrics = reportingContext
    ? filterMetricsDueForPeriod(allMetrics.filter((metric) => metric.enabled), reportingContext.period.periodType)
    : allMetrics.filter((metric) => metric.enabled);
  const totalMetrics = enabledMetrics.length;

  let filledMetrics = 0;
  let estimatedMetrics = 0;
  let measuredMetrics = 0;
  let derivedMetrics = 0;
  let approvedMetrics = 0;
  const missingMetricNames: string[] = [];

  for (const metric of enabledMetrics) {
    const vals = await storage.getMetricValuesForMetric(companyId, metric.id, metricScope);
    const latestVal = vals
      .filter((value) => !reportingContext || isSiteWithinReportingBoundary(value.siteId, reportingContext.siteBoundary))
      .filter((value) => useDateRange
        ? isPeriodWithinDateRange(value.period, dateRange.dateFrom, dateRange.dateTo)
        : reportingContext
          ? recordIsWithinReportingContext(value, reportingContext)
          : !period || value.period === period)
      .filter((value) => value.workflowStatus !== "rejected" && value.workflowStatus !== "archived")
      .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""))
      .find((value) => hasMetricReportedValue(value));

    if (latestVal) {
      filledMetrics++;
      if (latestVal.workflowStatus === "approved") approvedMetrics++;
      if (latestVal.dataSourceType === "estimated") {
        estimatedMetrics++;
      } else if (
        metric.metricType === "calculated"
        || metric.metricType === "derived"
        || latestVal.sourceType === "calculated"
        || latestVal.sourceType === "derived"
        || latestVal.notes === "Auto-calculated"
      ) {
        derivedMetrics++;
      } else {
        measuredMetrics++;
      }
    } else {
      missingMetricNames.push(metric.name ?? (metric as any).key ?? "Unknown metric");
    }
  }

  const missingCount = totalMetrics - filledMetrics;
  const completenessPercentage =
    totalMetrics > 0 ? Math.round((filledMetrics / totalMetrics) * 100) : 0;
  const estimatedPercent =
    totalMetrics > 0 ? Math.round((estimatedMetrics / totalMetrics) * 100) : 0;
  const approvedCoverage =
    totalMetrics > 0 ? Math.round((approvedMetrics / totalMetrics) * 100) : 0;

  const evidenceConfidence = calculateEvidenceConfidence(
    enabledMetrics.map((metric) => metric.id),
    evidenceFiles,
    { period: useDateRange || reportingContext ? undefined : period, siteId },
  );
  const evidenceCoverage = evidenceConfidence.evidenceBackedCoverage;

  const minViableThresholdMet =
    filledMetrics >= Math.min(3, totalMetrics) || completenessPercentage >= 30;

  const state = resolveEsgState({
    filledMetrics,
    estimatedPercent,
    completenessPercentage,
    evidenceCoverage,
    approvedCoverage,
  });

  const label = STATE_META[state].label;
  const plainMeaning = STATE_META[state].plainMeaning;
  const explanation = buildExplanation(state, estimatedPercent, completenessPercentage, evidenceCoverage, approvedCoverage);
  const nextRecommendedAction = buildNextAction(state, missingMetricNames.slice(0, 5), evidenceCoverage);

  return {
    state,
    label,
    plainMeaning,
    explanation,
    completenessPercentage,
    missingItems: missingMetricNames,
    evidenceCoverage,
    evidenceConfidence,
    estimateCount: estimatedMetrics,
    measuredCount: measuredMetrics,
    derivedCount: derivedMetrics,
    approvedCount: approvedMetrics,
    pendingApprovalCount: Math.max(0, filledMetrics - approvedMetrics),
    approvedCoverage,
    totalMetrics,
    filledMetrics,
    missingMetrics: missingCount,
    nextRecommendedAction,
    minViableThresholdMet,
  };
}

export function mapLegacyConfidence(
  scoreConfidence: "score_in_progress" | "draft" | "provisional" | "confirmed"
): EsgState {
  const map: Record<string, EsgState> = {
    score_in_progress: "IN_PROGRESS",
    draft: "DRAFT",
    provisional: "PROVISIONAL",
    confirmed: "CONFIRMED",
  };
  return map[scoreConfidence] ?? "IN_PROGRESS";
}
