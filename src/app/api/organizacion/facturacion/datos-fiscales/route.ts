import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { billingErrorResponse } from "@/features/billing/billing-http";
import { fiscalDataSchema } from "@/features/billing/invoice-rules";
import { saveFiscalData } from "@/features/billing/invoicing.service";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The organization's fiscal data for its CFDI (RFC, legal name, regime, zip, use, email). Saved even while invoicing is off. */
export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageBilling);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, fiscalDataSchema, { maxBytes: 10_000 });
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await saveFiscalData(auth.user, body.data) });
  } catch (error) {
    return billingErrorResponse("BILLING_FISCAL_DATA", error, "No se pudieron guardar los datos fiscales.");
  }
}
