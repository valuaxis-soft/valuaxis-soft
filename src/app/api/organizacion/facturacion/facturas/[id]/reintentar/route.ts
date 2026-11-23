import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { billingErrorResponse } from "@/features/billing/billing-http";
import { getInvoicingGateway } from "@/features/billing/invoicing-gateway";
import { retryInvoice } from "@/features/billing/invoicing.service";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Each retry may stamp a CFDI: at most 10 per organization every 10 minutes. */
const retryLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** «Reintentar factura»: issues again a failed CFDI of a purchase, or emails again one that was not sent. */
export async function POST(_request: Request, { params }: RouteContext<"/api/organizacion/facturacion/facturas/[id]/reintentar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageBilling);
    if (!auth.ok) return auth.response;
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "No se encontró la factura." }, { status: 404 });
    const limit = retryLimiter.consume(`invoice-retry:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    return NextResponse.json({ data: await retryInvoice(auth.user, id.data, await getInvoicingGateway()) });
  } catch (error) {
    return billingErrorResponse("BILLING_INVOICE_RETRY", error, "No se pudo reintentar la factura.");
  }
}
