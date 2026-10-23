/**
 * The query string of /comparables (the firm's base of comparables) as safe
 * values, and back. Pure, so it is tested without a request; anything that
 * does not parse is left out rather than rejected.
 */
import { OPERATION_TYPES, type OperationType } from "../calculation/comparable-card";
import { VALIDITY_STATUSES, type ValidityStatus } from "../calculation/comparable-validity";
import { COMPARABLE_TYPES, type ComparableType } from "../calculation/market-types";

export const COMPARABLE_LIST_PAGE_SIZE = 25;
const TEXT_MAX_LENGTH = 100;
const MAX_PAGE = 10_000;

export const COMPARABLE_SORTS = ["reciente", "antiguo", "precio_asc", "precio_desc", "superficie_asc", "superficie_desc", "numero"] as const;
export type ComparableSort = (typeof COMPARABLE_SORTS)[number];
export const COMPARABLE_SORT_LABELS: Record<ComparableSort, string> = {
  reciente: "Actualizados recientemente",
  antiguo: "Actualizados hace más tiempo",
  precio_asc: "Precio: menor a mayor",
  precio_desc: "Precio: mayor a menor",
  superficie_asc: "Superficie: menor a mayor",
  superficie_desc: "Superficie: mayor a menor",
  numero: "Número (C-00001 primero)",
};

export type ComparableListParams = {
  page: number;
  /** Words of the location, use or source, or a comparable's number ("C-00123"). */
  q: string;
  /** Comparables used in valuations of this client. */
  client: string;
  state: string;
  municipality: string;
  neighborhood: string;
  postalCode: string;
  /** Empty: every type. */
  types: ComparableType[];
  operation: OperationType | null;
  constructionType: string;
  landUse: string;
  landAreaMin: number | null;
  landAreaMax: number | null;
  builtAreaMin: number | null;
  builtAreaMax: number | null;
  /** At least this many. */
  bedrooms: number | null;
  bathrooms: number | null;
  /** "Fecha de alta / actualización" from and to, YYYY-MM-DD, both inclusive. */
  from: string | null;
  to: string | null;
  validity: ValidityStatus | null;
  sort: ComparableSort;
};

type RawParam = string | string[] | undefined;

const first = (value: RawParam) => (Array.isArray(value) ? value[0] : value);
const all = (value: RawParam) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const textOf = (value: RawParam) => (first(value) ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX_LENGTH).trim();

function pageOf(value: RawParam) {
  const raw = first(value)?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return 1;
  const page = Number.parseInt(raw, 10);
  return page < 1 ? 1 : Math.min(page, MAX_PAGE);
}

/** "1,250.5" or "1250,5" → 1250.5; null when empty, negative or not a number. */
function numberOf(value: RawParam) {
  const raw = textOf(value).replace(/\s/g, "");
  if (!raw) return null;
  const normalized = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1e12 ? parsed : null;
}

function dayOf(value: RawParam) {
  const raw = textOf(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

function oneOf<T extends string>(value: RawParam, allowed: readonly T[], map: (raw: string) => string = (raw) => raw) {
  const raw = map(textOf(value));
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export function parseComparableListParams(searchParams: Record<string, RawParam>): ComparableListParams {
  const postalCode = textOf(searchParams.cp);
  return {
    page: pageOf(searchParams.page),
    q: textOf(searchParams.q),
    client: textOf(searchParams.cliente),
    state: textOf(searchParams.estado),
    municipality: textOf(searchParams.municipio),
    neighborhood: textOf(searchParams.colonia),
    postalCode: /^\d{5}$/.test(postalCode) ? postalCode : "",
    types: [...new Set(all(searchParams.tipo).map((item) => item.trim().toUpperCase()))]
      .filter((item): item is ComparableType => (COMPARABLE_TYPES as readonly string[]).includes(item)),
    operation: oneOf(searchParams.operacion, OPERATION_TYPES, (raw) => raw.toUpperCase()),
    constructionType: textOf(searchParams.construccion),
    landUse: textOf(searchParams.uso),
    landAreaMin: numberOf(searchParams.terrenoMin),
    landAreaMax: numberOf(searchParams.terrenoMax),
    builtAreaMin: numberOf(searchParams.construidaMin),
    builtAreaMax: numberOf(searchParams.construidaMax),
    bedrooms: numberOf(searchParams.recamaras),
    bathrooms: numberOf(searchParams.banos),
    from: dayOf(searchParams.desde),
    to: dayOf(searchParams.hasta),
    validity: oneOf(searchParams.vigencia, VALIDITY_STATUSES, (raw) => raw.toUpperCase()),
    sort: oneOf(searchParams.orden, COMPARABLE_SORTS) ?? "reciente",
  };
}

/** Whether any filter beyond the text and the order is set: the page opens its "Más filtros" then. */
export function hasAdvancedFilters(params: ComparableListParams) {
  return Boolean(params.client || params.state || params.municipality || params.neighborhood || params.postalCode
    || params.types.length || params.operation || params.constructionType || params.landUse
    || [params.landAreaMin, params.landAreaMax, params.builtAreaMin, params.builtAreaMax, params.bedrooms, params.bathrooms]
      .some((value) => value !== null)
    || params.from || params.to || params.validity);
}

export const hasFilters = (params: ComparableListParams) => Boolean(params.q) || hasAdvancedFilters(params);

/** The /comparables href with these filters; page 1, the default order and empty values are left out. */
export function buildComparableListHref(params: Partial<ComparableListParams>) {
  const query = new URLSearchParams();
  const set = (key: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  };
  set("q", params.q);
  set("cliente", params.client);
  set("estado", params.state);
  set("municipio", params.municipality);
  set("colonia", params.neighborhood);
  set("cp", params.postalCode);
  for (const type of params.types ?? []) query.append("tipo", type);
  set("operacion", params.operation?.toLowerCase());
  set("construccion", params.constructionType);
  set("uso", params.landUse);
  set("terrenoMin", params.landAreaMin);
  set("terrenoMax", params.landAreaMax);
  set("construidaMin", params.builtAreaMin);
  set("construidaMax", params.builtAreaMax);
  set("recamaras", params.bedrooms);
  set("banos", params.bathrooms);
  set("desde", params.from);
  set("hasta", params.to);
  set("vigencia", params.validity?.toLowerCase());
  if (params.sort && params.sort !== "reciente") query.set("orden", params.sort);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `/comparables?${text}` : "/comparables";
}
