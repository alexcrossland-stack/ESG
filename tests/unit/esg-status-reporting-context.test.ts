import assert from "node:assert/strict";

import { evaluateEsgStatus } from "../../server/esg-status";
import { buildCanonicalReportingContext } from "../../server/reporting-context";
import { storage } from "../../server/storage";

const mutableStorage = storage as any;
const originals = {
  getMetrics: mutableStorage.getMetrics,
  getEvidenceFiles: mutableStorage.getEvidenceFiles,
  getMetricValuesForMetric: mutableStorage.getMetricValuesForMetric,
};

const requestedMetricIds: string[] = [];
const requestedEvidencePeriods: Array<string | undefined> = [];

try {
  mutableStorage.getMetrics = async () => [
    { id: "monthly", name: "Monthly energy", enabled: true, frequency: "monthly", metricType: "manual" },
    { id: "quarterly", name: "Quarterly workforce", enabled: true, frequency: "quarterly", metricType: "manual" },
    { id: "annual", name: "Annual policy", enabled: true, frequency: "annual", metricType: "manual" },
  ];
  mutableStorage.getEvidenceFiles = async (_companyId: string, _siteId: string | null | undefined, period?: string) => {
    requestedEvidencePeriods.push(period);
    return [
      { metricId: "monthly", linkedPeriod: "2026-Q3", siteId: "site-active", evidenceStatus: "approved" },
      { metricId: "quarterly", linkedPeriod: "2026-Q3", siteId: "site-archived", evidenceStatus: "approved" },
    ];
  };
  mutableStorage.getMetricValuesForMetric = async (_companyId: string, metricId: string) => {
    requestedMetricIds.push(metricId);
    if (metricId === "monthly") {
      return [{ metricId, period: "2026-Q3", value: "100", siteId: "site-active", dataSourceType: "manual" }];
    }
    if (metricId === "quarterly") {
      return [{ metricId, period: "2026-Q3", value: "50", siteId: "site-archived", dataSourceType: "manual" }];
    }
    return [{ metricId, period: "2026-Q3", value: "1", siteId: "site-active", dataSourceType: "manual" }];
  };

  const context = buildCanonicalReportingContext({
    periods: [{
      id: "q3",
      name: "2026-Q3",
      periodType: "quarterly",
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      status: "open",
    }],
    sites: [
      { id: "site-active", name: "Active site", status: "active" },
      { id: "site-archived", name: "Archived site", status: "archived" },
    ],
    options: { now: new Date("2026-08-26T12:00:00Z") },
  });

  const result = await evaluateEsgStatus("company-context-test", context);

  assert.deepEqual(requestedMetricIds, ["monthly", "quarterly"], "annual metric must not be due in a quarterly period");
  assert.equal(result.totalMetrics, 2, "only monthly and quarterly metrics are due");
  assert.equal(result.filledMetrics, 1, "archived-site values must not count towards the whole-organisation boundary");
  assert.equal(result.missingMetrics, 1);
  assert.deepEqual(result.missingItems, ["Quarterly workforce"]);
  assert.equal(result.evidenceCoverage, 50, "archived-site evidence must not count");
  assert.equal(requestedEvidencePeriods.at(-1), undefined, "bounded contexts must load subperiod evidence");
  console.log("  PASS  ESG status uses due frequencies and active-site boundary from canonical context");

  requestedMetricIds.length = 0;
  mutableStorage.getMetrics = async () => [
    { id: "monthly", name: "Monthly energy", enabled: true, frequency: "monthly", metricType: "manual" },
    { id: "quarterly", name: "Quarterly workforce", enabled: true, frequency: "quarterly", metricType: "manual" },
    { id: "outside", name: "Outside-only governance", enabled: true, frequency: "annual", metricType: "manual" },
    { id: "exact", name: "Exact annual record", enabled: true, frequency: "annual", metricType: "manual" },
  ];
  mutableStorage.getEvidenceFiles = async (_companyId: string, _siteId: string | null | undefined, period?: string) => {
    requestedEvidencePeriods.push(period);
    return [
      { metricId: "monthly", linkedPeriod: "2027-02", siteId: "site-active", evidenceStatus: "approved" },
      { metricId: "quarterly", linkedPeriod: "2027-Q3", siteId: "site-active", evidenceStatus: "approved" },
      { metricId: "outside", linkedPeriod: "2026-12", siteId: "site-active", evidenceStatus: "approved" },
      { metricId: "outside", linkedPeriod: "2027-06", siteId: "site-archived", evidenceStatus: "approved" },
      { metricId: "outside", linkedPeriod: "2027-07", siteId: "site-active", evidenceStatus: "rejected" },
      { metricId: "exact", linkedPeriod: "FY 2027", siteId: "site-active", evidenceStatus: "approved" },
    ];
  };
  mutableStorage.getMetricValuesForMetric = async (_companyId: string, metricId: string) => {
    requestedMetricIds.push(metricId);
    if (metricId === "monthly") {
      return [
        { metricId, period: "2028-01", value: "999", siteId: "site-active", workflowStatus: "approved" },
        { metricId, period: "2027-02", value: "100", siteId: "site-active", workflowStatus: "approved" },
        { metricId, period: "2026-12", value: "1", siteId: "site-active", workflowStatus: "approved" },
      ];
    }
    if (metricId === "quarterly") {
      return [{ metricId, period: "2027-Q3", value: "50", siteId: "site-active", workflowStatus: "approved" }];
    }
    if (metricId === "exact") {
      return [{ metricId, period: "FY 2027", value: "1", siteId: "site-active", workflowStatus: "approved" }];
    }
    return [
      { metricId, period: "2026-12", value: "1", siteId: "site-active", workflowStatus: "approved" },
      { metricId, period: "2027-06", value: "2", siteId: "site-archived", workflowStatus: "approved" },
      { metricId, period: "2027-07", value: "3", siteId: "site-active", workflowStatus: "rejected" },
      { metricId, period: "2027-08", value: "4", siteId: "site-active", workflowStatus: "archived" },
    ];
  };

  const annualContext = buildCanonicalReportingContext({
    periods: [{
      id: "fy-2027",
      name: "FY 2027",
      periodType: "annual",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      status: "open",
    }],
    sites: [
      { id: "site-active", name: "Active site", status: "active" },
      { id: "site-archived", name: "Archived site", status: "archived" },
    ],
    options: { now: new Date("2027-08-26T12:00:00Z") },
  });

  const annualResult = await evaluateEsgStatus("company-context-test", annualContext);

  assert.deepEqual(requestedMetricIds, ["monthly", "quarterly", "outside", "exact"]);
  assert.equal(annualResult.totalMetrics, 4);
  assert.equal(annualResult.filledMetrics, 3, "monthly, quarterly, and exact annual records must count");
  assert.equal(annualResult.completenessPercentage, 75);
  assert.deepEqual(annualResult.missingItems, ["Outside-only governance"]);
  assert.equal(annualResult.evidenceCoverage, 75, "only in-boundary usable evidence must count");
  assert.equal(annualResult.evidenceConfidence.evidenceBacked, 3);
  assert.equal(requestedEvidencePeriods.at(-1), undefined, "annual status must load all evidence before containment filtering");
  console.log("  PASS  annual ESG status contains monthly/quarterly records and excludes prior-year, inactive-site, rejected, and archived facts");
} finally {
  mutableStorage.getMetrics = originals.getMetrics;
  mutableStorage.getEvidenceFiles = originals.getEvidenceFiles;
  mutableStorage.getMetricValuesForMetric = originals.getMetricValuesForMetric;
}

console.log("\n=== ESG status reporting context: 2/2 passed ===\n");
