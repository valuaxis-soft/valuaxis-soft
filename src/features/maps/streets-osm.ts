/**
 * OpenStreetMap as the source of the streets around the subject: the
 * Overpass query for a radius around a point, the answer as pieces of
 * street with the demonstration's ranks, and the key the server caches
 * them under. Pure functions, tested without a network; the server does the
 * fetching (server/streets.service.ts). The data is ODbL: the panel credits
 * OpenStreetMap wherever the streets show.
 */
import { simplifyPolyline, type StreetWay } from "./streets";
import type { LatLon } from "./types";

/** Radius around the pin the streets are fetched for, in meters; covers the main roads detection (900 m). */
export const DEFAULT_STREETS_RADIUS = 1000;
export const STREETS_RADIUS_RANGE = { min: 300, max: 2000 } as const;
/** Pieces beyond this are a dense downtown; the farther ones are left out. */
export const MAX_STREET_WAYS = 1500;
/** Vertices closer than this to the line are noise for the croquis and the map; keeps the answer small. */
const SOURCE_TOLERANCE_METERS = 0.75;

/** OpenStreetMap `highway` values → rank (1–2 main roads, 3 secondary, 4 residential), as the demonstration's streets.json. */
const HIGHWAY_RANKS: Record<string, number> = {
  motorway: 1,
  trunk: 1,
  primary: 1,
  secondary: 2,
  tertiary: 3,
  residential: 4,
  unclassified: 4,
  living_street: 4,
  pedestrian: 4,
};

/** Links (ramps, laterals) take the rank of their road. */
export function highwayRank(highway: string): number | null {
  const base = highway.endsWith("_link") ? highway.slice(0, -"_link".length) : highway;
  return HIGHWAY_RANKS[base] ?? null;
}

/** The Overpass QL query: named streets of the kinds above, with their geometry, within the radius. */
export function overpassQuery(point: LatLon, radiusMeters: number) {
  const kinds = Object.keys(HIGHWAY_RANKS).flatMap((kind) => [kind, `${kind}_link`]);
  return `[out:json][timeout:25];way(around:${Math.round(radiusMeters)},${point[0].toFixed(6)},${point[1].toFixed(6)})["highway"~"^(${kinds.join("|")})$"]["name"];out geom;`;
}

export interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** The ways of an Overpass answer as pieces of street; unnamed or unranked ones are left out. */
export function parseOverpassWays(elements: readonly OverpassElement[]): StreetWay[] {
  const ways: StreetWay[] = [];
  for (const element of elements) {
    if (element.type !== "way" || !element.geometry || element.geometry.length < 2) continue;
    const name = element.tags?.name?.trim();
    const rank = highwayRank(element.tags?.highway ?? "");
    if (!name || rank === null) continue;
    const points = element.geometry.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p): LatLon => [p.lat, p.lon]);
    if (points.length < 2) continue;
    ways.push({ id: element.id, n: name, r: rank, g: simplifyPolyline(points, SOURCE_TOLERANCE_METERS) });
  }
  return ways.slice(0, MAX_STREET_WAYS);
}

/** Coordinates rounded to about 110 m, so nearby pins share one answer. */
export function streetsCacheKey(point: LatLon, radiusMeters: number) {
  return `${point[0].toFixed(3)},${point[1].toFixed(3)},${Math.round(radiusMeters)}`;
}

/** What the browser receives. */
export interface StreetsAroundDto {
  ways: StreetWay[];
  radius: number;
  /** "© OpenStreetMap contributors", for the panel. */
  attribution: string;
}

export const OSM_ATTRIBUTION = "Calles: © colaboradores de OpenStreetMap (ODbL)";
