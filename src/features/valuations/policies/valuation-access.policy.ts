import type { AuthPermission, AuthUser } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";

export type PolicyResult = { ok: true } | { ok: false; error: string; status: number };

export function requirePermissionPolicy(user: AuthUser, permission: AuthPermission): PolicyResult {
  if (!hasPermission(user, permission)) {
    return { ok: false, error: "Permiso insuficiente", status: 403 };
  }
  return { ok: true };
}

export function requireValuationAccessPolicy(
  valuation: ValuationDetail | null,
  organizationId: number,
): PolicyResult {
  if (!valuation) return { ok: false, error: "Avaluo no encontrado", status: 404 };
  if (valuation.user.id && organizationId <= 0) {
    return { ok: false, error: "Organizacion invalida", status: 403 };
  }
  return { ok: true };
}

export function requireEditableValuationPolicy(valuation: ValuationDetail): PolicyResult {
  if (valuation.status === "terminado" || valuation.status === "finalizado") {
    return { ok: false, error: "El avaluo finalizado no permite edicion", status: 409 };
  }
  return { ok: true };
}
