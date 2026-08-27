import { storage } from "./storage";

export type CanonicalReportingPeriodType = "monthly" | "quarterly" | "annual";
export type CanonicalMetricFrequency = CanonicalReportingPeriodType | "one_off";
export type ReportingPeriodSelectionSource =
  | "requested"
  | "open_covering_today"
  | "latest_open"
  | "latest_period"
  | "calendar_fallback";

export type ReportingPeriodCandidate = {
  id?: string | null;
  name?: string | null;
  periodType?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  status?: string | null;
  createdAt?: Date | string | null;
};

export type ReportingSiteCandidate = {
  id: string;
  name?: string | null;
  status?: string | null;
};

export type CanonicalReportingPeriod = {
  id: string | null;
  name: string;
  periodType: CanonicalReportingPeriodType;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  isFallback: boolean;
};

export type ReportingSiteBoundary = {
  scope: "all" | "organisation" | "site";
  siteId: string | null | undefined;
  siteName: string | null;
  activeSiteIds: string[];
  label: string;
};

export type CanonicalReportingContext = {
  period: CanonicalReportingPeriod;
  periodSource: ReportingPeriodSelectionSource;
  siteBoundary: ReportingSiteBoundary;
  dueMetricFrequencies: CanonicalMetricFrequency[];
};

export type ReportingContextOptions = {
  now?: Date;
  requestedPeriod?: string | null;
  requestedSiteId?: string | null;
};

type SelectedPeriod = {
  period: ReportingPeriodCandidate;
  source: Exclude<ReportingPeriodSelectionSource, "calendar_fallback">;
};

const PERIOD_TYPE_RANK: Record<CanonicalReportingPeriodType, number> = {
  monthly: 3,
  quarterly: 2,
  annual: 1,
};

const DUE_FREQUENCIES: Record<CanonicalReportingPeriodType, CanonicalMetricFrequency[]> = {
  monthly: ["monthly", "one_off"],
  quarterly: ["monthly", "quarterly", "one_off"],
  annual: ["monthly", "quarterly", "annual", "one_off"],
};

function dateFromUnknown(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarParts(value: Date | string | null | undefined): [number, number, number] | null {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = dateFromUnknown(value);
  if (!date) return null;
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

function calendarDay(value: Date | string | null | undefined): number | null {
  const parts = calendarParts(value);
  return parts ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : null;
}

function isoDate(value: Date | string | null | undefined): string | null {
  const parts = calendarParts(value);
  if (!parts) return null;
  return [
    parts[0],
    String(parts[1]).padStart(2, "0"),
    String(parts[2]).padStart(2, "0"),
  ].join("-");
}

function normalizePeriodType(value: unknown): CanonicalReportingPeriodType {
  if (value === "quarterly" || value === "annual") return value;
  return "monthly";
}

function isOpen(period: ReportingPeriodCandidate): boolean {
  return String(period.status || "").toLowerCase() === "open";
}

function coversCalendarDay(period: ReportingPeriodCandidate, day: number): boolean {
  const start = calendarDay(period.startDate);
  const end = calendarDay(period.endDate);
  return start !== null && end !== null && start <= day && day <= end;
}

function sortableDate(value: Date | string | null | undefined): number {
  return dateFromUnknown(value)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function sortableCalendarDay(value: Date | string | null | undefined): number {
  return calendarDay(value) ?? Number.NEGATIVE_INFINITY;
}

function compareLatest(a: ReportingPeriodCandidate, b: ReportingPeriodCandidate): number {
  const aStart = sortableCalendarDay(a.startDate);
  const bStart = sortableCalendarDay(b.startDate);
  if (aStart !== bStart) return bStart > aStart ? 1 : -1;

  const aEnd = sortableCalendarDay(a.endDate);
  const bEnd = sortableCalendarDay(b.endDate);
  if (aEnd !== bEnd) return bEnd > aEnd ? 1 : -1;

  const typeDelta = PERIOD_TYPE_RANK[normalizePeriodType(b.periodType)] - PERIOD_TYPE_RANK[normalizePeriodType(a.periodType)];
  if (typeDelta !== 0) return typeDelta;

  const aCreated = sortableDate(a.createdAt);
  const bCreated = sortableDate(b.createdAt);
  if (aCreated !== bCreated) return bCreated > aCreated ? 1 : -1;

  return String(b.name || b.id || "").localeCompare(String(a.name || a.id || ""));
}

/**
 * Select a reporting period deterministically:
 * requested ID/name, otherwise open period covering today, latest open, latest period.
 */
export function selectCanonicalReportingPeriod(
  periods: ReportingPeriodCandidate[],
  options: Pick<ReportingContextOptions, "now" | "requestedPeriod"> = {},
): SelectedPeriod | null {
  const candidates = periods.filter((period) => Boolean(period?.name));
  const requested = options.requestedPeriod?.trim();
  if (requested) {
    const match = candidates.find((period) => period.id === requested || period.name === requested);
    if (match) return { period: match, source: "requested" };
  }

  const today = calendarDay(options.now ?? new Date()) ?? calendarDay(new Date())!;
  const coveringOpen = candidates
    .filter((period) => isOpen(period) && coversCalendarDay(period, today))
    .sort(compareLatest)[0];
  if (coveringOpen) return { period: coveringOpen, source: "open_covering_today" };

  const latestOpen = candidates.filter(isOpen).sort(compareLatest)[0];
  if (latestOpen) return { period: latestOpen, source: "latest_open" };

  const latestPeriod = [...candidates].sort(compareLatest)[0];
  return latestPeriod ? { period: latestPeriod, source: "latest_period" } : null;
}

export function normalizeMetricFrequency(value: unknown): CanonicalMetricFrequency | null {
  if (value === null || value === undefined || value === "") return "monthly";
  const normalized = String(value).trim().toLowerCase().replace(/[ -]+/g, "_");
  if (normalized === "monthly" || normalized === "quarterly" || normalized === "annual") return normalized;
  if (normalized === "one_off" || normalized === "oneoff" || normalized === "once") return "one_off";
  return null;
}

/**
 * Monthly metrics are due in every period, quarterly metrics in quarterly/annual
 * periods, annual metrics only in annual periods, and one-off metrics always.
 * Unknown legacy frequencies remain due so an unsupported value cannot hide work.
 */
export function isMetricDueForPeriod(
  frequency: unknown,
  periodType: CanonicalReportingPeriodType,
): boolean {
  const normalized = normalizeMetricFrequency(frequency);
  return normalized === null || DUE_FREQUENCIES[periodType].includes(normalized);
}

export function filterMetricsDueForPeriod<T extends { frequency?: unknown; inputFrequency?: unknown }>(
  metrics: T[],
  periodType: CanonicalReportingPeriodType,
): T[] {
  return metrics.filter((metric) => isMetricDueForPeriod(metric.frequency ?? metric.inputFrequency, periodType));
}

export function buildReportingSiteBoundary(
  sites: ReportingSiteCandidate[],
  requestedSiteId?: string | null,
): ReportingSiteBoundary {
  const activeSites = sites.filter((site) => site.status === undefined || site.status === null || site.status === "active");
  const activeSiteIds = activeSites.map((site) => site.id);

  if (requestedSiteId === null || requestedSiteId === "__org__" || requestedSiteId === "null") {
    return {
      scope: "organisation",
      siteId: null,
      siteName: null,
      activeSiteIds,
      label: "Organisation-wide records only",
    };
  }

  if (requestedSiteId && requestedSiteId !== "__all__") {
    const site = activeSites.find((candidate) => candidate.id === requestedSiteId);
    if (!site) throw new Error("Reporting site is not active or does not belong to this organisation");
    return {
      scope: "site",
      siteId: site.id,
      siteName: site.name ?? null,
      activeSiteIds,
      label: site.name ? `Site: ${site.name}` : "Selected site",
    };
  }

  return {
    scope: "all",
    siteId: undefined,
    siteName: null,
    activeSiteIds,
    label: activeSites.length > 0
      ? `Whole organisation (organisation records + ${activeSites.length} active site${activeSites.length === 1 ? "" : "s"})`
      : "Whole organisation",
  };
}

export function isSiteWithinReportingBoundary(
  recordSiteId: string | null | undefined,
  boundary: ReportingSiteBoundary,
): boolean {
  const normalizedSiteId = recordSiteId ?? null;
  if (boundary.scope === "organisation") return normalizedSiteId === null;
  if (boundary.scope === "site") return normalizedSiteId === boundary.siteId;
  return normalizedSiteId === null || boundary.activeSiteIds.includes(normalizedSiteId);
}

function buildFallbackPeriod(now: Date): CanonicalReportingPeriod {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthText = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    id: null,
    name: `${year}-${monthText}`,
    periodType: "monthly",
    startDate: `${year}-${monthText}-01`,
    endDate: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
    status: null,
    isFallback: true,
  };
}

function normalizeSelectedPeriod(period: ReportingPeriodCandidate): CanonicalReportingPeriod {
  return {
    id: period.id ?? null,
    name: String(period.name),
    periodType: normalizePeriodType(period.periodType),
    startDate: isoDate(period.startDate),
    endDate: isoDate(period.endDate),
    status: period.status ?? null,
    isFallback: false,
  };
}

export function buildCanonicalReportingContext(input: {
  periods: ReportingPeriodCandidate[];
  sites?: ReportingSiteCandidate[];
  options?: ReportingContextOptions;
}): CanonicalReportingContext {
  const now = input.options?.now ?? new Date();
  const selected = selectCanonicalReportingPeriod(input.periods, input.options);
  const period = selected ? normalizeSelectedPeriod(selected.period) : buildFallbackPeriod(now);
  return {
    period,
    periodSource: selected?.source ?? "calendar_fallback",
    siteBoundary: buildReportingSiteBoundary(input.sites ?? [], input.options?.requestedSiteId),
    dueMetricFrequencies: [...DUE_FREQUENCIES[period.periodType]],
  };
}

export async function resolveCompanyReportingContext(
  companyId: string,
  options: ReportingContextOptions = {},
): Promise<CanonicalReportingContext> {
  const [periods, sites] = await Promise.all([
    storage.getReportingPeriods(companyId),
    storage.getSites(companyId, true),
  ]);
  return buildCanonicalReportingContext({ periods, sites, options });
}
