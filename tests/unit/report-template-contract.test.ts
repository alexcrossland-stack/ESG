import assert from "node:assert/strict";
import {
  REPORT_TEMPLATE_IDS,
  REPORT_TEMPLATE_LABELS,
  isReportTemplateId,
} from "../../shared/report-templates";

assert.deepEqual(REPORT_TEMPLATE_IDS, [
  "management",
  "customer",
  "annual",
  "board",
  "compliance",
  "vsme",
  "ppn006",
]);

for (const id of REPORT_TEMPLATE_IDS) {
  assert.equal(isReportTemplateId(id), true, `${id} should be accepted`);
  assert.ok(REPORT_TEMPLATE_LABELS[id], `${id} should have a user-facing label`);
}

assert.equal(isReportTemplateId("certified"), false);
assert.match(REPORT_TEMPLATE_LABELS.vsme, /VSME/);
assert.match(REPORT_TEMPLATE_LABELS.ppn006, /PPN 006/);
assert.doesNotMatch(REPORT_TEMPLATE_LABELS.compliance, /^Compliance/);

console.log(`PASS: ${REPORT_TEMPLATE_IDS.length} report templates share one server/client contract`);
