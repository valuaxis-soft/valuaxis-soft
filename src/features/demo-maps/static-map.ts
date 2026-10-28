/**
 * Croquis for the dictamen as a Maps Static API image, and the shared styles
 * of the highlighted streets. Pure functions, so they are tested without a browser.
 */
import { COMPARABLE_TYPES, NAMED_WAYS, type DemoComparable, type LatLon, type StreetDetection, type StreetWay } from "./geo";

export type HighlightKey = "front" | "side" | "main";

export interface HighlightStyle {
  on: boolean;
  color: string;
  weight: number;
}

export type HighlightStyles = Record<HighlightKey, HighlightStyle>;

export const DEFAULT_HIGHLIGHT_STYLES: HighlightStyles = {
  front: { on: true, color: "#c0392b", weight: 8 },
  side: { on: true, color: "#e67e22", weight: 5 },
  main: { on: true, color: "#1f7ac2", weight: 6 },
};

/** Ways to paint, in drawing order (main roads under adjoining under the front street). */
export function highlightedWays(detection: StreetDetection, styles: HighlightStyles, ways: readonly StreetWay[] = NAMED_WAYS) {
  const layers: { key: HighlightKey; names: ReadonlySet<string> }[] = [
    { key: "main", names: detection.main },
    { key: "side", names: detection.side },
    { key: "front", names: new Set(detection.front ? [detection.front] : []) },
  ];
  return layers.flatMap(({ key, names }) =>
    styles[key].on ? ways.filter((way) => names.has(way.n)).map((way) => ({ way, style: styles[key] })) : [],
  );
}

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

export interface StaticMapOptions {
  apiKey: string;
  center: LatLon;
  zoom: number;
  highlights?: ReturnType<typeof highlightedWays>;
  comparables?: readonly DemoComparable[];
}

export function staticMapUrl({ apiKey, center, zoom, highlights = [], comparables = [] }: StaticMapOptions) {
  const point = (p: LatLon) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const params: [string, string][] = [
    ["center", point(center)],
    ["zoom", String(zoom)],
    ["size", "640x400"],
    ["scale", "2"],
    ["maptype", "roadmap"],
    ["language", "es"],
    ["region", "MX"],
  ];
  for (const type of COMPARABLE_TYPES) {
    const ofType = comparables.filter((c) => c.kind === type.kind);
    if (ofType.length) {
      params.push(["markers", [`size:tiny`, `color:${staticColor(type.color, "")}`, ...ofType.map((c) => point([c.lat, c.lon]))].join("|")]);
    }
  }
  params.push(["markers", `color:red|${point(center)}`]);
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
