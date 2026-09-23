import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableInputSchema, comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const body = await readJsonBody(request, comparableInputSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await createComparable(id, auth.user, type.data, body.data);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_CREATE", error, "No se pudo agregar el comparable.");
  }
}
