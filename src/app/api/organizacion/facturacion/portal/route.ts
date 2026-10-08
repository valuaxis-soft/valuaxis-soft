import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { billingErrorResponse, billingSessionLimiter } from "@/features/billing/billing-http";
import { openPortal } from "@/features/billing/billing.service";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Opens Stripe's customer portal: card, invoices, plan change and cancellation. */
export async function POST() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageSubscription);
    if (!auth.ok) return auth.response;
    const limit = billingSessionLimiter.consume(`billing:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    return NextResponse.json({ data: await openPortal(auth.user, await getBillingGateway()) }, { status: 201 });
  } catch (error) {
    return billingErrorResponse("BILLING_PORTAL", error, "No se pudo abrir el portal de pago. Intenta de nuevo.");
  }
}
