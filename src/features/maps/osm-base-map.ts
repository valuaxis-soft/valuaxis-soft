/**
 * The base map of every stored croquis, drawn by us from OpenStreetMap data
 * (our copy, `devpware_calles_osm`), never from Google: Google Maps Platform
 * does not allow storing its images (terms 3.2.3 a/b), so since 25 nov 2026
 * the croquis, the memoria and the PDF carry no Google imagery at all. The
 * streets by hierarchy with the colors of the usual OpenStreetMap map, their
 * names along them where they fit, and the credit «© colaboradores de
 * OpenStreetMap» that the ODbL asks for. Pure functions over SVG text,
 * tested without a database; the server rasterizes them with sharp
 * (server/osm-base.service.ts).
 */
import { STREET_LABEL_FONT_FAMILY } from "./croquis";
import type { MapCorner } from "./map-styles";
import { STATIC_MAP_SIZE, imagePixel } from "./static-map";
import { bestSpellings, spellingKey } from "./street-names";
import { metersPerPixel, simplifyPolyline } from "./streets";
import { uprightAngle } from "./highlights";
import type { LatLon } from "./types";

/** One piece of street as the base map draws it: its OpenStreetMap `highway` class keeps the motorway apart from the avenue. */
export interface BaseMapWay {
  name: string;
  highway: string;
  g: LatLon[];
}

/** The classes the map tells apart, from the most important down. */
type RoadClass = "motorway" | "trunk" | "primary" | "secondary" | "tertiary" | "minor" | "pedestrian";

const ROAD_CLASSES: readonly RoadClass[] = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "pedestrian"];

/** OpenStreetMap `highway` → class; links (ramps, laterals) take their road's. */
const HIGHWAY_CLASSES: Record<string, RoadClass> = {
  motorway: "motorway",
  trunk: "trunk",
  primary: "primary",
  secondary: "secondary",
  tertiary: "tertiary",
  residential: "minor",
  unclassified: "minor",
  living_street: "minor",
  pedestrian: "pedestrian",
};

function roadClass(highway: string): RoadClass | null {
  const base = highway.endsWith("_link") ? highway.slice(0, -"_link".length) : highway;
  return HIGHWAY_CLASSES[base] ?? null;
}

/**
 * Fill and edge of each class, the ones of the standard OpenStreetMap map
 * (openstreetmap-carto), so a valuer who knows that map reads this one; the
 * width is in map pixels at zoom 17 and narrows as the frame widens.
 */
const ROAD_STYLES: Record<RoadClass, { fill: string; casing: string; width: number }> = {
  motorway: { fill: "#e892a2", casing: "#dc2a67", width: 12 },
  trunk: { fill: "#f9b29c", casing: "#c84e2f", width: 11.5 },
  primary: { fill: "#fcd6a4", casing: "#a06b00", width: 11 },
  secondary: { fill: "#f7fabf", casing: "#707d05", width: 10 },
  tertiary: { fill: "#ffffff", casing: "#8f8f8f", width: 9 },
  minor: { fill: "#ffffff", casing: "#bbbbbb", width: 7 },
  pedestrian: { fill: "#dddde8", casing: "#999999", width: 5 },
};

/** The land color of the OpenStreetMap map. */
export const BASE_MAP_BACKGROUND = "#f2efe9";

/** The credit the ODbL asks for, on every stored croquis. */
export const OSM_CROQUIS_ATTRIBUTION = "© colaboradores de OpenStreetMap";

/** The widest zoom each class still shows at; a 30 km frame with every residential street would be grey felt. */
const MIN_ZOOM: Record<RoadClass, number> = { motorway: 0, trunk: 0, primary: 9, secondary: 11, tertiary: 12, minor: 13, pedestrian: 15 };
/** And the widest zoom its name shows at. */
const NAME_MIN_ZOOM: Record<RoadClass, number> = { motorway: 11, trunk: 11, primary: 12, secondary: 13, tertiary: 14, minor: 15, pedestrian: 16 };

/** The OpenStreetMap `highway` values the base map of a frame at this zoom draws (for the query). */
export function baseMapHighways(zoom: number): string[] {
  return Object.entries(HIGHWAY_CLASSES)
    .filter(([, kind]) => zoom >= MIN_ZOOM[kind])
    .flatMap(([highway]) => [highway, `${highway}_link`]);
}

/** Width of a class's line at this zoom, in map pixels. */
function roadWidth(kind: RoadClass, zoom: number, link: boolean) {
  const width = ROAD_STYLES[kind].width * 2 ** ((zoom - 17) * 0.7) * (link ? 0.7 : 1);
  return Math.max(kind === "minor" || kind === "pedestrian" ? 0.8 : 1.4, width);
}

/** A box on the image in map pixels, by its center and half sizes: what a street name must not cover. */
export interface BaseMapObstacle {
  x: number;
  y: number;
  halfX: number;
  halfY: number;
}

export interface BaseMapOptions {
  /** Pixels per map pixel; the stored image is at 2. */
  scale?: number;
  /** What the names keep clear of: the highlighted streets' names, the pins, the legend, the north arrow, the credit. */
  obstacles?: readonly BaseMapObstacle[];
  /** Streets whose name the croquis already prints in its own band (the highlighted ones): no second name under it. */
  namedElsewhere?: ReadonlySet<string>;
}

const NAME_FONT = 10.5;
const NAME_CHAR_WIDTH = 5.9;
const NAME_COLOR = "#3b3b3b";
/** Where along the visible run a name is tried, the middle first. */
const NAME_SPOTS = [0.5, 0.35, 0.65, 0.2, 0.8];

function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const overlaps = (a: BaseMapObstacle, b: BaseMapObstacle) => Math.abs(a.x - b.x) < a.halfX + b.halfX && Math.abs(a.y - b.y) < a.halfY + b.halfY;

interface RunPoint {
  x: number;
  y: number;
  /** Distance along the run, in map pixels. */
  along: number;
}

/**
 * The stretches of one street's pieces that fall inside the image, in map
 * pixels, longest first. Each segment is walked every few pixels: a long
 * straight avenue has both ends outside a micro frame and still crosses it.
 */
function visibleRuns(pieces: readonly BaseMapWay[], center: LatLon, zoom: number): RunPoint[][] {
  const runs: RunPoint[][] = [];
  const inside = (x: number, y: number) => x >= 4 && x <= STATIC_MAP_SIZE.width - 4 && y >= 4 && y <= STATIC_MAP_SIZE.height - 4;
  for (const piece of pieces) {
    let run: RunPoint[] = [];
    const close = () => {
      if (run.length > 1) runs.push(run);
      run = [];
    };
    const pixels = piece.g.map((point) => imagePixel(center, zoom, point));
    for (let i = 0; i + 1 < pixels.length; i += 1) {
      const from = pixels[i];
      const to = pixels[i + 1];
      const steps = Math.max(1, Math.min(2000, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 6)));
      for (let k = 0; k <= steps; k += 1) {
        if (k === 0 && i > 0) continue;
        const x = from.x + ((to.x - from.x) * k) / steps;
        const y = from.y + ((to.y - from.y) * k) / steps;
        if (!inside(x, y)) {
          close();
          continue;
        }
        const last = run[run.length - 1];
        run.push({ x, y, along: last ? last.along + Math.hypot(x - last.x, y - last.y) : 0 });
      }
    }
    close();
  }
  return runs.sort((a, b) => b[b.length - 1].along - a[a.length - 1].along);
}

/** The point and the direction of the run at a distance along it (degrees clockwise on the image, never upside down). */
function alongRun(run: readonly RunPoint[], distance: number) {
  const found = run.findIndex((entry) => entry.along >= distance);
  const index = found < 1 ? (found === 0 ? 1 : run.length - 1) : found;
  const from = run[index - 1];
  const to = run[index];
  const span = to.along - from.along || 1;
  const t = Math.min(1, Math.max(0, (distance - from.along) / span));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, angle: uprightAngle((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI) };
}

/** How far the run bends over a stretch: a name only goes where the street is nearly straight. */
function bend(run: readonly RunPoint[], from: number, to: number) {
  const a = alongRun(run, from).angle;
  const b = alongRun(run, to).angle;
  const middle = alongRun(run, (from + to) / 2).angle;
  const diff = (p: number, q: number) => Math.min(Math.abs(p - q), 180 - Math.abs(p - q));
  return Math.max(diff(a, b), diff(a, middle), diff(middle, b));
}

/**
 * One name per street, in the order of importance, on the longest stretch
 * of it the image shows, where it fits whole and nearly straight and covers
 * nothing: a name that finds no such spot is left out, as on any map.
 */
function placeNames(byName: Map<string, { kind: RoadClass; pieces: BaseMapWay[] }>, center: LatLon, zoom: number, options: BaseMapOptions) {
  const taken: BaseMapObstacle[] = [...(options.obstacles ?? [])];
  const elsewhere = new Set([...(options.namedElsewhere ?? [])].map(spellingKey));
  const placed: { name: string; x: number; y: number; angle: number }[] = [];
  const ordered = [...byName.entries()]
    .filter(([name, { kind }]) => zoom >= NAME_MIN_ZOOM[kind] && !elsewhere.has(spellingKey(name)))
    .map(([name, entry]) => ({ name, ...entry, runs: visibleRuns(entry.pieces, center, zoom) }))
    .filter((entry) => entry.runs.length)
    .sort((a, b) => ROAD_CLASSES.indexOf(a.kind) - ROAD_CLASSES.indexOf(b.kind) || b.runs[0][b.runs[0].length - 1].along - a.runs[0][a.runs[0].length - 1].along);
  for (const { name, runs } of ordered) {
    const length = name.length * NAME_CHAR_WIDTH + 6;
    const spot = runs.slice(0, 3).flatMap((run) => {
      const total = run[run.length - 1].along;
      if (total < length * 1.15) return [];
      return NAME_SPOTS.map((fraction) => {
        const middle = Math.min(Math.max(fraction * total, length / 2), total - length / 2);
        if (bend(run, middle - length / 2, middle + length / 2) > 18) return null;
        const at = alongRun(run, middle);
        const angle = uprightAngle(at.angle);
        const radians = (angle * Math.PI) / 180;
        const box: BaseMapObstacle = {
          x: at.x,
          y: at.y,
          halfX: Math.abs((length / 2) * Math.cos(radians)) + Math.abs((NAME_FONT / 2 + 1.5) * Math.sin(radians)),
          halfY: Math.abs((length / 2) * Math.sin(radians)) + Math.abs((NAME_FONT / 2 + 1.5) * Math.cos(radians)),
        };
        return taken.some((other) => overlaps(box, other)) ? null : { box, angle };
      }).filter((candidate) => candidate !== null);
    })[0];
    if (!spot) continue;
    taken.push(spot.box);
    placed.push({ name, x: spot.box.x, y: spot.box.y, angle: spot.angle });
  }
  return placed;
}

/**
 * The base map of a croquis as an SVG the size of the stored image (at
 * `scale`): the land, every street of `ways` by class (the edges first,
 * then the fills, so crossings join cleanly) and the names that fit. Nothing
 * on it comes from Google or from a tile server.
 */
export function baseMapSvg(center: LatLon, zoom: number, ways: readonly BaseMapWay[], options: BaseMapOptions = {}) {
  const scale = options.scale ?? 2;
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const tolerance = metersPerPixel(zoom, center[0]) * 0.4;
  const byClass = new Map<RoadClass, { link: boolean; d: string }[]>();
  const byName = new Map<string, { kind: RoadClass; pieces: BaseMapWay[] }>();
  // One street, one name: pieces spelled with and without accents take the best-written spelling.
  const spelling = bestSpellings(ways.map((way) => way.name.trim()));
  for (const way of ways) {
    const kind = roadClass(way.highway);
    if (!kind || way.g.length < 2 || zoom < MIN_ZOOM[kind]) continue;
    const d = simplifyPolyline(way.g, tolerance)
      .map((point, index) => {
        const { x, y } = imagePixel(center, zoom, point);
        return `${index ? "L" : "M"}${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)}`;
      })
      .join("");
    const list = byClass.get(kind) ?? [];
    list.push({ link: way.highway.endsWith("_link"), d });
    byClass.set(kind, list);
    const name = spelling.get(way.name.trim()) ?? way.name.trim();
    if (!name) continue;
    const entry = byName.get(name) ?? { kind, pieces: [] };
    // A street named on several classes keeps its most important one.
    if (ROAD_CLASSES.indexOf(kind) < ROAD_CLASSES.indexOf(entry.kind)) entry.kind = kind;
    entry.pieces.push(way);
    byName.set(name, entry);
  }
  // The least important at the bottom, so an avenue crosses over the streets.
  const drawOrder = [...ROAD_CLASSES].reverse().filter((kind) => byClass.has(kind));
  const group = (kind: RoadClass, link: boolean, color: string, stroke: number) => {
    const d = byClass.get(kind)!.filter((item) => item.link === link).map((item) => item.d).join("");
    return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${(stroke * scale).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  };
  const casings = drawOrder.flatMap((kind) => [true, false].map((link) => group(kind, link, ROAD_STYLES[kind].casing, roadWidth(kind, zoom, link) + (zoom >= 14 ? 1.6 : 0.9))));
  const fills = drawOrder.flatMap((kind) => [true, false].map((link) => group(kind, link, ROAD_STYLES[kind].fill, roadWidth(kind, zoom, link))));
  const names = placeNames(byName, center, zoom, options).map(
    ({ name, x, y, angle }) =>
      `<g transform="translate(${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)}) rotate(${angle.toFixed(1)})">` +
      `<text y="${(NAME_FONT * 0.35 * scale).toFixed(1)}" text-anchor="middle" font-family="${STREET_LABEL_FONT_FAMILY}" font-size="${NAME_FONT * scale}" fill="none" stroke="#ffffff" stroke-width="${(2.6 * scale).toFixed(1)}" stroke-linejoin="round" stroke-opacity="0.9">${escapeXml(name)}</text>` +
      `<text y="${(NAME_FONT * 0.35 * scale).toFixed(1)}" text-anchor="middle" font-family="${STREET_LABEL_FONT_FAMILY}" font-size="${NAME_FONT * scale}" fill="${NAME_COLOR}">${escapeXml(name)}</text>` +
      `</g>`,
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${BASE_MAP_BACKGROUND}"/>` +
    casings.join("") +
    fills.join("") +
    names.join("") +
    `</svg>`
  );
}

const CREDIT_FONT = 9.5;
const CREDIT_HEIGHT = 14;
const CREDIT_WIDTH = OSM_CROQUIS_ATTRIBUTION.length * 5.2 + 10;

/**
 * Where the credit goes, in map pixels: along the bottom edge (the legend
 * keeps that strip free, `legendBox`), on the right unless the north arrow
 * sits in that corner.
 */
export function attributionBox(northCorner: MapCorner) {
  const left = northCorner === "bottom-right";
  return { x: left ? 0 : STATIC_MAP_SIZE.width - CREDIT_WIDTH, y: STATIC_MAP_SIZE.height - CREDIT_HEIGHT, width: CREDIT_WIDTH, height: CREDIT_HEIGHT };
}

/** The credit «© colaboradores de OpenStreetMap» as an SVG the size of the image (at `scale`), on a white band in its corner. */
export function attributionSvg(northCorner: MapCorner, scale = 2) {
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const box = attributionBox(northCorner);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="${box.x * scale}" y="${box.y * scale}" width="${(box.width * scale).toFixed(1)}" height="${box.height * scale}" fill="#ffffff" fill-opacity="0.85"/>` +
    `<text x="${((box.x + box.width / 2) * scale).toFixed(1)}" y="${((box.y + box.height / 2 + CREDIT_FONT * 0.35) * scale).toFixed(1)}" text-anchor="middle" font-family="${STREET_LABEL_FONT_FAMILY}" font-size="${CREDIT_FONT * scale}" fill="#333333">${escapeXml(OSM_CROQUIS_ATTRIBUTION)}</text>` +
    `</svg>`
  );
}
