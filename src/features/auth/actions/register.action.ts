"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import type { ActionResult } from "../types/auth.types";
import { parseRegisterInput } from "../validations/register.schema";
import { registerLocalUser } from "../services/registration.service";

export type RegisterActionState = ActionResult;

export async function registerAction(_state: RegisterActionState, formData: FormData): Promise<RegisterActionState> {
  try {
    const parsed = parseRegisterInput(formData);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: authErrorMessages.VALIDATION_ERROR,
        severity: authErrorSeverity.VALIDATION_ERROR,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const result = await registerLocalUser(parsed.data);
    if (!result.ok) {
      const code = result.reason;
      return {
        ok: false,
        code,
        message: authErrorMessages[code],
        severity: authErrorSeverity[code],
        fieldErrors: { email: [authErrorMessages[code]] },
      };
    }

    redirect("/verificar-correo?sent=1");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("[REGISTER_ACTION] Registration failed", error);
    return {
      ok: false,
      code: "SERVER_ERROR",
      message: authErrorMessages.SERVER_ERROR,
      severity: authErrorSeverity.SERVER_ERROR,
    };
  }
}
