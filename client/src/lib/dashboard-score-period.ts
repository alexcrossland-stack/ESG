export type DashboardReportingPeriod = {
  id?: string | null;
  name?: string | null;
  startDate?: string | Date | null;
};

export type DashboardScorePeriodScope = {
  metricPeriod?: string;
  frameworkPeriod?: string;
};

function monthKey(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const calendarDate = /^(\d{4})-(\d{2})-\d{2}/.exec(value);
    if (calendarDate) return `${calendarDate[1]}-${calendarDate[2]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Dashboard metric scores retain their legacy YYYY-MM anchor, while framework
 * readiness receives the complete reporting-period identity and therefore its
 * full annual, quarterly, or custom date boundary.
 */
export function resolveDashboardScorePeriodScope(
  period: DashboardReportingPeriod | null | undefined,
): DashboardScorePeriodScope {
  if (!period) return {};
  const frameworkPeriod = String(period.id || period.name || "").trim() || undefined;
  return {
    metricPeriod: monthKey(period.startDate),
    frameworkPeriod,
  };
}

export function buildDashboardScoreQuery(input: DashboardScorePeriodScope & { siteId?: string | null }): string {
  const params = new URLSearchParams();
  if (input.metricPeriod) params.set("period", input.metricPeriod);
  if (input.frameworkPeriod) params.set("frameworkPeriod", input.frameworkPeriod);
  if (typeof input.siteId === "string") params.set("siteId", input.siteId);
  const query = params.toString();
  return query ? `?${query}` : "";
}
