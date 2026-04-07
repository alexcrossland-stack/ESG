export type GridMetric = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  metricType: string | null;
  enabled: boolean;
  readOnly: boolean;
};

export type GridValue = {
  id: string;
  metricId: string;
  period: string;
  value: string | null;
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
