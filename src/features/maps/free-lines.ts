/**
 * «Trazo libre» of the croquis (23 nov 2026): lines the appraiser draws by
 * hand over the map, one click per vertex, turning wherever he wants, as many
 * per croquis as he needs. Each line keeps its own color and width. Pure
 * functions, tested without a browser; the lines persist with the croquis
 * settings of the valuation (croquis.ts) and the server draws them on the
 * image exactly where they were drawn, on every framing
 * (croquis-image.service.ts).
 */
import { z } from "zod";

import { WEIGHT_RANGE } from "./highlights";
import { STATIC_MAP_SIZE, imagePixel } from "./static-map";
import { distanceMeters } from "./streets";
import type { LatLon } from "./types";

export interface FreeLine {
  id: string;
  color: string;
  weight: number;
  points: LatLon[];
  /**
   * The street the line stands for (video 8.5, 4:30): its name prints on the
   * croquis in a band edged with the line's color, like a highlighted
   * street's, and moves and turns like one («Letreros»). Absent, no name.
   */
  name?: string;
}

export type FreeLineStyle = Pick<FreeLine, "color" | "weight">;

/** More lines than this would not read on one croquis. */
export const MAX_FREE_LINES = 40;
/** Vertices of one line; a hand-drawn line never needs more. */
export const MAX_LINE_POINTS = 200;

/** The style of the next line: a dark orange that reads over the street map and the satellite photo. */
export const DEFAULT_FREE_LINE_STYLE: FreeLineStyle = { color: "#d35400", weight: 5 };

/** A street name, as long as OpenStreetMap's longest. */
export const MAX_LINE_NAME = 120;

const pointSchema = z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)]).readonly();

export const freeLineSchema = z.object({
  id: z.string().trim().min(1).max(64),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  weight: z.number().int().min(WEIGHT_RANGE.min).max(WEIGHT_RANGE.max),
  points: z.array(pointSchema).min(2).max(MAX_LINE_POINTS),
  name: z.string().trim().max(MAX_LINE_NAME).optional(),
});

export const freeLinesSchema = z.array(freeLineSchema).max(MAX_FREE_LINES);

/** A new id for a line, unique among the ones of the croquis. */
export function newFreeLineId(lines: readonly Pick<FreeLine, "id">[], random: () => number = Math.random) {
  const taken = new Set(lines.map((line) => line.id));
  for (;;) {
    const id = `trazo-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
    if (!taken.has(id)) return id;
  }
}

/** The line being drawn with one more vertex; a click on the last vertex (a double click's first half) adds nothing. */
export function addDraftPoint(draft: readonly LatLon[], point: LatLon, toleranceMeters = 0): LatLon[] {
  const last = draft[draft.length - 1];
  if (last && distanceMeters(last, point) <= toleranceMeters) return [...draft];
  if (draft.length >= MAX_LINE_POINTS) return [...draft];
  return [...draft, point];
}

/** «Deshacer punto»: the line being drawn without its last vertex. */
export function undoDraftPoint(draft: readonly LatLon[]): LatLon[] {
  return draft.slice(0, -1);
}

/** Consecutive vertices closer than the tolerance become one (a double click puts two clicks on the same spot). */
export function dedupePoints(points: readonly LatLon[], toleranceMeters = 0): LatLon[] {
  const out: LatLon[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && distanceMeters(last, point) <= toleranceMeters) continue;
    out.push(point);
  }
  return out;
}

/**
 * «Terminar trazo»: the line being drawn joins the croquis' lines with the
 * style chosen for it. A line needs two different vertices; with fewer
 * nothing is added (null), and the croquis keeps its lines.
 */
export function finishFreeLine(lines: readonly FreeLine[], draft: readonly LatLon[], style: FreeLineStyle, id: string, toleranceMeters = 0): FreeLine[] | null {
  const points = dedupePoints(draft, toleranceMeters).slice(0, MAX_LINE_POINTS);
  if (points.length < 2 || lines.length >= MAX_FREE_LINES) return null;
  return [...lines, { id, color: style.color, weight: style.weight, points: points.map(([lat, lon]) => [lat, lon] as LatLon) }];
}

/** One line with its new vertices (a vertex dragged, or one added in the middle of a segment). */
export function withLinePoints(lines: readonly FreeLine[], id: string, points: readonly LatLon[]): FreeLine[] {
  const next = dedupePoints(points).slice(0, MAX_LINE_POINTS);
  if (next.length < 2) return [...lines];
  return lines.map((line) => (line.id === id ? { ...line, points: next } : line));
}

/** One line with another color or width. */
export function withLineStyle(lines: readonly FreeLine[], id: string, patch: Partial<FreeLineStyle>): FreeLine[] {
  return lines.map((line) => (line.id === id ? { ...line, ...patch } : line));
}

/** One line with the name of its street as it is being typed (the label trims it); a blank name takes it away. */
export function withLineName(lines: readonly FreeLine[], id: string, name: string): FreeLine[] {
  const typed = name.slice(0, MAX_LINE_NAME);
  return lines.map((line) => {
    if (line.id !== id) return line;
    const { name: _previous, ...rest } = line;
    return typed.trim() ? { ...rest, name: typed } : rest;
  });
}

export function withoutLine(lines: readonly FreeLine[], id: string): FreeLine[] {
  return lines.filter((line) => line.id !== id);
}

/** The lines as stored; damaged entries are left out, so one bad line never loses the others. */
export function readFreeLines(value: unknown): FreeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = freeLineSchema.safeParse(item);
    return parsed.success ? [parsed.data as FreeLine] : [];
  }).slice(0, MAX_FREE_LINES);
}

/** The vertices of a line in map pixels of the image, as the `points` of an SVG polyline (at `scale`). */
export function freeLinePixels(center: LatLon, zoom: number, points: readonly LatLon[], scale = 1) {
  return points
    .map((point) => imagePixel(center, zoom, point))
    .map(({ x, y }) => `${(x * scale).toFixed(1)},${(y * scale).toFixed(1)}`)
    .join(" ");
}

/** Whether any part of the line can show on the image: its box touches the frame. */
export function freeLineInFrame(center: LatLon, zoom: number, line: Pick<FreeLine, "points" | "weight">) {
  const pixels = line.points.map((point) => imagePixel(center, zoom, point));
  const margin = line.weight;
  const xs = pixels.map((p) => p.x);
  const ys = pixels.map((p) => p.y);
  return Math.max(...xs) >= -margin && Math.min(...xs) <= STATIC_MAP_SIZE.width + margin && Math.max(...ys) >= -margin && Math.min(...ys) <= STATIC_MAP_SIZE.height + margin;
}

/** The opacity of the lines on the map and on the image: the street highlights'. */
export const FREE_LINE_OPACITY = 0.9;

/**
 * The free lines as an SVG the size of the image (at `scale`), in the order
 * they were drawn, each with its color and width (in map pixels, as the
 * interactive map and the highlighted streets use them), with round corners
 * and ends. The parts outside the frame are cut by the image itself; the
 * lines entirely outside are left out.
 */
export function freeLinesOverlaySvg(center: LatLon, zoom: number, lines: readonly FreeLine[], scale = 2) {
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const items = lines
    .filter((line) => line.points.length >= 2 && freeLineInFrame(center, zoom, line))
    .map(
      (line) =>
        `<polyline points="${freeLinePixels(center, zoom, line.points, scale)}" fill="none" stroke="${line.color.replace(/[^#0-9a-f]/gi, "")}" stroke-opacity="${FREE_LINE_OPACITY}" stroke-width="${(line.weight * scale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${items.join("")}</svg>`;
}
