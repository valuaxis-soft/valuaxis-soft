/**
 * Pieces of SQL over the comparables of the firm's base, shared by the search
 * of the market panel and the Comparables page. They read a comparable of a
 * valuation as `c` and its property as `p`.
 */
import { Prisma } from "@prisma/client";

import type { ComparableClass } from "../calculation/comparable-classes";
import { LEGACY_KIND_PATTERNS } from "../calculation/comparable-kinds";
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

/** The custom field of the organization that lists the numbers of its comparables in the trash (comparable-trash.service.ts). */
export const COMPARABLE_TRASH_FIELD_KEY = "PAPELERA_COMPARABLES";

/**
 * The tenant and what counts as the base: of an alive valuation of the
 * organization, only the version it shows today (reopening copies its
 * comparables); and those kept in the organization's base without a valuation.
 * A number the firm sent to the trash («Borrar comparables viejos», V8.8) is
 * out of the base until it is restored; its valuations do not change.
 */
export const firmBaseCondition = (organizationId: number) => Prisma.sql`c."BIncluido" AND (
      (c."IdAvaluo" IS NOT NULL AND a."IdOrganizacion" = ${organizationId} AND a."BActivo" AND a."DFechaEliminacion" IS NULL
        AND c."IdVersionAvaluo" = COALESCE(a."IdVersionTrabajo", a."IdVersionFinal"))
      OR (c."IdAvaluo" IS NULL AND c."IdOrganizacion" = ${organizationId})
    ) AND NOT EXISTS (
      SELECT 1 FROM "devpware_campos_personalizados" trash
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(trash."JConfiguracion"->'items') = 'array' THEN trash."JConfiguracion"->'items' ELSE '[]'::jsonb END) AS trashed(item)
      WHERE trash."IdOrganizacion" = ${organizationId} AND trash."SClave" = ${COMPARABLE_TRASH_FIELD_KEY} AND trash."DFechaEliminacion" IS NULL
        AND jsonb_typeof(trashed.item->'folio') = 'number' AND (trashed.item->>'folio')::int = p."IFolioComparable"
    )`;

export const likePattern = (token: string) => `%${token.replace(/[\\%_]/g, "\\$&")}%`;

/** Location and the texts of the property and its publication, without accents or case. */
export const HAYSTACK = Prisma.sql`unaccent(lower(concat_ws(' ',
  COALESCE(c."JDireccionSnapshot"->>'location', p."SNombre"),
  c."JDireccionSnapshot"->>'street', c."JDireccionSnapshot"->>'neighborhood', c."JDireccionSnapshot"->>'subdivision',
  c."JDireccionSnapshot"->>'municipality',
  c."JDireccionSnapshot"->>'state',
  c."JPropiedadSnapshot"->>'landUse', c."JPropiedadSnapshot"->>'landUseKey', c."JPropiedadSnapshot"->>'zone',
  c."JPropiedadSnapshot"->>'services', c."JPropiedadSnapshot"->>'notes', c."JPropiedadSnapshot"->>'constructionType',
  c."JPublicacionSnapshot"->>'sourceName', c."JPublicacionSnapshot"->>'contactName')))`;

/** The area of the comparable's type: land, built or rentable. */
export const AREA = Prisma.sql`COALESCE(c."NSuperficieTerrenoCapturada", c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada")`;

/** A number kept in the property's snapshot, or NULL: a text there is not compared as a number. */
export const jsonNumber = (path: string) =>
  Prisma.sql`CASE WHEN jsonb_typeof(c."JPropiedadSnapshot"->${path}) = 'number' THEN (c."JPropiedadSnapshot"->>${path})::numeric END`;
/** The land area: the captured one of a land comparable, else the land of a built one. */
export const LAND_AREA = Prisma.sql`COALESCE(c."NSuperficieTerrenoCapturada", ${jsonNumber("landArea")})`;
/** The built or rentable area; NULL for land. */
export const BUILT_AREA = Prisma.sql`COALESCE(c."NSuperficieConstruccionCapturada", c."NSuperficieRentableCapturada")`;

/** From `min` to `max`, both inclusive; a missing side is open. */
export const rangeCondition = (expression: Prisma.Sql, min: number | null | undefined, max: number | null | undefined) => [
  ...(min === null || min === undefined ? [] : [Prisma.sql`${expression} >= ${min}`]),
  ...(max === null || max === undefined ? [] : [Prisma.sql`${expression} <= ${max}`]),
];

/** «Uso de suelo»: words of the use or its key. */
export const landUseCondition = (value: string | undefined) =>
  wordsIn(Prisma.sql`unaccent(lower(concat_ws(' ', c."JPropiedadSnapshot"->>'landUse', c."JPropiedadSnapshot"->>'landUseKey')))`, value || undefined);

/** «Tipo de construcción»: words of it. */
export const constructionTypeCondition = (value: string | undefined) =>
  wordsIn(Prisma.sql`unaccent(lower(COALESCE(c."JPropiedadSnapshot"->>'constructionType', '')))`, value || undefined);

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

/** «Tipo de vialidad»: the type captured; a comparable of before, without one, is a «Calle». */
export const streetTypeCondition = (streetType: string | undefined) => (streetType
  ? [Prisma.sql`COALESCE(c."JDireccionSnapshot"->>'streetType', 'CALLE') = ${streetType}`]
  : []);

/** The latitude or longitude kept in JUbicacionSnapshot, as a number; NULL when missing or a text. */
const coordinate = (name: string) =>
  Prisma.sql`CASE WHEN jsonb_typeof(c."JUbicacionSnapshot"->${name}) = 'number' THEN (c."JUbicacionSnapshot"->>${name})::float8 END`;

/**
 * Where the comparable is, as a PostGIS point over its captured coordinates
 * (there is no column: the snapshot keeps them), or NULL without them or
 * off the globe. Migration 056 indexes the same expression.
 */
export const COMPARABLE_POINT = Prisma.sql`CASE WHEN ${coordinate("latitude")} BETWEEN -90 AND 90 AND ${coordinate("longitude")} BETWEEN -180 AND 180
  THEN ST_SetSRID(ST_MakePoint(${coordinate("longitude")}, ${coordinate("latitude")}), 4326)::geography END`;

/** The type of construction of the snapshot, unaccented, in lowercase and trimmed: what the kinds of before are read from. */
const CONSTRUCTION_TYPE_TEXT = Prisma.sql`unaccent(lower(btrim(COALESCE(c."JPropiedadSnapshot"->>'constructionType', ''))))`;
const KIND = Prisma.sql`(c."JPropiedadSnapshot"->'details'->>'kind')`;

/**
 * The class of a comparable (comparable-classes.comparableClassOf): the one
 * kept with its kind; else machinery when its type of construction said so,
 * real estate otherwise. Needs `c`.
 */
export const COMPARABLE_CLASS = Prisma.sql`(CASE
  WHEN c."JPropiedadSnapshot"->'details'->>'assetClass' IN ('INMUEBLE', 'MAQUINARIA') THEN c."JPropiedadSnapshot"->'details'->>'assetClass'
  WHEN ${CONSTRUCTION_TYPE_TEXT} ~ '^(equipo|maquinaria)' THEN 'MAQUINARIA'
  ELSE 'INMUEBLE' END)`;

/** Only comparables of that class: real estate and machinery never mix (24 Nov 2026). */
export const classCondition = (kindClass: ComparableClass | null | undefined) =>
  (kindClass ? [Prisma.sql`${COMPARABLE_CLASS} = ${kindClass}`] : []);

/**
 * «Tipo de inmueble / de bien» (comparable-kinds.kindOfComparable): the kind
 * captured; a comparable of before, without one, by its market (land) or the
 * type of construction it was captured with. Needs `c` and `t`.
 */
export function kindCondition(kind: string | null | undefined) {
  if (!kind) return [];
  const legacy = LEGACY_KIND_PATTERNS.find(([key]) => key === kind)?.[1];
  const land = Prisma.sql`t."SClave" IN ('TERRENO_VENTA', 'TERRENO_RENTA')`;
  const ofBefore = kind === "TERRENO"
    ? land
    : legacy ? Prisma.sql`(NOT ${land} AND ${CONSTRUCTION_TYPE_TEXT} ~ ${legacy})` : null;
  return [ofBefore ? Prisma.sql`(${KIND} = ${kind} OR (${KIND} IS NULL AND ${ofBefore}))` : Prisma.sql`${KIND} = ${kind}`];
}
