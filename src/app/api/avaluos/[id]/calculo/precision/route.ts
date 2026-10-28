import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { calculationPrecisionSchema } from "@/features/valuations/calculation/calculation-precision";
import { getCalculationPrecision, saveCalculationPrecision } from "@/features/valuations/calculation/calculation-precision.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Decimals the factors show and whether the valuation calculates with them. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/calculo/precision">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getCalculationPrecision(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("PRECISION_GET", error, "No se pudo cargar la precisión del cálculo.");
  }
}

/** Changes the precision and recomputes every approach with it. */
export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/calculo/precision">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, calculationPrecisionSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveCalculationPrecision(id, auth.user, body.data);
    return NextResponse.json({ data: await getCalculationPrecision(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("PRECISION_SAVE", error, "No se pudo guardar la precisión del cálculo.");
  }
}
