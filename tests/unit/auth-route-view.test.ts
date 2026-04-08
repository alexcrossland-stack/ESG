import assert from "node:assert/strict";

import { getInitialAuthView, getInvitationTokenFromSearch, getResetTokenFromSearch } from "../../client/src/lib/auth-route";

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
    assert.equal(getInitialAuthView(""), "tabs");
    assert.equal(getInitialAuthView("?reset=abc123"), "reset");
    assert.equal(getInitialAuthView("?invitation=invite123"), "invite");
    assert.equal(getInitialAuthView("?token=invite123"), "invite");
    pass("Auth route prefers invite activation over generic auth tabs when invite token is present");
  } catch (error: any) {
    fail("Auth route prefers invite activation over generic auth tabs when invite token is present", error.message);
  }

  try {
    assert.equal(getInvitationTokenFromSearch("?token=hello"), "hello");
    assert.equal(getInvitationTokenFromSearch("?invitation=world"), "world");
    assert.equal(getResetTokenFromSearch("?reset=reset123"), "reset123");
    pass("Auth route token helpers extract invite and reset tokens consistently");
  } catch (error: any) {
    fail("Auth route token helpers extract invite and reset tokens consistently", error.message);
  }
}

(async () => {
  console.log("\n=== Unit Tests: Auth Route View Selection ===\n");
  await run();
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Auth route view selection: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
