import { useQuery } from "@tanstack/react-query";
import { type UserRole, type PermissionModule, ROLE_PERMISSIONS } from "@shared/schema";

export function hasPermission(role: string | undefined, module: PermissionModule): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as UserRole];
  if (!permissions) return false;
  return permissions.includes(module);
}

export function getUserPermissions(role: string | undefined): PermissionModule[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role as UserRole] || [];
}

export function usePermissions() {
  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const role = authData?.user?.role as UserRole | undefined;

  return {
    role,
    can: (module: PermissionModule) => hasPermission(role, module),
    isAdmin: role === "admin",
    isContributor: role === "contributor",
    isApprover: role === "approver",
    isViewer: role === "viewer",
    permissions: getUserPermissions(role),
  };
}
