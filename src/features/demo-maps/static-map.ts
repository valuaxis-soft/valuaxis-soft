/**
 * The demonstration's croquis as a Maps Static API image, shown on screen
 * only (it is never stored, printed or attached: the croquis of a valuation
 * is drawn from OpenStreetMap, osm-base-map.ts), with the sample comparables
 * as colored markers and the highlighted streets as paths.
 */
import { CLEAN_MAP_STYLES, staticMapStyle, type MapType } from "@/features/maps/map-styles";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE } from "@/features/maps/static-map";
import type { LatLon } from "@/features/maps/types";

import { COMPARABLE_TYPES, type DemoComparable } from "./geo";
import type { HighlightedWay } from "@/features/maps/highlights";

export { STATIC_MAP_SIZE, imagePosition } from "@/features/maps/static-map";

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

/** Markers of one color and size; the Static API draws them as its own pins. */
interface StaticMapMarkers {
  /** "#1f7ac2"; the subject uses the API's "red". */
  color: string;
  size?: "tiny" | "small" | "mid";
  points: readonly LatLon[];
}

/** A line over the map (a highlighted street, etapa 2). */
interface StaticMapPath {
  color: string;
  weight: number;
  points: readonly LatLon[];
}

interface BuilderOptions {
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

function buildStaticMapUrl({ apiKey, center, zoom, subject = center, clean = false, mapType = "roadmap", markers = [], paths = [] }: BuilderOptions) {
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
  return buildStaticMapUrl({
    apiKey,
    center,
    zoom,
    subject,
    clean,
    markers: COMPARABLE_TYPES.map((type) => ({
      color: type.color,
      points: comparables.filter((c) => c.kind === type.kind).map((c) => [c.lat, c.lon] as const),
    })),
    paths: highlights.map(({ way, style }) => ({ color: style.color, weight: style.weight, points: way.g })),
  });
}
