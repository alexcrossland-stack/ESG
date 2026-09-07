import type { MetricTrend } from "@shared/esg-trends";

export function overviewNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function count(value: unknown): number | null {
  const number = overviewNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

export function overviewPercentage(value: unknown): number | null {
  const number = overviewNumber(value);
  return number !== null && number >= 0 && number <= 100 ? Math.round(number) : null;
}

/** Counts come from the canonical readiness response, never a rounded percentage. */
export function overviewCompletion(readiness?: { filledMetrics?: unknown; totalMetrics?: unknown }) {
  const filled = count(readiness?.filledMetrics);
  const total = count(readiness?.totalMetrics);
  if (filled === null || total === null || filled > total) return null;
  return { filled, total, missing: total - filled, percent: total > 0 ? Math.round(filled / total * 100) : null };
}

export function overviewCategoryCompletion(category?: { total?: unknown; missing?: unknown }) {
  const total = count(category?.total);
  const missing = count(category?.missing);
  return total === null || missing === null ? null : overviewCompletion({ totalMetrics: total, filledMetrics: total - missing });
}

export function overviewPolicyReviews(reviews: unknown) {
  if (!Array.isArray(reviews) || reviews.some(review => !review || !["overdue", "urgent", "upcoming"].includes(review.status))) return null;
  return {
    overdue: reviews.filter(review => review.status === "overdue").length,
    dueWithin30Days: reviews.filter(review => review.status === "urgent").length,
    dueWithin90Days: reviews.filter(review => review.status === "urgent" || review.status === "upcoming").length,
  };
}

export function overviewMonthLabel(month?: string): string {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "the selected month";
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

type OverviewTrendSummary = {
  currentPeriod?: string;
  previousPeriod?: string;
  currentPeriodLabel?: string;
  previousPeriodLabel?: string;
  metrics?: MetricTrend[];
};

/** Highlight one comparable metric, not a potentially mixed-unit area total. */
export function overviewTrend(summary?: OverviewTrendSummary, month?: string) {
  if (!summary?.currentPeriodLabel || !summary.previousPeriodLabel || !Array.isArray(summary.metrics)) return null;
  if (month && summary.currentPeriod !== month) return null;
  const metric = summary.metrics.find(trend =>
    trend && trend.reason === "ok"
    && trend.currentPeriod === summary.currentPeriod
    && trend.previousPeriod === summary.previousPeriod
    && typeof trend.metricName === "string" && trend.metricName.trim()
    && overviewNumber(trend.currentValue) !== null
    && overviewNumber(trend.previousValue) !== null
    && overviewNumber(trend.absoluteDelta) !== null
    && ["improved", "worsened", "unchanged", "unavailable"].includes(trend.direction),
  );
  if (!metric) return null;
  const current = overviewNumber(metric.currentValue)!;
  const previous = overviewNumber(metric.previousValue)!;
  const delta = overviewNumber(metric.absoluteDelta)!;
  const directionLabel = metric.direction === "improved" ? "Improved"
    : metric.direction === "worsened" ? "Worsened"
      : delta === 0 ? "Unchanged" : delta > 0 ? "Increased" : "Decreased";
  return {
    metricId: metric.metricId,
    name: metric.metricName,
    unit: metric.unit,
    current,
    previous,
    delta,
    percentageDelta: overviewNumber(metric.percentageDelta),
    direction: metric.direction,
    directionLabel,
    currentPeriodLabel: summary.currentPeriodLabel,
    previousPeriodLabel: summary.previousPeriodLabel,
    metricCount: 1,
  };
}
