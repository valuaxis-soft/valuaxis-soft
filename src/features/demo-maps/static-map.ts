/**
 * Croquis for the dictamen as a Maps Static API image, and where a point of
 * the map falls inside that image. Pure functions, so they are tested without
 * a browser.
 */
import { COMPARABLE_TYPES, type DemoComparable, type LatLon } from "./geo";
import type { HighlightedWay } from "./highlights";
import { CLEAN_MAP_STYLES, staticMapStyle } from "./map-styles";

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
function staticColor(hex: string, alpha = "ff") {
  return `0x${hex.replace("#", "").toLowerCase()}${alpha}`;
}

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
/** The Static API rejects longer URLs. */
const MAX_URL_LENGTH = 16384;

/** Size of the image in map pixels; it is requested at scale 2 for print. */
export const STATIC_MAP_SIZE = { width: 640, height: 400 } as const;

export interface StaticMapOptions {
  apiKey: string;
  center: LatLon;
  zoom: number;
  /** The red pin. */
  subject?: LatLon;
  /** Without points of interest, businesses or transit. */
  clean?: boolean;
  highlights?: readonly HighlightedWay[];
  comparables?: readonly DemoComparable[];
}

export function staticMapUrl({ apiKey, center, zoom, subject = center, clean = false, highlights = [], comparables = [] }: StaticMapOptions) {
  const point = (p: LatLon) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const params: [string, string][] = [
    ["center", point(center)],
    ["zoom", String(zoom)],
    ["size", `${STATIC_MAP_SIZE.width}x${STATIC_MAP_SIZE.height}`],
    ["scale", "2"],
    ["maptype", "roadmap"],
    ["language", "es"],
    ["region", "MX"],
  ];
  if (clean) for (const rule of CLEAN_MAP_STYLES) params.push(["style", staticMapStyle(rule)]);
  for (const type of COMPARABLE_TYPES) {
    const ofType = comparables.filter((c) => c.kind === type.kind);
    if (ofType.length) {
      params.push(["markers", [`size:tiny`, `color:${staticColor(type.color, "")}`, ...ofType.map((c) => point([c.lat, c.lon]))].join("|")]);
    }
  }
  params.push(["markers", `color:red|${point(subject)}`]);
  const base = () => `${STATIC_MAP_URL}?${new URLSearchParams([...params, ["key", apiKey]]).toString()}`;
  for (const { way, style } of highlights) {
    const path = `color:${staticColor(style.color, "e6")}|weight:${style.weight}|enc:${encodePolyline(way.g)}`;
    params.push(["path", path]);
    // Too many streets: drop the rest rather than break the image.
    if (base().length > MAX_URL_LENGTH) {
      params.pop();
      break;
    }
  }
  return base();
}

/**
 * Where a point falls inside the Static API image (Web Mercator, 256 px
 * tiles), as a fraction of its width and height; null when it is outside.
 * Used to lay street names over the image.
 */
export function imagePosition(center: LatLon, zoom: number, point: LatLon) {
  const world = 256 * 2 ** zoom;
  const project = ([lat, lon]: LatLon) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * world, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world];
  };
  const [cx, cy] = project(center);
  const [px, py] = project(point);
  const x = STATIC_MAP_SIZE.width / 2 + px - cx;
  const y = STATIC_MAP_SIZE.height / 2 + py - cy;
  if (x < 0 || x > STATIC_MAP_SIZE.width || y < 0 || y > STATIC_MAP_SIZE.height) return null;
  return { x: x / STATIC_MAP_SIZE.width, y: y / STATIC_MAP_SIZE.height };
}
