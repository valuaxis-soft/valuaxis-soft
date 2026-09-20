import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-session";

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/iniciar-sesion?reason=required");
  return session;
}

export async function requireOrganization() {
  const session = await requireSession();
  return session.organizationId;
}
