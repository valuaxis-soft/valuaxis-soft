import { NextResponse } from "next/server";
import type { AuthPermission, AuthUser } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getCurrentUser } from "@/features/auth/session";

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

/** Resolves the session user and checks the permission. Use at the top of every route handler. */
export async function requireApiUser(permission?: AuthPermission): Promise<ApiGuardResult> {
  return authorizeApiUser(await getCurrentUser(), permission);
}
