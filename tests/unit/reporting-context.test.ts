import assert from "node:assert/strict";

import {
  buildCanonicalReportingContext,
  buildReportingSiteBoundary,
  filterMetricsDueForPeriod,
  isMetricDueForPeriod,
  isSiteWithinReportingBoundary,
  normalizeMetricFrequency,
  selectCanonicalReportingPeriod,
} from "../../server/reporting-context";

const today = new Date("2026-08-26T12:00:00Z");

const periods = [
  {
    id: "annual-current",
    name: "FY 2026",
    periodType: "annual",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "open",
  },
  {
    id: "monthly-current",
    name: "Aug 2026",
    periodType: "monthly",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    status: "open",
  },
  {
    id: "future-open",
    name: "Sep 2026",
    periodType: "monthly",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    status: "open",
  },
  {
    id: "closed-latest",
    name: "Oct 2026",
    periodType: "monthly",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    status: "closed",
  },
];

assert.deepEqual(
  selectCanonicalReportingPeriod(periods, { now: today, requestedPeriod: "annual-current" }),
  { period: periods[0], source: "requested" },
  "an explicit ID/name must override automatic selection",
);
console.log("  PASS  requested period overrides automatic selection");

const covering = selectCanonicalReportingPeriod(periods, { now: today });
assert.equal(covering?.period.id, "monthly-current");
assert.equal(covering?.source, "open_covering_today");
console.log("  PASS  current open period beats a later open or closed period");

const boundaryStart = selectCanonicalReportingPeriod(periods, { now: new Date("2026-08-01T12:00:00Z") });
const boundaryEnd = selectCanonicalReportingPeriod(periods, { now: new Date("2026-08-31T12:00:00Z") });
assert.equal(boundaryStart?.period.id, "monthly-current");
assert.equal(boundaryEnd?.period.id, "monthly-current");
const localCalendarPeriod = {
  id: "local-calendar",
  name: "Local Aug 2026",
  periodType: "monthly",
  startDate: new Date(2026, 7, 1, 0, 0, 0),
  endDate: new Date(2026, 7, 31, 0, 0, 0),
  status: "open",
};
assert.equal(
  selectCanonicalReportingPeriod([localCalendarPeriod], { now: new Date(2026, 7, 31, 23, 59, 59) })?.period.id,
  "local-calendar",
);
console.log("  PASS  period start and end dates cover their full calendar day inclusively");

const latestOpen = selectCanonicalReportingPeriod(periods, { now: new Date("2027-01-15T12:00:00Z") });
assert.equal(latestOpen?.period.id, "future-open");
assert.equal(latestOpen?.source, "latest_open");
console.log("  PASS  latest open period is used when no open period covers today");

const latestClosed = selectCanonicalReportingPeriod(
  periods.map((period) => ({ ...period, status: "closed" })),
  { now: today },
);
assert.equal(latestClosed?.period.id, "closed-latest");
assert.equal(latestClosed?.source, "latest_period");
console.log("  PASS  latest period is used when no period is open");

const fallback = buildCanonicalReportingContext({ periods: [], options: { now: today } });
assert.deepEqual(
  fallback.period,
  {
    id: null,
    name: "2026-08",
    periodType: "monthly",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    status: null,
    isFallback: true,
  },
);
assert.equal(fallback.periodSource, "calendar_fallback");
console.log("  PASS  no configured periods produces a safe current-month fallback");

const frequencyMatrix = {
  monthly: { monthly: true, quarterly: false, annual: false, one_off: true },
  quarterly: { monthly: true, quarterly: true, annual: false, one_off: true },
  annual: { monthly: true, quarterly: true, annual: true, one_off: true },
} as const;

for (const [periodType, expected] of Object.entries(frequencyMatrix)) {
  for (const [frequency, isDue] of Object.entries(expected)) {
    assert.equal(
      isMetricDueForPeriod(frequency, periodType as "monthly" | "quarterly" | "annual"),
      isDue,
      `${frequency} in ${periodType}`,
    );
  }
}
assert.equal(normalizeMetricFrequency("one-off"), "one_off");
assert.equal(normalizeMetricFrequency("once"), "one_off");
assert.equal(isMetricDueForPeriod("legacy_custom", "monthly"), true);
console.log("  PASS  due-metric frequency matrix and one-off aliases are enforced");

const dueQuarterly = filterMetricsDueForPeriod(
  [
    { id: "m", frequency: "monthly" },
    { id: "q", inputFrequency: "quarterly" },
    { id: "a", frequency: "annual" },
    { id: "o", frequency: "one-off" },
  ],
  "quarterly",
);
assert.deepEqual(dueQuarterly.map((metric) => metric.id), ["m", "q", "o"]);
console.log("  PASS  metric lists are filtered to frequencies due in the selected period");

const sites = [
  { id: "site-a", name: "London", status: "active" },
  { id: "site-b", name: "Leeds", status: "active" },
  { id: "site-old", name: "Archived", status: "archived" },
];
const wholeOrganisation = buildReportingSiteBoundary(sites);
assert.equal(wholeOrganisation.scope, "all");
assert.deepEqual(wholeOrganisation.activeSiteIds, ["site-a", "site-b"]);
assert.equal(isSiteWithinReportingBoundary(null, wholeOrganisation), true);
assert.equal(isSiteWithinReportingBoundary("site-a", wholeOrganisation), true);
assert.equal(isSiteWithinReportingBoundary("site-old", wholeOrganisation), false);
console.log("  PASS  whole-organisation boundary includes org and active-site records only");

const organisationOnly = buildReportingSiteBoundary(sites, null);
assert.equal(isSiteWithinReportingBoundary(null, organisationOnly), true);
assert.equal(isSiteWithinReportingBoundary("site-a", organisationOnly), false);

const selectedSite = buildReportingSiteBoundary(sites, "site-b");
assert.equal(selectedSite.scope, "site");
assert.equal(selectedSite.siteName, "Leeds");
assert.equal(isSiteWithinReportingBoundary("site-b", selectedSite), true);
assert.equal(isSiteWithinReportingBoundary(null, selectedSite), false);
assert.throws(() => buildReportingSiteBoundary(sites, "site-old"), /not active/);
console.log("  PASS  organisation-only and active-site boundaries are explicit and safe");

const quarterlyContext = buildCanonicalReportingContext({
  periods: [{
    id: "q3",
    name: "2026-Q3",
    periodType: "quarterly",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    status: "open",
  }],
  sites,
  options: { now: today },
});
assert.equal(quarterlyContext.period.name, "2026-Q3");
assert.deepEqual(quarterlyContext.dueMetricFrequencies, ["monthly", "quarterly", "one_off"]);
console.log("  PASS  canonical context carries period, boundary, and due-frequency facts together");

console.log("\n=== Reporting context: 11/11 passed ===\n");
