"use server";

import { headers } from "next/headers";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import type { ActionResult } from "../types/auth.types";
import { parseForgotPasswordInput } from "../validations/forgot-password.schema";
import { requestPasswordRecovery } from "../services/password-recovery.service";

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
  await requestPasswordRecovery(
    parsed.data.email,
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    headerStore.get("user-agent"),
  );

  return {
    ok: true,
    data: undefined,
  };
}
