export type ReportPeriodType = "monthly" | "quarterly" | "annual";

export type ReportPeriodSelection = {
  periodType: ReportPeriodType;
  year: number;
  month?: number;
  quarter?: 1 | 2 | 3 | 4;
  period: string;
  label: string;
  dateFrom: string;
  dateTo: string;
};

const QUARTERS = {
  1: { startMonth: 1, endMonth: 3 },
  2: { startMonth: 4, endMonth: 6 },
  3: { startMonth: 7, endMonth: 9 },
  4: { startMonth: 10, endMonth: 12 },
} as const;

function padMonth(month: number): string {
  return String(month).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function normalizeYear(year: unknown): number | null {
  const parsed = Number(year);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) return null;
  return parsed;
}

function normalizeQuarter(quarter: unknown): 1 | 2 | 3 | 4 | null {
  const parsed = Number(quarter);
  if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4) return parsed;
  return null;
}

function normalizeMonth(month: unknown): number | null {
  const parsed = Number(month);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return null;
  return parsed;
}

export function buildMonthlyReportPeriod(year: number, month: number): ReportPeriodSelection {
  const normalizedMonth = normalizeMonth(month);
  if (!normalizedMonth) throw new Error("Invalid report month");
  const monthLabel = new Date(year, normalizedMonth - 1, 1).toLocaleString("en-GB", { month: "short" });
  return {
    periodType: "monthly",
    year,
    month: normalizedMonth,
    period: `${year}-${padMonth(normalizedMonth)}`,
    label: `${monthLabel} ${year}`,
    dateFrom: `${year}-${padMonth(normalizedMonth)}-01`,
    dateTo: `${year}-${padMonth(normalizedMonth)}-${daysInMonth(year, normalizedMonth)}`,
  };
}

export function buildQuarterlyReportPeriod(year: number, quarter: 1 | 2 | 3 | 4): ReportPeriodSelection {
  const bounds = QUARTERS[quarter];
  return {
    periodType: "quarterly",
    year,
    quarter,
    period: `${year}-Q${quarter}`,
    label: `${year} Q${quarter}`,
    dateFrom: `${year}-${padMonth(bounds.startMonth)}-01`,
    dateTo: `${year}-${padMonth(bounds.endMonth)}-${daysInMonth(year, bounds.endMonth)}`,
  };
}

export function buildAnnualReportPeriod(year: number): ReportPeriodSelection {
  return {
    periodType: "annual",
    year,
    period: String(year),
    label: String(year),
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  };
}

export function buildReportPeriodSelection(periodType: ReportPeriodType, year: number, quarter?: number, month?: number): ReportPeriodSelection {
  const normalizedYear = normalizeYear(year);
  if (!normalizedYear) throw new Error("Invalid report year");
  if (periodType === "monthly") return buildMonthlyReportPeriod(normalizedYear, month ?? new Date().getMonth() + 1);
  if (periodType === "annual") return buildAnnualReportPeriod(normalizedYear);
  const normalizedQuarter = normalizeQuarter(quarter);
  if (!normalizedQuarter) throw new Error("Invalid report quarter");
  return buildQuarterlyReportPeriod(normalizedYear, normalizedQuarter);
}

export function resolveReportPeriodSelection(input: {
  periodType?: unknown;
  year?: unknown;
  month?: unknown;
  quarter?: unknown;
  period?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}): ReportPeriodSelection | null {
  const periodType = input.periodType === "monthly" || input.periodType === "annual" || input.periodType === "quarterly"
    ? input.periodType
    : null;
  if (!periodType) return null;

  let year = normalizeYear(input.year);
  const period = typeof input.period === "string" ? input.period : "";
  if (!year && /^\d{4}/.test(period)) {
    year = Number(period.slice(0, 4));
  }
  if (!year) return null;

  if (periodType === "annual") return buildAnnualReportPeriod(year);

  if (periodType === "monthly") {
    let month = normalizeMonth(input.month);
    const periodMonth = period.match(/^\d{4}-(\d{2})$/);
    if (!month && periodMonth) month = normalizeMonth(periodMonth[1]);
    if (!month) return null;
    return buildMonthlyReportPeriod(year, month);
  }

  let quarter = normalizeQuarter(input.quarter);
  const periodQuarter = period.match(/^\d{4}-Q([1-4])$/);
  if (!quarter && periodQuarter) quarter = normalizeQuarter(periodQuarter[1]);
  if (!quarter) return null;
  return buildQuarterlyReportPeriod(year, quarter);
}

function monthIndexFromDateString(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

export function periodToMonthIndex(period: unknown): number | null {
  if (typeof period !== "string") return null;
  const monthly = period.match(/^(\d{4})-(\d{2})$/);
  if (monthly) return monthIndexFromDateString(period);
  const quarterly = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterly) {
    const selection = buildQuarterlyReportPeriod(Number(quarterly[1]), Number(quarterly[2]) as 1 | 2 | 3 | 4);
    return monthIndexFromDateString(selection.dateFrom);
  }
  const annual = period.match(/^(\d{4})$/);
  if (annual) return monthIndexFromDateString(`${annual[1]}-01`);
  return monthIndexFromDateString(period);
}

export function isPeriodWithinDateRange(period: unknown, dateFrom?: unknown, dateTo?: unknown): boolean {
  const periodIndex = periodToMonthIndex(period);
  if (periodIndex === null) return true;

  const fromIndex = typeof dateFrom === "string" ? monthIndexFromDateString(dateFrom) : null;
  const toIndex = typeof dateTo === "string" ? monthIndexFromDateString(dateTo) : null;
  if (fromIndex !== null && periodIndex < fromIndex) return false;
  if (toIndex !== null && periodIndex > toIndex) return false;
  return true;
}

export function reportPeriodYears(referenceDate = new Date(), yearsBack = 6): number[] {
  const currentYear = referenceDate.getFullYear();
  return Array.from({ length: yearsBack + 1 }, (_, index) => currentYear - index);
}
