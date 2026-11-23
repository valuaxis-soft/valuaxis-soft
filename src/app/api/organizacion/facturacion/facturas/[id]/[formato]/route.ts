import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { billingErrorResponse } from "@/features/billing/billing-http";
import { getInvoicingGateway } from "@/features/billing/invoicing-gateway";
import { downloadInvoiceFile } from "@/features/billing/invoicing.service";
import { requireApiUser } from "@/security/guards/api-guard";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid(), formato: z.enum(["pdf", "xml"]) });
const CONTENT_TYPES = { pdf: "application/pdf", xml: "application/xml" } as const;

/** The PDF or XML of one of the organization's CFDI, fetched from Facturapi (no copy is kept in the app). */
export async function GET(_request: Request, { params }: RouteContext<"/api/organizacion/facturacion/facturas/[id]/[formato]">) {
  try {
    const auth = await requireApiUser([AUTH_PERMISSIONS.viewBilling, AUTH_PERMISSIONS.manageBilling, AUTH_PERMISSIONS.manageSubscription]);
    if (!auth.ok) return auth.response;
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return NextResponse.json({ error: "No se encontró la factura." }, { status: 404 });
    const file = await downloadInvoiceFile(auth.user.organizationId, parsed.data.id, parsed.data.formato, await getInvoicingGateway());
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": CONTENT_TYPES[parsed.data.formato],
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return billingErrorResponse("BILLING_INVOICE_DOWNLOAD", error, "No se pudo descargar la factura.");
  }
}
