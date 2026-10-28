/**
 * The firm's own base: comparables its appraisers already captured in other
 * valuations. Only the organization of the search is ever read.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/infrastructure/database/prisma-client";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";
import { asRecord, decimal, inFirmBase } from "../../calculation/access";
import { addressFromRecord, parseComparableId, type ComparableAddress, type OperationType, type UrbanProximity } from "../../calculation/comparable-card";
import { reusedEvidenceOf, type ReusedComparableEvidence } from "../../calculation/market.service";
import { searchTokens } from "../normalize";
import { AREA, CONSULTED, FIRM_BASE_FROM, HAYSTACK, firmBaseCondition, likePattern, placeCondition, postalCodeCondition } from "../own-base-sql";
import type { ComparableSearchContext, ComparableSearchQuery, ComparableSearchResult, ComparableSearchSource } from "../types";

/** Rows read before ranking: the same offer repeats across valuations, and the most relevant may not be the newest. */
const CANDIDATES = 200;

type Row = {
  id: string;
  organizationId: number;
  folio: string | null;
  comparableFolio: number | null;
  propertyName: string | null;
  area: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  property: Prisma.JsonValue;
  publication: Prisma.JsonValue | null;
  address: Prisma.JsonValue;
  coordinates: Prisma.JsonValue;
  photos: Prisma.JsonValue | null;
  capturedAt: Date;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);
const coordinate = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const day = (value: unknown) => {
  const typed = text(value);
  return typed && /^\d{4}-\d{2}-\d{2}$/.test(typed) ? typed : null;
};

const addressOf = (value: Prisma.JsonValue): ComparableAddress | null => addressFromRecord(asRecord(value));

function firstPhotoKey(photos: Prisma.JsonValue | null) {
  const first = Array.isArray(photos) ? asRecord(photos[0] as Prisma.JsonValue) : {};
  return typeof first.key === "string" && first.key ? first.key : null;
}

async function toResult(row: Row): Promise<ComparableSearchResult> {
  const property = asRecord(row.property);
  const publication = asRecord(row.publication);
  const coordinates = asRecord(row.coordinates);
  const thumbnail = firstPhotoKey(row.photos);
  const operationType = text(property.operationType);
  const urbanProximity = text(property.urbanProximity);
  return {
    id: row.id,
    origin: row.folio ? `avalúo ${row.folio}` : "base general",
    capturedOn: row.capturedAt.toISOString().slice(0, 10),
    photoCount: Array.isArray(row.photos) ? row.photos.length : 0,
    folio: row.comparableFolio,
    thumbnailUrl: thumbnail ? await stableDownloadUrl(thumbnail).catch(() => null) : null,
    comparable: {
      location: text(asRecord(row.address).location) ?? row.propertyName ?? "",
      area: decimal(row.area),
      price: decimal(row.price),
      landUse: text(property.landUse),
      landUseKey: text(property.landUseKey),
      shape: text(property.shape),
      zone: text(property.zone),
      frontCount: number(property.frontCount),
      frontage: number(property.frontage),
      depth: number(property.depth),
      topography: text(property.topography),
      services: text(property.services),
      conservation: text(property.conservation),
      quality: text(property.quality),
      notes: text(property.notes),
      sourceName: text(publication.sourceName),
      contactName: text(publication.contactName),
      contactPhone: text(publication.contactPhone),
      url: text(publication.url),
      offerDate: day(publication.offerDate),
      consultedOn: day(publication.consultedOn),
      validUntil: day(publication.validUntil),
      listingText: text(publication.listingText),
      address: addressOf(row.address),
      // Invalid stored values are left for the schema of the orchestrator to reject.
      ...(operationType ? { operationType: operationType as OperationType } : {}),
      ...(urbanProximity ? { urbanProximity: urbanProximity as UrbanProximity } : {}),
      latitude: coordinate(coordinates.latitude),
      longitude: coordinate(coordinates.longitude),
      landArea: number(property.landArea),
      bedrooms: coordinate(property.bedrooms),
      bathrooms: coordinate(property.bathrooms),
      constructionType: text(property.constructionType),
    },
  };
}

async function search(query: ComparableSearchQuery, context: ComparableSearchContext): Promise<ComparableSearchResult[]> {
  const filters = query.filters ?? {};
  // "C-00123" looks for that comparable of the base; other text, for its words.
  const wantedFolio = parseComparableId(query.text);
  const tokens = wantedFolio ? [] : searchTokens(query.text);
  if (!wantedFolio && !tokens.length && !query.filters && [query.areaMin, query.areaMax, query.priceMin, query.priceMax].every((item) => item === null)) {
    return [];
  }
  const types = filters.types?.length ? filters.types : [query.type];
  const conditions = [
    // The tenant, and only the version each valuation shows today (reopening copies comparables), or the base without a valuation.
    firmBaseCondition(context.organizationId),
    Prisma.sql`c."IdAvaluo" IS DISTINCT FROM ${context.valuationId}`,
    Prisma.sql`t."SClave" IN (${Prisma.join(types)})`,
    ...(wantedFolio ? [Prisma.sql`p."IFolioComparable" = ${wantedFolio}`] : []),
    ...tokens.map((token) => Prisma.sql`${HAYSTACK} LIKE ${likePattern(token)}`),
    ...placeCondition("state", filters.state),
    ...placeCondition("municipality", filters.municipality),
    ...placeCondition("neighborhood", filters.neighborhood),
    ...postalCodeCondition(filters.postalCode),
    ...(filters.consultedFrom ? [Prisma.sql`${CONSULTED} >= ${filters.consultedFrom}`] : []),
    ...(filters.consultedTo ? [Prisma.sql`${CONSULTED} <= ${filters.consultedTo}`] : []),
    ...(query.areaMin === null ? [] : [Prisma.sql`${AREA} >= ${query.areaMin}`]),
    ...(query.areaMax === null ? [] : [Prisma.sql`${AREA} <= ${query.areaMax}`]),
    ...(query.priceMin === null ? [] : [Prisma.sql`c."NPrecioCapturado" >= ${query.priceMin}`]),
    ...(query.priceMax === null ? [] : [Prisma.sql`c."NPrecioCapturado" <= ${query.priceMax}`]),
  ];
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      c."UIdentificadorPublico"::text AS "id",
      COALESCE(a."IdOrganizacion", c."IdOrganizacion") AS "organizationId",
      a."SFolio" AS "folio",
      p."IFolioComparable" AS "comparableFolio",
      p."SNombre" AS "propertyName",
      ${AREA} AS "area",
      c."NPrecioCapturado" AS "price",
      c."JPropiedadSnapshot" AS "property",
      c."JPublicacionSnapshot" AS "publication",
      c."JDireccionSnapshot" AS "address",
      c."JUbicacionSnapshot" AS "coordinates",
      c."JImagenesSnapshot" AS "photos",
      c."DFechaSeleccion" AS "capturedAt"
    ${FIRM_BASE_FROM}
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY c."DFechaSeleccion" DESC, c."IdComparableAvaluo" DESC
    LIMIT ${CANDIDATES}
  `);
  // The query already filters by organization; a row of another one here is a bug, and nothing is returned.
  if (rows.some((row) => row.organizationId !== context.organizationId)) {
    throw new Error("Comparable search read a row of another organization.");
  }
  return Promise.all(rows.map(toResult));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The photos, screenshot and number of a comparable of the firm, read only within the organization of the search. */
async function evidence(comparableId: string, context: Pick<ComparableSearchContext, "organizationId">): Promise<ReusedComparableEvidence> {
  if (!UUID.test(comparableId)) return {};
  const row = await prisma.comparableAvaluo.findFirst({
    where: { UIdentificadorPublico: comparableId, ...inFirmBase(context.organizationId) },
    select: { JImagenesSnapshot: true, JPublicacionSnapshot: true, DFechaActualizacionDatos: true, propiedad: { select: { IFolioComparable: true } } },
  });
  return row ? reusedEvidenceOf(row) : {};
}

export const ownBaseSource: ComparableSearchSource = {
  id: "despacho",
  label: "Comparables del despacho",
  isAvailable: () => true,
  search,
  evidence,
};
