export type DataEntryMetricLike = {
  enabled?: boolean | null;
  metricType?: string | null;
};

export type MetricDataType = "numeric" | "text" | "boolean" | "json";

export function isEditableDataEntryMetricType(metricType: string | null | undefined): boolean {
  return !metricType || metricType === "manual";
}

export function isActiveEditableDataEntryMetric(metric: DataEntryMetricLike): boolean {
  return Boolean(metric.enabled) && isEditableDataEntryMetricType(metric.metricType);
}

export function isBooleanMetricDataType(dataType: string | null | undefined): boolean {
  return dataType === "boolean";
}

export function parseBooleanMetricInput(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "") return null;
  if (["yes", "true"].includes(normalized)) return true;
  if (["no", "false"].includes(normalized)) return false;
  return null;
}

export function formatBooleanMetricValue(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

export function formatMetricDisplayValue(value: {
  value?: unknown;
  valueText?: string | null;
  valueBoolean?: boolean | null;
} | null | undefined): string {
  if (!value) return "";
  if (typeof value.valueText === "string" && value.valueText.trim() !== "") return value.valueText;
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) return formatBooleanMetricValue(value.valueBoolean);
  if (value.value === null || value.value === undefined || value.value === "") return "";
  return String(value.value);
}
