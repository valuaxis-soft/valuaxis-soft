/**
 * "Buscar alrededor de": the radius the appraiser may ask for, the
 * distances the browser shows and how the request's parameters are read.
 * The search itself runs in PostGIS (base-map.service.ts); this is the pure
 * part both sides share.
 */
import type { LatLon } from "../types";

export const RADIUS_METERS = { min: 100, max: 5000, step: 50, default: 500 } as const;
/** Hits past this many are noise: the appraiser narrows the radius or the filters. */
export const RADIUS_MAX_HITS = 200;

export function clampRadius(meters: number) {
  if (!Number.isFinite(meters)) return RADIUS_METERS.default;
  const stepped = Math.round(meters / RADIUS_METERS.step) * RADIUS_METERS.step;
  return Math.max(RADIUS_METERS.min, Math.min(RADIUS_METERS.max, stepped));
}

const EARTH_RADIUS = 6_371_008.8;

/** Great-circle distance in meters (haversine), as PostGIS measures it within a meter or so. */
export function distanceMeters(a: LatLon, b: LatLon) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/** Closest first; the folio breaks ties so the list never reorders between searches. */
export function sortByDistance<T extends { distance: number; folio: number | null }>(hits: readonly T[]) {
  return [...hits].sort((a, b) => a.distance - b.distance || (a.folio ?? Infinity) - (b.folio ?? Infinity));
}

/** "350 m" or "1.2 km". */
export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km`;
}

export type RadiusQuery = { center: LatLon; radius: number };

/**
 * `lat`, `lon` and `radio` of the request; a message when the center is
 * missing or off the globe. The radius is clamped, never rejected.
 */
export function parseRadiusQuery(params: { get(name: string): string | null }): RadiusQuery | { error: string } {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!params.get("lat") || !params.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { error: "Indica el punto alrededor del cual buscar." };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { error: "El punto no está en el mapa." };
  return { center: [lat, lon], radius: clampRadius(Number(params.get("radio") ?? RADIUS_METERS.default)) };
}
