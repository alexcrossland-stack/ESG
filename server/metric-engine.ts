import { db } from "./storage";
import { metricDefinitions, metricValues, metricCalculationRuns } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface FormulaJson {
  type: "ratio" | "sum" | "difference" | "product" | "custom";
  numerator?: string;
  denominator?: string;
  inputs?: string[];
  multiplier?: number;
  customFn?: string;
}

export async function getAllMetricDefinitions() {
  return db.select().from(metricDefinitions).orderBy(metricDefinitions.sortOrder);
}

export async function getActiveMetricDefinitions() {
  return db.select().from(metricDefinitions)
    .where(eq(metricDefinitions.isActive, true))
    .orderBy(metricDefinitions.sortOrder);
}

export async function getMetricValueForPeriod(
  businessId: string,
  metricCode: string,
  periodStart: Date,
  periodEnd: Date,
  siteId?: string | null
) {
  const [defRow] = await db.select({ id: metricDefinitions.id })
    .from(metricDefinitions)
    .where(eq(metricDefinitions.code, metricCode))
    .limit(1);

  if (!defRow) return null;

  const conditions = [
    eq(metricValues.metricDefinitionId, defRow.id),
    sql`${metricValues.reportingPeriodStart} = ${periodStart.toISOString()}`,
    sql`${metricValues.reportingPeriodEnd} = ${periodEnd.toISOString()}`,
  ];

  if (siteId) {
    conditions.push(eq(metricValues.siteId, siteId));
  } else {
    conditions.push(isNull(metricValues.siteId));
  }

  const [row] = await db.select().from(metricValues)
    .where(and(...conditions))
    .limit(1);

  return row || null;
}

export async function getNumericValueForPeriod(
  businessId: string,
  metricCode: string,
  periodStart: Date,
  periodEnd: Date,
  siteId?: string | null
): Promise<number | null> {
  const row = await getMetricValueForPeriod(businessId, metricCode, periodStart, periodEnd, siteId);
  if (!row) return null;
  const v = row.valueNumeric ?? row.value;
  return v !== null && v !== undefined ? Number(v) : null;
}

export async function runDerivedCalculation(
  businessId: string,
  defId: string,
  formula: FormulaJson,
  periodStart: Date,
  periodEnd: Date,
  siteId?: string | null,
  triggeredByValueId?: string
): Promise<{ success: boolean; value: number | null; error?: string }> {
  const runRecord = await db.insert(metricCalculationRuns).values({
    businessId,
    metricDefinitionId: defId,
    siteId: siteId || null,
    reportingPeriodStart: periodStart,
    reportingPeriodEnd: periodEnd,
    status: "pending",
    triggeredByMetricValueId: triggeredByValueId || null,
  }).returning();
  const runId = runRecord[0]?.id;

  try {
    let result: number | null = null;
    const inputs: Record<string, number | null> = {};

    if (formula.type === "ratio" && formula.numerator && formula.denominator) {
      const num = await getNumericValueForPeriod(businessId, formula.numerator, periodStart, periodEnd, siteId);
      const den = await getNumericValueForPeriod(businessId, formula.denominator, periodStart, periodEnd, siteId);
      inputs[formula.numerator] = num;
      inputs[formula.denominator] = den;
      if (num !== null && den !== null && den !== 0) {
        result = (num / den) * (formula.multiplier ?? 1);
        result = Math.round(result * 10000) / 10000;
      }
    } else if (formula.type === "sum" && formula.inputs?.length) {
      let total = 0;
      let hasAny = false;
      for (const code of formula.inputs) {
        const v = await getNumericValueForPeriod(businessId, code, periodStart, periodEnd, siteId);
        inputs[code] = v;
        if (v !== null) { total += v; hasAny = true; }
      }
      if (hasAny) result = Math.round(total * 10000) / 10000;
    } else if (formula.type === "difference" && formula.inputs?.length === 2) {
      const [a, b] = formula.inputs;
      const va = await getNumericValueForPeriod(businessId, a, periodStart, periodEnd, siteId);
      const vb = await getNumericValueForPeriod(businessId, b, periodStart, periodEnd, siteId);
      inputs[a] = va; inputs[b] = vb;
      if (va !== null && vb !== null) result = Math.round((va - vb) * 10000) / 10000;
    } else if (formula.type === "product" && formula.inputs?.length) {
      let product = 1;
      let hasAny = false;
      for (const code of formula.inputs) {
        const v = await getNumericValueForPeriod(businessId, code, periodStart, periodEnd, siteId);
        inputs[code] = v;
        if (v !== null) { product *= v; hasAny = true; }
      }
      if (hasAny) result = Math.round(product * 10000) / 10000;
    }

    // Update calculation run record
    if (runId) {
      await db.update(metricCalculationRuns)
        .set({ status: "success", inputsJson: inputs, outputJson: { value: result } })
        .where(eq(metricCalculationRuns.id, runId));
    }

    return { success: true, value: result };
  } catch (err: any) {
    if (runId) {
      await db.update(metricCalculationRuns)
        .set({ status: "error", errorText: err.message })
        .where(eq(metricCalculationRuns.id, runId));
    }
    return { success: false, value: null, error: err.message };
  }
}

export async function triggerDerivedCalculationsForMetric(
  businessId: string,
  sourceMetricCode: string,
  periodStart: Date,
  periodEnd: Date,
  siteId?: string | null,
  triggeredByValueId?: string
) {
  const allDefs = await getAllMetricDefinitions();
  const derivedDefs = allDefs.filter(d => {
    if (!d.isDerived || !d.formulaJson) return false;
    const formula = d.formulaJson as FormulaJson;
    const codes: string[] = [];
    if (formula.numerator) codes.push(formula.numerator);
    if (formula.denominator) codes.push(formula.denominator);
    if (formula.inputs) codes.push(...formula.inputs);
    return codes.includes(sourceMetricCode);
  });

  // Guard against circular dependencies using a visited set
  const visited = new Set<string>();
  for (const def of derivedDefs) {
    if (visited.has(def.code)) continue;
    visited.add(def.code);
    const formula = def.formulaJson as FormulaJson;
    const calcResult = await runDerivedCalculation(
      businessId, def.id, formula, periodStart, periodEnd, siteId, triggeredByValueId
    );
    if (calcResult.success && calcResult.value !== null) {
      // Upsert the derived value into metric_values
      const existing = await getMetricValueForPeriod(businessId, def.code, periodStart, periodEnd, siteId);
      if (existing) {
        await db.update(metricValues)
          .set({ valueNumeric: String(calcResult.value), sourceType: "calculated", value: String(calcResult.value) })
          .where(eq(metricValues.id, existing.id));
      } else {
        await db.insert(metricValues).values({
          metricId: def.id,
          metricDefinitionId: def.id,
          period: `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`,
          value: String(calcResult.value),
          valueNumeric: String(calcResult.value),
          sourceType: "calculated",
          reportingPeriodStart: periodStart,
          reportingPeriodEnd: periodEnd,
          siteId: siteId || null,
          dataSourceType: "manual",
        });
      }
      // Recursively trigger anything depending on this derived metric
      await triggerDerivedCalculationsForMetric(businessId, def.code, periodStart, periodEnd, siteId, triggeredByValueId);
    }
  }
}

export async function computeSiteRollup(
  businessId: string,
  metricCode: string,
  periodStart: Date,
  periodEnd: Date,
  rollupMethod: string
): Promise<number | null> {
  const [defRow] = await db.select({ id: metricDefinitions.id })
    .from(metricDefinitions)
    .where(eq(metricDefinitions.code, metricCode))
    .limit(1);
  if (!defRow) return null;

  const siteValues = await db.select({ valueNumeric: metricValues.valueNumeric, value: metricValues.value })
    .from(metricValues)
    .where(and(
      eq(metricValues.metricDefinitionId, defRow.id),
      sql`${metricValues.reportingPeriodStart} = ${periodStart.toISOString()}`,
      sql`${metricValues.reportingPeriodEnd} = ${periodEnd.toISOString()}`,
      sql`${metricValues.siteId} IS NOT NULL`,
    ));

  const nums = siteValues
    .map(r => r.valueNumeric ?? r.value)
    .filter(v => v !== null && v !== undefined)
    .map(Number);

  if (nums.length === 0) return null;

  if (rollupMethod === "sum") return nums.reduce((a, b) => a + b, 0);
  if (rollupMethod === "weighted_average") return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (rollupMethod === "latest") return nums[nums.length - 1];
  return null;
}
