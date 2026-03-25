import { storage } from "./storage";

export type TelemetryEventName =
  | "onboarding_started"
  | "onboarding_completed"
  | "first_metric_added"
  | "first_evidence_uploaded"
  | "first_report_generated"
  | "dashboard_action_clicked"
  | "help_article_opened"
  | "report_downloaded";

export interface TelemetryEventData {
  userId?: string | null;
  companyId?: string | null;
  groupId?: string | null;
  properties?: Record<string, unknown>;
}

export function trackTelemetryEvent(
  eventName: TelemetryEventName,
  data: TelemetryEventData = {}
): void {
  const payload = {
    eventName,
    userId: data.userId ?? null,
    companyId: data.companyId ?? null,
    groupId: data.groupId ?? null,
    properties: data.properties ?? {},
    recordedAt: new Date().toISOString(),
  };

  console.log(`[telemetry] ${eventName}`, JSON.stringify(payload));

  storage.createTelemetryEvent({
    eventName,
    userId: data.userId ?? null,
    companyId: data.companyId ?? null,
    groupId: data.groupId ?? null,
    properties: data.properties ?? null,
  }).catch((err: any) => {
    console.error(`[telemetry] Failed to persist event '${eventName}':`, err?.message ?? err);
  });
}
