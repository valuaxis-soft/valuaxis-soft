import { NextResponse } from "next/server";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { MAX_QUERY_LENGTH, geocodeAddress } from "@/features/maps/server/geocoding.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

/**
 * "Buscar dirección" of the croquis panel: `?q=` through the Geocoding API
 * with the server's key. Nothing is stored; 503 when maps are not configured.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limit = rateLimits.geocode.consume(`geocode:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (!query) return NextResponse.json({ error: "Escribe una dirección para buscarla." }, { status: 400 });
    if (query.length > MAX_QUERY_LENGTH) return NextResponse.json({ error: `La dirección no puede pasar de ${MAX_QUERY_LENGTH} caracteres.` }, { status: 400 });
    return NextResponse.json({ data: await geocodeAddress(query) });
  } catch (error) {
    return valuationErrorResponse("GEOCODING", error, "No se pudo buscar la dirección.");
  }
}
