/**
 * The areas of the croquis' base map (27 nov 2026, notas de voz de Álvaro):
 * the croquis came out «de un solo tono» beige, with the streets alone on
 * the land color, while the standard OpenStreetMap map he sees in the
 * comparable's card shows the parks, the gardens, the water and the blocks
 * in their colors. These are the OpenStreetMap features that map paints
 * under its streets, with the colors of openstreetmap-carto, read from the
 * same ODbL data: our copy (`devpware_areas_osm`, migration 067) or, while
 * the copy is empty, the Overpass fallback.
 *
 * Pure functions: which tags make which kind of area, the order and the
 * colors they are drawn with, the rings of a multipolygon put together from
 * its ways, and the Overpass query and answer. Tested without a network.
 */
import { simplifyPolyline } from "./streets";
import type { LatLon } from "./types";

/** The kinds of area the base map tells apart (classes of openstreetmap-carto's landcover, water and buildings). */
export const AREA_KINDS = [
  "residential",
  "commercial",
  "retail",
  "industrial",
  "construction",
  "farmland",
  "farmyard",
  "orchard",
  "forest",
  "scrub",
  "heath",
  "grass",
  "sand",
  "bare_rock",
  "cemetery",
  "societal",
  "parking",
  "golf",
  "park",
  "garden",
  "sports",
  "playground",
  "pitch",
  "wetland",
  "water",
  "building",
  "river",
  "canal",
  "stream",
  "drain",
] as const;

export type AreaKind = (typeof AREA_KINDS)[number];

/** The kinds drawn as lines (waterways); the rest are polygons. */
const LINE_KINDS = new Set<AreaKind>(["river", "canal", "stream", "drain"]);
export const isLineKind = (kind: AreaKind) => LINE_KINDS.has(kind);

/**
 * Fill (and edge, where carto draws one) of each kind: the colors of the
 * standard OpenStreetMap map (openstreetmap-carto, landcover.mss and
 * water.mss), so the croquis reads like the map of the card.
 */
export const AREA_STYLES: Record<AreaKind, { fill: string; edge?: string }> = {
  residential: { fill: "#e0dfdf" },
  commercial: { fill: "#f2dad9", edge: "#d1b2b0" },
  retail: { fill: "#ffd6d1", edge: "#d99c95" },
  industrial: { fill: "#ebdbe8", edge: "#c6b3c3" },
  construction: { fill: "#c7c7b4" },
  farmland: { fill: "#eef0d5", edge: "#c7c9ae" },
  farmyard: { fill: "#f5dcba", edge: "#d1b48c" },
  orchard: { fill: "#aedfa3" },
  forest: { fill: "#add19e" },
  scrub: { fill: "#c8d7ab" },
  heath: { fill: "#d6d99f" },
  grass: { fill: "#cdebb0" },
  sand: { fill: "#f5e9c6" },
  bare_rock: { fill: "#eee5dc" },
  cemetery: { fill: "#aacbaf" },
  societal: { fill: "#ffffe5", edge: "#d6d6a8" },
  parking: { fill: "#eeeeee", edge: "#dddddd" },
  golf: { fill: "#def6c0" },
  park: { fill: "#c8facc" },
  garden: { fill: "#cdebb0" },
  sports: { fill: "#dffce2", edge: "#9bd5a3" },
  playground: { fill: "#dffce2", edge: "#9bd5a3" },
  pitch: { fill: "#aae0cb", edge: "#88b8a5" },
  wetland: { fill: "#d6ebe4" },
  water: { fill: "#aad3df" },
  building: { fill: "#d9d0c9", edge: "#c4b6ab" },
  river: { fill: "#aad3df" },
  canal: { fill: "#aad3df" },
  stream: { fill: "#aad3df" },
  drain: { fill: "#aad3df" },
};

/**
 * The widest zoom each kind still shows at, as on the standard map: the
 * land uses from far out, the small grounds closer, the buildings only on a
 * neighborhood frame (the micro croquis and the macro of zoom 15).
 */
export const AREA_MIN_ZOOM: Record<AreaKind, number> = {
  residential: 10,
  commercial: 10,
  retail: 10,
  industrial: 10,
  construction: 10,
  farmland: 10,
  farmyard: 10,
  orchard: 10,
  forest: 8,
  scrub: 8,
  heath: 8,
  grass: 10,
  sand: 8,
  bare_rock: 8,
  cemetery: 10,
  societal: 10,
  parking: 14,
  golf: 10,
  park: 10,
  garden: 13,
  sports: 10,
  playground: 13,
  pitch: 13,
  wetland: 8,
  water: 6,
  building: 15,
  river: 8,
  canal: 12,
  stream: 13,
  drain: 15,
};

/** Tags an area is read from; the rest of an element's tags do not matter here. */
export const AREA_TAG_KEYS = ["building", "landuse", "leisure", "natural", "amenity", "waterway", "water", "area", "type"] as const;

type Tags = Partial<Record<(typeof AREA_TAG_KEYS)[number], string>>;

const LANDUSE: Record<string, AreaKind> = {
  residential: "residential",
  commercial: "commercial",
  retail: "retail",
  industrial: "industrial",
  railway: "industrial",
  construction: "construction",
  brownfield: "construction",
  farmland: "farmland",
  farmyard: "farmyard",
  orchard: "orchard",
  vineyard: "orchard",
  forest: "forest",
  grass: "grass",
  meadow: "grass",
  recreation_ground: "grass",
  village_green: "grass",
  allotments: "grass",
  cemetery: "cemetery",
  reservoir: "water",
  basin: "water",
};

const LEISURE: Record<string, AreaKind> = {
  park: "park",
  garden: "garden",
  playground: "playground",
  pitch: "pitch",
  sports_centre: "sports",
  stadium: "sports",
  track: "pitch",
  golf_course: "golf",
  dog_park: "park",
  swimming_pool: "water",
};

const NATURAL: Record<string, AreaKind> = {
  wood: "forest",
  scrub: "scrub",
  heath: "heath",
  grassland: "grass",
  water: "water",
  wetland: "wetland",
  sand: "sand",
  beach: "sand",
  bare_rock: "bare_rock",
};

const AMENITY: Record<string, AreaKind> = {
  school: "societal",
  university: "societal",
  college: "societal",
  kindergarten: "societal",
  hospital: "societal",
  clinic: "societal",
  grave_yard: "cemetery",
  parking: "parking",
};

const WATERWAY_LINES: Record<string, AreaKind> = { river: "river", canal: "canal", stream: "stream", drain: "drain", ditch: "drain" };

/**
 * The kind of area an OpenStreetMap element is, from its tags, or null. A
 * building wins over the land it stands on, the grounds of a school over
 * the residential land, the leisure over the land use; a closed way tagged
 * as a river is the river's line, not an area (`waterway=riverbank` is).
 * `closed` says whether the way's ends meet (relations are areas by type).
 */
export function areaKind(tags: Tags, closed: boolean): AreaKind | null {
  const waterway = tags.waterway;
  if (waterway && WATERWAY_LINES[waterway]) return WATERWAY_LINES[waterway];
  if (!closed || tags.area === "no") return null;
  if (tags.building && tags.building !== "no") return "building";
  if (waterway === "riverbank" || waterway === "dock") return "water";
  return (
    (tags.amenity && AMENITY[tags.amenity]) ||
    (tags.leisure && LEISURE[tags.leisure]) ||
    (tags.natural && NATURAL[tags.natural]) ||
    (tags.landuse && LANDUSE[tags.landuse]) ||
    null
  );
}

/** Whether a relation is a multipolygon whose tags make an area (boundaries, routes and the rest are not drawn). */
export function relationAreaKind(tags: Tags): AreaKind | null {
  if (tags.type !== "multipolygon") return null;
  const kind = areaKind(tags, true);
  return kind && !isLineKind(kind) ? kind : null;
}

/** The values of each key that make some area: what the readers keep and the Overpass query asks for. */
export const AREA_TAG_VALUES = {
  landuse: Object.keys(LANDUSE),
  leisure: Object.keys(LEISURE),
  natural: Object.keys(NATURAL),
  amenity: Object.keys(AMENITY),
  waterway: [...Object.keys(WATERWAY_LINES), "riverbank", "dock"],
} as const;

/* ------------------------------------------------------------------ */
/*  Rings                                                              */
/* ------------------------------------------------------------------ */

/** A polygon as its rings, the outer one first and its holes after it, each closed (the last point repeats the first). */
export type AreaPolygon = LatLon[][];

const pointKey = ([lat, lon]: LatLon) => `${lat.toFixed(7)},${lon.toFixed(7)}`;
const sameEnd = (a: LatLon, b: LatLon) => pointKey(a) === pointKey(b);

/**
 * Closed rings from the pieces of a multipolygon's outline: each member way
 * is a closed ring by itself or a piece to join, end to end, with the ones
 * that share its ends (in either direction). Pieces that never close (a
 * member missing from the extract) are left out: an open outline would fill
 * the wrong side.
 */
export function assembleRings(pieces: readonly (readonly LatLon[])[]): LatLon[][] {
  const rings: LatLon[][] = [];
  const open: LatLon[][] = [];
  for (const piece of pieces) {
    if (piece.length < 2) continue;
    if (piece.length >= 4 && sameEnd(piece[0], piece[piece.length - 1])) rings.push([...piece]);
    else open.push([...piece]);
  }
  while (open.length) {
    let ring = open.pop()!;
    let grown = true;
    while (grown && !sameEnd(ring[0], ring[ring.length - 1])) {
      grown = false;
      const end = ring[ring.length - 1];
      for (let index = 0; index < open.length; index += 1) {
        const piece = open[index];
        if (sameEnd(piece[0], end)) ring = [...ring, ...piece.slice(1)];
        else if (sameEnd(piece[piece.length - 1], end)) ring = [...ring, ...[...piece].reverse().slice(1)];
        else continue;
        open.splice(index, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && sameEnd(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

/** Whether a point falls inside a ring (ray casting, in degrees: enough for a ring of a few kilometers). */
function insideRing(point: LatLon, ring: readonly LatLon[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > point[0] !== yj > point[0] && point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The polygons of a multipolygon: every outer ring with the inner rings
 * that fall inside it as its holes. An inner ring outside every outer one
 * is dropped. With no roles at all (Overpass sometimes leaves them empty),
 * the rings inside another ring are its holes.
 */
export function multipolygon(outer: readonly (readonly LatLon[])[], inner: readonly (readonly LatLon[])[]): AreaPolygon[] {
  const outers = assembleRings(outer);
  const polygons: AreaPolygon[] = outers.map((ring) => [ring]);
  for (const hole of assembleRings(inner)) {
    const owner = polygons.find(([ring]) => insideRing(hole[0], ring));
    if (owner) owner.push(hole);
  }
  return polygons;
}

/** Area of a polygon in square meters (outer ring minus holes), on the local plane: to order and to drop what no pixel would show. */
export function polygonAreaM2(polygon: AreaPolygon) {
  const ringArea = (ring: readonly LatLon[]) => {
    if (ring.length < 3) return 0;
    const lat0 = (ring[0][0] * Math.PI) / 180;
    const mx = 111_320 * Math.cos(lat0);
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) sum += ring[j][1] * mx * ring[i][0] * 111_320 - ring[i][1] * mx * ring[j][0] * 111_320;
    return Math.abs(sum / 2);
  };
  return polygon.reduce((total, ring, index) => total + (index ? -ringArea(ring) : ringArea(ring)), 0);
}

/* ------------------------------------------------------------------ */
/*  What the base map draws                                            */
/* ------------------------------------------------------------------ */

/** One area of the base map: polygons, or lines for a waterway; `areaM2` orders them (the largest underneath). */
export interface BaseMapArea {
  kind: AreaKind;
  polygons: AreaPolygon[];
  lines: LatLon[][];
  areaM2: number;
}

/** The kinds a frame at this zoom draws (for the query). */
export function areaKindsAtZoom(zoom: number): AreaKind[] {
  return AREA_KINDS.filter((kind) => zoom >= AREA_MIN_ZOOM[kind]);
}

/** Areas smaller than this many map pixels are not drawn (nor asked for): carto leaves them out too. */
const MIN_AREA_PIXELS = 4;

/** The smallest area worth drawing at this zoom and latitude, in square meters. */
export function minimumAreaM2(zoom: number, lat: number) {
  const meters = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return meters * meters * MIN_AREA_PIXELS;
}

/* ------------------------------------------------------------------ */
/*  Overpass                                                           */
/* ------------------------------------------------------------------ */

/** A box [[south, west], [north, east]] in degrees. */
type Bounds = readonly [LatLon, LatLon];

/** The box asked for is snapped outward to this grid, so the frames of one neighborhood share one answer. */
const AREAS_GRID_DEGREES = 0.02;

/** The box of the frame snapped outward to the grid: what the fallback asks Overpass for and caches. */
export function areasQueryBox(bounds: Bounds): Bounds {
  const down = (value: number) => Math.floor(value / AREAS_GRID_DEGREES) * AREAS_GRID_DEGREES;
  const up = (value: number) => Math.ceil(value / AREAS_GRID_DEGREES) * AREAS_GRID_DEGREES;
  const round = (value: number) => Number(value.toFixed(4));
  return [
    [round(down(bounds[0][0])), round(down(bounds[0][1]))],
    [round(up(bounds[1][0])), round(up(bounds[1][1]))],
  ];
}

/** The Overpass QL query for the areas of a box: the ways and multipolygons of the kinds above; buildings only when the zoom shows them. */
export function overpassAreasQuery(box: Bounds, withBuildings: boolean) {
  const bbox = `${box[0][0]},${box[0][1]},${box[1][0]},${box[1][1]}`;
  const clauses = Object.entries(AREA_TAG_VALUES).flatMap(([key, values]) => {
    const filter = `["${key}"~"^(${values.join("|")})$"]`;
    return [`way${filter}(${bbox});`, `relation["type"="multipolygon"]${filter}(${bbox});`];
  });
  if (withBuildings) clauses.push(`way["building"](${bbox});`, `relation["type"="multipolygon"]["building"](${bbox});`);
  return `[out:json][timeout:25];(${clauses.join("")});out geom;`;
}

export interface OverpassAreaElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role?: string; geometry?: { lat: number; lon: number }[] }[];
}

const toPoints = (geometry: readonly { lat: number; lon: number }[] | undefined) =>
  (geometry ?? []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon)).map((p): LatLon => [p.lat, p.lon]);

/** Vertices closer than this to the outline are noise at any croquis zoom. */
const SOURCE_TOLERANCE_METERS = 0.5;

const simplifyRing = (ring: readonly LatLon[]) => {
  const simple = simplifyPolyline(ring, SOURCE_TOLERANCE_METERS);
  return simple.length >= 4 ? simple : [...ring];
};

/** An Overpass answer as the areas of the base map; elements of no kind, open outlines and empty geometry are left out. */
export function parseOverpassAreas(elements: readonly OverpassAreaElement[]): BaseMapArea[] {
  const areas: BaseMapArea[] = [];
  for (const element of elements) {
    const tags = (element.tags ?? {}) as Tags;
    if (element.type === "way") {
      const points = toPoints(element.geometry);
      if (points.length < 2) continue;
      const closed = points.length >= 4 && sameEnd(points[0], points[points.length - 1]);
      const kind = areaKind(tags, closed);
      if (!kind) continue;
      if (isLineKind(kind)) areas.push({ kind, polygons: [], lines: [simplifyPolyline(points, SOURCE_TOLERANCE_METERS)], areaM2: 0 });
      else {
        const polygon = [simplifyRing(points)];
        areas.push({ kind, polygons: [polygon], lines: [], areaM2: polygonAreaM2(polygon) });
      }
    } else if (element.type === "relation") {
      const kind = relationAreaKind(tags);
      if (!kind || !element.members) continue;
      const ways = element.members.filter((member) => member.type === "way");
      const outer = ways.filter((member) => member.role !== "inner").map((member) => toPoints(member.geometry));
      const inner = ways.filter((member) => member.role === "inner").map((member) => toPoints(member.geometry));
      const polygons = multipolygon(outer, inner).map((polygon) => polygon.map(simplifyRing));
      if (!polygons.length) continue;
      areas.push({ kind, polygons, lines: [], areaM2: polygons.reduce((total, polygon) => total + polygonAreaM2(polygon), 0) });
    }
  }
  return areas;
}
