import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { auditLogs, dataEntryPeriodLocks, evidenceFiles, metricEvidence, metrics, metricValues, reportingPeriods, type Metric } from "@shared/schema";
import {
  formatBooleanMetricValue,
  formatMetricDisplayValue,
  isActiveEditableDataEntryMetric,
  isBooleanMetricDataType,
  parseBooleanMetricInput,
  resolveMetricDataType,
} from "@shared/data-entry-metrics";
import { db, storage } from "./storage";
import { trackTelemetryEvent } from "./telemetry";
import {
  acquirePeriodMutationLocks,
  findLockedPeriodsInTransaction,
} from "./period-locks";
import {
  createProtectedValueError,
  getValueProtectionReason,
  protectedValueMessage,
  type ValueProtectionReason,
} from "./value-mutation-protection";

const MONTH_PERIOD_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const MAX_BULK_CELLS = 5000;
const MAX_CELL_LEVEL_AUDITS = 100;

function isMonthPeriod(value: unknown): value is string {
  return typeof value === "string" && MONTH_PERIOD_RE.test(value);
}

export type BulkMetricEntryCellInput = {
  metricId: string;
  period: string;
  rawValue: string | null;
  rowIndex?: number;
  columnIndex?: number;
};

type ExistingMetricValue = {
  id: string;
  metricId: string;
  period: string;
  value: string | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  locked: boolean | null;
  dataSourceType: string | null;
  workflowStatus: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  hasEvidence: boolean;
};

type BulkGridMetric = Pick<Metric, "id" | "name" | "category" | "unit" | "metricType" | "enabled"> & {
  dataType: string;
  readOnly: boolean;
};

export type BulkMetricGridResponse = {
  periods: string[];
  metrics: BulkGridMetric[];
  values: Array<{
    id: string;
    metricId: string;
    period: string;
    value: string | null;
    valueText: string | null;
    valueBoolean: boolean | null;
    locked: boolean;
    dataSourceType: string | null;
    workflowStatus: string | null;
    siteId: string | null;
  }>;
  lockedPeriods: string[];
};

export type BulkMetricValidationResult = {
  metricId: string;
  metricName: string | null;
  period: string;
  rawValue: string | null;
  normalizedValue: number | null;
  normalizedText: string | null;
  normalizedBoolean: boolean | null;
  normalizedDisplayValue: string | null;
  existingValue: number | null;
  existingText: string | null;
  existingBoolean: boolean | null;
  existingDisplayValue: string | null;
  status: "create" | "update" | "clear" | "unchanged" | "error";
  errors: string[];
  warnings: string[];
  readOnly: boolean;
  locked: boolean;
  protected: boolean;
  protectionReason: ValueProtectionReason | null;
  rowIndex?: number;
  columnIndex?: number;
};

export type BulkMetricValidationResponse = {
  ok: boolean;
  mode: "validate" | "commit";
  cells: BulkMetricValidationResult[];
  summary: {
    totalCells: number;
    changedCells: number;
    createCount: number;
    updateCount: number;
    clearCount: number;
    unchangedCount: number;
    errorCount: number;
    warningCount: number;
  };
  rowIssues: Array<{
    metricId: string;
    metricName: string | null;
    errors: string[];
    warnings: string[];
  }>;
  committed: boolean;
};

function previousMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cellKey(metricId: string, period: string) {
  return `${metricId}::${period}`;
}

function normalizeMetricName(name: string | null | undefined) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(scope\s+1|scope\s+2|scope\s+3|category\s+6|category\s+7|category\s+8|category\s+9)\b/g, "")
    .replace(/\b(ghg|carbon|emissions?)\b/g, "emission")
    .replace(/\b(energy|electricity)\b/g, "energy")
    .replace(/\b(water|withdrawal)\b/g, "water")
    .replace(/\b(waste|recycled?)\b/g, "waste")
    .replace(/\b(employee|employees|workforce|staff)\b/g, "employee")
    .trim();
}

function parseStoredValue(value: string | null | undefined, valueText?: string | null, valueBoolean?: boolean | null) {
  if (typeof valueBoolean === "boolean") return valueBoolean ? 1 : 0;
  const raw = value ?? valueText;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

type NormalizedBulkValue = {
  normalizedValue: number | null;
  normalizedText: string | null;
  normalizedBoolean: boolean | null;
  normalizedDisplayValue: string | null;
};

function valuesMatch(existing: NormalizedBulkValue, next: NormalizedBulkValue) {
  if (existing.normalizedBoolean !== null || next.normalizedBoolean !== null) {
    return existing.normalizedBoolean === next.normalizedBoolean;
  }
  const a = existing.normalizedValue;
  const b = next.normalizedValue;
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.000001;
}

function emptyNormalizedValue(): NormalizedBulkValue {
  return {
    normalizedValue: null,
    normalizedText: null,
    normalizedBoolean: null,
    normalizedDisplayValue: null,
  };
}

function normalizeExistingValue(existing: ExistingMetricValue | undefined): NormalizedBulkValue {
  if (!existing) return emptyNormalizedValue();
  if (typeof existing.valueBoolean === "boolean") {
    const label = formatBooleanMetricValue(existing.valueBoolean);
    return {
      normalizedValue: null,
      normalizedText: label,
      normalizedBoolean: existing.valueBoolean,
      normalizedDisplayValue: label,
    };
  }
  const numeric = parseStoredValue(existing.value, existing.valueText, existing.valueBoolean);
  return {
    normalizedValue: numeric,
    normalizedText: existing.valueText ?? null,
    normalizedBoolean: null,
    normalizedDisplayValue: formatMetricDisplayValue(existing) ?? (numeric === null ? null : String(numeric)),
  };
}

function normalizePastedValue(rawValue: string | null, metric: BulkGridMetric | undefined): NormalizedBulkValue & { error: string | null } {
  if (rawValue === null || rawValue === undefined) {
    return { ...emptyNormalizedValue(), error: null };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { ...emptyNormalizedValue(), error: null };
  }

  if (isBooleanMetricDataType(metric?.dataType)) {
    const parsed = parseBooleanMetricInput(trimmed);
    if (parsed === null) {
      return { ...emptyNormalizedValue(), error: "Invalid Yes/No format" };
    }
    const label = formatBooleanMetricValue(parsed);
    return {
      normalizedValue: null,
      normalizedText: label,
      normalizedBoolean: parsed,
      normalizedDisplayValue: label,
      error: null,
    };
  }

  const isNegativeByParens = trimmed.startsWith("(") && trimmed.endsWith(")");
  const unit = (metric?.unit || "").toLowerCase();
  const allowPercent = unit.includes("%") || trimmed.includes("%");
  const allowCurrency = /(gbp|usd|eur|£|\$|€)/i.test(unit) || /[£$€]/.test(trimmed);

  let normalized = trimmed
    .replace(/\u00a0/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");

  if (allowCurrency) normalized = normalized.replace(/[£$€]/g, "");
  if (allowPercent) normalized = normalized.replace(/%/g, "");
  if (isNegativeByParens) normalized = `-${normalized.slice(1, -1)}`;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { ...emptyNormalizedValue(), error: "Invalid numeric format" };
  }

  return {
    normalizedValue: parsed,
    normalizedText: null,
    normalizedBoolean: null,
    normalizedDisplayValue: String(parsed),
    error: null,
  };
}

function isMaterialOutlier(previousValue: number | null, nextValue: number | null) {
  if (previousValue === null || nextValue === null) return false;
  const baseline = Math.abs(previousValue) < 0.000001 ? 1 : Math.abs(previousValue);
  const delta = Math.abs(nextValue - previousValue);
  return delta >= 1 && delta / baseline >= 0.5;
}

async function loadCompanyMetrics(companyId: string): Promise<BulkGridMetric[]> {
  const companyMetrics = await db
    .select()
    .from(metrics)
    .where(eq(metrics.companyId, companyId));

  const activeDefinitions = await storage.getMetricDefinitions({ isActive: true });
  const definitionDataTypeByMetricName = new Map(
    activeDefinitions.map((def: any) => [normalizeMetricName(def.name), def.dataType ?? "numeric"]),
  );

  return companyMetrics.map((metric) => ({
    id: metric.id,
    name: metric.name,
    category: metric.category,
    unit: metric.unit,
    metricType: metric.metricType,
    enabled: Boolean(metric.enabled),
    dataType: resolveMetricDataType(metric, definitionDataTypeByMetricName.get(normalizeMetricName(metric.name))),
    readOnly: false,
  }));
}

async function loadMetricValues(
  companyId: string,
  metricIds: string[],
  periods: string[],
  siteId: string | null,
  mutationClient: any = db,
  lockForUpdate = false,
): Promise<ExistingMetricValue[]> {
  if (metricIds.length === 0 || periods.length === 0) return [] as ExistingMetricValue[];

  const query = mutationClient
    .select({
      id: metricValues.id,
      metricId: metricValues.metricId,
      period: metricValues.period,
      value: metricValues.value,
      valueText: metricValues.valueText,
      valueBoolean: metricValues.valueBoolean,
      locked: metricValues.locked,
      dataSourceType: metricValues.dataSourceType,
      workflowStatus: metricValues.workflowStatus,
      reviewedBy: metricValues.reviewedBy,
      reviewedAt: metricValues.reviewedAt,
      hasEvidence: sql<boolean>`(
        EXISTS (
          SELECT 1
          FROM ${evidenceFiles}
          WHERE ${evidenceFiles.companyId} = ${companyId}
            AND ${evidenceFiles.siteId} IS NOT DISTINCT FROM ${metricValues.siteId}
            AND (
              (${evidenceFiles.linkedModule} = 'metric_value' AND ${evidenceFiles.linkedEntityId} = ${metricValues.id})
              OR (
                ${evidenceFiles.linkedPeriod} = ${metricValues.period}
                AND (
                  ${evidenceFiles.metricId} = ${metricValues.metricId}
                  OR (${evidenceFiles.linkedModule} = 'metric' AND ${evidenceFiles.linkedEntityId} = ${metricValues.metricId})
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM ${metricEvidence}
          WHERE ${metricEvidence.metricValueId} = ${metricValues.id}
        )
      )`,
    })
    .from(metricValues)
    .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
    .where(and(
      eq(metrics.companyId, companyId),
      inArray(metricValues.metricId, metricIds),
      inArray(metricValues.period, periods),
      siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, siteId),
    ));

  const rows = await (lockForUpdate ? query.for("update") : query);
  return rows as ExistingMetricValue[];
}

async function loadLockedPeriods(companyId: string, periods: string[]) {
  if (periods.length === 0) return new Set<string>();
  const [rows, directLocks, legacyLocks] = await Promise.all([
    db.select({
      startMonth: sql<string>`to_char(${reportingPeriods.startDate}, 'YYYY-MM')`,
      endMonth: sql<string>`to_char(${reportingPeriods.endDate}, 'YYYY-MM')`,
    })
      .from(reportingPeriods)
      .where(and(eq(reportingPeriods.companyId, companyId), eq(reportingPeriods.status, "locked"))),
    db.select({ period: dataEntryPeriodLocks.period })
      .from(dataEntryPeriodLocks)
      .where(and(
        eq(dataEntryPeriodLocks.companyId, companyId),
        inArray(dataEntryPeriodLocks.period, periods),
      )),
    db.selectDistinct({ period: metricValues.period })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(
        eq(metrics.companyId, companyId),
        inArray(metricValues.period, periods),
        eq(metricValues.locked, true),
      )),
  ]);

  const lockedPeriods = new Set<string>([
    ...directLocks.map((row) => row.period),
    ...legacyLocks.map((row) => row.period),
  ]);
  for (const period of periods) {
    // Compare PostgreSQL calendar values rather than process-local Date
    // objects so month-boundary locks are independent of the Node timezone.
    if (rows.some((row) => row.startMonth <= period && row.endMonth >= period)) {
      lockedPeriods.add(period);
    }
  }
  return lockedPeriods;
}

export async function getBulkMetricGrid(companyId: string, periods: string[], siteId: string | null): Promise<BulkMetricGridResponse> {
  const sanitizedPeriods = periods.filter(isMonthPeriod).slice(0, 18);
  const companyMetrics = await loadCompanyMetrics(companyId);
  const eligibleMetrics = companyMetrics
    .filter(isActiveEditableDataEntryMetric)
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    })
    .map((metric) => ({
      id: metric.id,
      name: metric.name,
      category: metric.category,
      unit: metric.unit,
      metricType: metric.metricType,
      enabled: Boolean(metric.enabled),
      dataType: metric.dataType,
      readOnly: false,
    }));

  const values = sanitizedPeriods.length > 0
    ? await db
      .select({
        id: metricValues.id,
        metricId: metricValues.metricId,
        period: metricValues.period,
        value: metricValues.value,
        valueText: metricValues.valueText,
        valueBoolean: metricValues.valueBoolean,
        locked: metricValues.locked,
        dataSourceType: metricValues.dataSourceType,
        workflowStatus: metricValues.workflowStatus,
        siteId: metricValues.siteId,
      })
      .from(metricValues)
      .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
      .where(and(
        eq(metrics.companyId, companyId),
        inArray(metricValues.period, sanitizedPeriods),
        siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, siteId),
      ))
    : [];

  return {
    periods: sanitizedPeriods,
    metrics: eligibleMetrics,
    values: values.map((value) => ({
      ...value,
      value: formatMetricDisplayValue(value) ?? value.value,
      valueText: value.valueText ?? null,
      valueBoolean: value.valueBoolean ?? null,
      locked: Boolean(value.locked),
      dataSourceType: value.dataSourceType ?? null,
      workflowStatus: value.workflowStatus ?? null,
      siteId: value.siteId ?? null,
    })),
    lockedPeriods: Array.from(await loadLockedPeriods(companyId, sanitizedPeriods)),
  };
}

export async function validateBulkMetricPaste(params: {
  companyId: string;
  siteId: string | null;
  cells: BulkMetricEntryCellInput[];
  mode: "validate" | "commit";
}): Promise<BulkMetricValidationResponse> {
  const { companyId, siteId, cells, mode } = params;
  const trimmedCells = cells.slice(0, MAX_BULK_CELLS);
  const batchErrors: string[] = [];
  const batchWarnings: string[] = [];
  if (cells.length > MAX_BULK_CELLS) {
    batchErrors.push(`Paste exceeds the maximum batch size of ${MAX_BULK_CELLS} cells`);
  }
  const metricsForCompany = await loadCompanyMetrics(companyId);
  const metricMap = new Map(metricsForCompany.map((metric) => [metric.id, metric]));
  const metricIds = Array.from(new Set(trimmedCells.map((cell) => cell.metricId).filter(Boolean)));
  const periods = Array.from(new Set(trimmedCells.map((cell) => cell.period).filter(isMonthPeriod)));
  const previousPeriods = periods.map(previousMonth);
  const requestedPeriods = Array.from(new Set(periods.concat(previousPeriods)));
  const existingValues = await loadMetricValues(companyId, metricIds, requestedPeriods, siteId);
  const existingByKey = new Map(existingValues.map((row) => [cellKey(row.metricId, row.period), row]));
  const lockedPeriods = await loadLockedPeriods(companyId, periods);
  const seenKeys = new Set<string>();
  const rowIssues = new Map<string, { metricId: string; metricName: string | null; errors: Set<string>; warnings: Set<string> }>();

  const results = trimmedCells.map((cell) => {
    const metric = metricMap.get(cell.metricId);
    const currentKey = cellKey(cell.metricId, cell.period);
    const existing = existingByKey.get(currentKey);
    const validPeriod = isMonthPeriod(cell.period);
    const previous = validPeriod
      ? existingByKey.get(cellKey(cell.metricId, previousMonth(cell.period)))
      : undefined;
    const errors: string[] = [];
    const warnings: string[] = [];
    const readOnly = Boolean(metric && (!metric.enabled || (metric.metricType && metric.metricType !== "manual")));
    const locked = Boolean(existing?.locked) || lockedPeriods.has(cell.period);
    const protectionReason = getValueProtectionReason(existing);
    const protectedValue = protectionReason !== null && protectionReason !== "locked";

    if (!metric) errors.push("Unknown metric");
    if (!validPeriod) errors.push("Invalid reporting period");
    if (readOnly) errors.push("This cell is read-only");
    if (locked) errors.push("This reporting period is locked");
    if (protectedValue && protectionReason) errors.push(protectedValueMessage("This value", protectionReason));
    if (seenKeys.has(currentKey)) {
      errors.push("Duplicate metric / period combination in this paste");
    } else {
      seenKeys.add(currentKey);
    }

    const normalized = normalizePastedValue(cell.rawValue, metric);
    if (normalized.error) errors.push(normalized.error);

    const existingNormalized = normalizeExistingValue(existing);
    let status: BulkMetricValidationResult["status"] = "unchanged";
    if (errors.length > 0) {
      status = "error";
    } else if (!valuesMatch(existingNormalized, normalized)) {
      if (existing && normalized.normalizedValue === null && normalized.normalizedBoolean === null && normalized.normalizedText === null) {
        status = "clear";
      } else if (existing) {
        status = "update";
      } else if (normalized.normalizedValue === null && normalized.normalizedBoolean === null && normalized.normalizedText === null) {
        status = "unchanged";
      } else {
        status = "create";
      }
    }

    if (
      status !== "error" &&
      !isBooleanMetricDataType(metric?.dataType) &&
      isMaterialOutlier(parseStoredValue(previous?.value, previous?.valueText, previous?.valueBoolean), normalized.normalizedValue)
    ) {
      warnings.push("Material change versus the prior month");
    }

    const rowBucket = rowIssues.get(cell.metricId) || {
      metricId: cell.metricId,
      metricName: metric?.name || null,
      errors: new Set<string>(),
      warnings: new Set<string>(),
    };
    for (const error of errors) rowBucket.errors.add(error);
    for (const warning of warnings) rowBucket.warnings.add(warning);
    rowIssues.set(cell.metricId, rowBucket);

    return {
      metricId: cell.metricId,
      metricName: metric?.name || null,
      period: cell.period,
      rawValue: cell.rawValue,
      normalizedValue: normalized.normalizedValue,
      normalizedText: normalized.normalizedText,
      normalizedBoolean: normalized.normalizedBoolean,
      normalizedDisplayValue: normalized.normalizedDisplayValue,
      existingValue: existingNormalized.normalizedValue,
      existingText: existingNormalized.normalizedText,
      existingBoolean: existingNormalized.normalizedBoolean,
      existingDisplayValue: existingNormalized.normalizedDisplayValue,
      status,
      errors,
      warnings,
      readOnly,
      locked,
      protected: protectedValue,
      protectionReason: protectedValue ? protectionReason : null,
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
    } satisfies BulkMetricValidationResult;
  });

  const createCount = results.filter((cell) => cell.status === "create").length;
  const updateCount = results.filter((cell) => cell.status === "update").length;
  const clearCount = results.filter((cell) => cell.status === "clear").length;
  const unchangedCount = results.filter((cell) => cell.status === "unchanged").length;
  const errorCount = batchErrors.length + results.reduce((sum, cell) => sum + cell.errors.length, 0);
  const warningCount = batchWarnings.length + results.reduce((sum, cell) => sum + cell.warnings.length, 0);

  return {
    ok: errorCount === 0,
    mode,
    cells: results,
    summary: {
      totalCells: results.length,
      changedCells: createCount + updateCount + clearCount,
      createCount,
      updateCount,
      clearCount,
      unchangedCount,
      errorCount,
      warningCount,
    },
    rowIssues: [
      ...((batchErrors.length || batchWarnings.length)
        ? [{
          metricId: "__batch__",
          metricName: "Paste batch",
          errors: batchErrors,
          warnings: batchWarnings,
        }]
        : []),
      ...Array.from(rowIssues.values()).map((row) => ({
      metricId: row.metricId,
      metricName: row.metricName,
      errors: Array.from(row.errors),
      warnings: Array.from(row.warnings),
      })),
    ],
    committed: false,
  };
}

export async function commitBulkMetricPaste(params: {
  companyId: string;
  userId: string;
  siteId: string | null;
  validation: BulkMetricValidationResponse;
  req: any;
}) {
  const { companyId, userId, siteId, validation, req } = params;
  const changedCells = validation.cells.filter((cell) => cell.status === "create" || cell.status === "update" || cell.status === "clear");
  const hadAnyData = await storage.hasAnyData(companyId);
  const committedRows: Array<{
    id: string;
    metricId: string;
    metricName: string | null;
    period: string;
    previousValue: string | null;
    nextValue: string | null;
    action: "metric_value_created" | "metric_value_updated";
  }> = [];

  await db.transaction(async (tx) => {
    // Every batch takes all tenant+period locks in a stable order before any
    // row-level locks or writes, then rechecks lock state inside this tx.
    const changedPeriods = await acquirePeriodMutationLocks(
      tx,
      companyId,
      changedCells.map((cell) => cell.period),
    );
    if (changedPeriods.length > 0) {
      const lockedPeriods = await findLockedPeriodsInTransaction(tx, companyId, changedPeriods);
      if (lockedPeriods.length > 0) {
        throw Object.assign(
          new Error(`Could not save pasted values because ${lockedPeriods.join(", ")} is locked.`),
          { status: 409 },
        );
      }
    }

    const changedMetricIds = Array.from(new Set(changedCells.map((cell) => cell.metricId)));
    const currentRows = await loadMetricValues(
      companyId,
      changedMetricIds,
      changedPeriods,
      siteId,
      tx,
      true,
    );
    const changedKeys = new Set(changedCells.map((cell) => cellKey(cell.metricId, cell.period)));
    const protectedRows = currentRows
      .filter((row) => changedKeys.has(cellKey(row.metricId, row.period)))
      .map((row) => ({ row, reason: getValueProtectionReason(row) }))
      .filter((entry): entry is { row: ExistingMetricValue; reason: ValueProtectionReason } => entry.reason !== null);
    if (protectedRows.length > 0) {
      const first = protectedRows[0];
      throw createProtectedValueError("A pasted metric value", first.reason, {
        protectedCells: protectedRows.map(({ row, reason }) => ({
          metricId: row.metricId,
          period: row.period,
          siteId,
          reason,
        })),
      });
    }

    for (const cell of changedCells) {
      const nextDisplayValue = cell.normalizedDisplayValue ?? (cell.normalizedValue === null ? null : String(cell.normalizedValue));
      const previousDisplayValue = cell.existingDisplayValue ?? (cell.existingValue === null ? null : String(cell.existingValue));
      const rowResult = siteId === null
        ? await tx.execute(sql`
          INSERT INTO metric_values (
            metric_id,
            period,
            value,
            value_numeric,
            value_text,
            value_boolean,
            submitted_by,
            submitted_at,
            notes,
            locked,
            data_source_type,
            site_id
          )
          VALUES (
            ${cell.metricId},
            ${cell.period},
            ${cell.normalizedValue === null ? null : String(cell.normalizedValue)},
            ${cell.normalizedValue === null ? null : String(cell.normalizedValue)},
            ${cell.normalizedText},
            ${cell.normalizedBoolean},
            ${userId},
            NOW(),
            ${null},
            false,
            ${"manual"},
            ${null}
          )
          ON CONFLICT (metric_id, period) WHERE site_id IS NULL
          DO UPDATE SET
            value = EXCLUDED.value,
            value_numeric = EXCLUDED.value_numeric,
            value_text = EXCLUDED.value_text,
            value_boolean = EXCLUDED.value_boolean,
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = NOW(),
            notes = EXCLUDED.notes,
            data_source_type = EXCLUDED.data_source_type
          WHERE metric_values.locked = false
            AND COALESCE(metric_values.workflow_status::text, 'draft') = 'draft'
            AND COALESCE(metric_values.data_source_type::text, 'manual') <> 'evidenced'
            AND metric_values.reviewed_by IS NULL
            AND metric_values.reviewed_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM evidence_files ef
              WHERE ef.company_id = ${companyId}
                AND ef.site_id IS NOT DISTINCT FROM metric_values.site_id
                AND (
                  (ef.linked_module = 'metric_value' AND ef.linked_entity_id = metric_values.id)
                  OR (
                    ef.linked_period = metric_values.period
                    AND (
                      ef.metric_id = metric_values.metric_id
                      OR (ef.linked_module = 'metric' AND ef.linked_entity_id = metric_values.metric_id)
                    )
                  )
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM metric_evidence me
              WHERE me.metric_value_id = metric_values.id
            )
          RETURNING id
        `)
        : await tx.execute(sql`
          INSERT INTO metric_values (
            metric_id,
            period,
            value,
            value_numeric,
            value_text,
            value_boolean,
            submitted_by,
            submitted_at,
            notes,
            locked,
            data_source_type,
            site_id
          )
          VALUES (
            ${cell.metricId},
            ${cell.period},
            ${cell.normalizedValue === null ? null : String(cell.normalizedValue)},
            ${cell.normalizedValue === null ? null : String(cell.normalizedValue)},
            ${cell.normalizedText},
            ${cell.normalizedBoolean},
            ${userId},
            NOW(),
            ${null},
            false,
            ${"manual"},
            ${siteId}
          )
          ON CONFLICT (metric_id, period, site_id) WHERE site_id IS NOT NULL
          DO UPDATE SET
            value = EXCLUDED.value,
            value_numeric = EXCLUDED.value_numeric,
            value_text = EXCLUDED.value_text,
            value_boolean = EXCLUDED.value_boolean,
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = NOW(),
            notes = EXCLUDED.notes,
            data_source_type = EXCLUDED.data_source_type
          WHERE metric_values.locked = false
            AND COALESCE(metric_values.workflow_status::text, 'draft') = 'draft'
            AND COALESCE(metric_values.data_source_type::text, 'manual') <> 'evidenced'
            AND metric_values.reviewed_by IS NULL
            AND metric_values.reviewed_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM evidence_files ef
              WHERE ef.company_id = ${companyId}
                AND ef.site_id IS NOT DISTINCT FROM metric_values.site_id
                AND (
                  (ef.linked_module = 'metric_value' AND ef.linked_entity_id = metric_values.id)
                  OR (
                    ef.linked_period = metric_values.period
                    AND (
                      ef.metric_id = metric_values.metric_id
                      OR (ef.linked_module = 'metric' AND ef.linked_entity_id = metric_values.metric_id)
                    )
                  )
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM metric_evidence me
              WHERE me.metric_value_id = metric_values.id
            )
          RETURNING id
        `);

      const id = (rowResult as any).rows?.[0]?.id as string | undefined;
      if (!id) {
        throw createProtectedValueError(`${cell.metricName || "Metric"} for ${cell.period}`, "reviewed", {
          metricId: cell.metricId,
          period: cell.period,
          siteId,
        });
      }

      committedRows.push({
        id,
        metricId: cell.metricId,
        metricName: cell.metricName,
        period: cell.period,
        previousValue: previousDisplayValue,
        nextValue: nextDisplayValue,
        action: cell.status === "create" ? "metric_value_created" : "metric_value_updated",
      });
    }

    // Keep one transactional summary audit entry for the batch so no hard-error path
    // can leave value writes and audit history out of sync.
    await tx.insert(auditLogs).values({
      companyId,
      userId,
      action: "metric_value_bulk_paste",
      entityType: "metric_value_bulk",
      entityId: randomUUID(),
      actorType: "user",
      actorAgentId: null,
      ipAddress: req?.headers ? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? req.ip ?? null : null,
      userAgent: req?.headers ? (req.headers["user-agent"] as string | undefined) ?? null : null,
      details: {
        source: "paste_from_excel",
        siteId,
        changedCells: changedCells.length,
        createCount: validation.summary.createCount,
        updateCount: validation.summary.updateCount,
        clearCount: validation.summary.clearCount,
        periods: Array.from(new Set(changedCells.map((cell) => cell.period))),
        sampleCells: committedRows.slice(0, Math.min(committedRows.length, MAX_CELL_LEVEL_AUDITS)).map((row) => ({
          metricId: row.metricId,
          metricName: row.metricName,
          period: row.period,
          before: row.previousValue,
          after: row.nextValue,
          action: row.action,
        })),
        sampleCellCount: Math.min(committedRows.length, MAX_CELL_LEVEL_AUDITS),
        sampleTruncated: committedRows.length > MAX_CELL_LEVEL_AUDITS,
      },
    } as any);
  });

  if (!hadAnyData && changedCells.length > 0) {
    storage.getTelemetryEvents({ eventName: "first_metric_added", companyId, limit: 1 }).then((existing) => {
      if (existing.length === 0) {
        trackTelemetryEvent("first_metric_added", { userId, companyId });
        trackTelemetryEvent("first_metric_entered", { userId, companyId });
      }
    }).catch(() => {});
  }

  return {
    ...validation,
    committed: true,
  } satisfies BulkMetricValidationResponse;
}
