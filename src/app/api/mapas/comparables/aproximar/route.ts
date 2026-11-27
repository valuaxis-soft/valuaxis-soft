import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { locateComparablePins } from "@/features/maps/base-map/base-map.service";
import { geocodeAddress } from "@/features/maps/server/geocoding.service";
import { locateComparable } from "@/features/valuations/comparable-base/comparable-location.service";
import { parseComparableListParams } from "@/features/valuations/comparable-base/comparable-list-params";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

import { searchParamsRecord } from "../route";

const bodySchema = z.object({
  /** One comparable (its card): located alone; without it, the comparables of the filters of the query string. */
  comparableId: z.uuid("Comparable no encontrado").optional(),
});

/**
 * «Ubicación aproximada» (V8.13): comparables without a pin take the pin of
 * another capture of their number, or where their address falls (Geocoding
 * API with the server's key, each lookup under the user's geocoding limit).
 * Answers how many were located; with `comparableId`, also its location.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, bodySchema);
    if (!body.ok) return body.response;
    const allow = () => rateLimits.geocode.consume(`geocode:${auth.user.id}`).allowed;
    const options = { geocoder: (query: string) => geocodeAddress(query), allow };
    if (body.data.comparableId) {
      return NextResponse.json({ data: await locateComparable(auth.user.organizationId, body.data.comparableId, options) });
    }
    const params = parseComparableListParams(searchParamsRecord(new URL(request.url).searchParams));
    return NextResponse.json({ data: await locateComparablePins(auth.user.organizationId, params, options) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_APPROXIMATE", error, "No se pudo ubicar los comparables por su dirección.");
  }
}
