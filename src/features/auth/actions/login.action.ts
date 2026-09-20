"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import type { ActionResult } from "../types/auth.types";
import { parseLoginInput } from "../validations/login.schema";
import { authenticateWithPassword } from "../services/authentication.service";
import { safeRedirectPath } from "@/security/validation/redirect-safety";

export type LoginActionState = ActionResult;

export async function loginAction(_state: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const parsed = parseLoginInput(formData);
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
  const result = await authenticateWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerStore.get("user-agent"),
  });

  if (!result.ok) {
    const code = result.reason;
    return {
      ok: false,
      code,
      message: authErrorMessages[code],
      severity: authErrorSeverity[code],
    };
  }

  redirect(safeRedirectPath(parsed.data.redirectTo));
}
