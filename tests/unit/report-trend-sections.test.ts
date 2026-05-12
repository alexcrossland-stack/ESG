import { buildTrendReportSections } from "../../server/report-engine";

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

const passed = results.filter((result) => result.passed).length;
const total = results.length;
console.log(`\n=== Report Trend Sections: ${passed}/${total} passed ===\n`);
if (passed < total) process.exit(1);
