/**
 * The croquis of a valuation (etapa 1 of the maps quote): what the appraiser
 * sets (the frames of the macro and micro croquis and of the map of
 * comparables, the clean map, the north arrow, whether the comparables show,
 * the highlighted streets of etapa 2), the numbered pins of the comparables
 * and the overlays the server composes over the Maps Static API image. Pure values and functions, tested without
 * a browser; the settings persist with the subject property
 * (subject-location.ts).
 */
import { z } from "zod";

import { COMPARABLE_TYPES, type ComparableType } from "@/features/valuations/calculation/market-types";

import { DEFAULT_STREET_HIGHLIGHTS, streetHighlightsSchema, type StreetLabel } from "./highlights";
import { DEFAULT_NORTH_ARROW, MACRO_FRAME, MAP_CORNERS, MAP_TYPES, MICRO_FRAME, NORTH_ARROW_STYLES, type CroquisFrame, type MapType, type NorthArrow } from "./map-styles";
import { STATIC_MAP_SIZE, imagePixel, imagePosition } from "./static-map";
import type { LatLon } from "./types";

/* ------------------------------------------------------------------ */
/*  Captures                                                           */
/* ------------------------------------------------------------------ */

/** The three images the maps produce, each with its own frame. */
export type CroquisKind = "macro" | "micro" | "comparables";

export const CROQUIS_KINDS: readonly { kind: CroquisKind; title: string; caption: string }[] = [
  { kind: "macro", title: "Macrolocalización", caption: "Croquis de macrolocalización" },
  { kind: "micro", title: "Microlocalización", caption: "Croquis de microlocalización" },
  { kind: "comparables", title: "Mapa de comparables", caption: "Mapa de comparables" },
];

export function croquisKind(kind: CroquisKind) {
  return CROQUIS_KINDS.find((item) => item.kind === kind)!;
}

/**
 * The fixed ids the croquis had until 13 nov 2026, one macro, one micro and
 * one map of comparables per valuation. A croquis is now known by its marker
 * (croquis-marker.ts) and has an id of its own; an image read with one of
 * these ids becomes a croquis of that kind.
 */
export const CROQUIS_IMAGE_IDS: Record<CroquisKind, string> = {
  macro: "croquis-macrolocalizacion",
  micro: "croquis-microlocalizacion",
  comparables: "croquis-mapa-comparables",
};

/** The frame of the map of comparables: a macro view, so the comparables around the subject fit. */
export const COMPARABLES_FRAME: CroquisFrame = { offset: [0, 0], zoom: 15 };

const frameSchema = z.object({
  offset: z.tuple([z.number().finite(), z.number().finite()]).readonly(),
  zoom: z.number().int().min(1).max(21),
});

export const northArrowSchema = z.object({
  style: z.enum(NORTH_ARROW_STYLES.map((item) => item.key) as [NorthArrow["style"], ...NorthArrow["style"][]]),
  corner: z.enum(MAP_CORNERS.map((item) => item.key) as [NorthArrow["corner"], ...NorthArrow["corner"][]]),
});

const mapTypeSchema = z.enum(MAP_TYPES.map((item) => item.key) as [MapType, ...MapType[]]);

export const croquisSettingsSchema = z.object({
  macro: frameSchema,
  micro: frameSchema,
  comparables: frameSchema,
  /** Without points of interest, businesses or transit. */
  clean: z.boolean(),
  northArrow: northArrowSchema,
  /** The comparables with coordinates, numbered, on the croquis and on the interactive map. */
  includeComparables: z.boolean(),
  /** Etapa 2: the front street, the painted streets, their palette and whether the names show. */
  streets: streetHighlightsSchema,
  /** Settings stored before 12 nov 2026 have none: the street map. */
  mapType: mapTypeSchema.default("roadmap"),
});

export type CroquisSettings = z.infer<typeof croquisSettingsSchema>;

export const DEFAULT_CROQUIS_SETTINGS: CroquisSettings = {
  macro: MACRO_FRAME,
  micro: MICRO_FRAME,
  comparables: COMPARABLES_FRAME,
  clean: true,
  northArrow: DEFAULT_NORTH_ARROW,
  includeComparables: false,
  streets: DEFAULT_STREET_HIGHLIGHTS,
  mapType: "roadmap",
};

/** Settings as stored, completed with the defaults; invalid or missing pieces take the default. */
export function readCroquisSettings(value: unknown): CroquisSettings {
  const parsed = croquisSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const pick = <T>(schema: z.ZodType<T>, key: keyof CroquisSettings, fallback: T): T => {
    const result = schema.safeParse(record[key]);
    return result.success ? result.data : fallback;
  };
  return {
    macro: pick(frameSchema, "macro", DEFAULT_CROQUIS_SETTINGS.macro),
    micro: pick(frameSchema, "micro", DEFAULT_CROQUIS_SETTINGS.micro),
    comparables: pick(frameSchema, "comparables", DEFAULT_CROQUIS_SETTINGS.comparables),
    clean: pick(z.boolean(), "clean", DEFAULT_CROQUIS_SETTINGS.clean),
    northArrow: pick(northArrowSchema, "northArrow", DEFAULT_CROQUIS_SETTINGS.northArrow),
    includeComparables: pick(z.boolean(), "includeComparables", DEFAULT_CROQUIS_SETTINGS.includeComparables),
    streets: pick(streetHighlightsSchema, "streets", DEFAULT_CROQUIS_SETTINGS.streets),
    mapType: pick(mapTypeSchema, "mapType", DEFAULT_CROQUIS_SETTINGS.mapType),
  };
}

/* ------------------------------------------------------------------ */
/*  Pins                                                               */
/* ------------------------------------------------------------------ */

export const SUBJECT_PIN_COLOR = "#c0392b";

/** One color per comparable type, the ones of the demonstration. */
export const COMPARABLE_PIN_COLORS: Record<ComparableType, string> = {
  INMUEBLE_VENTA: "#1f7ac2",
  TERRENO_VENTA: "#2f8a4f",
  INMUEBLE_RENTA: "#8e44ad",
  TERRENO_RENTA: "#b06d10",
};

/** A comparable of the valuation on the map: its number in its market ("C-1") at its coordinates. */
export interface ComparablePin {
  id: string;
  /** "C-1": the comparable's reference in its market. */
  label: string;
  type: ComparableType;
  point: LatLon;
  /** The line the dictamen prints for it. */
  location: string;
}

export interface ComparableForPin {
  comparable: { id: string; reference: number; latitude?: number | null; longitude?: number | null; location: string };
  type: ComparableType;
}

/** The comparables with coordinates, in the order of the markets and of their numbers. Those without coordinates are left out. */
export function comparablePins(rows: readonly ComparableForPin[]): ComparablePin[] {
  return [...rows]
    .filter(({ comparable }) => isLatitude(comparable.latitude) && isLongitude(comparable.longitude))
    .sort((a, b) => COMPARABLE_TYPES.indexOf(a.type) - COMPARABLE_TYPES.indexOf(b.type) || a.comparable.reference - b.comparable.reference)
    .map(({ comparable, type }) => ({
      id: comparable.id,
      label: `C-${comparable.reference}`,
      type,
      point: [comparable.latitude as number, comparable.longitude as number],
      location: comparable.location,
    }));
}

/** The pins the croquis of this kind carries: the comparables only when they are included. */
export function pinsForCroquis(kind: CroquisKind, settings: Pick<CroquisSettings, "includeComparables">, pins: readonly ComparablePin[]) {
  return kind === "comparables" || settings.includeComparables ? pins : [];
}

const isLatitude = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 90;
const isLongitude = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 180;

export const latLonSchema = z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)]).readonly();

/* ------------------------------------------------------------------ */
/*  Overlay of the croquis image                                       */
/* ------------------------------------------------------------------ */

/** Radius of a numbered pin on the image, in map pixels (the image is at scale 2). */
const PIN_RADIUS = 9;

function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * The numbered pins of the comparables as an SVG the size of the image (at
 * `scale`), each where its point falls; the ones outside the frame are left
 * out. The Static API's own markers only take one character as a label, so
 * "C-12" is drawn here.
 */
export function pinsOverlaySvg(center: LatLon, zoom: number, pins: readonly ComparablePin[], scale = 2) {
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const r = PIN_RADIUS * scale;
  const items = pins.flatMap((pin) => {
    const at = imagePosition(center, zoom, pin.point);
    if (!at) return [];
    const x = (at.x * width).toFixed(1);
    const y = (at.y * height).toFixed(1);
    const color = COMPARABLE_PIN_COLORS[pin.type];
    return [
      `<g>` +
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${1.5 * scale}"/>` +
        `<rect x="${(Number(x) + r * 0.6).toFixed(1)}" y="${(Number(y) - r * 0.85).toFixed(1)}" width="${(pin.label.length * 7 + 8) * scale}" height="${r * 1.7}" rx="${2 * scale}" fill="rgba(255,255,255,0.92)" stroke="${color}" stroke-width="${scale}"/>` +
        `<text x="${(Number(x) + r * 0.6 + 4 * scale).toFixed(1)}" y="${(Number(y) + r * 0.4).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${11 * scale}" fill="#12212f">${escapeXml(pin.label)}</text>` +
        `</g>`,
    ];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${items.join("")}</svg>`;
}

/** Height of a street name on the image, in map pixels; its width follows the text. */
const LABEL_HEIGHT = 20;
const LABEL_FONT = 13;
/** Average width of a character of the label's bold font, in map pixels. */
const LABEL_CHAR_WIDTH = 7.8;
/** The font of the names: the document's, then the ones a server without it has. */
export const STREET_LABEL_FONT_FAMILY = "'Open Sans', 'DejaVu Sans', Arial, Helvetica, sans-serif";

/**
 * Where a street name sits on the image, in map pixels: centered on its
 * point, along its street (`angle`), kept whole inside the image. The
 * generator's «Letreros» and the server's image use the same box, so what
 * the appraiser arranges is what prints.
 */
export function streetLabelBox(center: LatLon, zoom: number, label: Pick<StreetLabel, "name" | "point" | "angle">) {
  const at = imagePixel(center, zoom, label.point);
  const width = label.name.length * LABEL_CHAR_WIDTH + 14;
  const height = LABEL_HEIGHT;
  const radians = (label.angle * Math.PI) / 180;
  const halfX = Math.abs((width / 2) * Math.cos(radians)) + Math.abs((height / 2) * Math.sin(radians));
  const halfY = Math.abs((width / 2) * Math.sin(radians)) + Math.abs((height / 2) * Math.cos(radians));
  const inside = at.x >= 0 && at.x <= STATIC_MAP_SIZE.width && at.y >= 0 && at.y <= STATIC_MAP_SIZE.height;
  const clamp = (value: number, half: number, max: number) => Math.min(Math.max(value, Math.min(half + 2, max / 2)), Math.max(max - half - 2, max / 2));
  return {
    inside,
    x: clamp(at.x, halfX, STATIC_MAP_SIZE.width),
    y: clamp(at.y, halfY, STATIC_MAP_SIZE.height),
    width,
    height,
    angle: label.angle,
    fontSize: LABEL_FONT,
  };
}

/**
 * The street names as an SVG the size of the image (V5.7-14): each name on
 * its street and turned along it (or where and how the appraiser placed it),
 * in bold dark letters on a white rounded band edged with the color of its
 * category, readable over the map or the satellite photo. Names whose point
 * falls outside the frame are left out.
 */
export function streetLabelsOverlaySvg(center: LatLon, zoom: number, labels: readonly StreetLabel[], scale = 2) {
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const items = labels.flatMap((label) => {
    const box = streetLabelBox(center, zoom, label);
    if (!box.inside) return [];
    const w = box.width * scale;
    const h = box.height * scale;
    return [
      `<g transform="translate(${(box.x * scale).toFixed(1)} ${(box.y * scale).toFixed(1)}) rotate(${box.angle.toFixed(1)})">` +
        `<rect x="${(-w / 2).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="#ffffff" fill-opacity="0.93" stroke="${escapeXml(label.color)}" stroke-width="${(1.4 * scale).toFixed(1)}"/>` +
        `<text x="0" y="${(box.fontSize * 0.36 * scale).toFixed(1)}" text-anchor="middle" font-family="${STREET_LABEL_FONT_FAMILY}" font-weight="700" font-size="${box.fontSize * scale}" letter-spacing="${(0.2 * scale).toFixed(1)}" fill="#1b2733">${escapeXml(label.name)}</text>` +
        `</g>`,
    ];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${items.join("")}</svg>`;
}

/** The pins that would show on an image framed this way (for the legend and the tests). */
export function pinsInFrame(center: LatLon, zoom: number, pins: readonly ComparablePin[]) {
  return pins.filter((pin) => imagePosition(center, zoom, pin.point) !== null);
}
