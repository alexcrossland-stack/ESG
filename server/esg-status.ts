import { storage } from "./storage";

export type EsgState = "IN_PROGRESS" | "DRAFT" | "PROVISIONAL" | "CONFIRMED";

export interface EsgStatusResult {
  state: EsgState;
  label: string;
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

const STATE_META: Record<EsgState, { label: string; shortLabel: string }> = {
  IN_PROGRESS: {
    label: "Score in progress",
    shortLabel: "In progress",
  },
  DRAFT: {
    label: "Baseline ESG Score — Draft",
    shortLabel: "Draft",
  },
  PROVISIONAL: {
    label: "Baseline ESG Score — Provisional",
    shortLabel: "Provisional",
  },
  CONFIRMED: {
    label: "Baseline ESG Score — Confirmed",
    shortLabel: "Confirmed",
  },
};

function buildExplanation(
  state: EsgState,
  estimatedPercent: number,
  completenessPercentage: number
): string {
  switch (state) {
    case "IN_PROGRESS":
      return "Add your first data point to generate a Baseline ESG Score.";
    case "DRAFT":
      return `${estimatedPercent}% of your data is estimated. Replace estimated values with actual figures to move to Provisional.`;
    case "PROVISIONAL":
      return completenessPercentage < 60
        ? `Your score covers ${completenessPercentage}% of metrics. Fill in more data to reach Confirmed status.`
        : "Some estimated data remains. Replace estimates with measured values to reach Confirmed status.";
    case "CONFIRMED":
      return "Your score is based on measured data and is ready for reporting.";
  }
}

function buildNextAction(
  state: EsgState,
  missingItems: string[],
  evidenceCoverage: number
): string {
  switch (state) {
    case "IN_PROGRESS":
      return "Enter your first metric value — start with electricity or headcount.";
    case "DRAFT":
      if (missingItems.length > 0) {
        return `Enter actual data for: ${missingItems.slice(0, 3).join(", ")}${missingItems.length > 3 ? ` and ${missingItems.length - 3} more` : ""}.`;
      }
      return "Replace estimated values with actual measured data to improve score confidence.";
    case "PROVISIONAL":
      if (evidenceCoverage < 50) {
        return "Upload supporting documents (bills, statements) as evidence for your data entries.";
      }
      if (missingItems.length > 0) {
        return `Fill in ${missingItems.length} remaining metric${missingItems.length === 1 ? "" : "s"} to strengthen your score.`;
      }
      return "Replace remaining estimated values with actual data to reach Confirmed status.";
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
  const explanation = buildExplanation(state, estimatedPercent, completenessPercentage);
  const nextRecommendedAction = buildNextAction(state, missingMetricNames.slice(0, 5), evidenceCoverage);

  return {
    state,
    label,
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
