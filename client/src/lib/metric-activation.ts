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

type EvidenceCoverageLike = {
  metricId?: string | null;
  metricName?: string | null;
  category?: "environmental" | "social" | "governance" | null;
  hasEvidence?: boolean | null;
  dataSourceType?: string | null;
};

export type CanonicalEnabledMetric = {
  canonicalId: string;
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
  source: "definition" | "company" | "merged";
};

export type CanonicalEvidenceMetric = CanonicalEnabledMetric & {
  hasEvidence: boolean;
  dataSourceType?: string | null;
};

export function normalizeMetricActivationName(name: string | null | undefined): string {
  const normalized = (name ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    "natural gas consumption": "gas / fuel consumption",
  };
  return aliases[normalized] ?? normalized;
}

function buildDefinitionCandidate(definition: MetricDefinitionLike): CanonicalEnabledMetric {
  return {
    canonicalId: normalizeMetricActivationName(definition.name),
    key: `definition:${definition.id}`,
    definitionId: definition.id,
    name: definition.name,
    category: definition.pillar,
    description: definition.description ?? null,
    unit: definition.unit ?? null,
    metricType: definition.isDerived ? "derived" : (definition.formulaJson ? "calculated" : "manual"),
    direction: "higher_is_better",
    helpText: definition.description ?? null,
    formulaText: null,
    missingCompanyMetric: true,
    source: "definition",
  };
}

function buildCompanyCandidate(metric: CompanyMetricLike): CanonicalEnabledMetric {
  return {
    canonicalId: normalizeMetricActivationName(metric.name),
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
    source: "company",
  };
}

function mergeCandidates(
  existing: CanonicalEnabledMetric | undefined,
  incoming: CanonicalEnabledMetric,
): CanonicalEnabledMetric {
  if (!existing) return incoming;

  const preferCompany = !incoming.missingCompanyMetric && existing.missingCompanyMetric;
  const base = preferCompany ? incoming : existing;
  const extra = preferCompany ? existing : incoming;

  return {
    ...base,
    definitionId: base.definitionId ?? extra.definitionId,
    id: base.id ?? extra.id,
    key: base.id ?? extra.id ?? base.key ?? extra.key,
    name: base.name || extra.name,
    category: base.category || extra.category,
    description: base.description ?? extra.description ?? null,
    unit: base.unit ?? extra.unit ?? null,
    metricType: base.metricType ?? extra.metricType ?? "manual",
    direction: base.direction ?? extra.direction ?? "higher_is_better",
    helpText: base.helpText ?? extra.helpText ?? null,
    formulaText: base.formulaText ?? extra.formulaText ?? null,
    missingCompanyMetric: base.missingCompanyMetric && extra.missingCompanyMetric,
    source: existing.source === incoming.source ? existing.source : "merged",
  };
}

export function buildCanonicalEnabledMetrics(
  definitions: MetricDefinitionLike[],
  companyMetrics: CompanyMetricLike[],
): CanonicalEnabledMetric[] {
  const byCanonicalId = new Map<string, CanonicalEnabledMetric>();

  for (const definition of definitions.filter((item) => item.isActive)) {
    const candidate = buildDefinitionCandidate(definition);
    byCanonicalId.set(candidate.canonicalId, mergeCandidates(byCanonicalId.get(candidate.canonicalId), candidate));
  }

  for (const metric of companyMetrics.filter((item) => Boolean(item.enabled))) {
    const candidate = buildCompanyCandidate(metric);
    byCanonicalId.set(candidate.canonicalId, mergeCandidates(byCanonicalId.get(candidate.canonicalId), candidate));
  }

  return [...byCanonicalId.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}

export function buildCanonicalEvidenceMetrics(
  canonicalMetrics: CanonicalEnabledMetric[],
  metricCoverage: EvidenceCoverageLike[],
): CanonicalEvidenceMetric[] {
  const coverageByCanonicalId = new Map<string, EvidenceCoverageLike>();

  for (const metric of metricCoverage) {
    const canonicalId = normalizeMetricActivationName(metric.metricName);
    const existing = coverageByCanonicalId.get(canonicalId);
    const next = existing
      ? {
          ...existing,
          hasEvidence: Boolean(existing.hasEvidence) || Boolean(metric.hasEvidence),
          dataSourceType: existing.dataSourceType ?? metric.dataSourceType ?? null,
        }
      : metric;
    coverageByCanonicalId.set(canonicalId, next);
  }

  return canonicalMetrics.map((metric) => {
    const coverage = coverageByCanonicalId.get(metric.canonicalId);
    return {
      ...metric,
      hasEvidence: Boolean(coverage?.hasEvidence),
      dataSourceType: coverage?.dataSourceType ?? null,
    };
  });
}
