export type MetricLabel = "Essential" | "Recommended next" | "Optional later" | "Calculated for you";

export type OnboardingMetric = {
  id: string;
  name: string;
  category: string;
  unit?: string | null;
  frequency?: string | null;
  helpText?: string | null;
  metricType?: string | null;
};

export type LabelledOnboardingMetric = OnboardingMetric & {
  wizardLabel: MetricLabel;
};

export type OnboardingMetricSubmission = {
  metricId: string;
  period: string;
  value: number;
  notes: string;
  dataSourceType: "manual" | "estimated";
};

export function isEditableStarterMetric(metric: OnboardingMetric): boolean {
  return !metric.metricType || metric.metricType === "manual";
}

export function selectEditableStarterMetrics(
  metrics: LabelledOnboardingMetric[],
  limit = 5,
): LabelledOnboardingMetric[] {
  return metrics
    .filter((metric) => metric.wizardLabel === "Essential" && isEditableStarterMetric(metric))
    .slice(0, limit);
}

export function buildOnboardingMetricSubmission(
  metricId: string,
  value: string,
  period: string,
  dataSourceType: "manual" | "estimated" = "estimated",
): OnboardingMetricSubmission {
  return {
    metricId,
    period,
    value: Number(value.replace(/,/g, "")),
    notes: `Entered during setup wizard (${dataSourceType === "estimated" ? "estimate" : "actual figure"})`,
    dataSourceType,
  };
}
