import { metricValues, type MetricValue } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getTrafficLightStatus, runCalculationsForPeriod, type RawInputs } from "./calculations";
import { buildEmissionFactorMap, getConfiguredEmissionFactors } from "./emission-factor-resolution";
import {
  acquirePeriodMutationLocks,
  dataEntryPeriodMonths,
  isPeriodLockedInTransaction,
  withPeriodCalculationRunLocks,
} from "./period-locks";
import { syncGuidedRawInputsToMetrics } from "./raw-data-metric-sync";
import { calculationLockPool, db, pool, storage, type MetricValueScope } from "./storage";
import {
  assessMetricValueProtection,
  type ValueProtectionReason,
} from "./value-mutation-protection";

export type GuidedRecalculationResult = {
  period: string;
  updated: any[];
  guidedMetricSync: Awaited<ReturnType<typeof syncGuidedRawInputsToMetrics>>;
  calculatedSkippedLocked: Array<{ metricId: string; metricName: string; siteId: string | null }>;
  calculatedSkippedProtected: Array<{
    metricId: string;
    metricName: string;
    siteId: string | null;
    reason: Exclude<ValueProtectionReason, "locked">;
  }>;
};

export type GuidedRecalculationOptions = {
  companyId: string;
  userId: string;
  period: string;
  siteId: string | null;
  siteScopeProvided: boolean;
};

async function recalculateGuidedPeriodLocked(
  options: GuidedRecalculationOptions,
): Promise<GuidedRecalculationResult> {
  const { companyId, userId, period, siteId, siteScopeProvided } = options;
  const metricValueScope: MetricValueScope = siteScopeProvided
    ? siteId === null
      ? { scope: "organisation" }
      : { scope: "site", siteId }
    : { scope: "organisation" };

  // The route only permits an omitted site scope when the company has no
  // active sites. Treat that legacy convenience as organisation-wide, rather
  // than aggregating historical rows that belong to archived sites.
  const rawData = await storage.getRawDataByPeriod(companyId, period, siteId);
  const rawInputs: RawInputs = {};
  for (const entry of rawData) {
    rawInputs[entry.inputName] = entry.value !== null && entry.value !== undefined
      ? Number(entry.value)
      : undefined;
  }

  const periodIsLocked = await storage.isPeriodLocked(companyId, period);
  const guidedMetricSync = await syncGuidedRawInputsToMetrics({
    companyId,
    userId,
    rawData,
    periodLocked: periodIsLocked,
    calculationRunLockHeld: true,
  });

  const allMetrics = await storage.getMetrics(companyId);
  const existingValues: Record<string, number | null> = {};
  const protectedExistingMetricValues: Record<string, number | null> = {};
  const protectionByValueId = new Map<string, ValueProtectionReason | null>();
  const emissionComponentNames = new Set([
    "Scope 1 Emissions",
    "Scope 2 Emissions",
    "Business Travel Emissions",
  ]);
  for (const metric of allMetrics) {
    const scopedValues = await storage.getMetricValuesForMetric(companyId, metric.id, metricValueScope);
    const current = scopedValues.find((value) => value.period === period);
    if (current) {
      existingValues[metric.name] = current.value !== null ? Number(current.value) : null;
      const protection = await assessMetricValueProtection(db, {
        companyId,
        metricValueId: current.id,
      });
      const protectionReason = protection?.reason ?? null;
      protectionByValueId.set(current.id, protectionReason);
      const numericValue = current.value !== null ? Number(current.value) : null;
      if (
        emissionComponentNames.has(metric.name)
        && protectionReason !== null
        && numericValue !== null
        && Number.isFinite(numericValue)
      ) {
        protectedExistingMetricValues[metric.name] = numericValue;
      }
    }
  }

  const factors = buildEmissionFactorMap(await getConfiguredEmissionFactors(companyId, "UK"));
  const calculated = runCalculationsForPeriod(rawInputs, factors, existingValues, protectedExistingMetricValues);
  const updated: any[] = [];
  const calculatedSkippedLocked: GuidedRecalculationResult["calculatedSkippedLocked"] = [];
  const calculatedSkippedProtected: GuidedRecalculationResult["calculatedSkippedProtected"] = [];

  for (const [metricName, calculatedValue] of Object.entries(calculated)) {
    const metric = allMetrics.find((candidate) =>
      candidate.name === metricName
      && (candidate.metricType === "calculated" || candidate.metricType === "derived"));
    if (!metric) continue;

    const scopedValues = await storage.getMetricValuesForMetric(companyId, metric.id, metricValueScope);
    const current = scopedValues.find((value) => value.period === period);
    const preflightProtectionReason = current
      ? protectionByValueId.get(current.id)
        ?? (await assessMetricValueProtection(db, { companyId, metricValueId: current.id }))?.reason
        ?? null
      : null;
    if (periodIsLocked || preflightProtectionReason === "locked") {
      calculatedSkippedLocked.push({ metricId: metric.id, metricName, siteId });
      continue;
    }
    if (preflightProtectionReason) {
      calculatedSkippedProtected.push({
        metricId: metric.id,
        metricName,
        siteId,
        reason: preflightProtectionReason,
      });
      continue;
    }

    const updateCurrentIfUnprotected = async (
      valueRow: MetricValue,
      changes: Partial<MetricValue>,
    ): Promise<ValueProtectionReason | null> => db.transaction(async (tx) => {
      await acquirePeriodMutationLocks(tx, companyId, [period], { calculationRunLockHeld: true });
      if (await isPeriodLockedInTransaction(tx, companyId, period)) return "locked";
      const atWriteProtection = await assessMetricValueProtection(tx, {
        companyId,
        metricValueId: valueRow.id,
        lockForUpdate: true,
      });
      if (!atWriteProtection) return null;
      if (atWriteProtection.reason) return atWriteProtection.reason;
      await tx.update(metricValues).set(changes).where(eq(metricValues.id, valueRow.id));
      return null;
    });

    const createCurrentIfUnprotected = async (
      createData: typeof metricValues.$inferInsert,
    ): Promise<{ reason: ValueProtectionReason | null; created: boolean }> => db.transaction(async (tx) => {
      await acquirePeriodMutationLocks(tx, companyId, [period], { calculationRunLockHeld: true });
      if (await isPeriodLockedInTransaction(tx, companyId, period)) {
        return { reason: "locked", created: false };
      }

      // Another recalculation may have created this natural-key row after the
      // preflight read. Re-read while holding the period lock and update that
      // row only if it is still unprotected.
      const [currentAtWrite] = await tx.select().from(metricValues).where(and(
        eq(metricValues.metricId, metric.id),
        eq(metricValues.period, period),
        siteId === null ? isNull(metricValues.siteId) : eq(metricValues.siteId, siteId),
      )).limit(1).for("update");
      if (currentAtWrite) {
        const atWriteProtection = await assessMetricValueProtection(tx, {
          companyId,
          metricValueId: currentAtWrite.id,
          lockForUpdate: true,
        });
        if (atWriteProtection?.reason) {
          return { reason: atWriteProtection.reason, created: false };
        }
        await tx.update(metricValues).set(createData).where(eq(metricValues.id, currentAtWrite.id));
        return { reason: null, created: false };
      }

      await tx.insert(metricValues).values(createData);
      return { reason: null, created: true };
    });

    const reportWriteTimeProtection = (reason: ValueProtectionReason): void => {
      if (reason === "locked") {
        calculatedSkippedLocked.push({ metricId: metric.id, metricName, siteId });
      } else {
        calculatedSkippedProtected.push({ metricId: metric.id, metricName, siteId, reason });
      }
    };

    if (calculatedValue === null || calculatedValue === undefined) {
      if (current) {
        const atWriteProtection = await updateCurrentIfUnprotected(current, {
          value: null,
          valueNumeric: null,
          valueText: null,
          valueBoolean: null,
          status: null,
          percentChange: null,
          sourceType: "calculated",
          notes: "Auto-calculation unavailable for the current inputs",
        });
        if (atWriteProtection) {
          reportWriteTimeProtection(atWriteProtection);
          continue;
        }
        updated.push({ metric: metricName, value: null, cleared: true });
      }
      continue;
    }

    const previousValues = scopedValues
      .filter((value) => value.period < period)
      .sort((left, right) => left.period.localeCompare(right.period));
    const previous = previousValues.at(-1);
    const previousValue = previous?.value !== null && previous?.value !== undefined ? Number(previous.value) : null;
    const percentChange = previousValue !== null && previousValue !== 0
      ? Math.round(((calculatedValue - previousValue) / Math.abs(previousValue)) * 10000) / 100
      : null;
    const status = getTrafficLightStatus(
      calculatedValue,
      metric.targetValue ? Number(metric.targetValue) : null,
      metric.direction || "higher_is_better",
      Number(metric.amberThreshold || 5),
      Number(metric.redThreshold || 15),
      metric.targetMin ? Number(metric.targetMin) : null,
      metric.targetMax ? Number(metric.targetMax) : null,
      previousValue,
    );

    if (current) {
      const atWriteProtection = await updateCurrentIfUnprotected(current, {
        value: String(calculatedValue),
        valueNumeric: String(calculatedValue),
        previousValue: previousValue === null ? null : String(previousValue),
        status,
        percentChange: percentChange === null ? null : String(percentChange),
        siteId,
        sourceType: "calculated",
      });
      if (atWriteProtection) {
        reportWriteTimeProtection(atWriteProtection);
        continue;
      }
      updated.push({ metric: metricName, value: calculatedValue, status, updated: true });
    } else {
      const atWriteResult = await createCurrentIfUnprotected({
        metricId: metric.id,
        period,
        value: String(calculatedValue),
        valueNumeric: String(calculatedValue),
        previousValue: previousValue === null ? null : String(previousValue),
        targetValue: metric.targetValue?.toString() || null,
        status,
        percentChange: percentChange === null ? null : String(percentChange),
        submittedBy: userId,
        notes: "Auto-calculated",
        sourceType: "calculated",
        locked: false,
        siteId,
      });
      if (atWriteResult.reason) {
        reportWriteTimeProtection(atWriteResult.reason);
        continue;
      }
      updated.push({
        metric: metricName,
        value: calculatedValue,
        status,
        ...(atWriteResult.created ? { created: true } : { updated: true }),
      });
    }
  }

  return {
    period,
    updated,
    guidedMetricSync,
    calculatedSkippedLocked,
    calculatedSkippedProtected,
  };
}

export async function recalculateGuidedPeriod(
  options: GuidedRecalculationOptions,
): Promise<GuidedRecalculationResult> {
  const periods = dataEntryPeriodMonths(options.period);
  if (!periods) throw Object.assign(new Error("period must use YYYY-MM format"), { status: 400 });
  return withPeriodCalculationRunLocks(calculationLockPool, options.companyId, periods, () =>
    recalculateGuidedPeriodLocked(options));
}
