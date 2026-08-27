import assert from "node:assert/strict";

import {
  isPublicPassportPolicyRecord,
  selectPassportCarbonCalculation,
  selectPassportMetricValue,
} from "../../server/esg-passport-accuracy";

const activeSiteIds = ["site-a", "site-b"];

const organisationFirst = selectPassportMetricValue({
  metric: { name: "Electricity consumed", unit: "kWh" },
  period: "FY2026",
  activeSiteIds,
  publishedOnly: true,
  values: [
    {
      id: "org",
      period: "FY2026",
      value: "100",
      siteId: null,
      workflowStatus: "approved",
      dataSourceType: "evidenced",
      submittedAt: "2026-08-03T00:00:00.000Z",
    },
    {
      id: "site-a",
      period: "FY2026",
      value: "60",
      siteId: "site-a",
      workflowStatus: "approved",
      submittedAt: "2026-08-02T00:00:00.000Z",
    },
    {
      id: "site-b",
      period: "FY2026",
      value: "40",
      siteId: "site-b",
      workflowStatus: "approved",
      submittedAt: "2026-08-02T00:00:00.000Z",
    },
  ],
});
assert.equal(organisationFirst.value, 100);
assert.equal(organisationFirst.aggregationMethod, "organisation_record");
assert.equal(organisationFirst.sourceScope, "organisation");
assert.equal(organisationFirst.workflowLabel, "Approved");
console.log("  PASS  organisation metric record takes precedence without double-counting sites");

const activeSiteSum = selectPassportMetricValue({
  metric: { name: "Electricity consumed", unit: "kWh" },
  period: "FY2026",
  activeSiteIds,
  publishedOnly: true,
  values: [
    { id: "a-old", period: "FY2026", value: "5", siteId: "site-a", workflowStatus: "approved", submittedAt: "2026-07-01" },
    { id: "a-new", period: "FY2026", value: "15", siteId: "site-a", workflowStatus: "approved", submittedAt: "2026-08-01" },
    { id: "b", period: "FY2026", value: "25", siteId: "site-b", workflowStatus: "approved", submittedAt: "2026-08-01" },
    { id: "archived", period: "FY2026", value: "900", siteId: "site-archived", workflowStatus: "approved", submittedAt: "2026-08-01" },
  ],
});
assert.equal(activeSiteSum.value, 40);
assert.equal(activeSiteSum.aggregationMethod, "sum");
assert.equal(activeSiteSum.contributingSiteCount, 2);
assert.equal(activeSiteSum.sourceScope, "active_sites");
console.log("  PASS  additive metrics sum one latest approved row per active site and exclude archived sites");

const activeSiteAverage = selectPassportMetricValue({
  metric: { name: "Employee retention rate", unit: "%" },
  period: "FY2026",
  activeSiteIds,
  publishedOnly: true,
  values: [
    { period: "FY2026", value: "80", siteId: "site-a", workflowStatus: "approved" },
    { period: "FY2026", value: "90", siteId: "site-b", workflowStatus: "approved" },
  ],
});
assert.equal(activeSiteAverage.value, 85);
assert.equal(activeSiteAverage.aggregationMethod, "average");
assert.match(activeSiteAverage.aggregationLabel, /Average/);
console.log("  PASS  percentage and rate metrics average active-site values");

const approvedOnly = selectPassportMetricValue({
  metric: { name: "Water", unit: "m3" },
  period: "FY2026",
  activeSiteIds,
  publishedOnly: true,
  values: [
    { period: "FY2026", value: "999", siteId: null, workflowStatus: "draft", submittedAt: "2026-08-02" },
    { period: "FY2026", value: "12", siteId: "site-a", workflowStatus: "approved", submittedAt: "2026-08-01" },
  ],
});
assert.equal(approvedOnly.value, 12);
assert.equal(approvedOnly.workflowStatus, "approved");
assert.equal(approvedOnly.sourceScope, "active_sites");

const internalLatest = selectPassportMetricValue({
  metric: { name: "Water", unit: "m3" },
  period: "FY2026",
  activeSiteIds,
  values: [
    { period: "FY2026", value: "999", siteId: null, workflowStatus: "draft", submittedAt: "2026-08-02" },
    { period: "FY2026", value: "12", siteId: "site-a", workflowStatus: "approved", submittedAt: "2026-08-01" },
  ],
});
assert.equal(internalLatest.value, 999);
assert.equal(internalLatest.workflowStatus, "draft");
console.log("  PASS  public selection excludes drafts while the authenticated Passport retains draft visibility");

const periodIsolatedCarbon = selectPassportCarbonCalculation({
  reportingPeriod: "FY2026",
  activeSiteIds,
  calculations: [
    { id: "wrong-new", reportingPeriod: "FY2027", totalEmissions: "9999", createdAt: "2027-02-01" },
    { id: "org-old", reportingPeriod: "FY2026", totalEmissions: "100", scope1Total: "40", createdAt: "2026-01-01" },
    { id: "org-new", reportingPeriod: "FY2026", totalEmissions: "120", scope1Total: "45", factorYear: 2026, createdAt: "2026-08-01" },
    { id: "site-a", reportingPeriod: "FY2026", siteId: "site-a", totalEmissions: "80", createdAt: "2026-08-02" },
  ],
});
assert.equal(periodIsolatedCarbon.total, 120);
assert.equal(periodIsolatedCarbon.reportingPeriod, "FY2026");
assert.equal(periodIsolatedCarbon.aggregationMethod, "organisation_record");
assert.equal(periodIsolatedCarbon.matchesPassportPeriod, true);
console.log("  PASS  carbon stays in the Passport period and latest organisation calculation takes precedence");

const siteCarbon = selectPassportCarbonCalculation({
  reportingPeriod: "FY2026",
  activeSiteIds,
  calculations: [
    { id: "a-old", reportingPeriod: "FY2026", siteId: "site-a", scope1Total: "1", totalEmissions: "2", createdAt: "2026-07-01" },
    { id: "a-new", reportingPeriod: "FY2026", siteId: "site-a", scope1Total: "10", totalEmissions: "20", factorYear: 2026, createdAt: "2026-08-01" },
    { id: "b", reportingPeriod: "FY2026", siteId: "site-b", scope1Total: "15", totalEmissions: "30", factorYear: 2026, createdAt: "2026-08-01" },
    { id: "archived", reportingPeriod: "FY2026", siteId: "site-archived", totalEmissions: "500", createdAt: "2026-08-03" },
  ],
});
assert.equal(siteCarbon.scope1, 25);
assert.equal(siteCarbon.total, 50);
assert.equal(siteCarbon.contributingSiteCount, 2);
assert.equal(siteCarbon.aggregationMethod, "sum");
console.log("  PASS  carbon sums one latest calculation per active site and excludes archived sites");

const noMatchingCarbon = selectPassportCarbonCalculation({
  reportingPeriod: "FY2026",
  activeSiteIds,
  calculations: [{ reportingPeriod: "FY2025", totalEmissions: "42" }],
});
assert.equal(noMatchingCarbon.available, false);
assert.equal(noMatchingCarbon.total, null);
assert.equal(noMatchingCarbon.reportingPeriod, "FY2026");
console.log("  PASS  another period is never silently substituted for missing carbon data");

assert.equal(isPublicPassportPolicyRecord({ status: "active" }), true);
assert.equal(isPublicPassportPolicyRecord({ status: "published" }), true);
assert.equal(isPublicPassportPolicyRecord({ status: "approved", workflowStatus: "approved" }), true);
assert.equal(isPublicPassportPolicyRecord({ status: "draft" }), false);
assert.equal(isPublicPassportPolicyRecord({ status: "published", workflowStatus: "draft" }), false);
assert.equal(isPublicPassportPolicyRecord({ status: "active", workflowStatus: "submitted" }), false);
console.log("  PASS  public policy eligibility admits only unambiguously active, published or approved records");

console.log("\n=== ESG Passport accuracy: 8/8 passed ===\n");
