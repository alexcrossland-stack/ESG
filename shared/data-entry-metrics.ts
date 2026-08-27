export type DataEntryMetricLike = {
  enabled?: boolean | null;
  metricType?: string | null;
  unit?: string | null;
  direction?: string | null;
};

export type MetricDataType = "numeric" | "text" | "boolean" | "json";

export type MetricReportedValueLike = {
  value?: unknown;
  valueNumeric?: unknown;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
};

export function isEditableDataEntryMetricType(metricType: string | null | undefined): boolean {
  return !metricType || metricType === "manual";
}

export function isActiveEditableDataEntryMetric(metric: DataEntryMetricLike): boolean {
  return Boolean(metric.enabled) && isEditableDataEntryMetricType(metric.metricType);
}

export function isBooleanMetricDataType(dataType: string | null | undefined): boolean {
  return dataType === "boolean";
}

export function resolveMetricDataType(
  metric: Pick<DataEntryMetricLike, "unit" | "direction">,
  catalogueDataType?: string | null,
): MetricDataType {
  if (catalogueDataType === "boolean" || catalogueDataType === "text" || catalogueDataType === "json") {
    return catalogueDataType;
  }
  const normalizedUnit = (metric.unit ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (
    metric.direction === "compliance_yes_no"
    || normalizedUnit === "yes/no"
    || normalizedUnit === "yes-no"
    || normalizedUnit === "boolean"
  ) {
    return "boolean";
  }
  return "numeric";
}

export function parseBooleanMetricInput(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "") return null;
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

export function formatBooleanMetricValue(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

export function hasMetricReportedValue(value: MetricReportedValueLike | null | undefined): boolean {
  if (!value) return false;
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) return true;
  if (typeof value.valueText === "string" && value.valueText.trim() !== "") return true;
  if (value.valueJson !== null && value.valueJson !== undefined) return true;
  const numericOrLegacyValue = value.valueNumeric ?? value.value;
  return numericOrLegacyValue !== null
    && numericOrLegacyValue !== undefined
    && String(numericOrLegacyValue).trim() !== "";
}

function formatNumericDisplayValue(value: unknown): string {
  const raw = String(value);
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return raw;
  if (!raw.includes(".")) return raw;
  return raw.replace(/0+$/, "").replace(/\.$/, "");
}

export function formatMetricDisplayValue(value: MetricReportedValueLike | null | undefined): string {
  if (!value) return "";
  if (typeof value.valueText === "string" && value.valueText.trim() !== "") return value.valueText;
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) return formatBooleanMetricValue(value.valueBoolean);
  const numericOrLegacyValue = value.valueNumeric ?? value.value;
  if (numericOrLegacyValue !== null && numericOrLegacyValue !== undefined && numericOrLegacyValue !== "") {
    return formatNumericDisplayValue(numericOrLegacyValue);
  }
  if (value.valueJson !== null && value.valueJson !== undefined) {
    return typeof value.valueJson === "string" ? value.valueJson : JSON.stringify(value.valueJson);
  }
  return "";
}
