/**
 * Where a comparable of the firm's base is, the same in every place that
 * shows it (V8.13, 07:16 to 11:15): the search map of a market, «Ver ficha»,
 * its card and the map of /comparables.
 *
 * - A pin is a fact of the property, not of one capture: placed and saved in
 *   one valuation (or in the base), every capture of its number in the firm
 *   takes it, also the one a search offers from another valuation. Only the
 *   coordinates are written in place; nothing of a calculation or a dictamen
 *   reads them (comparable-base-write.service).
 * - Without a pin, but with an address, the comparable has an approximate
 *   location: what the geocoder answers for its address, kept beside the
 *   coordinates (JUbicacionSnapshot.approximate, no migration) so it is looked
 *   up once, and drawn apart from a pin («ubicación aproximada»).
 *
 * Every read and write stays within the organization.
 */
import { Prisma } from "@prisma/client";

import type { GeocodingResult } from "@/features/maps/server/geocoding.service";
import { prisma } from "@/infrastructure/database/prisma-client";
import { asRecord, inFirmBase, type Tx } from "../calculation/access";
import { addressFromRecord } from "../calculation/comparable-card";
import { bestGeocodingResult, geocodingQueryOf } from "../calculation/comparable-geocoding";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";

export type LatLng = { latitude: number; longitude: number };

/** What JUbicacionSnapshot keeps of the approximate location: the text asked and, when found, the point and the address the geocoder gave. */
export type ApproximateLocation = { query: string; latitude: number | null; longitude: number | null; address: string | null };

/** Where the card puts the comparable: its pin, or roughly where its address falls. */
export type ComparableLocationDto = LatLng & { approximate: boolean; address: string | null };

const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The pin kept in a JUbicacionSnapshot, when both coordinates are numbers within range. */
export function pinOf(snapshot: unknown): LatLng | null {
  const record = asRecord(snapshot as Prisma.JsonValue);
  const latitude = finite(record.latitude);
  const longitude = finite(record.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** The approximate location kept in a JUbicacionSnapshot (found or not), or null when never looked up. */
export function approximateOf(snapshot: unknown): ApproximateLocation | null {
  const stored = asRecord(asRecord(snapshot as Prisma.JsonValue).approximate as Prisma.JsonValue);
  if (typeof stored.query !== "string" || !stored.query) return null;
  const latitude = finite(stored.latitude);
  const longitude = finite(stored.longitude);
  const found = latitude !== null && longitude !== null;
  return { query: stored.query, latitude: found ? latitude : null, longitude: found ? longitude : null, address: typeof stored.address === "string" ? stored.address : null };
}

/** The text the geocoder is asked for a comparable, from its address snapshot (comparable-geocoding). */
export function approximateQueryOf(addressSnapshot: unknown) {
  const record = asRecord(addressSnapshot as Prisma.JsonValue);
  return geocodingQueryOf(addressFromRecord(record), typeof record.location === "string" ? record.location : "");
}

/**
 * The location the card shows: the pin, else the approximate point when it
 * was found for the address the comparable has today, else null.
 */
export function locationOf(coordinates: unknown, addressSnapshot: unknown): ComparableLocationDto | null {
  const pin = pinOf(coordinates);
  if (pin) return { ...pin, approximate: false, address: null };
  const approximate = approximateOf(coordinates);
  if (!approximate || approximate.latitude === null || approximate.longitude === null || approximate.query !== approximateQueryOf(addressSnapshot)) return null;
  return { latitude: approximate.latitude, longitude: approximate.longitude, approximate: true, address: approximate.address };
}

/**
 * The approximate location a comparable keeps when it is saved again: the one
 * it had, while its address asks the geocoder the same; a pin replaces it.
 */
export function keptApproximate(storedCoordinates: unknown, pin: { latitude: number | null; longitude: number | null }, addressSnapshot: unknown) {
  if (pin.latitude !== null && pin.longitude !== null) return {};
  const approximate = approximateOf(storedCoordinates);
  return approximate && approximate.query === approximateQueryOf(addressSnapshot) ? { approximate } : {};
}

/** Every capture of the firm with that number: of its alive valuations (set aside too) and of its base without a valuation. */
const sameNumber = (organizationId: number, folio: number) => Prisma.sql`
  c."IdPropiedad" IN (SELECT p."IdPropiedad" FROM "devpware_propiedades" p WHERE p."IdOrganizacion" = ${organizationId} AND p."IFolioComparable" = ${folio})
  AND (
    (c."IdAvaluo" IS NULL AND c."IdOrganizacion" = ${organizationId})
    OR EXISTS (SELECT 1 FROM "devpware_avaluos" a WHERE a."IdAvaluo" = c."IdAvaluo" AND a."IdOrganizacion" = ${organizationId}
      AND a."BActivo" AND a."DFechaEliminacion" IS NULL)
  )`;

/**
 * A pin placed and saved (V8.13, 10:15: «yo ya establecí una coordenada y le
 * puse guardar, y no me aparece»): every other capture of the comparable's
 * number in the firm takes it, so the search of another valuation, its card
 * and the maps show it at once.
 */
export async function shareComparablePin(tx: Tx, organizationId: number, folio: number | null, pin: LatLng, exceptId: bigint) {
  if (folio === null) return 0;
  return tx.$executeRaw(Prisma.sql`
    UPDATE "devpware_comparables_avaluos" c
    SET "JUbicacionSnapshot" = jsonb_build_object('latitude', ${pin.latitude}::float8, 'longitude', ${pin.longitude}::float8),
      "DFechaModificacion" = now()
    WHERE ${sameNumber(organizationId, folio)} AND c."IdComparableAvaluo" <> ${exceptId}
      AND c."JUbicacionSnapshot" IS DISTINCT FROM jsonb_build_object('latitude', ${pin.latitude}::float8, 'longitude', ${pin.longitude}::float8)`);
}

/** The newest pin of any capture of that number in the firm, or null. */
export async function pinOfNumber(client: Tx | typeof prisma, organizationId: number, folio: number): Promise<LatLng | null> {
  const rows = await client.$queryRaw<Array<{ coordinates: Prisma.JsonValue }>>(Prisma.sql`
    SELECT c."JUbicacionSnapshot" AS "coordinates" FROM "devpware_comparables_avaluos" c
    WHERE ${sameNumber(organizationId, folio)}
      AND jsonb_typeof(c."JUbicacionSnapshot"->'latitude') = 'number' AND jsonb_typeof(c."JUbicacionSnapshot"->'longitude') = 'number'
    ORDER BY c."DFechaModificacion" DESC, c."IdComparableAvaluo" DESC
    LIMIT 1`);
  return rows.length ? pinOf(rows[0].coordinates) : null;
}

export type Geocoder = (query: string) => Promise<GeocodingResult[]>;

/** A capture to locate: its row, its number and its snapshots. */
export type UnlocatedCapture = { id: bigint; folio: number | null; address: Prisma.JsonValue; coordinates: Prisma.JsonValue };

/** Comparables looked up at most per call: the map asks again for the rest. */
export const LOCATE_BATCH = 20;

/**
 * Gives a location to captures without a pin: the pin another capture of its
 * number has (no geocoding), else the approximate location of its address,
 * looked up once per address (`allow` is the rate limit of each lookup). A
 * failed lookup is kept too, so the same address is not asked again; maps not
 * configured end the lookups quietly.
 */
export async function locateCaptures(
  organizationId: number,
  captures: readonly UnlocatedCapture[],
  options: { geocoder: Geocoder; allow?: () => boolean },
): Promise<{ pinned: number; approximated: number }> {
  let pinned = 0;
  let approximated = 0;
  let geocoding = true;
  const answers = new Map<string, ApproximateLocation>();
  for (const capture of captures.slice(0, LOCATE_BATCH)) {
    if (pinOf(capture.coordinates)) continue;
    const shared = capture.folio === null ? null : await pinOfNumber(prisma, organizationId, capture.folio);
    if (shared) {
      await prisma.comparableAvaluo.update({
        where: { IdComparableAvaluo: capture.id },
        data: { JUbicacionSnapshot: { latitude: shared.latitude, longitude: shared.longitude } as Prisma.InputJsonValue },
      });
      pinned += 1;
      continue;
    }
    const query = approximateQueryOf(capture.address);
    if (!query || !geocoding || approximateOf(capture.coordinates)?.query === query) continue;
    let approximate = answers.get(query);
    if (!approximate) {
      if (options.allow && !options.allow()) break;
      try {
        const best = bestGeocodingResult(await options.geocoder(query), addressFromRecord(asRecord(capture.address)));
        approximate = { query, latitude: best?.point[0] ?? null, longitude: best?.point[1] ?? null, address: best?.address ?? null };
      } catch (error) {
        // Without the server's key (503) no lookup will work: the rest wait for another time.
        if (error instanceof ValuationWorkflowError) geocoding = false;
        else console.error("[COMPARABLE_APPROXIMATE]", error);
        continue;
      }
      answers.set(query, approximate);
    }
    await prisma.comparableAvaluo.update({
      where: { IdComparableAvaluo: capture.id },
      data: { JUbicacionSnapshot: { ...asRecord(capture.coordinates), latitude: null, longitude: null, approximate } as Prisma.InputJsonValue },
    });
    if (approximate.latitude !== null) approximated += 1;
  }
  return { pinned, approximated };
}

/**
 * The card of one comparable without a pin (V8.13, 08:40: «aquí no me
 * aparece… pero sí me aparece una ubicación aproximada en su ficha
 * original»): located as the maps do, and its location answered.
 */
export async function locateComparable(
  organizationId: number,
  comparableId: string,
  options: { geocoder: Geocoder; allow?: () => boolean },
): Promise<{ location: ComparableLocationDto | null }> {
  const where = { UIdentificadorPublico: comparableId, ...inFirmBase(organizationId) };
  const row = await prisma.comparableAvaluo.findFirst({
    where, select: { IdComparableAvaluo: true, JDireccionSnapshot: true, JUbicacionSnapshot: true, propiedad: { select: { IFolioComparable: true } } },
  });
  if (!row) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  await locateCaptures(organizationId, [{
    id: row.IdComparableAvaluo, folio: row.propiedad.IFolioComparable, address: row.JDireccionSnapshot, coordinates: row.JUbicacionSnapshot,
  }], options);
  const saved = await prisma.comparableAvaluo.findUniqueOrThrow({
    where: { IdComparableAvaluo: row.IdComparableAvaluo }, select: { JDireccionSnapshot: true, JUbicacionSnapshot: true },
  });
  return { location: locationOf(saved.JUbicacionSnapshot, saved.JDireccionSnapshot) };
}
