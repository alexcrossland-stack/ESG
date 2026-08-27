import assert from "node:assert/strict";

import {
  buildPassportEvidenceConfidence,
  calculatePassportCompletion,
  normalizePublicProfileSections,
  selectPublicPassportSections,
} from "../../shared/esg-passport";

const completion = calculatePassportCompletion(8, 5);
assert.deepEqual(completion, {
  reportedMetrics: 5,
  totalMetrics: 8,
  missingMetrics: 3,
  percentage: 63,
});
console.log("  PASS  completion is an explainable numerator and denominator");

const confidence = buildPassportEvidenceConfidence({
  totalMetrics: 8,
  filledMetrics: 6,
  measuredCount: 5,
  estimatedCount: 1,
  sourceLinked: 4,
  reviewed: 3,
  evidenceBacked: 2,
  independentlyAssured: 1,
});
assert.equal(confidence.level, "independently_assured");
assert.equal(confidence.ladder.find((step) => step.key === "reported")?.count, 6);
assert.equal(confidence.ladder.find((step) => step.key === "evidence_backed")?.count, 2);
assert.equal(confidence.ladder.find((step) => step.key === "independently_assured")?.percentage, 13);
assert.equal(confidence.estimatedCount, 1);
console.log("  PASS  evidence confidence exposes each auditable ladder rung");

assert.deepEqual(
  normalizePublicProfileSections([
    "passport_summary",
    "report_access",
    "report_access",
    "private_notes",
    42,
  ]),
  ["passport_summary", "report_access"],
);
console.log("  PASS  public share sections are allow-listed and deduplicated");

const publicPassport = selectPublicPassportSections({
  version: 1,
  title: "SME ESG Passport",
  organisation: { name: "Example SME" },
  reportingBoundary: { label: "Whole organisation" },
  reportingPeriod: { label: "FY2025" },
  completion: { percentage: 75 },
  evidenceConfidence: { level: "reviewed" },
  emissions: { total: 120, unit: "kgCO2e" },
  policies: { total: 2 },
  actions: { total: 3 },
  targets: { total: 1 },
  reportAccess: { available: true, latest: { reportId: "internal-report-id", fileId: "internal-file-id" } },
  generatedAt: "2026-08-26T00:00:00.000Z",
  disclaimer: "Not independently assured unless stated.",
}, ["passport_summary", "evidence_confidence"]);

assert.equal(publicPassport.completion.percentage, 75);
assert.equal(publicPassport.evidenceConfidence.level, "reviewed");
assert.equal(publicPassport.emissions, undefined);
assert.equal(publicPassport.reportAccess, undefined);
assert.equal(publicPassport.organisation.name, "Example SME");
assert.equal(JSON.stringify(publicPassport).includes("internal-report-id"), false);
console.log("  PASS  privacy selection excludes unshared passport facts and internal report identifiers");

console.log("\n=== SME ESG Passport: 4/4 passed ===\n");
