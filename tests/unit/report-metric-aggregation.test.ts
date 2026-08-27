import assert from "node:assert/strict";
import { buildEsgMetricsSummaryReport } from "../../server/report-engine";

const report = buildEsgMetricsSummaryReport({
  company: { name: "Multi-site Boolean SME" },
  metrics: [{
    id: "policy-present",
    name: "Anti-Bribery Policy in Place",
    category: "governance",
    unit: "yes/no",
    metricType: "manual",
  }],
  values: [
    {
      id: "site-a-value",
      metricId: "policy-present",
      siteId: "site-a",
      value: null,
      valueBoolean: false,
      valueText: "No",
      dataSourceType: "manual",
      workflowLabel: "Approved",
    },
    {
      id: "site-b-value",
      metricId: "policy-present",
      siteId: "site-b",
      value: null,
      valueBoolean: false,
      valueText: "No",
      dataSourceType: "manual",
      workflowLabel: "Approved",
    },
  ],
  aggregateValues: true,
});

const quality = report.sections.find((section) => section.title === "Data Quality Overview");
const qualityRows = new Map((quality?.rows ?? []).map((row) => [row.label, row.value]));
assert.equal(qualityRows.get("Total Metrics Tracked"), "1");
assert.equal(qualityRows.get("Reported / Populated"), "1");
assert.equal(qualityRows.get("Measured (entered or evidenced)"), "1");

const governance = report.sections.find((section) => section.title === "Governance Metrics");
assert.equal(governance?.tableRows?.[0]?.[1], "No");

const mixedQualityReport = buildEsgMetricsSummaryReport({
  company: { name: "Mixed-quality Boolean SME" },
  metrics: [{
    id: "policy-present",
    name: "Anti-Bribery Policy in Place",
    category: "governance",
    unit: "yes/no",
    metricType: "manual",
  }],
  values: [
    {
      id: "site-a-value",
      metricId: "policy-present",
      siteId: "site-a",
      value: null,
      valueBoolean: false,
      valueText: "No",
      dataSourceType: "manual",
      workflowLabel: "Approved",
    },
    {
      id: "site-b-value",
      metricId: "policy-present",
      siteId: "site-b",
      value: null,
      valueBoolean: false,
      valueText: "No",
      dataSourceType: "estimated",
      workflowLabel: "Draft",
    },
  ],
  aggregateValues: true,
});

const mixedQuality = mixedQualityReport.sections.find((section) => section.title === "Data Quality Overview");
const mixedQualityRows = new Map((mixedQuality?.rows ?? []).map((row) => [row.label, row.value]));
assert.equal(mixedQualityRows.get("Measured (entered or evidenced)"), "0");
assert.equal(mixedQualityRows.get("Estimated (no evidence)"), "1");

const mixedGovernance = mixedQualityReport.sections.find((section) => section.title === "Governance Metrics");
assert.equal(mixedGovernance?.tableRows?.[0]?.[3], "Estimated");
assert.equal(mixedGovernance?.tableRows?.[0]?.[4], "Mixed");

const numericReport = buildEsgMetricsSummaryReport({
  company: { name: "Multi-site Numeric SME" },
  metrics: [{
    id: "energy",
    name: "Electricity Consumption",
    category: "environmental",
    unit: "kWh",
    metricType: "manual",
  }],
  values: [101.5, 202.25, 303.75].map((value, index) => ({
    id: `site-${index}`,
    metricId: "energy",
    siteId: index === 0 ? null : `site-${index}`,
    value: value.toFixed(4),
    valueNumeric: value.toFixed(4),
    dataSourceType: "manual",
    workflowLabel: "Draft",
  })),
  aggregateValues: true,
});

const environmental = numericReport.sections.find((section) => section.title === "Environmental Metrics");
assert.equal(environmental?.tableRows?.[0]?.[1], "607.50");

console.log("report metric aggregation test passed");
