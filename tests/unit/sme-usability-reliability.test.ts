import assert from "node:assert/strict";
import { parseEmployeeSize, EMPLOYEE_SIZE_BANDS } from "../../shared/employee-size";
import { buildOnboardingMetricSubmission } from "../../client/src/lib/onboarding-metrics";
import { buildCanonicalReportingContext } from "../../server/reporting-context";
import { buildSmeImprovementPlan, type ControlCentreData } from "../../client/src/lib/sme-improvement-plan";

for (const band of EMPLOYEE_SIZE_BANDS) {
  assert.deepEqual(parseEmployeeSize(band), { ok: true, value: null, band });
}
assert.deepEqual(parseEmployeeSize("25"), { ok: true, value: 25, band: null });
assert.deepEqual(parseEmployeeSize(0), { ok: true, value: 0, band: null });
for (const invalid of ["", null, "25 people", -1, 2.5, "Infinity", "9007199254740993"]) assert.equal(parseEmployeeSize(invalid).ok, false);
assert.equal(buildOnboardingMetricSubmission("metric", "0", "2025").value, 0);
assert.throws(() => buildOnboardingMetricSubmission("metric", "invalid", "2025"));
assert.throws(() => buildOnboardingMetricSubmission("metric", "", "2025"));

const context = buildCanonicalReportingContext({ periods: [], options: { requestedPeriod: "2024-02", now: new Date("2026-09-05") } });
assert.equal(context.period.name, "2024-02");
assert.equal(context.period.endDate, "2024-02-29");
assert.equal(context.periodSource, "requested");
assert.equal(buildCanonicalReportingContext({ periods: [], options: { requestedPeriod: "2024-13", now: new Date("2026-09-05") } }).period.name, "2026-09");
assert.throws(() => buildCanonicalReportingContext({ periods: [], sites: [], options: { requestedPeriod: "2024-02", requestedSiteId: "another-company-site" } }));

const empty: ControlCentreData = { gapScore: 0, overdueActions: [], missingData: [], expiredEvidence: [], lowQuality: [], unmetCompliance: [], pendingApprovals: [], unapprovedPolicies: [], summary: { overdueActions: 0, missingData: 0, expiredEvidence: 0, lowQuality: 0, unmetCompliance: 0, pendingApprovals: 0, unapprovedPolicies: 0 } };
const tasks = buildSmeImprovementPlan({ ...empty, missingData: [
  { id: "absence", name: "Absence Rate", category: "social", metricType: "derived", linkUrl: "/data-entry?mode=guided&period=2025-12" },
  { id: "electricity", name: "Electricity Consumption", category: "environmental", metricType: "manual", linkUrl: "/data-entry?metric=electricity&period=2025-12" },
] });
assert.equal(tasks[0].id, "electricity");
assert.match(tasks[1].title, /^Complete source inputs/);
assert.equal(tasks[1].actionLabel, "Update source figures");
assert.match(tasks[0].href, /period=2025-12/);
console.log("SME usability reliability regressions passed");
