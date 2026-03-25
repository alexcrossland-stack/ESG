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

export async function resolvePortfolioAccess(userId: string, userRole: string, companyId: string | null | undefined): Promise<PortfolioAccess> {
  if (userRole === "super_admin") {
    return {
      directCompanies: companyId ? [{ id: companyId, name: "" }] : [],
      groups: [],
      accessibleCompanies: companyId ? [{ id: companyId, name: "", groupIds: [] }] : [],
      defaultLandingContext: "company",
      currentRoleContext: "super_admin",
    };
  }

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

  const directCompanies: { id: string; name: string }[] = [];
  if (companyId) {
    const co = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId));
    if (co.length > 0) directCompanies.push(co[0]);
  }

  let accessibleCompanyList: AccessibleCompany[] = [];
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

  const hasPortfolioAccess = portfolioGroups.length > 0 && groupAccessibleCompanyIds.length > 0;
  const hasMultipleGroupCompanies = groupAccessibleCompanyIds.length > 1;

  let defaultLandingContext: "portfolio" | "company" = "company";
  if (hasPortfolioAccess && (hasMultipleGroupCompanies || !companyId)) {
    defaultLandingContext = "portfolio";
  }

  let currentRoleContext: PortfolioAccess["currentRoleContext"] = null;
  if (portfolioGroups.length > 0) {
    const hasOwner = portfolioGroups.some(g => g.role === "portfolio_owner");
    currentRoleContext = hasOwner ? "portfolio_owner" : "portfolio_viewer";
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
