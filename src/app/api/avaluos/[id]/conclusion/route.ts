import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { conclusionSettingsSchema } from "@/features/valuations/calculation/conclusion-schemas";
import { getConclusionCalculation, saveConclusionSettings } from "@/features/valuations/calculation/conclusion.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Summary of the three approaches and the concluded value. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/conclusion">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getConclusionCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("CONCLUSION_GET", error, "No se pudo cargar la conclusión.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/conclusion">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, conclusionSettingsSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveConclusionSettings(id, auth.user, body.data);
    return NextResponse.json({ data: await getConclusionCalculation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("CONCLUSION_SAVE", error, "No se pudo guardar la conclusión.");
  }
}
