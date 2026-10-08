import { NextResponse } from "next/server";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { handleStripeWebhook } from "@/features/billing/billing-webhook.service";
import { internalError } from "@/lib/api-response";

/**
 * Stripe calls this endpoint: no session and no same-origin check (the proxy
 * exempts exactly this path). The signature over the raw body, verified with
 * STRIPE_WEBHOOK_SECRET, is what authenticates the request.
 */
export async function POST(request: Request) {
  try {
    const result = await handleStripeWebhook(
      { rawBody: await request.text(), signature: request.headers.get("stripe-signature") },
      await getBillingGateway(),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return internalError("STRIPE_WEBHOOK", error, "No se pudo procesar el evento.");
  }
}
