import assert from "node:assert/strict";
import {
  acquirePeriodMutationLocks,
  calculationMutationLockKey,
  dataEntryPeriodMonths,
  lockedReportingRangeOverlapsMonth,
  orderedUniquePeriods,
  periodMutationLockKey,
  reportingMonthsForDateRange,
  reportingMonthsForMonthBounds,
  reportingMonthBounds,
  withPeriodCalculationRunLocks,
} from "../../server/period-locks";
import { calculationLockPool, pool as workPool } from "../../server/storage";

assert.notEqual(
  calculationLockPool,
  workPool,
  "calculation session locks must use a pool independent from normal database work",
);

const april = reportingMonthBounds("2042-04");
assert.ok(april);
assert.equal(april.start.toISOString(), "2042-04-01T00:00:00.000Z");
assert.equal(april.end.toISOString(), "2042-04-30T23:59:59.999Z");

assert.equal(reportingMonthBounds("2042-00"), null);
assert.equal(reportingMonthBounds("2042-13"), null);
assert.equal(reportingMonthBounds("2042-4"), null);
assert.equal(reportingMonthBounds("not-a-period"), null);

const overlapsApril = (startDate: string, endDate: string) => lockedReportingRangeOverlapsMonth("2042-04", {
  startDate: new Date(startDate),
  endDate: new Date(endDate),
});

assert.equal(
  overlapsApril("2042-01-01T00:00:00.000Z", "2042-12-31T23:59:59.999Z"),
  true,
  "a reporting range containing the whole month must lock it",
);
assert.equal(
  calculationMutationLockKey("tenant-a", "2042-04"),
  "calculation_run:tenant-a:2042-04",
  "calculation runs must use a separate tenant/month advisory-lock namespace",
);
assert.equal(
  overlapsApril("2042-04-10T00:00:00.000Z", "2042-04-20T00:00:00.000Z"),
  true,
  "a reporting range contained within the month must lock it",
);
assert.equal(
  overlapsApril("2042-03-01T00:00:00.000Z", "2042-04-01T00:00:00.000Z"),
  true,
  "an inclusive overlap at the first instant of the month must lock it",
);
assert.equal(
  overlapsApril("2042-04-30T23:59:59.999Z", "2042-05-31T23:59:59.999Z"),
  true,
  "an inclusive overlap at the final instant of the month must lock it",
);
assert.equal(
  overlapsApril("2042-03-01T00:00:00.000Z", "2042-03-31T23:59:59.999Z"),
  false,
  "a range ending immediately before the month must not lock it",
);
assert.equal(
  overlapsApril("2042-05-01T00:00:00.000Z", "2042-05-31T23:59:59.999Z"),
  false,
  "a range starting immediately after the month must not lock it",
);
assert.equal(
  lockedReportingRangeOverlapsMonth("2042-13", {
    startDate: new Date("2042-01-01T00:00:00.000Z"),
    endDate: new Date("2042-12-31T23:59:59.999Z"),
  }),
  false,
  "invalid reporting months must never be matched to a reporting range",
);

assert.equal(
  periodMutationLockKey("tenant-a", "2042-04"),
  "data_entry_period:tenant-a:2042-04",
  "the advisory-lock namespace must include both tenant and month",
);
assert.deepEqual(
  orderedUniquePeriods(["2042-12", "2042-02", "2042-12", "2042-01"]),
  ["2042-01", "2042-02", "2042-12"],
  "multi-period callers must deduplicate and acquire advisory locks in stable order",
);

const advisoryCalls: unknown[] = [];
const acquiredPeriods = await acquirePeriodMutationLocks(
  { execute: async (statement) => { advisoryCalls.push(statement); } },
  "tenant-a",
  ["2042-12", "2042-01", "2042-12", "2042-06"],
);
assert.deepEqual(acquiredPeriods, ["2042-01", "2042-06", "2042-12"]);
assert.equal(advisoryCalls.length, 6, "each month must take a shared calculation gate before its period lock");

const calculationOwnedCalls: unknown[] = [];
await acquirePeriodMutationLocks(
  { execute: async (statement) => { calculationOwnedCalls.push(statement); } },
  "tenant-a",
  ["2042-12", "2042-01", "2042-12", "2042-06"],
  { calculationRunLockHeld: true },
);
assert.equal(calculationOwnedCalls.length, 3, "a calculation run that owns the exclusive gate takes only period locks");

const sessionCalls: Array<{ statement: string; key: string }> = [];
let releasedWith: unknown = "not-released";
const fakeSessionClient = {
  query: async (statement: string, values: string[]) => {
    sessionCalls.push({ statement, key: values[0] });
    return { rows: statement.includes("pg_advisory_unlock") ? [{ unlocked: true }] : [] };
  },
  release: (error?: unknown) => { releasedWith = error; },
};
const lockedResult = await withPeriodCalculationRunLocks(
  { connect: async () => fakeSessionClient },
  "tenant-a",
  ["2042-06", "2042-01", "2042-06"],
  async () => "calculated",
);
assert.equal(lockedResult, "calculated");
assert.deepEqual(
  sessionCalls.map((call) => call.key),
  [
    calculationMutationLockKey("tenant-a", "2042-01"),
    calculationMutationLockKey("tenant-a", "2042-06"),
    calculationMutationLockKey("tenant-a", "2042-06"),
    calculationMutationLockKey("tenant-a", "2042-01"),
  ],
  "exclusive calculation gates must be acquired in order and released in reverse order",
);
assert.equal(releasedWith, undefined);

function createBoundedPool(limit: number) {
  let active = 0;
  let maximumActive = 0;
  const waiters: Array<() => void> = [];

  const acquire = async () => {
    if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
    maximumActive = Math.max(maximumActive, active);
  };
  const release = () => {
    active--;
    waiters.shift()?.();
  };

  return {
    async connect() {
      await acquire();
      let released = false;
      return {
        async query(statement: string) {
          return statement.includes("pg_advisory_unlock")
            ? { rows: [{ unlocked: true }] }
            : { rows: [] };
        },
        release() {
          assert.equal(released, false, "a bounded test client must be released once");
          released = true;
          release();
        },
      };
    },
    async runWork<T>(callback: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await callback();
      } finally {
        release();
      }
    },
    maximumActive: () => maximumActive,
    active: () => active,
  };
}

const boundedLockPool = createBoundedPool(3);
const boundedWorkPool = createBoundedPool(10);
const distinctScopeRuns = Array.from({ length: 12 }, (_, index) =>
  withPeriodCalculationRunLocks(
    boundedLockPool,
    `tenant-${index}`,
    [`2043-${String(index + 1).padStart(2, "0")}`],
    () => boundedWorkPool.runWork(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return index;
    }),
  ),
);
let starvationTimer: ReturnType<typeof setTimeout> | undefined;
const distinctScopeResults = await Promise.race([
  Promise.all(distinctScopeRuns),
  new Promise<never>((_, reject) => {
    starvationTimer = setTimeout(
      () => reject(new Error("12 distinct calculation scopes starved their work pool")),
      2_000,
    );
  }),
]).finally(() => {
  if (starvationTimer) clearTimeout(starvationTimer);
});
assert.deepEqual(distinctScopeResults, Array.from({ length: 12 }, (_, index) => index));
assert.equal(boundedLockPool.maximumActive(), 3, "the dedicated lock pool must stay bounded");
assert.ok(boundedWorkPool.maximumActive() > 0, "calculation callbacks must use the separate work pool");
assert.equal(boundedLockPool.active(), 0);
assert.equal(boundedWorkPool.active(), 0);

assert.deepEqual(dataEntryPeriodMonths("2042-04"), ["2042-04"]);
assert.deepEqual(dataEntryPeriodMonths("2042-Q2"), ["2042-04", "2042-05", "2042-06"]);
assert.deepEqual(dataEntryPeriodMonths("2042"), [
  "2042-01", "2042-02", "2042-03", "2042-04", "2042-05", "2042-06",
  "2042-07", "2042-08", "2042-09", "2042-10", "2042-11", "2042-12",
]);
assert.equal(dataEntryPeriodMonths("2042-4"), null, "alternate month spellings must not bypass canonical locks");
assert.equal(dataEntryPeriodMonths(["2042-04"]), null, "non-string periods must be rejected without coercion");
assert.equal(dataEntryPeriodMonths("2042-Q5"), null);

assert.deepEqual(
  reportingMonthsForMonthBounds("2098-06", "2098-08"),
  ["2098-06", "2098-07", "2098-08"],
  "database calendar bounds must expand without process-timezone conversion",
);

assert.deepEqual(
  reportingMonthsForDateRange({
    startDate: new Date("2042-11-30T23:59:59.999Z"),
    endDate: new Date("2043-02-01T00:00:00.000Z"),
  }),
  ["2042-11", "2042-12", "2043-01", "2043-02"],
  "reporting ranges must expand inclusively and deterministically across year boundaries",
);
assert.deepEqual(
  reportingMonthsForDateRange({
    startDate: new Date("2042-04-15T00:00:00.000Z"),
    endDate: new Date("2042-04-15T00:00:00.000Z"),
  }),
  ["2042-04"],
  "a same-month range must acquire exactly one month lock",
);
assert.throws(
  () => reportingMonthsForDateRange({
    startDate: new Date("2042-01-01T00:00:00.000Z"),
    endDate: new Date("2042-04-01T00:00:00.000Z"),
  }, 3),
  /at most 3 calendar months/,
  "range expansion must fail closed when its explicit lock bound is exceeded",
);
assert.throws(
  () => reportingMonthsForDateRange({
    startDate: new Date("2042-05-01T00:00:00.000Z"),
    endDate: new Date("2042-04-01T00:00:00.000Z"),
  }),
  /valid ascending range/,
);

console.log("period-lock overlap contract tests passed");
