/**
 * The map of the firm's base of comparables (etapa 3 of the maps quote):
 * the comparables of the filters of /comparables as pins, the ones within a
 * radius of a point (PostGIS, over the coordinates each capture keeps) and
 * the subject of each valuation of the firm. Only the organization of the
 * user is ever read, as in the list.
 */
import { Prisma } from "@prisma/client";

import { readSubjectLocation } from "@/features/maps/subject-location";
import type { LatLon } from "@/features/maps/types";
import { asRecord, decimal, firmComparableMonths } from "@/features/valuations/calculation/access";
import { todayInMexico } from "@/features/valuations/calculation/comparable-card";
import { comparableValidity } from "@/features/valuations/calculation/comparable-validity";
import { isRentComparableType, type ComparableType } from "@/features/valuations/calculation/market-types";
import { LATEST_FROM, comparableBaseConditions, latestCapturesCte } from "@/features/valuations/comparable-base/comparable-base.service";
import type { ComparableListParams } from "@/features/valuations/comparable-base/comparable-list-params";
import { AREA, COMPARABLE_POINT } from "@/features/valuations/comparable-search/own-base-sql";
import { prisma } from "@/infrastructure/database/prisma-client";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";

import { RADIUS_MAX_HITS, sortByDistance } from "./radius";
import type { ComparablePinDto, ComparablePinsDto, RadiusHitDto, ValuationPinDto } from "./types";

/** Pins past this many are not sent: the appraiser filters, the map says so. */
export const MAX_PINS = 3000;

type PinRow = {
  id: string;
  organizationId: number;
  folio: number | null;
  type: string;
  propertyName: string | null;
  lat: number;
  lon: number;
  area: Prisma.Decimal | null;
  landArea: Prisma.Decimal | null;
  builtArea: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  property: Prisma.JsonValue;
  publication: Prisma.JsonValue | null;
  address: Prisma.JsonValue;
  photos: Prisma.JsonValue | null;
  dataUpdatedAt: Date;
  distance: number | null;
};

const jsonNumber = (path: string) =>
  Prisma.sql`CASE WHEN jsonb_typeof(c."JPropiedadSnapshot"->${path}) = 'number' THEN (c."JPropiedadSnapshot"->>${path})::numeric END`;

/** The same columns the list reads, with the point split back into latitude and longitude. */
const PIN_COLUMNS = Prisma.sql`
  c."UIdentificadorPublico"::text AS "id",
  c."organizationId",
  p."IFolioComparable" AS "folio",
  t."SClave" AS "type",
  p."SNombre" AS "propertyName",
  ST_Y(${COMPARABLE_POINT}::geometry) AS "lat",
  ST_X(${COMPARABLE_POINT}::geometry) AS "lon",
  ${AREA} AS "area",
  COALESCE(c."NSuperficieTerrenoCapturada", ${jsonNumber("landArea")}) AS "landArea",
  COALESCE(c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada") AS "builtArea",
  c."NPrecioCapturado" AS "price",
  c."JPropiedadSnapshot" AS "property",
  c."JPublicacionSnapshot" AS "publication",
  c."JDireccionSnapshot" AS "address",
  c."JImagenesSnapshot" AS "photos",
  c."DFechaActualizacionDatos" AS "dataUpdatedAt"`;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
/** The listing's address, only when it is a web address: the card links to it. */
const webUrl = (value: unknown) => {
  const url = text(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
};

function firstPhotoKey(photos: Prisma.JsonValue | null) {
  const photo = Array.isArray(photos) ? asRecord(photos[0] as Prisma.JsonValue) : {};
  return typeof photo.key === "string" && photo.key ? photo.key : null;
}

async function pinOf(row: PinRow, today: string, firmMonths: number, withThumbnails: boolean): Promise<ComparablePinDto> {
  const property = asRecord(row.property);
  const publication = asRecord(row.publication);
  const type = row.type as ComparableType;
  const operation = text(property.operationType);
  const photo = firstPhotoKey(row.photos);
  const validity = comparableValidity(row.dataUpdatedAt, today, finite(publication.validityMonths) ?? firmMonths);
  return {
    id: row.id,
    folio: row.folio,
    type,
    operationType: operation === "VENTA" || operation === "RENTA" ? operation : isRentComparableType(type) ? "RENTA" : "VENTA",
    location: text(asRecord(row.address).location) ?? row.propertyName ?? "",
    lat: row.lat,
    lon: row.lon,
    area: decimal(row.area),
    landArea: decimal(row.landArea),
    builtArea: decimal(row.builtArea),
    price: decimal(row.price),
    bedrooms: finite(property.bedrooms),
    bathrooms: finite(property.bathrooms),
    sourceName: text(publication.sourceName),
    url: webUrl(publication.url),
    thumbnailUrl: photo && withThumbnails ? await stableDownloadUrl(photo).catch(() => null) : null,
    updatedOn: validity.updatedOn,
    validUntil: validity.validUntil,
    expired: validity.expired,
  };
}

/** A row of another organization here is a bug, and nothing is returned. */
function assertOwn(rows: { organizationId: number }[], organizationId: number) {
  if (rows.some((row) => row.organizationId !== organizationId)) throw new Error("The map of comparables read a row of another organization.");
}

type PinOptions = { today?: string; withThumbnails?: boolean; maxPins?: number };

/**
 * The comparables of the filters with coordinates, most recently updated
 * first (the ones that fit under the cap), and how many have none.
 */
export async function listComparablePins(organizationId: number, params: ComparableListParams, options: PinOptions = {}): Promise<ComparablePinsDto> {
  const today = options.today ?? todayInMexico();
  const firmMonths = await firmComparableMonths(prisma, organizationId);
  const where = comparableBaseConditions(params, today, firmMonths);
  const filters = where.length ? Prisma.sql`AND ${Prisma.join(where, " AND ")}` : Prisma.empty;
  const [counts] = await prisma.$queryRaw<Array<{ located: bigint; unlocated: bigint }>>(Prisma.sql`
    ${latestCapturesCte(organizationId)}
    SELECT count(*) FILTER (WHERE ${COMPARABLE_POINT} IS NOT NULL) AS "located",
      count(*) FILTER (WHERE ${COMPARABLE_POINT} IS NULL) AS "unlocated"
    ${LATEST_FROM}
    WHERE c."organizationId" = ${organizationId} ${filters}
  `);
  const rows = await prisma.$queryRaw<PinRow[]>(Prisma.sql`
    ${latestCapturesCte(organizationId)}
    SELECT ${PIN_COLUMNS}, NULL::float8 AS "distance"
    ${LATEST_FROM}
    WHERE c."organizationId" = ${organizationId} AND ${COMPARABLE_POINT} IS NOT NULL ${filters}
    ORDER BY c."DFechaActualizacionDatos" DESC, c."IdComparableAvaluo" DESC
    LIMIT ${options.maxPins ?? MAX_PINS}
  `);
  assertOwn(rows, organizationId);
  const pins = await Promise.all(rows.map((row) => pinOf(row, today, firmMonths, options.withThumbnails !== false)));
  return { pins, located: Number(counts?.located ?? 0), unlocated: Number(counts?.unlocated ?? 0) };
}

/**
 * "Buscar alrededor de": the comparables of the filters within `radius`
 * meters of `center`, closest first (ST_DWithin over the geography, so the
 * meters are real ones), at most RADIUS_MAX_HITS.
 */
export async function comparablesAround(
  organizationId: number,
  center: LatLon,
  radius: number,
  params: ComparableListParams,
  options: PinOptions = {},
): Promise<RadiusHitDto[]> {
  const today = options.today ?? todayInMexico();
  const firmMonths = await firmComparableMonths(prisma, organizationId);
  const where = comparableBaseConditions(params, today, firmMonths);
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${center[1]}::float8, ${center[0]}::float8), 4326)::geography`;
  const rows = await prisma.$queryRaw<PinRow[]>(Prisma.sql`
    ${latestCapturesCte(organizationId)}
    SELECT ${PIN_COLUMNS}, ST_Distance(${COMPARABLE_POINT}, ${point}) AS "distance"
    ${LATEST_FROM}
    WHERE c."organizationId" = ${organizationId} AND ST_DWithin(${COMPARABLE_POINT}, ${point}, ${radius}::float8)
      ${where.length ? Prisma.sql`AND ${Prisma.join(where, " AND ")}` : Prisma.empty}
    ORDER BY "distance" ASC, p."IFolioComparable" ASC NULLS LAST
    LIMIT ${RADIUS_MAX_HITS}
  `);
  assertOwn(rows, organizationId);
  const hits = await Promise.all(rows.map(async (row) => ({ ...(await pinOf(row, today, firmMonths, options.withThumbnails !== false)), distance: row.distance ?? 0 })));
  return sortByDistance(hits);
}

/** Valuations past this many are not sent; the firm's map shows the most recent ones. */
const MAX_VALUATIONS = 2000;

/**
 * The subject of each valuation of the firm that has been located (the pin
 * of the croquis panel, kept in the subject property's characteristics),
 * most recently modified first; archived ones included, deleted ones not.
 */
export async function listValuationPins(organizationId: number): Promise<ValuationPinDto[]> {
  const rows = await prisma.avaluo.findMany({
    where: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null, IdPropiedadSujeto: { not: null } },
    select: {
      UIdentificadorPublico: true,
      SFolio: true,
      STitulo: true,
      SNombreCliente: true,
      DFechaModificacion: true,
      DFechaArchivo: true,
      estadoAvaluo: { select: { SClave: true, SNombre: true } },
      tipoInmueble: { select: { SNombre: true } },
      propiedadSujeto: {
        select: { JCaracteristicas: true, direccionesPropiedad: { where: { BEsDireccionActual: true }, select: { SDireccionCompleta: true }, take: 1 } },
      },
    },
    orderBy: [{ DFechaModificacion: "desc" }, { IdAvaluo: "desc" }],
    take: MAX_VALUATIONS,
  });
  const pins: ValuationPinDto[] = [];
  for (const row of rows) {
    const location = readSubjectLocation(row.propiedadSujeto?.JCaracteristicas ?? null);
    if (!location) continue;
    pins.push({
      id: row.UIdentificadorPublico,
      folio: row.SFolio,
      title: row.STitulo,
      client: row.SNombreCliente,
      status: row.estadoAvaluo.SClave.toLowerCase(),
      statusName: row.estadoAvaluo.SNombre,
      propertyKindName: row.tipoInmueble.SNombre,
      updatedAt: row.DFechaModificacion.toISOString(),
      archived: row.DFechaArchivo !== null,
      lat: location.point[0],
      lon: location.point[1],
      address: location.address ?? row.propiedadSujeto?.direccionesPropiedad[0]?.SDireccionCompleta ?? null,
    });
  }
  return pins;
}
