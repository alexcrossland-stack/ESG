/**
 * Canonical typed error code catalogue.
 *
 * Rules:
 *  - All codes are SCREAMING_SNAKE_CASE.
 *  - Every code that is returned by the backend must appear here.
 *  - The frontend errorResolver maps these to user-facing guidance.
 *  - Do not add codes here without a corresponding entry in errorResolver.ts.
 */

export const ErrorCode = {
  // ── Session & Auth ───────────────────────────────────────────────────────
  SESSION_IDLE_TIMEOUT:       "SESSION_IDLE_TIMEOUT",
  SESSION_REVOKED:            "SESSION_REVOKED",
  SESSION_ABSOLUTE_TIMEOUT:   "SESSION_ABSOLUTE_TIMEOUT",
  STEP_UP_REQUIRED:           "STEP_UP_REQUIRED",
  CONSENT_REQUIRED:           "CONSENT_REQUIRED",
  NOT_AUTHENTICATED:          "NOT_AUTHENTICATED",

  // ── Permissions & Access ─────────────────────────────────────────────────
  PERMISSION_DENIED:          "PERMISSION_DENIED",
  UPGRADE_REQUIRED:           "UPGRADE_REQUIRED",
  ACCOUNT_SUSPENDED:          "ACCOUNT_SUSPENDED",
  SUPER_ADMIN_REQUIRED:       "SUPER_ADMIN_REQUIRED",

  // ── Onboarding & Setup ───────────────────────────────────────────────────
  ONBOARDING_INCOMPLETE:      "ONBOARDING_INCOMPLETE",
  MISSING_SETUP:              "MISSING_SETUP",

  // ── Reports ──────────────────────────────────────────────────────────────
  /** No metric definitions are enabled for this company/site. */
  NO_METRICS_CONFIGURED:      "NO_METRICS_CONFIGURED",
  /** Metric definitions exist but no values have been entered for the period. */
  NO_REPORTING_PERIOD_DATA:   "NO_REPORTING_PERIOD_DATA",
  /** Report generation itself failed (internal error after eligibility passed). */
  REPORT_GENERATION_FAILED:   "REPORT_GENERATION_FAILED",

  // ── Metrics & Data Entry ─────────────────────────────────────────────────
  METRIC_SAVE_FAILED:         "METRIC_SAVE_FAILED",
  METRIC_NOT_FOUND:           "METRIC_NOT_FOUND",
  INVALID_METRIC_VALUE:       "INVALID_METRIC_VALUE",

  // ── Evidence & Documents ─────────────────────────────────────────────────
  EVIDENCE_UPLOAD_FAILED:     "EVIDENCE_UPLOAD_FAILED",

  // ── Bulk Import ──────────────────────────────────────────────────────────
  BULK_IMPORT_VALIDATION_FAILED: "BULK_IMPORT_VALIDATION_FAILED",

  // ── Policies ─────────────────────────────────────────────────────────────
  POLICY_PUBLISH_BLOCKED:     "POLICY_PUBLISH_BLOCKED",

  // ── Generic ──────────────────────────────────────────────────────────────
  INTERNAL_ERROR:             "INTERNAL_ERROR",
  NOT_FOUND:                  "NOT_FOUND",
  VALIDATION_ERROR:           "VALIDATION_ERROR",
  RATE_LIMITED:               "RATE_LIMITED",
} as const;

/** All valid error codes as a union type. */
export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Legacy snake_case aliases emitted by the preflight endpoint (#74).
 * Map them to their canonical SCREAMING_SNAKE_CASE equivalents.
 */
export const LEGACY_CODE_MAP: Record<string, ErrorCodeValue> = {
  no_metrics_configured:    ErrorCode.NO_METRICS_CONFIGURED,
  no_reporting_period_data: ErrorCode.NO_REPORTING_PERIOD_DATA,
};

/** Normalise any code string to the canonical form (handles legacy aliases). */
export function normaliseCode(raw: string | undefined): ErrorCodeValue | undefined {
  if (!raw) return undefined;
  if (raw in LEGACY_CODE_MAP) return LEGACY_CODE_MAP[raw];
  const values = Object.values(ErrorCode) as string[];
  if (values.includes(raw)) return raw as ErrorCodeValue;
  return undefined;
}
