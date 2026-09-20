const authRoles = ["ADMINISTRADOR", "VALUADOR", "REVISOR", "CONSULTA", "USUARIO"] as const;

export type AuthRole = (typeof authRoles)[number];

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  active: boolean;
  organizationId: number;
  organizationName: string;
};

const authPermissions = [
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
] as const;

export type AuthPermission = (typeof authPermissions)[number];
