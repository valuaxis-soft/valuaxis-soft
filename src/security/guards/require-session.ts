import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/session";

/** For server pages: returns the session user or redirects to the login page. */
export async function requireSession(redirectTo?: string) {
  const user = await getCurrentUser();
  if (!user) {
    const params = new URLSearchParams({ reason: "required" });
    if (redirectTo) params.set("redirectTo", redirectTo);
    redirect(`/iniciar-sesion?${params.toString()}`);
  }
  return user;
}
