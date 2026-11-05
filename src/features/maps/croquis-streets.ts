/**
 * The highlighted streets as the croquis image carries them: which pieces
 * fall in the frame, simplified to what the image can show, capped so the
 * Maps Static API URL stays short, with the name labels of the streets that
 * made it. Pure functions, tested without a browser; the server builds the
 * image from them (croquis-image.service.ts).
 */
import type { CroquisKind } from "./croquis";
import { highlightedWays, macroHighlights, paintFromStreets, streetLabels, type HighlightedWay, type StreetHighlights, type StreetLabel } from "./highlights";
import { STATIC_MAP_SIZE, encodePolyline, type StaticMapPath } from "./static-map";
import { distanceMeters, metersPerPixel, simplifyPolyline, wayInBounds, type StreetWay } from "./streets";
import type { LatLon } from "./types";

/**
 * What the `path` parameters may add to the URL. Google accepts up to 16 KB,
 * but long URLs fail in some proxies, so the streets keep within about 8 KB
 * with the rest of the URL (key, styles, markers) under 1.5 KB.
 */
export const STREET_PATHS_BUDGET = 6500;
/** Pieces of street on one image beyond this add nothing legible. */
export const MAX_CROQUIS_WAYS = 40;
/** A vertex closer than this to the line is not visible: half a map pixel. */
const SIMPLIFY_PIXELS = 0.5;
/** The frame plus a margin, so a piece that only crosses the edge still draws. */
const FRAME_MARGIN = 1.15;

export interface CroquisStreets {
  paths: StaticMapPath[];
  labels: StreetLabel[];
  /** Names of streets with highlighted pieces in the frame that did not fit the URL. */
  omitted: string[];
}

/** The box the image shows, with a margin, in degrees. */
export function frameBounds(center: LatLon, zoom: number): readonly [LatLon, LatLon] {
  const meters = metersPerPixel(zoom, center[0]);
  const halfHeight = ((STATIC_MAP_SIZE.height / 2) * meters * FRAME_MARGIN) / 110574;
  const halfWidth = ((STATIC_MAP_SIZE.width / 2) * meters * FRAME_MARGIN) / (111320 * Math.cos((center[0] * Math.PI) / 180));
  return [
    [center[0] - halfHeight, center[1] - halfWidth],
    [center[0] + halfHeight, center[1] + halfWidth],
  ];
}

/** Closest vertex of the way to the point, in meters. */
function wayProximity(way: StreetWay, point: LatLon) {
  return Math.min(...way.g.map((vertex) => distanceMeters(vertex, point)));
}

/** The encoded `path` parameter's size in the URL, as URLSearchParams writes it. */
function pathUrlLength(path: StaticMapPath) {
  return encodeURIComponent(`color:0x${path.color.slice(1)}e6|weight:${path.weight}|enc:${encodePolyline(path.points)}`).length + "&path=".length;
}

/**
 * The streets a croquis draws: the macro croquis the avenues only, the micro
 * every highlighted street, the map of comparables none. Pieces outside the
 * frame are left out, the rest simplified for the zoom; the closest pieces to
 * the center go first, so when the URL budget runs out the farthest are the
 * ones omitted. The names only go on streets that are drawn.
 */
export function croquisStreets(kind: CroquisKind, center: LatLon, zoom: number, highlights: StreetHighlights, ways: readonly StreetWay[]): CroquisStreets {
  if (kind === "comparables") return { paths: [], labels: [], omitted: [] };
  const items = highlightedWays({ front: highlights.front, paint: paintFromStreets(highlights.streets) }, highlights.styles, ways);
  const shown = kind === "macro" ? macroHighlights(items) : items;
  const bounds = frameBounds(center, zoom);
  const tolerance = metersPerPixel(zoom, center[0]) * SIMPLIFY_PIXELS;
  const inFrame = shown
    .filter((item) => wayInBounds(item.way, bounds))
    .map((item, order) => ({ item, order, proximity: wayProximity(item.way, center), way: { ...item.way, g: simplifyPolyline(item.way.g, tolerance) } }))
    .sort((a, b) => a.proximity - b.proximity);
  const kept: typeof inFrame = [];
  const omitted = new Set<string>();
  let used = 0;
  for (const entry of inFrame) {
    const path: StaticMapPath = { color: entry.item.style.color, weight: entry.item.style.weight, points: entry.way.g };
    const length = pathUrlLength(path);
    if (kept.length >= MAX_CROQUIS_WAYS || used + length > STREET_PATHS_BUDGET) {
      omitted.add(entry.way.n);
      continue;
    }
    used += length;
    kept.push(entry);
  }
  // Back to drawing order: avenues at the bottom, the front street on top.
  kept.sort((a, b) => a.order - b.order);
  const drawn = kept.map(({ item, way }): HighlightedWay => ({ ...item, way }));
  const drawnNames = new Set(drawn.map((entry) => entry.way.n));
  return {
    paths: drawn.map(({ way, style }) => ({ color: style.color, weight: style.weight, points: way.g })),
    labels: highlights.names ? streetLabels(drawn, center) : [],
    omitted: [...omitted].filter((name) => !drawnNames.has(name)),
  };
}
