type PassportMetric = {
  name?: unknown;
  unit?: unknown;
};

type PassportMetricValue = {
  id?: unknown;
  period?: unknown;
  value?: unknown;
  valueNumeric?: unknown;
  status?: unknown;
  dataSourceType?: unknown;
  sourceType?: unknown;
  workflowStatus?: unknown;
  siteId?: unknown;
  submittedAt?: unknown;
  reviewedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

type PassportCarbonCalculation = {
  id?: unknown;
  reportingPeriod?: unknown;
  siteId?: unknown;
  scope1Total?: unknown;
  scope2Total?: unknown;
  scope3Total?: unknown;
  totalEmissions?: unknown;
  factorYear?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PassportMetricSelection = {
  value: number | null;
  status: string | null;
  period: string;
  dataSourceType: string | null;
  dataSourceLabel: string;
  workflowStatus: string | null;
  workflowLabel: string;
  sourceScope: "organisation" | "active_sites" | "none";
  sourceLabel: string;
  aggregationMethod: "organisation_record" | "sum" | "average" | "none";
  aggregationLabel: string;
  contributingSiteCount: number;
  selectedRecordCount: number;
  containsEstimatedData: boolean;
};

export type PassportCarbonSelection = {
  available: boolean;
  reportingPeriod: string;
  matchesPassportPeriod: true;
  scope1: number | null;
  scope2: number | null;
  scope3: number | null;
  total: number | null;
  factorYear: number | null;
  factorYearLabel: string;
  sourceScope: "organisation" | "active_sites" | "none";
  sourceLabel: string;
  aggregationMethod: "organisation_record" | "sum" | "none";
  aggregationLabel: string;
  contributingSiteCount: number;
};

const PUBLIC_POLICY_STATUSES = new Set(["active", "approved", "published"]);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function recordTimestamp(
  record: PassportMetricValue | PassportCarbonCalculation,
  key: "updatedAt" | "reviewedAt" | "submittedAt" | "createdAt",
): number {
  const value = (record as Record<string, unknown>)[key];
  if (!value) return 0;
  const timestamp = new Date(value as string | number | Date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestRecord<T extends PassportMetricValue | PassportCarbonCalculation>(records: T[]): T | null {
  if (records.length === 0) return null;
  return [...records].sort((left, right) => {
    for (const key of ["updatedAt", "reviewedAt", "submittedAt", "createdAt"] as const) {
      const timestampDelta = recordTimestamp(right, key) - recordTimestamp(left, key);
      if (timestampDelta !== 0) return timestampDelta;
    }
    return String(right.id || "").localeCompare(String(left.id || ""));
  })[0];
}

function titleCaseLabel(value: string | null, fallback: string): string {
  if (!value) return fallback;
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function combinedStringValue(
  records: PassportMetricValue[],
  read: (record: PassportMetricValue) => string | null,
): string | null {
  const values = Array.from(new Set(records.map(read).filter((value): value is string => Boolean(value))));
  if (values.length === 0) return null;
  return values.length === 1 ? values[0] : "mixed";
}

function metricValueNumber(record: PassportMetricValue): number | null {
  return asFiniteNumber(record.value ?? record.valueNumeric);
}

function metricIsRateLike(metric: PassportMetric): boolean {
  const unit = asNonEmptyString(metric.unit)?.toLowerCase() || "";
  const name = asNonEmptyString(metric.name)?.toLowerCase() || "";
  return unit.includes("%")
    || /\b(percent|percentage|rate|ratio|proportion|intensity|share)\b/.test(unit)
    || unit.includes("/")
    || /\b(percent|percentage|rate|ratio|proportion|intensity|share)\b/.test(name);
}

function combinedMetricStatus(records: PassportMetricValue[]): string | null {
  const statuses = records
    .map((record) => asNonEmptyString(record.status)?.toLowerCase() || null)
    .filter((value): value is string => Boolean(value));
  if (statuses.includes("red")) return "red";
  if (statuses.includes("amber")) return "amber";
  if (statuses.length > 0 && statuses.every((status) => status === "green")) return "green";
  return combinedStringValue(records, (record) => asNonEmptyString(record.status)?.toLowerCase() || null);
}

function emptyMetricSelection(period: string, publishedOnly: boolean): PassportMetricSelection {
  return {
    value: null,
    status: null,
    period,
    dataSourceType: null,
    dataSourceLabel: "No source",
    workflowStatus: null,
    workflowLabel: publishedOnly ? "No approved record" : "No record",
    sourceScope: "none",
    sourceLabel: publishedOnly ? "No approved value for this period" : "No value for this period",
    aggregationMethod: "none",
    aggregationLabel: "No records selected",
    contributingSiteCount: 0,
    selectedRecordCount: 0,
    containsEstimatedData: false,
  };
}

function metricSelectionMetadata(
  records: PassportMetricValue[],
  sourceScope: "organisation" | "active_sites",
  period: string,
) {
  const workflowStatus = combinedStringValue(
    records,
    (record) => asNonEmptyString(record.workflowStatus)?.toLowerCase() || null,
  );
  const dataSourceType = combinedStringValue(
    records,
    (record) => asNonEmptyString(record.dataSourceType ?? record.sourceType)?.toLowerCase() || null,
  );
  const dataSourceLabel = titleCaseLabel(dataSourceType, "Unspecified source");
  const containsEstimatedData = records.some((record) =>
    asNonEmptyString(record.dataSourceType ?? record.sourceType)?.toLowerCase() === "estimated"
  );
  const siteCount = sourceScope === "active_sites" ? records.length : 0;

  return {
    status: combinedMetricStatus(records),
    period,
    dataSourceType,
    dataSourceLabel,
    workflowStatus,
    workflowLabel: titleCaseLabel(workflowStatus, "Workflow not recorded"),
    sourceScope,
    sourceLabel: sourceScope === "organisation"
      ? `Organisation-level ${dataSourceLabel.toLowerCase()} record`
      : dataSourceType === "mixed"
        ? `Mixed sources across ${siteCount} active sites`
        : `${siteCount} active-site ${dataSourceLabel.toLowerCase()} record${siteCount === 1 ? "" : "s"}`,
    contributingSiteCount: siteCount,
    selectedRecordCount: records.length,
    containsEstimatedData,
  };
}

/**
 * Selects one organisation-wide metric fact for the Passport. An organisation
 * record always takes precedence, avoiding the common double-counting bug where
 * an existing company total is added to its site components.
 */
export function selectPassportMetricValue(input: {
  metric: PassportMetric;
  values: PassportMetricValue[];
  period: string;
  activeSiteIds: Iterable<string>;
  publishedOnly?: boolean;
}): PassportMetricSelection {
  const publishedOnly = input.publishedOnly === true;
  const activeSiteIds = new Set(input.activeSiteIds);
  const eligible = input.values.filter((record) => {
    if (String(record.period || "") !== input.period) return false;
    if (!publishedOnly) return true;
    return asNonEmptyString(record.workflowStatus)?.toLowerCase() === "approved";
  });

  const organisationRecord = latestRecord(eligible.filter((record) => !asNonEmptyString(record.siteId)));
  if (organisationRecord) {
    return {
      value: metricValueNumber(organisationRecord),
      ...metricSelectionMetadata([organisationRecord], "organisation", input.period),
      aggregationMethod: "organisation_record",
      aggregationLabel: "Latest organisation-level record; site records are not added",
    };
  }

  const latestBySite = new Map<string, PassportMetricValue>();
  for (const record of eligible) {
    const siteId = asNonEmptyString(record.siteId);
    if (!siteId || !activeSiteIds.has(siteId)) continue;
    const current = latestBySite.get(siteId);
    if (!current || latestRecord([current, record]) === record) latestBySite.set(siteId, record);
  }

  const siteRecords = Array.from(latestBySite.values()).filter((record) => metricValueNumber(record) !== null);
  if (siteRecords.length === 0) return emptyMetricSelection(input.period, publishedOnly);

  const numbers = siteRecords.map((record) => metricValueNumber(record) as number);
  const useAverage = metricIsRateLike(input.metric);
  const value = useAverage
    ? numbers.reduce((total, number) => total + number, 0) / numbers.length
    : numbers.reduce((total, number) => total + number, 0);
  const aggregationMethod = useAverage ? "average" : "sum";

  return {
    value,
    ...metricSelectionMetadata(siteRecords, "active_sites", input.period),
    aggregationMethod,
    aggregationLabel: useAverage
      ? `Average of the latest records from ${siteRecords.length} active sites`
      : `Sum of the latest records from ${siteRecords.length} active sites`,
  };
}

function sumCarbonField(
  records: PassportCarbonCalculation[],
  field: "scope1Total" | "scope2Total" | "scope3Total" | "totalEmissions",
): number | null {
  const values = records
    .map((record) => asFiniteNumber(record[field]))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

function carbonTotal(record: PassportCarbonCalculation): number | null {
  const recordedTotal = asFiniteNumber(record.totalEmissions);
  if (recordedTotal !== null) return recordedTotal;
  const scopes = [record.scope1Total, record.scope2Total, record.scope3Total]
    .map(asFiniteNumber)
    .filter((value): value is number => value !== null);
  return scopes.length > 0 ? scopes.reduce((total, value) => total + value, 0) : null;
}

function carbonFactorYear(records: PassportCarbonCalculation[]) {
  const years = Array.from(new Set(records
    .map((record) => asFiniteNumber(record.factorYear))
    .filter((value): value is number => value !== null)));
  return {
    factorYear: years.length === 1 ? years[0] : null,
    factorYearLabel: years.length === 0 ? "Not recorded" : years.length === 1 ? String(years[0]) : "Mixed factor years",
  };
}

function emptyCarbonSelection(reportingPeriod: string): PassportCarbonSelection {
  return {
    available: false,
    reportingPeriod,
    matchesPassportPeriod: true,
    scope1: null,
    scope2: null,
    scope3: null,
    total: null,
    factorYear: null,
    factorYearLabel: "Not recorded",
    sourceScope: "none",
    sourceLabel: "No carbon calculation for this reporting period",
    aggregationMethod: "none",
    aggregationLabel: "No period-matched carbon calculations selected",
    contributingSiteCount: 0,
  };
}

/** Selects carbon only from the Passport period, with the same org-first boundary rule. */
export function selectPassportCarbonCalculation(input: {
  calculations: PassportCarbonCalculation[];
  reportingPeriod: string;
  activeSiteIds: Iterable<string>;
}): PassportCarbonSelection {
  const activeSiteIds = new Set(input.activeSiteIds);
  const periodCalculations = input.calculations.filter(
    (calculation) => String(calculation.reportingPeriod || "") === input.reportingPeriod,
  );
  const organisationCalculation = latestRecord(
    periodCalculations.filter((calculation) => !asNonEmptyString(calculation.siteId)),
  );

  if (organisationCalculation) {
    const total = carbonTotal(organisationCalculation);
    return {
      available: total !== null
        || asFiniteNumber(organisationCalculation.scope1Total) !== null
        || asFiniteNumber(organisationCalculation.scope2Total) !== null
        || asFiniteNumber(organisationCalculation.scope3Total) !== null,
      reportingPeriod: input.reportingPeriod,
      matchesPassportPeriod: true,
      scope1: asFiniteNumber(organisationCalculation.scope1Total),
      scope2: asFiniteNumber(organisationCalculation.scope2Total),
      scope3: asFiniteNumber(organisationCalculation.scope3Total),
      total,
      ...carbonFactorYear([organisationCalculation]),
      sourceScope: "organisation",
      sourceLabel: "Latest organisation-level carbon calculation",
      aggregationMethod: "organisation_record",
      aggregationLabel: "Latest organisation-level calculation; site calculations are not added",
      contributingSiteCount: 0,
    };
  }

  const latestBySite = new Map<string, PassportCarbonCalculation>();
  for (const calculation of periodCalculations) {
    const siteId = asNonEmptyString(calculation.siteId);
    if (!siteId || !activeSiteIds.has(siteId)) continue;
    const current = latestBySite.get(siteId);
    if (!current || latestRecord([current, calculation]) === calculation) latestBySite.set(siteId, calculation);
  }
  const siteCalculations = Array.from(latestBySite.values());
  if (siteCalculations.length === 0) return emptyCarbonSelection(input.reportingPeriod);

  const siteTotals = siteCalculations
    .map(carbonTotal)
    .filter((value): value is number => value !== null);
  const total = siteTotals.length > 0 ? siteTotals.reduce((sum, value) => sum + value, 0) : null;
  const scope1 = sumCarbonField(siteCalculations, "scope1Total");
  const scope2 = sumCarbonField(siteCalculations, "scope2Total");
  const scope3 = sumCarbonField(siteCalculations, "scope3Total");

  return {
    available: total !== null || scope1 !== null || scope2 !== null || scope3 !== null,
    reportingPeriod: input.reportingPeriod,
    matchesPassportPeriod: true,
    scope1,
    scope2,
    scope3,
    total,
    ...carbonFactorYear(siteCalculations),
    sourceScope: "active_sites",
    sourceLabel: `${siteCalculations.length} active-site carbon calculation${siteCalculations.length === 1 ? "" : "s"}`,
    aggregationMethod: "sum",
    aggregationLabel: `Sum of one latest calculation from each of ${siteCalculations.length} active sites`,
    contributingSiteCount: siteCalculations.length,
  };
}

/**
 * Public policy records must be unambiguously public. If multiple status fields
 * exist (for example generated-policy status plus workflow status), every one
 * must be active, approved or published; an explicit draft always excludes it.
 */
export function isPublicPassportPolicyRecord(record: {
  status?: unknown;
  workflowStatus?: unknown;
}): boolean {
  const statuses = [record.status, record.workflowStatus]
    .map((status) => asNonEmptyString(status)?.toLowerCase() || null)
    .filter((status): status is string => Boolean(status));
  return statuses.length > 0 && statuses.every((status) => PUBLIC_POLICY_STATUSES.has(status));
}
