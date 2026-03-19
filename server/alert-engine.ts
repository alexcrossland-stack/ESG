import { db } from "./storage";
import { sql } from "drizzle-orm";

export const SECURITY_EVENTS = {
  LOGIN_FAILED: "login_failed",
  MFA_VERIFY_FAILED: "mfa_verify_failed",
  API_KEY_AUTH_FAILED: "api_key_auth_failed",
  USER_ROLE_CHANGED: "user_role_changed",
  COMPANY_DELETION_REQUESTED: "company_deletion_requested",
  DATA_EXPORTED: "data_export_completed",
  DATA_DELETED: "data_deletion_completed",
  SUPER_ADMIN_ACTION: "super_admin_action",
  SESSION_REVOKED: "session_revoked",
  API_KEY_REVOKED: "api_key_revoked",
  ACCESS_DENIED: "access_denied",
} as const;

export type SecurityEventType = typeof SECURITY_EVENTS[keyof typeof SECURITY_EVENTS];

interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  evaluate: (context: AlertContext) => Promise<boolean>;
  dedupeKey: (context: AlertContext) => string;
  cooldownMs: number;
}

interface AlertContext {
  action: string;
  userId?: string | null;
  companyId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, any>;
  createdAt?: Date;
}

const COOLDOWNS = new Map<string, number>();

function isCoolingDown(key: string, cooldownMs: number): boolean {
  const last = COOLDOWNS.get(key);
  if (!last) return false;
  return Date.now() - last < cooldownMs;
}

function setCooldown(key: string): void {
  COOLDOWNS.set(key, Date.now());
  if (COOLDOWNS.size > 2000) {
    const keys = Array.from(COOLDOWNS.keys());
    for (let i = 0; i < 200; i++) COOLDOWNS.delete(keys[i]);
  }
}

async function countRecentAuditEvents(action: string, windowMs: number, groupBy: "ip" | "user" | "global", value: string | null): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  let query: string;
  if (groupBy === "ip" && value) {
    query = `SELECT COUNT(*) as cnt FROM audit_logs WHERE action = '${action}' AND ip_address = '${value.replace(/'/g, "''")}' AND created_at > '${since.toISOString()}'`;
  } else if (groupBy === "user" && value) {
    query = `SELECT COUNT(*) as cnt FROM audit_logs WHERE action = '${action}' AND user_id = '${value.replace(/'/g, "''")}' AND created_at > '${since.toISOString()}'`;
  } else {
    query = `SELECT COUNT(*) as cnt FROM audit_logs WHERE action = '${action}' AND created_at > '${since.toISOString()}'`;
  }
  try {
    const result = await db.execute(sql.raw(query));
    return parseInt((result as any).rows?.[0]?.cnt || "0", 10);
  } catch {
    return 0;
  }
}

const ALERT_RULES: AlertRule[] = [
  {
    id: "repeated_login_failures_ip",
    name: "Repeated Login Failures by IP",
    description: "5+ failed logins from the same IP within 10 minutes",
    severity: "high",
    cooldownMs: 15 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.LOGIN_FAILED || !ctx.ipAddress) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.LOGIN_FAILED, 10 * 60 * 1000, "ip", ctx.ipAddress);
      return count >= 5;
    },
    dedupeKey: (ctx) => `login_fail_ip:${ctx.ipAddress}`,
  },
  {
    id: "repeated_login_failures_user",
    name: "Repeated Login Failures by Account",
    description: "5+ failed logins for the same account within 10 minutes",
    severity: "high",
    cooldownMs: 15 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.LOGIN_FAILED || !ctx.userId) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.LOGIN_FAILED, 10 * 60 * 1000, "user", ctx.userId);
      return count >= 5;
    },
    dedupeKey: (ctx) => `login_fail_user:${ctx.userId}`,
  },
  {
    id: "repeated_mfa_failures",
    name: "Repeated MFA Failures",
    description: "5+ failed MFA attempts for the same account within 10 minutes",
    severity: "high",
    cooldownMs: 15 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.MFA_VERIFY_FAILED || !ctx.userId) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.MFA_VERIFY_FAILED, 10 * 60 * 1000, "user", ctx.userId);
      return count >= 5;
    },
    dedupeKey: (ctx) => `mfa_fail_user:${ctx.userId}`,
  },
  {
    id: "repeated_api_key_failures",
    name: "Repeated API Key Auth Failures",
    description: "10+ failed API key auth attempts within 10 minutes",
    severity: "high",
    cooldownMs: 15 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.API_KEY_AUTH_FAILED) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.API_KEY_AUTH_FAILED, 10 * 60 * 1000, "ip", ctx.ipAddress ?? null);
      return count >= 10;
    },
    dedupeKey: (ctx) => `api_key_fail_ip:${ctx.ipAddress}`,
  },
  {
    id: "admin_role_change",
    name: "Admin Role Change",
    description: "A user's role was changed to or from admin",
    severity: "high",
    cooldownMs: 0,
    evaluate: async (ctx) => {
      return ctx.action === SECURITY_EVENTS.USER_ROLE_CHANGED;
    },
    dedupeKey: (ctx) => `role_change:${ctx.userId}:${Date.now()}`,
  },
  {
    id: "company_deletion_request",
    name: "Company Deletion Requested",
    description: "A company data deletion has been requested",
    severity: "critical",
    cooldownMs: 0,
    evaluate: async (ctx) => {
      return ctx.action === SECURITY_EVENTS.COMPANY_DELETION_REQUESTED;
    },
    dedupeKey: (ctx) => `company_delete:${ctx.companyId}:${Date.now()}`,
  },
  {
    id: "super_admin_critical_action",
    name: "Super-Admin Critical Action",
    description: "A super-admin performed a critical platform action",
    severity: "critical",
    cooldownMs: 0,
    evaluate: async (ctx) => {
      return ctx.action === SECURITY_EVENTS.SUPER_ADMIN_ACTION;
    },
    dedupeKey: (ctx) => `superadmin_action:${ctx.userId}:${Date.now()}`,
  },
  {
    id: "unusual_export_volume",
    name: "Unusual Export Volume",
    description: "5+ data export jobs within 30 minutes",
    severity: "medium",
    cooldownMs: 30 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.DATA_EXPORTED) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.DATA_EXPORTED, 30 * 60 * 1000, "global", null);
      return count >= 5;
    },
    dedupeKey: (_ctx) => `export_volume_global`,
  },
  {
    id: "unusual_delete_volume",
    name: "Unusual Deletion Volume",
    description: "3+ data deletion requests within 30 minutes",
    severity: "high",
    cooldownMs: 30 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.DATA_DELETED) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.DATA_DELETED, 30 * 60 * 1000, "global", null);
      return count >= 3;
    },
    dedupeKey: (_ctx) => `delete_volume_global`,
  },
  {
    id: "high_access_denied_volume",
    name: "High Volume of Access Denials",
    description: "20+ access denied events within 10 minutes from same IP",
    severity: "medium",
    cooldownMs: 15 * 60 * 1000,
    evaluate: async (ctx) => {
      if (ctx.action !== SECURITY_EVENTS.ACCESS_DENIED || !ctx.ipAddress) return false;
      const count = await countRecentAuditEvents(SECURITY_EVENTS.ACCESS_DENIED, 10 * 60 * 1000, "ip", ctx.ipAddress);
      return count >= 20;
    },
    dedupeKey: (ctx) => `access_denied_ip:${ctx.ipAddress}`,
  },
];

async function sendSlackAlert(rule: AlertRule, ctx: AlertContext, alertId: string): Promise<{ sent: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_SECURITY_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, error: "SLACK_SECURITY_WEBHOOK_URL not configured" };

  const severityEmoji: Record<string, string> = {
    low: ":information_source:",
    medium: ":warning:",
    high: ":rotating_light:",
    critical: ":skull:",
  };

  const payload = {
    text: `${severityEmoji[rule.severity] ?? ":bell:"} *Security Alert: ${rule.name}*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Security Alert: ${rule.name}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Severity:* ${rule.severity.toUpperCase()}` },
          { type: "mrkdwn", text: `*Alert ID:* ${alertId}` },
          { type: "mrkdwn", text: `*Rule:* ${rule.id}` },
          { type: "mrkdwn", text: `*Time:* ${new Date().toISOString()}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Description:* ${rule.description}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Action:* \`${ctx.action}\`` },
          { type: "mrkdwn", text: `*IP:* ${ctx.ipAddress ?? "unknown"}` },
          { type: "mrkdwn", text: `*User ID:* ${ctx.userId ?? "unknown"}` },
          { type: "mrkdwn", text: `*Company ID:* ${ctx.companyId ?? "unknown"}` },
        ],
      },
    ],
  };

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { sent: false, error: `Slack returned ${resp.status}` };
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: e?.message ?? "Unknown fetch error" };
  }
}

async function logSecurityAlert(rule: AlertRule, ctx: AlertContext): Promise<string> {
  const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await db.execute(sql.raw(`
      INSERT INTO security_alerts (id, rule_id, rule_name, severity, action, user_id, company_id, ip_address, details, fired_at)
      VALUES (
        '${alertId}',
        '${rule.id.replace(/'/g, "''")}',
        '${rule.name.replace(/'/g, "''")}',
        '${rule.severity}',
        '${ctx.action.replace(/'/g, "''")}',
        ${ctx.userId ? `'${ctx.userId.replace(/'/g, "''")}'` : "NULL"},
        ${ctx.companyId ? `'${ctx.companyId.replace(/'/g, "''")}'` : "NULL"},
        ${ctx.ipAddress ? `'${ctx.ipAddress.replace(/'/g, "''")}'` : "NULL"},
        '${JSON.stringify(ctx.details ?? {}).replace(/'/g, "''")}',
        NOW()
      )
    `));
  } catch (e) {
    console.error("[alert-engine] Failed to persist security alert:", e);
  }
  return alertId;
}

async function updateAlertDelivery(alertId: string, sent: boolean, error?: string): Promise<void> {
  try {
    if (sent) {
      await db.execute(sql.raw(`UPDATE security_alerts SET notification_sent_at = NOW(), notification_channel = 'slack' WHERE id = '${alertId}'`));
    } else {
      await db.execute(sql.raw(`UPDATE security_alerts SET notification_failure = '${(error ?? "unknown").replace(/'/g, "''")}' WHERE id = '${alertId}'`));
    }
  } catch (e) {
    console.error("[alert-engine] Failed to update alert delivery status:", e);
  }
}

export async function evaluateSecurityEvent(ctx: AlertContext): Promise<void> {
  for (const rule of ALERT_RULES) {
    try {
      const triggered = await rule.evaluate(ctx);
      if (!triggered) continue;

      const dedupeKey = rule.dedupeKey(ctx);
      if (rule.cooldownMs > 0 && isCoolingDown(dedupeKey, rule.cooldownMs)) {
        console.log(`[alert-engine] Suppressed (cooldown) rule=${rule.id} key=${dedupeKey}`);
        continue;
      }

      if (rule.cooldownMs > 0) setCooldown(dedupeKey);

      const alertId = await logSecurityAlert(rule, ctx);
      console.log(`[alert-engine] Alert fired rule=${rule.id} severity=${rule.severity} alertId=${alertId}`);

      sendSlackAlert(rule, ctx, alertId)
        .then(({ sent, error }) => {
          updateAlertDelivery(alertId, sent, error).catch(() => {});
          if (!sent) console.warn(`[alert-engine] Slack delivery failed: ${error}`);
        })
        .catch((e) => {
          console.error("[alert-engine] Slack send threw:", e);
          updateAlertDelivery(alertId, false, e?.message).catch(() => {});
        });
    } catch (e) {
      console.error(`[alert-engine] Rule evaluation error rule=${rule.id}:`, e);
    }
  }
}

export async function getSecurityAlerts(limit = 100, severity?: string): Promise<any[]> {
  try {
    const whereClause = severity ? `WHERE severity = '${severity.replace(/'/g, "''")}'` : "";
    const result = await db.execute(sql.raw(`
      SELECT * FROM security_alerts ${whereClause} ORDER BY fired_at DESC LIMIT ${limit}
    `));
    return (result as any).rows ?? [];
  } catch {
    return [];
  }
}
