import { prisma } from "@/infrastructure/database/prisma-client";

export function findUserForLogin(email: string) {
  return prisma.usuario.findFirst({
    where: {
      SCorreo: email,
      DFechaEliminacion: null,
    },
    include: {
      estadoUsuario: true,
      identidades: {
        where: { BActiva: true },
        include: { proveedorIdentidad: true },
      },
    },
  });
}

export function findUserByEmail(email: string) {
  return prisma.usuario.findFirst({
    where: {
      SCorreo: email,
      DFechaEliminacion: null,
    },
  });
}

export function resetLoginFailures(userId: number) {
  return prisma.usuario.update({
    where: { IdUsuario: userId },
    data: {
      IReintentosConsecutivos: 0,
      DFechaBloqueoTemporal: null,
      DFechaUltimoAcceso: new Date(),
    },
  });
}

export function incrementLoginFailures(userId: number, lockedUntil: Date | null) {
  return prisma.usuario.update({
    where: { IdUsuario: userId },
    data: {
      IReintentosConsecutivos: { increment: 1 },
      DFechaBloqueoTemporal: lockedUntil,
    },
  });
}

export function markEmailVerified(userId: number) {
  return prisma.usuario.update({
    where: { IdUsuario: userId },
    data: {
      BCorreoVerificado: true,
      DFechaVerificacionCorreo: new Date(),
    },
  });
}

export function updatePassword(userId: number, passwordHash: string) {
  return prisma.usuario.update({
    where: { IdUsuario: userId },
    data: {
      SContrasenaHash: passwordHash,
      DFechaCambioContrasena: new Date(),
      IReintentosConsecutivos: 0,
      DFechaBloqueoTemporal: null,
    },
  });
}
