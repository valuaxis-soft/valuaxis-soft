/**
 * The named streets of Mexico in our own database (`devpware_calles_osm`,
 * migration 061): a copy of OpenStreetMap that scripts/ops/importar-calles.ts
 * loads from the Geofabrik extract. The croquis asks here first, so the
 * streets do not depend on the public Overpass mirrors.
 */
import { prisma } from "@/infrastructure/database/prisma-client";

import type { StreetWay } from "../streets";
import { MAX_STREET_WAYS, parseOverpassWays, type OverpassElement } from "../streets-osm";
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
  const elements = rows.map((row): OverpassElement => {
    const { coordinates } = JSON.parse(row.line) as { coordinates: [number, number][] };
    return { type: "way", id: Number(row.id), tags: { name: row.name, highway: row.highway }, geometry: coordinates.map(([lon, lat]) => ({ lat, lon })) };
  });
  return parseOverpassWays(elements);
}

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
