/**
 * Presentation settings of the maps and the croquis: the clean base map
 * (no businesses or points of interest), the north arrow and the framing of
 * each croquis. Pure values and functions, tested without a browser.
 */
import type { LatLon } from "./types";

/** A rule in the format of the Maps JavaScript API (`google.maps.MapTypeStyle`). */
export interface MapStyleRule {
  featureType: string;
  elementType?: string;
  stylers: { visibility: "on" | "off" }[];
}

/**
 * Clean map: no points of interest, business icons or transit. Roads keep
 * their names and the colonias and localities their labels.
 */
export const CLEAN_MAP_STYLES: readonly MapStyleRule[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.locality", elementType: "labels", stylers: [{ visibility: "on" }] },
];

/** The same rule as a `style` parameter of the Maps Static API: "feature:poi|element:labels|visibility:off". */
export function staticMapStyle(rule: MapStyleRule) {
  return [
    `feature:${rule.featureType}`,
    ...(rule.elementType ? [`element:${rule.elementType}`] : []),
    ...rule.stylers.map((styler) => `visibility:${styler.visibility}`),
  ].join("|");
}

/* ------------------------------------------------------------------ */
/*  North arrow                                                        */
/* ------------------------------------------------------------------ */

export type NorthArrowStyle = "flecha" | "aguja" | "punta";
export type MapCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The three symbols the client sent, drawn as inline SVG by the NorthArrow component. */
export const NORTH_ARROW_STYLES: readonly { key: NorthArrowStyle; title: string }[] = [
  { key: "flecha", title: "N con flecha" },
  { key: "aguja", title: "N con aguja en círculo" },
  { key: "punta", title: "Punta a dos tonos con N" },
];

export const MAP_CORNERS: readonly { key: MapCorner; title: string }[] = [
  { key: "top-right", title: "Arriba a la derecha" },
  { key: "top-left", title: "Arriba a la izquierda" },
  { key: "bottom-right", title: "Abajo a la derecha" },
  { key: "bottom-left", title: "Abajo a la izquierda" },
];

export interface NorthArrow {
  style: NorthArrowStyle;
  corner: MapCorner;
}

/**
 * The base of the generator's map on screen (V6.3-08): streets, the
 * satellite photo, or the photo with street names. The stored croquis is
 * always the OpenStreetMap street drawing: Google does not allow keeping its
 * images (terms 3.2.3), so the satellite photo is only a reference on
 * screen, and the options say so (video 8.7, 0:00: «Generar y reemplazar»
 * with the satellite view seemed to do nothing).
 */
export const MAP_TYPES = [
  { key: "roadmap", title: "Mapa de calles" },
  { key: "satellite", title: "Satélite (solo en pantalla)" },
  { key: "hybrid", title: "Satélite con nombres (solo en pantalla)" },
] as const;

/** What the generator says while the satellite photo is on screen: the image it stores is the street map. */
export const SATELLITE_NOTICE =
  "La vista satélite de Google solo se ve aquí, como referencia: Google no permite guardar sus imágenes, así que el croquis se genera siempre con el mapa de calles de OpenStreetMap, con tus calles resaltadas, trazos y letreros.";

/** Whether the map on screen is not the drawing the croquis is stored with. */
export const isScreenOnlyMapType = (mapType: MapType) => mapType !== "roadmap";
export type MapType = (typeof MAP_TYPES)[number]["key"];

export const DEFAULT_NORTH_ARROW: NorthArrow = { style: "flecha", corner: "top-right" };

/* ------------------------------------------------------------------ */
/*  Croquis framing                                                    */
/* ------------------------------------------------------------------ */

/** Framing of a croquis, relative to the subject so the croquis follows the pin. */
export interface CroquisFrame {
  /** Center minus subject, in degrees. */
  offset: LatLon;
  zoom: number;
}

export const MACRO_FRAME: CroquisFrame = { offset: [0, 0], zoom: 15 };
export const MICRO_FRAME: CroquisFrame = { offset: [0, 0], zoom: 17 };

/**
 * The steps a croquis is framed in: a quarter of a zoom (video 8.14, 27 nov
 * 2026: «un zoom intermedio», between 15 and 16 there was nothing). Until
 * then the frames were whole zooms, as in the Static API days; a whole zoom
 * is still a step, so every frame saved before reads the same.
 */
export const ZOOM_STEP = 0.25;

/** A zoom on the step of the frames. */
export const snapZoom = (zoom: number) => Math.round(zoom / ZOOM_STEP) * ZOOM_STEP;

/** Whether a zoom is on a step (what the requests accept). */
export const isZoomStep = (zoom: number) => Number.isFinite(zoom) && Math.abs(zoom / ZOOM_STEP - Math.round(zoom / ZOOM_STEP)) < 1e-9;

/** A zoom as the panel writes it: 15, 15.25, 15.5. */
export const formatZoom = (zoom: number) => String(Number(zoom.toFixed(2)));

/** The map's current center and zoom, as a frame around the subject, the zoom on a quarter step. */
export function frameFromView(view: { center: LatLon; zoom: number }, subject: LatLon): CroquisFrame {
  return { offset: [view.center[0] - subject[0], view.center[1] - subject[1]], zoom: snapZoom(view.zoom) };
}

export function frameCenter(frame: CroquisFrame, subject: LatLon): LatLon {
  return [subject[0] + frame.offset[0], subject[1] + frame.offset[1]];
}

/**
 * V5.7-06: two croquis that would come out the same (same zoom, centers
 * closer than a tenth of the image apart). The appraiser pressed «Tomar del
 * mapa» for both from the same view; the panel says so, it does not change it.
 */
export function sameFraming(a: CroquisFrame, b: CroquisFrame, subjectLatitude = 20) {
  if (a.zoom !== b.zoom) return false;
  // Degrees per pixel at that zoom (Web Mercator, 256 px tiles); the image is 640 px wide.
  const degreesPerPixel = 360 / (256 * 2 ** a.zoom);
  const tolerance = 64 * degreesPerPixel;
  const latitudeScale = Math.cos((subjectLatitude * Math.PI) / 180);
  return Math.abs(a.offset[0] - b.offset[0]) <= tolerance * latitudeScale && Math.abs(a.offset[1] - b.offset[1]) <= tolerance;
}
