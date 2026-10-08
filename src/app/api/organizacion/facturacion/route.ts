import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { billingErrorResponse } from "@/features/billing/billing-http";
import { getBillingOverview } from "@/features/billing/billing.service";
import { requireApiUser } from "@/security/guards/api-guard";

/** The organization's plan and the plans it can buy. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewBilling);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getBillingOverview(auth.user.organizationId, await getBillingGateway()) });
  } catch (error) {
    return billingErrorResponse("BILLING_GET", error, "No se pudo cargar el plan de la organización.");
  }
}
