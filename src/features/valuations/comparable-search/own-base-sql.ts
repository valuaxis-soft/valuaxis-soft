/**
 * Pieces of SQL over the comparables of the firm's base, shared by the search
 * of the market panel and the Comparables page. They read a comparable of a
 * valuation as `c` and its property as `p`.
 */
import { Prisma } from "@prisma/client";

import { searchTokens } from "./normalize";

/**
 * The comparables of the firm's base, as `c` with its valuation `a` (NULL for
 * one kept in the base without a valuation, migration 048), its type `t` and
 * its property `p`. Pair it with firmBaseCondition.
 */
export const FIRM_BASE_FROM = Prisma.sql`FROM "devpware_comparables_avaluos" c
    LEFT JOIN "devpware_avaluos" a ON a."IdAvaluo" = c."IdAvaluo"
    JOIN "devpware_tipos_comparables" t ON t."IdTipoComparable" = c."IdTipoComparable"
    JOIN "devpware_propiedades" p ON p."IdPropiedad" = c."IdPropiedad"`;

/**
 * The tenant and what counts as the base: of an alive valuation of the
 * organization, only the version it shows today (reopening copies its
 * comparables); and those kept in the organization's base without a valuation.
 */
export const firmBaseCondition = (organizationId: number) => Prisma.sql`c."BIncluido" AND (
      (c."IdAvaluo" IS NOT NULL AND a."IdOrganizacion" = ${organizationId} AND a."BActivo" AND a."DFechaEliminacion" IS NULL
        AND c."IdVersionAvaluo" = COALESCE(a."IdVersionTrabajo", a."IdVersionFinal"))
      OR (c."IdAvaluo" IS NULL AND c."IdOrganizacion" = ${organizationId})
    )`;

export const likePattern = (token: string) => `%${token.replace(/[\\%_]/g, "\\$&")}%`;

/** Location and the texts of the property and its publication, without accents or case. */
export const HAYSTACK = Prisma.sql`unaccent(lower(concat_ws(' ',
  COALESCE(c."JDireccionSnapshot"->>'location', p."SNombre"),
  c."JDireccionSnapshot"->>'street', c."JDireccionSnapshot"->>'neighborhood', c."JDireccionSnapshot"->>'municipality',
  c."JDireccionSnapshot"->>'state',
  c."JPropiedadSnapshot"->>'landUse', c."JPropiedadSnapshot"->>'landUseKey', c."JPropiedadSnapshot"->>'zone',
  c."JPropiedadSnapshot"->>'services', c."JPropiedadSnapshot"->>'notes', c."JPropiedadSnapshot"->>'constructionType',
  c."JPublicacionSnapshot"->>'sourceName', c."JPublicacionSnapshot"->>'contactName')))`;

/** The area of the comparable's type: land, built or rentable. */
export const AREA = Prisma.sql`COALESCE(c."NSuperficieTerrenoCapturada", c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada")`;

/** The day the offer was consulted: as captured, else the offer's date, else the day it was chosen. */
export const CONSULTED = Prisma.sql`COALESCE(c."JPublicacionSnapshot"->>'consultedOn', c."JPublicacionSnapshot"->>'offerDate', to_char(c."DFechaSeleccion", 'YYYY-MM-DD'))`;

/** Every word of `value` in `expression` (already without accents or case). */
export const wordsIn = (expression: Prisma.Sql, value: string | undefined) =>
  value ? searchTokens(value).map((token) => Prisma.sql`${expression} LIKE ${likePattern(token)}`) : [];

/**
 * A place filter: the part captured with that name, or, for comparables of
 * before with a single location line, that line. Every word must be there.
 */
export function placeCondition(part: string, value: string | undefined) {
  return wordsIn(Prisma.sql`unaccent(lower(concat_ws(' ', c."JDireccionSnapshot"->>${part}, c."JDireccionSnapshot"->>'location')))`, value);
}

/** The postal code captured, or written in the location line of a comparable of before. */
export const postalCodeCondition = (postalCode: string | undefined) => (postalCode
  ? [Prisma.sql`(c."JDireccionSnapshot"->>'postalCode' = ${postalCode} OR c."JDireccionSnapshot"->>'location' LIKE ${likePattern(postalCode)})`]
  : []);
