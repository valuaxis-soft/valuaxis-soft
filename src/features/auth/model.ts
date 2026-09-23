export type AuthRole = "ADMINISTRADOR" | "VALUADOR" | "REVISOR" | "CONSULTA" | "USUARIO";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  active: boolean;
  organizationId: number;
  organizationName: string;
};

export type AuthPermission =
  | "projects.view"
  | "projects.create"
  | "projects.edit"
  | "projects.review"
  | "projects.complete"
  | "projects.reopen"
  | "projects.duplicate"
  | "projects.export"
  | "catalogs.manage"
  | "users.manage";
