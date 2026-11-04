/**
 * Parses the /avaluos query string (?page=, ?q=, ?estado=, ?orden=, ?dir=,
 * ?archivados=) into safe values. Pure so it can be unit tested without a
 * request.
 */
import { VALUATION_SORT_KEYS, type ValuationSortDirection, type ValuationSortKey } from "@/features/valuations/repositories/valuation.repository";

export const VALUATION_LIST_PAGE_SIZE = 20;
export const DEFAULT_VALUATION_SORT: ValuationSortKey = "modificacion";
export const VALUATION_SEARCH_MAX_LENGTH = 100;
const MAX_PAGE = 10_000;

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
  return sort === "modificacion" || sort === "creacion" ? "desc" : "asc";
}

export function parseArchived(value: RawParam): boolean {
  const raw = firstValue(value)?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "si" || raw === "sí";
}

export function parseValuationListParams(
  searchParams: Record<string, RawParam>,
  allowedStatusKeys: readonly string[],
): ValuationListParams {
  const sort = parseSort(searchParams.orden);
  return {
    page: parsePage(searchParams.page),
    q: parseSearch(searchParams.q),
    status: parseStatus(searchParams.estado, allowedStatusKeys),
    sort,
    direction: parseDirection(searchParams.dir, sort),
    archived: parseArchived(searchParams.archivados),
  };
}

/** The href of a column header: clicking the sorted column turns it around; another column starts in its natural direction. */
export function buildValuationSortHref(params: Partial<ValuationListParams>, sort: ValuationSortKey) {
  const direction = params.sort === sort ? (params.direction === "asc" ? "desc" : "asc") : defaultDirection(sort);
  return buildValuationListHref({ ...params, page: 1, sort, direction });
}

export function totalPages(total: number, pageSize = VALUATION_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Builds a /avaluos href keeping the current filters; page 1, the default order and empty values are omitted. */
export function buildValuationListHref(params: Partial<ValuationListParams>) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("estado", params.status);
  if (params.archived) query.set("archivados", "1");
  const sort = params.sort ?? DEFAULT_VALUATION_SORT;
  const direction = params.direction ?? defaultDirection(sort);
  if (sort !== DEFAULT_VALUATION_SORT || direction !== defaultDirection(sort)) {
    query.set("orden", sort);
    query.set("dir", direction);
  }
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `/avaluos?${text}` : "/avaluos";
}
