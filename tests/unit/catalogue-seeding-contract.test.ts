import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertCurrentEmissionFactorCatalogue,
  emissionFactorCatalogueErrors,
  UK_2026_EMISSION_FACTORS,
} from "../../server/seed-emission-factors";
import {
  assertMetricDefinitionCatalogue,
  METRIC_DEFINITIONS,
  metricDefinitionCatalogueErrors,
  REQUIRED_METRIC_DEFINITION_CODES,
  REQUIRED_SME_METRIC_NAMES,
} from "../../server/seed-metric-definitions";
import {
  assertFrameworkCatalogue,
  frameworkCatalogueErrors,
  FRAMEWORK_SEEDS,
  METRIC_MAPPINGS,
  REQUIREMENT_SEEDS,
} from "../../server/seed-frameworks";

const emissionRows = UK_2026_EMISSION_FACTORS.map((factor) => ({
  name: factor.name,
  category: factor.category,
  country: factor.country ?? "UK",
  unit: factor.unit,
  factor: factor.factor,
  sourceLabel: factor.sourceLabel ?? null,
  factorYear: factor.factorYear ?? null,
  version: factor.version ?? null,
  fuelType: factor.fuelType ?? null,
  methodology: factor.methodology ?? null,
}));
assert.equal(emissionRows.length, 11);
assert.deepEqual(emissionFactorCatalogueErrors(emissionRows), []);
assert.doesNotThrow(() => assertCurrentEmissionFactorCatalogue(emissionRows));
assert.match(
  emissionFactorCatalogueErrors(emissionRows.slice(1))[0],
  /Grid Electricity: expected exactly one row, found 0/,
);
assert.match(
  emissionFactorCatalogueErrors([...emissionRows, emissionRows[0]])[0],
  /Grid Electricity: expected exactly one row, found 2/,
);
const staleEmissionRows = emissionRows.map((row, index) => index === 0 ? { ...row, factor: "999.000000" } : row);
assert.match(emissionFactorCatalogueErrors(staleEmissionRows)[0], /Grid Electricity: mismatched factor/);
assert.throws(
  () => assertCurrentEmissionFactorCatalogue(staleEmissionRows),
  /Required 2026 UK emission-factor catalogue is invalid/,
);

const metricRows = [
  ...REQUIRED_METRIC_DEFINITION_CODES.map((code) => ({ code, name: `Canonical ${code}` })),
  ...REQUIRED_SME_METRIC_NAMES.map((name, index) => ({ code: `TEST_SME_${index}`, name })),
];
assert.deepEqual(metricDefinitionCatalogueErrors(metricRows), []);
assert.doesNotThrow(() => assertMetricDefinitionCatalogue(metricRows));
const withoutCanonicalMetric = metricRows.filter((row) => row.code !== REQUIRED_METRIC_DEFINITION_CODES[0]);
assert.match(metricDefinitionCatalogueErrors(withoutCanonicalMetric)[0], /missing canonical metric codes/);
const missingSmeName = REQUIRED_SME_METRIC_NAMES[0];
const withoutSmeMetric = metricRows.filter((row) => row.name !== missingSmeName);
assert.match(metricDefinitionCatalogueErrors(withoutSmeMetric).join("; "), /missing SME starter metrics/);
assert.match(
  metricDefinitionCatalogueErrors([
    ...metricRows,
    { code: "TEST_ALIAS_DUPLICATE", name: "  Natural   Gas Consumption  " },
  ]).join("; "),
  /duplicate normalized metric name gas \/ fuel consumption/,
  "catalogue reconciliation must reject case, whitespace, and alias-equivalent duplicate names",
);
assert.throws(
  () => assertMetricDefinitionCatalogue([]),
  /Required metric-definition catalogue is invalid/,
);
const carbonIntensityDefinition = METRIC_DEFINITIONS.find((definition) => definition.code === "G008");
assert.ok(carbonIntensityDefinition, "canonical Carbon Intensity definition is required");
assert.equal(carbonIntensityDefinition.pillar, "environmental");
assert.equal(carbonIntensityDefinition.category, "emissions");
assert.equal(carbonIntensityDefinition.inputFrequency, "quarterly");
assert.equal(carbonIntensityDefinition.unit, "tCO2e/employee");

const frameworkSnapshot = {
  frameworks: FRAMEWORK_SEEDS.map((seed) => ({ id: `fw:${seed.code}`, code: seed.code })),
  requirements: REQUIREMENT_SEEDS.map((seed) => ({
    id: `req:${seed.code}`,
    frameworkId: `fw:${seed.frameworkCode}`,
    code: seed.code,
  })),
  metricDefinitions: [...new Set(METRIC_MAPPINGS.map((mapping) => mapping.metricCode))]
    .map((code) => ({ id: `metric:${code}`, code })),
  mappings: METRIC_MAPPINGS.map((mapping) => ({
    metricDefinitionId: `metric:${mapping.metricCode}`,
    frameworkRequirementId: `req:${mapping.requirementCode}`,
    mappingStrength: mapping.strength,
    notes: mapping.notes ?? null,
  })),
};
assert.deepEqual(frameworkCatalogueErrors(frameworkSnapshot), []);
assert.doesNotThrow(() => assertFrameworkCatalogue(frameworkSnapshot));
assert.match(
  frameworkCatalogueErrors({ ...frameworkSnapshot, mappings: frameworkSnapshot.mappings.slice(1) })[0],
  /expected exactly one row, found 0/,
);
assert.match(
  frameworkCatalogueErrors({
    ...frameworkSnapshot,
    mappings: frameworkSnapshot.mappings.map((mapping, index) =>
      index === 0 ? { ...mapping, mappingStrength: "supporting" } : mapping,
    ),
  }).join("; "),
  /stale strength or notes/,
);
assert.throws(
  () => assertFrameworkCatalogue({ ...frameworkSnapshot, requirements: [] }),
  /Required framework catalogue is invalid/,
);

const [schemaSource, ensureIndexesSource, startupMetricSeedSource, storageSource, routesSource] = await Promise.all([
  readFile(new URL("../../shared/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../../server/ensure-indexes.ts", import.meta.url), "utf8"),
  readFile(new URL("../../server/seed-metric-definitions.ts", import.meta.url), "utf8"),
  readFile(new URL("../../server/storage.ts", import.meta.url), "utf8"),
  readFile(new URL("../../server/routes.ts", import.meta.url), "utf8"),
]);
assert.match(schemaSource, /idx_emission_factors_country_year_name_unique/);
assert.match(ensureIndexesSource, /CREATE UNIQUE INDEX IF NOT EXISTS idx_emission_factors_country_year_name_unique/);
assert.match(schemaSource, /idx_mfm_unique/);
assert.match(ensureIndexesSource, /CREATE INDEX IF NOT EXISTS idx_mfm_metric_def/);
assert.match(ensureIndexesSource, /CREATE INDEX IF NOT EXISTS idx_mfm_req/);
assert.match(ensureIndexesSource, /CREATE UNIQUE INDEX IF NOT EXISTS idx_mfm_unique/);
assert.match(ensureIndexesSource, /idx_mfm_unique: \["UNIQUE INDEX", "metric_framework_mappings"/);
assert.doesNotMatch(ensureIndexesSource, /try\s*\{\s*await seedMetricDefinitions\(\)/);
assert.match(
  startupMetricSeedSource,
  /METRIC_DEFINITION_CATALOGUE_LOCK_KEY,[\s\S]*normalizeMetricDefinitionName,[\s\S]*from "\.\/admin-metric-definition-validation"/,
);
assert.match(
  startupMetricSeedSource,
  /pg_advisory_xact_lock\(hashtextextended\(\$\{METRIC_DEFINITION_CATALOGUE_LOCK_KEY\}, 0\)\)/,
);
assert.doesNotMatch(startupMetricSeedSource, /METRIC_DEFINITION_SEED_LOCK/);
assert.match(startupMetricSeedSource, /Reconciled duplicate names/);
assert.match(startupMetricSeedSource, /UPDATE metric_definition_values AS legacy/);
assert.match(startupMetricSeedSource, /UPDATE metric_calculation_runs/);
assert.match(startupMetricSeedSource, /replaceMetricFormulaCodes/);
assert.equal(
  storageSource.match(/hashtextextended\(\$\{METRIC_DEFINITION_CATALOGUE_LOCK_KEY\}, 0\)/g)?.length,
  1,
  "the locked admin mutation must be the only storage-level catalogue writer",
);
assert.doesNotMatch(storageSource, /async (?:create|update|seed)MetricDefinition\(/);
const runtimeSeedRoute = routesSource.match(
  /app\.post\("\/api\/metric-definitions\/seed"[\s\S]*?\n  \}\);/,
)?.[0] ?? "";
assert.match(runtimeSeedRoute, /import\("\.\/seed-metric-definitions"\)/);
assert.match(runtimeSeedRoute, /seedMetricDefinitions: reconcileMetricDefinitionCatalogue/);
assert.match(runtimeSeedRoute, /await reconcileMetricDefinitionCatalogue\(\)/);
assert.doesNotMatch(runtimeSeedRoute, /storage\.seedMetricDefinitions|METRIC_DEFINITIONS/);
assert.doesNotMatch(
  runtimeSeedRoute,
  /metric-definitions-seed|ALL_METRIC_DEFINITIONS/,
  "runtime recovery must not layer the legacy duplicate-name catalogue over the startup catalogue",
);
assert.match(routesSource, /ALL_STARTUP_METRIC_DEFINITION_SEEDS\.map\(\(\{ code, name \}\) => \(\{ code, name \}\)\)/);
assert.match(storageSource, /seedReservationByCode/);
assert.match(storageSource, /seedReservationByName/);

console.log("catalogue seeding contract tests passed");
