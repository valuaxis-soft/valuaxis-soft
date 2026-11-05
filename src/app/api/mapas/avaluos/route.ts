import { NextResponse } from "next/server";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { listValuationPins } from "@/features/maps/base-map/base-map.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** "Mis avalúos" on the map: the subject of each located valuation of the firm. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await listValuationPins(auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("VALUATION_MAP", error, "No se pudo cargar el mapa de avalúos.");
  }
}
