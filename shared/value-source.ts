export type ValueSourceClass = "measured" | "derived" | "estimated" | "missing";

// Retained for compatibility with estimation and dashboard consumers while
// ValueSourceClass provides the richer measured/derived distinction.
export type EstimateConfidence = "high" | "medium" | "low";
export type DashboardActionStatus = "todo" | "available" | "done" | "blocked";

export type ValueSourceInput = {
  value?: unknown;
  valueNumeric?: unknown;
  valueText?: unknown;
  valueBoolean?: unknown;
  valueJson?: unknown;
  dataSourceType?: string | null;
  sourceType?: string | null;
  metricType?: string | null;
  isDerived?: boolean | null;
};

export function hasReportedValue(input: ValueSourceInput): boolean {
  if (input.valueBoolean !== null && input.valueBoolean !== undefined) return true;
  if (input.valueNumeric !== null && input.valueNumeric !== undefined && String(input.valueNumeric).trim() !== "") return true;
  if (input.valueText !== null && input.valueText !== undefined && String(input.valueText).trim() !== "") return true;
  if (input.valueJson !== null && input.valueJson !== undefined) return true;
  return input.value !== null && input.value !== undefined && String(input.value).trim() !== "";
}

export function classifyValueSource(input: ValueSourceInput): ValueSourceClass {
  if (!hasReportedValue(input)) return "missing";

  const source = (input.sourceType || input.dataSourceType || "").toLowerCase();
  const metricType = (input.metricType || "").toLowerCase();
  if (input.isDerived || source === "calculated" || source === "derived" || metricType === "calculated" || metricType === "derived") {
    return "derived";
  }
  if (source === "estimated" || source === "proxy") return "estimated";
  return "measured";
}

export function valueSourceLabel(input: ValueSourceInput): "Measured" | "Derived" | "Estimated" | "Missing" {
  const classification = classifyValueSource(input);
  return classification.charAt(0).toUpperCase() + classification.slice(1) as "Measured" | "Derived" | "Estimated" | "Missing";
}
