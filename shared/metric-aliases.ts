import { hasMetricReportedValue, type MetricReportedValueLike } from "./data-entry-metrics";

/**
 * Presentation-only identities for the two historical waste catalogue aliases.
 * Do not use these keys for seed reconciliation: every definition, metric,
 * value, evidence link and formula code must keep its existing database ID.
 */
const WASTE_ALIASES: Record<string, string> = {
  "waste generated": "Waste Generated",
  "total waste generated": "Waste Generated",
  "waste recycled": "Waste Recycled",
  "recycled waste": "Waste Recycled",
};

export type AliasMetricLike = {
  id: string;
  name: string;
  unit?: string | null;
  frequency?: string | null;
  inputFrequency?: string | null;
  metricType?: string | null;
  isDerived?: boolean | null;
  formulaJson?: unknown;
  dataType?: string | null;
  category?: string | null;
  pillar?: string | null;
  enabled?: boolean | null;
  isDefault?: boolean | null;
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function metricAliasDisplayName(name: string): string {
  return WASTE_ALIASES[normalize(name)] ?? name;
}

export function isWasteMetricAlias(name: string): boolean {
  return Boolean(WASTE_ALIASES[normalize(name)]);
}

/** Different units, cadences, types or pillars are not interchangeable. */
export function metricAliasKey(metric: AliasMetricLike): string | null {
  if (!isWasteMetricAlias(metric.name)) return null;
  const frequency = normalize(metric.frequency ?? metric.inputFrequency ?? "monthly");
  const type = metric.metricType ?? (metric.isDerived ? "derived" : metric.formulaJson ? "calculated" : "manual");
  // Only the audited manual numeric sources are interchangeable. A similarly
  // named calculation may have a different formula and must stay independent.
  if (normalize(type) !== "manual" || normalize(metric.dataType ?? "numeric") !== "numeric") return null;
  return [
    normalize(metricAliasDisplayName(metric.name)),
    normalize(metric.unit ?? "tonnes"),
    frequency === "yearly" || frequency === "annually" ? "annual" : frequency,
    normalize(type),
    normalize(metric.dataType ?? "numeric"),
    normalize(metric.pillar ?? metric.category ?? "environmental"),
  ].join("|");
}

/** Matches the existing guided-input preference: enabled default, canonical name, ID. */
export function compareMetricAliasCandidates(left: AliasMetricLike, right: AliasMetricLike): number {
  const enabled = Number(right.enabled !== false) - Number(left.enabled !== false);
  if (enabled) return enabled;
  const defaultDelta = Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault));
  if (defaultDelta) return defaultDelta;
  const canonical = Number(normalize(right.name) === normalize(metricAliasDisplayName(right.name)))
    - Number(normalize(left.name) === normalize(metricAliasDisplayName(left.name)));
  return canonical || left.id.localeCompare(right.id);
}

export function groupMetricAliases<T extends AliasMetricLike>(metrics: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const metric of metrics) {
    const key = metricAliasKey(metric) ?? `id:${metric.id}`;
    const group = groups.get(key) ?? [];
    group.push(metric);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => group.slice().sort(compareMetricAliasCandidates));
}

/** Preserve existing ordering/precedence outside each compatible waste group. */
export function orderMetricAliasCandidates<T extends AliasMetricLike>(metrics: readonly T[]): T[] {
  const queues = new Map(groupMetricAliases(metrics).map((group) => [metricAliasKey(group[0]), group.slice()]));
  return metrics.map((metric) => {
    const key = metricAliasKey(metric);
    return key ? queues.get(key)!.shift()! : metric;
  });
}

export function canonicalMetricAliases<T extends AliasMetricLike>(metrics: readonly T[]): T[] {
  return groupMetricAliases(metrics).map(([metric]) => (
    metricAliasKey(metric) ? { ...metric, name: metricAliasDisplayName(metric.name) } : metric
  ));
}

/**
 * Read-only projection for current completion and trends. One source value per
 * concept/period/site, never the sum of aliases. Canonical data wins; a legacy
 * value fills a gap. The original value ID stays intact for evidence/workflow.
 * This never changes report snapshots or stored history.
 */
export function projectMetricAliasValues<T extends MetricReportedValueLike & { metricId: string; period: string; siteId?: string | null }>(
  metrics: readonly AliasMetricLike[],
  values: readonly T[],
): T[] {
  const identity = new Map<string, { metricId: string; rank: number }>();
  for (const group of groupMetricAliases(metrics)) {
    group.forEach((metric, rank) => identity.set(metric.id, { metricId: group[0].id, rank }));
  }
  const selected = new Map<string, { value: T; rank: number }>();
  for (const value of values) {
    const mapped = identity.get(value.metricId);
    if (!mapped) continue;
    const key = JSON.stringify([mapped.metricId, value.period, value.siteId ?? null]);
    const previous = selected.get(key);
    if (!previous
      || (hasMetricReportedValue(value) && !hasMetricReportedValue(previous.value))
      || (hasMetricReportedValue(value) === hasMetricReportedValue(previous.value) && mapped.rank < previous.rank)) {
      selected.set(key, { value: { ...value, metricId: mapped.metricId }, rank: mapped.rank });
    }
  }
  return Array.from(selected.values()).map(({ value }) => value);
}
