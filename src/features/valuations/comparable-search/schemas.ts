import { z } from "zod";

import { comparableInputSchema } from "../calculation/market-schemas";
import { COMPARABLE_TYPES, isLandComparableType, isRentComparableType, type ComparableType } from "../calculation/market-types";
import { SEARCH_TEXT_MIN, searchText } from "./normalize";
import type { ComparableSearchFilters, ComparableSearchQuery } from "./types";

export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 50;

const empty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && !value.trim());
/** A bound of a range as the query string carries it; empty leaves that side open. */
const bound = z.preprocess(
  (value) => (empty(value) ? null : Number(value)),
  z.number("Debe ser un número.").finite("Debe ser un número.").positive("Debe ser mayor que cero.").max(1e12).nullable(),
);

/** A text filter of the query string; empty does not filter. */
const place = (max: number) => z.preprocess((value) => (empty(value) ? undefined : value), z.string().trim().max(max, "Un filtro es demasiado largo.").optional());
const searchDay = z.preprocess((value) => (empty(value) ? undefined : value), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de consulta inválida.").optional());

/** "Tipo de inmueble" and "operación" of the form; missing, those of the market searched for. */
export const SEARCH_KINDS = ["TERRENO", "CONSTRUIDO", "TODOS"] as const;
export const SEARCH_OPERATIONS = ["VENTA", "RENTA", "TODAS"] as const;

/** The comparable types a kind and an operation cover; missing ones are those of `type`. */
export function searchedTypes(type: ComparableType, kind?: (typeof SEARCH_KINDS)[number], operation?: (typeof SEARCH_OPERATIONS)[number]) {
  const wantedKind = kind ?? (isLandComparableType(type) ? "TERRENO" : "CONSTRUIDO");
  const wantedOperation = operation ?? (isRentComparableType(type) ? "RENTA" : "VENTA");
  return COMPARABLE_TYPES.filter((item) =>
    (wantedKind === "TODOS" || (wantedKind === "TERRENO") === isLandComparableType(item))
    && (wantedOperation === "TODAS" || (wantedOperation === "RENTA") === isRentComparableType(item)));
}

const NO_TEXT = "Escribe la zona, colonia, municipio o calle que buscas, o usa un filtro.";

/**
 * The query string of the search: ?tipo=&q=&supMin=&supMax=&precioMin=&precioMax=&limite=,
 * and the filters estado=&municipio=&colonia=&cp=&inmueble=&operacion=&consultaDesde=&consultaHasta=.
 * The text may be left out when a filter is used.
 */
export const comparableSearchQuerySchema = z.object({
  tipo: z.enum(COMPARABLE_TYPES, "Tipo de comparable inválido"),
  q: z.string(NO_TEXT).trim().max(120, "La búsqueda es demasiado larga.").optional(),
  supMin: bound,
  supMax: bound,
  precioMin: bound,
  precioMax: bound,
  estado: place(80),
  municipio: place(120),
  colonia: place(120),
  cp: z.preprocess((value) => (empty(value) ? undefined : value), z.string().trim().regex(/^\d{5}$/, "El código postal lleva 5 dígitos.").optional()),
  inmueble: z.preprocess((value) => (empty(value) ? undefined : value), z.enum(SEARCH_KINDS, "Tipo de inmueble inválido.").optional()),
  operacion: z.preprocess((value) => (empty(value) ? undefined : value), z.enum(SEARCH_OPERATIONS, "Tipo de operación inválido.").optional()),
  consultaDesde: searchDay,
  consultaHasta: searchDay,
  limite: z.preprocess(
    (value) => (empty(value) ? SEARCH_LIMIT_DEFAULT : Number(value)),
    z.number().int("El límite debe ser un entero.").min(1).max(SEARCH_LIMIT_MAX, `Se devuelven hasta ${SEARCH_LIMIT_MAX} resultados.`),
  ),
})
  .superRefine((value, context) => {
    const filtered = [value.supMin, value.supMax, value.precioMin, value.precioMax].some((item) => item !== null)
      || [value.estado, value.municipio, value.colonia, value.cp, value.inmueble, value.operacion, value.consultaDesde, value.consultaHasta]
        .some((item) => item !== undefined);
    if (value.q === undefined || !value.q) {
      if (!filtered) context.addIssue({ code: "custom", path: ["q"], message: NO_TEXT });
      // Counted without punctuation: "., " is not something to look for.
    } else if (searchText(value.q).length < SEARCH_TEXT_MIN) {
      context.addIssue({ code: "custom", path: ["q"], message: `Escribe al menos ${SEARCH_TEXT_MIN} letras de la zona, colonia, municipio o calle.` });
    }
  })
  .refine((value) => value.supMin === null || value.supMax === null || value.supMin <= value.supMax,
    { path: ["supMax"], message: "La superficie máxima debe ser mayor o igual que la mínima." })
  .refine((value) => value.precioMin === null || value.precioMax === null || value.precioMin <= value.precioMax,
    { path: ["precioMax"], message: "El precio máximo debe ser mayor o igual que el mínimo." })
  .refine((value) => !value.consultaDesde || !value.consultaHasta || value.consultaDesde <= value.consultaHasta,
    { path: ["consultaHasta"], message: "La fecha de consulta final debe ser igual o posterior a la inicial." })
  .transform((value): ComparableSearchQuery => {
    const filters: ComparableSearchFilters = {
      ...(value.inmueble || value.operacion ? { types: searchedTypes(value.tipo, value.inmueble, value.operacion) } : {}),
      ...(value.estado ? { state: value.estado } : {}),
      ...(value.municipio ? { municipality: value.municipio } : {}),
      ...(value.colonia ? { neighborhood: value.colonia } : {}),
      ...(value.cp ? { postalCode: value.cp } : {}),
      ...(value.consultaDesde ? { consultedFrom: value.consultaDesde } : {}),
      ...(value.consultaHasta ? { consultedTo: value.consultaHasta } : {}),
    };
    return {
      text: value.q ?? "",
      type: value.tipo,
      areaMin: value.supMin,
      areaMax: value.supMax,
      priceMin: value.precioMin,
      priceMax: value.precioMax,
      limit: value.limite,
      ...(Object.keys(filters).length ? { filters } : {}),
    };
  });

const FILTER_PARAMS = ["estado", "municipio", "colonia", "cp", "inmueble", "operacion", "consultaDesde", "consultaHasta"] as const;

/** Reads the query from a URL; the first problem comes back in words. */
export function parseComparableSearchQuery(params: URLSearchParams):
  | { ok: true; query: ComparableSearchQuery }
  | { ok: false; error: string } {
  const parsed = comparableSearchQuerySchema.safeParse({
    tipo: params.get("tipo"), q: params.get("q") ?? undefined,
    supMin: params.get("supMin"), supMax: params.get("supMax"),
    precioMin: params.get("precioMin"), precioMax: params.get("precioMax"),
    limite: params.get("limite"),
    ...Object.fromEntries(FILTER_PARAMS.map((key) => [key, params.get(key)])),
  });
  return parsed.success ? { ok: true, query: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? "Búsqueda inválida." };
}

/** A comparable as a source returns it: the capture form's rules, without factors. */
export const foundComparableSchema = comparableInputSchema.omit({ factors: true });

/** The results the appraiser chose, sent back to become comparables. */
export const addFoundComparablesSchema = z.object({
  results: z.array(z.object({
    /** The result's id in its source, to bring its photos; a client of before does not send it. */
    id: z.string().trim().min(1).max(120).optional(),
    sourceId: z.string().trim().min(1).max(60),
    origin: z.string().trim().max(120).nullable(),
    comparable: foundComparableSchema,
  })).min(1, "Elige al menos un comparable.").max(SEARCH_LIMIT_MAX),
});

export type AddFoundComparablesPayload = z.infer<typeof addFoundComparablesSchema>;
