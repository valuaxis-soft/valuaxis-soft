/**
 * Roles and permissions come from the database (Rol, Permiso, PermisoRol).
 * Roles are editable data, so they are plain strings. Permission keys are the
 * ones seeded by migrations 004 and 028.
 */
export type AuthRole = string;

export const AUTH_PERMISSIONS = {
  viewValuations: "AVALUO_VER",
  createValuations: "AVALUO_CREAR",
  editValuations: "AVALUO_EDITAR",
  reviewValuations: "AVALUO_REVISAR",
  concludeValuations: "AVALUO_CONCLUIR",
  reopenValuations: "AVALUO_REABRIR",
  duplicateValuations: "AVALUO_DUPLICAR",
  exportValuations: "AVALUO_EXPORTAR",
  printValuations: "AVALUO_IMPRIMIR",
  shareValuations: "AVALUO_COMPARTIR",
  manageCatalogs: "CATALOGO_ADMINISTRAR",
  manageUsers: "USUARIO_ADMINISTRAR",
  manageComparables: "COMPARABLE_ADMINISTRAR",
  manageTemplates: "PLANTILLA_ADMINISTRAR",
  manageSubscription: "SUSCRIPCION_ADMINISTRAR",
  viewBilling: "FACTURACION_VER",
  manageBilling: "FACTURACION_ADMINISTRAR",
} as const;

export type AuthPermission = (typeof AUTH_PERMISSIONS)[keyof typeof AUTH_PERMISSIONS];

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  /** Active permission keys granted by the user's role in the active organization. */
  permissions: string[];
  active: boolean;
  organizationId: number;
  organizationName: string;
};
