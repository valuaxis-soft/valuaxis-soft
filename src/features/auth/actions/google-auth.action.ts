"use server";

import { authErrorMessages } from "../constants/auth-errors";
import type { ActionResult } from "../types/auth.types";

export async function googleAuthAction(): Promise<ActionResult> {
  return {
    ok: false,
    code: "GOOGLE_NOT_CONFIGURED",
    message: authErrorMessages.GOOGLE_NOT_CONFIGURED,
  };
}
