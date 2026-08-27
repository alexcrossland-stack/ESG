import assert from "node:assert/strict";

import {
  INLINE_METRIC_EVIDENCE_LABELS,
  getInlineMetricEvidenceState,
} from "../../client/src/lib/metric-evidence-state";

assert.equal(getInlineMetricEvidenceState([]), "missing");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "uploaded" }]), "source_linked");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: null }]), "source_linked");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "reviewed" }]), "reviewed");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "APPROVED" }]), "evidence_backed");
assert.equal(
  getInlineMetricEvidenceState([
    { evidenceStatus: "uploaded" },
    { evidenceStatus: "reviewed" },
    { evidenceStatus: "approved" },
  ]),
  "evidence_backed",
  "the strongest API-backed state should win when a metric has several files",
);

assert.deepEqual(INLINE_METRIC_EVIDENCE_LABELS, {
  missing: "Evidence needed",
  source_linked: "Source linked",
  reviewed: "Reviewed",
  evidence_backed: "Evidence-backed",
});

console.log("Inline metric evidence state tests passed");
