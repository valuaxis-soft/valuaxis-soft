import { prisma } from "@/infrastructure/database/prisma-client";
import { createSecureToken, hashToken } from "@/security/tokens/token-hashing";
import { emailService } from "@/infrastructure/email/email.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import { PASSWORD_RESET_TTL_MINUTES } from "../constants/auth.constants";
import { findUserByEmail, updatePassword } from "../repositories/user.repository";
import { hashPassword } from "./password.service";
import { revokeUserSessions } from "./session.service";

export async function requestPasswordRecovery(email: string, ip?: string | null, userAgent?: string | null) {
  const user = await findUserByEmail(email);
  if (!user) return;

  await prisma.tokenRecuperacionContrasena.updateMany({
    where: {
      IdUsuario: user.IdUsuario,
      BUtilizado: false,
      DFechaRevocacion: null,
    },
    data: { DFechaRevocacion: new Date() },
  });

  const token = createSecureToken();
  await prisma.tokenRecuperacionContrasena.create({
    data: {
      IdUsuario: user.IdUsuario,
      STokenHash: hashToken(token),
      SDireccionIPSolicitud: ip ?? null,
      SAgenteUsuarioSolicitud: userAgent ?? null,
      DFechaExpiracion: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
    },
  });

  await emailService.sendPasswordResetEmail({
    to: user.SCorreo,
    name: user.SNombre,
    resetUrl: buildPublicAppUrl(`/restablecer-contrasena?token=${encodeURIComponent(token)}`).toString(),
  });
}

export async function consumePasswordRecoveryToken(token: string, password: string) {
  const record = await prisma.tokenRecuperacionContrasena.findUnique({
    where: { STokenHash: hashToken(token) },
  });

  if (!record || record.BUtilizado || record.DFechaRevocacion || record.DFechaExpiracion <= new Date()) {
    return false;
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    updatePassword(record.IdUsuario, passwordHash),
    prisma.tokenRecuperacionContrasena.update({
      where: { IdTokenRecuperacionContrasena: record.IdTokenRecuperacionContrasena },
      data: { BUtilizado: true, DFechaUtilizacion: new Date() },
    }),
    revokeUserSessions(record.IdUsuario),
  ]);

  return true;
}
