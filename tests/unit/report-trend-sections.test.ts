import {
  buildEsgMetricsSummaryReport,
  buildSavedReportSnapshotSections,
  buildTrendReportSections,
} from "../../server/report-engine";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => void) {
  try {
    fn();
    pass(name);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

console.log("\n=== Unit: Report Trend Sections ===\n");

await check("builds trend summary, metric trends, and notes sections", () => {
  const sections = buildTrendReportSections({
    comparisonLabel: "Compared with previous month",
    currentPeriod: "2025-05",
    currentPeriodLabel: "May 2025",
    previousPeriod: "2025-04",
    previousPeriodLabel: "Apr 2025",
    improvements: [{ metricId: "m1" }],
    worsening: [],
    metrics: [
      {
        metricId: "m1",
        metricName: "Electricity Consumption",
        reason: "ok",
        currentValue: 80,
        previousValue: 100,
        absoluteDelta: -20,
        direction: "improved",
        changeLabel: "Improved",
      },
    ],
    unavailable: [
      { metricId: "m2", metricName: "Water Use", reason: "missing_previous" },
    ],
    notes: ["No prior-period data available for 1 metric."],
  });

  assert(sections.map((section) => section.title).join("|") === "Trend Summary|Metric Trends|Trend Notes", `unexpected sections ${sections.map((section) => section.title).join(",")}`);
  assert(sections[0].content?.includes("Compared with previous month"), "summary missing comparison label");
  assert(sections[1].rows?.[0]?.label === "Electricity Consumption", "metric trend row missing metric name");
  assert(sections[2].items?.[0]?.includes("No prior-period data"), "trend notes missing insufficient-data note");
});

await check("adds safe unavailable note when no explicit notes exist", () => {
  const sections = buildTrendReportSections({
    comparisonLabel: "Compared with previous year",
    currentPeriod: "2025",
    previousPeriod: "2024",
    improvements: [],
    worsening: [],
    metrics: [],
    unavailable: [{ metricId: "m1", metricName: "Policy in place", reason: "not_applicable_yes_no" }],
  });

  assert(sections.some((section) => section.title === "Trend Summary"), "missing summary section");
  const notes = sections.find((section) => section.title === "Trend Notes");
  assert(notes?.items?.[0]?.includes("1 metric comparison unavailable"), `unexpected unavailable note ${JSON.stringify(notes?.items)}`);
});

await check("saved report snapshot sections preserve stored metrics and trend sections", () => {
  const sections = buildSavedReportSnapshotSections({
    reportTitle: "Historical Monthly Report",
    period: "2025-05",
    values: [{
      metricName: "Electricity Consumption",
      category: "environmental",
      value: 80,
      unit: "kWh",
      dataSourceLabel: "Evidenced",
      workflowLabel: "Approved",
    }],
    trendSummary: {
      comparisonLabel: "Compared with previous month",
      currentPeriod: "2025-05",
      previousPeriod: "2025-04",
      improvements: [],
      worsening: [],
      metrics: [{
        metricName: "Electricity Consumption",
        reason: "ok",
        currentValue: 80,
        previousValue: 100,
        changeLabel: "Improved",
      }],
      unavailable: [],
      notes: [],
    },
  });

  const titles = sections.map((section) => section.title);
  assert(titles.includes("ESG Metrics"), `missing ESG Metrics in ${titles.join(",")}`);
  assert(titles.includes("Trend Summary"), `missing Trend Summary in ${titles.join(",")}`);
  assert(titles.includes("Metric Trends"), `missing Metric Trends in ${titles.join(",")}`);
  const metrics = sections.find((section) => section.title === "ESG Metrics");
  assert(metrics?.tableRows?.[0]?.[0] === "Electricity Consumption", "snapshot metric row missing stored metric");
});

await check("saved report converts canonical kgCO2e carbon totals to tonnes", () => {
  const sections = buildSavedReportSnapshotSections({
    carbonSummary: {
      scope1: 1_250,
      scope2: 500,
      scope3: 250,
      total: 2_000,
      unit: "kgCO2e",
    },
  });

  const carbon = sections.find((section) => section.title === "Carbon Summary");
  assert(carbon?.rows?.[0]?.value === "1.25 tCO2e", `unexpected Scope 1 ${carbon?.rows?.[0]?.value}`);
  assert(carbon?.rows?.[3]?.value === "2.00 tCO2e", `unexpected total ${carbon?.rows?.[3]?.value}`);
});

await check("saved report preserves explicitly tonne-based legacy carbon values", () => {
  const sections = buildSavedReportSnapshotSections({
    carbon: {
      scope1: 1.25,
      scope2: 0.5,
      scope3: 0.25,
      totalEmissions: 2,
      unit: "tCO2e",
    },
  });

  const carbon = sections.find((section) => section.title === "Carbon Summary");
  assert(carbon?.rows?.[0]?.value === "1.25 tCO2e", `unexpected Scope 1 ${carbon?.rows?.[0]?.value}`);
  assert(carbon?.rows?.[3]?.value === "2.00 tCO2e", `unexpected total ${carbon?.rows?.[3]?.value}`);
});

await check("calculated metrics are labelled Derived even when legacy rows defaulted to manual", () => {
  const report = buildEsgMetricsSummaryReport({
    company: { name: "Example SME" },
    metrics: [{
      id: "scope-2",
      name: "Scope 2 Emissions",
      category: "environmental",
      unit: "tCO2e",
      metricType: "calculated",
    }],
    values: [{
      metricId: "scope-2",
      value: "0.1600",
      dataSourceType: "manual",
      notes: "Auto-calculated",
    }],
    period: "2026-08",
  });
  const environmental = report.sections.find((section) => section.title === "Environmental Metrics");
  assert(environmental?.tableRows?.[0]?.[3] === "Derived", `unexpected source ${environmental?.tableRows?.[0]?.[3]}`);
});

const passed = results.filter((result) => result.passed).length;
const total = results.length;
console.log(`\n=== Report Trend Sections: ${passed}/${total} passed ===\n`);
if (passed < total) process.exit(1);
