import { metricAliasDisplayName, metricAliasKey, orderMetricAliasCandidates } from "@shared/metric-aliases";
import { hasMetricReportedValue, type MetricReportedValueLike } from "@shared/data-entry-metrics";

type MetricDefinitionLike = {
  id: string;
  code?: string | null;
  name: string;
  pillar: "environmental" | "social" | "governance";
  category?: string | null;
  description?: string | null;
  dataType?: string | null;
  unit?: string | null;
  inputFrequency?: string | null;
  isCore?: boolean | null;
  isActive: boolean;
  isDerived?: boolean;
  formulaJson?: Record<string, unknown> | null;
  frameworkTags?: string[] | null;
  scoringWeight?: string | null;
  evidenceRequired?: boolean | null;
  rollupMethod?: string | null;
  sortOrder?: number | null;
  metricType?: string | null;
  formulaText?: string | null;
  isDefault?: boolean | null;
};

type CompanyMetricLike = {
  id: string;
  name: string;
  category: "environmental" | "social" | "governance";
  description?: string | null;
  unit?: string | null;
  frequency?: string | null;
  dataType?: string | null;
  enabled?: boolean | null;
  metricType?: string | null;
  direction?: string | null;
  helpText?: string | null;
  formulaText?: string | null;
  isDefault?: boolean | null;
};

export type MetricLibraryEntry = MetricDefinitionLike & {
  companyMetricId?: string;
  isSyntheticCustom?: boolean;
  aliasMetricIds?: string[];
  aliasDefinitionIds?: string[];
  aliasNames?: string[];
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
  dataType?: string | null;
  frequency?: string | null;
  metricType: string;
  direction?: string | null;
  helpText?: string | null;
  formulaText?: string | null;
  evidenceRequired: boolean;
  missingCompanyMetric: boolean;
  source: "definition" | "company" | "merged";
  aliasMetricIds?: string[];
  historicalAliasMetricIds?: string[];
  aliasDefinitionIds?: string[];
  aliasNames?: string[];
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
  const library = definition as MetricLibraryEntry;
  return {
    canonicalId: metricAliasKey(definition) ?? normalizeMetricActivationName(definition.name),
    key: `definition:${definition.id}`,
    definitionId: definition.id,
    name: definition.name,
    category: definition.pillar,
    description: definition.description ?? null,
    unit: definition.unit ?? null,
    dataType: definition.dataType ?? "numeric",
    frequency: definition.inputFrequency ?? "monthly",
    metricType: definition.metricType
      ?? (definition.isDerived ? "derived" : (definition.formulaJson ? "calculated" : "manual")),
    direction: "higher_is_better",
    helpText: definition.description ?? null,
    formulaText: definition.formulaText ?? null,
    evidenceRequired: Boolean(definition.evidenceRequired),
    missingCompanyMetric: true,
    source: "definition",
    aliasMetricIds: library.aliasMetricIds,
    aliasDefinitionIds: library.aliasDefinitionIds,
    aliasNames: library.aliasNames,
  };
}

function buildCompanyCandidate(metric: CompanyMetricLike): CanonicalEnabledMetric {
  return {
    canonicalId: metricAliasKey(metric) ?? normalizeMetricActivationName(metric.name),
    key: metric.id,
    id: metric.id,
    name: metricAliasKey(metric) ? metricAliasDisplayName(metric.name) : metric.name,
    category: metric.category,
    description: metric.description ?? null,
    unit: metric.unit ?? null,
    dataType: metric.dataType ?? null,
    // Keep an absent company cadence unset so a matched catalogue definition
    // can remain authoritative. Synthetic company-only metrics receive their
    // monthly fallback through the library candidate.
    frequency: metric.frequency ?? null,
    metricType: metric.metricType ?? "manual",
    direction: metric.direction ?? "higher_is_better",
    helpText: metric.helpText ?? null,
    formulaText: metric.formulaText ?? null,
    evidenceRequired: false,
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
    dataType: base.dataType ?? extra.dataType ?? "numeric",
    frequency: base.frequency ?? extra.frequency ?? "monthly",
    metricType: base.metricType ?? extra.metricType ?? "manual",
    direction: base.direction ?? extra.direction ?? "higher_is_better",
    helpText: base.helpText ?? extra.helpText ?? null,
    formulaText: base.formulaText ?? extra.formulaText ?? null,
    evidenceRequired: base.evidenceRequired || extra.evidenceRequired,
    missingCompanyMetric: base.missingCompanyMetric && extra.missingCompanyMetric,
    source: existing.source === incoming.source ? existing.source : "merged",
    aliasMetricIds: base.aliasMetricIds ?? extra.aliasMetricIds,
    aliasDefinitionIds: base.aliasDefinitionIds ?? extra.aliasDefinitionIds,
    aliasNames: base.aliasNames ?? extra.aliasNames,
  };
}

function buildSyntheticLibraryMetric(metric: CompanyMetricLike): MetricLibraryEntry {
  return {
    id: `custom:${metric.id}`,
    code: `custom:${metric.id}`,
    name: metric.name,
    pillar: metric.category,
    category: "Custom",
    description: metric.description ?? metric.helpText ?? null,
    dataType: "numeric",
    unit: metric.unit ?? null,
    inputFrequency: metric.frequency ?? "monthly",
    isCore: false,
    isActive: Boolean(metric.enabled),
    isDerived: metric.metricType === "derived",
    formulaJson: metric.metricType === "calculated" || metric.metricType === "derived" ? {} : null,
    frameworkTags: null,
    scoringWeight: null,
    evidenceRequired: false,
    rollupMethod: "sum",
    sortOrder: 9999,
    metricType: metric.metricType ?? "manual",
    formulaText: metric.formulaText ?? null,
    companyMetricId: metric.id,
    isSyntheticCustom: true,
  };
}

export function buildMetricLibraryEntries(
  definitions: MetricDefinitionLike[],
  companyMetrics: CompanyMetricLike[],
): MetricLibraryEntry[] {
  const byCanonicalId = new Map<string, MetricLibraryEntry>();

  for (const definition of orderMetricAliasCandidates(definitions)) {
    const canonicalId = metricAliasKey(definition) ?? normalizeMetricActivationName(definition.name);
    if (!byCanonicalId.has(canonicalId)) {
      byCanonicalId.set(canonicalId, {
        ...definition,
        name: metricAliasKey(definition) ? metricAliasDisplayName(definition.name) : definition.name,
        ...(metricAliasKey(definition) ? { aliasDefinitionIds: [definition.id], aliasNames: [definition.name] } : {}),
      });
      continue;
    }
    const existing = byCanonicalId.get(canonicalId)!;
    byCanonicalId.set(canonicalId, {
      ...existing,
      isActive: Boolean(existing.isActive) || Boolean(definition.isActive),
      isCore: Boolean(existing.isCore) || Boolean(definition.isCore),
      isDerived: Boolean(existing.isDerived) || Boolean(definition.isDerived),
      description: existing.description ?? definition.description ?? null,
      unit: existing.unit ?? definition.unit ?? null,
      frameworkTags: existing.frameworkTags ?? definition.frameworkTags ?? null,
      evidenceRequired: Boolean(existing.evidenceRequired) || Boolean(definition.evidenceRequired),
      ...(metricAliasKey(definition) ? {
        aliasDefinitionIds: [...(existing.aliasDefinitionIds ?? []), definition.id],
        aliasNames: Array.from(new Set([...(existing.aliasNames ?? []), definition.name])),
      } : {}),
    });
  }

  for (const metric of orderMetricAliasCandidates(companyMetrics)) {
    const canonicalId = metricAliasKey(metric) ?? normalizeMetricActivationName(metric.name);
    if (byCanonicalId.has(canonicalId)) {
      const existing = byCanonicalId.get(canonicalId)!;
      if (metricAliasKey(metric) && existing.companyMetricId) {
        byCanonicalId.set(canonicalId, {
          ...existing,
          isActive: existing.isActive || Boolean(metric.enabled),
          aliasMetricIds: [...(existing.aliasMetricIds ?? [existing.companyMetricId]), metric.id],
          aliasNames: Array.from(new Set([...(existing.aliasNames ?? []), metric.name])),
        });
        continue;
      }
      const metricType = metric.metricType ?? existing.metricType ?? "manual";
      const isCalculated = metricType === "calculated" || metricType === "derived";
      byCanonicalId.set(canonicalId, {
        ...existing,
        isActive: Boolean(metric.enabled),
        inputFrequency: metric.frequency ?? existing.inputFrequency ?? "monthly",
        isDerived: Boolean(existing.isDerived) || metricType === "derived",
        formulaJson: existing.formulaJson ?? (isCalculated ? {} : null),
        metricType,
        formulaText: metric.formulaText ?? existing.formulaText ?? null,
        companyMetricId: metric.id,
        ...(metricAliasKey(metric) ? {
          aliasMetricIds: [metric.id],
          aliasNames: Array.from(new Set([...(existing.aliasNames ?? []), metric.name])),
        } : {}),
      });
      continue;
    }
    byCanonicalId.set(canonicalId, {
      ...buildSyntheticLibraryMetric(metric),
      name: metricAliasKey(metric) ? metricAliasDisplayName(metric.name) : metric.name,
      ...(metricAliasKey(metric) ? { aliasMetricIds: [metric.id], aliasNames: [metric.name] } : {}),
    });
  }

  return Array.from(byCanonicalId.values()).sort((a, b) => {
    if (a.pillar !== b.pillar) return a.pillar.localeCompare(b.pillar);
    return a.name.localeCompare(b.name);
  });
}

export function buildCanonicalEnabledMetrics(
  definitions: MetricDefinitionLike[],
  companyMetrics: CompanyMetricLike[],
): CanonicalEnabledMetric[] {
  const byCanonicalId = new Map<string, CanonicalEnabledMetric>();

  const libraryEntries = buildMetricLibraryEntries(definitions, companyMetrics);

  for (const definition of libraryEntries.filter((item) => item.isActive)) {
    const candidate = buildDefinitionCandidate(definition);
    byCanonicalId.set(candidate.canonicalId, mergeCandidates(byCanonicalId.get(candidate.canonicalId), candidate));
  }

  for (const metric of orderMetricAliasCandidates(companyMetrics.filter((item) => Boolean(item.enabled)))) {
    const candidate = buildCompanyCandidate(metric);
    if (!byCanonicalId.has(candidate.canonicalId)) continue;
    byCanonicalId.set(candidate.canonicalId, mergeCandidates(byCanonicalId.get(candidate.canonicalId), candidate));
  }

  return Array.from(byCanonicalId.values()).map((metric) => ({
    ...metric,
    historicalAliasMetricIds: metric.aliasMetricIds,
    aliasMetricIds: metric.aliasMetricIds?.filter((id) => companyMetrics.some((item) => item.id === id && item.enabled)),
  })).sort((a, b) => {
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
    const coverage = coverageByCanonicalId.get(normalizeMetricActivationName(metric.name));
    const aliasCoverage = metricCoverage.find((item) => metric.aliasMetricIds?.includes(item.metricId ?? "") && item.hasEvidence);
    return {
      ...metric,
      hasEvidence: metric.aliasMetricIds ? Boolean(aliasCoverage) : Boolean(coverage?.hasEvidence),
      dataSourceType: (metric.aliasMetricIds ? aliasCoverage : coverage)?.dataSourceType ?? null,
    };
  });
}

/** Use an existing legacy value when the primary row is empty; edits keep its original ID. */
export function resolveCanonicalMetricValueSource<T extends MetricReportedValueLike & { metricId: string }>(
  metric: CanonicalEnabledMetric,
  values: readonly T[],
  inScope: (value: T) => boolean,
  requestedMetricId?: string | null,
): CanonicalEnabledMetric {
  const ids = metric.aliasMetricIds;
  if (!ids?.length) return metric;
  const sourceId = requestedMetricId && ids.includes(requestedMetricId)
    ? requestedMetricId
    : ids.find((id) => values.some((value) => value.metricId === id && inScope(value) && hasMetricReportedValue(value))) ?? metric.id;
  return sourceId ? { ...metric, id: sourceId, key: sourceId } : metric;
}
