import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableInputSchema, comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { deleteComparable, getMarketCalculation, updateComparable } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

type Context = RouteContext<"/api/avaluos/[id]/mercado/comparables/[comparableId]">;

function typeOf(request: Request) {
  return comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = typeOf(request);
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const body = await readJsonBody(request, comparableInputSchema);
    if (!body.ok) return body.response;
    const { id, comparableId } = await params;
    await updateComparable(id, auth.user, comparableId, body.data);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_UPDATE", error, "No se pudo guardar el comparable.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = typeOf(request);
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const { id, comparableId } = await params;
    await deleteComparable(id, auth.user, comparableId);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_DELETE", error, "No se pudo eliminar el comparable.");
  }
}
