import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

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

export async function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers["x-agent-api-key"];
  if (!rawKey || typeof rawKey !== "string") {
    return res.status(401).json({ error: "Missing X-Agent-API-Key header" });
  }

  const hash = hashAgentApiKey(rawKey);
  const keyRecord = await storage.getAgentApiKeyByHash(hash);

  if (!keyRecord) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  if (keyRecord.revokedAt) {
    return res.status(401).json({ error: "API key has been revoked" });
  }
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return res.status(401).json({ error: "API key has expired" });
  }

  (req as any)._agentAuth = {
    keyId: keyRecord.id,
    agentType: keyRecord.agentType,
    scopes: (keyRecord.scopes as string[]) || [],
    companyId: keyRecord.companyId || null,
  };

  storage.updateAgentApiKeyLastUsed(keyRecord.id).catch(() => {});

  return next();
}

export function requireAgentScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const agentAuth = (req as any)._agentAuth as { scopes: string[] } | undefined;
    if (!agentAuth) {
      return res.status(401).json({ error: "Agent authentication required" });
    }
    const { scopes } = agentAuth;
    if (scopes.includes("internal:*") || scopes.includes(scope)) {
      return next();
    }
    return res.status(403).json({ error: `Missing required scope: ${scope}` });
  };
}
