/**
 * The highlighted streets as the croquis image carries them: which pieces
 * fall in the frame, simplified to what the image can show, capped so the
 * image stays legible, with the name labels of the streets that made it. Pure functions, tested without a browser; the server builds the
 * image from them (croquis-image.service.ts).
 */
import type { CroquisKind } from "./croquis";
import { streetLabelBox } from "./croquis";
import type { FreeLine } from "./free-lines";
import {
  highlightedWays,
  paintFromStreets,
  streetAngle,
  uprightAngle,
  type CroquisLabelPlacement,
  type HighlightedWay,
  type StreetHighlights,
  type StreetLabel,
} from "./highlights";
import type { MapCorner } from "./map-styles";
import { northArrowBox } from "./north-arrow-symbols";
import { attributionBox } from "./osm-base-map";
import { STATIC_MAP_SIZE, imagePixel, pointAtPixel } from "./static-map";
import { distanceMeters, metersPerPixel, simplifyPolyline, wayInBounds, type StreetWay } from "./streets";
import type { LatLon } from "./types";

/**
 * Pieces of street on one image beyond this add nothing legible. Until 25 nov
 * 2026 the streets went in the Maps Static API URL and only about 40 pieces
 * fit; the image is drawn by us now (osm-base-map.ts), so only legibility caps them.
 */
export const MAX_CROQUIS_WAYS = 400;
/** A vertex closer than this to the line is not visible: half a map pixel. */
const SIMPLIFY_PIXELS = 0.5;
/** The frame plus a margin, so a piece that only crosses the edge still draws. */
const FRAME_MARGIN = 1.15;

/** A highlighted street as the image draws it: its color and width (map pixels) over its points. */
export interface CroquisPath {
  color: string;
  weight: number;
  points: readonly LatLon[];
}

export interface CroquisStreets {
  paths: CroquisPath[];
  labels: StreetLabel[];
  /** Names of streets with highlighted pieces in the frame that did not fit the image. */
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

/**
 * The streets a croquis draws: every highlighted street, on every croquis
 * (the macro croquis drew the rank 1–2 avenues only until 26 nov 2026, and
 * an avenue OpenStreetMap ranks tertiary, as Prolongación Mariano Otero near
 * the subject, never showed on it: video 8.5, 10:18; the map of comparables
 * drew none until V7.1-22, 16 nov 2026). Pieces outside the
 * frame are left out, the rest simplified for the zoom; the closest pieces to
 * the center go first, so when the cap is reached the farthest are the
 * ones omitted. The names only go on streets that are drawn, plus the names
 * of the free lines that have one. `kind` no longer changes what is drawn;
 * it stays so every croquis is asked for the same way.
 */
export function croquisStreets(
  _kind: CroquisKind,
  center: LatLon,
  zoom: number,
  highlights: StreetHighlights,
  ways: readonly StreetWay[],
  subject: LatLon = center,
  avoid: LabelObstacles = {},
): CroquisStreets {
  const shown = highlightedWays({ front: highlights.front, paint: paintFromStreets(highlights.streets) }, highlights.styles, ways);
  const bounds = frameBounds(center, zoom);
  const tolerance = metersPerPixel(zoom, center[0]) * SIMPLIFY_PIXELS;
  const inFrame = shown
    .filter((item) => wayInBounds(item.way, bounds))
    .map((item, order) => ({ item, order, proximity: wayProximity(item.way, center), way: { ...item.way, g: simplifyPolyline(item.way.g, tolerance) } }))
    .sort((a, b) => a.proximity - b.proximity);
  const kept: typeof inFrame = [];
  const omitted = new Set<string>();
  for (const entry of inFrame) {
    if (kept.length >= MAX_CROQUIS_WAYS) {
      omitted.add(entry.way.n);
      continue;
    }
    kept.push(entry);
  }
  // Back to drawing order: avenues at the bottom, the front street on top.
  kept.sort((a, b) => a.order - b.order);
  const drawn = kept.map(({ item, way }): HighlightedWay => ({ ...item, way }));
  const drawnNames = new Set(drawn.map((entry) => entry.way.n));
  // «Mostrar nombres» is the highlighted streets'; a free line with a name always prints it.
  const named = [...(highlights.names ? drawn : []), ...namedLines(avoid.lines ?? [])];
  return {
    paths: drawn.map(({ way, style }) => ({ color: style.color, weight: style.weight, points: way.g })),
    labels: named.length ? frameLabels(named, center, zoom, subject, avoid) : [],
    omitted: [...omitted].filter((name) => !drawnNames.has(name)),
  };
}

/**
 * Video 8.5, 4:30: the free lines with the name of their street, as pieces of
 * a street in the line's color, so their name is placed, kept clear of the
 * pin and of the other names, moved and turned like a highlighted street's.
 */
function namedLines(lines: readonly FreeLine[]): HighlightedWay[] {
  return lines.flatMap((line): HighlightedWay[] => {
    const name = line.name?.trim();
    return name && line.points.length >= 2 ? [{ way: { n: name, r: 4, g: line.points }, key: "cuarta", style: { on: true, color: line.color, weight: line.weight } }] : [];
  });
}

/** A name keeps this far from the subject's pin, in map pixels. */
const LABEL_MARGIN = 12;
/** Where along the visible piece a name is tried, in order: the middle first. */
const LABEL_SPOTS = [0.5, 0.32, 0.68, 0.18, 0.82, 0.08, 0.92];
/** Runs of a street tried for its name, the longest first. */
const LABEL_RUNS = 3;
/** How far beside its street a name may sit when no spot on it is free, in map pixels (a band is 20 high). */
const LABEL_SIDE_OFFSETS = [0, -15, 15, -30, 30];

/**
 * FAL-35: what the street names keep clear of, besides the subject's pin and
 * each other: the names the appraiser placed by hand (they stay where they
 * are), the comparables' pins with their numbers and the legend's box.
 */
export interface LabelObstacles {
  placements?: readonly CroquisLabelPlacement[];
  /** «Trazo libre»: the lines whose name prints too, placed like a street's. */
  lines?: readonly FreeLine[];
  /** The corner of the north arrow: the names keep clear of it and of the credit to OpenStreetMap. */
  corner?: MapCorner;
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
  // The subject's drop stands above its point (subjectPinSvg: 30 × 38 map pixels); a name keeps off all of it.
  const taken: Box[] = [{ x: pin.x, y: pin.y - 17, halfX: LABEL_MARGIN + 3, halfY: 21 }];
  // A comparable's circle with its number to the right («C-12»).
  for (const point of avoid.pins ?? []) {
    const at = imagePixel(center, zoom, point);
    taken.push({ x: at.x + 16, y: at.y, halfX: 28, halfY: 11 });
  }
  if (avoid.legend) {
    const { x, y, width, height } = avoid.legend;
    taken.push({ x: x + width / 2, y: y + height / 2, halfX: width / 2 + 4, halfY: height / 2 + 4 });
  }
  if (avoid.corner) {
    for (const { x, y, width, height } of [northArrowBox(avoid.corner), attributionBox(avoid.corner)]) taken.push({ x: x + width / 2, y: y + height / 2, halfX: width / 2 + 2, halfY: height / 2 + 2 });
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
