import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-response";
import { PHONE_ACCOUNT_LINK } from "./phone-link";
import { PhoneVerificationError } from "./phone-verification-gateway";
import { phoneRequirementBlock } from "./phone-verification.service";

/** The failure of a phone route as the user reads it; anything unexpected is logged and answered generically. */
export function phoneErrorResponse(context: string, error: unknown, fallback: string) {
  if (error instanceof PhoneVerificationError) {
    return NextResponse.json(
      { error: error.message, code: error.kind },
      { status: error.status, headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined },
    );
  }
  return internalError(context, error, fallback);
}

/**
 * For the routes that create a valuation: a 403 with the message and the link
 * to «Mi cuenta» while PHONE_VERIFICATION_REQUIRED holds the person back; null
 * when the person may go on.
 */
export async function phoneRequiredResponse(userId: number) {
  const block = await phoneRequirementBlock(userId);
  if (!block) return null;
  return NextResponse.json({ error: block.message, code: block.code, link: PHONE_ACCOUNT_LINK }, { status: 403 });
}
