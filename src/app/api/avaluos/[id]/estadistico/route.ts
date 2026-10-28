import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { statisticalInputSchema } from "@/features/valuations/calculation/statistical-schemas";
import { getStatisticalCalculation, saveStatisticalCalculation } from "@/features/valuations/calculation/statistical.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** "Métodos estadísticos" of one comparable type (?tipo=INMUEBLE_VENTA): regression and goal programming. */
export async function GET(request: Request, { params }: RouteContext<"/api/avaluos/[id]/estadistico">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const { id } = await params;
    return NextResponse.json({ data: await getStatisticalCalculation(id, auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("STATISTICAL_GET", error, "No se pudieron cargar los métodos estadísticos.");
  }
}

/** Saves the apartado as a whole: its comparables (a hundred or more), criteria, scales and methods. */
export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/estadistico">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, statisticalInputSchema, { maxBytes: 1_000_000 });
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveStatisticalCalculation(id, auth.user, body.data);
    return NextResponse.json({ data: await getStatisticalCalculation(id, auth.user.organizationId, body.data.settings.comparableType) });
  } catch (error) {
    return valuationErrorResponse("STATISTICAL_SAVE", error, "No se pudieron guardar los métodos estadísticos.");
  }
}
