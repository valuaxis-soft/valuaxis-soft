import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { baseMapWays, renderBaseMapPng } from "@/features/maps/server/osm-base.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-85).max(85),
  lon: z.coerce.number().finite().min(-180).max(180),
  zoom: z.coerce.number().int().min(3).max(21),
});

/**
 * The base map of a croquis frame (`?lat&lon&zoom`), drawn from our copy of
 * OpenStreetMap exactly as the stored croquis draws it, as JPEG: the
 * generator's «Letreros» shows it under the highlighted streets and the
 * names, so what the appraiser arranges is what prints. Nothing of the
 * valuation goes in or out; the browser caches it for a day.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limit = rateLimits.streets.consume(`croquis-base:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
    const { lat, lon, zoom } = parsed.data;
    const png = await renderBaseMapPng([lat, lon], zoom, await baseMapWays([lat, lon], zoom));
    const jpeg = await sharp(png).jpeg({ quality: 82 }).toBuffer();
    return new NextResponse(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    return valuationErrorResponse("CROQUIS", error, "No se pudo dibujar el mapa del croquis.");
  }
}
