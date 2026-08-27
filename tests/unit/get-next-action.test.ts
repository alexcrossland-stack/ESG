import assert from "node:assert/strict";

import { getNextAction } from "../../client/src/lib/get-next-action";

assert.equal(
  getNextAction({ filledMetrics: 0, esgStatus: { state: "IN_PROGRESS", missingItems: ["Electricity"] } }).title,
  "Start your ESG baseline",
);

assert.equal(
  getNextAction({
    filledMetrics: 3,
    dataCompletenessPercent: 15,
    evidenceCoveragePercent: 0,
    esgStatus: { state: "PROVISIONAL", missingItems: Array.from({ length: 17 }, (_, index) => `Metric ${index}`) },
  }).href,
  "/data-entry?focus=evidence",
  "the full sector metric denominator must not prevent the first evidence step",
);

assert.equal(
  getNextAction({
    filledMetrics: 3,
    dataCompletenessPercent: 15,
    evidenceCoveragePercent: 10,
    reportingReadiness: true,
    hasGeneratedReport: false,
    esgStatus: { state: "PROVISIONAL", missingItems: Array.from({ length: 17 }, (_, index) => `Metric ${index}`) },
  }).href,
  "/reports",
  "an SME with a viable evidenced starter set should reach its first report before optional completion",
);

assert.equal(
  getNextAction({
    filledMetrics: 10,
    dataCompletenessPercent: 60,
    evidenceCoveragePercent: 50,
    reportingReadiness: true,
    hasGeneratedReport: true,
    estimatedPercent: 30,
    esgStatus: { state: "DRAFT", missingItems: [] },
  }).href,
  "/data-entry?highlight=estimated",
);

console.log("SME next-action precedence tests passed");
