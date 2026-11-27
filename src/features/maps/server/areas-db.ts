/**
 * The areas of Mexico in our own database (`devpware_areas_osm`, migration
 * 067): parks, water, land uses, buildings and waterways copied from
 * OpenStreetMap by scripts/ops/importar-areas.ts. The croquis' base map
 * paints them under its streets (osm-base-map.ts).
 */
import { prisma } from "@/infrastructure/database/prisma-client";

import { isLineKind, type AreaKind, type AreaPolygon, type BaseMapArea } from "../osm-areas";
import type { LatLon } from "../types";
import type { OsmArea } from "./osm-pbf-areas";

/** Areas one frame draws, at most; past this the smallest go first (the largest land is what gives the frame its color). */
const MAX_FRAME_AREAS = 20_000;

interface AreaRow {
  kind: string;
  area: number;
  geometry: string | null;
}

type Position = [number, number];
type GeoJson =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "GeometryCollection"; geometries: GeoJson[] }
  | { type: "Point" | "MultiPoint"; coordinates: unknown };

const toLatLon = (line: readonly Position[]) => line.map(([lon, lat]): LatLon => [lat, lon]);

/** The polygons and lines of a GeoJSON geometry, in [lat, lon]; points are dropped. */
export function geoJsonShapes(geometry: GeoJson, shapes: { polygons: AreaPolygon[]; lines: LatLon[][] } = { polygons: [], lines: [] }) {
  if (geometry.type === "Polygon") shapes.polygons.push(geometry.coordinates.map(toLatLon));
  else if (geometry.type === "MultiPolygon") for (const polygon of geometry.coordinates) shapes.polygons.push(polygon.map(toLatLon));
  else if (geometry.type === "LineString") shapes.lines.push(toLatLon(geometry.coordinates));
  else if (geometry.type === "MultiLineString") for (const line of geometry.coordinates) shapes.lines.push(toLatLon(line));
  else if (geometry.type === "GeometryCollection") for (const part of geometry.geometries) geoJsonShapes(part, shapes);
  return shapes;
}

/**
 * The areas of the given kinds crossing the box [south, west]–[north, east],
 * cut to the box and simplified on the database to what the image can show
 * (`toleranceDegrees`), without the ones smaller than `minAreaM2` (lines
 * always come). A national park's whole outline never travels for a frame of
 * one neighborhood.
 */
export async function areasInBox(bounds: readonly [LatLon, LatLon], kinds: readonly AreaKind[], toleranceDegrees: number, minAreaM2: number): Promise<BaseMapArea[]> {
  const [[south, west], [north, east]] = bounds;
  const lineKinds = kinds.filter(isLineKind);
  const rows = await prisma.$queryRaw<AreaRow[]>`
    WITH frame AS (SELECT ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326) AS box)
    SELECT a."STipoArea" AS "kind", a."NAreaM2" AS "area",
           ST_AsGeoJSON(ST_Simplify(ST_ClipByBox2D(a."GGeometria", frame.box), ${toleranceDegrees}::float8, true), 6) AS "geometry"
    FROM "devpware_areas_osm" a, frame
    WHERE a."GGeometria" && frame.box
      AND a."STipoArea" = ANY(${[...kinds]}::text[])
      AND (a."NAreaM2" >= ${minAreaM2}::float8 OR a."STipoArea" = ANY(${lineKinds}::text[]))
    ORDER BY (a."STipoArea" = 'building') ASC, a."NAreaM2" DESC, a."IdElementoOsm" ASC
    LIMIT ${MAX_FRAME_AREAS}
  `;
  return rows.flatMap((row) => {
    if (!row.geometry) return [];
    const { polygons, lines } = geoJsonShapes(JSON.parse(row.geometry) as GeoJson);
    if (!polygons.length && !lines.length) return [];
    return [{ kind: row.kind as AreaKind, polygons, lines, areaM2: Number(row.area) }];
  });
}

/** Whether the table was ever loaded: an empty answer then means "nothing here", not "no data". */
export async function hasStoredAreas() {
  const rows = await prisma.$queryRaw<{ loaded: boolean }[]>`SELECT EXISTS (SELECT 1 FROM "devpware_areas_osm") AS "loaded"`;
  return rows[0]?.loaded === true;
}

const ring = (points: readonly LatLon[]) => `(${points.map(([lat, lon]) => `${lon} ${lat}`).join(",")})`;

/** An area as WKT: a multipolygon, or a multilinestring for a waterway. */
export function areaWkt(area: Pick<OsmArea, "polygons" | "lines">) {
  if (area.lines.length) return `MULTILINESTRING(${area.lines.map(ring).join(",")})`;
  return `MULTIPOLYGON(${area.polygons.map((polygon) => `(${polygon.map(ring).join(",")})`).join(",")})`;
}

/**
 * Writes a batch of areas: new ones are inserted and known ones replaced,
 * all stamped with `loadedAt`. Polygons are made valid (an outline that
 * crosses itself in OpenStreetMap would not fill) and simplified by half a
 * meter. Returns how many rows were written.
 */
export async function saveAreas(areas: readonly OsmArea[], loadedAt: Date) {
  // A ring of fewer than four points or a line of one would make the database refuse the whole batch.
  const usable = areas.flatMap((area) => {
    const polygons = area.polygons.map((polygon) => polygon.filter((points) => points.length >= 4)).filter((polygon) => polygon.length);
    const lines = area.lines.filter((points) => points.length >= 2);
    return polygons.length || lines.length ? [{ ...area, polygons, lines }] : [];
  });
  if (!usable.length) return 0;
  const ids = usable.map((area) => area.id);
  const kinds = usable.map((area) => area.kind);
  const shapes = usable.map(areaWkt);
  const sizes = usable.map((area) => area.areaM2);
  return prisma.$executeRaw`
    INSERT INTO "devpware_areas_osm" ("IdElementoOsm", "STipoArea", "GGeometria", "NAreaM2", "DFechaCarga")
    SELECT s.id, s.kind, g.shape, s.size, ${loadedAt}
    FROM unnest(${ids}::text[], ${kinds}::text[], ${shapes}::text[], ${sizes}::float8[]) AS s(id, kind, wkt, size)
    CROSS JOIN LATERAL (
      SELECT CASE WHEN s.wkt LIKE 'MULTILINESTRING%' THEN ST_SimplifyPreserveTopology(ST_GeomFromText(s.wkt, 4326), 0.000005)
                  ELSE ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(ST_GeomFromText(s.wkt, 4326), 0.000005)), 3) END AS shape
    ) g
    WHERE NOT ST_IsEmpty(g.shape)
    ON CONFLICT ("IdElementoOsm") DO UPDATE
      SET "STipoArea" = EXCLUDED."STipoArea", "GGeometria" = EXCLUDED."GGeometria", "NAreaM2" = EXCLUDED."NAreaM2", "DFechaCarga" = EXCLUDED."DFechaCarga"
  `;
}

/** After a full import: the areas it did not write no longer exist in OpenStreetMap. Returns how many were deleted. */
export function deleteAreasLoadedBefore(loadedAt: Date) {
  return prisma.$executeRaw`DELETE FROM "devpware_areas_osm" WHERE "DFechaCarga" < ${loadedAt}`;
}

/** Rows and bytes on disk (table plus indexes), for the import's report. */
export async function storedAreasSize() {
  const rows = await prisma.$queryRaw<{ rows: bigint; bytes: bigint }[]>`
    SELECT (SELECT count(*) FROM "devpware_areas_osm") AS "rows", pg_total_relation_size('"devpware_areas_osm"') AS "bytes"
  `;
  return { rows: Number(rows[0].rows), bytes: Number(rows[0].bytes) };
}
