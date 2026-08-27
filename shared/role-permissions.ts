export type UserRole = "admin" | "contributor" | "approver" | "viewer" | "super_admin";

export type CompanyRole = UserRole | "portfolio_viewer" | "portfolio_owner";

export type PermissionModule =
  | "metrics_data_entry"
  | "policy_editing"
  | "report_generation"
  | "questionnaire_access"
  | "settings_admin"
  | "template_admin"
  | "user_management";

export type ProvisioningAction =
  | "create_company"
  | "update_company_settings"
  | "delete_company"
  | "invite_user"
  | "assign_user_role"
  | "remove_user"
  | "attach_company_to_group"
  | "enter_metric_data"
  | "lock_period"
  | "upload_evidence"
  | "delete_evidence"
  | "generate_report"
  | "generate_report_file"
  | "manage_targets"
  | "manage_esg_actions"
  | "manage_esg_risks"
  | "manage_policies"
  | "manage_governance"
  | "manage_materiality"
  | "manage_questionnaires"
  | "manage_templates"
  | "complete_onboarding";

export const ROLE_PERMISSIONS: Record<UserRole, PermissionModule[]> = {
  admin: ["metrics_data_entry", "policy_editing", "report_generation", "questionnaire_access", "settings_admin", "template_admin", "user_management"],
  super_admin: ["metrics_data_entry", "policy_editing", "report_generation", "questionnaire_access", "settings_admin", "template_admin", "user_management"],
  contributor: ["metrics_data_entry", "questionnaire_access"],
  approver: ["report_generation", "questionnaire_access"],
  viewer: [],
};

export const PROVISIONING_PERMISSIONS: Record<CompanyRole, ProvisioningAction[]> = {
  super_admin: [
    "create_company", "update_company_settings", "delete_company", "invite_user", "assign_user_role", "remove_user",
    "attach_company_to_group", "enter_metric_data", "lock_period", "upload_evidence", "delete_evidence",
    "generate_report", "generate_report_file", "manage_targets", "manage_esg_actions", "manage_esg_risks",
    "manage_policies", "manage_governance", "manage_materiality", "manage_questionnaires", "manage_templates", "complete_onboarding",
  ],
  admin: [
    "create_company", "update_company_settings", "invite_user", "assign_user_role", "remove_user", "attach_company_to_group",
    "enter_metric_data", "lock_period", "upload_evidence", "delete_evidence", "generate_report", "generate_report_file",
    "manage_targets", "manage_esg_actions", "manage_esg_risks", "manage_policies", "manage_governance",
    "manage_materiality", "manage_questionnaires", "manage_templates", "complete_onboarding",
  ],
  contributor: [
    "enter_metric_data", "upload_evidence", "manage_esg_actions", "manage_esg_risks",
    "manage_materiality", "manage_questionnaires", "complete_onboarding",
  ],
  approver: ["generate_report", "generate_report_file", "manage_questionnaires", "complete_onboarding"],
  viewer: [],
  portfolio_owner: ["create_company", "attach_company_to_group"],
  portfolio_viewer: [],
};

export function normalizeUserRole(role: string): UserRole {
  return (role === "editor" ? "contributor" : role) as UserRole;
}

export function hasPermission(role: string | undefined, module: PermissionModule): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[normalizeUserRole(role)]?.includes(module) ?? false;
}

export function getUserPermissions(role: string | undefined): PermissionModule[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[normalizeUserRole(role)] ?? [];
}

export function hasProvisioningPermission(role: string | undefined, action: ProvisioningAction): boolean {
  if (!role) return false;
  if (role === "super_admin") return true;
  const normalized = (role === "editor" ? "contributor" : role) as CompanyRole;
  return PROVISIONING_PERMISSIONS[normalized]?.includes(action) ?? false;
}

export function getAllowedProvisioningActions(role: string | undefined): ProvisioningAction[] {
  if (!role) return [];
  const normalized = (role === "editor" ? "contributor" : role) as CompanyRole;
  return PROVISIONING_PERMISSIONS[normalized] ?? [];
}
