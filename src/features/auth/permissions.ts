import { AUTH_PERMISSIONS, type AuthPermission, type AuthUser } from "./model";

export function hasPermission(
  user: Pick<AuthUser, "active" | "permissions"> | null | undefined,
  permission: AuthPermission,
) {
  if (!user?.active) return false;
  return user.permissions.includes(permission);
}

export const canViewProjects = (user: AuthUser | null | undefined) =>
  hasPermission(user, AUTH_PERMISSIONS.viewValuations);

export const canEditProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, AUTH_PERMISSIONS.editValuations);

export const canExportProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, AUTH_PERMISSIONS.exportValuations);
