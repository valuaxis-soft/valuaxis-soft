import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getValuationReview } from "@/features/valuations/calculation/comparable-card.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** "Revisión de comparables": every comparable of the valuation, across its markets, with its review and warnings. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/revision">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getValuationReview(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_REVIEW", error, "No se pudo cargar la revisión de comparables.");
  }
}
