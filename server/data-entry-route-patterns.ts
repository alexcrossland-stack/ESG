export const DATA_ENTRY_PERIOD_ROUTE = "/api/data-entry/:period";

const DATA_ENTRY_MONTH_PATH_RE = /^\/api\/data-entry\/\d{4}-\d{2}$/;

export function matchesLegacyDataEntryPeriodPath(pathname: string) {
  return DATA_ENTRY_MONTH_PATH_RE.test(pathname);
}

export function resolveDataEntryRoute(pathname: string) {
  if (pathname === "/api/data-entry/bulk-grid") return "bulk-grid";
  if (pathname.startsWith("/api/data-entry/") && pathname.split("/").length === 4) return "period";
  return null;
}
