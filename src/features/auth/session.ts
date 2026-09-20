import { getCurrentSession, revokeCurrentSession } from "./services/session.service";

export async function clearUserSession() {
  await revokeCurrentSession();
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  if (!session) return null;
  return { ...session.user, role: session.user.role as import("./model").AuthUser["role"] };
}
