/**
 * The frame of a croquis image: its size and where a point of the map falls
 * inside it (Web Mercator, 256 px tiles, the projection of every web map).
 * Pure functions, so they are tested without a browser. The name comes from
 * the Maps Static API image the croquis was until 25 nov 2026; the stored
 * image is drawn by us from OpenStreetMap now (osm-base-map.ts) with the same
 * size and frames, so croquis saved before keep their framing.
 */
import type { LatLon } from "./types";

/**
 * Size of the image in map pixels; it is stored at scale 2 for print. 16:9
 * since 26 nov 2026 (it was 640 × 400): the macro and the micro croquis
 * print side by side in the 16:9 frame of a pair (document-image.tsx), and a
 * 16:10 image left a white band at each side of it (video 8.5, 11:34). The
 * generator shows this same box over its map, so what it frames is the image.
 */
export const STATIC_MAP_SIZE = { width: 640, height: 360 } as const;
export const STATIC_MAP_SCALE = 2;

const project = ([lat, lon]: LatLon, world: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * world, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world] as const;
};

/** Where a point falls on the croquis image, in map pixels from its top left corner; outside the image too. */
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
 * Where a point falls inside the croquis image (Web Mercator, 256 px
 * tiles), as a fraction of its width and height; null when it is outside.
 * Used to lay street names and numbered pins over the image.
 */
export function imagePosition(center: LatLon, zoom: number, point: LatLon) {
  const { x, y } = imagePixel(center, zoom, point);
  if (x < 0 || x > STATIC_MAP_SIZE.width || y < 0 || y > STATIC_MAP_SIZE.height) return null;
  return { x: x / STATIC_MAP_SIZE.width, y: y / STATIC_MAP_SIZE.height };
}
