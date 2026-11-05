/**
 * Grid clustering of the pins: at each zoom the map is cut in cells of a
 * few dozen pixels (Web Mercator, as Google Maps projects it) and the pins
 * of one cell become one cluster with their count. Pure, so the browser
 * reclusters on every zoom without a library.
 */
export interface ClusterPoint {
  lat: number;
  lon: number;
}

export interface Cluster<T extends ClusterPoint> {
  /** The mean position of its pins. */
  lat: number;
  lon: number;
  items: T[];
}

/** Cells of this many pixels; two pins closer than that on screen share a cluster. */
export const CLUSTER_CELL_PX = 56;
/** From this zoom on every pin stands alone: the appraiser is looking at a street. */
export const CLUSTER_MAX_ZOOM = 17;

const TILE = 256;

/** World pixel coordinates of a point at a zoom, as the Maps JavaScript API projects it. */
export function worldPixel(point: ClusterPoint, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((Math.max(-85.05, Math.min(85.05, point.lat)) * Math.PI) / 180);
  return {
    x: ((point.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/**
 * The pins grouped by cell at the zoom given; a cell with one pin is a
 * cluster of one. The clusters keep the order of their first pin, so the
 * map draws the same thing twice for the same input.
 */
export function clusterPoints<T extends ClusterPoint>(points: readonly T[], zoom: number, cellPx = CLUSTER_CELL_PX): Cluster<T>[] {
  if (zoom >= CLUSTER_MAX_ZOOM) return points.map((point) => ({ lat: point.lat, lon: point.lon, items: [point] }));
  const cells = new Map<string, T[]>();
  for (const point of points) {
    const { x, y } = worldPixel(point, zoom);
    const key = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point);
    else cells.set(key, [point]);
  }
  return [...cells.values()].map((items) => ({
    lat: items.reduce((sum, item) => sum + item.lat, 0) / items.length,
    lon: items.reduce((sum, item) => sum + item.lon, 0) / items.length,
    items,
  }));
}

/** Two zoom levels closer, enough to break most clusters; never past the maximum. */
export const zoomIntoCluster = (zoom: number) => Math.min(CLUSTER_MAX_ZOOM, Math.floor(zoom) + 2);
