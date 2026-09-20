import { prisma } from "@/infrastructure/database/prisma-client";
import type { Prisma } from "@prisma/client";

export async function recordAuditEvent(input: {
  typeKey: string;
  organizationId?: number | null;
  userId?: number | null;
  entity: string;
  entityId: string;
  action: string;
  result?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const type = await prisma.tipoEventoAuditoria.findFirst({
    where: { SClave: input.typeKey, BActivo: true },
  });
  if (!type) return null;

  return prisma.auditoria.create({
    data: {
      IdTipoEventoAuditoria: type.IdTipoEventoAuditoria,
      IdOrganizacion: input.organizationId ?? null,
      IdUsuario: input.userId ?? null,
      SEntidad: input.entity,
      SIdentificadorEntidad: input.entityId,
      SAccion: input.action,
      SResultado: input.result ?? null,
      SDireccionIP: input.ip ?? null,
      SAgenteUsuario: input.userAgent ?? null,
      JMetadatos: input.metadata ?? undefined,
    },
  });
}
