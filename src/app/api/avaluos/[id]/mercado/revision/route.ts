import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { REVIEW_COMPARABLES_PERMISSIONS } from "@/features/auth/permissions";
import { getValuationReview } from "@/features/valuations/calculation/comparable-card.service";
import { comparableBulkReviewSchema } from "@/features/valuations/calculation/market-schemas";
import { saveComparableReviews } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
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

/**
 * «Guardar revisión» of several comparables at once (V8.13): one state, every
 * check marked or not, for all the chosen. It changes no calculation, so a
 * reviewer may save it (AVALUO_EDITAR or AVALUO_REVISAR), as the review of one.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/revision">) {
  try {
    const auth = await requireApiUser(REVIEW_COMPARABLES_PERMISSIONS);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, comparableBulkReviewSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    return NextResponse.json({ data: await saveComparableReviews(id, auth.user, body.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_REVIEW_BULK", error, "No se pudo guardar la revisión de los comparables.");
  }
}
