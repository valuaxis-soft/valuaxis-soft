import { clearSessionCookie, getSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { createSecureToken, hashToken } from "@/security/tokens/token-hashing";
import { buildSessionExpiration, computeRenewedExpiration } from "../rules/session.rules";
import {
  createSessionRecord,
  extendSession,
  findActiveSessionByHash,
  revokeSessionByHash,
  revokeUserSessions as revokeUserSessionsRepository,
  touchSession,
} from "../repositories/session.repository";
import type { AuthenticatedUser } from "../types/auth.types";
import { resolveActiveOrganization } from "./organization-access.service";

export async function createSecureSession(input: {
  userId: number;
  organizationId: number;
  identityId?: bigint | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = createSecureToken();
  const tokenHash = hashToken(token);
  const session = await createSessionRecord({
    ...input,
    tokenHash,
    expiresAt: buildSessionExpiration(),
  });

  await setSessionCookie(token);
  return session;
}

export async function getCurrentSession() {
  const token = await getSessionCookie();
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await findActiveSessionByHash(tokenHash);
  if (!session || !session.usuario.BActivo || session.usuario.DFechaEliminacion) return null;
  if (!session.usuario.estadoUsuario.BPermiteAcceso) return null;
  if (!session.organizacion.BActivo || session.organizacion.DFechaEliminacion) return null;

  const activeOrganization = await resolveActiveOrganization(session.usuario.IdUsuario, session.IdOrganizacion);
  if (!activeOrganization) return null;

  await touchSession(session.IdSesion);

  const user: AuthenticatedUser = {
    id: session.usuario.IdUsuario,
    publicId: session.usuario.UIdentificadorPublico,
    name: `${session.usuario.SNombre} ${session.usuario.SApellidoPaterno ?? ""}`.trim(),
    email: session.usuario.SCorreo,
    role: activeOrganization.role,
    permissions: activeOrganization.permissions,
    active: session.usuario.BActivo,
    emailVerified: session.usuario.BCorreoVerificado,
    organizationId: activeOrganization.organizationId,
    organizationName: activeOrganization.organizationName,
  };

  return {
    sessionId: session.IdSesion,
    user,
    organizationId: session.IdOrganizacion,
    createdAt: session.DFechaCreacion,
    expiresAt: session.DFechaExpiracion,
  };
}

export type CurrentSession = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;

/**
 * Extends an active session and its cookie (sliding expiration). Only call it
 * where cookies can be written: route handlers and server actions.
 * Returns the session's effective expiration.
 */
export async function renewCurrentSession(session: CurrentSession): Promise<Date> {
  const renewed = computeRenewedExpiration({ createdAt: session.createdAt, expiresAt: session.expiresAt });
  if (!renewed) return session.expiresAt;

  const token = await getSessionCookie();
  if (!token) return session.expiresAt;
  await extendSession(session.sessionId, renewed);
  await setSessionCookie(token, Math.floor((renewed.getTime() - Date.now()) / 1000));
  return renewed;
}

export async function revokeCurrentSession() {
  const token = await getSessionCookie();
  if (token) {
    await revokeSessionByHash(hashToken(token));
  }
  await clearSessionCookie();
}

export function revokeUserSessions(userId: number) {
  return revokeUserSessionsRepository(userId);
}
