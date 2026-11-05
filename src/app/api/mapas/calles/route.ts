import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getStreetsAround } from "@/features/maps/server/streets.service";
import { DEFAULT_STREETS_RADIUS, STREETS_RADIUS_RANGE } from "@/features/maps/streets-osm";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lon: z.coerce.number().finite().min(-180).max(180),
  radio: z.coerce.number().finite().min(STREETS_RADIUS_RANGE.min).max(STREETS_RADIUS_RANGE.max).default(DEFAULT_STREETS_RADIUS),
});

/**
 * The streets around the subject's pin for the croquis panel (etapa 2):
 * `?lat&lon&radio` from OpenStreetMap through the server, cached by rounded
 * coordinates. Nothing is stored; 503 when no Overpass mirror answers.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limit = rateLimits.streets.consume(`streets:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
    const { lat, lon, radio } = parsed.data;
    return NextResponse.json({ data: await getStreetsAround([lat, lon], radio) });
  } catch (error) {
    return valuationErrorResponse("STREETS", error, "No se pudieron obtener las calles.");
  }
}
