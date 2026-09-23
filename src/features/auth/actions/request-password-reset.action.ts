"use server";

import { headers } from "next/headers";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import type { ActionResult } from "../types/auth.types";
import { parseForgotPasswordInput } from "../validations/forgot-password.schema";
import { requestPasswordRecovery } from "../services/password-recovery.service";
import { clientIp, rateLimits } from "@/security/rate-limit/rate-limiter";

export type ForgotPasswordActionState = ActionResult;

export async function requestPasswordResetAction(
  _state: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = parseForgotPasswordInput(formData);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: authErrorMessages.VALIDATION_ERROR,
      severity: authErrorSeverity.VALIDATION_ERROR,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const headerStore = await headers();
  const ip = clientIp(headerStore);
  const byIp = rateLimits.passwordResetByIp.consume(`reset-ip:${ip}`);
  if (!byIp.allowed) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: authErrorMessages.RATE_LIMITED,
      severity: authErrorSeverity.RATE_LIMITED,
    };
  }

  // Past the per-address limit the answer stays the same, so it does not reveal
  // whether the account exists, but no more emails are sent to that inbox.
  const byEmail = rateLimits.passwordResetByEmail.consume(`reset-email:${parsed.data.email.toLowerCase()}`);
  if (byEmail.allowed) {
    await requestPasswordRecovery(parsed.data.email, ip, headerStore.get("user-agent"));
  }

  return {
    ok: true,
    data: undefined,
  };
}
