import type { Request } from "express";
import { storage } from "./storage";
import type { AuditLog } from "@shared/schema";

type AuditLogInput = Omit<AuditLog, "id" | "createdAt"> & { req?: Request };

export function auditLog(input: AuditLogInput): void {
  const { req, ...rest } = input;
  const enriched = {
    ...rest,
    ipAddress: rest.ipAddress ?? (req ? getClientIp(req) : null),
    userAgent: rest.userAgent ?? (req ? (req.headers["user-agent"] ?? null) : null),
    actorType: rest.actorType ?? "user",
  };
  storage.createAuditLog(enriched).catch((err) => {
    console.error("[audit] Failed to write audit log:", err?.message ?? err);
  });
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",");
    return ips[0].trim() || null;
  }
  return req.socket?.remoteAddress ?? req.ip ?? null;
}
