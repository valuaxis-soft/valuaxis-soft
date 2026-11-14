import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { prisma } from "@/infrastructure/database/prisma-client";
import { clientIp } from "@/security/rate-limit/rate-limiter";

type ValuationAuditAction =
  | "CREATE" | "CONCLUDE" | "REOPEN" | "DELETE" | "EXPORT" | "ARCHIVE" | "DUPLICATE"
  | "RESTORE" | "PURGE" | "SAVE" | "UPDATE_DATA" | "REVIEW_SUBMIT" | "REVIEW_APPROVE" | "REVIEW_RETURN";

const TYPE_BY_ACTION: Record<ValuationAuditAction, string> = {
  CREATE: "CREACION",
  CONCLUDE: "FINALIZACION",
  REOPEN: "REAPERTURA",
  DELETE: "ELIMINACION_LOGICA",
  EXPORT: "EXPORTACION",
  ARCHIVE: "CAMBIO_ESTADO",
  DUPLICATE: "CREACION",
  RESTORE: "RESTAURACION",
  PURGE: "ELIMINACION_LOGICA",
  SAVE: "MODIFICACION",
  UPDATE_DATA: "MODIFICACION",
  REVIEW_SUBMIT: "CAMBIO_ESTADO",
  REVIEW_APPROVE: "CAMBIO_ESTADO",
  REVIEW_RETURN: "CAMBIO_ESTADO",
};

/** Records who did what to which valuation, from where. */
export function auditValuation(input: {
  action: ValuationAuditAction;
  user: AuthUser;
  valuationPublicId: string;
  request: Request;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  return recordAuditEvent({
    typeKey: TYPE_BY_ACTION[input.action],
    organizationId: input.user.organizationId,
    userId: input.user.id,
    entity: "Avaluo",
    entityId: input.valuationPublicId,
    action: `VALUATION_${input.action}`,
    result: "EXITOSO",
    ip: clientIp(input.request.headers),
    userAgent: input.request.headers.get("user-agent"),
    metadata: input.metadata,
  });
}

/**
 * The editor saves on its own every few seconds; the history keeps one
 * «Guardó cambios» per person every SAVE_AUDIT_WINDOW_MS, so it reads as
 * work sessions and not as hundreds of rows.
 */
export const SAVE_AUDIT_WINDOW_MS = 10 * 60 * 1000;

export async function auditValuationSave(input: { user: AuthUser; valuationPublicId: string; request: Request; now?: Date }) {
  try {
    const now = input.now ?? new Date();
    const recent = await prisma.auditoria.findFirst({
      where: {
        SEntidad: "Avaluo",
        SIdentificadorEntidad: input.valuationPublicId,
        SAccion: "VALUATION_SAVE",
        IdUsuario: input.user.id,
        DFechaEvento: { gte: new Date(now.getTime() - SAVE_AUDIT_WINDOW_MS) },
      },
      select: { IdAuditoria: true },
    });
    if (recent) return null;
    return await auditValuation({ action: "SAVE", user: input.user, valuationPublicId: input.valuationPublicId, request: input.request });
  } catch (error) {
    // Auditing must never break the save it records.
    console.error("[AUDIT] Could not record VALUATION_SAVE", error);
    return null;
  }
}

/** The data a save changed (title, client, kinds), one history row per save. */
export function auditValuationDataChanges(input: {
  user: AuthUser;
  valuationPublicId: string;
  request: Request;
  changes: Array<{ field: string; from: string; to: string }>;
}) {
  if (!input.changes.length) return Promise.resolve(null);
  const metadata: Record<string, string> = {};
  input.changes.slice(0, 8).forEach((change, index) => {
    metadata[`campo${index}`] = change.field;
    metadata[`antes${index}`] = change.from.slice(0, 220);
    metadata[`despues${index}`] = change.to.slice(0, 220);
  });
  return auditValuation({ action: "UPDATE_DATA", user: input.user, valuationPublicId: input.valuationPublicId, request: input.request, metadata });
}
