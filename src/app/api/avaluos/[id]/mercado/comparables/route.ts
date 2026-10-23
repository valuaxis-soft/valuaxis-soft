import { NextResponse } from "next/server";
import { z } from "zod";
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
    const search = new URL(request.url).searchParams;
    const type = comparableTypeSchema.safeParse(search.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    // ?unificar=<id>: "es el mismo" that comparable of the base; it keeps that one's number.
    const mergeInto = z.uuid().optional().safeParse(search.get("unificar") ?? undefined);
    if (!mergeInto.success) return NextResponse.json({ error: "El comparable con que se unifica no es válido." }, { status: 400 });
    const body = await readJsonBody(request, comparableInputSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await createComparable(id, auth.user, type.data, body.data, { mergeInto: mergeInto.data });
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_CREATE", error, "No se pudo agregar el comparable.");
  }
}
