import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import { resolveValuationColumns } from "@/features/dashboard/valuation-columns";
import { resolveUserPreferences, type UserPreferences } from "./user-preferences";

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
