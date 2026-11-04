/**
 * The demonstration's croquis as a Maps Static API image: the shared builder
 * (src/features/maps/static-map.ts) with the sample comparables as colored
 * markers and the highlighted streets as paths.
 */
import { staticMapUrl as buildStaticMapUrl } from "@/features/maps/static-map";
import type { LatLon } from "@/features/maps/types";

import { COMPARABLE_TYPES, type DemoComparable } from "./geo";
import type { HighlightedWay } from "./highlights";

export { STATIC_MAP_SIZE, encodePolyline, imagePosition } from "@/features/maps/static-map";

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
