"use server";

import type { ActionResult } from "../types/auth.types";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import { consumeEmailVerificationToken } from "../services/email-verification.service";

export async function verifyEmailAction(token: string): Promise<ActionResult> {
  const ok = await consumeEmailVerificationToken(token);
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
