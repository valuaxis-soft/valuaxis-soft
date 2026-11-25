"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { headers } from "next/headers";
import { documentRefs, getLegalAcceptanceContext, shownVersionsAreCurrent } from "@/features/legal/consent.service";
import { registrationCookieHash } from "@/features/legal/registration-cookie";
import { clientIp, rateLimits } from "@/security/rate-limit/rate-limiter";
import { authErrorMessages, authErrorSeverity, type AuthErrorCode } from "../constants/auth-errors";
import type { GoogleRegistration } from "../oauth/google-registration";
import { OAuthFlowError, startGoogleOAuth } from "../services/google-oauth.service";
import { registerLocalUser } from "../services/registration.service";
import type { ActionResult } from "../types/auth.types";
import { parseRegisterInput, parseRegistrationConsentFields } from "../validations/register.schema";

export type RegisterActionState = ActionResult;

const failure = (code: AuthErrorCode, fieldErrors?: Record<string, string[]>): RegisterActionState => ({
  ok: false,
  code,
  message: authErrorMessages[code],
  severity: authErrorSeverity[code],
  fieldErrors,
});

/** Where the acceptance was given: the IP, the browser and the registration cookie (matrix 3.2). */
async function requestContext() {
  const requestHeaders = await headers();
  return {
    ip: clientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 1000) ?? null,
    cookieHash: await registrationCookieHash(),
  };
}

export async function registerAction(_state: RegisterActionState, formData: FormData): Promise<RegisterActionState> {
  try {
    const parsed = parseRegisterInput(formData);
    if (!parsed.ok) return failure("VALIDATION_ERROR", parsed.fieldErrors);

    if (!rateLimits.register.consume(`register:${clientIp(await headers())}`).allowed) return failure("RATE_LIMITED");

    // The boxes accept the versions the form showed: if one changed meanwhile, it is shown again.
    const legal = await getLegalAcceptanceContext();
    if (!shownVersionsAreCurrent(legal, parsed.data.consents.versionIds)) return failure("LEGAL_DOCUMENTS_CHANGED");

    const result = await registerLocalUser(parsed.data, { versions: legal.versions, context: await requestContext() });
    if (!result.ok) {
      const code = result.reason;
      return failure(code, { email: [authErrorMessages[code]] });
    }

    redirect("/verificar-correo?sent=1");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("[REGISTER_ACTION] Registration failed", error);
    return failure("SERVER_ERROR");
  }
}

/**
 * «Continuar con Google» on «Crear cuenta»: the same boxes and profile are
 * required first; they travel with the OAuth request and the account is
 * created, with its log entry, when Google answers.
 */
export async function startGoogleRegistrationAction(_state: RegisterActionState, formData: FormData): Promise<RegisterActionState> {
  try {
    const parsed = parseRegistrationConsentFields(formData);
    if (Object.keys(parsed.fieldErrors).length) return failure("VALIDATION_ERROR", parsed.fieldErrors);

    const requestHeaders = await headers();
    if (!rateLimits.oauthStart.consume(`oauth:${clientIp(requestHeaders)}`).allowed) return failure("RATE_LIMITED");

    const legal = await getLegalAcceptanceContext();
    if (!shownVersionsAreCurrent(legal, parsed.consents.versionIds)) return failure("LEGAL_DOCUMENTS_CHANGED");

    const context = await requestContext();
    const registration: GoogleRegistration = {
      profile: parsed.profile,
      optional: parsed.consents.optional,
      documents: documentRefs(legal.versions),
      ...context,
    };
    const authorizationUrl = await startGoogleOAuth({ request: { headers: requestHeaders }, returnTo: null, registration });
    redirect(authorizationUrl.toString());
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof OAuthFlowError) redirect(`/oauth/resultado?error=${encodeURIComponent(error.code)}`);
    console.error("[REGISTER_GOOGLE_ACTION] Could not start Google sign-up", error);
    return failure("SERVER_ERROR");
  }
}
