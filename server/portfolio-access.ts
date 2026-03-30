import { db } from "./storage";
import { groups, groupCompanies, userGroupRoles, companies } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export interface PortfolioGroup {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  role: string;
  companyCount: number;
}

export interface AccessibleCompany {
  id: string;
  name: string;
  groupIds: string[];
}

export interface PortfolioAccess {
  directCompanies: { id: string; name: string }[];
  groups: PortfolioGroup[];
  accessibleCompanies: AccessibleCompany[];
  defaultLandingContext: "portfolio" | "company";
  currentRoleContext: "portfolio_owner" | "portfolio_viewer" | "company" | "super_admin" | null;
}

/**
 * Resolves what portfolio entities a user can see, and how they should land.
 *
 * Precedence rules (applied in strict order):
 *  1. super_admin  → always returns currentRoleContext="super_admin", defaultLandingContext="company"
 *  2. portfolio_owner/viewer (has group memberships with ≥1 company in those groups)
 *     → currentRoleContext="portfolio_owner" if any group role is portfolio_owner, else "portfolio_viewer"
 *     → defaultLandingContext="portfolio" when ≥2 companies are accessible via groups OR user has no direct companyId
 *     → defaultLandingContext="company" when only 1 company accessible AND user has a direct companyId
 *  3. regular company user (no group memberships, has companyId)
 *     → currentRoleContext="company", defaultLandingContext="company"
 *  4. no access  → currentRoleContext=null, defaultLandingContext="company"
 *
 * Mixed-access note: A user who has BOTH a direct companyId AND group memberships is treated
 * as portfolio context (rule 2) because group memberships take priority for landing decisions.
 * The directCompanies field still surfaces their direct company for any company-specific UI.
 */
export async function resolvePortfolioAccess(userId: string, userRole: string, companyId: string | null | undefined): Promise<PortfolioAccess> {
  // Rule 1: super_admin bypasses all other checks
  if (userRole === "super_admin") {
    return {
      directCompanies: companyId ? [{ id: companyId, name: "" }] : [],
      groups: [],
      accessibleCompanies: companyId ? [{ id: companyId, name: "", groupIds: [] }] : [],
      defaultLandingContext: "company",
      currentRoleContext: "super_admin",
    };
  }

  // Load all group memberships for this user
  const userGroupRoleRows = await db
    .select({ groupId: userGroupRoles.groupId, role: userGroupRoles.role })
    .from(userGroupRoles)
    .where(eq(userGroupRoles.userId, userId));

  const groupIds = userGroupRoleRows.map(r => r.groupId);

  let portfolioGroups: PortfolioGroup[] = [];
  let groupAccessibleCompanyIds: string[] = [];

  if (groupIds.length > 0) {
    const groupRows = await db
      .select({ id: groups.id, name: groups.name, slug: groups.slug, type: groups.type, description: groups.description })
      .from(groups)
      .where(inArray(groups.id, groupIds));

    const groupCompanyRows = await db
      .select({ groupId: groupCompanies.groupId, companyId: groupCompanies.companyId })
      .from(groupCompanies)
      .where(inArray(groupCompanies.groupId, groupIds));

    const companyCountByGroup: Record<string, number> = {};
    const companiesByGroup: Record<string, string[]> = {};
    for (const gc of groupCompanyRows) {
      companyCountByGroup[gc.groupId] = (companyCountByGroup[gc.groupId] || 0) + 1;
      if (!companiesByGroup[gc.groupId]) companiesByGroup[gc.groupId] = [];
      companiesByGroup[gc.groupId].push(gc.companyId);
      if (!groupAccessibleCompanyIds.includes(gc.companyId)) {
        groupAccessibleCompanyIds.push(gc.companyId);
      }
    }

    const roleByGroup: Record<string, string> = {};
    for (const r of userGroupRoleRows) {
      roleByGroup[r.groupId] = r.role;
    }

    portfolioGroups = groupRows.map(g => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      type: g.type,
      description: g.description,
      role: roleByGroup[g.id] || "portfolio_viewer",
      companyCount: companyCountByGroup[g.id] || 0,
    }));
  }

  // Load direct company membership
  const directCompanies: { id: string; name: string }[] = [];
  if (companyId) {
    const co = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId));
    if (co.length > 0) directCompanies.push(co[0]);
  }

  // Build accessible company list (group companies first, then direct)
  const accessibleCompanyList: AccessibleCompany[] = [];
  const seen = new Set<string>();

  if (groupAccessibleCompanyIds.length > 0) {
    const groupCos = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(companies.id, groupAccessibleCompanyIds));

    for (const co of groupCos) {
      if (!seen.has(co.id)) {
        seen.add(co.id);
        const groupMemberships = (await db
          .select({ groupId: groupCompanies.groupId })
          .from(groupCompanies)
          .where(and(eq(groupCompanies.companyId, co.id), inArray(groupCompanies.groupId, groupIds)))
        ).map(r => r.groupId);

        accessibleCompanyList.push({ id: co.id, name: co.name, groupIds: groupMemberships });
      }
    }
  }

  for (const dc of directCompanies) {
    if (!seen.has(dc.id)) {
      seen.add(dc.id);
      accessibleCompanyList.push({ id: dc.id, name: dc.name, groupIds: [] });
    }
  }

  // Rule 2: Portfolio context — user has group memberships with accessible companies
  // Takes precedence over direct company role for landing context decision
  const hasGroupMemberships = portfolioGroups.length > 0;
  const hasGroupCompanies = groupAccessibleCompanyIds.length > 0;
  const hasPortfolioContext = hasGroupMemberships && hasGroupCompanies;

  // Rule 3/4: company or no-access context
  let defaultLandingContext: "portfolio" | "company" = "company";
  if (hasPortfolioContext) {
    // Land on portfolio when multiple companies are accessible via groups,
    // or when user has no direct company to fall back to
    const multipleGroupCompanies = groupAccessibleCompanyIds.length > 1;
    if (multipleGroupCompanies || !companyId) {
      defaultLandingContext = "portfolio";
    }
    // If exactly 1 group company AND user has a direct companyId, default to company view
  }

  // Determine the effective role context (strict precedence: group owner > group viewer > company > none)
  // Requires group memberships WITH accessible companies to qualify as a portfolio context.
  // A member of an empty group is treated the same as having no group membership.
  let currentRoleContext: PortfolioAccess["currentRoleContext"] = null;
  if (hasPortfolioContext) {
    // Among all group roles, portfolio_owner wins over portfolio_viewer
    const hasOwnerRole = portfolioGroups.some(g => g.role === "portfolio_owner");
    currentRoleContext = hasOwnerRole ? "portfolio_owner" : "portfolio_viewer";
  } else if (companyId) {
    currentRoleContext = "company";
  }

  return {
    directCompanies,
    groups: portfolioGroups,
    accessibleCompanies: accessibleCompanyList,
    defaultLandingContext,
    currentRoleContext,
  };
}

export async function assertGroupAccess(userId: string, userRole: string, groupId: string): Promise<PortfolioGroup | null> {
  if (userRole === "super_admin") {
    const g = await db.select({ id: groups.id, name: groups.name, slug: groups.slug, type: groups.type, description: groups.description }).from(groups).where(eq(groups.id, groupId));
    if (!g.length) return null;
    return { ...g[0], role: "portfolio_owner", companyCount: 0 };
  }

  const ugr = await db
    .select({ role: userGroupRoles.role })
    .from(userGroupRoles)
    .where(and(eq(userGroupRoles.userId, userId), eq(userGroupRoles.groupId, groupId)));

  if (!ugr.length) return null;

  const g = await db.select({ id: groups.id, name: groups.name, slug: groups.slug, type: groups.type, description: groups.description }).from(groups).where(eq(groups.id, groupId));
  if (!g.length) return null;

  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(groupCompanies)
    .where(eq(groupCompanies.groupId, groupId));

  return {
    ...g[0],
    role: ugr[0].role,
    companyCount: Number(count[0]?.count || 0),
  };
}
