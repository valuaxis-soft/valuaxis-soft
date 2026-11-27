/**
 * OpenStreetMap as the source of the streets around the subject: the
 * Overpass query for a radius around a point, the answer as pieces of
 * street with the demonstration's ranks, and the key the server caches
 * them under. Pure functions, tested without a network; the server does the
 * fetching (server/streets.service.ts). The data is ODbL: the panel credits
 * OpenStreetMap wherever the streets show.
 */
import { withUnifiedSpellings } from "./street-names";
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
  return `[out:json][timeout:15];way(around:${Math.round(radiusMeters)},${point[0].toFixed(6)},${point[1].toFixed(6)})["highway"~"^(${kinds.join("|")})$"]["name"];out geom;`;
}

export interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** The ways of an Overpass answer as pieces of street (at most `limit`); unnamed or unranked ones are left out. */
export function parseOverpassWays(elements: readonly OverpassElement[], limit = MAX_STREET_WAYS): StreetWay[] {
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
  // One spelling per street: pieces named with and without accents are one street (street-names.ts).
  return withUnifiedSpellings(ways.slice(0, limit));
}

/* ------------------------------------------------------------------ */
/*  Streets of the map's view                                          */
/* ------------------------------------------------------------------ */

/**
 * Video 8.5, 4:01 (26 nov 2026): the appraiser could not paint López Mateos
 * nor other avenues of his macro view. Only the streets within 1 km of the
 * pin were loaded, and at a macro zoom only the rank 1–2 ones could be
 * touched; López Mateos runs 4.7 km away and Prolongación Mariano Otero is
 * tertiary next to the subject. Now the generator also loads the named
 * streets of what the map shows, the classes that read at that zoom: every
 * street from zoom 16, the avenues down to tertiary from zoom 13, the main
 * roads only further out.
 */
export function viewStreetMaxRank(zoom: number) {
  return zoom >= 16 ? 4 : zoom >= 13 ? 3 : 2;
}

/** The OpenStreetMap `highway` values of the streets the view at this zoom loads (for the query). */
export function viewStreetHighways(zoom: number): string[] {
  const maxRank = viewStreetMaxRank(zoom);
  return Object.entries(HIGHWAY_RANKS)
    .filter(([, rank]) => rank <= maxRank)
    .flatMap(([highway]) => [highway, `${highway}_link`]);
}

/** Pieces of one view's answer at most: the most important classes first. */
export const MAX_VIEW_STREET_WAYS = 2500;
/** A view wider than this many degrees is a region, not a croquis: it is not loaded. */
export const MAX_VIEW_SPAN_DEGREES = 1;
/** The box asked for is snapped to this grid, so nearby views share one answer. */
const VIEW_GRID_DEGREES = 0.01;

/** A box [[south, west], [north, east]] of the map, in degrees. */
export type ViewBounds = readonly [LatLon, LatLon];

/**
 * The box to load for what the map shows: the view grown by half its size
 * on every side (a little panning needs nothing new), snapped outward to the
 * grid, at most `MAX_VIEW_SPAN_DEGREES` a side around its center.
 */
export function viewStreetsBox(view: ViewBounds): ViewBounds {
  const [[south, west], [north, east]] = view;
  const grow = (from: number, to: number) => {
    const middle = (from + to) / 2;
    const half = Math.min(MAX_VIEW_SPAN_DEGREES / 2, Math.abs(to - from));
    return [middle - half, middle + half] as const;
  };
  const [s, n] = grow(south, north);
  const [w, e] = grow(west, east);
  const down = (value: number) => Math.floor(value / VIEW_GRID_DEGREES) * VIEW_GRID_DEGREES;
  const up = (value: number) => Math.ceil(value / VIEW_GRID_DEGREES) * VIEW_GRID_DEGREES;
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return [
    [round(Math.max(-90, down(s))), round(Math.max(-180, down(w)))],
    [round(Math.min(90, up(n))), round(Math.min(180, up(e)))],
  ];
}

/** Whether a box holds another whole. */
export function boxContains(outer: ViewBounds, inner: ViewBounds) {
  return outer[0][0] <= inner[0][0] && outer[0][1] <= inner[0][1] && outer[1][0] >= inner[1][0] && outer[1][1] >= inner[1][1];
}

/** The cache key of a view's answer: its snapped box and the classes its zoom loads. */
export function viewStreetsCacheKey(box: ViewBounds, zoom: number) {
  return `${box[0][0]},${box[0][1]},${box[1][0]},${box[1][1]},r${viewStreetMaxRank(zoom)}`;
}

/**
 * The streets the generator can paint: the ones around the pin and the ones
 * of the view, each piece once (by its OpenStreetMap id), with one spelling
 * per street across both answers.
 */
export function mergedStreetWays(...answers: readonly (readonly StreetWay[])[]): StreetWay[] {
  const seen = new Set<string>();
  const merged: StreetWay[] = [];
  for (const ways of answers) {
    for (const way of ways) {
      const key = way.id !== undefined ? `id:${way.id}` : `${way.n}|${way.g[0]?.join(",")}|${way.g.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(way);
    }
  }
  return withUnifiedSpellings(merged);
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
