export type MetricCadence = "monthly" | "quarterly" | "annual" | "one_off";

export function normalizeMetricCadence(value: unknown): MetricCadence | null {
  if (value === null || value === undefined || value === "") return "monthly";
  const normalized = String(value).trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["monthly", "quarterly", "annual"].includes(normalized)) return normalized as MetricCadence;
  if (["one_off", "oneoff", "once"].includes(normalized)) return "one_off";
  return null;
}

export function isMetricDueInMonth(frequency: unknown): boolean {
  const cadence = normalizeMetricCadence(frequency);
  return cadence === null || cadence === "monthly" || cadence === "one_off";
}
