/**
 * A firm's own homologation factor catalog, if it keeps one: for each factor,
 * the ratings its appraisers pick from (label and value), and the limits it
 * wants flagged. A factor is subject rating / comparable rating; negotiation
 * is a direct factor.
 *
 * Valuaxis proposes no values and no limits: which factor applies is the
 * appraiser's judgement, and they justify it (docs/fase0/RESPUESTAS-PERITO.md,
 * answer 7). Without a catalog every factor is typed by hand.
 */
import { z } from "zod";
import { FACTOR_TYPES, type FactorType } from "./market-types";

export type FactorOption = { label: string; value: number };
export type FactorLimits = { factorMin: number; factorMax: number; resultantMin: number; resultantMax: number };
export type FactorCatalog = {
  /** Only factors with ratings; the others are captured by hand. */
  factors: Partial<Record<FactorType, FactorOption[]>>;
  /** Null: the firm flags nothing. */
  limits: FactorLimits | null;
};

/** Factors whose options are the factor itself, not a rating. */
export const DIRECT_FACTORS: ReadonlySet<FactorType> = new Set(["NEGOCIACION"]);
/** Computed by the engine; never rated. */
export const COMPUTED_FACTORS: ReadonlySet<FactorType> = new Set(["SUPERFICIE"]);

export const EMPTY_FACTOR_CATALOG: FactorCatalog = { factors: {}, limits: null };

const optionSchema = z.object({
  label: z.string().trim().min(1, "Cada calificación necesita un nombre.").max(60),
  value: z.number().finite().positive("El valor debe ser mayor que cero.").max(10),
});

export const factorCatalogSchema = z.object({
  factors: z.partialRecord(z.enum(FACTOR_TYPES), z.array(optionSchema).max(20)
    .refine((options) => new Set(options.map((option) => option.label.toLowerCase())).size === options.length, "Hay calificaciones repetidas.")),
  limits: z.object({
    factorMin: z.number().finite().positive(),
    factorMax: z.number().finite().positive(),
    resultantMin: z.number().finite().positive(),
    resultantMax: z.number().finite().positive(),
  }).refine((limits) => limits.factorMin < limits.factorMax && limits.resultantMin < limits.resultantMax, "El mínimo debe ser menor que el máximo.").nullable(),
}).transform((catalog) => ({
  ...catalog,
  factors: Object.fromEntries(Object.entries(catalog.factors)
    .filter(([type]) => !COMPUTED_FACTORS.has(type as FactorType))) as FactorCatalog["factors"],
}));

/** The firm's stored catalog, or an empty one when it has none or it is unreadable. */
export function resolveFactorCatalog(stored: unknown): FactorCatalog {
  const parsed = factorCatalogSchema.safeParse(stored);
  return parsed.success ? parsed.data : EMPTY_FACTOR_CATALOG;
}

export const optionsFor = (catalog: FactorCatalog, type: FactorType) =>
  COMPUTED_FACTORS.has(type) ? [] : catalog.factors[type] ?? [];

/**
 * The factor a pair of picks gives: subject / comparable for ratings; the
 * option's own value for a direct factor. Null while a pick is missing.
 */
export function factorFromOptions(type: FactorType, subject: FactorOption | null, comparable: FactorOption | null) {
  if (DIRECT_FACTORS.has(type)) return comparable ? { value: comparable.value, subjectRating: null, comparableRating: null } : null;
  if (!subject || !comparable) return null;
  return { value: subject.value / comparable.value, subjectRating: subject.value, comparableRating: comparable.value };
}

/** Written into the factor's justification, so the dictamen and the trace say why. */
export function optionJustification(type: FactorType, label: string, subject: FactorOption | null, comparable: FactorOption | null) {
  if (DIRECT_FACTORS.has(type)) return comparable ? `${label}: ${comparable.label} (${comparable.value})` : null;
  if (!subject || !comparable) return null;
  return `${label}: sujeto ${subject.label} (${subject.value}) / comparable ${comparable.label} (${comparable.value})`;
}

/** Which option a stored factor came from, to show it selected again. */
export function matchOption(options: FactorOption[], value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return options.find((option) => Math.abs(option.value - value) < 1e-9) ?? null;
}

export type FactorWarning = { kind: "factor" | "resultante"; label: string; value: number };

/** Factors and the resultant factor outside the limits the firm set for itself, if any. */
export function factorWarnings(
  factors: Array<{ label: string; value: number }>,
  resultant: number | null,
  limits: FactorLimits | null,
): FactorWarning[] {
  if (!limits) return [];
  const warnings: FactorWarning[] = factors
    .filter((factor) => factor.value < limits.factorMin - 1e-9 || factor.value > limits.factorMax + 1e-9)
    .map((factor) => ({ kind: "factor", label: factor.label, value: factor.value }));
  if (resultant !== null && (resultant < limits.resultantMin - 1e-9 || resultant > limits.resultantMax + 1e-9)) {
    warnings.push({ kind: "resultante", label: "Factor resultante", value: resultant });
  }
  return warnings;
}
