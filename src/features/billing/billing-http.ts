import { NextResponse } from "next/server";
import { z } from "zod";
import { internalError } from "@/lib/api-response";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";
import { BillingError } from "./billing.service";

export const checkoutSchema = z.object({ priceId: z.uuid() });

/** Each call creates a session in Stripe: at most 20 per organization every 10 minutes. */
export const billingSessionLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/** Business failures return their message; anything else is logged and hidden from the client. */
export function billingErrorResponse(context: string, error: unknown, fallbackMessage: string) {
  if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
  return internalError(context, error, fallbackMessage);
}
