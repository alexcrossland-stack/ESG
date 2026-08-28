import assert from "node:assert/strict";
import { ALL_METRIC_DEFINITIONS } from "../../server/metric-definitions-seed";
import {
  ALL_STARTUP_METRIC_DEFINITION_SEEDS,
  assertMetricDefinitionFormulaCatalogue,
  METRIC_DEFINITIONS,
  metricDefinitionFormulaCatalogueErrors,
  metricFormulaMergeProtectedCodes,
  SME_DEFAULT_DEFINITIONS,
} from "../../server/seed-metric-definitions";
import {
  evaluateMetricFormula,
  metricFormulaDependencyError,
  normalizeMetricFormula,
  type NormalizedMetricFormula,
} from "../../server/metric-formula-contract";

const emissionFactors = { electricity: 0.1, naturalGas: 0.2, diesel: 2.5 };

function requireFormula(value: unknown): NormalizedMetricFormula {
  const normalized = normalizeMetricFormula(value);
  assert.equal(normalized.status, "valid", normalized.status === "invalid" ? normalized.error : undefined);
  return normalized.formula;
}

function assertApprox(actual: number, expected: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, message ?? `${actual} != ${expected}`);
}

assert.deepEqual(metricDefinitionFormulaCatalogueErrors(), []);
assert.doesNotThrow(() => assertMetricDefinitionFormulaCatalogue());

const invalidSeedCatalogue = ALL_STARTUP_METRIC_DEFINITION_SEEDS.map((definition) =>
  definition.code === "E006"
    ? { ...definition, formulaJson: { type: "not-supported" } }
    : definition);
assert.match(metricDefinitionFormulaCatalogueErrors(invalidSeedCatalogue).join("; "), /E006: unsupported formula type/);
assert.throws(
  () => assertMetricDefinitionFormulaCatalogue(invalidSeedCatalogue),
  /Seeded metric formula catalogue is invalid/,
);

const missingDependencyCatalogue = ALL_STARTUP_METRIC_DEFINITION_SEEDS.map((definition) =>
  definition.code === "E006"
    ? { ...definition, formulaJson: { type: "sum", inputs: ["DOES_NOT_EXIST"] } }
    : definition);
assert.match(
  metricDefinitionFormulaCatalogueErrors(missingDependencyCatalogue).join("; "),
  /E006: formula references missing, inactive, or non-numeric metric code\(s\): DOES_NOT_EXIST/,
);
const nonNumericDependencyCatalogue = ALL_STARTUP_METRIC_DEFINITION_SEEDS.map((definition) =>
  definition.code === "E001" ? { ...definition, dataType: "text" as const } : definition);
assert.match(
  metricDefinitionFormulaCatalogueErrors(nonNumericDependencyCatalogue).join("; "),
  /E005: formula references missing, inactive, or non-numeric metric code\(s\): E001/,
);
const nonNumericTargetCatalogue = ALL_STARTUP_METRIC_DEFINITION_SEEDS.map((definition) =>
  definition.code === "E006" ? { ...definition, dataType: "text" as const } : definition);
assert.match(
  metricDefinitionFormulaCatalogueErrors(nonNumericTargetCatalogue).join("; "),
  /E006: derived formula target must use the numeric data type/,
);

const protectedDuplicateFormulaCodes = metricFormulaMergeProtectedCodes(
  [
    {
      code: "COREFERENCE_EXPRESSION",
      dataType: "numeric",
      isActive: true,
      isDerived: true,
      formulaJson: {
        type: "expression",
        sources: ["E001", "ENV_ELEC_KWH"],
        expression: "E001 + ENV_ELEC_KWH",
      },
    },
    {
      code: "COREFERENCE_RATIO",
      dataType: "numeric",
      isActive: true,
      isDerived: true,
      formulaJson: {
        type: "ratio",
        numerator: ["ALT_ELEC_KWH"],
        denominator: "E001",
        scale: 1,
      },
    },
    {
      code: "SAFE_REWRITE",
      dataType: "numeric",
      isActive: true,
      isDerived: true,
      formulaJson: { type: "sum", sources: ["ENV_SCOPE2_TCO2E"] },
    },
    {
      code: "SELF_TARGET_OWNER",
      dataType: "numeric",
      isActive: true,
      isDerived: true,
      formulaJson: { type: "sum", sources: ["SELF_TARGET_LEGACY"] },
    },
    {
      code: "REVERSE_SELF_TARGET_LEGACY",
      dataType: "numeric",
      isActive: true,
      isDerived: true,
      formulaJson: { type: "sum", sources: ["REVERSE_SELF_TARGET_OWNER"] },
    },
  ],
  new Map([
    ["ENV_ELEC_KWH", "E001"],
    ["ALT_ELEC_KWH", "E001"],
    ["ENV_SCOPE2_TCO2E", "E005"],
    ["SELF_TARGET_LEGACY", "SELF_TARGET_OWNER"],
    ["REVERSE_SELF_TARGET_LEGACY", "REVERSE_SELF_TARGET_OWNER"],
  ]),
);
assert.deepEqual(
  Array.from(protectedDuplicateFormulaCodes).sort(),
  [
    "ALT_ELEC_KWH",
    "ENV_ELEC_KWH",
    "REVERSE_SELF_TARGET_LEGACY",
    "SELF_TARGET_LEGACY",
  ],
  "many-to-one and both self-target orientations must stay distinct while safe single-source rewrites may merge",
);

const absenceRate = METRIC_DEFINITIONS.find((definition) => definition.code === "S005");
assert.equal(absenceRate?.isDerived, false, "absence rate must not pretend headcount is total working days");
assert.equal(absenceRate?.formulaJson, undefined);
for (const [code, calculationType] of Object.entries({
  SME_DEFAULT_09: "travel_emissions",
  SME_DEFAULT_10: "carbon_intensity",
  SME_DEFAULT_13: "management_diversity",
  SME_DEFAULT_15: "absence_rate",
  SME_DEFAULT_19: "living_wage",
  SME_DEFAULT_24: "privacy_training",
  SME_DEFAULT_25: "supplier_code",
})) {
  const defaultDefinition = SME_DEFAULT_DEFINITIONS.find((definition) => definition.code === code);
  assert.ok(defaultDefinition, `expected default definition ${code}`);
  assert.equal(defaultDefinition.isDerived, false, `${calculationType} lacks represented formula inputs`);
  assert.equal(defaultDefinition.formulaJson, undefined);
}

const canonicalSourceValues: Record<string, number> = {
  E001: 1_000,
  E002: 1_000,
  E003: 100,
  E004: 0.45,
  E005: 0.1,
  E006: 0.55,
  E007: 5,
  E008: 4,
  E010: 20,
  E011: 250,
  S001: 40,
  S002: 2,
  S006: 80,
};
const expectedCanonicalValues: Record<string, number> = {
  E004: 0.45,
  E005: 0.1,
  E006: 0.55,
  E009: 80,
  S003: 5,
  S007: 2,
  G008: 0.01375,
};

for (const definition of METRIC_DEFINITIONS.filter((candidate) => candidate.isActive && candidate.isDerived)) {
  const formula = requireFormula(definition.formulaJson);
  const evaluated = evaluateMetricFormula(formula, canonicalSourceValues, { emissionFactors });
  assert.equal(evaluated.status, "value", `${definition.code} did not evaluate`);
  assertApprox(evaluated.value, expectedCanonicalValues[definition.code], `${definition.code} produced the wrong value`);
}

const activeStartupCodes = new Set(
  ALL_STARTUP_METRIC_DEFINITION_SEEDS
    .filter((definition) => definition.isActive && definition.dataType === "numeric")
    .map((definition) => definition.code),
);
for (const definition of ALL_STARTUP_METRIC_DEFINITION_SEEDS.filter(
  (candidate) => candidate.isActive && candidate.isDerived,
)) {
  const formula = requireFormula(definition.formulaJson);
  assert.equal(metricFormulaDependencyError(formula, activeStartupCodes), null, definition.code);
  assert.equal(
    evaluateMetricFormula(formula, canonicalSourceValues, { emissionFactors }).status,
    "value",
    `${definition.code} must have an executable seeded formula contract`,
  );
}

type RouteSeed = (typeof ALL_METRIC_DEFINITIONS)[number];
const routeActiveCodes = new Set(
  ALL_METRIC_DEFINITIONS
    .filter((definition) => definition.isActive && definition.dataType === "numeric")
    .map((definition) => definition.code),
);
const routeSourceValues: Record<string, number> = {
  ENV_ELEC_KWH: 1_000,
  ENV_GAS_KWH: 1_000,
  ENV_VEHICLE_FUEL_L: 100,
  ENV_SCOPE1_TCO2E: 0.4,
  ENV_SCOPE2_TCO2E: 0.2,
  ENV_TRAVEL_TCO2E: 0.1,
  ENV_WASTE_TOTAL_T: 5,
  ENV_WASTE_RECYCLED_T: 4,
  SOC_HEADCOUNT: 40,
};
const expectedRouteSeedValues: Record<string, number> = {
  ENV_SCOPE1_TCO2E: 0.453489,
  ENV_SCOPE2_TCO2E: 0.20707,
  ENV_CARBON_INTENSITY: 0.0175,
  ENV_RECYCLING_RATE: 80,
};
for (const definition of ALL_METRIC_DEFINITIONS.filter(
  (candidate): candidate is RouteSeed => Boolean(candidate.isActive && candidate.isDerived),
)) {
  const formula = requireFormula(definition.formulaJson);
  assert.equal(metricFormulaDependencyError(formula, routeActiveCodes), null, definition.code);
  const evaluated = evaluateMetricFormula(formula, routeSourceValues);
  assert.equal(evaluated.status, "value", `${definition.code} did not evaluate`);
  assertApprox(evaluated.value, expectedRouteSeedValues[definition.code], `${definition.code} produced the wrong value`);
}

const legacySum = requireFormula({ type: "sum", inputs: ["A", "B"] });
assert.deepEqual(legacySum, { type: "sum", sources: ["A", "B"] });
assert.deepEqual(evaluateMetricFormula(legacySum, { A: 2, B: 3 }), { status: "value", value: 5 });

const legacyScalarRatio = requireFormula({
  type: "ratio",
  numerator: "A",
  denominator: "B",
  multiplier: 100,
});
assert.deepEqual(legacyScalarRatio, { type: "ratio", numerator: ["A"], denominator: "B", scale: 100 });
assert.deepEqual(evaluateMetricFormula(legacyScalarRatio, { A: 2, B: 4 }), { status: "value", value: 50 });

const currentArrayRatio = requireFormula({
  type: "ratio",
  numerator: ["A", "B"],
  denominator: "C",
  scale: 10,
});
assert.deepEqual(evaluateMetricFormula(currentArrayRatio, { A: 2, B: 3, C: 5 }), { status: "value", value: 10 });

const expression = requireFormula({
  type: "expression",
  sources: ["A", "B"],
  expression: "-(A + 2 * B) / 2",
});
assert.deepEqual(evaluateMetricFormula(expression, { A: 2, B: 3 }), { status: "value", value: -4 });
const dataDependentDenominator = requireFormula({
  type: "expression",
  sources: ["A", "B", "C"],
  expression: "A / (B - C)",
});
assert.deepEqual(
  evaluateMetricFormula(dataDependentDenominator, { A: 6, B: 5, C: 2 }),
  { status: "value", value: 2 },
);
assert.deepEqual(
  evaluateMetricFormula(dataDependentDenominator, { A: 6, B: 2, C: 2 }),
  { status: "invalid", error: "expression denominator is zero" },
);
const algebraicZeroDenominator = requireFormula({
  type: "expression",
  sources: ["A", "B"],
  expression: "A / (B - B)",
});
assert.deepEqual(
  evaluateMetricFormula(algebraicZeroDenominator, { A: 6, B: 2 }),
  { status: "invalid", error: "expression denominator is zero" },
);

assert.deepEqual(
  evaluateMetricFormula(legacySum, { A: 0, B: 0 }),
  { status: "value", value: 0 },
  "zero source values are real values, not missing inputs",
);
assert.deepEqual(
  evaluateMetricFormula(legacySum, { A: 1, B: null }),
  { status: "unavailable", reason: "source value B is missing" },
);
assert.deepEqual(
  evaluateMetricFormula(currentArrayRatio, { A: 1, B: 2, C: 0 }),
  { status: "unavailable", reason: "denominator C is zero" },
);

for (const invalidFormula of [
  null,
  { type: "custom", customFn: "absence_rate", inputs: ["A", "B"] },
  { type: "ratio", numerator: "A", denominator: "B", multiplier: 10, scale: 100 },
  { type: "expression", sources: ["A"], expression: "A + B" },
  { type: "expression", sources: ["A", "B"], expression: "A" },
  { type: "expression", sources: ["A"], expression: "A; process.exit()" },
  { type: "expression", sources: ["A"], expression: "A / 0" },
  { type: "sum", inputs: ["A"], sources: ["A"] },
  { type: "sum", inputs: ["A"], arbitrary: true },
]) {
  assert.equal(normalizeMetricFormula(invalidFormula).status, "invalid", JSON.stringify(invalidFormula));
}

const scope1 = requireFormula({ type: "custom", customFn: "scope1_emissions", inputs: ["GAS", "FUEL"] });
assert.deepEqual(
  evaluateMetricFormula(scope1, { GAS: 1_000, FUEL: 100 }, { emissionFactors }),
  { status: "value", value: 0.45 },
);
assert.equal(
  evaluateMetricFormula(scope1, { GAS: 1_000, FUEL: 100 }).status,
  "invalid",
  "emission formula configuration failures must not look like missing inputs",
);

console.log("metric formula contract tests passed");
