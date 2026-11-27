/**
 * The named streets of Mexico in our own database (`devpware_calles_osm`,
 * migration 061): a copy of OpenStreetMap that scripts/ops/importar-calles.ts
 * loads from the Geofabrik extract. The croquis asks here first, so the
 * streets do not depend on the public Overpass mirrors.
 */
import { prisma } from "@/infrastructure/database/prisma-client";

import type { BaseMapWay } from "../osm-base-map";
import type { StreetWay } from "../streets";
import { MAX_STREET_WAYS, MAX_VIEW_STREET_WAYS, parseOverpassWays, type OverpassElement, type ViewBounds } from "../streets-osm";
import type { LatLon } from "../types";
import type { OsmStreet } from "./osm-pbf";

interface StreetRow {
  id: bigint;
  name: string;
  highway: string;
  /** GeoJSON of the line: `{"type":"LineString","coordinates":[[lon,lat],…]}`. */
  line: string;
}

/**
 * The streets within the radius, closest first, as the same pieces the
 * Overpass answer becomes (same ranks, same simplification): the rows go
 * through `parseOverpassWays` as if a mirror had answered them.
 */
export async function streetsFromDatabase(point: LatLon, radiusMeters: number): Promise<StreetWay[]> {
  const rows = await prisma.$queryRaw<StreetRow[]>`
    WITH pin AS (SELECT ST_SetSRID(ST_MakePoint(${point[1]}::float8, ${point[0]}::float8), 4326)::geography AS g)
    SELECT c."IdViaOsm" AS "id", c."SNombre" AS "name", c."STipoVia" AS "highway", ST_AsGeoJSON(c."GLinea", 7) AS "line"
    FROM "devpware_calles_osm" c, pin
    WHERE ST_DWithin(c."GLinea", pin.g, ${radiusMeters}::float8)
    ORDER BY ST_Distance(c."GLinea", pin.g) ASC, c."IdViaOsm" ASC
    LIMIT ${MAX_STREET_WAYS}
  `;
  return parseOverpassWays(rowElements(rows));
}

/** The rows as the elements of an Overpass answer, so they become the same pieces of street. */
function rowElements(rows: readonly StreetRow[]): OverpassElement[] {
  return rows.flatMap((row): OverpassElement[] => {
    if (!row.line) return [];
    const { coordinates } = JSON.parse(row.line) as { coordinates: [number, number][] };
    return [{ type: "way", id: Number(row.id), tags: { name: row.name, highway: row.highway }, geometry: coordinates.map(([lon, lat]) => ({ lat, lon })) }];
  });
}

/**
 * The named streets of these classes crossing the box of the map's view
 * (streets-osm.ts, `viewStreetHighways`), simplified on the database to what
 * the screen can show, the most important classes first when the box holds
 * more than the cap.
 */
export async function streetsInView(bounds: ViewBounds, highways: readonly string[], toleranceDegrees: number): Promise<StreetWay[]> {
  const [[south, west], [north, east]] = bounds;
  const rows = await prisma.$queryRaw<StreetRow[]>`
    SELECT c."IdViaOsm" AS "id", c."SNombre" AS "name", c."STipoVia" AS "highway",
           ST_AsGeoJSON(ST_Simplify(c."GLinea"::geometry, ${toleranceDegrees}::float8, true), 7) AS "line"
    FROM "devpware_calles_osm" c
    WHERE c."GLinea" && ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326)::geography
      AND c."STipoVia" = ANY(${[...highways]}::text[])
    ORDER BY array_position(${BASE_MAP_PRIORITY}::text[], regexp_replace(c."STipoVia", '_link$', '')) ASC NULLS LAST, c."IdViaOsm" ASC
    LIMIT ${MAX_VIEW_STREET_WAYS}
  `;
  return parseOverpassWays(rowElements(rows), MAX_VIEW_STREET_WAYS);
}

/** Pieces of the highlighted streets one frame draws, at most. */
const MAX_NAMED_WAYS = 3000;

/**
 * Every piece of these streets crossing the box of a croquis' frame, named
 * as `spellingKey` writes them (no accents, case nor punctuation), so a
 * highlighted avenue is drawn whole on a macro frame and not only its pieces
 * within 1 km of the pin (video 8.7, 0:39).
 */
export async function streetsNamedInBox(bounds: ViewBounds, spellingKeys: readonly string[]): Promise<StreetWay[]> {
  if (!spellingKeys.length) return [];
  const [[south, west], [north, east]] = bounds;
  const rows = await prisma.$queryRaw<StreetRow[]>`
    SELECT c."IdViaOsm" AS "id", c."SNombre" AS "name", c."STipoVia" AS "highway", ST_AsGeoJSON(c."GLinea", 7) AS "line"
    FROM "devpware_calles_osm" c
    WHERE c."GLinea" && ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326)::geography
      AND btrim(regexp_replace(lower(translate(c."SNombre", ${ACCENTED}, ${PLAIN})), '[^a-z0-9]+', ' ', 'g')) = ANY(${[...spellingKeys]}::text[])
    ORDER BY c."IdViaOsm" ASC
    LIMIT ${MAX_NAMED_WAYS}
  `;
  return parseOverpassWays(rowElements(rows), MAX_NAMED_WAYS);
}

/** What `spellingKey` (street-names.ts) takes the accents off, for the database to do the same. */
const ACCENTED = "ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ";
const PLAIN = "AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun";

/** Pieces of street the base map of one croquis draws, at most; past this a frame is a whole city and the farthest classes thin out first. */
const MAX_BASE_MAP_WAYS = 12_000;

/**
 * The streets of the given classes that cross the box [south, west]–[north,
 * east], simplified on the database to what the image can show
 * (`toleranceDegrees`), the most important classes first when the box holds
 * more than the cap. The base map of the croquis (osm-base-map.ts).
 */
export async function streetsInBox(bounds: readonly [LatLon, LatLon], highways: readonly string[], toleranceDegrees: number): Promise<BaseMapWay[]> {
  const [[south, west], [north, east]] = bounds;
  const rows = await prisma.$queryRaw<Omit<StreetRow, "id">[]>`
    SELECT c."SNombre" AS "name", c."STipoVia" AS "highway",
           ST_AsGeoJSON(ST_Simplify(c."GLinea"::geometry, ${toleranceDegrees}::float8, true), 6) AS "line"
    FROM "devpware_calles_osm" c
    WHERE c."GLinea" && ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326)::geography
      AND c."STipoVia" = ANY(${[...highways]}::text[])
    ORDER BY array_position(${BASE_MAP_PRIORITY}::text[], regexp_replace(c."STipoVia", '_link$', '')) ASC NULLS LAST, c."IdViaOsm" ASC
    LIMIT ${MAX_BASE_MAP_WAYS}
  `;
  return rows.flatMap((row) => {
    if (!row.line) return [];
    const { coordinates } = JSON.parse(row.line) as { coordinates: [number, number][] };
    return coordinates.length >= 2 ? [{ name: row.name, highway: row.highway, g: coordinates.map(([lon, lat]): LatLon => [lat, lon]) }] : [];
  });
}

const BASE_MAP_PRIORITY = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "pedestrian"];

/** Whether the table was ever loaded: an empty answer then means "no named streets here", not "no data". */
export async function hasStoredStreets() {
  const rows = await prisma.$queryRaw<{ loaded: boolean }[]>`SELECT EXISTS (SELECT 1 FROM "devpware_calles_osm") AS "loaded"`;
  return rows[0]?.loaded === true;
}

/**
 * Writes a batch of streets: new ways are inserted and known ones replaced,
 * all stamped with `loadedAt`, so the table is never empty in the middle of
 * an import. Returns how many rows were written.
 */
export async function saveStreets(streets: readonly OsmStreet[], loadedAt: Date) {
  if (!streets.length) return 0;
  const ids = streets.map((street) => String(street.id));
  const names = streets.map((street) => street.name.slice(0, 255));
  const kinds = streets.map((street) => street.highway.slice(0, 40));
  const lines = streets.map((street) => `LINESTRING(${street.line.map(([lon, lat]) => `${lon} ${lat}`).join(",")})`);
  return prisma.$executeRaw`
    INSERT INTO "devpware_calles_osm" ("IdViaOsm", "SNombre", "STipoVia", "GLinea", "DFechaCarga")
    SELECT s.id::bigint, s.name, s.kind, ST_GeogFromText(s.line), ${loadedAt}
    FROM unnest(${ids}::text[], ${names}::text[], ${kinds}::text[], ${lines}::text[]) AS s(id, name, kind, line)
    ON CONFLICT ("IdViaOsm") DO UPDATE
      SET "SNombre" = EXCLUDED."SNombre", "STipoVia" = EXCLUDED."STipoVia", "GLinea" = EXCLUDED."GLinea", "DFechaCarga" = EXCLUDED."DFechaCarga"
  `;
}

/** After a full import: the streets it did not write no longer exist in OpenStreetMap. Returns how many were deleted. */
export function deleteStreetsLoadedBefore(loadedAt: Date) {
  return prisma.$executeRaw`DELETE FROM "devpware_calles_osm" WHERE "DFechaCarga" < ${loadedAt}`;
}

/** Rows and bytes on disk (table plus indexes), for the import's report. */
export async function storedStreetsSize() {
  const rows = await prisma.$queryRaw<{ rows: bigint; bytes: bigint }[]>`
    SELECT (SELECT count(*) FROM "devpware_calles_osm") AS "rows", pg_total_relation_size('"devpware_calles_osm"') AS "bytes"
  `;
  return { rows: Number(rows[0].rows), bytes: Number(rows[0].bytes) };
}
