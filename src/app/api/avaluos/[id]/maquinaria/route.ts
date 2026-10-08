import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { machineryInputSchema } from "@/features/valuations/calculation/machinery-schemas";
import { getMachineryCalculation, saveMachineryCalculation } from "@/features/valuations/calculation/machinery.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Machinery and equipment: the cost capture (item and attachments) and the market capture (offers). */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/maquinaria">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getMachineryCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("MACHINERY_GET", error, "No se pudo cargar el cálculo de maquinaria y equipo.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/maquinaria">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, machineryInputSchema, { maxBytes: 200_000 });
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveMachineryCalculation(id, auth.user, body.data);
    return NextResponse.json({ data: await getMachineryCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("MACHINERY_SAVE", error, "No se pudo guardar el cálculo de maquinaria y equipo.");
  }
}
