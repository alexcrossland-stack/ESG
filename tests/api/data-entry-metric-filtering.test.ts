/**
 * Regression: Data Entry editable metric filtering
 *
 * Run: npx tsx tests/api/data-entry-metric-filtering.test.ts
 */

import assert from "node:assert/strict";
import {
  isActiveEditableDataEntryMetric,
  isEditableDataEntryMetricType,
} from "../../shared/data-entry-metrics";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function check(name: string, fn: () => void | string) {
  try {
    const detail = fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

await check("manual and legacy blank metric types are editable", () => {
  assert.equal(isEditableDataEntryMetricType("manual"), true);
  assert.equal(isEditableDataEntryMetricType(null), true);
  assert.equal(isEditableDataEntryMetricType(undefined), true);
});

await check("calculated, derived, computed, and system metric types are not editable", () => {
  for (const metricType of ["calculated", "derived", "computed", "system"]) {
    assert.equal(isEditableDataEntryMetricType(metricType), false, `${metricType} should not be editable`);
  }
});

await check("active manual metrics are shown in Data Entry", () => {
  assert.equal(isActiveEditableDataEntryMetric({ enabled: true, metricType: "manual" }), true);
});

await check("inactive manual metrics are hidden from Data Entry", () => {
  assert.equal(isActiveEditableDataEntryMetric({ enabled: false, metricType: "manual" }), false);
  assert.equal(isActiveEditableDataEntryMetric({ enabled: null, metricType: "manual" }), false);
});

await check("active non-manual metrics are hidden from Data Entry", () => {
  assert.equal(isActiveEditableDataEntryMetric({ enabled: true, metricType: "calculated" }), false);
  assert.equal(isActiveEditableDataEntryMetric({ enabled: true, metricType: "derived" }), false);
  assert.equal(isActiveEditableDataEntryMetric({ enabled: true, metricType: "system" }), false);
});

const failed = results.filter((result) => !result.passed);
console.log(`\nData Entry metric filtering tests: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exit(1);
}
