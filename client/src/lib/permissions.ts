import { useQuery } from "@tanstack/react-query";
import {
  getUserPermissions as getCanonicalUserPermissions,
  hasPermission as hasCanonicalPermission,
  type UserRole,
  type PermissionModule,
} from "@shared/schema";

export function hasPermission(role: string | undefined, module: PermissionModule): boolean {
  return hasCanonicalPermission(role, module);
}

export function getUserPermissions(role: string | undefined): PermissionModule[] {
  return getCanonicalUserPermissions(role);
}

export function usePermissions() {
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const role = authData?.user?.role as UserRole | undefined;

  return {
    role,
    can: (module: PermissionModule) => hasPermission(role, module),
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    isContributor: role === "contributor",
    isApprover: role === "approver",
    isViewer: role === "viewer",
    permissions: getUserPermissions(role),
  };
}

/**
 * Maps a role value to a friendly display name.
 */
export function getRoleLabel(role: string | undefined): string {
  switch (role) {
    case "super_admin":     return "Super Admin";
    case "admin":           return "Company Admin";
    case "contributor":
    case "editor":          return "Editor";
    case "approver":        return "Approver";
    case "viewer":          return "Viewer";
    case "portfolio_owner": return "Portfolio Owner";
    case "portfolio_viewer":return "Portfolio Viewer";
    default:                return role ?? "Unknown";
  }
}

/**
 * For a given PermissionModule, returns a plain-English string of
 * the roles that can perform it.
 *
 * Example: whoCanDo("metrics_data_entry") → "Editors or Company Admins"
 */
export function whoCanDo(module: PermissionModule): string {
  switch (module) {
    case "metrics_data_entry":
      return "Editors or Company Admins";
    case "policy_editing":
      return "Company Admins only";
    case "report_generation":
      return "Approvers or Company Admins";
    case "questionnaire_access":
      return "Editors, Approvers, or Company Admins";
    case "settings_admin":
      return "Company Admins only";
    case "template_admin":
      return "Company Admins only";
    case "user_management":
      return "Company Admins only";
    default:
      return "users with the appropriate role";
  }
}

/**
 * Returns the "what to do next" guidance for a permission module.
 */
export function getNextStepForModule(module: PermissionModule): string {
  switch (module) {
    case "metrics_data_entry":
      return "Ask your Company Admin to update your role to Editor if you need to enter data.";
    case "policy_editing":
      return "Only Company Admins can edit policies. Contact your Company Admin.";
    case "report_generation":
      return "Ask your Company Admin to give you the Approver role if you need to generate or approve reports.";
    case "questionnaire_access":
      return "Ask your Company Admin to update your role if you need to complete questionnaires.";
    case "settings_admin":
      return "Only Company Admins can change settings. Contact your Company Admin.";
    case "template_admin":
      return "Only Company Admins can manage templates. Contact your Company Admin.";
    case "user_management":
      return "Only Company Admins can manage team members. Contact your Company Admin.";
    default:
      return "Ask your Company Admin if you need access.";
  }
}

/**
 * Returns a full structured permission context for the given module —
 * what the user cannot do, who can, and what to do next.
 */
export function getPermissionContext(module: PermissionModule, action?: string): {
  message: string;
  who: string;
  nextStep: string;
} {
  const who = whoCanDo(module);
  const label = action ?? "do this";
  return {
    message: `Only ${who} can ${label}.`,
    who,
    nextStep: getNextStepForModule(module),
  };
}
