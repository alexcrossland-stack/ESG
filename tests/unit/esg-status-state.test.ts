import assert from "node:assert/strict";

import { calculateEvidenceCoverage, resolveEsgState } from "../../server/esg-status";

const cases = [
  {
    name: "no data remains in progress",
    input: { filledMetrics: 0, estimatedPercent: 0, completenessPercentage: 0, evidenceCoverage: 0 },
    expected: "IN_PROGRESS",
  },
  {
    name: "mostly estimated data remains draft",
    input: { filledMetrics: 6, estimatedPercent: 70, completenessPercentage: 70, evidenceCoverage: 70 },
    expected: "DRAFT",
  },
  {
    name: "measured data without evidence remains provisional",
    input: { filledMetrics: 8, estimatedPercent: 0, completenessPercentage: 80, evidenceCoverage: 20 },
    expected: "PROVISIONAL",
  },
  {
    name: "evidence cannot compensate for low data completeness",
    input: { filledMetrics: 4, estimatedPercent: 0, completenessPercentage: 40, evidenceCoverage: 80 },
    expected: "PROVISIONAL",
  },
  {
    name: "confirmed requires measured, complete, evidence-backed data",
    input: { filledMetrics: 8, estimatedPercent: 10, completenessPercentage: 80, evidenceCoverage: 60 },
    expected: "CONFIRMED",
  },
] as const;

for (const testCase of cases) {
  assert.equal(resolveEsgState(testCase.input), testCase.expected, testCase.name);
  console.log(`  PASS  ${testCase.name}`);
}

assert.equal(
  calculateEvidenceCoverage(
    ["metric-a", "metric-b"],
    [
      { metricId: "metric-a" },
      { metricId: "metric-a" },
      { metricId: "disabled-metric" },
    ],
  ),
  50,
  "duplicate documents and evidence for disabled metrics must not inflate coverage",
);
console.log("  PASS  evidence coverage counts unique enabled metrics");

console.log(`\n=== ESG status state: ${cases.length + 1}/${cases.length + 1} passed ===\n`);
