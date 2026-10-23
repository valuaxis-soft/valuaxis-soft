import { NextResponse } from "next/server";
import { REVIEW_COMPARABLES_PERMISSIONS } from "@/features/auth/permissions";
import { comparableReviewSchema } from "@/features/valuations/calculation/market-schemas";
import { saveComparableReview } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/**
 * The review of a comparable in the valuation: state, checklist and notes. It
 * changes no calculation, so a reviewer may save it (AVALUO_EDITAR or AVALUO_REVISAR).
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/[comparableId]/revision">) {
  try {
    const auth = await requireApiUser(REVIEW_COMPARABLES_PERMISSIONS);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, comparableReviewSchema);
    if (!body.ok) return body.response;
    const { id, comparableId } = await params;
    return NextResponse.json({ data: await saveComparableReview(id, auth.user, comparableId, body.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_REVIEW", error, "No se pudo guardar la revisión del comparable.");
  }
}
