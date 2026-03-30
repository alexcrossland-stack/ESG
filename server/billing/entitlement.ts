import { db } from "../storage";
import { accessGrants } from "@shared/schema";
import { and, isNull, lte, gt, or, eq } from "drizzle-orm";
import type { AccessGrant } from "@shared/schema";

/**
 * Returns the first currently-active access grant for a company or user.
 * Active = not revoked, starts_at <= now, ends_at > now.
 */
export async function getActiveGrant(companyId: string, userId?: string): Promise<AccessGrant | null> {
  const now = new Date();
  const baseConditions = [
    isNull(accessGrants.revokedAt),
    lte(accessGrants.startsAt, now),
    gt(accessGrants.endsAt, now),
  ];

  const scopeCondition = userId
    ? or(eq(accessGrants.companyId, companyId), eq(accessGrants.userId, userId))
    : eq(accessGrants.companyId, companyId);

  const [grant] = await db
    .select()
    .from(accessGrants)
    .where(and(...baseConditions, scopeCondition!))
    .limit(1);

  return grant ?? null;
}

export interface EntitlementResult {
  tier: "free" | "pro";
  isBeta: boolean;
  isComped: boolean;
  compedUntil: Date | null;
}

/**
 * Resolves the effective plan tier for a company in this priority order:
 * 1. Active access grant (comped)
 * 2. Paid Stripe subscription (planTier = "pro")
 * 3. Beta/trial logic
 * 4. Free
 */
export async function getEffectivePlanTier(company: any, userId?: string): Promise<EntitlementResult> {
  const grant = await getActiveGrant(company.id, userId);
  if (grant) {
    return { tier: "pro", isBeta: false, isComped: true, compedUntil: grant.endsAt };
  }
  if (company.planTier === "pro") {
    return { tier: "pro", isBeta: false, isComped: false, compedUntil: null };
  }
  const now = new Date();
  if (company.isBetaCompany && (!company.betaExpiresAt || new Date(company.betaExpiresAt) > now)) {
    return { tier: "pro", isBeta: true, isComped: false, compedUntil: null };
  }
  return { tier: "free", isBeta: false, isComped: false, compedUntil: null };
}
