import assert from "node:assert/strict";

import {
  DATA_ENTRY_PERIOD_ROUTE,
  matchesLegacyDataEntryPeriodPath,
} from "../../server/data-entry-route-patterns";

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function run() {
  try {
    assert.equal(matchesLegacyDataEntryPeriodPath("/api/data-entry/bulk-grid"), false);
    pass("bulk-grid path does not match the legacy monthly route");
  } catch (error: any) {
    fail("bulk-grid path does not match the legacy monthly route", error.message);
  }

  try {
    assert.equal(matchesLegacyDataEntryPeriodPath("/api/data-entry/2026-03"), true);
    pass("monthly yyyy-MM path still matches the legacy route");
  } catch (error: any) {
    fail("monthly yyyy-MM path still matches the legacy route", error.message);
  }

  try {
    assert.equal(DATA_ENTRY_PERIOD_ROUTE, "/api/data-entry/:period(\\d{4}-\\d{2})");
    pass("route constant keeps the Express matcher constrained to yyyy-MM periods");
  } catch (error: any) {
    fail("route constant keeps the Express matcher constrained to yyyy-MM periods", error.message);
  }
}

(async () => {
  console.log("\n=== Unit Tests: Data Entry Route Matching ===\n");
  run();
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Data entry route matching: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
