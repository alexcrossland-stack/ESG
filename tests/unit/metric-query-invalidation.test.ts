import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateMetricDependentQueries,
  METRIC_DEPENDENT_QUERY_KEYS,
} from "../../client/src/lib/metric-query-invalidation";

const requiredRoots = [
  "/api/metric-definitions",
  "/api/metrics",
  "/api/metrics/all",
  "/api/data-entry",
  "/api/data-entry/bulk-grid",
  "/api/evidence/coverage",
  "/api/framework-readiness",
  "/api/dashboard",
  "/api/dashboard/enhanced",
  "/api/dashboard/actions",
  "/api/dashboard/readiness",
  "/api/esg-status",
  "/api/esg/coverage",
  "/api/esg/maturity",
  "/api/company/esg-profile",
  "/api/company/esg-profile/public",
  "/api/reports/preflight",
  "/api/reports/readiness-detail",
] as const;

const configuredRoots = new Set(METRIC_DEPENDENT_QUERY_KEYS.map(([root]) => root));
for (const root of requiredRoots) {
  assert.ok(configuredRoots.has(root), `${root} must remain in the metric-dependent invalidation contract`);
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

for (const root of METRIC_DEPENDENT_QUERY_KEYS) {
  queryClient.setQueryData([...root, "period-or-scope"], { cached: true });
}
queryClient.setQueryData(["/api/company"], { cached: true });

invalidateMetricDependentQueries(queryClient);

for (const root of METRIC_DEPENDENT_QUERY_KEYS) {
  const state = queryClient.getQueryState([...root, "period-or-scope"]);
  assert.equal(state?.isInvalidated, true, `${root[0]} variants must be invalidated`);
}
assert.equal(
  queryClient.getQueryState(["/api/company"])?.isInvalidated,
  false,
  "unrelated company data must remain cached",
);

const addMetricDialog = await readFile(
  new URL("../../client/src/components/add-metric-dialog.tsx", import.meta.url),
  "utf8",
);
const settings = await readFile(new URL("../../client/src/pages/settings.tsx", import.meta.url), "utf8");
const metricsLibrary = await readFile(new URL("../../client/src/pages/metrics-library.tsx", import.meta.url), "utf8");

assert.match(addMetricDialog, /onSuccess:[\s\S]{0,300}invalidateMetricDependentQueries\(queryClient\)/);
assert.match(addMetricDialog, /validate: \(value\) => value\.trim\(\)\.length > 0 \|\| "Metric name is required"/);
assert.match(addMetricDialog, /onError:[\s\S]{0,400}variant: "destructive"/);
assert.ok(
  (settings.match(/invalidateMetricDependentQueries\(queryClient\)/g) ?? []).length >= 2,
  "settings scoring and activation mutations must propagate metric cache changes",
);
assert.match(metricsLibrary, /toggleMutation[\s\S]{0,900}invalidateMetricDependentQueries\(queryClient\)/);
assert.match(
  metricsLibrary,
  /isSuperAdmin && definitions\.length === 0 && !isLoading/,
  "platform seeding must be visible only to super admins when definitions are absent",
);
assert.equal(
  (metricsLibrary.match(/data-testid="button-seed-metrics"/g) ?? []).length,
  1,
  "the empty platform library must expose one unambiguous seed action",
);
assert.match(metricsLibrary, /authFetch\(`\/api\/metric-definitions\/\$\{metricDefinitionId\}\/framework-alignment`\)/);
assert.doesNotMatch(metricsLibrary, /fetch\(`\/api\/metric-definitions\/\$\{metricDefinitionId\}\/framework-alignment`/);

console.log("metric query invalidation tests passed");
