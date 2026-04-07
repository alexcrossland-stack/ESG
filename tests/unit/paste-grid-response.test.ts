import assert from "node:assert/strict";

import {
  isGridResponse,
  parseBulkGridResponse,
  resolvePasteGridState,
} from "../../client/src/lib/paste-grid-response";

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

async function run() {
  try {
    assert.equal(isGridResponse({ metrics: [], values: [], lockedPeriods: [] }), false);
    pass("non-GridResponse payload with missing periods is rejected");
  } catch (error: any) {
    fail("non-GridResponse payload with missing periods is rejected", error.message);
  }

  try {
    await assert.rejects(
      () => parseBulkGridResponse({
        ok: true,
        status: 200,
        json: async () => ({ metrics: [], values: [], lockedPeriods: [] }),
      }),
      /unexpected response shape/i,
    );
    pass("bulk-grid parser throws on malformed success payloads");
  } catch (error: any) {
    fail("bulk-grid parser throws on malformed success payloads", error.message);
  }

  try {
    const state = resolvePasteGridState({
      isLoading: false,
      isError: true,
      data: { metrics: [], values: [], lockedPeriods: [] },
      error: new Error("Paste grid returned an unexpected response shape."),
    });
    assert.equal(state.kind, "error");
    assert.match(state.errorMessage || "", /unexpected response shape/i);
    pass("paste grid resolves to the safe error state when shape validation fails");
  } catch (error: any) {
    fail("paste grid resolves to the safe error state when shape validation fails", error.message);
  }
}

(async () => {
  console.log("\n=== Unit Tests: Paste Grid Response Safety ===\n");
  await run();
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Paste grid response safety: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
