import { prisma } from "@/infrastructure/database/prisma-client";
import { recordAuditEvent } from "../repositories/audit.repository";
import { hashToken, createSecureToken } from "@/security/tokens/token-hashing";
import { getEmailService } from "@/infrastructure/email/email.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import { EMAIL_TOKEN_TTL_MINUTES } from "../constants/auth.constants";
import { markEmailVerified } from "../repositories/user.repository";

export async function createEmailVerificationToken(input: {
  userId: number;
  email: string;
  name: string;
}) {
  await prisma.tokenVerificacionCorreo.updateMany({
    where: {
      IdUsuario: input.userId,
      BUtilizado: false,
      DFechaRevocacion: null,
    },
    data: { DFechaRevocacion: new Date() },
  });

  const token = createSecureToken();
  await prisma.tokenVerificacionCorreo.create({
    data: {
      IdUsuario: input.userId,
      STokenHash: hashToken(token),
      SCorreoDestino: input.email,
      DFechaExpiracion: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  await getEmailService().sendVerificationEmail({
    to: input.email,
    name: input.name,
    verificationUrl: buildPublicAppUrl(`/verificar-correo?token=${encodeURIComponent(token)}`).toString(),
  });
}

export async function consumeEmailVerificationToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.tokenVerificacionCorreo.findUnique({
    where: { STokenHash: tokenHash },
  });

  if (!record || record.BUtilizado || record.DFechaRevocacion || record.DFechaExpiracion <= new Date()) {
    return false;
  }

  await prisma.$transaction([
    markEmailVerified(record.IdUsuario),
    prisma.tokenVerificacionCorreo.update({
      where: { IdTokenVerificacionCorreo: record.IdTokenVerificacionCorreo },
      data: { BUtilizado: true, DFechaUtilizacion: new Date() },
    }),
  ]);
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    userId: record.IdUsuario,
    entity: "Usuario",
    entityId: String(record.IdUsuario),
    action: "EMAIL_VERIFIED",
    result: "EXITOSO",
  });

  return true;
}
