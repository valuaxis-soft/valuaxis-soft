import { prisma } from "@/infrastructure/database/prisma-client";

export function recordAccessAttempt(input: {
  userId?: number | null;
  email: string;
  success: boolean;
  reason?: string | null;
  ip?: string | null;
}) {
  return prisma.intentoAcceso.create({
    data: {
      IdUsuario: input.userId ?? null,
      SCorreoIntentado: input.email,
      BExitoso: input.success,
      SMotivoFallo: input.reason ?? null,
      SDireccionIP: input.ip ?? null,
    },
  });
}
