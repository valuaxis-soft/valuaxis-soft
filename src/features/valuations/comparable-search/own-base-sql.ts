/**
 * Pieces of SQL over the comparables of the firm's base, shared by the search
 * of the market panel and the Comparables page. They read a comparable of a
 * valuation as `c` and its property as `p`.
 */
import { Prisma } from "@prisma/client";

import { searchTokens } from "./normalize";

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
