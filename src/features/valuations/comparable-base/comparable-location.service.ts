/**
 * Where a comparable of the firm's base is, the same in every place that
 * shows it (V8.13, 07:16 to 11:15): the search map of a market, «Ver ficha»,
 * its card and the map of /comparables.
 *
 * - A pin is the valuer's own data and a fact of the property, not of one
 *   capture: placed and saved in one valuation (or in the base), every
 *   capture of its number in the firm takes it, also the one a search offers
 *   from another valuation. Only the coordinates are written in place;
 *   nothing of a calculation or a dictamen reads them.
 * - Without a pin, but with an address, the comparable has an approximate
 *   location: what Google's Geocoding API answers for its address. Google's
 *   terms allow keeping that answer only temporarily (30 days at most) and
 *   our legal matrix keeps Google-derived data out of the stored valuation,
 *   so it is NOT written in the comparable: it lives in a temporary cache of
 *   the firm (its custom field UBICACION_APROXIMADA_CACHE, keyed by the
 *   capture), each answer with `geocodedAt`. Past 30 days an answer is
 *   ignored and looked up again when shown (rate-limited as every lookup),
 *   and it is pruned on the next write. It is never a pin, never copied to
 *   another comparable or version, and never printed (dictamen, PDF, memoria).
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

/** The firm's temporary cache of approximate locations (a custom field, JSON, one per organization). */
export const APPROXIMATE_CACHE_FIELD_KEY = "UBICACION_APROXIMADA_CACHE";
/** Google Maps Platform terms: a geocoding answer may be kept 30 consecutive days at most. */
export const APPROXIMATE_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One answer of the geocoder for a capture: the text asked and, when found, the point and the address; and when it was asked. */
export type ApproximateLocation = { query: string; latitude: number | null; longitude: number | null; address: string | null; geocodedAt: string };

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

/** A cached answer while it is younger than 30 days; null when missing, malformed or expired. */
export function freshApproximate(entry: unknown, now = new Date()): ApproximateLocation | null {
  const stored = asRecord(entry as Prisma.JsonValue);
  if (typeof stored.query !== "string" || !stored.query || typeof stored.geocodedAt !== "string") return null;
  const asked = Date.parse(stored.geocodedAt);
  if (!Number.isFinite(asked) || now.getTime() - asked > APPROXIMATE_TTL_DAYS * DAY_MS || asked > now.getTime() + DAY_MS) return null;
  const latitude = finite(stored.latitude);
  const longitude = finite(stored.longitude);
  const found = latitude !== null && longitude !== null;
  return {
    query: stored.query, latitude: found ? latitude : null, longitude: found ? longitude : null,
    address: typeof stored.address === "string" ? stored.address : null, geocodedAt: stored.geocodedAt,
  };
}

/** The text the geocoder is asked for a comparable, from its address snapshot (comparable-geocoding). */
export function approximateQueryOf(addressSnapshot: unknown) {
  const record = asRecord(addressSnapshot as Prisma.JsonValue);
  return geocodingQueryOf(addressFromRecord(record), typeof record.location === "string" ? record.location : "");
}

/**
 * The location the card shows: the pin, else the cached approximate point
 * while it is fresh and was asked for the address the comparable has today.
 */
export function locationOf(coordinates: unknown, addressSnapshot: unknown, cached: unknown, now = new Date()): ComparableLocationDto | null {
  const pin = pinOf(coordinates);
  if (pin) return { ...pin, approximate: false, address: null };
  const approximate = freshApproximate(cached, now);
  if (!approximate || approximate.latitude === null || approximate.longitude === null || approximate.query !== approximateQueryOf(addressSnapshot)) return null;
  return { latitude: approximate.latitude, longitude: approximate.longitude, approximate: true, address: approximate.address };
}

type Client = Tx | typeof prisma;

const cacheWhere = (organizationId: number) => ({
  IdOrganizacion: organizationId, SClave: APPROXIMATE_CACHE_FIELD_KEY, DFechaEliminacion: null,
}) satisfies Prisma.CampoPersonalizadoWhereInput;

/** The firm's cached answers by capture id (UIdentificadorPublico), expired ones included. */
async function readCache(client: Client, organizationId: number): Promise<Record<string, unknown>> {
  const field = await client.campoPersonalizado.findFirst({ where: cacheWhere(organizationId), select: { JConfiguracion: true } });
  return asRecord(asRecord(field?.JConfiguracion ?? null).items as Prisma.JsonValue);
}

/** The cached answer of one capture, fresh or not (locationOf decides). */
export async function cachedApproximate(client: Client, organizationId: number, captureId: string) {
  return (await readCache(client, organizationId))[captureId] ?? null;
}

/** Writes answers (null forgets one) and prunes the expired ones, so nothing stays past 30 days once the cache is written again. */
async function writeCache(client: Client, organizationId: number, changes: Record<string, ApproximateLocation | null>) {
  const now = new Date();
  const current = await readCache(client, organizationId);
  const items: Record<string, ApproximateLocation> = {};
  for (const [id, entry] of Object.entries({ ...current, ...changes })) {
    const fresh = entry ? freshApproximate(entry, now) : null;
    if (fresh) items[id] = fresh;
  }
  const configuration = { items } as unknown as Prisma.InputJsonObject;
  const field = await client.campoPersonalizado.findFirst({ where: cacheWhere(organizationId), select: { IdCampoPersonalizado: true } });
  if (field) {
    await client.campoPersonalizado.update({ where: { IdCampoPersonalizado: field.IdCampoPersonalizado }, data: { JConfiguracion: configuration } });
    return;
  }
  const dataType = await client.tipoDato.findUniqueOrThrow({ where: { SClave: "JSON" }, select: { IdTipoDato: true } });
  await client.campoPersonalizado.create({
    data: {
      IdOrganizacion: organizationId,
      IdTipoDato: dataType.IdTipoDato,
      SClave: APPROXIMATE_CACHE_FIELD_KEY,
      SNombre: "Ubicación aproximada de comparables (temporal)",
      SDescripcion: "Respuestas de Google Geocoding por comparable sin pin; se usan 30 días como máximo y no forman parte de ningún avalúo.",
      SSeccionSugerida: "COMPARABLES",
      JConfiguracion: configuration,
    },
  });
}

/** A capture's address changed or it got a pin: its cached answer no longer applies. */
export async function forgetApproximate(client: Client, organizationId: number, captureId: string) {
  if (!((await readCache(client, organizationId))[captureId])) return;
  await writeCache(client, organizationId, { [captureId]: null });
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
 * and the maps show it at once. It is the valuer's own data, not Google's.
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
export async function pinOfNumber(client: Client, organizationId: number, folio: number): Promise<LatLng | null> {
  const rows = await client.$queryRaw<Array<{ coordinates: Prisma.JsonValue }>>(Prisma.sql`
    SELECT c."JUbicacionSnapshot" AS "coordinates" FROM "devpware_comparables_avaluos" c
    WHERE ${sameNumber(organizationId, folio)}
      AND jsonb_typeof(c."JUbicacionSnapshot"->'latitude') = 'number' AND jsonb_typeof(c."JUbicacionSnapshot"->'longitude') = 'number'
    ORDER BY c."DFechaModificacion" DESC, c."IdComparableAvaluo" DESC
    LIMIT 1`);
  return rows.length ? pinOf(rows[0].coordinates) : null;
}

export type Geocoder = (query: string) => Promise<GeocodingResult[]>;

/** A capture to locate: its row and public id, its number and its snapshots. */
export type UnlocatedCapture = { id: bigint; publicId: string; folio: number | null; address: Prisma.JsonValue; coordinates: Prisma.JsonValue };

/** Comparables looked up at most per call: the map asks again for the rest. */
export const LOCATE_BATCH = 20;

/**
 * Gives a location to captures without a pin: the pin another capture of its
 * number has (the valuer's, written in place), else the approximate location
 * of its address in the firm's temporary cache, looked up when there is no
 * fresh answer for the same address (`allow` is the rate limit of each
 * lookup). A failed lookup is cached too, so the same address is not asked
 * again within 30 days; maps not configured end the lookups quietly.
 */
export async function locateCaptures(
  organizationId: number,
  captures: readonly UnlocatedCapture[],
  options: { geocoder: Geocoder; allow?: () => boolean; now?: Date },
): Promise<{ pinned: number; approximated: number }> {
  const now = options.now ?? new Date();
  let pinned = 0;
  let approximated = 0;
  let geocoding = true;
  const cache = await readCache(prisma, organizationId);
  const changes: Record<string, ApproximateLocation> = {};
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
    if (!query || !geocoding || freshApproximate(cache[capture.publicId], now)?.query === query) continue;
    let approximate = answers.get(query);
    if (!approximate) {
      if (options.allow && !options.allow()) break;
      try {
        const best = bestGeocodingResult(await options.geocoder(query), addressFromRecord(asRecord(capture.address)));
        approximate = {
          query, latitude: best?.point[0] ?? null, longitude: best?.point[1] ?? null, address: best?.address ?? null, geocodedAt: now.toISOString(),
        };
      } catch (error) {
        // Without the server's key (503) no lookup will work: the rest wait for another time.
        if (error instanceof ValuationWorkflowError) geocoding = false;
        else console.error("[COMPARABLE_APPROXIMATE]", error);
        continue;
      }
      answers.set(query, approximate);
    }
    changes[capture.publicId] = approximate;
    if (approximate.latitude !== null) approximated += 1;
  }
  if (Object.keys(changes).length) await writeCache(prisma, organizationId, changes);
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
  options: { geocoder: Geocoder; allow?: () => boolean; now?: Date },
): Promise<{ location: ComparableLocationDto | null }> {
  const select = { IdComparableAvaluo: true, UIdentificadorPublico: true, JDireccionSnapshot: true, JUbicacionSnapshot: true, propiedad: { select: { IFolioComparable: true } } };
  const row = await prisma.comparableAvaluo.findFirst({ where: { UIdentificadorPublico: comparableId, ...inFirmBase(organizationId) }, select });
  if (!row) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  await locateCaptures(organizationId, [{
    id: row.IdComparableAvaluo, publicId: row.UIdentificadorPublico, folio: row.propiedad.IFolioComparable,
    address: row.JDireccionSnapshot, coordinates: row.JUbicacionSnapshot,
  }], options);
  const saved = await prisma.comparableAvaluo.findUniqueOrThrow({ where: { IdComparableAvaluo: row.IdComparableAvaluo }, select });
  return { location: locationOf(saved.JUbicacionSnapshot, saved.JDireccionSnapshot, await cachedApproximate(prisma, organizationId, comparableId), options.now) };
}
