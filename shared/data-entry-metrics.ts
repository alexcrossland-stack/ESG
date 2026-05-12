export type DataEntryMetricLike = {
  enabled?: boolean | null;
  metricType?: string | null;
};

export function isEditableDataEntryMetricType(metricType: string | null | undefined): boolean {
  return !metricType || metricType === "manual";
}

export function isActiveEditableDataEntryMetric(metric: DataEntryMetricLike): boolean {
  return Boolean(metric.enabled) && isEditableDataEntryMetricType(metric.metricType);
}
