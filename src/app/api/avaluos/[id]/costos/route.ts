import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { costInputSchema } from "@/features/valuations/calculation/cost-schemas";
import { getCostCalculation, saveCostCalculation } from "@/features/valuations/calculation/cost.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Cost approach: land, constructions, special installations and indirects. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/costos">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getCostCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("COSTS_GET", error, "No se pudo cargar el enfoque de costos.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/costos">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, costInputSchema, { maxBytes: 200_000 });
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveCostCalculation(id, auth.user, body.data);
    return NextResponse.json({ data: await getCostCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("COSTS_SAVE", error, "No se pudo guardar el enfoque de costos.");
  }
}
