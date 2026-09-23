/**
 * Parses the /avaluos query string (?page=, ?q=, ?estado=) into safe values.
 * Pure so it can be unit tested without a request.
 */

export const VALUATION_LIST_PAGE_SIZE = 20;
export const VALUATION_SEARCH_MAX_LENGTH = 100;
const MAX_PAGE = 10_000;

type RawParam = string | string[] | undefined;

export type ValuationListParams = {
  page: number;
  q: string;
  /** Lowercase status key from the catalog, or null for "all". */
  status: string | null;
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

export function parseValuationListParams(
  searchParams: Record<string, RawParam>,
  allowedStatusKeys: readonly string[],
): ValuationListParams {
  return {
    page: parsePage(searchParams.page),
    q: parseSearch(searchParams.q),
    status: parseStatus(searchParams.estado, allowedStatusKeys),
  };
}

export function totalPages(total: number, pageSize = VALUATION_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Builds a /avaluos href keeping the current filters; page 1 and empty values are omitted. */
export function buildValuationListHref(params: Partial<ValuationListParams>) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("estado", params.status);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `/avaluos?${text}` : "/avaluos";
}
