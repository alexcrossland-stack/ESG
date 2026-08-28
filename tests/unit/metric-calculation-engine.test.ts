import assert from "node:assert/strict";
import type { MetricDefinition } from "../../shared/schema";
import {
  runDerivedMetricCalculations,
  type MetricCalculationEngineDependencies,
} from "../../server/metric-calculation-engine";
import {
  ALL_STARTUP_METRIC_DEFINITION_SEEDS,
  type MetricSeed,
} from "../../server/seed-metric-definitions";

function asDefinition(seed: MetricSeed): MetricDefinition {
  return {
    ...seed,
    id: `definition:${seed.code}`,
    unit: seed.unit ?? null,
    formulaJson: seed.formulaJson ?? null,
    frameworkTags: seed.frameworkTags ?? null,
    scoringWeight: seed.scoringWeight ?? "1",
    evidenceRequired: seed.evidenceRequired ?? false,
    createdAt: null,
    updatedAt: null,
  } as MetricDefinition;
}

type ExistingValue = {
  metricDefinitionId: string;
  valueNumeric: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
};

function createHarness(definitions: MetricDefinition[], existingValues: ExistingValue[]) {
  const codeById = new Map(definitions.map((definition) => [definition.id, definition.code]));
  const savedValues = new Map<string, number>();
  const clearedCodes: string[] = [];
  const rollupCodes: string[] = [];
  const runUpdates = new Map<string, Record<string, unknown>>();
  const lockQueries: Array<{ statement: string; key: string }> = [];
  let runSequence = 0;
  let releasedWithError: unknown = null;

  const dependencies: MetricCalculationEngineDependencies = {
    lockPool: {
      async connect() {
        return {
          async query(statement: string, values: string[]) {
            lockQueries.push({ statement, key: values[0] });
            return statement.includes("pg_advisory_unlock")
              ? { rows: [{ unlocked: true }] }
              : { rows: [] };
          },
          release(error?: unknown) {
            releasedWithError = error ?? null;
          },
        };
      },
    },
    storage: {
      async getMetricDefinitions() {
        return definitions;
      },
      async getMetricDefinitionValuesExact() {
        return existingValues;
      },
      async createMetricCalculationRun() {
        runSequence++;
        return { id: `run:${runSequence}` };
      },
      async updateMetricCalculationRun(id: string, update: Record<string, unknown>) {
        runUpdates.set(id, update);
        return { id, ...update };
      },
      async upsertCalculatedMetricDefinitionValue(_businessId, definitionId, _siteId, _start, _end, value) {
        savedValues.set(codeById.get(definitionId)!, Number(value));
        return { outcome: "created" as const, value: {} as any };
      },
      async clearCalculatedMetricDefinitionValue(_businessId, definitionId) {
        clearedCodes.push(codeById.get(definitionId)!);
        return { outcome: "cleared" as const, value: {} as any };
      },
      async rollupSiteValuesToCompany(_businessId, definitionId) {
        rollupCodes.push(codeById.get(definitionId)!);
        return { outcome: "unchanged" as const, rollupValue: null, value: null };
      },
    } as any,
    async loadFormulaContext() {
      return { emissionFactors: { electricity: 0.1, naturalGas: 0.2, diesel: 2.5 } };
    },
  };

  return {
    dependencies,
    savedValues,
    clearedCodes,
    rollupCodes,
    runUpdates,
    lockQueries,
    releasedWithError: () => releasedWithError,
  };
}

const definitions = ALL_STARTUP_METRIC_DEFINITION_SEEDS.map(asDefinition);
const sourceValues: Record<string, number> = {
  E001: 1_000,
  E002: 1_000,
  E003: 100,
  E007: 5,
  E008: 4,
  S001: 40,
  S002: 2,
  S006: 80,
};
const existingValues = Object.entries(sourceValues).map(([code, value]) => ({
  metricDefinitionId: `definition:${code}`,
  valueNumeric: String(value),
  status: "draft" as const,
}));
const catalogueHarness = createHarness(definitions, existingValues);
const catalogueResult = await runDerivedMetricCalculations(
  "business:catalogue",
  null,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-31T00:00:00.000Z"),
  undefined,
  catalogueHarness.dependencies,
);

const activeDerivedCodes = ALL_STARTUP_METRIC_DEFINITION_SEEDS
  .filter((definition) => definition.isActive && definition.isDerived)
  .map((definition) => definition.code)
  .sort();
assert.deepEqual(catalogueResult.failures, []);
assert.deepEqual(catalogueResult.cleared, []);
assert.deepEqual([...catalogueResult.updated].sort(), activeDerivedCodes);
assert.deepEqual([...catalogueHarness.savedValues.keys()].sort(), activeDerivedCodes);
assert.equal(catalogueHarness.savedValues.get("E004"), 0.45);
assert.equal(catalogueHarness.savedValues.get("E005"), 0.1);
assert.equal(catalogueHarness.savedValues.get("E006"), 0.55);
assert.equal(catalogueHarness.savedValues.get("E009"), 80);
assert.equal(catalogueHarness.savedValues.get("S003"), 5);
assert.equal(catalogueHarness.savedValues.get("S007"), 2);
assert.ok(Math.abs((catalogueHarness.savedValues.get("G008") ?? 0) - 0.01375) < 1e-12);
assert.equal(catalogueHarness.releasedWithError(), null);
assert.equal(catalogueHarness.lockQueries.length, 2, "one lock and one unlock are required for the exact month");
assert.match(catalogueHarness.lockQueries[0].statement, /pg_advisory_lock/);
assert.match(catalogueHarness.lockQueries[1].statement, /pg_advisory_unlock/);
assert.equal(catalogueHarness.lockQueries[0].key, "calculation_run:business:catalogue:2026-01");

const failureDefinitions = [
  asDefinition({
    code: "SOURCE",
    name: "Source",
    pillar: "environmental",
    category: "test",
    description: "Available source",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    sortOrder: 1,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "MISSING_SOURCE",
    name: "Missing source",
    pillar: "environmental",
    category: "test",
    description: "A configured input without a current value",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    sortOrder: 2,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "TEXT_SOURCE",
    name: "Text source",
    pillar: "environmental",
    category: "test",
    description: "An active nonnumeric source",
    dataType: "text",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    sortOrder: 2,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "BROKEN",
    name: "Broken derived",
    pillar: "environmental",
    category: "test",
    description: "Invalid configuration",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "sum", inputs: ["SOURCE"], unsupported: true },
    sortOrder: 3,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "DOWNSTREAM",
    name: "Downstream derived",
    pillar: "environmental",
    category: "test",
    description: "Depends on invalid formula",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "expression", sources: ["BROKEN"], expression: "BROKEN * 2" },
    sortOrder: 4,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "VALID_MISSING",
    name: "Valid formula with missing input",
    pillar: "environmental",
    category: "test",
    description: "Valid configuration",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "sum", inputs: ["MISSING_SOURCE"] },
    sortOrder: 5,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "ALGEBRAIC_ZERO",
    name: "Algebraic zero denominator",
    pillar: "environmental",
    category: "test",
    description: "An expression configuration failure",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: {
      type: "expression",
      sources: ["SOURCE"],
      expression: "SOURCE / (SOURCE - SOURCE)",
    },
    sortOrder: 6,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "TEXT_DEPENDENCY",
    name: "Text dependency",
    pillar: "environmental",
    category: "test",
    description: "A nonnumeric dependency configuration failure",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "sum", inputs: ["TEXT_SOURCE"] },
    sortOrder: 7,
    rollupMethod: "sum",
  }),
  asDefinition({
    code: "TEXT_TARGET",
    name: "Text target",
    pillar: "environmental",
    category: "test",
    description: "A nonnumeric target configuration failure",
    dataType: "text",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "sum", inputs: ["SOURCE"] },
    sortOrder: 8,
    rollupMethod: "sum",
  }),
];
const failureHarness = createHarness(failureDefinitions, [
  { metricDefinitionId: "definition:SOURCE", valueNumeric: "1", status: "draft" },
  { metricDefinitionId: "definition:TEXT_SOURCE", valueNumeric: null, status: "draft" },
  { metricDefinitionId: "definition:BROKEN", valueNumeric: "99", status: "draft" },
  { metricDefinitionId: "definition:DOWNSTREAM", valueNumeric: "198", status: "draft" },
  { metricDefinitionId: "definition:VALID_MISSING", valueNumeric: "123", status: "draft" },
  { metricDefinitionId: "definition:ALGEBRAIC_ZERO", valueNumeric: "12", status: "draft" },
  { metricDefinitionId: "definition:TEXT_DEPENDENCY", valueNumeric: "13", status: "draft" },
  { metricDefinitionId: "definition:TEXT_TARGET", valueNumeric: "14", status: "draft" },
]);
const failureResult = await runDerivedMetricCalculations(
  "business:failure",
  "site:one",
  new Date("2026-02-01T00:00:00.000Z"),
  new Date("2026-02-28T00:00:00.000Z"),
  undefined,
  failureHarness.dependencies,
);

assert.match(failureResult.failures.join("; "), /BROKEN: invalid formula configuration/);
assert.match(failureResult.failures.join("; "), /DOWNSTREAM: dependency BROKEN has an invalid or failed formula/);
assert.match(failureResult.failures.join("; "), /ALGEBRAIC_ZERO: invalid formula evaluation: expression denominator is zero/);
assert.match(failureResult.failures.join("; "), /TEXT_DEPENDENCY: invalid formula configuration: formula references missing, inactive, or non-numeric metric code\(s\): TEXT_SOURCE/);
assert.match(failureResult.failures.join("; "), /TEXT_TARGET: invalid formula configuration: derived formula target must use the numeric data type/);
assert.deepEqual(failureHarness.clearedCodes, ["VALID_MISSING"]);
assert.deepEqual(failureResult.cleared, ["VALID_MISSING"]);
assert.deepEqual(failureResult.skippedMissing, ["VALID_MISSING"]);
assert.equal(failureHarness.savedValues.has("BROKEN"), false);
assert.equal(failureHarness.savedValues.has("DOWNSTREAM"), false);
assert.equal(failureHarness.savedValues.has("ALGEBRAIC_ZERO"), false);
assert.equal(failureHarness.savedValues.has("TEXT_DEPENDENCY"), false);
assert.equal(failureHarness.savedValues.has("TEXT_TARGET"), false);
assert.equal(failureHarness.rollupCodes.includes("BROKEN"), false, "invalid formulas must not mutate via rollup");
assert.equal(failureHarness.rollupCodes.includes("DOWNSTREAM"), false, "invalid dependencies must not mutate via rollup");
assert.equal(failureHarness.rollupCodes.includes("ALGEBRAIC_ZERO"), false, "expression errors must not mutate via rollup");
assert.equal(failureHarness.rollupCodes.includes("TEXT_DEPENDENCY"), false, "nonnumeric dependencies must not mutate via rollup");
assert.equal(failureHarness.rollupCodes.includes("TEXT_TARGET"), false, "nonnumeric targets must not mutate via rollup");
assert.equal(failureHarness.rollupCodes.includes("VALID_MISSING"), true, "a valid unavailable formula may clear and roll up");
assert.equal(failureHarness.releasedWithError(), null);

const factorFailureDefinitions = [
  asDefinition({
    code: "GAS",
    name: "Gas",
    pillar: "environmental",
    category: "test",
    description: "Gas",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    sortOrder: 1,
    rollupMethod: "none",
  }),
  asDefinition({
    code: "FUEL",
    name: "Fuel",
    pillar: "environmental",
    category: "test",
    description: "Fuel",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: false,
    sortOrder: 2,
    rollupMethod: "none",
  }),
  asDefinition({
    code: "SCOPE1",
    name: "Scope 1",
    pillar: "environmental",
    category: "test",
    description: "Scope 1",
    dataType: "numeric",
    inputFrequency: "monthly",
    isCore: true,
    isActive: true,
    isDerived: true,
    formulaJson: { type: "custom", customFn: "scope1_emissions", inputs: ["GAS", "FUEL"] },
    sortOrder: 3,
    rollupMethod: "none",
  }),
];
const factorFailureHarness = createHarness(factorFailureDefinitions, [
  { metricDefinitionId: "definition:GAS", valueNumeric: "1000", status: "draft" },
  { metricDefinitionId: "definition:FUEL", valueNumeric: "100", status: "draft" },
  { metricDefinitionId: "definition:SCOPE1", valueNumeric: "9.9", status: "draft" },
]);
factorFailureHarness.dependencies.loadFormulaContext = async () => {
  throw new Error("factor catalogue unavailable");
};
const factorFailureResult = await runDerivedMetricCalculations(
  "business:factors",
  null,
  new Date("2026-03-01T00:00:00.000Z"),
  new Date("2026-03-31T00:00:00.000Z"),
  undefined,
  factorFailureHarness.dependencies,
);
assert.match(factorFailureResult.failures.join("; "), /SCOPE1: invalid formula evaluation: factor catalogue unavailable/);
assert.deepEqual(factorFailureHarness.clearedCodes, []);
assert.deepEqual(factorFailureResult.cleared, []);

console.log("metric calculation engine tests passed");
