export type MetricLabel = "Essential" | "Recommended next" | "Optional later" | "Calculated for you";

export type OnboardingMetric = {
  id: string;
  name: string;
  category: string;
  unit?: string | null;
  dataType?: string | null;
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

export type OnboardingReportingRange = {
  dateFrom: string;
  dateTo: string;
};

export function resolveOnboardingReportingRange(reportingYear: string): OnboardingReportingRange {
  const year = reportingYear.trim();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  };
}

export function resolveOnboardingMetricPeriod(
  reportingYear: string,
  frequency?: string | null,
): string {
  const year = reportingYear.trim();

  if (frequency === "annual") return year;
  if (frequency === "quarterly") return `${year}-Q4`;
  return `${year}-12`;
}

export function formatOnboardingMetricPeriod(
  reportingYear: string,
  frequency?: string | null,
): string {
  const year = reportingYear.trim();

  if (frequency === "annual") return year;
  if (frequency === "quarterly") return `Q4 ${year}`;
  return `December ${year}`;
}

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
  const number = Number(value.replace(/,/g, ""));
  if (!value.trim() || !Number.isFinite(number)) throw new Error("Enter a valid number before saving.");
  return {
    metricId,
    period,
    value: number,
    notes: `Entered during setup wizard (${dataSourceType === "estimated" ? "estimate" : "actual figure"})`,
    dataSourceType,
  };
}
