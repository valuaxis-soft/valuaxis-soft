/**
 * In-app notifications (migration 060): the one place that writes them
 * (`notify`) and what the bell and the «Notificaciones» page read. A person
 * sees the notices of the firm open in their session plus their personal ones
 * (organization NULL, such as their accreditation).
 */
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import {
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_TYPES,
  resolveNotificationPreferences,
  safeNotificationLink,
  wantsNotification,
  type NotificationDto,
  type NotificationListDto,
  type NotificationType,
} from "./notification-types";

export type NotifyInput = {
  type: NotificationType;
  /** The firm where it happened: only its active members receive it. null: a personal notice, shown in any firm. */
  organizationId: number | null;
  recipientIds: readonly number[];
  /** Who did it: never notified about their own action. */
  actorId?: number | null;
  title: string;
  body?: string | null;
  /** An internal path to open on click ("/workspace?id=…"). */
  link?: string | null;
  /**
   * Replaces the recipient's unread notice of the same type in the same firm
   * instead of adding another (the credit balance: only the latest count matters).
   */
  replaceUnread?: boolean;
};

const retentionCutoff = (now = new Date()) => new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

/**
 * Writes a notice for each recipient who should get it: not the actor, an
 * active account, an active member of the firm (for a firm's notice) and with
 * that kind of notice on in «Mi cuenta». It also deletes the recipients'
 * notices older than 90 days. It never throws: a failed notice is logged and
 * never fails the action that caused it. Returns how many it wrote.
 *
 * Call it after the action is committed, inside `after()` in a route:
 *
 *   after(() => notify({ type: "AVALUO_APROBADO", organizationId, recipientIds: [responsibleId], actorId: user.id,
 *                        title: "…", body: "…", link: `/workspace?id=${publicId}` }));
 *
 * For a valuation, `notifyValuationEvent` (notification-events.ts) already
 * picks the recipients and writes the text.
 */
export async function notify(input: NotifyInput): Promise<number> {
  try {
    const candidates = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
    if (!candidates.length) return 0;

    const users = await prisma.usuario.findMany({
      where: {
        IdUsuario: { in: candidates },
        BActivo: true,
        DFechaEliminacion: null,
        ...(input.organizationId !== null
          ? { miembros: { some: { IdOrganizacion: input.organizationId, BActivo: true } } }
          : {}),
      },
      select: { IdUsuario: true, JPreferencias: true },
    });
    const recipients = users
      .filter((user) => wantsNotification(resolveNotificationPreferences(user.JPreferencias), input.type))
      .map((user) => user.IdUsuario);
    if (!recipients.length) return 0;

    const title = input.title.trim().slice(0, 200);
    const body = input.body?.trim().slice(0, 1000) || null;
    const link = safeNotificationLink(input.link)?.slice(0, 500) ?? null;
    await prisma.$transaction([
      prisma.notificacion.deleteMany({ where: { IdUsuario: { in: recipients }, DFechaCreacion: { lt: retentionCutoff() } } }),
      ...(input.replaceUnread
        ? [prisma.notificacion.deleteMany({
            where: { IdUsuario: { in: recipients }, IdOrganizacion: input.organizationId, STipo: input.type, DFechaLectura: null },
          })]
        : []),
      prisma.notificacion.createMany({
        data: recipients.map((IdUsuario) => ({
          IdUsuario,
          IdOrganizacion: input.organizationId,
          STipo: input.type,
          STitulo: title,
          STexto: body,
          SEnlace: link,
        })),
      }),
    ]);
    return recipients.length;
  } catch (error) {
    console.error(`[NOTIFY_${input.type}]`, error);
    return 0;
  }
}

type Viewer = Pick<AuthUser, "id" | "organizationId">;

/** The person's notices in the open firm and their personal ones, within the 90 days. */
const scopeOf = (viewer: Viewer): Prisma.NotificacionWhereInput => ({
  IdUsuario: viewer.id,
  OR: [{ IdOrganizacion: viewer.organizationId }, { IdOrganizacion: null }],
  DFechaCreacion: { gte: retentionCutoff() },
});

const KNOWN_TYPES: ReadonlySet<string> = new Set(NOTIFICATION_TYPES);

/** The latest notices (newest first, up to `limit`) and how many are unread. */
export async function listNotifications(viewer: Viewer, options: { limit: number }): Promise<NotificationListDto> {
  const where = scopeOf(viewer);
  const [rows, unreadCount] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: [{ DFechaCreacion: "desc" }, { IdNotificacion: "desc" }],
      take: options.limit,
      select: { UIdentificadorPublico: true, STipo: true, STitulo: true, STexto: true, SEnlace: true, DFechaLectura: true, DFechaCreacion: true },
    }),
    prisma.notificacion.count({ where: { ...where, DFechaLectura: null } }),
  ]);
  const items: NotificationDto[] = rows
    .filter((row) => KNOWN_TYPES.has(row.STipo))
    .map((row) => ({
      id: row.UIdentificadorPublico,
      type: row.STipo as NotificationType,
      title: row.STitulo,
      body: row.STexto,
      link: safeNotificationLink(row.SEnlace),
      read: row.DFechaLectura !== null,
      createdAt: row.DFechaCreacion.toISOString(),
    }));
  return { items, unreadCount };
}

/** Marks as read the given notices, or all of them; only the viewer's own in the open firm. Returns the unread left. */
export async function markNotificationsRead(viewer: Viewer, selector: { ids: readonly string[] } | { all: true }): Promise<number> {
  const where = scopeOf(viewer);
  await prisma.notificacion.updateMany({
    where: { ...where, DFechaLectura: null, ...("ids" in selector ? { UIdentificadorPublico: { in: [...selector.ids] } } : {}) },
    data: { DFechaLectura: new Date() },
  });
  return prisma.notificacion.count({ where: { ...where, DFechaLectura: null } });
}
