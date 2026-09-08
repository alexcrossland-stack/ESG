import assert from "node:assert/strict";
import type { MetricTrend } from "../../shared/esg-trends";
import {
  overviewCategoryCompletion,
  overviewCompletion,
  overviewMonthLabel,
  overviewNumber,
  overviewPercentage,
  overviewPolicyReviews,
  overviewTrend,
} from "../../client/src/lib/sme-overview-summary";

assert.deepEqual(overviewCompletion({ filledMetrics: 2, totalMetrics: 7 }), { filled: 2, total: 7, missing: 5, percent: 29 });
assert.deepEqual(overviewCompletion({ filledMetrics: 0, totalMetrics: 7 }), { filled: 0, total: 7, missing: 7, percent: 0 });
assert.deepEqual(overviewCompletion({ filledMetrics: 0, totalMetrics: 0 }), { filled: 0, total: 0, missing: 0, percent: null });
assert.equal(overviewCompletion(), null);
for (const invalid of [undefined, null, "", " ", true, {}, Number.NaN, Infinity, -1, 0.5]) {
  assert.equal(overviewCompletion({ filledMetrics: invalid, totalMetrics: 3 }), null);
}
assert.equal(overviewCompletion({ filledMetrics: 4, totalMetrics: 3 }), null);
assert.equal(overviewCompletion({ totalMetrics: 5 }), null);
assert.deepEqual(overviewCategoryCompletion({ total: 10, missing: 4 }), { filled: 6, total: 10, missing: 4, percent: 60 });
assert.equal(overviewCategoryCompletion({ total: 3 }), null);
assert.equal(overviewCategoryCompletion({ total: 3, missing: 4 }), null);
assert.equal(overviewCategoryCompletion({ total: 3, missing: -1 }), null);
assert.equal(overviewPercentage(null), null);
assert.equal(overviewPercentage(""), null);
assert.equal(overviewPercentage(0), 0);
assert.equal(overviewPercentage(100), 100);
assert.equal(overviewPercentage(101), null);
assert.equal(overviewPercentage(-1), null);
assert.equal(overviewNumber("0"), 0);
assert.equal(overviewNumber(" "), null);
console.log("PASS canonical counts distinguish known zero, no figures due and unavailable data");

assert.equal(overviewPolicyReviews(undefined), null);
assert.equal(overviewPolicyReviews([{ status: "unknown" }]), null);
assert.deepEqual(overviewPolicyReviews([]), { overdue: 0, dueWithin30Days: 0, dueWithin90Days: 0 });
assert.deepEqual(overviewPolicyReviews([{ status: "overdue" }, { status: "urgent" }, { status: "urgent" }, { status: "upcoming" }]), { overdue: 1, dueWithin30Days: 2, dueWithin90Days: 3 });
assert.equal(overviewMonthLabel("2025-12"), "December 2025");
assert.equal(overviewMonthLabel("2025-13"), "the selected month");
assert.equal(overviewMonthLabel(), "the selected month");
console.log("PASS exact policy review windows keep overdue separate from 30/90-day upcoming counts");

const metric: MetricTrend = {
  metricId: "electricity", metricName: "Electricity Consumption", category: "environmental", unit: "kWh", metricType: "manual",
  direction: "improved", reason: "ok", currentPeriod: "2025-12", previousPeriod: "2025-11",
  currentValue: 80, previousValue: 100, absoluteDelta: -20, percentageDelta: -20,
  comparisonLabel: "Previous month", improvementKnown: true, changeLabel: "Improved",
};
const summary = {
  currentPeriod: "2025-12", previousPeriod: "2025-11", currentPeriodLabel: "December 2025", previousPeriodLabel: "November 2025", metrics: [metric],
};
const highlight = overviewTrend(summary, "2025-12");
assert.equal(highlight?.current, 80);
assert.equal(highlight?.previous, 100);
assert.equal(highlight?.directionLabel, "Improved");
assert.equal(highlight?.metricCount, 1);
assert.equal(highlight?.currentPeriodLabel, "December 2025");
assert.equal(overviewTrend(summary, "2026-01"), null);
assert.equal(overviewTrend({ ...summary, currentPeriodLabel: undefined }), null);
assert.equal(overviewTrend({ ...summary, metrics: [{ ...metric, currentPeriod: "2026-01" }] }), null);
assert.equal(overviewTrend({ ...summary, metrics: [{ ...metric, previousValue: null }] }), null);
assert.equal(overviewTrend({ ...summary, metrics: [{ ...metric, reason: "missing_previous" }] }), null);
assert.equal(overviewTrend({ ...summary, metrics: [{ ...metric, currentValue: Number.NaN }] }), null);
assert.equal(overviewTrend({ ...summary, metrics: [] }), null);
assert.equal(overviewTrend(), null);
console.log("PASS trend highlight requires a genuine numeric comparison in the selected period");

const neutral = overviewTrend({ ...summary, metrics: [{ ...metric, currentValue: 120, previousValue: 100, absoluteDelta: 20, percentageDelta: 20, improvementKnown: false, direction: "unavailable", changeLabel: "Increased" }] });
assert.equal(neutral?.directionLabel, "Increased");
assert.equal(neutral?.direction, "unavailable");
const worsened = overviewTrend({ ...summary, metrics: [{ ...metric, direction: "worsened", changeLabel: "Worsened" }] });
assert.equal(worsened?.directionLabel, "Worsened");
const zeroBaseline = overviewTrend({ ...summary, metrics: [{ ...metric, previousValue: 0, percentageDelta: null, direction: "unavailable", changeLabel: "Increased" }] });
assert.equal(zeroBaseline?.percentageDelta, null);
const mixedUnitSummary = { ...summary, metrics: [metric, { ...metric, metricId: "water", unit: "m³", currentValue: 50, previousValue: 70 }] };
assert.equal(overviewTrend(mixedUnitSummary)?.current, 80);
assert.equal(overviewTrend(mixedUnitSummary)?.unit, "kWh");
assert.equal(overviewTrend(mixedUnitSummary)?.metricCount, 1);
console.log("PASS increases are not automatically improvements; one metric avoids mixed-unit sums");
