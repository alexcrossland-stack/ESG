type MetricDefinitionLike = {
  id: string;
  name: string;
  pillar: "environmental" | "social" | "governance";
  description?: string | null;
  unit?: string | null;
  isActive: boolean;
  isDerived?: boolean;
  formulaJson?: Record<string, unknown> | null;
};

type CompanyMetricLike = {
  id: string;
  name: string;
  category: "environmental" | "social" | "governance";
  description?: string | null;
  unit?: string | null;
  enabled?: boolean | null;
  metricType?: string | null;
  direction?: string | null;
  helpText?: string | null;
  formulaText?: string | null;
};

export type CanonicalEnabledMetric = {
  key: string;
  id?: string;
  definitionId?: string;
  name: string;
  category: "environmental" | "social" | "governance";
  description?: string | null;
  unit?: string | null;
  metricType: string;
  direction?: string | null;
  helpText?: string | null;
  formulaText?: string | null;
  missingCompanyMetric: boolean;
};

export function normalizeMetricActivationName(name: string | null | undefined): string {
  const normalized = (name ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    "natural gas consumption": "gas / fuel consumption",
  };
  return aliases[normalized] ?? normalized;
}

export function buildCanonicalEnabledMetrics(
  definitions: MetricDefinitionLike[],
  companyMetrics: CompanyMetricLike[],
): CanonicalEnabledMetric[] {
  const enabledDefinitions = definitions.filter((definition) => definition.isActive);
  const enabledCompanyMetrics = companyMetrics.filter((metric) => Boolean(metric.enabled));

  const companyMetricByName = new Map(
    enabledCompanyMetrics.map((metric) => [normalizeMetricActivationName(metric.name), metric] as const),
  );
  const activeDefinitionNames = new Set(
    enabledDefinitions.map((definition) => normalizeMetricActivationName(definition.name)),
  );

  const definitionBackedMetrics = enabledDefinitions.map((definition) => {
    const companyMetric = companyMetricByName.get(normalizeMetricActivationName(definition.name));
    return {
      key: companyMetric?.id ?? `definition:${definition.id}`,
      id: companyMetric?.id,
      definitionId: definition.id,
      name: companyMetric?.name ?? definition.name,
      category: companyMetric?.category ?? definition.pillar,
      description: companyMetric?.description ?? definition.description ?? null,
      unit: companyMetric?.unit ?? definition.unit ?? null,
      metricType: companyMetric?.metricType ?? (definition.isDerived ? "derived" : (definition.formulaJson ? "calculated" : "manual")),
      direction: companyMetric?.direction ?? "higher_is_better",
      helpText: companyMetric?.helpText ?? definition.description ?? null,
      formulaText: companyMetric?.formulaText ?? null,
      missingCompanyMetric: !companyMetric,
    } satisfies CanonicalEnabledMetric;
  });

  const customEnabledMetrics = enabledCompanyMetrics
    .filter((metric) => !activeDefinitionNames.has(normalizeMetricActivationName(metric.name)))
    .map((metric) => ({
      key: metric.id,
      id: metric.id,
      name: metric.name,
      category: metric.category,
      description: metric.description ?? null,
      unit: metric.unit ?? null,
      metricType: metric.metricType ?? "manual",
      direction: metric.direction ?? "higher_is_better",
      helpText: metric.helpText ?? null,
      formulaText: metric.formulaText ?? null,
      missingCompanyMetric: false,
    } satisfies CanonicalEnabledMetric));

  return [...definitionBackedMetrics, ...customEnabledMetrics].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}
