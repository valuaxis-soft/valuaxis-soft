/**
 * A croquis as a Maps Static API image, and where a point of the map falls
 * inside that image. Pure functions, so they are tested without a browser:
 * the server fetches the URL with its key and the demonstration shows it
 * directly.
 */
import { CLEAN_MAP_STYLES, staticMapStyle, type MapType } from "./map-styles";
import type { LatLon } from "./types";

/** Google's encoded polyline format (5 decimals), which keeps the image URL short. */
export function encodePolyline(points: readonly LatLon[]) {
  let lastLat = 0;
  let lastLon = 0;
  let out = "";
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const [lat, lon] of points) {
    const ilat = Math.round(lat * 1e5);
    const ilon = Math.round(lon * 1e5);
    out += encode(ilat - lastLat) + encode(ilon - lastLon);
    lastLat = ilat;
    lastLon = ilon;
  }
  return out;
}

/** "#c0392b" → "0xc0392bff" (Static API colors carry the alpha). */
export function staticColor(hex: string, alpha = "ff") {
  return `0x${hex.replace("#", "").toLowerCase()}${alpha}`;
}

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
/** The Static API rejects longer URLs. */
const MAX_URL_LENGTH = 16384;

/** Size of the image in map pixels; it is requested at scale 2 for print. */
export const STATIC_MAP_SIZE = { width: 640, height: 400 } as const;
export const STATIC_MAP_SCALE = 2;

/** Markers of one color and size; the Static API draws them as its own pins. */
export interface StaticMapMarkers {
  /** "#1f7ac2"; the subject uses the API's "red". */
  color: string;
  size?: "tiny" | "small" | "mid";
  points: readonly LatLon[];
}

/** A line over the map (a highlighted street, etapa 2). */
export interface StaticMapPath {
  color: string;
  weight: number;
  points: readonly LatLon[];
}

export interface StaticMapOptions {
  apiKey: string;
  center: LatLon;
  zoom: number;
  /** The red pin; none when null. Defaults to the center. */
  subject?: LatLon | null;
  /** Without points of interest, businesses or transit. */
  clean?: boolean;
  /** The street map unless the appraiser chose the satellite photo. */
  mapType?: MapType;
  markers?: readonly StaticMapMarkers[];
  /** In drawing order; the ones that would make the URL too long are left out. */
  paths?: readonly StaticMapPath[];
}

export function staticMapUrl({ apiKey, center, zoom, subject = center, clean = false, mapType = "roadmap", markers = [], paths = [] }: StaticMapOptions) {
  const point = (p: LatLon) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const params: [string, string][] = [
    ["center", point(center)],
    ["zoom", String(zoom)],
    ["size", `${STATIC_MAP_SIZE.width}x${STATIC_MAP_SIZE.height}`],
    ["scale", String(STATIC_MAP_SCALE)],
    ["maptype", mapType],
    ["language", "es"],
    ["region", "MX"],
  ];
  // The styles hide points of interest on the drawn map; the photo has none to hide.
  if (clean && mapType === "roadmap") for (const rule of CLEAN_MAP_STYLES) params.push(["style", staticMapStyle(rule)]);
  for (const group of markers) {
    if (!group.points.length) continue;
    params.push(["markers", [`size:${group.size ?? "tiny"}`, `color:${staticColor(group.color, "")}`, ...group.points.map(point)].join("|")]);
  }
  if (subject) params.push(["markers", `color:red|${point(subject)}`]);
  const base = () => `${STATIC_MAP_URL}?${new URLSearchParams([...params, ["key", apiKey]]).toString()}`;
  for (const { color, weight, points } of paths) {
    params.push(["path", `color:${staticColor(color, "e6")}|weight:${weight}|enc:${encodePolyline(points)}`]);
    // Too many streets: drop the rest rather than break the image.
    if (base().length > MAX_URL_LENGTH) {
      params.pop();
      break;
    }
  }
  return base();
}

const project = ([lat, lon]: LatLon, world: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * world, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world] as const;
};

/** Where a point falls on the Static API image, in map pixels from its top left corner; outside the image too. */
export function imagePixel(center: LatLon, zoom: number, point: LatLon) {
  const world = 256 * 2 ** zoom;
  const [cx, cy] = project(center, world);
  const [px, py] = project(point, world);
  return { x: STATIC_MAP_SIZE.width / 2 + px - cx, y: STATIC_MAP_SIZE.height / 2 + py - cy };
}

/** The point of the map at a pixel of the image: the inverse of `imagePixel`. */
export function pointAtPixel(center: LatLon, zoom: number, x: number, y: number): LatLon {
  const world = 256 * 2 ** zoom;
  const [cx, cy] = project(center, world);
  const px = cx + x - STATIC_MAP_SIZE.width / 2;
  const py = cy + y - STATIC_MAP_SIZE.height / 2;
  const lon = (px / world) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / world))) * 180) / Math.PI;
  return [lat, lon];
}

/**
 * Where a point falls inside the Static API image (Web Mercator, 256 px
 * tiles), as a fraction of its width and height; null when it is outside.
 * Used to lay street names and numbered pins over the image.
 */
export function imagePosition(center: LatLon, zoom: number, point: LatLon) {
  const { x, y } = imagePixel(center, zoom, point);
  if (x < 0 || x > STATIC_MAP_SIZE.width || y < 0 || y > STATIC_MAP_SIZE.height) return null;
  return { x: x / STATIC_MAP_SIZE.width, y: y / STATIC_MAP_SIZE.height };
}
