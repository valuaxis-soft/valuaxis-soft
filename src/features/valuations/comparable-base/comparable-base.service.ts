/**
 * The firm's base of comparables as a list (/comparables): one row per
 * comparable of the base (its number "C-00123"), shown by its most recent
 * capture or update, with the valuations that used it. Only the version each
 * valuation shows today counts, as in the search of the market panel, and
 * only the organization of the user is ever read.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/infrastructure/database/prisma-client";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";
import { asRecord, decimal } from "../calculation/access";
import { addressFromRecord, parseComparableId, todayInMexico, type ComparableAddress, type OperationType } from "../calculation/comparable-card";
import { OFFER_MAX_AGE_MONTHS } from "../calculation/comparable-review";
import { comparableValidity, type ComparableValidity } from "../calculation/comparable-validity";
import { isRentComparableType, type ComparableType } from "../calculation/market-types";
import { searchTokens } from "../comparable-search/normalize";
import {
  AREA, FIRM_BASE_FROM, HAYSTACK, firmBaseCondition, likePattern, placeCondition, postalCodeCondition, wordsIn,
} from "../comparable-search/own-base-sql";
import { COMPARABLE_LIST_PAGE_SIZE, type ComparableListParams, type ComparableSort, type CountMode } from "./comparable-list-params";

/** A valuation that used a comparable of the base. */
export type ComparableBaseUse = { valuationId: string; folio: string; title: string | null; client: string | null };

export type ComparableBaseItem = {
  /** Its most recent capture: the card is /comparables/<id>. */
  id: string;
  folio: number | null;
  type: ComparableType;
  operationType: OperationType;
  location: string;
  address: ComparableAddress | null;
  /** The area of its type (land, built or rentable), m². */
  area: number | null;
  landArea: number | null;
  builtArea: number | null;
  price: number | null;
  unitValue: number | null;
  landUse: string | null;
  constructionType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sourceName: string | null;
  validity: ComparableValidity;
  thumbnailUrl: string | null;
  uses: ComparableBaseUse[];
};

export type ComparableBasePage = { items: ComparableBaseItem[]; total: number };

type Row = {
  id: string;
  baseKey: string;
  organizationId: number;
  folio: number | null;
  type: string;
  propertyName: string | null;
  area: Prisma.Decimal | null;
  landArea: Prisma.Decimal | null;
  builtArea: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  property: Prisma.JsonValue;
  publication: Prisma.JsonValue | null;
  address: Prisma.JsonValue;
  photos: Prisma.JsonValue | null;
  dataUpdatedAt: Date;
  total: bigint;
};

type UseRow = { baseKey: string; organizationId: number; valuationId: string; folio: string; title: string | null; client: string | null };

/** A number kept in a snapshot, or NULL: a text there is not compared as a number. */
const jsonNumber = (path: string) =>
  Prisma.sql`CASE WHEN jsonb_typeof(c."JPropiedadSnapshot"->${path}) = 'number' THEN (c."JPropiedadSnapshot"->>${path})::numeric END`;
const LAND_AREA = Prisma.sql`COALESCE(c."NSuperficieTerrenoCapturada", ${jsonNumber("landArea")})`;
const BUILT_AREA = Prisma.sql`COALESCE(c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada")`;
/** The day of its data in Mexico, and that day plus the months of validity. */
const DATA_DAY = Prisma.sql`(c."DFechaActualizacionDatos" AT TIME ZONE 'America/Mexico_City')::date`;
const VALID_UNTIL = Prisma.sql`(${DATA_DAY} + make_interval(months => ${OFFER_MAX_AGE_MONTHS}::int))::date`;
const OPERATION = Prisma.sql`COALESCE(c."JPropiedadSnapshot"->>'operationType', CASE WHEN t."SClave" LIKE '%RENTA' THEN 'RENTA' ELSE 'VENTA' END)`;

const ORDER: Record<ComparableSort, Prisma.Sql> = {
  reciente: Prisma.sql`c."DFechaActualizacionDatos" DESC`,
  antiguo: Prisma.sql`c."DFechaActualizacionDatos" ASC`,
  precio_asc: Prisma.sql`c."NPrecioCapturado" ASC NULLS LAST`,
  precio_desc: Prisma.sql`c."NPrecioCapturado" DESC NULLS LAST`,
  superficie_asc: Prisma.sql`${AREA} ASC NULLS LAST`,
  superficie_desc: Prisma.sql`${AREA} DESC NULLS LAST`,
  numero: Prisma.sql`p."IFolioComparable" ASC NULLS LAST`,
};

/**
 * The comparables of the organization's valuations, in the version each one
 * shows today, and those kept in its base without a valuation;
 * `baseKey` groups the captures of one comparable of the base.
 */
const capturesOf = (organizationId: number) => Prisma.sql`
  SELECT c.*, COALESCE(a."IdOrganizacion", c."IdOrganizacion") AS "organizationId", a."SNombreCliente" AS "client",
    a."SFolio" AS "valuationFolio",
    COALESCE('f' || p."IFolioComparable"::text, 'c' || c."IdComparableAvaluo"::text) AS "baseKey"
  ${FIRM_BASE_FROM}
  WHERE ${firmBaseCondition(organizationId)}`;

/** Bedrooms or bathrooms: exactly, at least or at most that many (halves of a bathroom count). */
function countCondition(expression: Prisma.Sql, value: number | null, mode: CountMode): Prisma.Sql[] {
  if (value === null) return [];
  if (mode === "exacto") return [Prisma.sql`${expression} = ${value}`];
  return [mode === "hasta" ? Prisma.sql`${expression} <= ${value}` : Prisma.sql`${expression} >= ${value}`];
}

function conditions(params: ComparableListParams, today: string): Prisma.Sql[] {
  const folio = parseComparableId(params.q);
  const range = (expression: Prisma.Sql, min: number | null, max: number | null) => [
    ...(min === null ? [] : [Prisma.sql`${expression} >= ${min}`]),
    ...(max === null ? [] : [Prisma.sql`${expression} <= ${max}`]),
  ];
  const clientWords = searchTokens(params.client);
  return [
    ...(folio ? [Prisma.sql`p."IFolioComparable" = ${folio}`] : wordsIn(HAYSTACK, params.q)),
    // Used in a valuation of that client: any capture of the comparable, not only the latest.
    ...(clientWords.length ? [Prisma.sql`EXISTS (
      SELECT 1 FROM "captures" u
      WHERE u."baseKey" = c."baseKey"
        AND ${Prisma.join(clientWords.map((word) => Prisma.sql`unaccent(lower(COALESCE(u."client", ''))) LIKE ${likePattern(word)}`), " AND ")}
    )`] : []),
    ...placeCondition("state", params.state || undefined),
    ...placeCondition("municipality", params.municipality || undefined),
    ...placeCondition("neighborhood", params.neighborhood || undefined),
    ...placeCondition("subdivision", params.subdivision || undefined),
    ...postalCodeCondition(params.postalCode || undefined),
    ...(params.types.length ? [Prisma.sql`t."SClave" IN (${Prisma.join(params.types)})`] : []),
    ...(params.operation ? [Prisma.sql`${OPERATION} = ${params.operation}`] : []),
    ...wordsIn(Prisma.sql`unaccent(lower(COALESCE(c."JPropiedadSnapshot"->>'constructionType', '')))`, params.constructionType || undefined),
    ...wordsIn(Prisma.sql`unaccent(lower(concat_ws(' ', c."JPropiedadSnapshot"->>'landUse', c."JPropiedadSnapshot"->>'landUseKey')))`, params.landUse || undefined),
    ...range(LAND_AREA, params.landAreaMin, params.landAreaMax),
    ...range(BUILT_AREA, params.builtAreaMin, params.builtAreaMax),
    ...countCondition(jsonNumber("bedrooms"), params.bedrooms, params.bedroomsMode),
    ...countCondition(jsonNumber("bathrooms"), params.bathrooms, params.bathroomsMode),
    ...range(Prisma.sql`c."NPrecioCapturado"`, params.priceMin, params.priceMax),
    ...(params.from ? [Prisma.sql`${DATA_DAY} >= ${params.from}::date`] : []),
    ...(params.to ? [Prisma.sql`${DATA_DAY} <= ${params.to}::date`] : []),
    ...(params.validity === "VIGENTE" ? [Prisma.sql`${VALID_UNTIL} >= ${today}::date`] : []),
    ...(params.validity === "VENCIDO" ? [Prisma.sql`${VALID_UNTIL} < ${today}::date`] : []),
  ];
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const addressOf = (value: Prisma.JsonValue): ComparableAddress | null => addressFromRecord(asRecord(value));

function firstPhotoKey(photos: Prisma.JsonValue | null) {
  const photo = Array.isArray(photos) ? asRecord(photos[0] as Prisma.JsonValue) : {};
  return typeof photo.key === "string" && photo.key ? photo.key : null;
}

/** One page of the firm's base with the filters and order of `params`. */
export async function listComparableBase(
  organizationId: number,
  params: ComparableListParams,
  options: { today?: string; pageSize?: number; withThumbnails?: boolean } = {},
): Promise<ComparableBasePage> {
  const today = options.today ?? todayInMexico();
  const pageSize = options.pageSize ?? COMPARABLE_LIST_PAGE_SIZE;
  const where = conditions(params, today);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH "captures" AS (${capturesOf(organizationId)}),
    "latest" AS (
      SELECT DISTINCT ON ("baseKey") * FROM "captures"
      ORDER BY "baseKey", "DFechaActualizacionDatos" DESC, "DFechaSeleccion" DESC, "IdComparableAvaluo" DESC
    )
    SELECT
      c."UIdentificadorPublico"::text AS "id",
      c."baseKey",
      c."organizationId",
      p."IFolioComparable" AS "folio",
      t."SClave" AS "type",
      p."SNombre" AS "propertyName",
      ${AREA} AS "area",
      ${LAND_AREA} AS "landArea",
      ${BUILT_AREA} AS "builtArea",
      c."NPrecioCapturado" AS "price",
      c."JPropiedadSnapshot" AS "property",
      c."JPublicacionSnapshot" AS "publication",
      c."JDireccionSnapshot" AS "address",
      c."JImagenesSnapshot" AS "photos",
      c."DFechaActualizacionDatos" AS "dataUpdatedAt",
      count(*) OVER () AS "total"
    FROM "latest" c
    JOIN "devpware_propiedades" p ON p."IdPropiedad" = c."IdPropiedad"
    JOIN "devpware_tipos_comparables" t ON t."IdTipoComparable" = c."IdTipoComparable"
    ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}
    ORDER BY ${ORDER[params.sort]}, c."IdComparableAvaluo" DESC
    LIMIT ${pageSize} OFFSET ${(params.page - 1) * pageSize}
  `);
  // The query already filters by organization; a row of another one here is a bug, and nothing is returned.
  if (rows.some((row) => row.organizationId !== organizationId)) throw new Error("The comparable base read a row of another organization.");
  const total = rows.length ? Number(rows[0].total) : await countComparableBase(organizationId, where);
  const uses = await usesOf(organizationId, rows.map((row) => row.baseKey));
  const items = await Promise.all(rows.map(async (row): Promise<ComparableBaseItem> => {
    const property = asRecord(row.property);
    const publication = asRecord(row.publication);
    const type = row.type as ComparableType;
    const area = decimal(row.area);
    const price = decimal(row.price);
    const photo = firstPhotoKey(row.photos);
    const operation = text(property.operationType);
    return {
      id: row.id,
      folio: row.folio,
      type,
      operationType: operation === "VENTA" || operation === "RENTA" ? operation : isRentComparableType(type) ? "RENTA" : "VENTA",
      location: text(asRecord(row.address).location) ?? row.propertyName ?? "",
      address: addressOf(row.address),
      area,
      landArea: decimal(row.landArea),
      builtArea: decimal(row.builtArea),
      price,
      unitValue: area && price ? price / area : null,
      landUse: text(property.landUse) ?? text(property.landUseKey),
      constructionType: text(property.constructionType),
      bedrooms: finite(property.bedrooms),
      bathrooms: finite(property.bathrooms),
      sourceName: text(publication.sourceName),
      validity: comparableValidity(row.dataUpdatedAt, today),
      thumbnailUrl: photo && options.withThumbnails !== false ? await stableDownloadUrl(photo).catch(() => null) : null,
      uses: uses.get(row.baseKey) ?? [],
    };
  }));
  return { items, total };
}

/** The total when the page asked for is past the last one (no row brings the count). */
async function countComparableBase(organizationId: number, where: Prisma.Sql[]) {
  const [row] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    WITH "captures" AS (${capturesOf(organizationId)}),
    "latest" AS (
      SELECT DISTINCT ON ("baseKey") * FROM "captures"
      ORDER BY "baseKey", "DFechaActualizacionDatos" DESC, "DFechaSeleccion" DESC, "IdComparableAvaluo" DESC
    )
    SELECT count(*) AS "total"
    FROM "latest" c
    JOIN "devpware_propiedades" p ON p."IdPropiedad" = c."IdPropiedad"
    JOIN "devpware_tipos_comparables" t ON t."IdTipoComparable" = c."IdTipoComparable"
    ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}
  `);
  return Number(row?.total ?? 0);
}

/** The valuations each comparable of the page was used in, most recent first. */
async function usesOf(organizationId: number, baseKeys: string[]) {
  const byKey = new Map<string, ComparableBaseUse[]>();
  if (!baseKeys.length) return byKey;
  const rows = await prisma.$queryRaw<UseRow[]>(Prisma.sql`
    WITH "captures" AS (${capturesOf(organizationId)})
    SELECT u."baseKey", u."organizationId", a."UIdentificadorPublico"::text AS "valuationId", a."SFolio" AS "folio",
      a."STitulo" AS "title", a."SNombreCliente" AS "client"
    FROM "captures" u
    JOIN "devpware_avaluos" a ON a."IdAvaluo" = u."IdAvaluo"
    WHERE u."baseKey" IN (${Prisma.join(baseKeys)})
    GROUP BY u."baseKey", u."organizationId", a."IdAvaluo"
    ORDER BY max(u."DFechaSeleccion") DESC
  `);
  if (rows.some((row) => row.organizationId !== organizationId)) throw new Error("The comparable base read a use of another organization.");
  for (const row of rows) {
    const list = byKey.get(row.baseKey) ?? [];
    list.push({ valuationId: row.valuationId, folio: row.folio, title: row.title, client: row.client });
    byKey.set(row.baseKey, list);
  }
  return byKey;
}
