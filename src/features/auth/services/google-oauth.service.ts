import { setOAuthBinding, statesMatch, takeOAuthBinding } from "../oauth/oauth-binding-cookie";
import { prisma } from "@/infrastructure/database/prisma-client";
import { safeRedirectPath } from "@/security/validation/redirect-safety";
import { createSecureToken, hashToken } from "@/security/tokens/token-hashing";
import { OAUTH_REQUEST_TTL_MINUTES } from "../constants/auth.constants";
import { GoogleOAuthProvider, loadGoogleOAuthConfig, type GoogleOAuthProfile } from "../providers/google-oauth.provider";
import { createOAuthRequest, findOAuthRequestByStateHash } from "../repositories/oauth-request.repository";
import { recordAccessAttempt } from "../repositories/security-event.repository";
import { recordAuditEvent } from "../repositories/audit.repository";
import { resolveDefaultOrganization } from "./organization-access.service";
import { createSecureSession } from "./session.service";
import { createGoogleUserWithOnboarding, ensureUserOrganizationMembership } from "./oauth-onboarding.service";

export type OAuthErrorCode =
  | "oauth_cancelled"
  | "oauth_invalid_state"
  | "oauth_expired"
  | "oauth_provider_error"
  | "oauth_email_unverified"
  | "oauth_account_blocked"
  | "oauth_account_conflict"
  | "oauth_session_error"
  | "oauth_unknown_error";

export class OAuthFlowError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OAuthFlowError";
  }
}

export function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
}

export async function startGoogleOAuth(input: { request: Request; returnTo?: string | null }) {
  const config = loadGoogleOAuthConfig();
  const providerRecord = await prisma.proveedorIdentidad.findFirst({
    where: {
      SClave: "GOOGLE",
      BActivo: true,
      BUsaOAuth: true,
      BPermiteInicioSesion: true,
    },
  });

  if (!providerRecord) {
    throw new OAuthFlowError("oauth_provider_error", "Google provider is not active.");
  }

  const provider = new GoogleOAuthProvider(config);
  const state = createSecureToken(32);
  const nonce = createSecureToken(32);
  // PKCE: the S256 challenge is the base64url SHA-256 of the verifier, which is what hashToken computes.
  const codeVerifier = createSecureToken(48);
  const codeChallenge = hashToken(codeVerifier);
  const returnUrl = safeRedirectPath(input.returnTo);
  const expiresAt = new Date(Date.now() + OAUTH_REQUEST_TTL_MINUTES * 60 * 1000);
  const ip = getRequestIp(input.request);
  const userAgent = input.request.headers.get("user-agent");

  const requestRecord = await createOAuthRequest({
    providerId: providerRecord.IdProveedorIdentidad,
    stateHash: hashToken(state),
    nonceHash: hashToken(nonce),
    codeChallenge,
    returnUrl,
    ip,
    userAgent,
    expiresAt,
  });

  await recordAuditEvent({
    typeKey: "INICIO_SESION",
    entity: "SolicitudOAuth",
    entityId: requestRecord.IdSolicitudOAuth.toString(),
    action: "OAUTH_GOOGLE_START",
    result: "PENDIENTE",
    ip,
    userAgent,
    metadata: { provider: "google", returnUrl },
  });

  await setOAuthBinding(state, codeVerifier);
  return provider.buildAuthorizationUrl({ state, nonce, codeChallenge, returnTo: returnUrl });
}

export async function completeGoogleOAuth(input: {
  request: Request;
  code?: string | null;
  state?: string | null;
  providerError?: string | null;
}) {
  const ip = getRequestIp(input.request);
  const userAgent = input.request.headers.get("user-agent");

  if (input.providerError) {
    await auditOAuthFailure("oauth_cancelled", ip, userAgent);
    throw new OAuthFlowError("oauth_cancelled", "Google OAuth was cancelled.");
  }

  if (!input.code) {
    await auditOAuthFailure("oauth_provider_error", ip, userAgent);
    throw new OAuthFlowError("oauth_provider_error", "Google OAuth did not return a code.");
  }

  if (!input.state) {
    await auditOAuthFailure("oauth_invalid_state", ip, userAgent);
    throw new OAuthFlowError("oauth_invalid_state", "Missing OAuth state.");
  }

  const binding = await takeOAuthBinding();
  if (!binding || !statesMatch(binding.state, input.state)) {
    await auditOAuthFailure("oauth_invalid_state", ip, userAgent);
    throw new OAuthFlowError("oauth_invalid_state", "OAuth state does not belong to this browser.");
  }

  const requestRecord = await consumeOAuthState(input.state);
  if (requestRecord.SCodeVerifierHash && requestRecord.SCodeVerifierHash !== hashToken(binding.codeVerifier)) {
    await auditOAuthFailure("oauth_invalid_state", ip, userAgent, requestRecord.IdSolicitudOAuth.toString());
    throw new OAuthFlowError("oauth_invalid_state", "PKCE verifier does not match the request.");
  }
  const config = loadGoogleOAuthConfig();
  const provider = new GoogleOAuthProvider(config);

  let profile: GoogleOAuthProfile;
  try {
    const tokens = await provider.exchangeCode(input.code, binding.codeVerifier);
    profile = await provider.validateIdToken(tokens.id_token!, requestRecord.SNonceHash ?? "");
  } catch (error) {
    await auditOAuthFailure("oauth_provider_error", ip, userAgent, requestRecord.IdSolicitudOAuth.toString());
    throw new OAuthFlowError("oauth_provider_error", "Google OAuth provider validation failed.", { cause: error });
  }

  if (!profile.emailVerified) {
    await recordAccessAttempt({ email: profile.email, success: false, reason: "GOOGLE_EMAIL_UNVERIFIED", ip });
    await auditOAuthFailure("oauth_email_unverified", ip, userAgent, requestRecord.IdSolicitudOAuth.toString());
    throw new OAuthFlowError("oauth_email_unverified", "Google email is not verified.");
  }

  const result = await linkOrCreateGoogleUser({
    profile,
    providerId: requestRecord.IdProveedorIdentidad,
    requestId: requestRecord.IdSolicitudOAuth,
    ip,
    userAgent,
  }).catch(async (error) => {
    if (error instanceof OAuthFlowError) {
      await recordAccessAttempt({ email: profile.email, success: false, reason: error.code, ip });
      await auditOAuthFailure(error.code, ip, userAgent, requestRecord.IdSolicitudOAuth.toString());
      throw error;
    }
    await recordAccessAttempt({ email: profile.email, success: false, reason: "GOOGLE_ACCOUNT_ERROR", ip });
    await auditOAuthFailure("oauth_unknown_error", ip, userAgent, requestRecord.IdSolicitudOAuth.toString());
    throw new OAuthFlowError("oauth_unknown_error", "Could not resolve Google account.", { cause: error });
  });

  const organization = await resolveDefaultOrganization(result.userId);
  if (!organization) {
    await recordAccessAttempt({ userId: result.userId, email: profile.email, success: false, reason: "NO_ORGANIZATION", ip });
    await auditOAuthFailure("oauth_session_error", ip, userAgent, requestRecord.IdSolicitudOAuth.toString(), result.userId);
    throw new OAuthFlowError("oauth_session_error", "User does not have an active organization.");
  }

  try {
    await createSecureSession({
      userId: result.userId,
      organizationId: organization.organizationId,
      identityId: result.identityId,
      ip,
      userAgent,
    });
  } catch (error) {
    await auditOAuthFailure("oauth_session_error", ip, userAgent, requestRecord.IdSolicitudOAuth.toString(), result.userId);
    throw new OAuthFlowError("oauth_session_error", "Could not create application session.", { cause: error });
  }

  await recordAccessAttempt({ userId: result.userId, email: profile.email, success: true, ip });
  await recordAuditEvent({
    typeKey: "INICIO_SESION",
    organizationId: organization.organizationId,
    userId: result.userId,
    entity: "Usuario",
    entityId: result.userId.toString(),
    action: "OAUTH_GOOGLE_SUCCESS",
    result: "OK",
    ip,
    userAgent,
    metadata: { provider: "google", mode: result.mode },
  });

  return { redirectTo: requestRecord.SURLRetorno ?? "/dashboard" };
}

async function consumeOAuthState(state: string) {
  const stateHash = hashToken(state);
  const requestRecord = await findOAuthRequestByStateHash(stateHash);

  if (!requestRecord || requestRecord.proveedorIdentidad.SClave !== "GOOGLE") {
    throw new OAuthFlowError("oauth_invalid_state", "OAuth state not found.");
  }

  if (requestRecord.BCompletada) {
    throw new OAuthFlowError("oauth_invalid_state", "OAuth state already used.");
  }

  if (requestRecord.DFechaExpiracion <= new Date()) {
    await prisma.solicitudOAuth.update({
      where: { IdSolicitudOAuth: requestRecord.IdSolicitudOAuth },
      data: { BCompletada: true, DFechaFinalizacion: new Date() },
    });
    throw new OAuthFlowError("oauth_expired", "OAuth state expired.");
  }

  await prisma.solicitudOAuth.update({
    where: { IdSolicitudOAuth: requestRecord.IdSolicitudOAuth },
    data: { BCompletada: true, DFechaFinalizacion: new Date() },
  });

  return requestRecord;
}

async function linkOrCreateGoogleUser(input: {
  profile: GoogleOAuthProfile;
  providerId: number;
  requestId: bigint;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.identidadUsuario.findUnique({
      where: {
        IdProveedorIdentidad_SIdentificadorProveedor: {
          IdProveedorIdentidad: input.providerId,
          SIdentificadorProveedor: input.profile.providerUserId,
        },
      },
      include: { usuario: { include: { estadoUsuario: true } } },
    });

    if (existingIdentity) {
      const user = existingIdentity.usuario;
      assertUserCanAccess(user);
      await tx.identidadUsuario.update({
        where: { IdIdentidadUsuario: existingIdentity.IdIdentidadUsuario },
        data: {
          SCorreoProveedor: input.profile.email,
          SNombreProveedor: input.profile.name ?? existingIdentity.SNombreProveedor,
          SImagenProveedor: input.profile.picture ?? existingIdentity.SImagenProveedor,
          BCorreoVerificadoProveedor: input.profile.emailVerified,
          DFechaUltimoAcceso: new Date(),
        },
      });
      await tx.solicitudOAuth.update({
        where: { IdSolicitudOAuth: input.requestId },
        data: { IdUsuario: user.IdUsuario },
      });
      return { userId: user.IdUsuario, identityId: existingIdentity.IdIdentidadUsuario, mode: "existing_identity" as const };
    }

    const existingUser = await tx.usuario.findUnique({
      where: { SCorreo: input.profile.email },
      include: { estadoUsuario: true, identidades: true },
    });

    if (existingUser) {
      assertUserCanAccess(existingUser);
      const conflictingGoogleIdentity = await tx.identidadUsuario.findFirst({
        where: {
          IdUsuario: existingUser.IdUsuario,
          IdProveedorIdentidad: input.providerId,
          BActiva: true,
        },
      });

      if (conflictingGoogleIdentity) {
        throw new OAuthFlowError("oauth_account_conflict", "User already has another Google identity.");
      }

      const identity = await tx.identidadUsuario.create({
        data: {
          IdUsuario: existingUser.IdUsuario,
          IdProveedorIdentidad: input.providerId,
          SIdentificadorProveedor: input.profile.providerUserId,
          SCorreoProveedor: input.profile.email,
          SNombreProveedor: input.profile.name ?? null,
          SImagenProveedor: input.profile.picture ?? null,
          BCorreoVerificadoProveedor: true,
          BPrincipal: existingUser.identidades.length === 0,
        },
      });

      if (!existingUser.BCorreoVerificado) {
        await tx.usuario.update({
          where: { IdUsuario: existingUser.IdUsuario },
          data: { BCorreoVerificado: true, DFechaVerificacionCorreo: new Date() },
        });
      }

      await ensureUserOrganizationMembership(tx, {
        userId: existingUser.IdUsuario,
        name: existingUser.SNombre,
        email: existingUser.SCorreo,
      });
      await tx.solicitudOAuth.update({
        where: { IdSolicitudOAuth: input.requestId },
        data: { IdUsuario: existingUser.IdUsuario },
      });

      return { userId: existingUser.IdUsuario, identityId: identity.IdIdentidadUsuario, mode: "linked_by_email" as const };
    }

    const created = await createGoogleUserWithOnboarding(tx, input.profile, input.providerId);
    await tx.solicitudOAuth.update({
      where: { IdSolicitudOAuth: input.requestId },
      data: { IdUsuario: created.user.IdUsuario },
    });

    return { userId: created.user.IdUsuario, identityId: created.identity.IdIdentidadUsuario, mode: "created_user" as const };
  });
}

function assertUserCanAccess(user: {
  BActivo: boolean;
  DFechaEliminacion: Date | null;
  DFechaBloqueoTemporal: Date | null;
  estadoUsuario: { BPermiteAcceso: boolean };
}) {
  if (!user.BActivo || user.DFechaEliminacion || !user.estadoUsuario.BPermiteAcceso) {
    throw new OAuthFlowError("oauth_account_blocked", "User cannot access.");
  }

  if (user.DFechaBloqueoTemporal && user.DFechaBloqueoTemporal.getTime() > Date.now()) {
    throw new OAuthFlowError("oauth_account_blocked", "User is temporarily blocked.");
  }
}

async function auditOAuthFailure(
  code: OAuthErrorCode,
  ip?: string | null,
  userAgent?: string | null,
  requestId = "google",
  userId?: number | null,
) {
  await recordAuditEvent({
    typeKey: "ACCESO_DENEGADO",
    userId: userId ?? null,
    entity: "SolicitudOAuth",
    entityId: requestId,
    action: "OAUTH_GOOGLE_FAILURE",
    result: code,
    ip,
    userAgent,
    metadata: { provider: "google", code },
  });
}
