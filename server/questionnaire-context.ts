import { isPeriodWithinDateRange } from "@shared/report-periods";

export type QuestionnaireContextPeriod = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
};

export type QuestionnaireContextBoundary = {
  siteId: string | null;
  reportingPeriod: QuestionnaireContextPeriod;
};

type QuestionnaireMetricValue = {
  siteId?: string | null;
  reportingPeriodId?: string | null;
  period?: string | null;
};

type QuestionnaireCarbonCalculation = {
  siteId?: string | null;
  reportingPeriod?: string | null;
};

function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (calendarDate) return `${calendarDate[1]}-${calendarDate[2]}-${calendarDate[3]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Questionnaire reporting period has an invalid date boundary");
  }
  // reporting_periods uses timestamp-without-time-zone semantics; preserve its
  // calendar date instead of converting midnight through UTC (which can shift
  // the day during British Summer Time).
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function hasExpectedSite(recordSiteId: string | null | undefined, expectedSiteId: string | null): boolean {
  return (recordSiteId ?? null) === expectedSiteId;
}

function periodMatchesBoundary(
  valuePeriod: string | null | undefined,
  reportingPeriod: QuestionnaireContextPeriod,
): boolean {
  if (!valuePeriod) return false;
  if (valuePeriod === reportingPeriod.name) return true;
  return isPeriodWithinDateRange(
    valuePeriod,
    dateOnly(reportingPeriod.startDate),
    dateOnly(reportingPeriod.endDate),
  );
}

/**
 * Metric values with an explicit reporting-period ID must match that ID.
 * Legacy rows without an ID may match the saved period's date boundary.
 */
export function questionnaireMetricValueIsInScope(
  value: QuestionnaireMetricValue,
  boundary: QuestionnaireContextBoundary,
): boolean {
  if (!hasExpectedSite(value.siteId, boundary.siteId)) return false;
  if (value.reportingPeriodId) {
    return value.reportingPeriodId === boundary.reportingPeriod.id;
  }
  return periodMatchesBoundary(value.period, boundary.reportingPeriod);
}

/**
 * Carbon calculations predate reporting-period IDs, so constrain them using
 * the saved period name/date boundary as well as the exact questionnaire site.
 */
export function questionnaireCarbonCalculationIsInScope(
  calculation: QuestionnaireCarbonCalculation,
  boundary: QuestionnaireContextBoundary,
): boolean {
  return hasExpectedSite(calculation.siteId, boundary.siteId)
    && periodMatchesBoundary(calculation.reportingPeriod, boundary.reportingPeriod);
}
