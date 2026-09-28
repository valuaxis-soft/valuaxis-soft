/**
 * Automatic notices to the person responsible for a valuation: when someone
 * else assigns it to them and when someone else concludes it. A failed email
 * is logged; it never fails the action that triggered it.
 */
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import type { ValuationNoticeKind } from "./templates/valuation-notice";

export async function notifyResponsible(
  kind: ValuationNoticeKind,
  valuationPublicId: string,
  actor: Pick<AuthUser, "id" | "name" | "organizationId">,
) {
  try {
    const valuation = await prisma.avaluo.findFirst({
      where: { UIdentificadorPublico: valuationPublicId, IdOrganizacion: actor.organizationId },
      select: {
        SFolio: true,
        STitulo: true,
        organizacion: { select: { SNombre: true } },
        usuarioResponsable: { select: { IdUsuario: true, SNombre: true, SCorreo: true, BActivo: true } },
      },
    });
    const responsible = valuation?.usuarioResponsable;
    if (!valuation || !responsible || !responsible.BActivo || responsible.IdUsuario === actor.id) return false;

    await getEmailService().sendValuationNotice({
      kind,
      to: responsible.SCorreo,
      recipientName: responsible.SNombre,
      actorName: actor.name,
      folio: valuation.SFolio,
      title: valuation.STitulo,
      organizationName: valuation.organizacion.SNombre,
      valuationUrl: buildPublicAppUrl(`/workspace?id=${valuationPublicId}`).toString(),
    });
    return true;
  } catch (error) {
    console.error(`[VALUATION_NOTICE_${kind.toUpperCase()}]`, error);
    return false;
  }
}
