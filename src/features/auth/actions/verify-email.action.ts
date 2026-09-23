"use server";

import type { ActionResult } from "../types/auth.types";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import { consumeEmailVerificationToken } from "../services/email-verification.service";

export type VerifyEmailActionState = ActionResult | null;

/**
 * Consumes the verification token only when the user submits the form. Opening
 * the link is a GET that changes nothing, so mail scanners that prefetch links
 * cannot spend the token.
 */
export async function verifyEmailAction(_state: VerifyEmailActionState, formData: FormData): Promise<ActionResult> {
  const token = formData.get("token");
  const ok = typeof token === "string" && token.length > 0 && token.length <= 200
    ? await consumeEmailVerificationToken(token)
    : false;
  if (!ok) {
    return {
      ok: false,
      code: "INVALID_OR_EXPIRED_TOKEN",
      message: authErrorMessages.INVALID_OR_EXPIRED_TOKEN,
      severity: authErrorSeverity.INVALID_OR_EXPIRED_TOKEN,
    };
  }

  return { ok: true, data: undefined };
}
