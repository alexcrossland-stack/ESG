interface HealthEventPayload {
  eventType: string;
  severity: string;
  message: string;
  details?: any;
  companyId?: string | null;
}

const CRITICAL_EVENT_TYPES = new Set([
  "server_error",
  "job_failure",
  "ai_failure",
  "import_failure",
  "csv_import_failure",
]);

export async function dispatchCriticalHealthEvent(event: HealthEventPayload): Promise<void> {
  if (!CRITICAL_EVENT_TYPES.has(event.eventType)) return;
  if (event.severity !== "error") return;

  const webhookUrl = process.env.AGENT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const body = JSON.stringify({
      eventType: event.eventType,
      severity: event.severity,
      message: event.message,
      details: event.details ?? null,
      timestamp: new Date().toISOString(),
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[Webhook] Critical health event dispatch returned ${response.status} for event: ${event.eventType}`);
    }
  } catch (err: any) {
    console.warn(`[Webhook] Failed to dispatch critical health event (${event.eventType}): ${err.message}`);
  }
}
