import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { auditLogs, metrics, metricValues, reportingPeriods, type Metric } from "@shared/schema";
import { db, storage } from "./storage";
import { trackTelemetryEvent } from "./telemetry";

const MONTH_PERIOD_RE = /^\d{4}-\d{2}$/;
const MAX_BULK_CELLS = 5000;
const MAX_CELL_LEVEL_AUDITS = 100;

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
  locked: boolean | null;
};

type BulkGridMetric = Pick<Metric, "id" | "name" | "category" | "unit" | "metricType" | "enabled"> & {
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
  existingValue: number | null;
  status: "create" | "update" | "clear" | "unchanged" | "error";
  errors: string[];
  warnings: string[];
  readOnly: boolean;
  locked: boolean;
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

function monthStart(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function monthEnd(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function previousMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cellKey(metricId: string, period: string) {
  return `${metricId}::${period}`;
}

function parseStoredValue(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesMatch(a: number | null, b: number | null) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.000001;
}

function normalizePastedValue(rawValue: string | null, metric: Metric | undefined) {
  if (rawValue === null || rawValue === undefined) {
    return { normalizedValue: null as number | null, error: null as string | null };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { normalizedValue: null as number | null, error: null as string | null };
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
    return { normalizedValue: null as number | null, error: "Invalid numeric format" };
  }

  return { normalizedValue: parsed, error: null as string | null };
}

function isMaterialOutlier(previousValue: number | null, nextValue: number | null) {
  if (previousValue === null || nextValue === null) return false;
  const baseline = Math.abs(previousValue) < 0.000001 ? 1 : Math.abs(previousValue);
  const delta = Math.abs(nextValue - previousValue);
  return delta >= 1 && delta / baseline >= 0.5;
}

async function loadCompanyMetrics(companyId: string) {
  return db
    .select()
    .from(metrics)
    .where(eq(metrics.companyId, companyId));
}

async function loadMetricValues(companyId: string, metricIds: string[], periods: string[], siteId: string | null) {
  if (metricIds.length === 0 || periods.length === 0) return [] as ExistingMetricValue[];

  return db
    .select({
      id: metricValues.id,
      metricId: metricValues.metricId,
      period: metricValues.period,
      value: metricValues.value,
      locked: metricValues.locked,
    })
    .from(metricValues)
    .innerJoin(metrics, eq(metricValues.metricId, metrics.id))
    .where(and(
      eq(metrics.companyId, companyId),
      inArray(metricValues.metricId, metricIds),
      inArray(metricValues.period, periods),
      siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, siteId),
    ));
}

async function loadLockedPeriods(companyId: string, periods: string[]) {
  if (periods.length === 0) return new Set<string>();
  const rows = await db
    .select()
    .from(reportingPeriods)
    .where(and(eq(reportingPeriods.companyId, companyId), eq(reportingPeriods.status, "locked")));

  const lockedPeriods = new Set<string>();
  for (const period of periods) {
    const start = monthStart(period);
    const end = monthEnd(period);
    if (rows.some((row) => row.startDate <= end && row.endDate >= start)) {
      lockedPeriods.add(period);
    }
  }
  return lockedPeriods;
}

export async function getBulkMetricGrid(companyId: string, periods: string[], siteId: string | null): Promise<BulkMetricGridResponse> {
  const sanitizedPeriods = periods.filter((period) => MONTH_PERIOD_RE.test(period)).slice(0, 18);
  const companyMetrics = await loadCompanyMetrics(companyId);
  const eligibleMetrics = companyMetrics
    .filter((metric) => metric.enabled)
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
      readOnly: Boolean(metric.metricType && metric.metricType !== "manual"),
    }));

  const values = sanitizedPeriods.length > 0
    ? await db
      .select({
        id: metricValues.id,
        metricId: metricValues.metricId,
        period: metricValues.period,
        value: metricValues.value,
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
  const periods = Array.from(new Set(trimmedCells.map((cell) => cell.period).filter(Boolean)));
  const previousPeriods = periods.filter((period) => MONTH_PERIOD_RE.test(period)).map(previousMonth);
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
    const previous = existingByKey.get(cellKey(cell.metricId, previousMonth(cell.period)));
    const errors: string[] = [];
    const warnings: string[] = [];
    const readOnly = Boolean(metric && (!metric.enabled || (metric.metricType && metric.metricType !== "manual")));
    const locked = Boolean(existing?.locked) || lockedPeriods.has(cell.period);

    if (!metric) errors.push("Unknown metric");
    if (!MONTH_PERIOD_RE.test(cell.period)) errors.push("Invalid reporting period");
    if (readOnly) errors.push("This cell is read-only");
    if (locked) errors.push("This reporting period is locked");
    if (seenKeys.has(currentKey)) {
      errors.push("Duplicate metric / period combination in this paste");
    } else {
      seenKeys.add(currentKey);
    }

    const normalized = normalizePastedValue(cell.rawValue, metric);
    if (normalized.error) errors.push(normalized.error);

    const existingValue = parseStoredValue(existing?.value);
    let status: BulkMetricValidationResult["status"] = "unchanged";
    if (errors.length > 0) {
      status = "error";
    } else if (!valuesMatch(existingValue, normalized.normalizedValue)) {
      if (existing && normalized.normalizedValue === null) {
        status = "clear";
      } else if (existing) {
        status = "update";
      } else if (normalized.normalizedValue === null) {
        status = "unchanged";
      } else {
        status = "create";
      }
    }

    if (status !== "error" && isMaterialOutlier(parseStoredValue(previous?.value), normalized.normalizedValue)) {
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
      existingValue,
      status,
      errors,
      warnings,
      readOnly,
      locked,
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
    previousValue: number | null;
    nextValue: number | null;
    action: "metric_value_created" | "metric_value_updated";
  }> = [];

  await db.transaction(async (tx) => {
    for (const cell of changedCells) {
      const rowResult = siteId === null
        ? await tx.execute(sql`
          INSERT INTO metric_values (
            metric_id,
            period,
            value,
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
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = NOW(),
            notes = EXCLUDED.notes,
            data_source_type = EXCLUDED.data_source_type
          WHERE metric_values.locked = false
          RETURNING id
        `)
        : await tx.execute(sql`
          INSERT INTO metric_values (
            metric_id,
            period,
            value,
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
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = NOW(),
            notes = EXCLUDED.notes,
            data_source_type = EXCLUDED.data_source_type
          WHERE metric_values.locked = false
          RETURNING id
        `);

      const id = (rowResult as any).rows?.[0]?.id as string | undefined;
      if (!id) {
        throw Object.assign(new Error(`Could not save ${cell.metricName || "metric"} for ${cell.period} because the cell is locked.`), { status: 409 });
      }

      committedRows.push({
        id,
        metricId: cell.metricId,
        metricName: cell.metricName,
        period: cell.period,
        previousValue: cell.existingValue,
        nextValue: cell.normalizedValue,
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
