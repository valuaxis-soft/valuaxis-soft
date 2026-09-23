import { getCurrentSession } from "./services/session.service";

export async function getCurrentUser() {
  const session = await getCurrentSession();
  if (!session) return null;
  return session.user;
}
