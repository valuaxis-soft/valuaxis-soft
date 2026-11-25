import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/session";
import { pendingLegalAcceptances } from "@/features/legal/consent.service";
import { LEGAL_ACCEPTANCE_PATH } from "@/features/legal/legal-documents";

/**
 * For server pages: returns the session user or redirects to the login page.
 * With LEGAL_ACCEPTANCE_REQUIRED on, an account that has not accepted the
 * published versions that ask for it goes to /aceptar-documentos first
 * (matrix 1.2): no private page opens until it does. That page itself skips
 * the check (`legalGate: false`).
 */
export async function requireSession(redirectTo?: string, options: { legalGate?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) {
    const params = new URLSearchParams({ reason: "required" });
    if (redirectTo) params.set("redirectTo", redirectTo);
    redirect(`/iniciar-sesion?${params.toString()}`);
  }
  if (options.legalGate !== false && (await pendingLegalAcceptances(user.id)).length) {
    redirect(redirectTo ? `${LEGAL_ACCEPTANCE_PATH}?${new URLSearchParams({ redirectTo }).toString()}` : LEGAL_ACCEPTANCE_PATH);
  }
  return user;
}
