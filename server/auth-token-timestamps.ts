import { sql } from "drizzle-orm";
import { db } from "./storage";

type TimestampInput = Date | string | number | null | undefined;

export function timestampToMs(value: TimestampInput): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function timestampToDate(value: TimestampInput): Date | null {
  const ms = timestampToMs(value);
  return ms === null ? null : new Date(ms);
}

export function isTimestampExpired(value: TimestampInput, nowMs = Date.now()): boolean {
  const ms = timestampToMs(value);
  return ms === null || ms <= nowMs;
}

export function isTimestampInFuture(value: TimestampInput, nowMs = Date.now()): boolean {
  const ms = timestampToMs(value);
  return ms !== null && ms > nowMs;
}

export function timestampAgeMs(value: TimestampInput, nowMs = Date.now()): number | null {
  const ms = timestampToMs(value);
  return ms === null ? null : nowMs - ms;
}

export function expiryRemainingMs(value: TimestampInput, validityMs: number, nowMs = Date.now()): number {
  const ageMs = timestampAgeMs(value, nowMs);
  if (ageMs === null) return 0;
  return Math.max(0, validityMs - ageMs);
}

export async function isAuthTokenExpiredById(id: string, fallbackExpiresAt: TimestampInput): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT expires_at <= NOW() AS expired
    FROM auth_tokens
    WHERE id = ${id}
    LIMIT 1
  `);
  const expired = (result as any).rows?.[0]?.expired;
  return typeof expired === "boolean" ? expired : isTimestampExpired(fallbackExpiresAt);
}

export async function isAgentApiKeyExpiredById(id: string, fallbackExpiresAt: TimestampInput): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT expires_at IS NOT NULL AND expires_at <= NOW() AS expired
    FROM agent_api_keys
    WHERE id = ${id}
    LIMIT 1
  `);
  const expired = (result as any).rows?.[0]?.expired;
  return typeof expired === "boolean" ? expired : fallbackExpiresAt ? isTimestampExpired(fallbackExpiresAt) : false;
}

export async function isUserSessionExpiredBySessionId(sessionId: string, fallbackExpiresAt: TimestampInput): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT expires_at <= NOW() AS expired
    FROM user_sessions_ext
    WHERE session_id = ${sessionId}
    LIMIT 1
  `);
  const expired = (result as any).rows?.[0]?.expired;
  return typeof expired === "boolean" ? expired : isTimestampExpired(fallbackExpiresAt);
}

export async function getUserSessionStepUpState(
  sessionId: string,
  fallbackStepUpAt: TimestampInput,
  validityMs: number,
): Promise<{ valid: boolean; remainingMs: number }> {
  const result = await db.execute(sql`
    SELECT
      step_up_at IS NOT NULL
        AND step_up_at + (${validityMs}::double precision * INTERVAL '1 millisecond') > NOW() AS valid,
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (step_up_at + (${validityMs}::double precision * INTERVAL '1 millisecond') - NOW())) * 1000
      )::integer AS remaining_ms
    FROM user_sessions_ext
    WHERE session_id = ${sessionId}
    LIMIT 1
  `);
  const row = (result as any).rows?.[0];
  if (typeof row?.valid === "boolean") {
    return {
      valid: row.valid,
      remainingMs: Number.isFinite(Number(row.remaining_ms)) ? Number(row.remaining_ms) : 0,
    };
  }
  const stepUpMs = timestampToMs(fallbackStepUpAt);
  return {
    valid: stepUpMs !== null && !isTimestampExpired(stepUpMs + validityMs),
    remainingMs: expiryRemainingMs(fallbackStepUpAt, validityMs),
  };
}
