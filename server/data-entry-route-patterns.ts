export const DATA_ENTRY_PERIOD_PARAM = ":period(\\d{4}-\\d{2})";
export const DATA_ENTRY_PERIOD_ROUTE = `/api/data-entry/${DATA_ENTRY_PERIOD_PARAM}`;

const DATA_ENTRY_PERIOD_PATH_RE = /^\/api\/data-entry\/\d{4}-\d{2}$/;

export function matchesLegacyDataEntryPeriodPath(pathname: string) {
  return DATA_ENTRY_PERIOD_PATH_RE.test(pathname);
}
