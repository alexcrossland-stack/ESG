import assert from "node:assert/strict";
import {
  adminMetricDefinitionCreateSchema,
  adminMetricDefinitionPatchSchema,
  normalizeMetricDefinitionName,
  validateActiveMetricDefinitionCatalogue,
} from "../../server/admin-metric-definition-validation";

type FormulaDefinition = Parameters<typeof validateActiveMetricDefinitionCatalogue>[0][number];

function definition(
  code: string,
  overrides: Partial<FormulaDefinition> = {},
): FormulaDefinition {
  return {
    code,
    dataType: "numeric",
    isActive: true,
    isDerived: false,
    formulaJson: null,
    ...overrides,
  };
}

const validCreate = {
  code: "QA_SOURCE",
  name: "QA source",
  pillar: "environmental",
  category: "testing",
};

const parsedCreate = adminMetricDefinitionCreateSchema.parse(validCreate);
assert.equal(parsedCreate.dataType, "numeric");
assert.equal(parsedCreate.isActive, true);
assert.equal(parsedCreate.isDerived, false);
assert.equal(parsedCreate.scoringWeight, "1");
assert.equal(parsedCreate.formulaJson, null);

assert.equal(
  adminMetricDefinitionCreateSchema.safeParse({ ...validCreate, code: "not valid" }).success,
  false,
  "invalid codes must produce a client validation failure rather than a database error",
);
assert.equal(
  adminMetricDefinitionCreateSchema.safeParse({ ...validCreate, dataType: "percentage" }).success,
  false,
  "unsupported database enum values must be rejected before persistence",
);
assert.equal(
  adminMetricDefinitionCreateSchema.safeParse({ ...validCreate, scoringWeight: "not-a-number" }).success,
  false,
  "invalid decimals must be rejected before persistence",
);
assert.equal(
  adminMetricDefinitionCreateSchema.safeParse({ ...validCreate, createdAt: "forged" }).success,
  false,
  "create payloads must be strict",
);
assert.equal(
  adminMetricDefinitionPatchSchema.safeParse({ code: "NEW_CODE" }).success,
  false,
  "metric codes must remain immutable on patch",
);
assert.equal(adminMetricDefinitionPatchSchema.safeParse({}).success, false, "empty patches must be rejected");
assert.equal(normalizeMetricDefinitionName("  Carbon   Emissions  "), "carbon emissions");
assert.equal(
  normalizeMetricDefinitionName("Natural Gas Consumption"),
  normalizeMetricDefinitionName("Gas / Fuel Consumption"),
  "historic gas labels must resolve to one activation and catalogue identity",
);

const source = definition("SOURCE");
const validDerived = definition("DERIVED", {
  isDerived: true,
  formulaJson: { type: "expression", sources: ["SOURCE"], expression: "SOURCE * 2" },
});
assert.deepEqual(validateActiveMetricDefinitionCatalogue([source, validDerived]), []);

assert.match(
  validateActiveMetricDefinitionCatalogue([
    source,
    definition("BROKEN", { isDerived: true, formulaJson: { type: "unsupported" } }),
  ]).join("; "),
  /BROKEN: unsupported formula type unsupported/,
  "malformed active formulas must fail closed",
);

assert.match(
  validateActiveMetricDefinitionCatalogue([
    source,
    definition("TEXT_TARGET", {
      dataType: "text",
      isDerived: true,
      formulaJson: { type: "sum", inputs: ["SOURCE"] },
    }),
  ]).join("; "),
  /derived formula target must use the numeric data type/,
  "derived targets must be numeric",
);

assert.match(
  validateActiveMetricDefinitionCatalogue([
    definition("TEXT_SOURCE", { dataType: "text" }),
    definition("NUMERIC_TARGET", {
      isDerived: true,
      formulaJson: { type: "sum", inputs: ["TEXT_SOURCE"] },
    }),
  ]).join("; "),
  /missing, inactive, or non-numeric metric code\(s\): TEXT_SOURCE/,
  "formula dependencies must be active and numeric",
);

const inactiveSource = definition("INACTIVE_SOURCE", { isActive: false });
const inactiveDerived = definition("INACTIVE_DERIVED", {
  isActive: false,
  isDerived: true,
  formulaJson: { type: "sum", inputs: ["INACTIVE_SOURCE"] },
});
assert.deepEqual(
  validateActiveMetricDefinitionCatalogue([inactiveSource, inactiveDerived]),
  [],
  "inactive definitions can be prepared incrementally",
);
assert.match(
  validateActiveMetricDefinitionCatalogue([
    inactiveSource,
    { ...inactiveDerived, isActive: true },
  ]).join("; "),
  /INACTIVE_SOURCE/,
  "activation must revalidate dependency availability",
);

const cycleA = definition("CYCLE_A", {
  isDerived: true,
  formulaJson: { type: "sum", inputs: ["CYCLE_B"] },
});
const cycleB = definition("CYCLE_B", {
  isDerived: true,
  formulaJson: { type: "sum", inputs: ["CYCLE_A"] },
});
assert.match(
  validateActiveMetricDefinitionCatalogue([cycleA, cycleB]).join("; "),
  /circular derived-metric dependency.*CYCLE_A.*CYCLE_B.*CYCLE_A/,
  "cycles must be rejected before persistence",
);

assert.match(
  validateActiveMetricDefinitionCatalogue([
    { ...source, isActive: false },
    validDerived,
  ]).join("; "),
  /SOURCE/,
  "deactivating a source used by an active formula must be rejected",
);

console.log("admin metric-definition validation tests passed");
