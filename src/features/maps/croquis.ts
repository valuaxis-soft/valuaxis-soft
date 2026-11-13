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
import { STATIC_MAP_SIZE, imagePosition } from "./static-map";
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

/** Ids of the images in the document, stable so a new capture replaces the previous one (croquis-document.ts). */
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

/** Height of a street name chip on the image, in map pixels; its width follows the text. */
const LABEL_HEIGHT = 16;
const LABEL_FONT = 11;
/** Average width of a character of the label's font, in map pixels. */
const LABEL_CHAR_WIDTH = 6.2;

/**
 * The street names as an SVG the size of the image: a white chip with the
 * name, centered above its point and with the color of its category on the
 * left edge, like the chips of the interactive map. Names whose point falls
 * outside the frame are left out.
 */
export function streetLabelsOverlaySvg(center: LatLon, zoom: number, labels: readonly StreetLabel[], scale = 2) {
  const width = STATIC_MAP_SIZE.width * scale;
  const height = STATIC_MAP_SIZE.height * scale;
  const items = labels.flatMap((label) => {
    const at = imagePosition(center, zoom, label.point);
    if (!at) return [];
    const chipWidth = (label.name.length * LABEL_CHAR_WIDTH + 10) * scale;
    const chipHeight = LABEL_HEIGHT * scale;
    // Centered over the point, 6 px above it, and kept inside the image.
    const x = Math.min(Math.max(at.x * width - chipWidth / 2, 2 * scale), width - chipWidth - 2 * scale);
    const y = Math.max(at.y * height - chipHeight - 6 * scale, 2 * scale);
    return [
      `<g>` +
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${chipWidth.toFixed(1)}" height="${chipHeight}" rx="${2 * scale}" fill="rgba(255,255,255,0.95)" stroke="rgba(0,0,0,0.18)" stroke-width="${scale}"/>` +
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${3 * scale}" height="${chipHeight}" fill="${escapeXml(label.color)}"/>` +
        `<text x="${(x + 6 * scale).toFixed(1)}" y="${(y + chipHeight * 0.72).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="${LABEL_FONT * scale}" fill="#12212f">${escapeXml(label.name)}</text>` +
        `</g>`,
    ];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${items.join("")}</svg>`;
}

/** The pins that would show on an image framed this way (for the legend and the tests). */
export function pinsInFrame(center: LatLon, zoom: number, pins: readonly ComparablePin[]) {
  return pins.filter((pin) => imagePosition(center, zoom, pin.point) !== null);
}
