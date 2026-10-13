import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getConstructionTypes, saveConstructionTypes } from "@/features/valuations/calculation/construction-types.service";
import { constructionTypesSchema } from "@/features/valuations/calculation/cost-schemas";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Construction types of the construction section: the single capture of their surface, age and useful life. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/construcciones">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getConstructionTypes(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("CONSTRUCTION_TYPES_GET", error, "No se pudieron cargar los tipos de construcción.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/construcciones">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, constructionTypesSchema, { maxBytes: 100_000 });
    if (!body.ok) return body.response;
    const { id } = await params;
    await saveConstructionTypes(id, auth.user, body.data);
    return NextResponse.json({ data: await getConstructionTypes(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("CONSTRUCTION_TYPES_SAVE", error, "No se pudieron guardar los tipos de construcción.");
  }
}
