/**
 * Despacho → Revisión de comparables: the firm's checklist and thresholds of
 * the comparable review.
 *
 * Without a migration: the organization has no JSON column of settings, so
 * the checklist is the firm's custom field REVISION_COMPARABLES
 * (devpware_campos_personalizados, one per organization by its unique
 * IdOrganizacion + SClave, data type JSON) and lives in its JConfiguracion.
 * The months a comparable stays valid are the column the firm already had
 * (IMesesVigenciaComparables, migration 052).
 */
import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import {
  resolveReviewChecklist,
  type ComparableReviewChecklist,
} from "@/features/valuations/calculation/comparable-review-checklist";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { Prisma } from "@prisma/client";

export const REVIEW_CHECKLIST_FIELD_KEY = "REVISION_COMPARABLES";
const JSON_DATA_TYPE = "JSON";

export type ComparableReviewSettingsDto = ComparableReviewChecklist & {
  /** Months a comparable stays valid from its capture or update (1 to 12): the age that flags an old offer. */
  validityMonths: number;
  /** The firm changed the built-in list. */
  customized: boolean;
};

type Client = Prisma.TransactionClient | typeof prisma;

const fieldWhere = (organizationId: number) => ({
  IdOrganizacion: organizationId,
  SClave: REVIEW_CHECKLIST_FIELD_KEY,
  DFechaEliminacion: null,
}) satisfies Prisma.CampoPersonalizadoWhereInput;

/** The firm's checklist and thresholds; the built-in ones while it has not changed them. */
export async function getComparableReviewSettings(organizationId: number, client: Client = prisma): Promise<ComparableReviewSettingsDto> {
  const [organization, field] = await Promise.all([
    client.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: organizationId }, select: { IMesesVigenciaComparables: true } }),
    client.campoPersonalizado.findFirst({ where: fieldWhere(organizationId), select: { JConfiguracion: true } }),
  ]);
  return {
    ...resolveReviewChecklist(field?.JConfiguracion ?? null),
    validityMonths: organization.IMesesVigenciaComparables,
    customized: Boolean(field?.JConfiguracion),
  };
}

/** Saves the checklist and the thresholds; null `checklist` goes back to the built-in list. */
export async function saveComparableReviewSettings(
  user: AuthUser,
  input: { checklist: ComparableReviewChecklist | null; validityMonths: number },
): Promise<ComparableReviewSettingsDto> {
  const organizationId = user.organizationId;
  await prisma.$transaction(async (tx) => {
    await tx.organizacion.update({ where: { IdOrganizacion: organizationId }, data: { IMesesVigenciaComparables: input.validityMonths } });
    const field = await tx.campoPersonalizado.findFirst({ where: fieldWhere(organizationId), select: { IdCampoPersonalizado: true } });
    if (!input.checklist) {
      if (field) {
        await tx.campoPersonalizado.update({
          where: { IdCampoPersonalizado: field.IdCampoPersonalizado },
          data: { BActivo: false, DFechaEliminacion: new Date() },
        });
      }
      return;
    }
    const configuration = input.checklist as unknown as Prisma.InputJsonObject;
    if (field) {
      await tx.campoPersonalizado.update({ where: { IdCampoPersonalizado: field.IdCampoPersonalizado }, data: { JConfiguracion: configuration } });
      return;
    }
    const dataType = await tx.tipoDato.findUniqueOrThrow({ where: { SClave: JSON_DATA_TYPE }, select: { IdTipoDato: true } });
    await tx.campoPersonalizado.create({
      data: {
        IdOrganizacion: organizationId,
        IdTipoDato: dataType.IdTipoDato,
        SClave: REVIEW_CHECKLIST_FIELD_KEY,
        SNombre: "Lista de verificación de comparables",
        SDescripcion: "Puntos de la revisión de comparables y umbrales de sus avisos (Despacho → Revisión de comparables).",
        SSeccionSugerida: "COMPARABLES",
        JConfiguracion: configuration,
      },
    });
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(organizationId),
    action: input.checklist ? "COMPARABLE_REVIEW_CHECKLIST_SAVE" : "COMPARABLE_REVIEW_CHECKLIST_RESET",
    result: "EXITOSO",
    metadata: { checks: input.checklist?.checks.length ?? null, validityMonths: input.validityMonths },
  });
  return getComparableReviewSettings(organizationId);
}
