import { NextResponse } from "next/server";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { duplicateValuation } from "@/features/valuations/services/valuation-duplicate.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** A new valuation of the firm that starts as a copy of this one. */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/duplicar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.createValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const result = await duplicateValuation(auth.user, id);
    await auditValuation({ action: "DUPLICATE", user: auth.user, valuationPublicId: result.id, request, metadata: { source: id, folio: result.folio } });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("VALUATION_DUPLICATE", error, "No se pudo duplicar el avalúo.");
  }
}
