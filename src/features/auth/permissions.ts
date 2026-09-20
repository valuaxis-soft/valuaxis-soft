import type { AuthPermission, AuthRole, AuthUser } from "./model";

const rolePermissions: Record<AuthRole, AuthPermission[]> = {
  ADMINISTRADOR: [
    "projects.view",
    "projects.create",
    "projects.edit",
    "projects.review",
    "projects.complete",
    "projects.reopen",
    "projects.duplicate",
    "projects.export",
    "catalogs.manage",
    "users.manage",
  ],
  VALUADOR: [
    "projects.view",
    "projects.create",
    "projects.edit",
    "projects.complete",
    "projects.duplicate",
    "projects.export",
  ],
  REVISOR: [
    "projects.view",
    "projects.review",
    "projects.complete",
    "projects.reopen",
    "projects.export",
  ],
  CONSULTA: ["projects.view", "projects.export"],
  USUARIO: ["projects.view"],
};

export function getRolePermissions(role: AuthRole): AuthPermission[] {
  return rolePermissions[role];
}

export function hasPermission(
  user: Pick<AuthUser, "role" | "active"> | null | undefined,
  permission: AuthPermission,
) {
  if (!user?.active) return false;
  return rolePermissions[user.role].includes(permission);
}

export const canViewProjects = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.view");

export const canCreateProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.create");

export const canEditProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.edit");

export const canReviewProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.review");

export const canCompleteProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.complete");

export const canReopenProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.reopen");

export const canDuplicateProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.duplicate");

export const canExportProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, "projects.export");

export const canManageCatalogs = (user: AuthUser | null | undefined) =>
  hasPermission(user, "catalogs.manage");

export const canManageUsers = (user: AuthUser | null | undefined) =>
  hasPermission(user, "users.manage");
