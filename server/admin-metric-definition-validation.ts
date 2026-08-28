import { z } from "zod";
import type { MetricDefinition } from "@shared/schema";
import {
  metricFormulaDependencies,
  metricFormulaDependencyError,
  normalizeMetricFormula,
} from "./metric-formula-contract";

export const METRIC_DEFINITION_CATALOGUE_LOCK_KEY = "metric_definition_catalogue:global";

/**
 * Metric activation is name-based for the SME library, so catalogue writes
 * must use the exact same equivalence rule. Keep the historic gas label alias
 * here as the single shared contract for routes and persistence.
 */
export function normalizeMetricDefinitionName(name: string | null | undefined): string {
  const normalized = (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return normalized === "natural gas consumption"
    ? "gas / fuel consumption"
    : normalized;
}

const metricCodeSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "code must contain only letters, numbers, and underscores and must not start with a number");

const scoringWeightSchema = z.preprocess(
  (value) => typeof value === "number" ? String(value) : value,
  z.string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/, "scoringWeight must be a number from 0 to 999.99"),
);

const nullableTrimmedString = (maximum: number) => z.string().trim().max(maximum).nullable();

const adminMetricDefinitionMutableShape = {
  name: z.string().trim().min(1).max(200),
  pillar: z.enum(["environmental", "social", "governance"]),
  category: z.string().trim().min(1).max(120),
  description: nullableTrimmedString(4_000).optional(),
  dataType: z.enum(["numeric", "text", "boolean", "json"]),
  unit: nullableTrimmedString(80).optional(),
  inputFrequency: z.enum(["monthly", "quarterly", "annual"]),
  isCore: z.boolean(),
  isActive: z.boolean(),
  isDerived: z.boolean(),
  formulaJson: z.record(z.unknown()).nullable().optional(),
  frameworkTags: z.array(z.string().trim().min(1).max(120)).max(50),
  scoringWeight: scoringWeightSchema,
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
  evidenceRequired: z.boolean(),
  rollupMethod: z.enum(["sum", "weighted_average", "latest", "none"]),
};

export const adminMetricDefinitionCreateSchema = z.object({
  code: metricCodeSchema,
  ...adminMetricDefinitionMutableShape,
  dataType: adminMetricDefinitionMutableShape.dataType.default("numeric"),
  inputFrequency: adminMetricDefinitionMutableShape.inputFrequency.default("quarterly"),
  isCore: adminMetricDefinitionMutableShape.isCore.default(false),
  isActive: adminMetricDefinitionMutableShape.isActive.default(true),
  isDerived: adminMetricDefinitionMutableShape.isDerived.default(false),
  formulaJson: adminMetricDefinitionMutableShape.formulaJson.default(null),
  frameworkTags: adminMetricDefinitionMutableShape.frameworkTags.default([]),
  scoringWeight: adminMetricDefinitionMutableShape.scoringWeight.default("1"),
  sortOrder: adminMetricDefinitionMutableShape.sortOrder.default(0),
  evidenceRequired: adminMetricDefinitionMutableShape.evidenceRequired.default(false),
  rollupMethod: adminMetricDefinitionMutableShape.rollupMethod.default("sum"),
}).strict();

// Codes are stable identifiers referenced by formulas and framework mappings.
// Deliberately omitting code makes attempts to patch it a validation error.
export const adminMetricDefinitionPatchSchema = z.object({
  ...adminMetricDefinitionMutableShape,
}).partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: "at least one editable field is required" },
);

export type AdminMetricDefinitionCreateInput = z.infer<typeof adminMetricDefinitionCreateSchema>;
export type AdminMetricDefinitionPatchInput = z.infer<typeof adminMetricDefinitionPatchSchema>;

type FormulaDefinition = Pick<
  MetricDefinition,
  "code" | "dataType" | "isActive" | "isDerived" | "formulaJson"
>;

/**
 * Validates the exact catalogue state that would exist after an admin mutation.
 * Only active derived metrics execute, so inactive definitions may be prepared
 * incrementally but are validated again before activation.
 */
export function validateActiveMetricDefinitionCatalogue(
  definitions: readonly FormulaDefinition[],
): string[] {
  const errors: string[] = [];
  const activeNumericCodes = new Set(
    definitions
      .filter((definition) => definition.isActive && definition.dataType === "numeric")
      .map((definition) => definition.code),
  );
  const dependenciesByDerivedCode = new Map<string, string[]>();

  for (const definition of definitions.filter((candidate) => candidate.isActive && candidate.isDerived)) {
    if (definition.dataType !== "numeric") {
      errors.push(`${definition.code}: derived formula target must use the numeric data type`);
      continue;
    }

    const normalized = normalizeMetricFormula(definition.formulaJson);
    if (normalized.status === "invalid") {
      errors.push(`${definition.code}: ${normalized.error}`);
      continue;
    }

    const dependencyError = metricFormulaDependencyError(normalized.formula, activeNumericCodes);
    if (dependencyError) {
      errors.push(`${definition.code}: ${dependencyError}`);
      continue;
    }
    dependenciesByDerivedCode.set(definition.code, metricFormulaDependencies(normalized.formula));
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const path: string[] = [];
  const recordedCycles = new Set<string>();

  const visit = (code: string): void => {
    if (visitState.get(code) === "visited") return;
    if (visitState.get(code) === "visiting") {
      const cycleStart = path.indexOf(code);
      const cycle = [...path.slice(cycleStart), code];
      const cycleKey = Array.from(new Set(cycle)).sort().join("|");
      if (!recordedCycles.has(cycleKey)) {
        recordedCycles.add(cycleKey);
        errors.push(`${code}: circular derived-metric dependency (${cycle.join(" -> ")})`);
      }
      return;
    }

    visitState.set(code, "visiting");
    path.push(code);
    for (const dependency of dependenciesByDerivedCode.get(code) ?? []) {
      if (dependenciesByDerivedCode.has(dependency)) visit(dependency);
    }
    path.pop();
    visitState.set(code, "visited");
  };

  for (const code of Array.from(dependenciesByDerivedCode.keys()).sort()) visit(code);
  return errors;
}
