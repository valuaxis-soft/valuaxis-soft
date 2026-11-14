/**
 * Parses the /avaluos query string (?page=, ?q=, ?estado=, ?orden=, ?dir=,
 * ?archivados=, ?papelera=, ?tipo=, ?tipoAvaluo=, ?valuador=, ?fecha=,
 * ?desde=, ?hasta=) into safe values. Pure, with no server imports, so the
 * list's client components and the Excel export share it.
 */

/** The columns of the list the firm can sort by. */
export const VALUATION_SORT_KEYS = [
  "modificacion", "folio", "titulo", "cliente", "tipo", "tipoavaluo", "estado", "valuador", "creacion", "conclusion", "version", "eliminacion",
] as const;
export type ValuationSortKey = (typeof VALUATION_SORT_KEYS)[number];
export type ValuationSortDirection = "asc" | "desc";

/** The date the «Desde / Hasta» filter reads. */
export const VALUATION_DATE_FIELDS = ["creacion", "modificacion", "conclusion"] as const;
export type ValuationDateField = (typeof VALUATION_DATE_FIELDS)[number];

export const VALUATION_LIST_PAGE_SIZE = 20;
export const DEFAULT_VALUATION_SORT: ValuationSortKey = "modificacion";
export const VALUATION_SEARCH_MAX_LENGTH = 100;
const MAX_PAGE = 10_000;
const DATE_SORTS: ReadonlySet<ValuationSortKey> = new Set(["modificacion", "creacion", "conclusion", "eliminacion", "version"]);

type RawParam = string | string[] | undefined;

export type ValuationListParams = {
  page: number;
  q: string;
  /** Lowercase status key from the catalog, or null for "all". */
  status: string | null;
  /** The column the list is sorted by and in which direction. */
  sort: ValuationSortKey;
  direction: ValuationSortDirection;
  /** The archived valuations instead of the main list. */
  archived: boolean;
  /** The trash (deleted, restorable for 30 days) instead of the main list. */
  trash: boolean;
  /** Lowercase SClave of the property type, or null. */
  propertyKind: string | null;
  /** Lowercase SClave of the appraisal type, or null. */
  appraisalKind: string | null;
  /** The appraiser (responsible, or creator when there is none), by user id. */
  appraiserId: number | null;
  dateField: ValuationDateField;
  /** "YYYY-MM-DD", inclusive, in Mexico's time; null for no bound. */
  from: string | null;
  to: string | null;
};

function firstValue(value: RawParam) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePage(value: RawParam): number {
  const raw = firstValue(value)?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return 1;
  const page = Number.parseInt(raw, 10);
  if (page < 1) return 1;
  return Number.isSafeInteger(page) ? Math.min(page, MAX_PAGE) : MAX_PAGE;
}

export function parseSearch(value: RawParam): string {
  const normalized = (firstValue(value) ?? "").replace(/\s+/g, " ").trim();
  return normalized.slice(0, VALUATION_SEARCH_MAX_LENGTH).trim();
}

export function parseStatus(value: RawParam, allowedKeys: readonly string[]): string | null {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (!raw) return null;
  return allowedKeys.some((key) => key.toLowerCase() === raw) ? raw : null;
}

export function parseSort(value: RawParam): ValuationSortKey {
  const raw = firstValue(value)?.trim().toLowerCase() ?? "";
  return (VALUATION_SORT_KEYS as readonly string[]).includes(raw) ? (raw as ValuationSortKey) : DEFAULT_VALUATION_SORT;
}

/** The direction asked for, or the natural one of the column: dates newest first, the rest A–Z. */
export function parseDirection(value: RawParam, sort: ValuationSortKey): ValuationSortDirection {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (raw === "asc" || raw === "desc") return raw;
  return defaultDirection(sort);
}

export function defaultDirection(sort: ValuationSortKey): ValuationSortDirection {
  return DATE_SORTS.has(sort) ? "desc" : "asc";
}

const parseFlag = (value: RawParam) => {
  const raw = firstValue(value)?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "si" || raw === "sí";
};

export const parseArchived = parseFlag;

/** A catalog key as the URL carries it: lowercase letters, digits and underscores. */
export function parseKindKey(value: RawParam): string | null {
  const raw = firstValue(value)?.trim().toLowerCase() ?? "";
  return /^[a-z0-9_]{1,64}$/.test(raw) ? raw : null;
}

export function parseAppraiser(value: RawParam): number | null {
  const raw = firstValue(value)?.trim() ?? "";
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number.parseInt(raw, 10);
  return id > 0 ? id : null;
}

/** A real calendar day "YYYY-MM-DD", or null. */
export function parseDay(value: RawParam): string | null {
  const raw = firstValue(value)?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

export function parseDateField(value: RawParam): ValuationDateField {
  const raw = firstValue(value)?.trim().toLowerCase() ?? "";
  return (VALUATION_DATE_FIELDS as readonly string[]).includes(raw) ? (raw as ValuationDateField) : "creacion";
}

export function parseValuationListParams(
  searchParams: Record<string, RawParam>,
  allowedStatusKeys: readonly string[],
): ValuationListParams {
  const sort = parseSort(searchParams.orden);
  const trash = parseFlag(searchParams.papelera);
  let from = parseDay(searchParams.desde);
  let to = parseDay(searchParams.hasta);
  // «Desde» after «Hasta» is the same range typed backwards.
  if (from && to && from > to) [from, to] = [to, from];
  return {
    page: parsePage(searchParams.page),
    q: parseSearch(searchParams.q),
    status: parseStatus(searchParams.estado, allowedStatusKeys),
    sort,
    direction: parseDirection(searchParams.dir, sort),
    // The trash and the archive are two different lists: the trash wins.
    archived: trash ? false : parseFlag(searchParams.archivados),
    trash,
    propertyKind: parseKindKey(searchParams.tipo),
    appraisalKind: parseKindKey(searchParams.tipoAvaluo),
    appraiserId: parseAppraiser(searchParams.valuador),
    dateField: parseDateField(searchParams.fecha),
    from,
    to,
  };
}

/** Whether anything narrows the list (the archive and the trash are lists of their own, not filters). */
export function hasValuationFilters(params: Partial<ValuationListParams>) {
  return Boolean(params.q || params.status || params.propertyKind || params.appraisalKind || params.appraiserId || params.from || params.to);
}

/** The href of a column header: clicking the sorted column turns it around; another column starts in its natural direction. */
export function buildValuationSortHref(params: Partial<ValuationListParams>, sort: ValuationSortKey) {
  const direction = params.sort === sort ? (params.direction === "asc" ? "desc" : "asc") : defaultDirection(sort);
  return buildValuationListHref({ ...params, page: 1, sort, direction });
}

export function totalPages(total: number, pageSize = VALUATION_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The query string of the list's filters and order (no page), as the list and its Excel export read it. */
export function valuationListQuery(params: Partial<ValuationListParams>) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("estado", params.status);
  if (params.trash) query.set("papelera", "1");
  else if (params.archived) query.set("archivados", "1");
  if (params.propertyKind) query.set("tipo", params.propertyKind);
  if (params.appraisalKind) query.set("tipoAvaluo", params.appraisalKind);
  if (params.appraiserId) query.set("valuador", String(params.appraiserId));
  if (params.from || params.to) {
    if (params.dateField && params.dateField !== "creacion") query.set("fecha", params.dateField);
    if (params.from) query.set("desde", params.from);
    if (params.to) query.set("hasta", params.to);
  }
  const sort = params.sort ?? DEFAULT_VALUATION_SORT;
  const direction = params.direction ?? defaultDirection(sort);
  if (sort !== DEFAULT_VALUATION_SORT || direction !== defaultDirection(sort)) {
    query.set("orden", sort);
    query.set("dir", direction);
  }
  return query;
}

/** Builds a /avaluos href keeping the current filters; page 1, the default order and empty values are omitted. */
export function buildValuationListHref(params: Partial<ValuationListParams>) {
  const query = valuationListQuery(params);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `/avaluos?${text}` : "/avaluos";
}
