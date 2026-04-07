import assert from "node:assert/strict";

import {
  DATA_ENTRY_PERIOD_ROUTE,
  matchesLegacyDataEntryPeriodPath,
  resolveDataEntryRoute,
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
    assert.equal(resolveDataEntryRoute("/api/data-entry/bulk-grid"), "bulk-grid");
    pass("bulk-grid resolves to the static bulk-grid route before the legacy route");
  } catch (error: any) {
    fail("bulk-grid resolves to the static bulk-grid route before the legacy route", error.message);
  }

  try {
    assert.equal(resolveDataEntryRoute("/api/data-entry/2026-03"), "period");
    assert.equal(matchesLegacyDataEntryPeriodPath("/api/data-entry/2026-03"), true);
    pass("monthly yyyy-MM path still resolves to the legacy period route");
  } catch (error: any) {
    fail("monthly yyyy-MM path still resolves to the legacy period route", error.message);
  }

  try {
    assert.equal(DATA_ENTRY_PERIOD_ROUTE, "/api/data-entry/:period");
    pass("route constant keeps the legacy route parameterized while static routes stay first");
  } catch (error: any) {
    fail("route constant keeps the legacy route parameterized while static routes stay first", error.message);
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
