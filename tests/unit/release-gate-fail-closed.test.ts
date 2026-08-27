import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  formatReleaseStepFailure,
  getIncompletePlaywrightSummary,
  RELEASE_STEP_MAX_BUFFER_BYTES,
  shouldFailPlaywrightReleaseStep,
} from "../release-gate-policy";

assert.equal(getIncompletePlaywrightSummary("51 passed\n1 skipped"), "1 skipped");
assert.equal(getIncompletePlaywrightSummary("94 passed\n2 did not run"), "2 did not run");
assert.equal(getIncompletePlaywrightSummary("95 passed\n0 skipped"), null);
assert.equal(getIncompletePlaywrightSummary("all selected journeys passed"), null);

assert.equal(shouldFailPlaywrightReleaseStep(0, "51 passed\n1 skipped"), true);
assert.equal(shouldFailPlaywrightReleaseStep(0, "95 passed"), false);
assert.equal(shouldFailPlaywrightReleaseStep(1, "95 passed"), true);

const longFailure = formatReleaseStepFailure({
  output: `unhelpful-start-${"x".repeat(40)}-exact-playwright-assertion`,
  status: 1,
  signal: null,
}, 36);
assert.match(longFailure, /exit=1/);
assert.match(longFailure, /showing final 36 characters/);
assert.match(longFailure, /exact-playwright-assertion/);
assert.doesNotMatch(longFailure, /unhelpful-start/);

const spawnFailure = formatReleaseStepFailure({
  output: "",
  status: null,
  signal: "SIGTERM",
  errorMessage: "output exceeded maxBuffer",
});
assert.match(spawnFailure, /spawn error: output exceeded maxBuffer/);
assert.match(spawnFailure, /exit=unknown/);
assert.match(spawnFailure, /signal=SIGTERM/);

const noisySuccess = spawnSync(process.execPath, [
  "-e",
  'process.stdout.write("x".repeat(2 * 1024 * 1024)); process.stdout.write("release-buffer-complete")',
], {
  encoding: "utf8",
  maxBuffer: RELEASE_STEP_MAX_BUFFER_BYTES,
});
assert.equal(noisySuccess.error, undefined);
assert.equal(noisySuccess.status, 0);
assert.match(noisySuccess.stdout, /release-buffer-complete$/);

console.log("release gate fail-closed test passed");
