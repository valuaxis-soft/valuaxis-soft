"use server";

import { redirect } from "next/navigation";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import type { ActionResult } from "../types/auth.types";
import { parseResetPasswordInput } from "../validations/reset-password.schema";
import { consumePasswordRecoveryToken } from "../services/password-recovery.service";

export type ResetPasswordActionState = ActionResult;

export async function resetPasswordAction(
  _state: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = parseResetPasswordInput(formData);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: authErrorMessages.VALIDATION_ERROR,
      severity: authErrorSeverity.VALIDATION_ERROR,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const consumed = await consumePasswordRecoveryToken(parsed.data.token, parsed.data.password);
  if (!consumed) {
    return {
      ok: false,
      code: "INVALID_OR_EXPIRED_TOKEN",
      message: authErrorMessages.INVALID_OR_EXPIRED_TOKEN,
      severity: authErrorSeverity.INVALID_OR_EXPIRED_TOKEN,
    };
  }

  redirect("/iniciar-sesion?reset=1");
}
