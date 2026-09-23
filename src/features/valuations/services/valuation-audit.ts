import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { clientIp } from "@/security/rate-limit/rate-limiter";

type ValuationAuditAction = "CREATE" | "CONCLUDE" | "REOPEN" | "DELETE" | "EXPORT";

const TYPE_BY_ACTION: Record<ValuationAuditAction, string> = {
  CREATE: "CREACION",
  CONCLUDE: "FINALIZACION",
  REOPEN: "REAPERTURA",
  DELETE: "ELIMINACION_LOGICA",
  EXPORT: "EXPORTACION",
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
