import assert from "node:assert/strict";
import {
  ESG_READINESS_QUERY_KEYS,
  invalidateEsgReadinessQueries,
} from "../../client/src/lib/esg-query-invalidation";

const invalidated: string[] = [];
invalidateEsgReadinessQueries({
  invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    invalidated.push(String(queryKey[0]));
    return Promise.resolve();
  },
} as any);

assert.deepEqual(invalidated, [...ESG_READINESS_QUERY_KEYS]);
assert.equal(new Set(invalidated).size, invalidated.length, "readiness cache keys must be unique");

for (const requiredKey of [
  "/api/dashboard",
  "/api/dashboard/readiness",
  "/api/dashboard/actions",
  "/api/dashboard/enhanced",
  "/api/esg-status",
  "/api/reports/readiness-detail",
  "/api/data-quality",
  "/api/framework-readiness",
  "/api/recommendations",
]) {
  assert.ok(invalidated.includes(requiredKey), `${requiredKey} must be invalidated after ESG mutations`);
}

console.log("ESG readiness query invalidation contract passed");
