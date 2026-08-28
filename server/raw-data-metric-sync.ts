import { metricValues, type Metric, type RawDataInput } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db, storage } from "./storage";
import {
  assessMetricValueProtection,
  type ValueProtectionReason,
} from "./value-mutation-protection";

const RAW_INPUT_METRIC_ALIASES: Record<string, readonly string[]> = {
  electricity_kwh: ["Electricity Consumption"],
  gas_kwh: ["Gas / Fuel Consumption", "Natural Gas Consumption"],
  vehicle_fuel_litres: ["Company Vehicle Fuel Use", "Vehicle Fuel Consumption"],
  diesel_litres: ["Diesel Fuel Use", "Diesel Consumption"],
  petrol_litres: ["Petrol Fuel Use", "Petrol Consumption"],
  total_waste_tonnes: ["Waste Generated", "Total Waste Generated"],
  recycled_waste_tonnes: ["Waste Recycled", "Recycled Waste"],
  water_m3: ["Water Consumption", "Total Water Consumption"],
  employee_headcount: ["Total Employees", "Employee Headcount", "Total Headcount"],
  employee_leavers: ["Employee Leavers"],
  absence_days: ["Total Absence Days"],
  total_training_hours: ["Total Training Hours"],
};

type DirectMetricCandidate = Pick<Metric, "id" | "name" | "metricType" | "enabled" | "isDefault">;

export type GuidedMetricSyncResult = {
  synced: Array<{ inputName: string; metricId: string; metricName: string; value: string; siteId: string | null }>;
  skippedLocked: Array<{ inputName: string; metricId: string; metricName: string; siteId: string | null }>;
  skippedProtected: Array<{
    inputName: string;
    metricId: string;
    metricName: string;
    siteId: string | null;
    reason: Exclude<ValueProtectionReason, "locked">;
  }>;
};

export type GuidedMetricClearResult = {
  cleared: Array<{ inputName: string; metricId: string; metricName: string; siteId: string | null }>;
  skippedLocked: GuidedMetricSyncResult["skippedLocked"];
  skippedProtected: GuidedMetricSyncResult["skippedProtected"];
};

function normalizeMetricName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function selectGuidedInputMetric(
  metrics: DirectMetricCandidate[],
  inputName: string,
): DirectMetricCandidate | null {
  const aliases = RAW_INPUT_METRIC_ALIASES[inputName];
  if (!aliases) return null;

  const aliasRank = new Map(aliases.map((name, index) => [normalizeMetricName(name), index]));
  const candidates = metrics
    .filter((metric) => metric.enabled !== false)
    .filter((metric) => !metric.metricType || metric.metricType === "manual")
    .filter((metric) => aliasRank.has(normalizeMetricName(metric.name)))
    .sort((left, right) => {
      const defaultDelta = Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault));
      if (defaultDelta !== 0) return defaultDelta;
      const aliasDelta = (aliasRank.get(normalizeMetricName(left.name)) ?? Number.MAX_SAFE_INTEGER)
        - (aliasRank.get(normalizeMetricName(right.name)) ?? Number.MAX_SAFE_INTEGER);
      if (aliasDelta !== 0) return aliasDelta;
      return left.id.localeCompare(right.id);
    });

  return candidates[0] ?? null;
}

export async function syncGuidedRawInputsToMetrics(options: {
  companyId: string;
  userId: string;
  rawData: RawDataInput[];
  periodLocked?: boolean;
  calculationRunLockHeld?: boolean;
}): Promise<GuidedMetricSyncResult> {
  const metrics = await storage.getMetrics(options.companyId);
  const result: GuidedMetricSyncResult = { synced: [], skippedLocked: [], skippedProtected: [] };

  for (const rawInput of options.rawData) {
    if (rawInput.value === null || rawInput.value === undefined) continue;
    const metric = selectGuidedInputMetric(metrics, rawInput.inputName);
    if (!metric) continue;

    const siteId = rawInput.siteId ?? null;
    const existing = await storage.getMetricValueForPeriodSite(metric.id, rawInput.period, siteId);
    const protection = existing
      ? await assessMetricValueProtection(db, {
          companyId: options.companyId,
          metricValueId: existing.id,
        })
      : null;
    if (options.periodLocked || protection?.reason === "locked") {
      result.skippedLocked.push({
        inputName: rawInput.inputName,
        metricId: metric.id,
        metricName: metric.name,
        siteId,
      });
      continue;
    }
    if (protection?.reason) {
      result.skippedProtected.push({
        inputName: rawInput.inputName,
        metricId: metric.id,
        metricName: metric.name,
        siteId,
        reason: protection.reason,
      });
      continue;
    }

    const value = String(rawInput.value);
    try {
      const saved = await storage.upsertMetricValue({
        metricId: metric.id,
        period: rawInput.period,
        value,
        valueNumeric: value,
        submittedBy: rawInput.enteredBy ?? options.userId,
        notes: existing?.notes || `Captured from guided input: ${rawInput.inputName}`,
        locked: false,
        dataSourceType: rawInput.dataSourceType ?? "manual",
        siteId,
      }, { calculationRunLockHeld: options.calculationRunLockHeld });
      // The storage upsert returns the existing row when a concurrent lock
      // wins after the preflight check. Report that as a skip, not a sync.
      if (saved.locked) {
        result.skippedLocked.push({
          inputName: rawInput.inputName,
          metricId: metric.id,
          metricName: metric.name,
          siteId,
        });
        continue;
      }
    } catch (error: any) {
      if (error?.status === 400 && /period is locked/i.test(String(error?.message || ""))) {
        result.skippedLocked.push({
          inputName: rawInput.inputName,
          metricId: metric.id,
          metricName: metric.name,
          siteId,
        });
        continue;
      }
      if (error?.code !== "VALUE_PROTECTED") throw error;
      const reason = error?.details?.reason as ValueProtectionReason | undefined;
      if (reason === "locked") {
        result.skippedLocked.push({
          inputName: rawInput.inputName,
          metricId: metric.id,
          metricName: metric.name,
          siteId,
        });
      } else {
        result.skippedProtected.push({
          inputName: rawInput.inputName,
          metricId: metric.id,
          metricName: metric.name,
          siteId,
          reason: reason ?? "workflow",
        });
      }
      continue;
    }

    result.synced.push({
      inputName: rawInput.inputName,
      metricId: metric.id,
      metricName: metric.name,
      value,
      siteId,
    });
  }

  return result;
}

export async function clearGuidedRawInputsFromMetrics(options: {
  companyId: string;
  inputNames: string[];
  period: string;
  siteId: string | null;
  periodLocked?: boolean;
  mutationClient?: any;
}): Promise<GuidedMetricClearResult> {
  const metrics = await storage.getMetrics(options.companyId);
  const result: GuidedMetricClearResult = { cleared: [], skippedLocked: [], skippedProtected: [] };
  const clearable: Array<{ inputName: string; metric: DirectMetricCandidate; existingId: string }> = [];

  for (const inputName of Array.from(new Set(options.inputNames))) {
    const metric = selectGuidedInputMetric(metrics, inputName);
    if (!metric) continue;
    const existing = await storage.getMetricValueForPeriodSite(metric.id, options.period, options.siteId);
    if (!existing) continue;
    const protection = await assessMetricValueProtection(options.mutationClient ?? db, {
      companyId: options.companyId,
      metricValueId: existing.id,
      lockForUpdate: Boolean(options.mutationClient),
    });
    if (!protection) continue;
    if (options.periodLocked || protection.reason === "locked") {
      result.skippedLocked.push({ inputName, metricId: metric.id, metricName: metric.name, siteId: options.siteId });
      continue;
    }
    if (protection.reason) {
      result.skippedProtected.push({
        inputName,
        metricId: metric.id,
        metricName: metric.name,
        siteId: options.siteId,
        reason: protection.reason,
      });
      continue;
    }
    clearable.push({ inputName, metric, existingId: protection.value.id });
  }

  // A guided save is one user action. Avoid partially clearing its mapped
  // values if any of them is protected.
  if (result.skippedLocked.length > 0 || result.skippedProtected.length > 0) return result;

  for (const item of clearable) {
    const clearedValues = {
      value: null,
      valueNumeric: null,
      valueText: null,
      valueBoolean: null,
      status: null,
      percentChange: null,
      notes: `Cleared from guided input: ${item.inputName}`,
      dataSourceType: "manual",
    } as const;
    if (options.mutationClient) {
      await options.mutationClient
        .update(metricValues)
        .set(clearedValues)
        .where(eq(metricValues.id, item.existingId));
    } else {
      await storage.updateMetricValue(item.existingId, clearedValues);
    }
    result.cleared.push({
      inputName: item.inputName,
      metricId: item.metric.id,
      metricName: item.metric.name,
      siteId: options.siteId,
    });
  }

  return result;
}
