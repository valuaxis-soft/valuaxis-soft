/**
 * The filters of «Buscar comparables» (in a valuation) as the query string of
 * /comparables, which the map of the firm's base reads (api.maps.comparables
 * and comparablesAround). Until V7.3-10 (16 nov 2026) the dialog opened its
 * map with no filter at all: the appraiser asked for at most 200 m² and the
 * map showed 260 and 300. Pure, so it is tested without a browser.
 */
import { buildComparableListHref } from "../comparable-base/comparable-list-params";
import type { StreetType } from "../calculation/comparable-card";
import type { ComparableType } from "../calculation/market-types";
import { SEARCH_KINDS, SEARCH_OPERATIONS, searchedTypes } from "./schemas";

/** What the dialog sends to its own search (api-client's ComparableSearchFilters), as far as the map needs it. */
export type SearchMapFilters = {
  text: string;
  areaMin?: number | null;
  areaMax?: number | null;
  priceMin: number | null;
  priceMax: number | null;
  state?: string;
  municipality?: string;
  neighborhood?: string;
  postalCode?: string;
  kind?: string;
  operation?: string;
  consultedFrom?: string;
  consultedTo?: string;
  streetType?: string;
  landAreaMin?: number | null;
  landAreaMax?: number | null;
  builtAreaMin?: number | null;
  builtAreaMax?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  landUse?: string;
  constructionType?: string;
};

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
  (value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined);

/**
 * The query string of /comparables for the map, without the leading "?":
 * the comparable types of the market searched (or of the kind and operation
 * chosen), and every filter the map understands. The old single «Superficie»
 * (the area of each comparable's own type) goes as the land area of a land
 * market and as the built area of the others.
 */
export function searchMapQuery(type: ComparableType, filters: SearchMapFilters | null) {
  const kind = oneOf(filters?.kind, SEARCH_KINDS);
  const operation = oneOf(filters?.operation, SEARCH_OPERATIONS);
  const types = searchedTypes(type, kind, operation);
  const landMarket = types.every((item) => item.startsWith("TERRENO"));
  const href = buildComparableListHref({
    types,
    q: filters?.text.trim(),
    state: filters?.state?.trim(),
    municipality: filters?.municipality?.trim(),
    neighborhood: filters?.neighborhood?.trim(),
    postalCode: filters?.postalCode?.trim(),
    priceMin: filters?.priceMin ?? null,
    priceMax: filters?.priceMax ?? null,
    landAreaMin: filters?.landAreaMin ?? (landMarket ? filters?.areaMin : null) ?? null,
    landAreaMax: filters?.landAreaMax ?? (landMarket ? filters?.areaMax : null) ?? null,
    builtAreaMin: filters?.builtAreaMin ?? (landMarket ? null : filters?.areaMin) ?? null,
    builtAreaMax: filters?.builtAreaMax ?? (landMarket ? null : filters?.areaMax) ?? null,
    bedrooms: filters?.bedrooms ?? null,
    bathrooms: filters?.bathrooms ?? null,
    landUse: filters?.landUse?.trim(),
    constructionType: filters?.constructionType?.trim(),
    consultedFrom: filters?.consultedFrom || null,
    consultedTo: filters?.consultedTo || null,
    streetType: (filters?.streetType as StreetType | undefined) || null,
  });
  return href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
}
