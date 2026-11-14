import { z } from "zod";

/**
 * In-app notifications: what kinds exist, how the person turns them on or off
 * in «Mi cuenta», and how the bell shows them. Pure: no database, so it is
 * shared by the server, the bell and the tests.
 */

/** Every kind of notice the app writes (`devpware_notificaciones.STipo`). */
export const NOTIFICATION_TYPES = [
  "MIEMBRO_NUEVO",
  "AVALUO_ASIGNADO",
  "AVALUO_CONCLUIDO",
  "AVALUO_REABIERTO",
  "AVALUO_EN_REVISION",
  "AVALUO_APROBADO",
  "AVALUO_REGRESADO",
  "CREDITOS_POR_AGOTARSE",
  "ACREDITACION_APROBADA",
  "ACREDITACION_RECHAZADA",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** What «Mi cuenta» turns on or off: one switch per group of related notices. */
export const NOTIFICATION_CATEGORIES = [
  {
    key: "equipo",
    label: "Equipo",
    description: "Alguien aceptó una invitación y se unió al despacho (a quien administra el equipo).",
    types: ["MIEMBRO_NUEVO"],
  },
  {
    key: "asignaciones",
    label: "Avalúos que te asignan",
    description: "Otra persona creó un avalúo y te dejó como responsable.",
    types: ["AVALUO_ASIGNADO"],
  },
  {
    key: "estados",
    label: "Avalúos concluidos o reabiertos",
    description: "Otra persona concluyó o reabrió un avalúo del que eres responsable o que creaste.",
    types: ["AVALUO_CONCLUIDO", "AVALUO_REABIERTO"],
  },
  {
    key: "revision",
    label: "Revisión",
    description: "Un avalúo se envió a revisión (a quien revisa), o el tuyo se aprobó o regresó a edición.",
    types: ["AVALUO_EN_REVISION", "AVALUO_APROBADO", "AVALUO_REGRESADO"],
  },
  {
    key: "creditos",
    label: "Avalúos disponibles",
    description: "Con el cobro por avalúo activo, quedan 3 o menos avalúos por concluir (a quien ve la facturación).",
    types: ["CREDITOS_POR_AGOTARSE"],
  },
  {
    key: "acreditacion",
    label: "Tu acreditación profesional",
    description: "Se aprobó o rechazó tu constancia.",
    types: ["ACREDITACION_APROBADA", "ACREDITACION_RECHAZADA"],
  },
] as const satisfies ReadonlyArray<{ key: string; label: string; description: string; types: readonly NotificationType[] }>;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

/** On (true) or off per group. Everything is on until the person turns it off. */
export type NotificationPreferences = Record<NotificationCategory, boolean>;

const CATEGORY_OF_TYPE = new Map<NotificationType, NotificationCategory>(
  NOTIFICATION_CATEGORIES.flatMap((category) => category.types.map((type) => [type, category.key] as const)),
);

/** The group a notice belongs to. Pure. */
export const categoryOf = (type: NotificationType): NotificationCategory => CATEGORY_OF_TYPE.get(type) ?? "estados";

/** `JPreferencias.notifications` as preferences: anything missing or not a boolean is on. Pure. */
export function resolveNotificationPreferences(storedPreferences: unknown): NotificationPreferences {
  const record = storedPreferences && typeof storedPreferences === "object" ? (storedPreferences as Record<string, unknown>) : {};
  const stored = record.notifications && typeof record.notifications === "object" ? (record.notifications as Record<string, unknown>) : {};
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [category.key, stored[category.key] !== false]),
  ) as NotificationPreferences;
}

/** Whether the person wants this kind of notice. Pure. */
export const wantsNotification = (preferences: NotificationPreferences, type: NotificationType) => preferences[categoryOf(type)];

/** What `PATCH /api/cuenta/preferencias` accepts under `notifications`: only the known groups, as booleans. */
export const notificationPreferencesPatchSchema = z
  .object(Object.fromEntries(NOTIFICATION_CATEGORIES.map((category) => [category.key, z.boolean().optional()])) as Record<NotificationCategory, z.ZodOptional<z.ZodBoolean>>)
  .strict();

/** What `POST /api/notificaciones/leidas` accepts: some notices by id, or all of them. */
export const markNotificationsReadSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

/** A notice older than this is deleted: the bell and the page never show it. */
export const NOTIFICATION_RETENTION_DAYS = 90;

/** The bell asks again every minute while the tab is visible, and when the tab gets focus. */
export const NOTIFICATION_POLL_MS = 60_000;

/** What the bell and the page receive. */
export type NotificationDto = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** An internal path ("/workspace?id=…"); null when there is nowhere to go. */
  link: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationListDto = { items: NotificationDto[]; unreadCount: number };

/** Only paths inside the app open on click: never another site. Pure. */
export function safeNotificationLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\") || /[\u0000-\u001F\u007F]/.test(link)) return null;
  return link;
}

const MEXICO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });

/** «Hoy» (the day in Mexico City) and «Anteriores», newest first in each. Pure. */
export function groupNotificationsByDay<T extends { createdAt: string }>(items: readonly T[], now = new Date()) {
  const today = MEXICO_DAY.format(now);
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    today: sorted.filter((item) => MEXICO_DAY.format(new Date(item.createdAt)) === today),
    earlier: sorted.filter((item) => MEXICO_DAY.format(new Date(item.createdAt)) !== today),
  };
}

const TIME = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });

/** «Hace un momento», «Hace 12 min», «Hace 3 h», then «4 nov, 9:15». Pure. */
export function formatNotificationTime(createdAt: string, now = new Date()) {
  const date = new Date(createdAt);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 12 * 60) return `Hace ${Math.floor(minutes / 60)} h`;
  return `${DATE.format(date)}, ${TIME.format(date)}`;
}

/** «9+» past nine, so the badge keeps its size. Pure. */
export const unreadBadgeLabel = (count: number) => (count > 9 ? "9+" : String(count));
