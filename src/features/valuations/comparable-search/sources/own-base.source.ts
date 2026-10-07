/**
 * The firm's own base: comparables its appraisers already captured in other
 * valuations. Only the organization of the search is ever read.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/infrastructure/database/prisma-client";
import { asRecord, decimal } from "../../calculation/access";
import { searchTokens } from "../normalize";
import type { ComparableSearchContext, ComparableSearchQuery, ComparableSearchResult, ComparableSearchSource } from "../types";

/** Rows read before ranking: the same offer repeats across valuations, and the most relevant may not be the newest. */
const CANDIDATES = 200;

type Row = {
  id: string;
  organizationId: number;
  folio: string;
  propertyName: string | null;
  area: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  property: Prisma.JsonValue;
  publication: Prisma.JsonValue | null;
  address: Prisma.JsonValue;
  photos: Prisma.JsonValue | null;
  capturedAt: Date;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);
const likePattern = (token: string) => `%${token.replace(/[\\%_]/g, "\\$&")}%`;

/** Location and the texts of the property and its publication, without accents or case. */
const HAYSTACK = Prisma.sql`unaccent(lower(concat_ws(' ',
  COALESCE(c."JDireccionSnapshot"->>'location', p."SNombre"),
  c."JPropiedadSnapshot"->>'landUse', c."JPropiedadSnapshot"->>'landUseKey', c."JPropiedadSnapshot"->>'zone',
  c."JPropiedadSnapshot"->>'services', c."JPropiedadSnapshot"->>'notes',
  c."JPublicacionSnapshot"->>'sourceName', c."JPublicacionSnapshot"->>'contactName')))`;
const AREA = Prisma.sql`COALESCE(c."NSuperficieTerrenoCapturada", c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada")`;

function toResult(row: Row): ComparableSearchResult {
  const property = asRecord(row.property);
  const publication = asRecord(row.publication);
  const offerDate = text(publication.offerDate);
  return {
    id: row.id,
    origin: `avalúo ${row.folio}`,
    capturedOn: row.capturedAt.toISOString().slice(0, 10),
    photoCount: Array.isArray(row.photos) ? row.photos.length : 0,
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
      offerDate: offerDate && /^\d{4}-\d{2}-\d{2}$/.test(offerDate) ? offerDate : null,
    },
  };
}

async function search(query: ComparableSearchQuery, context: ComparableSearchContext): Promise<ComparableSearchResult[]> {
  const tokens = searchTokens(query.text);
  if (!tokens.length) return [];
  const conditions = [
    // The tenant: the valuation the comparable belongs to is this organization's, and alive.
    Prisma.sql`a."IdOrganizacion" = ${context.organizationId}`,
    Prisma.sql`a."BActivo" AND a."DFechaEliminacion" IS NULL`,
    Prisma.sql`a."IdAvaluo" <> ${context.valuationId}`,
    // Reopening copies comparables to the new version: only the version each valuation shows today counts.
    Prisma.sql`c."IdVersionAvaluo" = COALESCE(a."IdVersionTrabajo", a."IdVersionFinal")`,
    Prisma.sql`c."BIncluido"`,
    Prisma.sql`t."SClave" = ${query.type}`,
    ...tokens.map((token) => Prisma.sql`${HAYSTACK} LIKE ${likePattern(token)}`),
    ...(query.areaMin === null ? [] : [Prisma.sql`${AREA} >= ${query.areaMin}`]),
    ...(query.areaMax === null ? [] : [Prisma.sql`${AREA} <= ${query.areaMax}`]),
    ...(query.priceMin === null ? [] : [Prisma.sql`c."NPrecioCapturado" >= ${query.priceMin}`]),
    ...(query.priceMax === null ? [] : [Prisma.sql`c."NPrecioCapturado" <= ${query.priceMax}`]),
  ];
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      c."UIdentificadorPublico"::text AS "id",
      a."IdOrganizacion" AS "organizationId",
      a."SFolio" AS "folio",
      p."SNombre" AS "propertyName",
      ${AREA} AS "area",
      c."NPrecioCapturado" AS "price",
      c."JPropiedadSnapshot" AS "property",
      c."JPublicacionSnapshot" AS "publication",
      c."JDireccionSnapshot" AS "address",
      c."JImagenesSnapshot" AS "photos",
      c."DFechaSeleccion" AS "capturedAt"
    FROM "devpware_comparables_avaluos" c
    JOIN "devpware_avaluos" a ON a."IdAvaluo" = c."IdAvaluo"
    JOIN "devpware_tipos_comparables" t ON t."IdTipoComparable" = c."IdTipoComparable"
    JOIN "devpware_propiedades" p ON p."IdPropiedad" = c."IdPropiedad"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY c."DFechaSeleccion" DESC, c."IdComparableAvaluo" DESC
    LIMIT ${CANDIDATES}
  `);
  // The query already filters by organization; a row of another one here is a bug, and nothing is returned.
  if (rows.some((row) => row.organizationId !== context.organizationId)) {
    throw new Error("Comparable search read a row of another organization.");
  }
  return rows.map(toResult);
}

export const ownBaseSource: ComparableSearchSource = {
  id: "despacho",
  label: "Comparables del despacho",
  isAvailable: () => true,
  search,
};
