/**
 * Company Provisioning Permission Matrix
 *
 * Defines the authoritative role/permission mapping for all company-level
 * write operations. Every route handler that mutates company data must
 * reference this module and call the appropriate guard.
 *
 * Roles:
 *   company_admin     — admin role scoped to a specific company
 *   contributor       — can enter data; cannot manage users or settings
 *   viewer            — read-only; cannot write anything
 *   portfolio_viewer  — read-only across group companies
 *   portfolio_owner   — can create companies in a group; cannot write company data
 *   super_admin       — unrestricted platform-wide access
 */

import {
  getAllowedProvisioningActions,
  hasProvisioningPermission,
  type ProvisioningAction,
} from "@shared/role-permissions";

export type { CompanyRole, ProvisioningAction } from "@shared/role-permissions";

export type PlatformSuperAdminLike = {
  role?: string | null;
} | null | undefined;

/**
 * Returns the full list of actions allowed for a given role.
 */
export function getAllowedActions(role: string | undefined): ProvisioningAction[] {
  return getAllowedProvisioningActions(role);
}

export { hasProvisioningPermission };

export function isPlatformSuperAdmin(user: PlatformSuperAdminLike): boolean {
  return !!user && user.role === "super_admin";
}

/**
 * Human-readable description of each role's capabilities for debugging / admin display.
 */
export const ROLE_CAPABILITY_SUMMARY: Record<string, string> = {
  super_admin: "Unrestricted platform-wide access — can perform all provisioning actions.",
  admin: "Full company admin — can manage users, settings, metrics, evidence, reports, targets, and governance.",
  contributor: "Can enter metric data, upload evidence, and manage ESG actions, risks, materiality topics, and questionnaires.",
  approver: "Can review and generate reports and complete questionnaires; metric data and evidence remain read-only.",
  viewer: "Read-only access — cannot write any data.",
  portfolio_owner: "Can create companies and attach companies to groups they own.",
  portfolio_viewer: "Read-only portfolio access — cannot write any data.",
};
