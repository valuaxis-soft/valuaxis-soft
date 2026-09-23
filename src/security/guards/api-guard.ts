import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import type { AuthPermission, AuthUser } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getCurrentSession, renewCurrentSession } from "@/features/auth/services/session.service";

export type ApiGuardResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

/** Pure authorization decision for route handlers: 401 without a user, 403 without the permission. */
export function authorizeApiUser(
  user: AuthUser | null,
  permission?: AuthPermission,
): ApiGuardResult {
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (permission && !hasPermission(user, permission)) {
    return { ok: false, response: NextResponse.json({ error: "Permiso insuficiente" }, { status: 403 }) };
  }
  return { ok: true, user };
}

/**
 * Resolves the session user and checks the permission. Use at the top of every
 * route handler. An authorized request also renews the session, so a user who
 * keeps working is not logged out mid-edit.
 */
export async function requireApiUser(permission?: AuthPermission): Promise<ApiGuardResult> {
  const session = await getCurrentSession();
  const result = authorizeApiUser(session?.user ?? null, permission);
  if (result.ok && session) await renewCurrentSession(session);
  if (!result.ok && session && permission) {
    await recordAuditEvent({
      typeKey: "ACCESO_DENEGADO",
      organizationId: session.organizationId,
      userId: session.user.id,
      entity: "Permiso",
      entityId: permission,
      action: "API_PERMISSION_DENIED",
      result: "RECHAZADO",
    });
  }
  return result;
}
