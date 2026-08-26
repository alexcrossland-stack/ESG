import { storage } from "./storage";

export type EsgState = "IN_PROGRESS" | "DRAFT" | "PROVISIONAL" | "CONFIRMED";

export interface EsgStatusResult {
  state: EsgState;
  label: string;
  plainMeaning: string;
  explanation: string;
  completenessPercentage: number;
  missingItems: string[];
  evidenceCoverage: number;
  estimateCount: number;
  measuredCount: number;
  totalMetrics: number;
  filledMetrics: number;
  missingMetrics: number;
  nextRecommendedAction: string;
  minViableThresholdMet: boolean;
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
  evidenceCoverage: number
): string {
  switch (state) {
    case "IN_PROGRESS":
      return "Add your first figures to establish your ESG baseline.";
    case "DRAFT":
      return `${estimatedPercent}% of your figures are estimates — replace them with measured data to improve confidence.`;
    case "PROVISIONAL":
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
}: {
  filledMetrics: number;
  estimatedPercent: number;
  completenessPercentage: number;
  evidenceCoverage: number;
}): EsgState {
  if (filledMetrics === 0) return "IN_PROGRESS";
  if (estimatedPercent > 50) return "DRAFT";
  if (estimatedPercent > 20 || completenessPercentage < 60 || evidenceCoverage < 50) {
    return "PROVISIONAL";
  }
  return "CONFIRMED";
}

export function calculateEvidenceCoverage(
  enabledMetricIds: string[],
  evidenceFiles: Array<{
    metricId?: string | null;
    linkedModule?: string | null;
    linkedEntityId?: string | null;
  }>,
): number {
  if (enabledMetricIds.length === 0) return 0;

  const enabledIds = new Set(enabledMetricIds);
  const evidencedIds = new Set(
    evidenceFiles
      .map((evidence) => {
        if (evidence.metricId && enabledIds.has(evidence.metricId)) return evidence.metricId;
        if (
          (evidence.linkedModule === "metric" || evidence.linkedModule === "metrics")
          && evidence.linkedEntityId
          && enabledIds.has(evidence.linkedEntityId)
        ) {
          return evidence.linkedEntityId;
        }
        return null;
      })
      .filter((metricId): metricId is string => Boolean(metricId)),
  );

  return Math.min(100, Math.round((evidencedIds.size / enabledMetricIds.length) * 100));
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
  period?: string,
  siteId?: string | null
): Promise<EsgStatusResult> {
  const metricScope = siteId === undefined
    ? { scope: "all" as const }
    : siteId === null
      ? { scope: "organisation" as const }
      : { scope: "site" as const, siteId };
  const [allMetrics, evidenceFiles] = await Promise.all([
    storage.getMetrics(companyId),
    storage.getEvidenceFiles(companyId, siteId, period),
  ]);

  const enabledMetrics = allMetrics.filter((m) => m.enabled);
  const totalMetrics = enabledMetrics.length;

  let filledMetrics = 0;
  let estimatedMetrics = 0;
  let measuredMetrics = 0;
  const missingMetricNames: string[] = [];

  for (const metric of enabledMetrics) {
    const vals = await storage.getMetricValuesForMetric(companyId, metric.id, metricScope);
    const latestVal = vals
      .filter((v) => !period || v.period === period)
      .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""))
      .find((v) => v.value !== null && v.value !== undefined);

    if (latestVal) {
      filledMetrics++;
      if (latestVal.dataSourceType === "estimated") {
        estimatedMetrics++;
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

  const evidenceCoverage = calculateEvidenceCoverage(
    enabledMetrics.map((metric) => metric.id),
    evidenceFiles,
  );

  const minViableThresholdMet =
    filledMetrics >= Math.min(3, totalMetrics) || completenessPercentage >= 30;

  const state = resolveEsgState({
    filledMetrics,
    estimatedPercent,
    completenessPercentage,
    evidenceCoverage,
  });

  const label = STATE_META[state].label;
  const plainMeaning = STATE_META[state].plainMeaning;
  const explanation = buildExplanation(state, estimatedPercent, completenessPercentage, evidenceCoverage);
  const nextRecommendedAction = buildNextAction(state, missingMetricNames.slice(0, 5), evidenceCoverage);

  return {
    state,
    label,
    plainMeaning,
    explanation,
    completenessPercentage,
    missingItems: missingMetricNames,
    evidenceCoverage,
    estimateCount: estimatedMetrics,
    measuredCount: measuredMetrics,
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
