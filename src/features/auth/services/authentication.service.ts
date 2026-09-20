import { verifyPassword } from "./password.service";
import { createSecureSession } from "./session.service";
import { resolveDefaultOrganization } from "./organization-access.service";
import { findUserForLogin, incrementLoginFailures, resetLoginFailures } from "../repositories/user.repository";
import { recordAccessAttempt } from "../repositories/security-event.repository";
import { isTemporarilyLocked, nextLockDate } from "../rules/authentication.rules";

export type PasswordAuthenticationFailureReason =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_USES_GOOGLE"
  | "EMAIL_NOT_VERIFIED"
  | "ORGANIZATION_INACTIVE"
  | "SESSION_CREATION_FAILED";

export async function authenticateWithPassword(input: {
  email: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: PasswordAuthenticationFailureReason }> {
  const user = await findUserForLogin(input.email);

  if (!user) {
    await recordAccessAttempt({ email: input.email, success: false, reason: "NO_MATCH", ip: input.ip });
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  if (!user.BActivo || !user.estadoUsuario.BPermiteAcceso || isTemporarilyLocked(user.DFechaBloqueoTemporal)) {
    await recordAccessAttempt({ userId: user.IdUsuario, email: input.email, success: false, reason: "ACCESS_BLOCKED", ip: input.ip });
    return {
      ok: false,
      reason: isTemporarilyLocked(user.DFechaBloqueoTemporal) ? "ACCOUNT_BLOCKED" : "ACCOUNT_INACTIVE",
    };
  }

  if (!user.SContrasenaHash) {
    await recordAccessAttempt({ userId: user.IdUsuario, email: input.email, success: false, reason: "PASSWORD_NOT_CONFIGURED", ip: input.ip });
    const usesGoogle = user.identidades.some((identity) => identity.proveedorIdentidad.SClave === "GOOGLE");
    return { ok: false, reason: usesGoogle ? "ACCOUNT_USES_GOOGLE" : "INVALID_CREDENTIALS" };
  }

  const valid = await verifyPassword(input.password, user.SContrasenaHash);
  if (!valid) {
    await incrementLoginFailures(user.IdUsuario, nextLockDate(user.IReintentosConsecutivos));
    await recordAccessAttempt({ userId: user.IdUsuario, email: input.email, success: false, reason: "INVALID_PASSWORD", ip: input.ip });
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  if (!user.BCorreoVerificado) {
    await recordAccessAttempt({ userId: user.IdUsuario, email: input.email, success: false, reason: "EMAIL_NOT_VERIFIED", ip: input.ip });
    return { ok: false, reason: "EMAIL_NOT_VERIFIED" };
  }

  const organization = await resolveDefaultOrganization(user.IdUsuario);
  if (!organization) {
    await recordAccessAttempt({ userId: user.IdUsuario, email: input.email, success: false, reason: "NO_ORGANIZATION", ip: input.ip });
    return { ok: false, reason: "ORGANIZATION_INACTIVE" };
  }

  await resetLoginFailures(user.IdUsuario);
  await recordAccessAttempt({ userId: user.IdUsuario, email: input.email, success: true, ip: input.ip });
  try {
    await createSecureSession({
      userId: user.IdUsuario,
      organizationId: organization.organizationId,
      identityId: user.identidades.find((identity) => identity.proveedorIdentidad.SClave === "LOCAL")?.IdIdentidadUsuario ?? null,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  } catch (error) {
    console.error("[AUTH] Session creation failed", error);
    return { ok: false, reason: "SESSION_CREATION_FAILED" };
  }

  return { ok: true };
}
