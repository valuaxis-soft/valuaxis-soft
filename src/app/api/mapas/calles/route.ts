import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getStreetsAround, getStreetsInView } from "@/features/maps/server/streets.service";
import { MAX_PAINTED_STREETS } from "@/features/maps/highlights";
import { DEFAULT_STREETS_RADIUS, MAX_VIEW_SPAN_DEGREES, STREETS_RADIUS_RANGE, viewStreetsBox } from "@/features/maps/streets-osm";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

const latitude = z.coerce.number().finite().min(-90).max(90);
const longitude = z.coerce.number().finite().min(-180).max(180);

const aroundSchema = z.object({
  lat: latitude,
  lon: longitude,
  radio: z.coerce.number().finite().min(STREETS_RADIUS_RANGE.min).max(STREETS_RADIUS_RANGE.max).default(DEFAULT_STREETS_RADIUS),
});

/** What the generator's map shows: its box and zoom (video 8.5, 4:01). */
const viewSchema = z
  .object({ sur: latitude, oeste: longitude, norte: latitude, este: longitude, zoom: z.coerce.number().int().min(3).max(21) })
  .refine((view) => view.norte > view.sur && view.este > view.oeste)
  .refine((view) => view.norte - view.sur <= MAX_VIEW_SPAN_DEGREES * 2 && view.este - view.oeste <= MAX_VIEW_SPAN_DEGREES * 2);

/** The streets highlighted in the generator: they load whole in the view, whatever their class. */
const highlightedSchema = z.array(z.string().trim().min(1).max(120)).max(MAX_PAINTED_STREETS + 1);

/**
 * The streets the croquis generator can paint, from OpenStreetMap through
 * the server (our own copy in the database; Overpass only while that copy is
 * empty or unreadable), cached:
 *
 * - `?lat&lon&radio`: the streets around the subject's pin (etapa 2).
 * - `?sur&oeste&norte&este&zoom[&resaltada=…]`: the named streets of what
 *   the map shows, the classes that read at that zoom, so an avenue far from
 *   the pin can be painted too, and the highlighted ones whole.
 *
 * 503 when the copy is empty and no mirror answers.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const params = Object.fromEntries(new URL(request.url).searchParams);
    if ("zoom" in params) {
      const limit = rateLimits.streetsView.consume(`streets-view:${auth.user.id}`);
      if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
      const view = viewSchema.safeParse(params);
      if (!view.success) return NextResponse.json({ error: "Vista del mapa inválida." }, { status: 400 });
      const highlighted = highlightedSchema.safeParse(new URL(request.url).searchParams.getAll("resaltada"));
      if (!highlighted.success) return NextResponse.json({ error: "Calles resaltadas inválidas." }, { status: 400 });
      const { sur, oeste, norte, este, zoom } = view.data;
      return NextResponse.json({ data: await getStreetsInView(viewStreetsBox([[sur, oeste], [norte, este]]), zoom, highlighted.data) });
    }
    const limit = rateLimits.streets.consume(`streets:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const parsed = aroundSchema.safeParse(params);
    if (!parsed.success) return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
    const { lat, lon, radio } = parsed.data;
    return NextResponse.json({ data: await getStreetsAround([lat, lon], radio) });
  } catch (error) {
    return valuationErrorResponse("STREETS", error, "No se pudieron obtener las calles.");
  }
}
