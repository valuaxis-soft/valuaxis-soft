import { prisma } from "@/infrastructure/database/prisma-client";
import { resolveUserPreferences, type UserPreferences } from "./user-preferences";

/** The signed-in person's preferences; the defaults while none is stored. */
export async function getUserPreferences(userId: number): Promise<UserPreferences> {
  const user = await prisma.usuario.findUnique({ where: { IdUsuario: userId }, select: { JPreferencias: true } });
  return resolveUserPreferences(user?.JPreferencias ?? null);
}

/** Keeps the changed preferences, the others as they were stored. */
export async function updateUserPreferences(userId: number, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const next = { ...(await getUserPreferences(userId)), ...patch };
  await prisma.usuario.update({ where: { IdUsuario: userId }, data: { JPreferencias: next } });
  return next;
}
