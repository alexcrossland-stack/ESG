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
    label: "Score in progress",
    shortLabel: "In progress",
    plainMeaning: "Add your first figures to generate your ESG score.",
  },
  DRAFT: {
    label: "Your ESG Score — Draft",
    shortLabel: "Draft",
    plainMeaning: "Most of your figures are estimates — replace them with real data to improve confidence.",
  },
  PROVISIONAL: {
    label: "Your ESG Score — Provisional",
    shortLabel: "Provisional",
    plainMeaning: "Your score is taking shape. Fill in more data or swap estimates for real figures to reach Confirmed.",
  },
  CONFIRMED: {
    label: "Your ESG Score — Confirmed",
    shortLabel: "Confirmed",
    plainMeaning: "Your score is based on real data and is ready to share.",
  },
};

function buildExplanation(
  state: EsgState,
  estimatedPercent: number,
  completenessPercentage: number
): string {
  switch (state) {
    case "IN_PROGRESS":
      return "Add your first figures to generate your ESG score.";
    case "DRAFT":
      return `${estimatedPercent}% of your figures are estimates — replace them with real data to improve confidence.`;
    case "PROVISIONAL":
      return completenessPercentage < 60
        ? `Your score covers ${completenessPercentage}% of your metrics. Fill in more to reach Confirmed.`
        : "Looking good. A few figures are still estimated — swap them for real data to reach Confirmed.";
    case "CONFIRMED":
      return "Your score is based on real data and is ready to share.";
  }
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
      return "Replace estimated figures with real data to build confidence in your score.";
    case "PROVISIONAL":
      if (evidenceCoverage < 50) {
        return "Upload supporting documents — energy bills, invoices, or HR records — to back up your figures.";
      }
      if (missingItems.length > 0) {
        return `Fill in ${missingItems.length} remaining metric${missingItems.length === 1 ? "" : "s"} to strengthen your score.`;
      }
      return "Replace remaining estimates with real data to reach Confirmed.";
    case "CONFIRMED":
      return "Keep your data up to date and generate your ESG report.";
  }
}

export async function evaluateEsgStatus(
  companyId: string,
  _period?: string,
  _siteId?: number
): Promise<EsgStatusResult> {
  const [allMetrics, evidenceFiles] = await Promise.all([
    storage.getMetrics(companyId),
    storage.getEvidenceFiles(companyId),
  ]);

  const enabledMetrics = allMetrics.filter((m) => m.enabled);
  const totalMetrics = enabledMetrics.length;

  let filledMetrics = 0;
  let estimatedMetrics = 0;
  let measuredMetrics = 0;
  const missingMetricNames: string[] = [];

  for (const metric of enabledMetrics) {
    const vals = await storage.getMetricValues(metric.id);
    const latestVal = vals
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
      missingMetricNames.push(metric.name ?? metric.key ?? "Unknown metric");
    }
  }

  const missingCount = totalMetrics - filledMetrics;
  const completenessPercentage =
    totalMetrics > 0 ? Math.round((filledMetrics / totalMetrics) * 100) : 0;
  const estimatedPercent =
    totalMetrics > 0 ? Math.round((estimatedMetrics / totalMetrics) * 100) : 0;

  const evidenceLinked = evidenceFiles.filter(
    (e) => e.linkedModule === "metric_value" || e.linkedModule === "metrics"
  );
  const evidenceCoverage =
    totalMetrics > 0
      ? Math.min(100, Math.round((evidenceLinked.length / totalMetrics) * 100))
      : 0;

  const minViableThresholdMet =
    filledMetrics >= Math.min(3, totalMetrics) || completenessPercentage >= 30;

  let state: EsgState;
  if (filledMetrics === 0) {
    state = "IN_PROGRESS";
  } else if (estimatedPercent > 50) {
    state = "DRAFT";
  } else if (estimatedPercent > 20 || completenessPercentage < 60) {
    state = "PROVISIONAL";
  } else {
    state = "CONFIRMED";
  }

  const label = STATE_META[state].label;
  const plainMeaning = STATE_META[state].plainMeaning;
  const explanation = buildExplanation(state, estimatedPercent, completenessPercentage);
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
