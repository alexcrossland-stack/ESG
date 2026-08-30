import assert from "node:assert/strict";
import {
  formatOnboardingMetricPeriod,
  resolveOnboardingMetricPeriod,
  resolveOnboardingReportingRange,
} from "../../client/src/lib/onboarding-metrics";

assert.equal(
  resolveOnboardingMetricPeriod("2025", "monthly"),
  "2025-12",
  "monthly onboarding figures should use the reporting year's final month",
);
assert.equal(
  resolveOnboardingMetricPeriod("2025", "quarterly"),
  "2025-Q4",
  "quarterly onboarding figures should use the reporting year's final quarter",
);
assert.equal(
  resolveOnboardingMetricPeriod("2025", "annual"),
  "2025",
  "annual onboarding figures should preserve the reporting year",
);
assert.equal(
  resolveOnboardingMetricPeriod("2025", undefined),
  "2025-12",
  "legacy metrics without a cadence should use the platform's monthly default",
);
assert.equal(formatOnboardingMetricPeriod("2025", "monthly"), "December 2025");
assert.equal(formatOnboardingMetricPeriod("2025", "quarterly"), "Q4 2025");
assert.equal(formatOnboardingMetricPeriod("2025", "annual"), "2025");
assert.deepEqual(resolveOnboardingReportingRange("2025"), {
  dateFrom: "2025-01-01",
  dateTo: "2025-12-31",
});

console.log("onboarding cadence period tests passed");
