/**
 * The query string of /operador/usuarios and of its export: ?q=, ?acreditado=,
 * ?orden=, ?dir=, ?page=. Validated with Zod; anything invalid falls back to
 * the default instead of failing, as the valuations list does. Pure, so the
 * page, the export and the tests share it.
 */
import { z } from "zod";

export const USER_DIRECTORY_PAGE_SIZE = 25;
export const USER_DIRECTORY_SEARCH_MAX_LENGTH = 100;
/** The most rows an export carries; the sheet says when there are more. */
export const MAX_USER_DIRECTORY_EXPORT_ROWS = 10_000;

export const USER_DIRECTORY_ACCREDITATION_FILTERS = ["todos", "si", "no"] as const;
export const USER_DIRECTORY_SORTS = ["alta", "acceso"] as const;

export type UserDirectoryParams = {
  /** Words that must all appear in the name, email or phone. */
  q: string;
  accredited: (typeof USER_DIRECTORY_ACCREDITATION_FILTERS)[number];
  /** Sign-up date or last access. */
  sort: (typeof USER_DIRECTORY_SORTS)[number];
  direction: "asc" | "desc";
  page: number;
};

const paramsSchema = z.object({
  q: z.string().trim().max(USER_DIRECTORY_SEARCH_MAX_LENGTH).catch(""),
  acreditado: z.enum(USER_DIRECTORY_ACCREDITATION_FILTERS).catch("todos"),
  orden: z.enum(USER_DIRECTORY_SORTS).catch("alta"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export function parseUserDirectoryParams(raw: Record<string, string | string[] | undefined>): UserDirectoryParams {
  const single = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = paramsSchema.parse(single);
  return { q: parsed.q, accredited: parsed.acreditado, sort: parsed.orden, direction: parsed.dir, page: parsed.page };
}

/** The query string for `params` (only what differs from the defaults). */
export function userDirectoryQuery(params: Partial<UserDirectoryParams>): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.accredited && params.accredited !== "todos") search.set("acreditado", params.accredited);
  if (params.sort && params.sort !== "alta") search.set("orden", params.sort);
  if (params.direction && params.direction !== "desc") search.set("dir", params.direction);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  return search.toString();
}

/** The accreditation as the directory and its export show it. */
export const ACCREDITATION_LABELS: Record<string, string> = {
  NO_ACREDITADO: "No acreditado",
  EN_REVISION: "En revisión",
  ACREDITADO: "Acreditado",
  RECHAZADO: "Rechazado",
};

/** The search words: at most 6, so a pasted paragraph does not build a huge query. */
export function searchTerms(q: string): string[] {
  return q.split(/\s+/).filter(Boolean).slice(0, 6);
}
