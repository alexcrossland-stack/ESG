/**
 * Run: npx tsx tests/unit/esg-trends.test.ts
 */

import assert from "node:assert/strict";
import { buildAnnualReportPeriod, buildMonthlyReportPeriod, buildQuarterlyReportPeriod, getPreviousComparableReportPeriod } from "../../shared/report-periods.js";
import { calculateMetricTrend, calculateMetricTrends } from "../../shared/esg-trends.js";

const metric = {
  id: "metric-1",
  name: "Electricity",
  category: "environmental",
  unit: "kWh",
  enabled: true,
  metricType: "manual",
  direction: "lower_is_better",
};

function value(period: string, amount: number | string | null, metricId = "metric-1", companyId = "tenant-a") {
  return { metricId, companyId, period, value: amount };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    throw error;
  }
}

console.log("\n=== Unit Tests: ESG Trends ===\n");

test("monthly previous-period comparison uses previous calendar month", () => {
  const current = buildMonthlyReportPeriod(2025, 1);
  const previous = getPreviousComparableReportPeriod(current);
  assert.equal(previous.period, "2024-12");
  const trend = calculateMetricTrend({
    metric,
    currentPeriod: current,
    currentRows: [value("2025-01", 80)],
    previousRows: [value("2024-12", 100)],
  });
  assert.equal(trend.previousPeriod, "2024-12");
  assert.equal(trend.absoluteDelta, -20);
  assert.equal(trend.percentageDelta, -20);
  assert.equal(trend.direction, "improved");
});

test("quarterly previous-period comparison uses previous quarter", () => {
  const current = buildQuarterlyReportPeriod(2025, 1);
  const previous = getPreviousComparableReportPeriod(current);
  assert.equal(previous.period, "2024-Q4");
});

test("annual previous-period comparison uses prior year", () => {
  const current = buildAnnualReportPeriod(2025);
  const previous = getPreviousComparableReportPeriod(current);
  assert.equal(previous.period, "2024");
});

test("divide-by-zero keeps absolute delta and omits percentage delta", () => {
  const trend = calculateMetricTrend({
    metric,
    currentPeriod: buildMonthlyReportPeriod(2025, 5),
    currentRows: [value("2025-05", 10)],
    previousRows: [value("2025-04", 0)],
  });
  assert.equal(trend.absoluteDelta, 10);
  assert.equal(trend.percentageDelta, null);
  assert.equal(trend.reason, "ok");
});

test("missing previous period is unavailable", () => {
  const trend = calculateMetricTrend({
    metric,
    currentPeriod: buildMonthlyReportPeriod(2025, 5),
    currentRows: [value("2025-05", 10)],
    previousRows: [],
  });
  assert.equal(trend.direction, "unavailable");
  assert.equal(trend.reason, "missing_previous");
});

test("missing current period is unavailable", () => {
  const trend = calculateMetricTrend({
    metric,
    currentPeriod: buildMonthlyReportPeriod(2025, 5),
    currentRows: [],
    previousRows: [value("2025-04", 10)],
  });
  assert.equal(trend.direction, "unavailable");
  assert.equal(trend.reason, "missing_current");
});

test("yes/no metrics do not produce numeric deltas", () => {
  const trend = calculateMetricTrend({
    metric: { ...metric, direction: "compliance_yes_no", unit: "yes/no" },
    currentPeriod: buildMonthlyReportPeriod(2025, 5),
    currentRows: [{ metricId: "metric-1", period: "2025-05", valueBoolean: true }],
    previousRows: [{ metricId: "metric-1", period: "2025-04", valueBoolean: false }],
  });
  assert.equal(trend.direction, "unavailable");
  assert.equal(trend.reason, "not_applicable_yes_no");
  assert.equal(trend.absoluteDelta, null);
});

test("inactive metrics are excluded by default", () => {
  const result = calculateMetricTrends({
    metrics: [{ ...metric, enabled: false }],
    values: [value("2025-05", 10), value("2025-04", 20)],
    currentPeriod: buildMonthlyReportPeriod(2025, 5),
  });
  assert.equal(result.trends.length, 0);
});

test("tenant-scoped trend calculation ignores other tenant values", () => {
  const result = calculateMetricTrends({
    metrics: [metric],
    values: [
      value("2025-05", 80, "metric-1", "tenant-a"),
      value("2025-04", 100, "metric-1", "tenant-a"),
      value("2025-05", 1, "metric-1", "tenant-b"),
      value("2025-04", 1, "metric-1", "tenant-b"),
    ],
    currentPeriod: buildMonthlyReportPeriod(2025, 5),
    companyId: "tenant-a",
  });
  assert.equal(result.trends[0]?.currentValue, 80);
  assert.equal(result.trends[0]?.previousValue, 100);
});

console.log("\n=== ESG Trends: all tests passed ===\n");
