import {
  hasMetricReportedValue,
  parseBooleanMetricInput,
  type MetricReportedValueLike,
} from "@shared/data-entry-metrics";

export type MetricDataWorkspaceState = "needs-data" | "needs-evidence" | "complete";

export type MetricWorkspaceStatusValue = MetricReportedValueLike & {
  status?: string | null;
};

export type MetricDataStateInput<TValue = unknown> = {
  /** The already-selected value for the active reporting period and site scope. */
  value: TValue | null | undefined;
  /** Number of evidence records linked to this metric value. */
  evidenceCount: number;
  /** Whether this metric must have usable evidence before it is complete. */
  evidenceRequired?: boolean;
  /** A rejected value still needs an update even when its previous value remains stored. */
  requiresCorrection?: boolean;
};

export type MetricDataWorkspaceSummary = {
  total: number;
  needsData: number;
  needsEvidence: number;
  complete: number;
};

/**
 * Treat zero and false as reported values while rejecting absent and
 * whitespace-only values. Callers should pass the metric's resolved value
 * rather than an unprocessed database row.
 */
export function hasMetricWorkspaceValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Classify one metric in the active period/scope. The states are ordered so
 * evidence never makes an otherwise blank metric look complete.
 */
export function classifyMetricDataState<TValue>(
  input: MetricDataStateInput<TValue>,
): MetricDataWorkspaceState {
  if (input.requiresCorrection) return "needs-data";
  if (!hasMetricWorkspaceValue(input.value)) return "needs-data";
  if ((input.evidenceRequired ?? true) && input.evidenceCount <= 0) return "needs-evidence";
  return "complete";
}

/** Resolve the reporting period that contains a metric for the selected calendar month. */
export function resolveMetricWorkspacePeriod(
  selectedMonth: string,
  frequency?: string | null,
  metricType?: string | null,
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(selectedMonth);
  if (!match) return selectedMonth;
  if (["calculated", "derived"].includes((metricType || "").trim().toLowerCase())) return selectedMonth;
  const [, year, monthText] = match;
  const month = Number(monthText);
  const normalizedFrequency = (frequency || "monthly").trim().toLowerCase();

  if (["annual", "annually", "yearly"].includes(normalizedFrequency)) return year;
  if (["quarterly", "quarter"].includes(normalizedFrequency)) {
    return `${year}-Q${Math.ceil(month / 3)}`;
  }
  return selectedMonth;
}

/**
 * Preserve a stored traffic-light result while making typed compliance
 * answers explicit. A reported "No" must never inherit the generic green
 * fallback used for ordinary values.
 */
export function resolveMetricWorkspaceStatus(
  direction: string | null | undefined,
  value: MetricWorkspaceStatusValue | null | undefined,
): string {
  if (!hasMetricReportedValue(value)) return "missing";

  if (direction === "compliance_yes_no") {
    const complianceAnswer = typeof value?.valueBoolean === "boolean"
      ? value.valueBoolean
      : parseBooleanMetricInput(value?.valueText ?? value?.value);
    if (complianceAnswer !== null) return complianceAnswer ? "green" : "red";
  }

  return value?.status || "green";
}

/** Summarise mutually exclusive states; the three counts always total states.length. */
export function summarizeMetricDataStates(
  states: readonly MetricDataWorkspaceState[],
): MetricDataWorkspaceSummary {
  const summary: MetricDataWorkspaceSummary = {
    total: states.length,
    needsData: 0,
    needsEvidence: 0,
    complete: 0,
  };

  for (const state of states) {
    switch (state) {
      case "needs-data":
        summary.needsData += 1;
        break;
      case "needs-evidence":
        summary.needsEvidence += 1;
        break;
      case "complete":
        summary.complete += 1;
        break;
    }
  }

  return summary;
}
