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

export type CompanyRole =
  | "admin"
  | "contributor"
  | "approver"
  | "viewer"
  | "portfolio_viewer"
  | "portfolio_owner"
  | "super_admin";

export type PlatformSuperAdminLike = {
  role?: string | null;
} | null | undefined;

export type ProvisioningAction =
  // Company management
  | "create_company"
  | "update_company_settings"
  | "delete_company"
  // User/role management
  | "invite_user"
  | "assign_user_role"
  | "remove_user"
  // Group/company linking
  | "attach_company_to_group"
  // Metric entry
  | "enter_metric_data"
  | "lock_period"
  // Evidence
  | "upload_evidence"
  | "delete_evidence"
  // Reports
  | "generate_report"
  | "generate_report_file"
  // Targets
  | "manage_targets"
  // Actions / risks
  | "manage_esg_actions"
  | "manage_esg_risks"
  // Policy / governance
  | "manage_policies"
  | "manage_governance"
  | "manage_materiality"
  // Questionnaires
  | "manage_questionnaires"
  // Platform templates (admin only)
  | "manage_templates"
  // Onboarding
  | "complete_onboarding";

/**
 * Maps each role to the set of provisioning actions it is allowed to perform.
 * super_admin is unrestricted and is handled as a special case in the guards.
 */
const PROVISIONING_PERMISSIONS: Record<CompanyRole, ProvisioningAction[]> = {
  super_admin: [
    "create_company",
    "update_company_settings",
    "delete_company",
    "invite_user",
    "assign_user_role",
    "remove_user",
    "attach_company_to_group",
    "enter_metric_data",
    "lock_period",
    "upload_evidence",
    "delete_evidence",
    "generate_report",
    "generate_report_file",
    "manage_targets",
    "manage_esg_actions",
    "manage_esg_risks",
    "manage_policies",
    "manage_governance",
    "manage_materiality",
    "manage_questionnaires",
    "manage_templates",
    "complete_onboarding",
  ],
  admin: [
    "create_company",
    "update_company_settings",
    "invite_user",
    "assign_user_role",
    "remove_user",
    "attach_company_to_group",
    "enter_metric_data",
    "lock_period",
    "upload_evidence",
    "delete_evidence",
    "generate_report",
    "generate_report_file",
    "manage_targets",
    "manage_esg_actions",
    "manage_esg_risks",
    "manage_policies",
    "manage_governance",
    "manage_materiality",
    "manage_questionnaires",
    "manage_templates",
    "complete_onboarding",
  ],
  contributor: [
    "enter_metric_data",
    "upload_evidence",
    "manage_esg_actions",
    "manage_esg_risks",
    "manage_materiality",
    "manage_questionnaires",
    "complete_onboarding",
  ],
  approver: [
    "generate_report",
    "generate_report_file",
    "enter_metric_data",
    "upload_evidence",
    "manage_questionnaires",
    "complete_onboarding",
  ],
  viewer: [],
  portfolio_owner: [
    "create_company",
    "attach_company_to_group",
  ],
  portfolio_viewer: [],
};

/**
 * Returns true if the given role is permitted to perform the given action.
 * Always returns true for super_admin.
 */
export function hasProvisioningPermission(role: string | undefined, action: ProvisioningAction): boolean {
  if (!role) return false;
  if (role === "super_admin") return true;
  const normalizedRole = (role === "editor" ? "contributor" : role) as CompanyRole;
  const allowed = PROVISIONING_PERMISSIONS[normalizedRole];
  if (!allowed) return false;
  return allowed.includes(action);
}

/**
 * Returns the full list of actions allowed for a given role.
 */
export function getAllowedActions(role: string | undefined): ProvisioningAction[] {
  if (!role) return [];
  if (role === "super_admin") return PROVISIONING_PERMISSIONS.super_admin;
  const normalizedRole = (role === "editor" ? "contributor" : role) as CompanyRole;
  return PROVISIONING_PERMISSIONS[normalizedRole] ?? [];
}

export function isPlatformSuperAdmin(user: PlatformSuperAdminLike): boolean {
  return !!user && user.role === "super_admin";
}

/**
 * Human-readable description of each role's capabilities for debugging / admin display.
 */
export const ROLE_CAPABILITY_SUMMARY: Record<string, string> = {
  super_admin: "Unrestricted platform-wide access — can perform all provisioning actions.",
  admin: "Full company admin — can manage users, settings, metrics, evidence, reports, targets, and governance.",
  contributor: "Can enter metric data, upload evidence, and manage ESG actions, risks, and materiality topics.",
  viewer: "Read-only access — cannot write any data.",
  portfolio_owner: "Can create companies and attach companies to groups they own.",
  portfolio_viewer: "Read-only portfolio access — cannot write any data.",
};
