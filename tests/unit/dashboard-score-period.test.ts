import assert from "node:assert/strict";

import {
  buildDashboardScoreQuery,
  resolveDashboardScorePeriodScope,
} from "../../client/src/lib/dashboard-score-period";

const quarterly = resolveDashboardScorePeriodScope({
  id: "quarterly-period-id",
  name: "FY 2027 Q2",
  startDate: "2027-04-01",
});
assert.deepEqual(quarterly, {
  metricPeriod: "2027-04",
  frameworkPeriod: "quarterly-period-id",
});
assert.equal(
  buildDashboardScoreQuery({ ...quarterly, siteId: "site-a" }),
  "?period=2027-04&frameworkPeriod=quarterly-period-id&siteId=site-a",
);
console.log("  PASS  quarterly dashboard selection keeps monthly metric scoring and full framework-period identity");

const annual = resolveDashboardScorePeriodScope({
  id: "annual-period-id",
  name: "FY 2028",
  startDate: "2028-01-01T00:00:00.000Z",
});
assert.deepEqual(annual, {
  metricPeriod: "2028-01",
  frameworkPeriod: "annual-period-id",
});
console.log("  PASS  annual dashboard selection does not collapse framework readiness to January");

const customNamed = resolveDashboardScorePeriodScope({
  name: "Custom 53-week FY",
  startDate: new Date("2028-02-03T23:00:00.000Z"),
});
assert.deepEqual(customNamed, {
  metricPeriod: "2028-02",
  frameworkPeriod: "Custom 53-week FY",
});
console.log("  PASS  custom reporting-period name is preserved when no ID is available");

assert.equal(buildDashboardScoreQuery({}), "");
console.log("  PASS  latest-data scoring remains backward compatible without explicit period parameters");
