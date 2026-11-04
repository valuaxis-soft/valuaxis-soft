import { NextResponse } from "next/server";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getSubjectLocation, saveSubjectLocation } from "@/features/maps/server/subject-location.service";
import { subjectLocationInputSchema } from "@/features/maps/subject-location";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** "Ubicar el inmueble sujeto": the pin, the croquis settings and the comparables with coordinates. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/ubicacion">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getSubjectLocation(id, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("SUBJECT_LOCATION", error, "No se pudo cargar la ubicación del inmueble.");
  }
}

/** Saves the pin (`location`, null removes it) and the croquis settings (`croquis`); either may be left out. */
export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/ubicacion">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await readJsonBody(request, subjectLocationInputSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await saveSubjectLocation(id, auth.user, body.data) });
  } catch (error) {
    return valuationErrorResponse("SUBJECT_LOCATION", error, "No se pudo guardar la ubicación del inmueble.");
  }
}
