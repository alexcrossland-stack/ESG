import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getSchedulerStatus, startScheduler, stopScheduler } from "../../server/scheduler";

const beforeStart = getSchedulerStatus();
assert.equal(beforeStart.running, false);
assert.equal(beforeStart.workerId, null);
assert.equal(beforeStart.startedAt, null);
assert.equal(beforeStart.uptime, 0);

try {
  assert.equal(startScheduler(), true, "the first start must activate the scheduler");

  const running = getSchedulerStatus();
  assert.equal(running.running, true);
  assert.match(running.workerId ?? "", /^worker-[0-9a-f]{8}$/);
  assert.ok(running.startedAt, "a running scheduler must report when it started");
  assert.ok(running.uptime >= 0);

  assert.equal(startScheduler(), false, "starting an active scheduler must be idempotent");
  const afterDuplicateStart = getSchedulerStatus();
  assert.equal(afterDuplicateStart.running, true);
  assert.equal(afterDuplicateStart.workerId, running.workerId);
  assert.equal(afterDuplicateStart.startedAt, running.startedAt);

  assert.equal(stopScheduler(), true, "the first stop must deactivate the scheduler");
  const stopped = getSchedulerStatus();
  assert.equal(stopped.running, false);
  assert.equal(stopped.workerId, null);
  assert.equal(stopped.startedAt, null);
  assert.equal(stopped.uptime, 0);

  assert.equal(stopScheduler(), false, "stopping an inactive scheduler must be idempotent");

  assert.equal(startScheduler(), true, "the scheduler must be restartable after a stop");
  assert.equal(getSchedulerStatus().running, true);
} finally {
  stopScheduler();
}

const healthRouteSource = await readFile(new URL("../../server/agent-routes.ts", import.meta.url), "utf8");
assert.match(healthRouteSource, /const schedulerRunning = schedulerInfo\.running;/);
assert.doesNotMatch(healthRouteSource, /!!schedulerInfo\.workerId/);

console.log("scheduler lifecycle tests passed");
