import { getCategoryKey } from "@shared/categories";

/** Combine category aliases within a pillar without merging or editing records. */
export function groupMetricsByCategory<T extends { pillar: string; category?: string | null }>(metrics: readonly T[]) {
  const pillars: Record<string, Record<string, T[]>> = Object.create(null);
  for (const metric of metrics) {
    const category = getCategoryKey(metric.category);
    const groups = pillars[metric.pillar] ??= Object.create(null);
    (groups[category] ??= []).push(metric);
  }
  return pillars;
}
