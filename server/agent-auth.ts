import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { isAgentApiKeyExpiredById } from "./auth-token-timestamps";
import { getClientIp } from "./audit";
import type { AgentApiKey } from "@shared/schema";

const KEY_PREFIX_MARKER = "esgk_";
const KEY_PREFIX_DISPLAY_LEN = 8;

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

export async function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers["x-agent-api-key"];
  if (!rawKey || typeof rawKey !== "string") {
    auditAgentAuthFailure(req, "missing_key");
    return res.status(401).json({ error: "Missing X-Agent-API-Key header" });
  }

  const hash = hashAgentApiKey(rawKey);
  const keyRecord = await storage.getAgentApiKeyByHash(hash);

  if (!keyRecord) {
    auditAgentAuthFailure(req, "invalid_key");
    return res.status(401).json({ error: "Invalid API key" });
  }
  if (keyRecord.revokedAt) {
    auditAgentAuthFailure(req, "revoked", keyRecord);
    return res.status(401).json({ error: "API key has been revoked" });
  }
  if (await isAgentApiKeyExpiredById(keyRecord.id, keyRecord.expiresAt)) {
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
