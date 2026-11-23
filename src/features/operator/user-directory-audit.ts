import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import type { UserDirectoryParams } from "./user-directory-params";

export const USER_DIRECTORY_AUDIT = {
  entity: "DirectorioUsuarios",
  entityId: "plataforma",
  view: "OPERATOR_USER_DIRECTORY_VIEW",
  export: "OPERATOR_USER_DIRECTORY_EXPORT",
} as const;

/**
 * Every view and every export of the directory leaves who, when and what was
 * searched. The catalog has no «consulta» event type, so both go as
 * EXPORTACION (information that left the system), told apart by the action.
 */
export function auditUserDirectory(input: {
  kind: "view" | "export";
  user: { id: number; organizationId: number };
  params: UserDirectoryParams;
  rows: number;
  total: number;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return recordAuditEvent({
    typeKey: "EXPORTACION",
    organizationId: input.user.organizationId,
    userId: input.user.id,
    entity: USER_DIRECTORY_AUDIT.entity,
    entityId: USER_DIRECTORY_AUDIT.entityId,
    action: USER_DIRECTORY_AUDIT[input.kind],
    result: "EXITOSO",
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: {
      q: input.params.q,
      acreditado: input.params.accredited,
      orden: input.params.sort,
      dir: input.params.direction,
      page: input.params.page,
      rows: input.rows,
      total: input.total,
    },
  });
}
