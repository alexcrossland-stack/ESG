import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { isAgentApiKeyExpiredById } from "./auth-token-timestamps";
import { getClientIp } from "./audit";
import type { AgentApiKey } from "@shared/schema";

const KEY_PREFIX_MARKER = "esgk_";
const KEY_PREFIX_DISPLAY_LEN = 8;
const AGENT_AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const AGENT_AUTH_FAILURE_MAX = 20;
const agentAuthFailureBuckets = new Map<string, { count: number; resetAt: number }>();
let agentAuthFailureCleanupCounter = 0;

export function generateAgentApiKey(): { plaintext: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(32).toString("hex");
  const plaintext = `${KEY_PREFIX_MARKER}${random}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, KEY_PREFIX_MARKER.length + KEY_PREFIX_DISPLAY_LEN) + "...";
  return { plaintext, hash, prefix };
}

export function hashAgentApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

function requestAuditDetails(req: Request, details: Record<string, unknown>) {
  return {
    ...details,
    method: req.method,
    path: req.path,
  };
}

function safeRawKeyPrefix(rawKey: string): string | null {
  if (!rawKey.startsWith(KEY_PREFIX_MARKER)) return null;
  return rawKey.slice(0, KEY_PREFIX_MARKER.length + KEY_PREFIX_DISPLAY_LEN) + "...";
}

function auditAgentAuthFailure(req: Request, reason: string, keyRecord?: AgentApiKey | null, extra: Record<string, unknown> = {}) {
  const rawKey = req.headers["x-agent-api-key"];
  storage.createAuditLog({
    companyId: keyRecord?.companyId || undefined,
    userId: null,
    actorType: "agent",
    actorAgentId: keyRecord?.id || undefined,
    action: "api_key_auth_failed",
    entityType: "agent_api_key",
    entityId: keyRecord?.id || undefined,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] || null,
    details: requestAuditDetails(req, {
      outcome: "failure",
      reason,
      keyPrefix: keyRecord?.keyPrefix || (typeof rawKey === "string" ? safeRawKeyPrefix(rawKey) : null),
      ...extra,
    }),
  } as any).catch(() => {});
}

function agentFailureBucketKey(req: Request, rawKey: string | undefined, reason: string, keyRecord?: AgentApiKey | null) {
  const ip = getClientIp(req) || "unknown";
  const keyIdentity = keyRecord?.id || (rawKey ? safeRawKeyPrefix(rawKey) : null) || reason;
  return `${ip}:${keyIdentity}`;
}

function isAgentAuthFailureRateLimited(req: Request, rawKey: string | undefined, reason: string, keyRecord?: AgentApiKey | null) {
  const key = agentFailureBucketKey(req, rawKey, reason, keyRecord);
  const now = Date.now();
  agentAuthFailureCleanupCounter += 1;
  if (agentAuthFailureCleanupCounter % 100 === 0 || agentAuthFailureBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of agentAuthFailureBuckets.entries()) {
      if (bucket.resetAt <= now) agentAuthFailureBuckets.delete(bucketKey);
    }
  }
  const existing = agentAuthFailureBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    agentAuthFailureBuckets.set(key, { count: 1, resetAt: now + AGENT_AUTH_FAILURE_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > AGENT_AUTH_FAILURE_MAX;
}

function rejectAgentAuthRateLimit(req: Request, res: Response, reason: string, rawKey?: string, keyRecord?: AgentApiKey | null) {
  auditAgentAuthFailure(req, "rate_limited", keyRecord, { limitReason: reason });
  return res.status(429).json({ error: "Too many API key authentication failures. Please try again later.", code: "RATE_LIMITED" });
}

export async function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers["x-agent-api-key"];
  if (!rawKey || typeof rawKey !== "string") {
    if (isAgentAuthFailureRateLimited(req, undefined, "missing_key")) {
      return rejectAgentAuthRateLimit(req, res, "missing_key");
    }
    auditAgentAuthFailure(req, "missing_key");
    return res.status(401).json({ error: "Missing X-Agent-API-Key header" });
  }

  const hash = hashAgentApiKey(rawKey);
  const keyRecord = await storage.getAgentApiKeyByHash(hash);

  if (!keyRecord) {
    if (isAgentAuthFailureRateLimited(req, rawKey, "invalid_key")) {
      return rejectAgentAuthRateLimit(req, res, "invalid_key", rawKey);
    }
    auditAgentAuthFailure(req, "invalid_key");
    return res.status(401).json({ error: "Invalid API key" });
  }
  if (keyRecord.revokedAt) {
    if (isAgentAuthFailureRateLimited(req, rawKey, "revoked", keyRecord)) {
      return rejectAgentAuthRateLimit(req, res, "revoked", rawKey, keyRecord);
    }
    auditAgentAuthFailure(req, "revoked", keyRecord);
    return res.status(401).json({ error: "API key has been revoked" });
  }
  if (await isAgentApiKeyExpiredById(keyRecord.id, keyRecord.expiresAt)) {
    if (isAgentAuthFailureRateLimited(req, rawKey, "expired", keyRecord)) {
      return rejectAgentAuthRateLimit(req, res, "expired", rawKey, keyRecord);
    }
    auditAgentAuthFailure(req, "expired", keyRecord);
    return res.status(401).json({ error: "API key has expired" });
  }

  (req as any)._agentAuth = {
    keyId: keyRecord.id,
    agentType: keyRecord.agentType,
    scopes: (keyRecord.scopes as string[]) || [],
    companyId: keyRecord.companyId || null,
    keyPrefix: keyRecord.keyPrefix,
  };

  storage.updateAgentApiKeyLastUsed(keyRecord.id).catch(() => {});

  return next();
}

export function requireAgentScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const agentAuth = (req as any)._agentAuth as { keyId?: string; companyId?: string | null; keyPrefix?: string | null; scopes: string[] } | undefined;
    if (!agentAuth) {
      return res.status(401).json({ error: "Agent authentication required" });
    }
    const { scopes } = agentAuth;
    if (scopes.includes("internal:*") || scopes.includes(scope)) {
      return next();
    }
    storage.createAuditLog({
      companyId: agentAuth.companyId || undefined,
      userId: null,
      actorType: "agent",
      actorAgentId: agentAuth.keyId || undefined,
      action: "api_key_auth_failed",
      entityType: "agent_api_key",
      entityId: agentAuth.keyId || undefined,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || null,
      details: requestAuditDetails(req, {
        outcome: "failure",
        reason: "missing_scope",
        keyPrefix: agentAuth.keyPrefix || null,
        requiredScope: scope,
      }),
    } as any).catch(() => {});
    return res.status(403).json({ error: `Missing required scope: ${scope}` });
  };
}
