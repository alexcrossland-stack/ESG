import type { QueryClient } from "@tanstack/react-query";

/**
 * Query roots whose results depend on the company's active metric catalogue.
 * Keep these as roots so period-, site-, and metric-specific variants are
 * invalidated together after activation or custom-metric changes.
 */
export const METRIC_DEPENDENT_QUERY_KEYS = [
  ["/api/metric-definitions"],
  ["/api/metrics"],
  ["/api/metrics/all"],
  ["/api/data-entry"],
  ["/api/data-entry/bulk-grid"],
  ["/api/evidence/coverage"],
  ["/api/framework-readiness"],
  ["/api/data-quality"],
  ["/api/control-centre"],
  ["/api/recommendations"],
  ["/api/programme/status"],
  ["/api/benchmarks/comparison"],
  ["/api/compliance/status"],
  ["/api/dashboard"],
  ["/api/dashboard/enhanced"],
  ["/api/dashboard/actions"],
  ["/api/dashboard/readiness"],
  ["/api/esg-scores/all"],
  ["/api/esg-status"],
  ["/api/esg/coverage"],
  ["/api/esg/maturity"],
  ["/api/company/esg-profile"],
  ["/api/company/esg-profile/public"],
  ["/api/onboarding/status"],
  ["/api/reports/preflight"],
  ["/api/reports/readiness-detail"],
] as const;

export function invalidateMetricDependentQueries(queryClient: QueryClient): void {
  for (const queryKey of METRIC_DEPENDENT_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
