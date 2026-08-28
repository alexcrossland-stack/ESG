import {
  calculateScope1,
  calculateScope2,
  type EmissionFactorMap,
} from "./calculations";

type JsonRecord = Record<string, unknown>;

export type NormalizedMetricFormula =
  | {
      type: "expression";
      sources: string[];
      expression: string;
      description?: string;
    }
  | {
      type: "sum";
      sources: string[];
      description?: string;
    }
  | {
      type: "ratio";
      numerator: string[];
      denominator: string;
      scale: number;
      description?: string;
    }
  | {
      type: "custom";
      customFn: "scope1_emissions" | "scope2_emissions";
      inputs: string[];
      description?: string;
    };

export type MetricFormulaNormalizationResult =
  | { status: "valid"; formula: NormalizedMetricFormula }
  | { status: "invalid"; error: string };

export type MetricFormulaEvaluationResult =
  | { status: "value"; value: number }
  | { status: "unavailable"; reason: string }
  | { status: "invalid"; error: string };

export interface MetricFormulaEvaluationContext {
  emissionFactors?: EmissionFactorMap;
}

type ExpressionToken =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" }
  | { kind: "leftParen" }
  | { kind: "rightParen" };

type ParsedExpression =
  | { ok: true; value: number; identifiers: Set<string> }
  | { ok: false; error: string };

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalDescription(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value.trim();
}

function parseMetricCode(value: unknown, field: string): string | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${field} must be a non-empty metric code` };
  }
  if (value.trim().length > 128) return { error: `${field} exceeds 128 characters` };
  return value.trim();
}

function parseMetricCodeList(value: unknown, field: string): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: `${field} must be a non-empty array of metric codes` };
  }
  const parsed: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const code = parseMetricCode(value[index], `${field}[${index}]`);
    if (typeof code !== "string") return code;
    parsed.push(code);
  }
  if (new Set(parsed).size !== parsed.length) {
    return { error: `${field} must not contain duplicate metric codes` };
  }
  return parsed;
}

function unknownFieldError(record: JsonRecord, allowed: readonly string[]): string | null {
  const allowedFields = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !allowedFields.has(key));
  return unknown.length > 0 ? `unsupported formula field(s): ${unknown.join(", ")}` : null;
}

function tokenizeExpression(expression: string): ExpressionToken[] | { error: string } {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const character = expression[index];
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    if (character === "(" || character === ")") {
      tokens.push(character === "(" ? { kind: "leftParen" } : { kind: "rightParen" });
      index++;
      continue;
    }
    if (character === "+" || character === "-" || character === "*" || character === "/") {
      tokens.push({ kind: "operator", value: character });
      index++;
      continue;
    }
    if (/[0-9.]/.test(character)) {
      const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) return { error: `invalid numeric literal at character ${index + 1}` };
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return { error: `non-finite numeric literal at character ${index + 1}` };
      tokens.push({ kind: "number", value });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      tokens.push({ kind: "identifier", value: match[0] });
      index += match[0].length;
      continue;
    }
    return { error: `unsupported expression character at position ${index + 1}` };
  }
  if (tokens.length === 0) return { error: "expression must not be empty" };
  return tokens;
}

function parseExpression(
  expression: string,
  context: Record<string, number>,
  validateOnly = false,
): ParsedExpression {
  const tokenized = tokenizeExpression(expression);
  if (!Array.isArray(tokenized)) return { ok: false, error: tokenized.error };

  let index = 0;
  const identifiers = new Set<string>();

  const parseFactor = (): ParsedExpression => {
    const token = tokenized[index];
    if (!token) return { ok: false, error: "expression ends before an operand" };

    if (token.kind === "operator" && (token.value === "+" || token.value === "-")) {
      index++;
      const operand = parseFactor();
      if (!operand.ok) return operand;
      return {
        ok: true,
        value: token.value === "-" ? -operand.value : operand.value,
        identifiers: operand.identifiers,
      };
    }
    if (token.kind === "number") {
      index++;
      return { ok: true, value: token.value, identifiers: new Set() };
    }
    if (token.kind === "identifier") {
      index++;
      identifiers.add(token.value);
      if (!Object.prototype.hasOwnProperty.call(context, token.value)) {
        return { ok: false, error: `expression references undeclared source ${token.value}` };
      }
      const value = context[token.value];
      if (!Number.isFinite(value)) {
        return { ok: false, error: `source ${token.value} is not a finite number` };
      }
      return { ok: true, value, identifiers: new Set([token.value]) };
    }
    if (token.kind === "leftParen") {
      index++;
      const nested = parseAdditive();
      if (!nested.ok) return nested;
      if (tokenized[index]?.kind !== "rightParen") {
        return { ok: false, error: "expression has an unmatched opening parenthesis" };
      }
      index++;
      return nested;
    }
    return { ok: false, error: "expression contains an unexpected token where an operand was required" };
  };

  const parseMultiplicative = (): ParsedExpression => {
    let left = parseFactor();
    if (!left.ok) return left;
    while (true) {
      const nextToken = tokenized[index];
      if (
        nextToken?.kind !== "operator"
        || (nextToken.value !== "*" && nextToken.value !== "/")
      ) break;
      const operator = nextToken;
      index++;
      const right = parseFactor();
      if (!right.ok) return right;
      if (operator.value === "/" && right.value === 0) {
        if (right.identifiers.size === 0) {
          return { ok: false, error: "expression has a constant zero denominator" };
        }
        if (validateOnly) {
          left = {
            ok: true,
            value: 0,
            identifiers: mergeStringSets(left.identifiers, right.identifiers),
          };
          continue;
        }
        // Unlike a structured ratio, an arbitrary expression cannot reliably
        // distinguish a data-dependent zero from an algebraically constant
        // zero such as B - B. Fail closed as an evaluation/configuration error
        // so no equivalent zero-denominator expression can clear a fact.
        return { ok: false, error: "expression denominator is zero" };
      }
      const value: number = operator.value === "*" ? left.value * right.value : left.value / right.value;
      if (!Number.isFinite(value)) return { ok: false, error: "expression result is not finite" };
      left = {
        ok: true,
        value,
        identifiers: mergeStringSets(left.identifiers, right.identifiers),
      };
    }
    return left;
  };

  const parseAdditive = (): ParsedExpression => {
    let left = parseMultiplicative();
    if (!left.ok) return left;
    while (true) {
      const nextToken = tokenized[index];
      if (
        nextToken?.kind !== "operator"
        || (nextToken.value !== "+" && nextToken.value !== "-")
      ) break;
      const operator = nextToken;
      index++;
      const right = parseMultiplicative();
      if (!right.ok) return right;
      const value: number = operator.value === "+" ? left.value + right.value : left.value - right.value;
      if (!Number.isFinite(value)) return { ok: false, error: "expression result is not finite" };
      left = {
        ok: true,
        value,
        identifiers: mergeStringSets(left.identifiers, right.identifiers),
      };
    }
    return left;
  };

  const result = parseAdditive();
  if (!result.ok) return result;
  if (index !== tokenized.length) {
    return { ok: false, error: "expression contains trailing or unmatched tokens" };
  }
  return { ...result, identifiers };
}

function sameStringSet(left: readonly string[], right: ReadonlySet<string>): boolean {
  return left.length === right.size && left.every((value) => right.has(value));
}

function mergeStringSets(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  const merged = new Set<string>();
  left.forEach((value) => merged.add(value));
  right.forEach((value) => merged.add(value));
  return merged;
}

export function normalizeMetricFormula(value: unknown): MetricFormulaNormalizationResult {
  if (!isJsonRecord(value)) {
    return { status: "invalid", error: "formulaJson must be an object" };
  }
  if (typeof value.type !== "string") {
    return { status: "invalid", error: "formula type must be a string" };
  }
  const description = optionalDescription(value.description);

  if (value.type === "expression") {
    const unknown = unknownFieldError(value, ["type", "sources", "expression", "description"]);
    if (unknown) return { status: "invalid", error: unknown };
    const sources = parseMetricCodeList(value.sources, "sources");
    if (!Array.isArray(sources)) return { status: "invalid", error: sources.error };
    if (typeof value.expression !== "string" || value.expression.trim().length === 0) {
      return { status: "invalid", error: "expression must be a non-empty string" };
    }
    const validationContext = Object.fromEntries(sources.map((source) => [source, 1]));
    const parsed = parseExpression(value.expression, validationContext, true);
    if (!parsed.ok) return { status: "invalid", error: parsed.error };
    if (!sameStringSet(sources, parsed.identifiers)) {
      return {
        status: "invalid",
        error: "expression sources must exactly match the metric codes referenced by the expression",
      };
    }
    return {
      status: "valid",
      formula: {
        type: "expression",
        sources,
        expression: value.expression.trim(),
        ...(description ? { description } : {}),
      },
    };
  }

  if (value.type === "sum") {
    const unknown = unknownFieldError(value, ["type", "inputs", "sources", "description"]);
    if (unknown) return { status: "invalid", error: unknown };
    if (value.inputs !== undefined && value.sources !== undefined) {
      return { status: "invalid", error: "sum formula must use either inputs or sources, not both" };
    }
    const sources = parseMetricCodeList(value.inputs ?? value.sources, value.inputs !== undefined ? "inputs" : "sources");
    if (!Array.isArray(sources)) return { status: "invalid", error: sources.error };
    return {
      status: "valid",
      formula: { type: "sum", sources, ...(description ? { description } : {}) },
    };
  }

  if (value.type === "ratio") {
    const unknown = unknownFieldError(value, [
      "type", "numerator", "denominator", "scale", "multiplier", "description",
    ]);
    if (unknown) return { status: "invalid", error: unknown };
    const numerator = typeof value.numerator === "string"
      ? parseMetricCodeList([value.numerator], "numerator")
      : parseMetricCodeList(value.numerator, "numerator");
    if (!Array.isArray(numerator)) return { status: "invalid", error: numerator.error };
    const denominator = parseMetricCode(value.denominator, "denominator");
    if (typeof denominator !== "string") return { status: "invalid", error: denominator.error };
    const scaleValue = value.scale;
    const multiplierValue = value.multiplier;
    if (scaleValue !== undefined && (typeof scaleValue !== "number" || !Number.isFinite(scaleValue))) {
      return { status: "invalid", error: "scale must be a finite number" };
    }
    if (multiplierValue !== undefined && (typeof multiplierValue !== "number" || !Number.isFinite(multiplierValue))) {
      return { status: "invalid", error: "multiplier must be a finite number" };
    }
    if (scaleValue !== undefined && multiplierValue !== undefined && scaleValue !== multiplierValue) {
      return { status: "invalid", error: "scale and multiplier must not conflict" };
    }
    const scale = (scaleValue ?? multiplierValue ?? 1) as number;
    return {
      status: "valid",
      formula: {
        type: "ratio",
        numerator,
        denominator,
        scale,
        ...(description ? { description } : {}),
      },
    };
  }

  if (value.type === "custom") {
    const unknown = unknownFieldError(value, ["type", "customFn", "inputs", "description"]);
    if (unknown) return { status: "invalid", error: unknown };
    if (value.customFn !== "scope1_emissions" && value.customFn !== "scope2_emissions") {
      return { status: "invalid", error: `unsupported custom formula ${String(value.customFn)}` };
    }
    const inputs = parseMetricCodeList(value.inputs, "inputs");
    if (!Array.isArray(inputs)) return { status: "invalid", error: inputs.error };
    const expectedInputCount = value.customFn === "scope1_emissions" ? 2 : 1;
    if (inputs.length !== expectedInputCount) {
      return {
        status: "invalid",
        error: `${value.customFn} requires exactly ${expectedInputCount} input metric code(s)`,
      };
    }
    return {
      status: "valid",
      formula: {
        type: "custom",
        customFn: value.customFn,
        inputs,
        ...(description ? { description } : {}),
      },
    };
  }

  return { status: "invalid", error: `unsupported formula type ${value.type}` };
}

export function metricFormulaDependencies(formula: NormalizedMetricFormula): string[] {
  switch (formula.type) {
    case "expression": return [...formula.sources];
    case "sum": return [...formula.sources];
    case "ratio": return Array.from(new Set([...formula.numerator, formula.denominator]));
    case "custom": return [...formula.inputs];
  }
}

export function metricFormulaDependencyError(
  formula: NormalizedMetricFormula,
  activeNumericMetricCodes: ReadonlySet<string>,
): string | null {
  const missing = metricFormulaDependencies(formula).filter((code) => !activeNumericMetricCodes.has(code));
  return missing.length > 0
    ? `formula references missing, inactive, or non-numeric metric code(s): ${missing.join(", ")}`
    : null;
}

function requiredSourceValues(
  dependencies: readonly string[],
  sourceValues: Record<string, number | null | undefined>,
): { status: "available"; values: number[] } | MetricFormulaEvaluationResult {
  const values: number[] = [];
  for (const dependency of dependencies) {
    const value = sourceValues[dependency];
    if (value === null || value === undefined) {
      return { status: "unavailable", reason: `source value ${dependency} is missing` };
    }
    if (!Number.isFinite(value)) {
      return { status: "invalid", error: `source value ${dependency} is not a finite number` };
    }
    values.push(value);
  }
  return { status: "available", values };
}

export function evaluateMetricFormula(
  formula: NormalizedMetricFormula,
  sourceValues: Record<string, number | null | undefined>,
  context: MetricFormulaEvaluationContext = {},
): MetricFormulaEvaluationResult {
  if (formula.type === "expression") {
    const required = requiredSourceValues(formula.sources, sourceValues);
    if (required.status !== "available") return required;
    const parsed = parseExpression(
      formula.expression,
      Object.fromEntries(formula.sources.map((source, index) => [source, required.values[index]])),
    );
    if (!parsed.ok) {
      return { status: "invalid", error: parsed.error };
    }
    return { status: "value", value: parsed.value };
  }

  if (formula.type === "sum") {
    const required = requiredSourceValues(formula.sources, sourceValues);
    if (required.status !== "available") return required;
    const value = required.values.reduce((total, item) => total + item, 0);
    return Number.isFinite(value)
      ? { status: "value", value }
      : { status: "invalid", error: "sum result is not finite" };
  }

  if (formula.type === "ratio") {
    const dependencies = [...formula.numerator, formula.denominator];
    const required = requiredSourceValues(dependencies, sourceValues);
    if (required.status !== "available") return required;
    const denominator = required.values.at(-1)!;
    if (denominator === 0) {
      return { status: "unavailable", reason: `denominator ${formula.denominator} is zero` };
    }
    const numerator = required.values.slice(0, -1).reduce((total, item) => total + item, 0);
    const value = (numerator / denominator) * formula.scale;
    return Number.isFinite(value)
      ? { status: "value", value }
      : { status: "invalid", error: "ratio result is not finite" };
  }

  const required = requiredSourceValues(formula.inputs, sourceValues);
  if (required.status !== "available") return required;
  if (!context.emissionFactors) {
    return { status: "invalid", error: `${formula.customFn} requires configured emission factors` };
  }
  try {
    const value = formula.customFn === "scope1_emissions"
      ? calculateScope1(required.values[0], required.values[1], context.emissionFactors)
      : calculateScope2(required.values[0], context.emissionFactors);
    return Number.isFinite(value)
      ? { status: "value", value }
      : { status: "invalid", error: `${formula.customFn} produced a non-finite result` };
  } catch (error: unknown) {
    return {
      status: "invalid",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
