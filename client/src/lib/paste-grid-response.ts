import { hasMetricReportedValue } from "@shared/data-entry-metrics";
import { groupMetricAliases, metricAliasDisplayName, metricAliasKey } from "@shared/metric-aliases";

export type GridMetric = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  metricType: string | null;
  dataType: string;
  enabled: boolean;
  readOnly: boolean;
  frequency?: string | null;
  isDefault?: boolean | null;
  legacyReviewRequired?: boolean;
};

export type GridValue = {
  id: string;
  metricId: string;
  period: string;
  value: string | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  locked: boolean;
  dataSourceType: string | null;
  workflowStatus: string | null;
  siteId: string | null;
};

export type GridResponse = {
  periods: string[];
  metrics: GridMetric[];
  values: GridValue[];
  lockedPeriods: string[];
};

/**
 * Show each waste concept once, without ever rebinding a value to a different
 * editable metric ID. Mixed legacy histories require the explicit record view
 * before editing; their source IDs, locks and evidence protections stay intact.
 */
export function canonicalPasteGrid(data: GridResponse): GridResponse {
  const periods = data.periods.slice().sort().reverse();
  return {
    ...data,
    metrics: groupMetricAliases(data.metrics).map((group) => {
      if (group.length < 2 || !metricAliasKey(group[0])) return group[0];
      const idsWithValues = new Set(data.values
        .filter((value) => group.some((metric) => metric.id === value.metricId) && hasMetricReportedValue(value))
        .map((value) => value.metricId));
      const source = periods.flatMap((period) => group.filter((metric) => data.values.some((value) => (
        value.metricId === metric.id && value.period === period && hasMetricReportedValue(value)
      ))))[0] ?? group[0];
      return {
        ...source,
        name: metricAliasDisplayName(source.name),
        readOnly: source.readOnly || idsWithValues.size > 1,
        legacyReviewRequired: idsWithValues.size > 1,
      };
    }),
  };
}

export function isGridResponse(value: unknown): value is GridResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GridResponse>;
  return Array.isArray(candidate.periods)
    && Array.isArray(candidate.metrics)
    && Array.isArray(candidate.values)
    && Array.isArray(candidate.lockedPeriods);
}

export async function parseBulkGridResponse(res: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}): Promise<GridResponse> {
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = typeof (body as { error?: unknown } | null)?.error === "string"
      ? (body as { error: string }).error
      : `Paste grid failed to load (${res.status})`;
    throw new Error(message);
  }

  if (!isGridResponse(body)) {
    throw new Error("Paste grid returned an unexpected response shape.");
  }

  return body;
}

export function resolvePasteGridState(params: {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
  error?: Error | null;
}) {
  const gridData = isGridResponse(params.data) ? params.data : null;
  if (params.isLoading) {
    return { kind: "loading" as const, gridData: null, errorMessage: null };
  }
  if (params.isError || !gridData) {
    return {
      kind: "error" as const,
      gridData: null,
      errorMessage: params.error?.message || "The server returned an unexpected response.",
    };
  }
  return { kind: "ready" as const, gridData, errorMessage: null };
}
