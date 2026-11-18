import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { reorderComparablesSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation, reorderComparables } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The comparables of a market in a new order (dragged, or sorted by $/m²): references 1..n follow it. */
export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/orden">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, reorderComparablesSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await reorderComparables(id, auth.user, body.data.comparableType, body.data.comparableIds);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, body.data.comparableType) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_REORDER", error, "No se pudo cambiar el orden de los comparables.");
  }
}
