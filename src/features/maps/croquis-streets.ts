/**
 * The highlighted streets as the croquis image carries them: which pieces
 * fall in the frame, simplified to what the image can show, capped so the
 * Maps Static API URL stays short, with the name labels of the streets that
 * made it. Pure functions, tested without a browser; the server builds the
 * image from them (croquis-image.service.ts).
 */
import type { CroquisKind } from "./croquis";
import { streetLabelBox } from "./croquis";
import { highlightedWays, macroHighlights, paintFromStreets, streetAngle, type HighlightedWay, type StreetHighlights, type StreetLabel } from "./highlights";
import { STATIC_MAP_SIZE, encodePolyline, imagePixel, type StaticMapPath } from "./static-map";
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
export function croquisStreets(kind: CroquisKind, center: LatLon, zoom: number, highlights: StreetHighlights, ways: readonly StreetWay[], subject: LatLon = center): CroquisStreets {
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
    labels: highlights.names ? frameLabels(drawn, center, zoom, subject) : [],
    omitted: [...omitted].filter((name) => !drawnNames.has(name)),
  };
}

/** A name keeps this far from the subject's pin, in map pixels. */
const LABEL_MARGIN = 12;
/** Where along the visible piece a name is tried, in order: the middle first. */
const LABEL_SPOTS = [0.5, 0.32, 0.68, 0.18, 0.82];

interface Sample {
  point: LatLon;
  x: number;
  y: number;
  angle: number;
}

/** Points every few pixels along the street's pieces, with the direction there; the runs that stay inside the image, each in order. */
function visibleRuns(pieces: readonly StreetWay[], center: LatLon, zoom: number): Sample[][] {
  const runs: Sample[][] = [];
  for (const piece of pieces) {
    let run: Sample[] = [];
    for (let i = 0; i + 1 < piece.g.length; i += 1) {
      const from = piece.g[i];
      const to = piece.g[i + 1];
      const a = imagePixel(center, zoom, from);
      const b = imagePixel(center, zoom, to);
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
      const angle = streetAngle(from, to);
      for (let k = 0; k < steps; k += 1) {
        const t = k / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        // A street along the very edge still gets its name; the band is then pulled inside the image (streetLabelBox).
        const inside = x >= 0 && x <= STATIC_MAP_SIZE.width && y >= 0 && y <= STATIC_MAP_SIZE.height;
        if (inside) run.push({ point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], x, y, angle });
        else if (run.length) {
          runs.push(run);
          run = [];
        }
      }
    }
    if (run.length) runs.push(run);
  }
  return runs;
}

type Box = { x: number; y: number; halfX: number; halfY: number };
const overlaps = (a: Box, b: Box) => Math.abs(a.x - b.x) < a.halfX + b.halfX && Math.abs(a.y - b.y) < a.halfY + b.halfY;

function boxOf(center: LatLon, zoom: number, label: Pick<StreetLabel, "name" | "point" | "angle">): Box {
  const box = streetLabelBox(center, zoom, label);
  const radians = (box.angle * Math.PI) / 180;
  return {
    x: box.x,
    y: box.y,
    halfX: Math.abs((box.width / 2) * Math.cos(radians)) + Math.abs((box.height / 2) * Math.sin(radians)),
    halfY: Math.abs((box.width / 2) * Math.sin(radians)) + Math.abs((box.height / 2) * Math.cos(radians)),
  };
}

/**
 * V5.7-14: one name per drawn street, on the longest piece of it the image
 * shows and turned along it there. The middle of that piece is tried first,
 * then points to either side, so a name does not cover the subject's pin or
 * another name; when every spot is taken it goes in the middle anyway. The
 * front street is placed first. The appraiser moves or turns any of them in
 * the generator («Letreros»).
 */
export function frameLabels(drawn: readonly HighlightedWay[], center: LatLon, zoom: number, subject: LatLon = center): StreetLabel[] {
  const byName = new Map<string, { pieces: StreetWay[]; color: string; front: boolean }>();
  for (const { way, style, key } of drawn) {
    const entry = byName.get(way.n) ?? { pieces: [], color: style.color, front: key === "front" };
    entry.pieces.push(way);
    byName.set(way.n, entry);
  }
  const pin = imagePixel(center, zoom, subject);
  const taken: Box[] = [{ x: pin.x, y: pin.y, halfX: LABEL_MARGIN, halfY: LABEL_MARGIN * 1.5 }];
  const labels: StreetLabel[] = [];
  const ordered = [...byName.entries()].sort(([, a], [, b]) => Number(b.front) - Number(a.front));
  for (const [name, { pieces, color }] of ordered) {
    const run = visibleRuns(pieces, center, zoom).sort((a, b) => b.length - a.length)[0];
    if (!run) continue;
    const candidates = LABEL_SPOTS.map((spot) => run[Math.min(run.length - 1, Math.floor(spot * run.length))]).map((sample) => ({ name, point: sample.point, color, angle: sample.angle }));
    const chosen = candidates.find((label) => !taken.some((box) => overlaps(box, boxOf(center, zoom, label)))) ?? candidates[0];
    taken.push(boxOf(center, zoom, chosen));
    labels.push(chosen);
  }
  return labels;
}
