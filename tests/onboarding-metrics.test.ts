import assert from "node:assert/strict";
import {
  buildOnboardingMetricSubmission,
  formatOnboardingMetricPeriod,
  resolveOnboardingMetricPeriod,
  resolveOnboardingReportingRange,
  selectEditableStarterMetrics,
  type LabelledOnboardingMetric,
} from "../client/src/lib/onboarding-metrics";

const uuid = "8b77ca5f-5874-4d0d-bf9b-8c11b8508c31";
const submission = buildOnboardingMetricSubmission(uuid, "1,250", "2026-08");

assert.equal(submission.metricId, uuid, "onboarding must submit the metric UUID unchanged");
assert.equal(submission.value, 1250, "onboarding must normalize comma-separated values");
assert.equal(submission.dataSourceType, "estimated", "uncertain onboarding figures must default to estimated");

const actualSubmission = buildOnboardingMetricSubmission(uuid, "1,250", "2025", "manual");
assert.equal(actualSubmission.period, "2025", "onboarding must preserve the selected reporting-year boundary");
assert.equal(actualSubmission.dataSourceType, "manual", "confirmed actual figures must retain their source quality");
assert.match(actualSubmission.notes, /actual figure/, "actual source quality should be visible in the audit note");

assert.equal(resolveOnboardingMetricPeriod("2025", "monthly"), "2025-12");
assert.equal(resolveOnboardingMetricPeriod("2025", "quarterly"), "2025-Q4");
assert.equal(resolveOnboardingMetricPeriod("2025", "annual"), "2025");
assert.equal(resolveOnboardingMetricPeriod("2025", null), "2025-12", "missing legacy cadence should use the platform's monthly default");
assert.equal(formatOnboardingMetricPeriod("2025", "monthly"), "December 2025");
assert.equal(formatOnboardingMetricPeriod("2025", "quarterly"), "Q4 2025");
assert.deepEqual(resolveOnboardingReportingRange("2025"), {
  dateFrom: "2025-01-01",
  dateTo: "2025-12-31",
});

const metrics: LabelledOnboardingMetric[] = [
  {
    id: "13f277d7-c26a-4630-97c3-4a3590ea2bc2",
    name: "Carbon Intensity",
    category: "environmental",
    metricType: "derived",
    wizardLabel: "Essential",
  },
  {
    id: "97c429bc-fd30-4295-9b2c-06a2fa17207b",
    name: "Scope 2 Emissions",
    category: "environmental",
    metricType: "calculated",
    wizardLabel: "Essential",
  },
  {
    id: uuid,
    name: "Electricity Consumption",
    category: "environmental",
    metricType: "manual",
    wizardLabel: "Essential",
  },
];

assert.deepEqual(
  selectEditableStarterMetrics(metrics).map((metric) => metric.id),
  [uuid],
  "derived and calculated metrics must not be offered as editable onboarding inputs",
);

console.log("onboarding metric reliability tests passed");
