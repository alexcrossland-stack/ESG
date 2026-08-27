import assert from "node:assert/strict";
import { getIncompletePlaywrightSummary, shouldFailPlaywrightReleaseStep } from "../release-gate-policy";

assert.equal(getIncompletePlaywrightSummary("51 passed\n1 skipped"), "1 skipped");
assert.equal(getIncompletePlaywrightSummary("94 passed\n2 did not run"), "2 did not run");
assert.equal(getIncompletePlaywrightSummary("95 passed\n0 skipped"), null);
assert.equal(getIncompletePlaywrightSummary("all selected journeys passed"), null);

assert.equal(shouldFailPlaywrightReleaseStep(0, "51 passed\n1 skipped"), true);
assert.equal(shouldFailPlaywrightReleaseStep(0, "95 passed"), false);
assert.equal(shouldFailPlaywrightReleaseStep(1, "95 passed"), true);

console.log("release gate fail-closed test passed");
