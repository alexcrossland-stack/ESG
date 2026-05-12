import type { ReportPeriodSelection } from "./report-periods";
import { getPreviousComparableReportPeriod, getReportComparisonLabel } from "./report-periods";

export type TrendDirection = "improved" | "worsened" | "unchanged" | "unavailable";
export type TrendReason =
  | "ok"
  | "missing_current"
  | "missing_previous"
  | "not_applicable_yes_no"
  | "not_reportable"
  | "non_numeric"
  | "empty";

export type TrendMetricInput = {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  enabled?: boolean | null;
  metricType?: string | null;
  direction?: string | null;
};

export type TrendValueInput = {
  metricId: string;
  companyId?: string | null;
  period: string;
  value?: unknown;
  valueNumeric?: unknown;
  valueBoolean?: unknown;
  siteId?: string | null;
};

export type MetricTrend = {
  metricId: string;
  metricName: string;
  category: string | null;
  unit: string | null;
  metricType: string | null;
  direction: TrendDirection;
  reason: TrendReason;
  currentPeriod: string;
  previousPeriod: string;
  currentValue: number | null;
  previousValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  comparisonLabel: string;
};

export type TrendCalculationResult = {
  currentPeriod: ReportPeriodSelection;
  previousPeriod: ReportPeriodSelection;
  comparisonLabel: string;
  trends: MetricTrend[];
};

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricIsYesNo(metric: TrendMetricInput, rows: TrendValueInput[]): boolean {
  if (metric.direction === "compliance_yes_no") return true;
  if ((metric.unit || "").toLowerCase() === "yes/no") return true;
  return rows.some((row) => typeof row.valueBoolean === "boolean");
}

function metricUsesAverage(metric: TrendMetricInput): boolean {
  const unit = (metric.unit || "").toLowerCase();
  return unit.includes("%") || unit.includes("percent") || metric.direction === "target_range";
}

export function aggregateTrendValue(metric: TrendMetricInput, rows: TrendValueInput[]): number | null {
  const numericRows = rows
    .map((row) => parseNumericValue(row.valueNumeric ?? row.value))
    .filter((value): value is number => value !== null);

  if (numericRows.length === 0) return null;
  if (metricUsesAverage(metric)) {
    return numericRows.reduce((sum, value) => sum + value, 0) / numericRows.length;
  }
  return numericRows.reduce((sum, value) => sum + value, 0);
}

export function calculateMetricTrend(input: {
  metric: TrendMetricInput;
  currentRows: TrendValueInput[];
  previousRows: TrendValueInput[];
  currentPeriod: ReportPeriodSelection;
  previousPeriod?: ReportPeriodSelection;
}): MetricTrend {
  const previousPeriod = input.previousPeriod ?? getPreviousComparableReportPeriod(input.currentPeriod);
  const comparisonLabel = getReportComparisonLabel(input.currentPeriod.periodType);
  const base = {
    metricId: input.metric.id,
    metricName: input.metric.name,
    category: input.metric.category ?? null,
    unit: input.metric.unit ?? null,
    metricType: input.metric.metricType ?? null,
    currentPeriod: input.currentPeriod.period,
    previousPeriod: previousPeriod.period,
    comparisonLabel,
  };

  if (input.metric.enabled === false) {
    return { ...base, direction: "unavailable", reason: "not_reportable", currentValue: null, previousValue: null, absoluteDelta: null, percentageDelta: null };
  }

  const allRows = [...input.currentRows, ...input.previousRows];
  if (metricIsYesNo(input.metric, allRows)) {
    return { ...base, direction: "unavailable", reason: "not_applicable_yes_no", currentValue: null, previousValue: null, absoluteDelta: null, percentageDelta: null };
  }

  const currentValue = aggregateTrendValue(input.metric, input.currentRows);
  if (currentValue === null) {
    return { ...base, direction: "unavailable", reason: input.currentRows.length === 0 ? "missing_current" : "non_numeric", currentValue: null, previousValue: null, absoluteDelta: null, percentageDelta: null };
  }

  const previousValue = aggregateTrendValue(input.metric, input.previousRows);
  if (previousValue === null) {
    return { ...base, direction: "unavailable", reason: input.previousRows.length === 0 ? "missing_previous" : "non_numeric", currentValue, previousValue: null, absoluteDelta: null, percentageDelta: null };
  }

  const absoluteDelta = currentValue - previousValue;
  const percentageDelta = previousValue === 0 ? null : Math.round((absoluteDelta / Math.abs(previousValue)) * 10000) / 100;
  let direction: TrendDirection = "unchanged";
  if (absoluteDelta !== 0) {
    direction = input.metric.direction === "lower_is_better"
      ? absoluteDelta < 0 ? "improved" : "worsened"
      : absoluteDelta > 0 ? "improved" : "worsened";
  }

  return {
    ...base,
    direction,
    reason: "ok",
    currentValue,
    previousValue,
    absoluteDelta,
    percentageDelta,
  };
}

export function calculateMetricTrends(input: {
  metrics: TrendMetricInput[];
  values: TrendValueInput[];
  currentPeriod: ReportPeriodSelection;
  previousPeriod?: ReportPeriodSelection;
  currentPeriods?: string[];
  previousPeriods?: string[];
  companyId?: string;
  includeUnavailable?: boolean;
}): TrendCalculationResult {
  const previousPeriod = input.previousPeriod ?? getPreviousComparableReportPeriod(input.currentPeriod);
  const currentPeriods = new Set(input.currentPeriods?.length ? input.currentPeriods : [input.currentPeriod.period]);
  const previousPeriods = new Set(input.previousPeriods?.length ? input.previousPeriods : [previousPeriod.period]);
  const scopedValues = input.companyId
    ? input.values.filter((value) => value.companyId === undefined || value.companyId === input.companyId)
    : input.values;
  const trends = input.metrics
    .map((metric) => calculateMetricTrend({
      metric,
      currentPeriod: input.currentPeriod,
      previousPeriod,
      currentRows: scopedValues.filter((value) => value.metricId === metric.id && currentPeriods.has(value.period)),
      previousRows: scopedValues.filter((value) => value.metricId === metric.id && previousPeriods.has(value.period)),
    }))
    .filter((trend) => input.includeUnavailable || trend.reason !== "not_reportable");

  return {
    currentPeriod: input.currentPeriod,
    previousPeriod,
    comparisonLabel: getReportComparisonLabel(input.currentPeriod.periodType),
    trends,
  };
}
