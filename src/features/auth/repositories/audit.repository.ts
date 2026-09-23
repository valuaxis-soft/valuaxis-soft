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
  try {
    const type = await prisma.tipoEventoAuditoria.findFirst({
      where: { SClave: input.typeKey, BActivo: true },
    });
    if (!type) {
      console.warn(`[AUDIT] Missing audit event type ${input.typeKey}; event ${input.action} not recorded.`);
      return null;
    }

    return await prisma.auditoria.create({
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
  } catch (error) {
    // Auditing must never break the operation it records.
    console.error(`[AUDIT] Could not record ${input.action}`, error);
    return null;
  }
}
