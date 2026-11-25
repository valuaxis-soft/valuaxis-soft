/**
 * The streets the base map of a croquis draws, and that base as an image.
 * They come from our copy of OpenStreetMap (`devpware_calles_osm`, the same
 * table as the highlighted streets): no tile server and no Google behind
 * it. While the copy is not loaded (a fresh server before
 * `pnpm streets:import`), the named streets around the frame come through
 * the Overpass fallback of streets.service.ts, with the same ODbL data.
 */
import sharp from "sharp";

import { frameBounds } from "../croquis-streets";
import { baseMapHighways, baseMapSvg, type BaseMapOptions, type BaseMapWay } from "../osm-base-map";
import { STATIC_MAP_SIZE } from "../static-map";
import { distanceMeters, metersPerPixel, type StreetWay } from "../streets";
import type { LatLon } from "../types";
import { hasStoredStreets, streetsInBox } from "./streets-db";
import { getStreetsAround } from "./streets.service";

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

/** The streets of the frame, from our copy; from the fallback only while the copy is empty or cannot be read. */
export async function baseMapWays(center: LatLon, zoom: number, source: BaseMapSource = DATABASE_SOURCE): Promise<BaseMapWay[]> {
  const bounds = frameBounds(center, zoom);
  // Half a map pixel, in degrees: what the image could not show anyway.
  const tolerance = (metersPerPixel(zoom, center[0]) * 0.5) / 111_320;
  try {
    const ways = await source.inBox(bounds, baseMapHighways(zoom), tolerance);
    if (ways.length || (await source.loaded())) return ways;
  } catch (error) {
    console.error(`[CROQUIS] base map from db failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const radius = Math.min(FALLBACK_MAX_RADIUS, Math.ceil(distanceMeters(center, bounds[1])));
  return fallbackBaseWays(await source.around(center, radius));
}

/** The base map as PNG bytes at the stored image's size. */
export async function renderBaseMapPng(center: LatLon, zoom: number, ways: readonly BaseMapWay[], options: BaseMapOptions = {}) {
  const scale = options.scale ?? 2;
  return sharp(Buffer.from(baseMapSvg(center, zoom, ways, { ...options, scale })))
    .resize(STATIC_MAP_SIZE.width * scale, STATIC_MAP_SIZE.height * scale)
    .png()
    .toBuffer();
}
