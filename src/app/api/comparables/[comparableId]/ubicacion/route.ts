import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { setBaseComparableCoordinates } from "@/features/valuations/comparable-base/comparable-base-write.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const coordinatesSchema = z.object({
  latitude: z.number("La latitud debe ser un número.").finite().min(-90, "La latitud va de -90 a 90.").max(90, "La latitud va de -90 a 90."),
  longitude: z.number("La longitud debe ser un número.").finite().min(-180, "La longitud va de -180 a 180.").max(180, "La longitud va de -180 a 180."),
});

/** "Ubicar": the pin placed on the map of the card, written on that capture. */
export async function PUT(request: Request, { params }: RouteContext<"/api/comparables/[comparableId]/ubicacion">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, coordinatesSchema);
    if (!body.ok) return body.response;
    const { comparableId } = await params;
    if (!UUID.test(comparableId)) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    await setBaseComparableCoordinates(auth.user, comparableId, body.data);
    return NextResponse.json({ data: body.data });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_LOCATE", error, "No se pudo guardar la ubicación.");
  }
}
