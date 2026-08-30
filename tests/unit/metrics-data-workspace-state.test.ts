import assert from "node:assert/strict";

import {
  classifyMetricDataState,
  hasMetricWorkspaceValue,
  resolveMetricWorkspacePeriod,
  resolveMetricWorkspaceStatus,
  summarizeMetricDataStates,
} from "../../client/src/lib/metrics-data-workspace";

assert.equal(hasMetricWorkspaceValue(null), false);
assert.equal(hasMetricWorkspaceValue(undefined), false);
assert.equal(hasMetricWorkspaceValue(""), false);
assert.equal(hasMetricWorkspaceValue(" \n\t "), false);
assert.equal(hasMetricWorkspaceValue(0), true, "zero is a reported metric value");
assert.equal(hasMetricWorkspaceValue(false), true, "false is a reported metric value");

assert.equal(
  classifyMetricDataState({ value: null, evidenceCount: 0 }),
  "needs-data",
);
assert.equal(
  classifyMetricDataState({ value: "   ", evidenceCount: 2 }),
  "needs-data",
  "linked evidence must not make a blank metric complete",
);
assert.equal(
  classifyMetricDataState({ value: 0, evidenceCount: 0 }),
  "needs-evidence",
);
assert.equal(
  classifyMetricDataState({ value: false, evidenceCount: 0 }),
  "needs-evidence",
);
assert.equal(
  classifyMetricDataState({ value: "reported", evidenceCount: 1 }),
  "complete",
);
assert.equal(
  classifyMetricDataState({ value: "reported", evidenceCount: 0, evidenceRequired: false }),
  "complete",
  "optional evidence must not make a reported metric look incomplete",
);
assert.equal(
  classifyMetricDataState({ value: 17, evidenceCount: 2, requiresCorrection: true }),
  "needs-data",
  "a rejected value still needs updating",
);

assert.equal(resolveMetricWorkspacePeriod("2026-08", "monthly", "manual"), "2026-08");
assert.equal(resolveMetricWorkspacePeriod("2026-08", "quarterly", "manual"), "2026-Q3");
assert.equal(resolveMetricWorkspacePeriod("2026-08", "annual", "manual"), "2026");
assert.equal(
  resolveMetricWorkspacePeriod("2026-08", "quarterly", "calculated"),
  "2026-08",
  "guided calculated outputs remain on the monthly recalculation contract",
);
assert.equal(resolveMetricWorkspaceStatus("compliance_yes_no", null), "missing");
assert.equal(
  resolveMetricWorkspaceStatus("compliance_yes_no", { valueBoolean: false, status: "green" }),
  "red",
  "a typed No must override a stale generic green status",
);
assert.equal(resolveMetricWorkspaceStatus("compliance_yes_no", { valueText: "Yes" }), "green");
assert.equal(resolveMetricWorkspaceStatus("higher_is_better", { valueNumeric: 10, status: "amber" }), "amber");

const summary = summarizeMetricDataStates([
  classifyMetricDataState({ value: undefined, evidenceCount: 0 }),
  classifyMetricDataState({ value: "", evidenceCount: 1 }),
  classifyMetricDataState({ value: 0, evidenceCount: 0 }),
  classifyMetricDataState({ value: false, evidenceCount: 0 }),
  classifyMetricDataState({ value: 17, evidenceCount: 1 }),
  classifyMetricDataState({ value: "reported", evidenceCount: 3 }),
]);

assert.deepEqual(summary, {
  total: 6,
  needsData: 2,
  needsEvidence: 2,
  complete: 2,
});
assert.equal(
  summary.needsData + summary.needsEvidence + summary.complete,
  summary.total,
  "mutually exclusive state counts must sum to the input row count",
);

console.log("metrics data workspace state tests passed");
