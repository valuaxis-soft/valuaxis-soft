import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import { resolveValuationColumns } from "@/features/dashboard/valuation-columns";
import {
  resolveNotificationPreferences,
  type NotificationPreferences,
} from "@/features/notifications/notification-types";
import { resolveUserPreferences, type AccountPreferences, type UserPreferences } from "./user-preferences";

const storedPreferences = async (userId: number) =>
  (await prisma.usuario.findUnique({ where: { IdUsuario: userId }, select: { JPreferencias: true } }))?.JPreferencias ?? null;

/** The stored JSON as an object; anything else (never written by the app) starts over. */
const STORED_OBJECT = Prisma.sql`CASE WHEN jsonb_typeof("JPreferencias") = 'object' THEN "JPreferencias" ELSE '{}'::jsonb END`;

/** The signed-in person's preferences; the defaults while none is stored. */
export async function getUserPreferences(userId: number): Promise<UserPreferences> {
  const user = await prisma.usuario.findUnique({ where: { IdUsuario: userId }, select: { JPreferencias: true } });
  return resolveUserPreferences(user?.JPreferencias ?? null);
}

/**
 * Keeps the changed preferences and leaves every other stored key as it was
 * (only what the person changed is written, so a default never gets frozen).
 */
export async function updateUserPreferences(
  userId: number,
  patch: { autosaveSeconds?: UserPreferences["autosaveSeconds"]; valuationListColumns?: unknown },
): Promise<UserPreferences> {
  const user = await prisma.usuario.findUnique({ where: { IdUsuario: userId }, select: { JPreferencias: true } });
  const stored = user?.JPreferencias && typeof user.JPreferencias === "object" && !Array.isArray(user.JPreferencias)
    ? (user.JPreferencias as Prisma.JsonObject)
    : {};
  const next: Prisma.JsonObject = { ...stored };
  if (patch.autosaveSeconds !== undefined) next.autosaveSeconds = patch.autosaveSeconds;
  if (patch.valuationListColumns !== undefined) next.valuationListColumns = { columns: resolveValuationColumns(patch.valuationListColumns) };
  await prisma.usuario.update({ where: { IdUsuario: userId }, data: { JPreferencias: next } });
  return resolveUserPreferences(next);
}

/** The preferences and the notifications on or off, for «Mi cuenta». */
export async function getAccountPreferences(userId: number): Promise<AccountPreferences> {
  const stored = await storedPreferences(userId);
  return { ...resolveUserPreferences(stored), notifications: resolveNotificationPreferences(stored) };
}

/** Turns notification groups on or off in one statement; the groups not sent, and every other preference, stay as they were. */
export async function updateNotificationPreferences(userId: number, patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  await prisma.$executeRaw`
    UPDATE "devpware_usuarios"
    SET "JPreferencias" = jsonb_set(
      ${STORED_OBJECT},
      '{notifications}',
      (CASE WHEN jsonb_typeof("JPreferencias"->'notifications') = 'object' THEN "JPreferencias"->'notifications' ELSE '{}'::jsonb END)
        || ${JSON.stringify(patch)}::jsonb
    )
    WHERE "IdUsuario" = ${userId}`;
  return resolveNotificationPreferences(await storedPreferences(userId));
}
