import { calculationLockPool, storage } from "./storage";
import type { MetricDefinition } from "@shared/schema";
import { buildEmissionFactorMap, getConfiguredEmissionFactors } from "./emission-factor-resolution";
import {
  evaluateMetricFormula,
  metricFormulaDependencies,
  metricFormulaDependencyError,
  normalizeMetricFormula,
  type MetricFormulaEvaluationContext,
  type NormalizedMetricFormula,
} from "./metric-formula-contract";
import {
  reportingMonthsForDateRange,
  withPeriodCalculationRunLocks,
} from "./period-locks";

function buildDependencyGraph(
  definitions: MetricDefinition[],
  formulasByCode: ReadonlyMap<string, NormalizedMetricFormula>,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const def of definitions) {
    const formula = formulasByCode.get(def.code);
    graph.set(def.code, formula ? metricFormulaDependencies(formula) : []);
  }
  return graph;
}

function topologicallySortDerivedDefinitions(
  definitions: MetricDefinition[],
  graph: Map<string, string[]>,
): { ordered: MetricDefinition[]; cyclic: MetricDefinition[] } {
  const byCode = new Map(definitions.map((definition) => [definition.code, definition]));
  const inDegree = new Map<string, number>();
  const dependants = new Map<string, string[]>();

  for (const definition of definitions) {
    const derivedDependencies = (graph.get(definition.code) || []).filter((code) => byCode.has(code));
    inDegree.set(definition.code, derivedDependencies.length);
    for (const dependency of derivedDependencies) {
      dependants.set(dependency, [...(dependants.get(dependency) || []), definition.code]);
    }
  }

  const sortDefinitions = (left: MetricDefinition, right: MetricDefinition) =>
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.code.localeCompare(right.code);
  const queue = definitions.filter((definition) => inDegree.get(definition.code) === 0).sort(sortDefinitions);
  const ordered: MetricDefinition[] = [];
  while (queue.length > 0) {
    const definition = queue.shift()!;
    ordered.push(definition);
    for (const dependantCode of dependants.get(definition.code) || []) {
      const nextDegree = (inDegree.get(dependantCode) || 0) - 1;
      inDegree.set(dependantCode, nextDegree);
      if (nextDegree === 0) {
        queue.push(byCode.get(dependantCode)!);
        queue.sort(sortDefinitions);
      }
    }
  }

  const orderedCodes = new Set(ordered.map((definition) => definition.code));
  return {
    ordered,
    cyclic: definitions.filter((definition) => !orderedCodes.has(definition.code)).sort(sortDefinitions),
  };
}

export interface DerivedMetricCalculationResult {
  failures: string[];
  updated: string[];
  cleared: string[];
  skippedMissing: string[];
  skippedProtected: Array<{ code: string; operation: "calculation" | "clear" | "rollup"; reason: string }>;
  rollups: Array<{ code: string; outcome: string; value: number | null }>;
}

type MetricCalculationStorage = Pick<typeof storage,
  | "getMetricDefinitions"
  | "getMetricDefinitionValuesExact"
  | "createMetricCalculationRun"
  | "updateMetricCalculationRun"
  | "upsertCalculatedMetricDefinitionValue"
  | "clearCalculatedMetricDefinitionValue"
  | "rollupSiteValuesToCompany"
>;

export interface MetricCalculationEngineDependencies {
  storage: MetricCalculationStorage;
  lockPool: { connect(): Promise<any> };
  loadFormulaContext(businessId: string): Promise<MetricFormulaEvaluationContext>;
}

const defaultDependencies: MetricCalculationEngineDependencies = {
  storage,
  lockPool: calculationLockPool,
  loadFormulaContext: async (businessId) => ({
    emissionFactors: buildEmissionFactorMap(await getConfiguredEmissionFactors(businessId, "UK")),
  }),
};

export async function runDerivedMetricCalculations(
  businessId: string,
  siteId: string | null,
  periodStart: Date,
  periodEnd: Date,
  triggeredByMetricValueId?: string,
  dependencies: MetricCalculationEngineDependencies = defaultDependencies,
): Promise<DerivedMetricCalculationResult> {
  const periods = reportingMonthsForDateRange({ startDate: periodStart, endDate: periodEnd });
  return withPeriodCalculationRunLocks(dependencies.lockPool, businessId, periods, () =>
    runDerivedMetricCalculationsLocked(
      businessId,
      siteId,
      periodStart,
      periodEnd,
      triggeredByMetricValueId,
      dependencies,
    ));
}

async function runDerivedMetricCalculationsLocked(
  businessId: string,
  siteId: string | null,
  periodStart: Date,
  periodEnd: Date,
  triggeredByMetricValueId: string | undefined,
  dependencies: MetricCalculationEngineDependencies,
): Promise<DerivedMetricCalculationResult> {
  const failures: string[] = [];
  const updated: string[] = [];
  const cleared: string[] = [];
  const skippedMissing: string[] = [];
  const skippedProtected: DerivedMetricCalculationResult["skippedProtected"] = [];
  const rollups: DerivedMetricCalculationResult["rollups"] = [];
  const calculationStorage = dependencies.storage;
  const allDefinitions = await calculationStorage.getMetricDefinitions();
  // An active derived definition with absent or malformed formula metadata is
  // a configuration failure, not a metric with missing input data.
  const derivedDefs = allDefinitions.filter(d => d.isDerived && d.isActive);
  const activeNumericMetricCodes = new Set(
    allDefinitions
      .filter((definition) => definition.isActive && definition.dataType === "numeric")
      .map((definition) => definition.code),
  );
  const formulasByCode = new Map<string, NormalizedMetricFormula>();
  const formulaConfigurationErrors = new Map<string, string>();
  for (const definition of derivedDefs) {
    if (definition.dataType !== "numeric") {
      formulaConfigurationErrors.set(definition.code, "derived formula target must use the numeric data type");
      continue;
    }
    const normalized = normalizeMetricFormula(definition.formulaJson);
    if (normalized.status === "invalid") {
      formulaConfigurationErrors.set(definition.code, normalized.error);
      continue;
    }
    const dependencyError = metricFormulaDependencyError(normalized.formula, activeNumericMetricCodes);
    if (dependencyError) {
      formulaConfigurationErrors.set(definition.code, dependencyError);
      continue;
    }
    formulasByCode.set(definition.code, normalized.formula);
  }

  const depGraph = buildDependencyGraph(derivedDefs, formulasByCode);
  const sortedDefinitions = topologicallySortDerivedDefinitions(derivedDefs, depGraph);
  const invalidFormulaCodes = new Set<string>(formulaConfigurationErrors.keys());
  for (const definition of sortedDefinitions.cyclic) {
    const message = `${definition.code}: circular derived-metric dependency`;
    console.warn(`[MetricEngine] ${message}`);
    failures.push(message);
    invalidFormulaCodes.add(definition.code);
  }

  // Calculations are scoped to one exact canonical reporting range. Contained
  // monthly/quarterly facts belong to readiness aggregation, not this formula.
  const existingValues = await calculationStorage.getMetricDefinitionValuesExact(
    businessId,
    siteId,
    periodStart,
    periodEnd,
  );

  const valuesByCode: Record<string, number | null> = {};
  const defById: Record<string, MetricDefinition> = {};
  for (const def of allDefinitions) defById[def.id] = def;

  for (const v of existingValues) {
    // Rejected facts are explicitly unavailable until revised. They must not
    // drive either this calculation or downstream derived dependencies.
    if (v.status === "rejected") continue;
    const def = defById[v.metricDefinitionId];
    if (def) {
      valuesByCode[def.code] = v.valueNumeric !== null ? parseFloat(v.valueNumeric) : null;
    }
  }

  let formulaContextPromise: Promise<MetricFormulaEvaluationContext> | null = null;
  const formulaContext = () => {
    formulaContextPromise ??= dependencies.loadFormulaContext(businessId);
    return formulaContextPromise;
  };

  for (const def of sortedDefinitions.ordered) {
    let runRecord;
    try {
      runRecord = await calculationStorage.createMetricCalculationRun({
        businessId,
        metricDefinitionId: def.id,
        siteId,
        reportingPeriodStart: periodStart,
        reportingPeriodEnd: periodEnd,
        status: "running",
        inputsJson: { sourceValues: valuesByCode },
        triggeredByMetricValueId: triggeredByMetricValueId ?? null,
      });
    } catch (runCreateErr: unknown) {
      const msg = runCreateErr instanceof Error ? runCreateErr.message : String(runCreateErr);
      console.error(`[MetricEngine] Failed to create run record for ${def.code}: ${msg}`);
      failures.push(`${def.code}: ${msg}`);
      invalidFormulaCodes.add(def.code);
      continue;
    }

    try {
      const configurationError = formulaConfigurationErrors.get(def.code);
      if (configurationError) {
        const message = `${def.code}: invalid formula configuration: ${configurationError}`;
        failures.push(message);
        invalidFormulaCodes.add(def.code);
        await calculationStorage.updateMetricCalculationRun(runRecord.id, {
          status: "error",
          errorText: `Invalid formula configuration: ${configurationError}`,
          outputJson: { outcome: "invalid_formula" },
        });
        continue;
      }

      const formula = formulasByCode.get(def.code)!;
      const invalidDependency = metricFormulaDependencies(formula)
        .find((dependency) => invalidFormulaCodes.has(dependency));
      if (invalidDependency) {
        const message = `${def.code}: dependency ${invalidDependency} has an invalid or failed formula`;
        failures.push(message);
        invalidFormulaCodes.add(def.code);
        await calculationStorage.updateMetricCalculationRun(runRecord.id, {
          status: "error",
          errorText: `Dependency ${invalidDependency} has an invalid or failed formula`,
          outputJson: { outcome: "invalid_dependency", dependency: invalidDependency },
        });
        continue;
      }

      let evaluation = evaluateMetricFormula(formula, valuesByCode);
      if (
        formula.type === "custom"
        && evaluation.status === "invalid"
        && evaluation.error === `${formula.customFn} requires configured emission factors`
      ) {
        try {
          evaluation = evaluateMetricFormula(formula, valuesByCode, await formulaContext());
        } catch (contextError: unknown) {
          evaluation = {
            status: "invalid",
            error: contextError instanceof Error ? contextError.message : String(contextError),
          };
        }
      }

      if (evaluation.status === "value") {
        const result = evaluation.value;
        const mutation = await calculationStorage.upsertCalculatedMetricDefinitionValue(
          businessId,
          def.id,
          siteId,
          periodStart,
          periodEnd,
          String(result),
        );
        if (mutation.outcome === "protected") {
          skippedProtected.push({
            code: def.code,
            operation: "calculation",
            reason: mutation.reason || "protected",
          });
          await calculationStorage.updateMetricCalculationRun(runRecord.id, {
            status: "skipped",
            outputJson: { result, outcome: mutation.outcome, reason: mutation.reason },
            errorText: "Existing canonical value is protected",
          });
        } else {
          valuesByCode[def.code] = result;
          if (mutation.outcome === "created" || mutation.outcome === "updated") updated.push(def.code);
          await calculationStorage.updateMetricCalculationRun(runRecord.id, {
            status: "success",
            outputJson: { result, outcome: mutation.outcome },
          });
        }
      } else if (evaluation.status === "unavailable") {
        const mutation = await calculationStorage.clearCalculatedMetricDefinitionValue(
          businessId,
          def.id,
          siteId,
          periodStart,
          periodEnd,
        );
        if (mutation.outcome === "protected") {
          skippedProtected.push({
            code: def.code,
            operation: "clear",
            reason: mutation.reason || "protected",
          });
        } else {
          valuesByCode[def.code] = null;
          skippedMissing.push(def.code);
          if (mutation.outcome === "cleared") cleared.push(def.code);
        }
        await calculationStorage.updateMetricCalculationRun(runRecord.id, {
          status: "skipped",
          outputJson: { outcome: mutation.outcome, reason: mutation.reason, unavailableReason: evaluation.reason },
          errorText: evaluation.reason,
        });
      } else {
        const message = `${def.code}: invalid formula evaluation: ${evaluation.error}`;
        failures.push(message);
        invalidFormulaCodes.add(def.code);
        await calculationStorage.updateMetricCalculationRun(runRecord.id, {
          status: "error",
          outputJson: { outcome: "invalid_formula_evaluation" },
          errorText: evaluation.error,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MetricEngine] Calculation failed for ${def.code}: ${msg}`);
      failures.push(`${def.code}: ${msg}`);
      invalidFormulaCodes.add(def.code);
      await calculationStorage.updateMetricCalculationRun(runRecord.id, {
        status: "error",
        errorText: msg,
      }).catch((updateErr: unknown) => {
        console.error(`[MetricEngine] Failed to update run record status: ${String(updateErr)}`);
      });
    }
  }

  if (siteId !== null) {
    for (const def of allDefinitions.filter(d => d.rollupMethod !== "none" && d.isActive)) {
      // A failed formula must not mutate the organisation fact indirectly via
      // a site rollup either. Preserve the last known calculated value until
      // the configuration/evaluation failure is corrected.
      if (def.isDerived && invalidFormulaCodes.has(def.code)) continue;
      try {
        const rollup = await calculationStorage.rollupSiteValuesToCompany(
          businessId,
          def.id,
          periodStart,
          periodEnd,
        );
        rollups.push({ code: def.code, outcome: rollup.outcome, value: rollup.rollupValue });
        if (rollup.outcome === "protected") {
          skippedProtected.push({ code: def.code, operation: "rollup", reason: rollup.reason || "protected" });
        } else if (rollup.outcome === "cleared") {
          cleared.push(`${def.code}:rollup`);
        }
      } catch (rollupErr: unknown) {
        const msg = rollupErr instanceof Error ? rollupErr.message : String(rollupErr);
        console.error(`[MetricEngine] Rollup failed for ${def.code}: ${msg}`);
        failures.push(`${def.code} rollup: ${msg}`);
      }
    }
  }

  return { failures, updated, cleared, skippedMissing, skippedProtected, rollups };
}

export async function triggerCalculationsForMetricValue(
  metricValueId: string,
  businessId: string,
  siteId: string | null,
  periodStart: Date,
  periodEnd: Date
): Promise<DerivedMetricCalculationResult> {
  return runDerivedMetricCalculations(businessId, siteId, periodStart, periodEnd, metricValueId);
}
