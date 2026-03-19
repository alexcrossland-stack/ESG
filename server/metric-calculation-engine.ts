import { storage } from "./storage";
import type { MetricDefinition } from "@shared/schema";

export interface FormulaContext {
  values: Record<string, number | null>;
}

interface FormulaJson {
  type: "expression" | "ratio";
  sources?: string[];
  numerator?: string[];
  denominator?: string;
  expression?: string;
  scale?: number;
  description?: string;
}

// Safe arithmetic expression evaluator using Shunting-Yard algorithm.
// Only supports: numeric literals, variable names (alphanumeric/_), +, -, *, /, (, ).
// No eval(), new Function(), or dynamic code execution used.
function parseTokens(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if ("+-*/()".includes(ch)) { tokens.push(ch); i++; continue; }
    if (ch >= "0" && ch <= "9" || ch === ".") {
      let num = "";
      while (i < expr.length && (expr[i] >= "0" && expr[i] <= "9" || expr[i] === ".")) {
        num += expr[i++];
      }
      tokens.push(num);
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let name = "";
      while (i < expr.length && (
        (expr[i] >= "a" && expr[i] <= "z") ||
        (expr[i] >= "A" && expr[i] <= "Z") ||
        (expr[i] >= "0" && expr[i] <= "9") ||
        expr[i] === "_"
      )) {
        name += expr[i++];
      }
      tokens.push(name);
      continue;
    }
    return null; // Unknown character → reject
  }
  return tokens;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function evalTokens(tokens: string[], context: Record<string, number>): number | null {
  const out: number[] = [];
  const ops: string[] = [];

  function applyOp(): boolean {
    const op = ops.pop();
    if (!op) return false;
    const b = out.pop();
    const a = out.pop();
    if (a === undefined || b === undefined) return false;
    if (op === "+") out.push(a + b);
    else if (op === "-") out.push(a - b);
    else if (op === "*") out.push(a * b);
    else if (op === "/") {
      if (b === 0) return false;
      out.push(a / b);
    } else return false;
    return true;
  }

  for (const tok of tokens) {
    if (PREC[tok] !== undefined) {
      while (ops.length > 0 && ops[ops.length - 1] !== "(" && (PREC[ops[ops.length - 1]] ?? 0) >= PREC[tok]) {
        if (!applyOp()) return null;
      }
      ops.push(tok);
    } else if (tok === "(") {
      ops.push("(");
    } else if (tok === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        if (!applyOp()) return null;
      }
      ops.pop(); // remove "("
    } else {
      const num = parseFloat(tok);
      if (!isNaN(num)) {
        out.push(num);
      } else if (Object.prototype.hasOwnProperty.call(context, tok)) {
        out.push(context[tok]);
      } else {
        return null; // Unknown variable
      }
    }
  }
  while (ops.length > 0) {
    if (!applyOp()) return null;
  }
  if (out.length !== 1 || !isFinite(out[0])) return null;
  return out[0];
}

function evaluateExpression(expression: string, context: Record<string, number>): number | null {
  const tokens = parseTokens(expression);
  if (!tokens) return null;
  return evalTokens(tokens, context);
}

function resolveFormulaValue(formula: FormulaJson, sourceValues: Record<string, number | null>): number | null {
  if (formula.type === "expression") {
    if (!formula.expression || !formula.sources) return null;
    const ctx: Record<string, number> = {};
    for (const code of formula.sources) {
      const v = sourceValues[code];
      if (v === null || v === undefined) return null;
      ctx[code] = v;
    }
    return evaluateExpression(formula.expression, ctx);
  }

  if (formula.type === "ratio") {
    if (!formula.numerator || !formula.denominator) return null;
    const denomVal = sourceValues[formula.denominator];
    if (denomVal === null || denomVal === undefined || denomVal === 0) return null;

    let numeratorSum = 0;
    for (const code of formula.numerator) {
      const v = sourceValues[code];
      if (v === null || v === undefined) return null;
      numeratorSum += v;
    }

    const scale = formula.scale ?? 1;
    return (numeratorSum / denomVal) * scale;
  }

  return null;
}

function buildDependencyGraph(definitions: MetricDefinition[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const def of definitions) {
    if (!def.isDerived || !def.formulaJson) continue;
    const formula = def.formulaJson as FormulaJson;
    const deps: string[] = [];
    if (formula.sources) deps.push(...formula.sources);
    if (formula.numerator) deps.push(...formula.numerator);
    if (formula.denominator) deps.push(formula.denominator);
    graph.set(def.code, deps);
  }
  return graph;
}

function detectCycle(code: string, graph: Map<string, string[]>, visited: Set<string>, stack: Set<string>): boolean {
  if (stack.has(code)) return true;
  if (visited.has(code)) return false;
  visited.add(code);
  stack.add(code);
  const deps = graph.get(code) || [];
  for (const dep of deps) {
    if (detectCycle(dep, graph, visited, stack)) return true;
  }
  stack.delete(code);
  return false;
}

function hasCycle(code: string, graph: Map<string, string[]>): boolean {
  return detectCycle(code, graph, new Set(), new Set());
}

export async function runDerivedMetricCalculations(
  businessId: string,
  siteId: string | null,
  periodStart: Date,
  periodEnd: Date,
  triggeredByMetricValueId?: string
): Promise<void> {
  const allDefinitions = await storage.getMetricDefinitions();
  const derivedDefs = allDefinitions.filter(d => d.isDerived && d.isActive && d.formulaJson);

  if (derivedDefs.length === 0) return;

  const depGraph = buildDependencyGraph(allDefinitions);

  const existingValues = await storage.getMetricDefinitionValues(businessId, {
    siteId,
    periodStart,
    periodEnd,
  });

  const valuesByCode: Record<string, number | null> = {};
  const defById: Record<string, MetricDefinition> = {};
  for (const def of allDefinitions) defById[def.id] = def;

  for (const v of existingValues) {
    const def = defById[v.metricDefinitionId];
    if (def) {
      valuesByCode[def.code] = v.valueNumeric !== null ? parseFloat(v.valueNumeric) : null;
    }
  }

  for (const def of derivedDefs) {
    if (hasCycle(def.code, depGraph)) {
      console.warn(`[MetricEngine] Circular dependency detected for metric ${def.code}, skipping`);
      continue;
    }

    let runRecord;
    try {
      runRecord = await storage.createMetricCalculationRun({
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
      continue;
    }

    try {
      const formula = def.formulaJson as FormulaJson;
      const result = resolveFormulaValue(formula, valuesByCode);

      if (result !== null) {
        await storage.upsertMetricDefinitionValue(
          businessId,
          def.id,
          siteId,
          periodStart,
          periodEnd,
          {
            valueNumeric: String(result),
            sourceType: "calculated",
            status: "draft",
          }
        );

        valuesByCode[def.code] = result;

        await storage.updateMetricCalculationRun(runRecord.id, {
          status: "success",
          outputJson: { result },
        });
      } else {
        await storage.updateMetricCalculationRun(runRecord.id, {
          status: "skipped",
          outputJson: null,
          errorText: "One or more source values missing or zero denominator",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MetricEngine] Calculation failed for ${def.code}: ${msg}`);
      await storage.updateMetricCalculationRun(runRecord.id, {
        status: "error",
        errorText: msg,
      }).catch((updateErr: unknown) => {
        console.error(`[MetricEngine] Failed to update run record status: ${String(updateErr)}`);
      });
    }
  }

  if (siteId !== null) {
    for (const def of allDefinitions.filter(d => d.rollupMethod !== "none" && d.isActive)) {
      await storage.rollupSiteValuesToCompany(businessId, def.id, periodStart, periodEnd).catch((rollupErr: unknown) => {
        console.error(`[MetricEngine] Rollup failed for ${def.code}: ${String(rollupErr)}`);
      });
    }
  }
}

export async function triggerCalculationsForMetricValue(
  metricValueId: string,
  businessId: string,
  siteId: string | null,
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  await runDerivedMetricCalculations(businessId, siteId, periodStart, periodEnd, metricValueId);
}
