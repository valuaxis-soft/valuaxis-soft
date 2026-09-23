import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableTypeSchema, marketSettingsSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation, saveMarketSettings } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Comparables and market approach settings of one comparable type (?tipo=TERRENO_VENTA). */
export async function GET(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const { id } = await params;
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("MARKET_GET", error, "No se pudo cargar el enfoque de mercado.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, marketSettingsSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveMarketSettings(id, auth.user, body.data);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, body.data.comparableType) });
  } catch (error) {
    return valuationErrorResponse("MARKET_SETTINGS", error, "No se pudo guardar el enfoque de mercado.");
  }
}
