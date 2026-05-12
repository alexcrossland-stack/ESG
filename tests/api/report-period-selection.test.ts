/**
 * API-adjacent regression tests for report period selection.
 *
 * Run: npx tsx tests/api/report-period-selection.test.ts
 */

import {
  buildAnnualReportPeriod,
  buildQuarterlyReportPeriod,
  isPeriodWithinDateRange,
  resolveReportPeriodSelection,
} from "../../shared/report-periods.js";

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

function expectEqual(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) pass(name);
  else fail(name, `expected=${String(expected)} actual=${String(actual)}`);
}

const q1 = buildQuarterlyReportPeriod(2025, 1);
expectEqual("Q1 period key is 2025-Q1", q1.period, "2025-Q1");
expectEqual("Q1 starts on 2025-01-01", q1.dateFrom, "2025-01-01");
expectEqual("Q1 ends on 2025-03-31", q1.dateTo, "2025-03-31");
expectEqual("Q1 includes January", isPeriodWithinDateRange("2025-01", q1.dateFrom, q1.dateTo), true);
expectEqual("Q1 includes March", isPeriodWithinDateRange("2025-03", q1.dateFrom, q1.dateTo), true);
expectEqual("Q1 excludes April", isPeriodWithinDateRange("2025-04", q1.dateFrom, q1.dateTo), false);
expectEqual("Q1 excludes prior December", isPeriodWithinDateRange("2024-12", q1.dateFrom, q1.dateTo), false);

const annual = buildAnnualReportPeriod(2025);
expectEqual("annual period key is 2025", annual.period, "2025");
expectEqual("annual starts on 2025-01-01", annual.dateFrom, "2025-01-01");
expectEqual("annual ends on 2025-12-31", annual.dateTo, "2025-12-31");
expectEqual("annual includes selected-year December", isPeriodWithinDateRange("2025-12", annual.dateFrom, annual.dateTo), true);
expectEqual("annual excludes next-year January", isPeriodWithinDateRange("2026-01", annual.dateFrom, annual.dateTo), false);

const resolvedQuarter = resolveReportPeriodSelection({ periodType: "quarterly", period: "2025-Q3" });
expectEqual("quarter can resolve from period key", resolvedQuarter?.dateFrom, "2025-07-01");
expectEqual("quarter resolve preserves exact 3-month end", resolvedQuarter?.dateTo, "2025-09-30");

const resolvedAnnual = resolveReportPeriodSelection({ periodType: "annual", period: "2025" });
expectEqual("annual can resolve from period key", resolvedAnnual?.dateTo, "2025-12-31");

const failed = results.filter((result) => !result.passed);
console.log(`\nReport period selection tests: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
