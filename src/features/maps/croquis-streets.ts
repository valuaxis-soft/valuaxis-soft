/**
 * The highlighted streets as the croquis image carries them: which pieces
 * fall in the frame, simplified to what the image can show, capped so the
 * Maps Static API URL stays short, with the name labels of the streets that
 * made it. Pure functions, tested without a browser; the server builds the
 * image from them (croquis-image.service.ts).
 */
import type { CroquisKind } from "./croquis";
import { streetLabelBox } from "./croquis";
import {
  highlightedWays,
  macroHighlights,
  paintFromStreets,
  streetAngle,
  uprightAngle,
  type CroquisLabelPlacement,
  type HighlightedWay,
  type StreetHighlights,
  type StreetLabel,
} from "./highlights";
import { STATIC_MAP_SIZE, encodePolyline, imagePixel, pointAtPixel, type StaticMapPath } from "./static-map";
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
 * and the map of comparables every highlighted street (the map of comparables
 * drew none until V7.1-22, 16 nov 2026: the appraiser wants the streets
 * there too). Pieces outside the
 * frame are left out, the rest simplified for the zoom; the closest pieces to
 * the center go first, so when the URL budget runs out the farthest are the
 * ones omitted. The names only go on streets that are drawn.
 */
export function croquisStreets(
  kind: CroquisKind,
  center: LatLon,
  zoom: number,
  highlights: StreetHighlights,
  ways: readonly StreetWay[],
  subject: LatLon = center,
  avoid: LabelObstacles = {},
): CroquisStreets {
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
    labels: highlights.names ? frameLabels(drawn, center, zoom, subject, avoid) : [],
    omitted: [...omitted].filter((name) => !drawnNames.has(name)),
  };
}

/** A name keeps this far from the subject's pin, in map pixels. */
const LABEL_MARGIN = 12;
/** Where along the visible piece a name is tried, in order: the middle first. */
const LABEL_SPOTS = [0.5, 0.32, 0.68, 0.18, 0.82, 0.08, 0.92];
/** Runs of a street tried for its name, the longest first. */
const LABEL_RUNS = 3;
/** How far beside its street a name may sit when no spot on it is free, in map pixels (a band is 20 high). */
const LABEL_SIDE_OFFSETS = [0, -15, 15];

/**
 * FAL-35: what the street names keep clear of, besides the subject's pin and
 * each other: the names the appraiser placed by hand (they stay where they
 * are), the comparables' pins with their numbers and the legend's box.
 */
export interface LabelObstacles {
  placements?: readonly CroquisLabelPlacement[];
  pins?: readonly LatLon[];
  /** In map pixels of the image. */
  legend?: { x: number; y: number; width: number; height: number } | null;
}

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

/** How much two boxes overlap, in square map pixels; 0 when they do not touch. */
const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.halfX, b.x + b.halfX) - Math.max(a.x - a.halfX, b.x - b.halfX)) *
  Math.max(0, Math.min(a.y + a.halfY, b.y + b.halfY) - Math.max(a.y - a.halfY, b.y - b.halfY));

/**
 * V5.7-14, FAL-35: one name per drawn street, turned along it. The names the
 * appraiser placed by hand stay where they are; every other one is tried at
 * points along the longest pieces of its street the image shows (the middle
 * first), so it does not cover the subject's pin, a comparable with its
 * number, the legend or another name. When every spot is taken it goes
 * where it covers the least. The front street is placed first. The
 * appraiser moves or turns any of them in the generator («Letreros», or by
 * dragging it on the map).
 */
export function frameLabels(drawn: readonly HighlightedWay[], center: LatLon, zoom: number, subject: LatLon = center, avoid: LabelObstacles = {}): StreetLabel[] {
  const byName = new Map<string, { pieces: StreetWay[]; color: string; front: boolean }>();
  for (const { way, style, key } of drawn) {
    const entry = byName.get(way.n) ?? { pieces: [], color: style.color, front: key === "front" };
    entry.pieces.push(way);
    byName.set(way.n, entry);
  }
  const pin = imagePixel(center, zoom, subject);
  const taken: Box[] = [{ x: pin.x, y: pin.y, halfX: LABEL_MARGIN, halfY: LABEL_MARGIN * 1.5 }];
  // A comparable's circle with its number to the right («C-12»).
  for (const point of avoid.pins ?? []) {
    const at = imagePixel(center, zoom, point);
    taken.push({ x: at.x + 16, y: at.y, halfX: 28, halfY: 11 });
  }
  if (avoid.legend) {
    const { x, y, width, height } = avoid.legend;
    taken.push({ x: x + width / 2, y: y + height / 2, halfX: width / 2 + 4, halfY: height / 2 + 4 });
  }
  const placed = new Map((avoid.placements ?? []).map((placement) => [placement.name, placement]));
  const labels = new Map<string, StreetLabel>();
  for (const [name, { color }] of byName) {
    const placement = placed.get(name);
    if (!placement) continue;
    const label: StreetLabel = { name, point: placement.point, color, angle: uprightAngle(placement.angle) };
    taken.push(boxOf(center, zoom, label));
    labels.set(name, label);
  }
  const ordered = [...byName.entries()].sort(([, a], [, b]) => Number(b.front) - Number(a.front));
  for (const [name, { pieces, color }] of ordered.filter(([key]) => !placed.has(key))) {
    const runs = visibleRuns(pieces, center, zoom).sort((a, b) => b.length - a.length).slice(0, LABEL_RUNS);
    if (!runs.length) continue;
    const samples = runs.flatMap((run) => LABEL_SPOTS.map((spot) => run[Math.min(run.length - 1, Math.floor(spot * run.length))]));
    // On the street first; then just beside it, on either side, before covering anything.
    const candidates = LABEL_SIDE_OFFSETS.flatMap((offset) =>
      samples.map((sample): StreetLabel => {
        if (!offset) return { name, point: sample.point, color, angle: sample.angle };
        const radians = (sample.angle * Math.PI) / 180;
        return { name, point: pointAtPixel(center, zoom, sample.x - Math.sin(radians) * offset, sample.y + Math.cos(radians) * offset), color, angle: sample.angle };
      }),
    );
    const covering = (label: StreetLabel) => {
      const box = boxOf(center, zoom, label);
      return taken.reduce((sum, other) => sum + overlapArea(box, other), 0);
    };
    const chosen = candidates.find((label) => covering(label) === 0) ?? candidates.reduce((best, label) => (covering(label) < covering(best) ? label : best), candidates[0]);
    taken.push(boxOf(center, zoom, chosen));
    labels.set(name, chosen);
  }
  return ordered.flatMap(([name]) => (labels.has(name) ? [labels.get(name)!] : []));
}
