/**
 * The streets and the areas the base map of a croquis draws, and that base
 * as an image. They come from our copy of OpenStreetMap: the streets from
 * `devpware_calles_osm` (the same table as the highlighted streets), the
 * parks, water, land uses and buildings from `devpware_areas_osm` (migration
 * 067): no tile server and no Google behind it. While a copy is not loaded
 * (a fresh server before `pnpm streets:import` or `pnpm areas:import`), the
 * named streets around the frame come through the Overpass fallback of
 * streets.service.ts, and the areas of the frame through Overpass too,
 * limited and cached here, with the same ODbL data.
 */
import sharp from "sharp";

import { rateLimits } from "@/security/rate-limit/rate-limiter";

import { frameBounds } from "../croquis-streets";
import { areaKindsAtZoom, areasQueryBox, minimumAreaM2, overpassAreasQuery, parseOverpassAreas, type BaseMapArea, type OverpassAreaElement } from "../osm-areas";
import { baseMapHighways, baseMapSvg, type BaseMapOptions, type BaseMapWay } from "../osm-base-map";
import { STATIC_MAP_SIZE } from "../static-map";
import { distanceMeters, metersPerPixel, type StreetWay } from "../streets";
import type { LatLon } from "../types";
import { areasInBox, hasStoredAreas } from "./areas-db";
import { hasStoredStreets, streetsInBox } from "./streets-db";
import { fetchFromOverpass, getStreetsAround } from "./streets.service";

/** The Overpass fallback only reaches this far around the center (streets.service.ts). */
const FALLBACK_MAX_RADIUS = 2000;

/** Rank of the highlighted streets' data → a class for the base map, for the fallback (which keeps only the rank). */
const RANK_HIGHWAYS: Record<number, string> = { 1: "primary", 2: "secondary", 3: "tertiary", 4: "residential" };

const fallbackBaseWays = (ways: readonly StreetWay[]): BaseMapWay[] => ways.map((way) => ({ name: way.n, highway: RANK_HIGHWAYS[way.r] ?? "residential", g: way.g }));

export interface BaseMapSource {
  /** The streets of these classes crossing the box, from our copy. */
  inBox: (bounds: readonly [LatLon, LatLon], highways: readonly string[], toleranceDegrees: number) => Promise<BaseMapWay[]>;
  loaded: () => Promise<boolean>;
  /** The named streets around a point when the copy cannot answer (Overpass). */
  around: (point: LatLon, radiusMeters: number) => Promise<StreetWay[]>;
}

const DATABASE_SOURCE: BaseMapSource = {
  inBox: streetsInBox,
  loaded: hasStoredStreets,
  around: async (point, radius) => (await getStreetsAround(point, radius)).ways,
};

/** Half a map pixel, in degrees: what the image could not show anyway. */
const halfPixelDegrees = (center: LatLon, zoom: number) => (metersPerPixel(zoom, center[0]) * 0.5) / 111_320;

/** The streets of the frame, from our copy; from the fallback only while the copy is empty or cannot be read. */
export async function baseMapWays(center: LatLon, zoom: number, source: BaseMapSource = DATABASE_SOURCE): Promise<BaseMapWay[]> {
  const bounds = frameBounds(center, zoom);
  try {
    const ways = await source.inBox(bounds, baseMapHighways(zoom), halfPixelDegrees(center, zoom));
    if (ways.length || (await source.loaded())) return ways;
  } catch (error) {
    console.error(`[CROQUIS] base map from db failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const radius = Math.min(FALLBACK_MAX_RADIUS, Math.ceil(distanceMeters(center, bounds[1])));
  return fallbackBaseWays(await source.around(center, radius));
}

/* ------------------------------------------------------------------ */
/*  Areas                                                              */
/* ------------------------------------------------------------------ */

/** Where the areas of a frame come from; the tests replace it. */
export interface BaseMapAreaSource {
  /** The areas of these kinds crossing the box, from our copy. */
  inBox: (bounds: readonly [LatLon, LatLon], kinds: BaseMapArea["kind"][], toleranceDegrees: number, minAreaM2: number) => Promise<BaseMapArea[]>;
  loaded: () => Promise<boolean>;
  /** The areas of a box (snapped to the grid) when the copy cannot answer. */
  overpass: (box: readonly [LatLon, LatLon], withBuildings: boolean) => Promise<BaseMapArea[]>;
}

/** An Overpass answer for a box is reused for a day: parks do not move. */
const AREAS_FRESH_MS = 24 * 60 * 60_000;
const MAX_AREA_CACHE_ENTRIES = 200;
const areaCache = new Map<string, { storedAt: number; areas: BaseMapArea[] }>();
const areasInFlight = new Map<string, Promise<BaseMapArea[]>>();

/**
 * The areas of a box from the public Overpass mirrors, cached for a day per
 * box (one request per box at a time) and limited for the whole server: the
 * mirrors are shared and this is only the fallback. Over the limit, or when
 * every mirror fails, the frame goes without areas: the croquis still has
 * its streets, and a croquis is never refused for want of its parks.
 */
export async function overpassAreas(box: readonly [LatLon, LatLon], withBuildings: boolean, fetchImpl: typeof fetch = fetch): Promise<BaseMapArea[]> {
  const key = `${box[0].join(",")},${box[1].join(",")}|${withBuildings ? "b" : "-"}`;
  const cached = areaCache.get(key);
  if (cached && Date.now() - cached.storedAt < AREAS_FRESH_MS) return cached.areas;
  const pending = areasInFlight.get(key);
  if (pending) return pending;
  if (!rateLimits.overpassAreas.consume("server").allowed) {
    console.warn("[CROQUIS] areas from overpass skipped: over the server's limit");
    return [];
  }
  const request = (async () => {
    try {
      const areas = await fetchFromOverpass(overpassAreasQuery(box, withBuildings), (elements: OverpassAreaElement[]) => parseOverpassAreas(elements), fetchImpl);
      console.info(`[CROQUIS] areas source=overpass n=${areas.length}`);
      for (const [entry, value] of areaCache) if (Date.now() - value.storedAt > AREAS_FRESH_MS) areaCache.delete(entry);
      while (areaCache.size >= MAX_AREA_CACHE_ENTRIES) areaCache.delete(areaCache.keys().next().value as string);
      areaCache.set(key, { storedAt: Date.now(), areas });
      return areas;
    } catch (error) {
      console.error(`[CROQUIS] areas from overpass failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    } finally {
      areasInFlight.delete(key);
    }
  })();
  areasInFlight.set(key, request);
  return request;
}

const DATABASE_AREAS: BaseMapAreaSource = { inBox: areasInBox, loaded: hasStoredAreas, overpass: (box, withBuildings) => overpassAreas(box, withBuildings) };

/** The fallback asks Overpass for buildings only from this zoom: a wider box of a city holds tens of thousands, more than a mirror answers in time. */
const OVERPASS_BUILDINGS_MIN_ZOOM = 16;

/**
 * The parks, water, land uses, buildings and waterways of the frame, from
 * our copy; from Overpass only while the copy is empty or cannot be read.
 * The frame is grown a little so a park's edge never shows along the
 * image's border.
 */
export async function baseMapAreas(center: LatLon, zoom: number, source: BaseMapAreaSource = DATABASE_AREAS): Promise<BaseMapArea[]> {
  const [[south, west], [north, east]] = frameBounds(center, zoom);
  const growLat = (north - south) * 0.1;
  const growLon = (east - west) * 0.1;
  const bounds: [LatLon, LatLon] = [
    [south - growLat, west - growLon],
    [north + growLat, east + growLon],
  ];
  try {
    const areas = await source.inBox(bounds, areaKindsAtZoom(zoom), halfPixelDegrees(center, zoom), minimumAreaM2(zoom, center[0]));
    if (areas.length || (await source.loaded())) return areas;
  } catch (error) {
    console.error(`[CROQUIS] areas from db failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return source.overpass(areasQueryBox(bounds), zoom >= OVERPASS_BUILDINGS_MIN_ZOOM);
}

/** The base map as PNG bytes at the stored image's size. */
export async function renderBaseMapPng(center: LatLon, zoom: number, ways: readonly BaseMapWay[], options: BaseMapOptions = {}) {
  const scale = options.scale ?? 2;
  return sharp(Buffer.from(baseMapSvg(center, zoom, ways, { ...options, scale })))
    .resize(STATIC_MAP_SIZE.width * scale, STATIC_MAP_SIZE.height * scale)
    .png()
    .toBuffer();
}
