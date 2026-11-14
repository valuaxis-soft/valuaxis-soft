/**
 * The events that notify someone in the app, each with its recipients and its
 * text. They run after the action is committed (inside `after()` in routes)
 * and never throw: a notice that fails is logged by `notify`.
 */
import type { AuthPermission, AuthUser } from "@/features/auth/model";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { BILLING_PAGE_PATH } from "@/features/billing/billing-rules";
import { LOW_CREDIT_BALANCE } from "@/features/billing/credit-rules";
import { getCreditBalance } from "@/features/billing/credits.service";
import { isTeamRole, TEAM_ROLE_LABELS } from "@/features/team/team-rules";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { NotificationType } from "./notification-types";
import { lowCreditsText, valuationEventText, type ValuationEvent } from "./notification-texts";
import { notify } from "./notifications.service";

type Actor = Pick<AuthUser, "id" | "name" | "organizationId">;

const VALUATION_EVENT_TYPE: Record<ValuationEvent, NotificationType> = {
  asignado: "AVALUO_ASIGNADO",
  concluido: "AVALUO_CONCLUIDO",
  reabierto: "AVALUO_REABIERTO",
  enviado_revision: "AVALUO_EN_REVISION",
  aprobado: "AVALUO_APROBADO",
  regresado: "AVALUO_REGRESADO",
};

/** Active members of the firm whose role has the permission. */
async function membersWithPermission(organizationId: number, permission: AuthPermission) {
  const members = await prisma.miembroOrganizacion.findMany({
    where: {
      IdOrganizacion: organizationId,
      BActivo: true,
      rol: { permisos: { some: { permiso: { SClave: permission, BActivo: true } } } },
    },
    select: { IdUsuario: true },
  });
  return members.map((member) => member.IdUsuario);
}

/**
 * Notifies the people a valuation's event concerns, never the one who did it:
 * the responsible appraiser when it is assigned to them; the responsible and
 * the creator when it is concluded, reopened, approved or returned; whoever
 * can review (AVALUO_REVISAR) when it is sent to review.
 */
export async function notifyValuationEvent(event: ValuationEvent, valuationPublicId: string, actor: Actor, options: { reason?: string | null } = {}) {
  try {
    const valuation = await prisma.avaluo.findFirst({
      where: { UIdentificadorPublico: valuationPublicId, IdOrganizacion: actor.organizationId },
      select: { SFolio: true, STitulo: true, IdUsuarioResponsable: true, IdUsuarioCreador: true },
    });
    if (!valuation) return 0;
    const recipientIds =
      event === "asignado"
        ? [valuation.IdUsuarioResponsable].filter((id): id is number => id !== null)
        : event === "enviado_revision"
          ? await membersWithPermission(actor.organizationId, AUTH_PERMISSIONS.reviewValuations)
          : [valuation.IdUsuarioResponsable, valuation.IdUsuarioCreador].filter((id): id is number => id !== null);
    const text = valuationEventText(event, { folio: valuation.SFolio, title: valuation.STitulo, actorName: actor.name, reason: options.reason });
    return await notify({
      type: VALUATION_EVENT_TYPE[event],
      organizationId: actor.organizationId,
      recipientIds,
      actorId: actor.id,
      ...text,
      link: `/workspace?id=${valuationPublicId}`,
    });
  } catch (error) {
    console.error(`[NOTIFY_VALUATION_${event.toUpperCase()}]`, error);
    return 0;
  }
}

/** Someone accepted an invitation: the firm's administrators hear about it. */
export async function notifyMemberJoined(organizationId: number, memberUserId: number) {
  try {
    const member = await prisma.miembroOrganizacion.findFirst({
      where: { IdOrganizacion: organizationId, IdUsuario: memberUserId, BActivo: true },
      select: { rol: { select: { SClave: true } }, usuario: { select: { SNombre: true, SApellidoPaterno: true, SCorreo: true } } },
    });
    if (!member) return 0;
    const name = `${member.usuario.SNombre} ${member.usuario.SApellidoPaterno ?? ""}`.trim() || member.usuario.SCorreo;
    const role = isTeamRole(member.rol.SClave) ? TEAM_ROLE_LABELS[member.rol.SClave] : member.rol.SClave;
    return await notify({
      type: "MIEMBRO_NUEVO",
      organizationId,
      recipientIds: await membersWithPermission(organizationId, AUTH_PERMISSIONS.manageUsers),
      actorId: memberUserId,
      title: `${name} se unió al despacho`,
      body: `Aceptó la invitación y entró como ${role}.`,
      link: "/organizacion/equipo",
    });
  } catch (error) {
    console.error("[NOTIFY_MIEMBRO_NUEVO]", error);
    return 0;
  }
}

/**
 * After a conclusion consumed a credit: with the pay per appraisal on and 3 or
 * fewer left, whoever sees the billing hears about it. The notice replaces the
 * previous unread one, so the bell shows only the latest balance.
 */
export async function notifyLowCredits(organizationId: number) {
  try {
    const organization = await prisma.organizacion.findUnique({ where: { IdOrganizacion: organizationId }, select: { BCobroPorAvaluo: true } });
    if (!organization?.BCobroPorAvaluo) return 0;
    const balance = await getCreditBalance(organizationId);
    if (balance > LOW_CREDIT_BALANCE) return 0;
    const [viewers, managers] = await Promise.all([
      membersWithPermission(organizationId, AUTH_PERMISSIONS.viewBilling),
      membersWithPermission(organizationId, AUTH_PERMISSIONS.manageSubscription),
    ]);
    // Whoever concluded also hears about it if they see the billing: the balance concerns everyone.
    return await notify({
      type: "CREDITOS_POR_AGOTARSE",
      organizationId,
      recipientIds: [...viewers, ...managers],
      ...lowCreditsText(balance),
      link: BILLING_PAGE_PATH,
      replaceUnread: true,
    });
  } catch (error) {
    console.error("[NOTIFY_CREDITOS_POR_AGOTARSE]", error);
    return 0;
  }
}

/** The reviewer approved, rejected or revoked the person's accreditation: a personal notice, seen in any firm. */
export async function notifyAccreditationResolved(userId: number, decision: "approve" | "reject" | "revoke", reason?: string | null) {
  const why = reason?.trim() ? ` Motivo: ${reason.trim()}` : "";
  const text =
    decision === "approve"
      ? { title: "Tu acreditación profesional fue aprobada", body: "Tus avalúos ya no imprimen el aviso «Documento sin validez oficial»." }
      : decision === "reject"
        ? { title: "Tu acreditación profesional fue rechazada", body: `Revisa tu constancia y vuelve a subirla en Mi cuenta.${why}` }
        : { title: "Tu acreditación profesional fue revocada", body: `Tus avalúos vuelven a imprimir el aviso «Documento sin validez oficial».${why}` };
  return notify({
    type: decision === "approve" ? "ACREDITACION_APROBADA" : "ACREDITACION_RECHAZADA",
    organizationId: null,
    recipientIds: [userId],
    ...text,
    link: "/cuenta",
  });
}
