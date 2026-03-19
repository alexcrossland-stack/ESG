import { apiRequest } from "@/lib/queryClient";

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  apiRequest("POST", "/api/analytics/events", { event_name: eventName, properties }).catch(() => {});
}

export const AnalyticsEvents = {
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  ONBOARDING_DROPPED: "onboarding_drop_off",
  FIRST_DATA_ADDED: "first_data_added",
  FIRST_REPORT_GENERATED: "first_report_generated",
  FIRST_EVIDENCE_UPLOADED: "first_evidence_uploaded",
} as const;
