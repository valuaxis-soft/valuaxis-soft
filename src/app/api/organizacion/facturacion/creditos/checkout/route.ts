import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { billingErrorResponse, billingSessionLimiter, unitPurchaseSchema } from "@/features/billing/billing-http";
import { startUnitPurchase } from "@/features/billing/credit-packages.service";
import { readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Starts the purchase of Avalúos Disponibles at the unit price (one-time payment): answers the Stripe page to send the browser to. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageSubscription);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, unitPurchaseSchema);
    if (!body.ok) return body.response;
    const limit = billingSessionLimiter.consume(`billing:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    return NextResponse.json({ data: await startUnitPurchase(auth.user, body.data.quantity, await getBillingGateway()) }, { status: 201 });
  } catch (error) {
    return billingErrorResponse("BILLING_PACKAGE_CHECKOUT", error, "No se pudo iniciar el pago. Intenta de nuevo.");
  }
}
