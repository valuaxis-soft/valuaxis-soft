/**
 * Streets around the subject property (etapa 2 of the maps quote): the
 * pieces of street as OpenStreetMap carries them, distances on a local flat
 * projection, which street the subject faces and which ones adjoin it, and
 * the simplification that keeps the croquis URL short. Pure functions,
 * tested without a browser; the demonstration and the valuation share them.
 */
import type { LatLon } from "./types";

/** One piece of a street (an OpenStreetMap way). A street highlights as a whole, by name. */
export interface StreetWay {
  /** OpenStreetMap way id; absent in hand-made data. */
  id?: number;
  /** Street name; empty for unnamed pieces. */
  n: string;
  /** 1–2 main roads, 3 secondary, 4 residential. */
  r: number;
  g: LatLon[];
}

/* ------------------------------------------------------------------ */
/*  Distances                                                          */
/* ------------------------------------------------------------------ */

// Local flat projection: meters per degree, the longitude scaled by the latitude of the reference point.
const M_LAT = 110574;
const metersPerLonDegree = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Distance in meters between two points. */
export function distanceMeters(a: LatLon, b: LatLon) {
  return Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * metersPerLonDegree(a[0]));
}

/** Distance in meters from p to the segment a–b. */
export function segmentDistance(p: LatLon, a: LatLon, b: LatLon) {
  const mLon = metersPerLonDegree(p[0]);
  const ax = a[1] * mLon, ay = a[0] * M_LAT;
  const bx = b[1] * mLon, by = b[0] * M_LAT;
  const px = p[1] * mLon, py = p[0] * M_LAT;
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance in meters from p to the closest point of a way. */
export function wayDistance(p: LatLon, way: Pick<StreetWay, "g">) {
  let min = Infinity;
  for (let i = 1; i < way.g.length; i++) min = Math.min(min, segmentDistance(p, way.g[i - 1], way.g[i]));
  return min;
}

/* ------------------------------------------------------------------ */
/*  Streets around the subject                                         */
/* ------------------------------------------------------------------ */

export interface StreetDetection {
  front: string | null;
  side: ReadonlySet<string>;
  main: ReadonlySet<string>;
}

/** Within this distance a street counts as adjoining (colindante). */
export const SIDE_STREET_METERS = 110;
/** Main roads (rank 1–2) within this distance are highlighted. */
export const MAIN_ROAD_METERS = 900;

/**
 * The front street is the closest named street; adjoining streets are the
 * others within 110 m; main roads are rank 1–2 streets within 900 m that are
 * neither. The appraiser then paints streets by category on top of this.
 */
export function detectStreets(p: LatLon, ways: readonly StreetWay[]): StreetDetection {
  let front: string | null = null;
  let best = Infinity;
  for (const way of ways) {
    if (!way.n) continue;
    const d = wayDistance(p, way);
    if (d < best) {
      best = d;
      front = way.n;
    }
  }
  const side = new Set<string>();
  for (const way of ways) if (way.n && way.n !== front && wayDistance(p, way) < SIDE_STREET_METERS) side.add(way.n);
  const main = new Set<string>();
  for (const way of ways) {
    if (way.n && way.r <= 2 && way.n !== front && !side.has(way.n) && wayDistance(p, way) < MAIN_ROAD_METERS) main.add(way.n);
  }
  return { front, side, main };
}

/* ------------------------------------------------------------------ */
/*  Simplification                                                     */
/* ------------------------------------------------------------------ */

/** Meters one pixel covers at this zoom and latitude (Web Mercator, 256 px tiles). */
export function metersPerPixel(zoom: number, lat: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Douglas–Peucker: the line without the vertices that stray less than
 * `toleranceMeters` from it. The ends always stay.
 */
export function simplifyPolyline(points: readonly LatLon[], toleranceMeters: number): LatLon[] {
  if (points.length <= 2 || toleranceMeters <= 0) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let max = toleranceMeters;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Whether the way shows inside the box [south, west]–[north, east]: a vertex
 * inside it, or a segment crossing it (a long straight piece of avenue can
 * have both ends outside a micro frame and still run through it).
 */
export function wayInBounds(way: Pick<StreetWay, "g">, bounds: readonly [LatLon, LatLon]) {
  const [[south, west], [north, east]] = bounds;
  const inside = ([lat, lon]: LatLon) => lat >= south && lat <= north && lon >= west && lon <= east;
  if (way.g.some(inside)) return true;
  // Liang–Barsky: the part of each segment within the box.
  return way.g.some((from, i) => {
    const to = way.g[i + 1];
    if (!to) return false;
    const d = [to[0] - from[0], to[1] - from[1]];
    let enter = 0;
    let leave = 1;
    const edges: [number, number][] = [
      [-d[0], from[0] - south],
      [d[0], north - from[0]],
      [-d[1], from[1] - west],
      [d[1], east - from[1]],
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const t = q / p;
      if (p < 0) enter = Math.max(enter, t);
      else leave = Math.min(leave, t);
      if (enter > leave) return false;
    }
    return true;
  });
}
