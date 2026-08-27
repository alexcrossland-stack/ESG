import assert from "node:assert/strict";

import { calculateEvidenceConfidence, calculateEvidenceCoverage, resolveEsgState } from "../../server/esg-status";

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
  {
    name: "unapproved values cannot produce the strongest state",
    input: { filledMetrics: 8, estimatedPercent: 0, completenessPercentage: 80, evidenceCoverage: 80, approvedCoverage: 20 },
    expected: "PROVISIONAL",
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
      { metricId: "metric-a", evidenceStatus: "approved" },
      { metricId: "metric-a", evidenceStatus: "approved" },
      { metricId: "disabled-metric", evidenceStatus: "approved" },
    ],
  ),
  50,
  "duplicate documents and evidence for disabled metrics must not inflate coverage",
);
console.log("  PASS  evidence coverage counts unique enabled metrics");

const evidenceConfidence = calculateEvidenceConfidence(
  ["metric-a", "metric-b"],
  [
    { metricId: "metric-a", evidenceStatus: "uploaded", linkedPeriod: "2025", siteId: null },
    { metricId: "metric-a", evidenceStatus: "reviewed", linkedPeriod: "2025", siteId: null },
    { metricId: "metric-a", evidenceStatus: "approved", linkedPeriod: "2025", siteId: null },
    { metricId: "metric-b", evidenceStatus: "approved", linkedPeriod: "2024", siteId: null },
    { metricId: "metric-b", evidenceStatus: "approved", linkedPeriod: "2025", siteId: "site-2" },
    { metricId: "metric-b", evidenceStatus: "approved", linkedPeriod: "2025", siteId: null, expiryDate: "2025-01-01" },
  ],
  { period: "2025", siteId: null, now: new Date("2026-08-26") },
);

assert.deepEqual(
  evidenceConfidence,
  {
    sourceLinked: 1,
    reviewed: 1,
    evidenceBacked: 1,
    independentlyAssured: 0,
    sourceLinkedCoverage: 50,
    reviewedCoverage: 50,
    evidenceBackedCoverage: 50,
  },
  "evidence confidence must require current, approved, period- and scope-matched evidence",
);
console.log("  PASS  evidence confidence distinguishes linked, reviewed, approved and assured proof");

console.log(`\n=== ESG status state: ${cases.length + 2}/${cases.length + 2} passed ===\n`);
