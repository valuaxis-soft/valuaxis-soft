/**
 * "Generar croquis de localización": the croquis as an image stored with the valuation.
 * The server draws the base map from our copy of OpenStreetMap
 * (osm-base-map.ts), composes the highlighted streets of etapa 2, the free
 * lines, the street names, the numbered pins of the comparables, the north
 * arrow and the credit «© colaboradores de OpenStreetMap» over it with
 * sharp, and stores the result like any image the editor uploads.
 *
 * No Google image is part of it (25 nov 2026): Google Maps Platform does
 * not allow storing its images (terms 3.2.3 a/b), and the croquis, the
 * memoria and the PDF are stored. Google only shows the map on screen, in
 * the generator. The dictamen, its PDF and the deliverables show the stored
 * image without asking anyone for anything.
 */
import sharp from "sharp";

import type { AuthUser } from "@/features/auth/model";
import { storeEditorImage, type EditorImageDto } from "@/features/files/services/editor-image";

import {
  CROQUIS_IMAGE_IDS,
  croquisLegendPlacement,
  legendOverlaySvg,
  pinsInFrame,
  pinsOutsideFrame,
  pinsOverlaySvg,
  streetLabelBox,
  streetLabelsOverlaySvg,
  subjectPinSvg,
  type ComparablePin,
  type CroquisKind,
} from "../croquis";
import { croquisStreets, frameBounds, type CroquisPath, type CroquisStreets } from "../croquis-streets";
import { freeLinesOverlaySvg, type FreeLine } from "../free-lines";
import { hasHighlights, placedStreetLabels, type CroquisLabelPlacement, type StreetHighlights } from "../highlights";
import type { NorthArrow } from "../map-styles";
import { NORTH_ARROW_HEIGHT, NORTH_ARROW_MARGIN, northArrowBox, northArrowPlacement, northArrowSvg } from "../north-arrow-symbols";
import { attributionBox, attributionSvg, type BaseMapObstacle, type BaseMapWay } from "../osm-base-map";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE, imagePixel } from "../static-map";
import { spellingKey, withPreferredStreetNames } from "../street-names";
import type { StreetWay } from "../streets";
import { mergedStreetWays, type StreetsAroundDto, type ViewBounds } from "../streets-osm";
import type { LatLon } from "../types";
import { baseMapWays, renderBaseMapPng } from "./osm-base.service";
import { streetsNamedInBox } from "./streets-db";
import { getStreetsAround } from "./streets.service";


export interface CroquisRenderInput {
  kind: CroquisKind;
  center: LatLon;
  zoom: number;
  subject: LatLon;
  northArrow: NorthArrow;
  pins: readonly ComparablePin[];
  /** Etapa 2: what to highlight; the geometry comes from OpenStreetMap around the subject. */
  streets: StreetHighlights;
  /** V5.7-14: the street names the appraiser moved or turned in the generator. */
  labels?: readonly CroquisLabelPlacement[];
  /** «Trazo libre»: the lines drawn by hand, drawn where they were drawn on every framing. */
  lines?: readonly FreeLine[];
  /** FAL-35: the carátula's address; its street's spelling wins over OpenStreetMap's. */
  address?: string;
}

const NO_STREETS: CroquisStreets = { paths: [], labels: [], omitted: [] };

/** The pieces of these streets (by name) crossing a frame. */
type NamedInFrame = (bounds: ViewBounds, names: readonly string[]) => Promise<StreetWay[]>;

/** From our copy; a copy that cannot answer leaves the streets around the pin alone. */
async function namedStreetsInFrame(bounds: ViewBounds, names: readonly string[]) {
  try {
    return await streetsNamedInBox(bounds, [...new Set(names.map(spellingKey))]);
  } catch (error) {
    console.error(`[CROQUIS] highlighted streets of the frame from db failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

const noNamedStreets: NamedInFrame = async () => [];

/**
 * The highlighted streets as the image draws them, on every croquis and on
 * the map of comparables (V7.1-22). One with nothing highlighted asks
 * OpenStreetMap for nothing. The geometry is the streets around the pin
 * plus every piece of the highlighted streets crossing the frame (video
 * 8.7: a macro frame showed only the pieces within 1 km of the pin). The
 * names keep clear of the comparables, the legend and the names placed by
 * hand (FAL-35), the subject's street takes the address's spelling, and the
 * free lines with a name print it too.
 */
export async function resolveCroquisStreets(
  input: Pick<CroquisRenderInput, "kind" | "center" | "zoom" | "subject" | "streets" | "labels" | "pins" | "northArrow" | "address" | "lines">,
  streetsAround: (point: LatLon) => Promise<StreetsAroundDto> = getStreetsAround,
  namedInFrame: NamedInFrame = namedStreetsInFrame,
): Promise<CroquisStreets> {
  const highlighted = hasHighlights(input.streets);
  if (!highlighted && !input.lines?.some((line) => line.name?.trim())) return NO_STREETS;
  let found: readonly StreetWay[] = [];
  if (highlighted) {
    const names = [...(input.streets.front ? [input.streets.front] : []), ...input.streets.streets.map((street) => street.name)];
    const [around, inFrame] = await Promise.all([streetsAround(input.subject), namedInFrame(frameBounds(input.center, input.zoom), names)]);
    found = mergedStreetWays(around.ways, inFrame);
  }
  const { ways, highlights } = withPreferredStreetNames(found, input.streets, input.address ?? "");
  const legend = croquisLegendPlacement(input.center, input.zoom, input.pins, input.northArrow.corner, input.subject);
  const streets = croquisStreets(input.kind, input.center, input.zoom, highlights, ways, input.subject, {
    placements: input.labels,
    pins: pinsInFrame(input.center, input.zoom, input.pins).map((pin) => pin.point),
    legend: legend?.box ?? null,
    lines: input.lines,
    corner: input.northArrow.corner,
  });
  return { ...streets, labels: placedStreetLabels(streets.labels, input.labels) };
}

/** The highlighted streets as an SVG the size of the image (at `scale`), in drawing order, each with its color and width in map pixels. */
function streetPathsSvg(center: LatLon, zoom: number, paths: readonly CroquisPath[], scale: number) {
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const items = paths.map(({ color, weight, points }) => {
    const d = points
      .map((point, index) => {
        const { x, y } = imagePixel(center, zoom, point);
        return `${index ? "L" : "M"}${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)}`;
      })
      .join("");
    return `<path d="${d}" fill="none" stroke="${color.replace(/[^#0-9a-f]/gi, "")}" stroke-opacity="0.9" stroke-width="${(weight * scale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${items.join("")}</svg>`;
}

const boxObstacle = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }, margin = 3): BaseMapObstacle => ({
  x: x + width / 2,
  y: y + height / 2,
  halfX: width / 2 + margin,
  halfY: height / 2 + margin,
});

/**
 * What the base map's street names keep clear of: everything the croquis
 * draws over it (the highlighted streets' names, the pins with their
 * numbers, the legend, the north arrow and the credit).
 */
function baseMapObstacles(input: Pick<CroquisRenderInput, "center" | "zoom" | "pins" | "northArrow" | "subject">, streets: CroquisStreets): BaseMapObstacle[] {
  const { center, zoom } = input;
  const obstacles: BaseMapObstacle[] = [boxObstacle(northArrowBox(input.northArrow.corner)), boxObstacle(attributionBox(input.northArrow.corner))];
  const pin = imagePixel(center, zoom, input.subject);
  obstacles.push({ x: pin.x, y: pin.y - 19, halfX: 15, halfY: 21 });
  for (const comparable of pinsInFrame(center, zoom, input.pins)) {
    const at = imagePixel(center, zoom, comparable.point);
    obstacles.push({ x: at.x + 16, y: at.y, halfX: 30, halfY: 12 });
  }
  const legend = croquisLegendPlacement(center, zoom, input.pins, input.northArrow.corner, input.subject);
  if (legend) obstacles.push(boxObstacle(legend.box));
  for (const label of streets.labels) {
    const box = streetLabelBox(center, zoom, label);
    if (!box.inside) continue;
    const radians = (box.angle * Math.PI) / 180;
    obstacles.push({
      x: box.x,
      y: box.y,
      halfX: Math.abs((box.width / 2) * Math.cos(radians)) + Math.abs((box.height / 2) * Math.sin(radians)) + 2,
      halfY: Math.abs((box.width / 2) * Math.sin(radians)) + Math.abs((box.height / 2) * Math.cos(radians)) + 2,
    });
  }
  return obstacles;
}

/**
 * The base image with the highlighted streets, the free lines, the street
 * names, the comparables' pins and their legend, the subject's pin, the
 * credit to OpenStreetMap and the north arrow over it, as JPEG.
 */
export async function composeCroquisImage(
  base: Buffer,
  input: Pick<CroquisRenderInput, "center" | "zoom" | "northArrow" | "pins" | "lines"> & Partial<Pick<CroquisRenderInput, "subject">>,
  streets: CroquisStreets = NO_STREETS,
) {
  const image = sharp(base);
  const metadata = await image.metadata();
  const width = metadata.width ?? STATIC_MAP_SIZE.width * STATIC_MAP_SCALE;
  const height = metadata.height ?? STATIC_MAP_SIZE.height * STATIC_MAP_SCALE;
  // The overlay is drawn for the image's size in map pixels; a base of another size is scaled to fit.
  const scale = width / STATIC_MAP_SIZE.width;
  const arrowHeight = Math.round(NORTH_ARROW_HEIGHT * scale);
  const arrow = Buffer.from(northArrowSvg(input.northArrow.style, arrowHeight));
  const arrowSize = await sharp(arrow).metadata();
  const symbol = { width: arrowSize.width ?? arrowHeight, height: arrowSize.height ?? arrowHeight };
  const placement = northArrowPlacement(input.northArrow.corner, { width, height }, symbol, Math.round(NORTH_ARROW_MARGIN * scale));
  const layers: sharp.OverlayOptions[] = [];
  // The highlighted streets over the base map's own streets, under everything else.
  if (streets.paths.length) layers.push({ input: Buffer.from(streetPathsSvg(input.center, input.zoom, streets.paths, scale)), left: 0, top: 0 });
  // Under the names and the pins, as on the map.
  if (input.lines?.length) layers.push({ input: Buffer.from(freeLinesOverlaySvg(input.center, input.zoom, input.lines, scale)), left: 0, top: 0 });
  if (streets.labels.length) {
    const labels = Buffer.from(streetLabelsOverlaySvg(input.center, input.zoom, streets.labels, scale));
    layers.push({ input: labels, left: 0, top: 0 });
  }
  if (input.pins.length) {
    // V7.3-09, FAL-10: what each color means, with the numbers the image shows, in the corner that hides the fewest pins; under the pins.
    const legend = croquisLegendPlacement(input.center, input.zoom, input.pins, input.northArrow.corner, input.subject ?? input.center);
    if (legend) layers.push({ input: Buffer.from(legendOverlaySvg(legend.entries, legend.corner, scale)), left: 0, top: 0 });
    const pins = Buffer.from(pinsOverlaySvg(input.center, input.zoom, input.pins, scale, input.subject));
    layers.push({ input: pins, left: 0, top: 0 });
  }
  // The subject's pin over everything else: a comparable next door, its number or the legend never hide it.
  if (input.subject) layers.push({ input: Buffer.from(subjectPinSvg(input.center, input.zoom, input.subject, scale)), left: 0, top: 0 });
  // The credit the ODbL asks for, on every stored croquis.
  layers.push({ input: Buffer.from(attributionSvg(input.northArrow.corner, scale)), left: 0, top: 0 });
  layers.push({ input: arrow, left: Math.max(0, placement.left), top: Math.max(0, placement.top) });
  return image.composite(layers).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}

/** Where a croquis takes its streets from; the tests replace them. */
export interface CroquisSources {
  /** The streets of the base map of the frame (our copy of OpenStreetMap). */
  baseWays: (center: LatLon, zoom: number) => Promise<BaseMapWay[]>;
  /** The named streets around the subject, for the highlighted ones. */
  streetsAround: (point: LatLon) => Promise<StreetsAroundDto>;
  /** Every piece of the highlighted streets crossing the frame; none when absent. */
  namedInFrame?: NamedInFrame;
}

const DEFAULT_SOURCES: CroquisSources = {
  baseWays: (center, zoom) => baseMapWays(center, zoom),
  streetsAround: (point) => getStreetsAround(point),
  namedInFrame: namedStreetsInFrame,
};

/**
 * The croquis as JPEG, without storing it: the highlighted streets, the base
 * map drawn from OpenStreetMap with its names clear of everything that goes
 * over it, and the overlays. With the streets that did not fit and the
 * comparables the frame left out (FAL-10: the generator says which).
 */
export async function renderCroquisImage(input: CroquisRenderInput, sources: CroquisSources = DEFAULT_SOURCES) {
  const streets = await resolveCroquisStreets(input, sources.streetsAround, sources.namedInFrame ?? noNamedStreets);
  const ways = await sources.baseWays(input.center, input.zoom);
  const base = await renderBaseMapPng(input.center, input.zoom, ways, {
    scale: STATIC_MAP_SCALE,
    obstacles: baseMapObstacles(input, streets),
    namedElsewhere: new Set(streets.labels.map((label) => label.name)),
  });
  const jpeg = await composeCroquisImage(base, input, streets);
  const omittedPins = pinsOutsideFrame(input.center, input.zoom, input.pins).map((pin) => pin.label);
  return { jpeg, omittedStreets: streets.omitted, omittedPins };
}

/** How the file registry tells a croquis apart: its «uso», and since 25 nov 2026 the base it was drawn on (the regeneration skips those). */
export const CROQUIS_FILE_METADATA = { uso: "CROQUIS", base: "openstreetmap" } as const;

/** The composed image stored as an image of the editor, with its stable address. */
export async function storeCroquisImage(user: Pick<AuthUser, "id" | "organizationId">, kind: CroquisKind, jpeg: Buffer): Promise<EditorImageDto> {
  const file = new File([new Uint8Array(jpeg)], `${CROQUIS_IMAGE_IDS[kind]}.jpg`, { type: "image/jpeg" });
  return storeEditorImage(user, file, CROQUIS_FILE_METADATA.uso, { base: CROQUIS_FILE_METADATA.base });
}

/** Render and store, in that order. */
export async function renderAndStoreCroquis(user: Pick<AuthUser, "id" | "organizationId">, input: CroquisRenderInput) {
  const { jpeg, omittedStreets, omittedPins } = await renderCroquisImage(input);
  return { image: await storeCroquisImage(user, input.kind, jpeg), omittedStreets, omittedPins };
}
