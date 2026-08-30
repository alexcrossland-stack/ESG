import assert from "node:assert/strict";

import {
  INLINE_METRIC_EVIDENCE_LABELS,
  getInlineMetricEvidenceState,
  isUsableMetricEvidence,
} from "../../client/src/lib/metric-evidence-state";

assert.equal(getInlineMetricEvidenceState([]), "missing");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "uploaded" }]), "source_linked");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "available" }]), "source_linked");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "reviewed" }]), "reviewed");
assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: "APPROVED" }]), "evidence_backed");
for (const status of [null, "", "pending", "rejected", "expired", "quarantined", "deleted", "unexpected"]) {
  assert.equal(isUsableMetricEvidence({ evidenceStatus: status }), false, `${status} evidence is unusable`);
  assert.equal(getInlineMetricEvidenceState([{ evidenceStatus: status }]), "missing");
}
const fixedNow = new Date("2026-08-30T12:00:00.000Z");
assert.equal(
  isUsableMetricEvidence({ evidenceStatus: "approved", expiryDate: "2026-08-29T12:00:00.000Z" }, fixedNow),
  false,
  "date-expired evidence is unusable even before a scheduler updates its status",
);
assert.equal(
  isUsableMetricEvidence({ evidenceStatus: "approved", expiryDate: "2026-09-01T12:00:00.000Z" }, fixedNow),
  true,
  "future-dated evidence remains usable",
);
assert.equal(
  isUsableMetricEvidence({ evidenceStatus: "approved", expiryDate: "not-a-date" }, fixedNow),
  false,
  "evidence with an invalid expiry date fails closed",
);
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
