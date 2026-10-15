import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { billingErrorResponse, billingSessionLimiter, packageCheckoutSchema } from "@/features/billing/billing-http";
import { startPackageCheckout } from "@/features/billing/credit-packages.service";
import { readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Starts the purchase of a credit package (one-time payment): answers the Stripe page to send the browser to. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageSubscription);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, packageCheckoutSchema);
    if (!body.ok) return body.response;
    const limit = billingSessionLimiter.consume(`billing:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    return NextResponse.json({ data: await startPackageCheckout(auth.user, body.data.packageId, await getBillingGateway()) }, { status: 201 });
  } catch (error) {
    return billingErrorResponse("BILLING_PACKAGE_CHECKOUT", error, "No se pudo iniciar el pago. Intenta de nuevo.");
  }
}
