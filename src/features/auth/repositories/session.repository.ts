import { prisma } from "@/infrastructure/database/prisma-client";

export function createSessionRecord(input: {
  userId: number;
  organizationId: number;
  tokenHash: string;
  identityId?: bigint | null;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}) {
  return prisma.sesion.create({
    data: {
      IdUsuario: input.userId,
      IdOrganizacion: input.organizationId,
      IdIdentidadUsuario: input.identityId ?? null,
      STokenHash: input.tokenHash,
      SDireccionIP: input.ip ?? null,
      SAgenteUsuario: input.userAgent ?? null,
      DFechaExpiracion: input.expiresAt,
      DFechaUltimaActividad: new Date(),
    },
  });
}

export function findActiveSessionByHash(tokenHash: string) {
  return prisma.sesion.findFirst({
    where: {
      STokenHash: tokenHash,
      BRevocada: false,
      DFechaExpiracion: { gt: new Date() },
    },
    include: {
      usuario: { include: { estadoUsuario: true } },
      organizacion: true,
    },
  });
}

export function touchSession(sessionId: number) {
  return prisma.sesion.update({
    where: { IdSesion: sessionId },
    data: { DFechaUltimaActividad: new Date() },
  });
}

export function extendSession(sessionId: number, expiresAt: Date) {
  return prisma.sesion.updateMany({
    where: { IdSesion: sessionId, BRevocada: false },
    data: { DFechaExpiracion: expiresAt, DFechaRotacion: new Date() },
  });
}

export function revokeSessionByHash(tokenHash: string) {
  return prisma.sesion.updateMany({
    where: { STokenHash: tokenHash, BRevocada: false },
    data: { BRevocada: true, DFechaRevocacion: new Date() },
  });
}

export function revokeUserSessions(userId: number) {
  return prisma.sesion.updateMany({
    where: { IdUsuario: userId, BRevocada: false },
    data: { BRevocada: true, DFechaRevocacion: new Date() },
  });
}

export function updateSessionOrganization(sessionId: number, userId: number, organizationId: number) {
  return prisma.sesion.updateMany({
    where: {
      IdSesion: sessionId,
      IdUsuario: userId,
      BRevocada: false,
      DFechaExpiracion: { gt: new Date() },
    },
    data: { IdOrganizacion: organizationId, DFechaUltimaActividad: new Date() },
  });
}
