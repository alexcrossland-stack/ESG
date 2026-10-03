import type { ReportPeriodSelection } from "./report-periods";
import { getPreviousComparableReportPeriod, getReportComparisonLabel, resolveReportPeriodSelection } from "./report-periods";

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
  weight?: number;
  workflowStatus?: string | null;
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
  improvementKnown: boolean;
  changeLabel: "Improved" | "Worsened" | "Unchanged" | "Increased" | "Decreased" | "Trend unavailable" | "Not applicable";
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
  const numericRows = rows.map(row => ({ value: parseNumericValue(row.valueNumeric ?? row.value), weight: row.weight }))
    .filter((row): row is { value: number; weight: number | undefined } => row.value !== null);

  if (numericRows.length === 0) return null;
  if (metricUsesAverage(metric)) {
    // Partial weights bias a comparison. Only weight when every source has a
    // valid denominator for that period; otherwise use the same explicit mean.
    if (numericRows.every(row => row.weight !== undefined && Number.isFinite(row.weight) && row.weight > 0)) {
      return numericRows.reduce((sum, row) => sum + row.value * row.weight!, 0) / numericRows.reduce((sum, row) => sum + row.weight!, 0);
    }
    return numericRows.reduce((sum, row) => sum + row.value, 0) / numericRows.length;
  }
  return numericRows.reduce((sum, row) => sum + row.value, 0);
}

export function aggregateMetricHistory(metric: TrendMetricInput, rows: TrendValueInput[], selectedPeriod: string,
  boundary?: { periodType: "monthly" | "quarterly" | "annual"; dateFrom: string; dateTo: string }) {
  const periodSelection = (period: string) => resolveReportPeriodSelection({ period,
    periodType: /^\d{4}$/.test(period) ? "annual" : /^\d{4}-Q[1-4]$/.test(period) ? "quarterly" : "monthly",
  });
  const selection = boundary ?? periodSelection(selectedPeriod);
  const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  const selectedStart = selection ? monthIndex(selection.dateFrom) : 0;
  const span = selection ? monthIndex(selection.dateTo) - selectedStart + 1 : 0;
  const periods = new Map<string, TrendValueInput[]>();
  for (const row of rows) {
    const source = row.period === selectedPeriod && selection ? selection : periodSelection(row.period);
    if (row.metricId !== metric.id || ["rejected", "archived"].includes(row.workflowStatus || "") || !selection || !source || span <= 0 || source.dateTo > selection.dateTo) continue;
    const sourceStart = monthIndex(source.dateFrom), sourceEnd = monthIndex(source.dateTo);
    const bucketOffset = Math.floor((sourceStart - selectedStart) / span);
    const bucketStart = selectedStart + bucketOffset * span;
    // Longer or cross-boundary records cannot be split into shorter reports.
    if (sourceEnd >= bucketStart + span) continue;
    const year = Math.floor(bucketStart / 12), month = bucketStart % 12 + 1;
    const period = bucketOffset === 0 ? selectedPeriod : selection.periodType === "annual" ? String(year)
      : selection.periodType === "quarterly" ? `${year}-Q${Math.ceil(month / 3)}` : `${year}-${String(month).padStart(2, "0")}`;
    const entries = periods.get(period) ?? [];
    entries.push(row);
    periods.set(period, entries);
  }
  return Array.from(periods).sort(([a], [b]) => a.localeCompare(b))
    .map(([period, entries]) => {
      // A stored quarterly/annual total supersedes contained monthly values at
      // the same site; never add both representations of the same activity.
      const sources = entries.filter(row => {
        const source = row.period === selectedPeriod ? selection : periodSelection(row.period);
        return !entries.some(other => {
          if ((other.siteId ?? null) !== (row.siteId ?? null) || other.period === row.period) return false;
          const larger = other.period === selectedPeriod ? selection : periodSelection(other.period);
          const hasValue = typeof other.valueBoolean === "boolean" || parseNumericValue(other.valueNumeric ?? other.value) !== null;
          return hasValue && source && larger && larger.dateFrom <= source.dateFrom && larger.dateTo >= source.dateTo;
        });
      });
      if (metricIsYesNo(metric, sources)) {
        const answers = sources.map(row => typeof row.valueBoolean === "boolean" ? row.valueBoolean
          : /^(yes|true|1)$/i.test(String(row.value ?? "")) ? true : /^(no|false|0)$/i.test(String(row.value ?? "")) ? false : null)
          .filter(answer => answer !== null);
        return { period, value: answers.length ? answers.every(Boolean) ? 1 : 0 : null };
      }
      return { period, value: aggregateTrendValue(metric, sources) };
    });
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
    improvementKnown: input.metric.direction === "higher_is_better" || input.metric.direction === "lower_is_better",
  };

  if (input.metric.enabled === false) {
    return { ...base, direction: "unavailable", reason: "not_reportable", currentValue: null, previousValue: null, absoluteDelta: null, percentageDelta: null, changeLabel: "Trend unavailable" };
  }

  const allRows = [...input.currentRows, ...input.previousRows];
  if (metricIsYesNo(input.metric, allRows)) {
    return { ...base, direction: "unavailable", reason: "not_applicable_yes_no", currentValue: null, previousValue: null, absoluteDelta: null, percentageDelta: null, changeLabel: "Not applicable" };
  }

  const currentValue = aggregateTrendValue(input.metric, input.currentRows);
  if (currentValue === null) {
    return { ...base, direction: "unavailable", reason: input.currentRows.length === 0 ? "missing_current" : "non_numeric", currentValue: null, previousValue: null, absoluteDelta: null, percentageDelta: null, changeLabel: "Trend unavailable" };
  }

  const previousValue = aggregateTrendValue(input.metric, input.previousRows);
  if (previousValue === null) {
    return { ...base, direction: "unavailable", reason: input.previousRows.length === 0 ? "missing_previous" : "non_numeric", currentValue, previousValue: null, absoluteDelta: null, percentageDelta: null, changeLabel: "Trend unavailable" };
  }

  const absoluteDelta = currentValue - previousValue;
  const percentageDelta = previousValue === 0 ? null : Math.round((absoluteDelta / Math.abs(previousValue)) * 10000) / 100;
  let direction: TrendDirection = "unchanged";
  let changeLabel: MetricTrend["changeLabel"] = "Unchanged";
  if (absoluteDelta !== 0) {
    if (base.improvementKnown) {
      direction = input.metric.direction === "lower_is_better"
        ? absoluteDelta < 0 ? "improved" : "worsened"
        : absoluteDelta > 0 ? "improved" : "worsened";
      changeLabel = direction === "improved" ? "Improved" : "Worsened";
    } else {
      direction = "unavailable";
      changeLabel = absoluteDelta > 0 ? "Increased" : "Decreased";
    }
  }

  return {
    ...base,
    direction,
    reason: "ok",
    currentValue,
    previousValue,
    absoluteDelta,
    percentageDelta,
    changeLabel,
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
