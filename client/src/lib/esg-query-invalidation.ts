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
] as const;

export function invalidateEsgReadinessQueries(queryClient: QueryClient): void {
  for (const queryKey of ESG_READINESS_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }
}
