import { storage } from "./storage";
import type { Company, Group } from "@shared/schema";

export interface GroupWithRole extends Group {
  role: string;
  companyCount: number;
}

export interface PortfolioAccessContext {
  directCompanies: Company[];
  groups: GroupWithRole[];
  accessibleCompanies: Company[];
  defaultLandingContext: "company" | "portfolio";
  currentRoleContext: {
    isPortfolioUser: boolean;
    isSuperAdmin: boolean;
    role: string | null;
  };
}

/**
 * Centralized access-resolution service for portfolio/group access.
 *
 * Landing logic:
 * - super_admin: always "company" context (they have their own admin UI)
 * - group membership with multiple accessible companies → "portfolio"
 * - exactly one direct company and no group membership → "company"
 * - both group and direct company access → prefer "portfolio"
 */
export async function resolvePortfolioAccess(userId: string, userRole: string, companyId: string | null): Promise<PortfolioAccessContext> {
  const isSuperAdmin = userRole === "super_admin";

  // Direct companies: the company the user is directly associated with
  const directCompanies: Company[] = [];
  if (companyId) {
    const company = await storage.getCompany(companyId);
    if (company) directCompanies.push(company);
  }

  // Groups the user belongs to with role context and company counts
  const groups: GroupWithRole[] = isSuperAdmin
    ? []
    : await storage.getGroupsForUserWithRoleContext(userId);

  // Accessible companies: union of direct + all group companies, de-duplicated
  const accessibleCompanyMap = new Map<string, Company>();
  for (const c of directCompanies) {
    accessibleCompanyMap.set(c.id, c);
  }

  if (!isSuperAdmin && groups.length > 0) {
    for (const g of groups) {
      const groupCompanies = await storage.getGroupCompanies(g.id);
      for (const c of groupCompanies) {
        accessibleCompanyMap.set(c.id, c);
      }
    }
  }

  const accessibleCompanies = Array.from(accessibleCompanyMap.values());

  // Default landing context determination
  let defaultLandingContext: "company" | "portfolio" = "company";

  if (!isSuperAdmin) {
    const hasGroupMembership = groups.length > 0;
    const multipleAccessible = accessibleCompanies.length > 1;

    if (hasGroupMembership && multipleAccessible) {
      // Portfolio user: group membership gives access to multiple companies
      defaultLandingContext = "portfolio";
    } else if (hasGroupMembership && !multipleAccessible) {
      // Has group but only one company accessible — still prefer portfolio context
      defaultLandingContext = "portfolio";
    } else {
      // Single direct company, no group — use company dashboard
      defaultLandingContext = "company";
    }
  }

  // Current role context
  const isPortfolioUser = groups.length > 0 && !isSuperAdmin;
  const portfolioRole = groups.length > 0 ? groups[0].role : null;

  return {
    directCompanies,
    groups,
    accessibleCompanies,
    defaultLandingContext,
    currentRoleContext: {
      isPortfolioUser,
      isSuperAdmin,
      role: portfolioRole ?? userRole,
    },
  };
}

/**
 * Given a groupId and userId, resolves which companies within the group the user
 * is authorized to access. Returns an empty array if the user has no access.
 */
export async function resolveGroupAccess(userId: string, userRole: string, groupId: string): Promise<{ authorized: boolean; authorizedCompanyIds: string[] }> {
  if (userRole === "super_admin") {
    // Super admin can access all companies in a group
    const groupCompanies = await storage.getGroupCompanies(groupId);
    return { authorized: true, authorizedCompanyIds: groupCompanies.map(c => c.id) };
  }

  const userGroupRoles = await storage.getUserGroupRoles(userId);
  const membership = userGroupRoles.find(r => r.groupId === groupId);
  if (!membership) {
    return { authorized: false, authorizedCompanyIds: [] };
  }

  const groupCompanies = await storage.getGroupCompanies(groupId);
  return { authorized: true, authorizedCompanyIds: groupCompanies.map(c => c.id) };
}
