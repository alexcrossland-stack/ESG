/**
 * Central frontend error resolver.
 *
 * Maps typed error codes (from the backend) to plain-English guidance that
 * can be shown directly to users in toasts, inline alerts, or empty states.
 *
 * Usage:
 *   const resolution = resolveError(e.code, e.message);
 *   toast({ title: resolution.title, description: resolution.description, variant: "destructive" });
 *
 * All later tickets (#75, #76, #78, #79, #80) consume this module instead of
 * writing their own local error-string logic.
 */

export interface ErrorResolution {
  /** Short toast-friendly title (≤ 5 words). */
  title: string;
  /** Plain-English explanation of what happened. */
  description: string;
  /** What the user should do next. */
  nextStep: string;
  /** Which role can resolve this (optional). */
  role?: string;
  /** Was data saved before the error occurred? */
  dataSaved?: boolean;
}

const RESOLUTIONS: Record<string, ErrorResolution> = {
  // ── Session & Auth ───────────────────────────────────────────────────────
  SESSION_IDLE_TIMEOUT: {
    title: "Session timed out",
    description: "You were signed out after a period of inactivity.",
    nextStep: "Sign in again to continue where you left off.",
    dataSaved: false,
  },
  SESSION_REVOKED: {
    title: "Session ended",
    description: "Your session was ended, possibly from another device or by an administrator.",
    nextStep: "Sign in again to continue.",
    dataSaved: false,
  },
  SESSION_ABSOLUTE_TIMEOUT: {
    title: "Session expired",
    description: "Your session has reached its maximum duration.",
    nextStep: "Sign in again to continue.",
    dataSaved: false,
  },
  STEP_UP_REQUIRED: {
    title: "Verification required",
    description: "This action requires you to confirm your identity first.",
    nextStep: "Complete the security check to proceed.",
    dataSaved: false,
  },
  CONSENT_REQUIRED: {
    title: "Terms updated",
    description: "Our Terms of Service or Privacy Policy have been updated.",
    nextStep: "Review and accept the updated terms to continue.",
    dataSaved: false,
  },
  NOT_AUTHENTICATED: {
    title: "Not signed in",
    description: "You need to be signed in to do this.",
    nextStep: "Sign in and try again.",
    dataSaved: false,
  },

  // ── Permissions & Access ─────────────────────────────────────────────────
  PERMISSION_DENIED: {
    title: "Access not allowed",
    description: "You don't have permission to do this.",
    nextStep: "Ask your Company Admin if you need access.",
    role: "Company Admin",
    dataSaved: false,
  },
  UPGRADE_REQUIRED: {
    title: "Pro plan required",
    description: "This feature is only available on the Pro plan.",
    nextStep: "Upgrade your plan to unlock this.",
    dataSaved: false,
  },
  ACCOUNT_SUSPENDED: {
    title: "Account suspended",
    description: "Your company account has been suspended.",
    nextStep: "Contact support to resolve this.",
    dataSaved: false,
  },
  SUPER_ADMIN_REQUIRED: {
    title: "Admin only",
    description: "This action is restricted to platform administrators.",
    nextStep: "Contact the platform team if you think this is an error.",
    dataSaved: false,
  },

  // ── Onboarding & Setup ───────────────────────────────────────────────────
  ONBOARDING_INCOMPLETE: {
    title: "Setup not complete",
    description: "You need to finish setting up your account before doing this.",
    nextStep: "Complete the setup steps and try again.",
    dataSaved: false,
  },
  MISSING_SETUP: {
    title: "Setup needed",
    description: "Something needs to be configured before this will work.",
    nextStep: "Check your settings or contact your Company Admin.",
    role: "Company Admin",
    dataSaved: false,
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  NO_METRICS_CONFIGURED: {
    title: "No metrics set up",
    description: "No metrics have been configured for your company yet.",
    nextStep: "Go to Settings to add the metrics you want to track, then try again.",
    role: "Company Admin",
    dataSaved: false,
  },
  // Legacy alias
  no_metrics_configured: {
    title: "No metrics set up",
    description: "No metrics have been configured for your company yet.",
    nextStep: "Go to Settings to add the metrics you want to track, then try again.",
    role: "Company Admin",
    dataSaved: false,
  },
  NO_REPORTING_PERIOD_DATA: {
    title: "No data for this period",
    description: "You haven't entered any data for the selected reporting period yet.",
    nextStep: "Go to Data Entry and add at least one figure, then try again.",
    dataSaved: false,
  },
  // Legacy alias
  no_reporting_period_data: {
    title: "No data for this period",
    description: "You haven't entered any data for the selected reporting period yet.",
    nextStep: "Go to Data Entry and add at least one figure, then try again.",
    dataSaved: false,
  },
  REPORT_GENERATION_FAILED: {
    title: "Report generation failed",
    description: "Something went wrong while building your report.",
    nextStep: "Try again. If the problem continues, contact support.",
    dataSaved: false,
  },

  // ── Metrics & Data Entry ─────────────────────────────────────────────────
  METRIC_SAVE_FAILED: {
    title: "Couldn't save value",
    description: "Your data couldn't be saved due to an unexpected error.",
    nextStep: "Try saving again. Your changes may not have been recorded.",
    dataSaved: false,
  },
  METRIC_NOT_FOUND: {
    title: "Metric not found",
    description: "The metric you're trying to update no longer exists or isn't accessible.",
    nextStep: "Refresh the page and try again.",
    dataSaved: false,
  },
  INVALID_METRIC_VALUE: {
    title: "Invalid value",
    description: "The value you entered isn't in the expected format.",
    nextStep: "Check that the value is a valid number and try again.",
    dataSaved: false,
  },

  // ── Evidence & Documents ─────────────────────────────────────────────────
  EVIDENCE_UPLOAD_FAILED: {
    title: "Upload failed",
    description: "Your file couldn't be uploaded.",
    nextStep: "Check the file size and type, then try again.",
    dataSaved: false,
  },

  // ── Bulk Import ──────────────────────────────────────────────────────────
  BULK_IMPORT_VALIDATION_FAILED: {
    title: "Import has errors",
    description: "Some rows in your file couldn't be imported.",
    nextStep: "Fix the highlighted rows and re-upload the file.",
    dataSaved: false,
  },

  // ── Policies ─────────────────────────────────────────────────────────────
  POLICY_PUBLISH_BLOCKED: {
    title: "Policy can't be published",
    description: "Your policy isn't ready to publish yet.",
    nextStep: "Complete all required sections before publishing.",
    dataSaved: true,
  },

  // ── Generic ──────────────────────────────────────────────────────────────
  INTERNAL_ERROR: {
    title: "Something went wrong",
    description: "An unexpected error occurred.",
    nextStep: "Refresh the page and try again. If the problem continues, contact support.",
    dataSaved: false,
  },
  NOT_FOUND: {
    title: "Not found",
    description: "The item you're looking for doesn't exist or has been removed.",
    nextStep: "Go back and try again.",
    dataSaved: false,
  },
  VALIDATION_ERROR: {
    title: "Check your inputs",
    description: "Some of the information you entered isn't valid.",
    nextStep: "Review the fields and try again.",
    dataSaved: false,
  },
  RATE_LIMITED: {
    title: "Too many attempts",
    description: "You've made too many requests in a short time.",
    nextStep: "Wait a few minutes and try again.",
    dataSaved: false,
  },
};

/** Fallback resolution when no code is recognised. */
const FALLBACK_RESOLUTION: ErrorResolution = {
  title: "Something went wrong",
  description: "An unexpected error occurred.",
  nextStep: "Refresh the page and try again.",
  dataSaved: false,
};

/**
 * Resolve an error code (and optional fallback message) into user-facing guidance.
 *
 * @param code    - The `code` field from the backend error response.
 * @param fallback - Raw error message to use as description if code is unknown.
 */
export function resolveError(
  code: string | undefined,
  fallback?: string,
): ErrorResolution {
  if (code && RESOLUTIONS[code]) {
    return RESOLUTIONS[code];
  }
  if (fallback) {
    return { ...FALLBACK_RESOLUTION, description: fallback };
  }
  return FALLBACK_RESOLUTION;
}

/**
 * Convenience: extract code from a thrown Error (as attached by queryClient.ts)
 * and resolve it. Works with both the `code` property and the message string.
 */
export function resolveApiError(error: unknown): ErrorResolution {
  const e = error as { code?: string; message?: string } | null;
  return resolveError(e?.code, e?.message);
}
