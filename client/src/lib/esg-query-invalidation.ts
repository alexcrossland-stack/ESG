import type { QueryClient } from "@tanstack/react-query";

export const ESG_READINESS_QUERY_KEYS = [
  "/api/dashboard/readiness",
  "/api/dashboard/actions",
  "/api/dashboard",
  "/api/dashboard/enhanced",
  "/api/esg-status",
  "/api/reports/readiness-detail",
  "/api/data-quality",
  "/api/framework-readiness",
  "/api/recommendations",
  "/api/control-centre",
  "/api/my-tasks",
  "/api/my-approvals",
  "/api/notifications/count",
  "/api/metrics",
  "/api/data-entry",
  "/api/raw-data",
  "/api/evidence",
  "/api/evidence/coverage",
  "/api/policy-records",
  "/api/generated-policies",
  "/api/reports",
] as const;

export function invalidateEsgReadinessQueries(queryClient: QueryClient): void {
  for (const queryKey of ESG_READINESS_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }
}
