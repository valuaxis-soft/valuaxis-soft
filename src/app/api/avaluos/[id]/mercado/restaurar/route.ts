import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { restoreMarketSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation, restoreMarket } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Undoes "Quitar este mercado": its comparables set aside come back (the settings are saved again with PUT `mercado`). */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/restaurar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, restoreMarketSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await restoreMarket(id, auth.user, body.data.comparableType, body.data.comparableIds);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, body.data.comparableType) });
  } catch (error) {
    return valuationErrorResponse("MARKET_RESTORE", error, "No se pudo deshacer: el mercado sigue quitado.");
  }
}
