import { z } from "zod";

import { comparableInputSchema } from "../calculation/market-schemas";
import { COMPARABLE_TYPES } from "../calculation/market-types";
import { SEARCH_TEXT_MIN, searchText } from "./normalize";
import type { ComparableSearchQuery } from "./types";

export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 50;

const empty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && !value.trim());
/** A bound of a range as the query string carries it; empty leaves that side open. */
const bound = z.preprocess(
  (value) => (empty(value) ? null : Number(value)),
  z.number("Debe ser un número.").finite("Debe ser un número.").positive("Debe ser mayor que cero.").max(1e12).nullable(),
);

/** The query string of the search: ?tipo=&q=&supMin=&supMax=&precioMin=&precioMax=&limite=. */
export const comparableSearchQuerySchema = z.object({
  tipo: z.enum(COMPARABLE_TYPES, "Tipo de comparable inválido"),
  q: z.string("Escribe la zona, colonia, municipio o calle que buscas.").trim().max(120, "La búsqueda es demasiado larga.")
    // Counted without punctuation: "., " is not something to look for.
    .refine((value) => searchText(value).length >= SEARCH_TEXT_MIN, `Escribe al menos ${SEARCH_TEXT_MIN} letras de la zona, colonia, municipio o calle.`),
  supMin: bound,
  supMax: bound,
  precioMin: bound,
  precioMax: bound,
  limite: z.preprocess(
    (value) => (empty(value) ? SEARCH_LIMIT_DEFAULT : Number(value)),
    z.number().int("El límite debe ser un entero.").min(1).max(SEARCH_LIMIT_MAX, `Se devuelven hasta ${SEARCH_LIMIT_MAX} resultados.`),
  ),
})
  .refine((value) => value.supMin === null || value.supMax === null || value.supMin <= value.supMax,
    { path: ["supMax"], message: "La superficie máxima debe ser mayor o igual que la mínima." })
  .refine((value) => value.precioMin === null || value.precioMax === null || value.precioMin <= value.precioMax,
    { path: ["precioMax"], message: "El precio máximo debe ser mayor o igual que el mínimo." })
  .transform((value): ComparableSearchQuery => ({
    text: value.q,
    type: value.tipo,
    areaMin: value.supMin,
    areaMax: value.supMax,
    priceMin: value.precioMin,
    priceMax: value.precioMax,
    limit: value.limite,
  }));

/** Reads the query from a URL; the first problem comes back in words. */
export function parseComparableSearchQuery(params: URLSearchParams):
  | { ok: true; query: ComparableSearchQuery }
  | { ok: false; error: string } {
  const parsed = comparableSearchQuerySchema.safeParse({
    tipo: params.get("tipo"), q: params.get("q") ?? undefined,
    supMin: params.get("supMin"), supMax: params.get("supMax"),
    precioMin: params.get("precioMin"), precioMax: params.get("precioMax"),
    limite: params.get("limite"),
  });
  return parsed.success ? { ok: true, query: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? "Búsqueda inválida." };
}

/** A comparable as a source returns it: the capture form's rules, without factors. */
export const foundComparableSchema = comparableInputSchema.omit({ factors: true });

/** The results the appraiser chose, sent back to become comparables. */
export const addFoundComparablesSchema = z.object({
  results: z.array(z.object({
    sourceId: z.string().trim().min(1).max(60),
    origin: z.string().trim().max(120).nullable(),
    comparable: foundComparableSchema,
  })).min(1, "Elige al menos un comparable.").max(SEARCH_LIMIT_MAX),
});

export type AddFoundComparablesPayload = z.infer<typeof addFoundComparablesSchema>;
