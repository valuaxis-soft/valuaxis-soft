/**
 * Homologation factor catalog: for each factor, the ratings an appraiser
 * picks from (label and value), and the limits a factor and the resultant
 * factor should stay within. A factor is subject rating / comparable rating,
 * as in the firm's books (=1/1.15). Negotiation is a direct factor.
 *
 * The defaults come from the values the firm's workbooks use (Fase 0,
 * docs/fase0/metodologia/02-mercado-homologacion.md §4), completed with the
 * usual INDAABIN/SHF gradations; each firm edits its own in Datos del despacho.
 */
import { z } from "zod";
import { FACTOR_TYPES, type FactorType } from "./market-types";

export type FactorOption = { label: string; value: number };
export type FactorLimits = { factorMin: number; factorMax: number; resultantMin: number; resultantMax: number };
export type FactorCatalog = {
  /** Only factors with ratings; the others are captured by hand. */
  factors: Partial<Record<FactorType, FactorOption[]>>;
  limits: FactorLimits;
};

/** Factors whose options are the factor itself, not a rating. */
export const DIRECT_FACTORS: ReadonlySet<FactorType> = new Set(["NEGOCIACION"]);
/** Computed by the engine; never rated. */
export const COMPUTED_FACTORS: ReadonlySet<FactorType> = new Set(["SUPERFICIE"]);

export const DEFAULT_FACTOR_CATALOG: FactorCatalog = {
  factors: {
    NEGOCIACION: [
      { label: "Precio de cierre", value: 1 },
      { label: "Oferta típica", value: 0.95 },
      { label: "Oferta alta", value: 0.9 },
    ],
    UBICACION: [
      { label: "Interior o medianero", value: 1 },
      { label: "Esquina", value: 1.1 },
      { label: "Dos frentes o cabecera", value: 1.15 },
    ],
    ZONA: [
      { label: "Inferior", value: 0.9 },
      { label: "Ligeramente inferior", value: 0.95 },
      { label: "Similar", value: 1 },
      { label: "Superior", value: 1.05 },
      { label: "Muy superior", value: 1.1 },
    ],
    FRENTE: [
      { label: "Menor al típico", value: 0.95 },
      { label: "Típico", value: 1 },
      { label: "Mayor al típico", value: 1.1 },
      { label: "Mucho mayor al típico", value: 1.15 },
    ],
    USO_SUELO: [
      { label: "Habitacional", value: 1 },
      { label: "Mixto", value: 1.05 },
      { label: "Comercial", value: 1.1 },
    ],
    SERVICIOS: [
      { label: "Completos", value: 1 },
      { label: "Incompletos", value: 0.95 },
      { label: "Sin servicios", value: 0.85 },
    ],
    TOPOGRAFIA: [
      { label: "Plana", value: 1 },
      { label: "Pendiente ligera", value: 0.95 },
      { label: "Lomerío suave", value: 0.85 },
      { label: "Accidentada", value: 0.75 },
    ],
    FORMA: [
      { label: "Regular", value: 1 },
      { label: "Irregular", value: 0.95 },
      { label: "Muy irregular", value: 0.9 },
    ],
    CALIDAD: [
      { label: "Económica", value: 0.9 },
      { label: "Media", value: 1 },
      { label: "Buena", value: 1.05 },
      { label: "Lujo", value: 1.15 },
    ],
    // The MEH workbook's 1–10 conservation table, the only numeric table in the books.
    CONSERVACION: [
      { label: "Nuevo", value: 1 },
      { label: "Excelente", value: 0.99 },
      { label: "Muy bueno", value: 0.975 },
      { label: "Bueno", value: 0.92 },
      { label: "Regular", value: 0.82 },
      { label: "Deficiente", value: 0.66 },
      { label: "Malo", value: 0.47 },
    ],
  },
  limits: { factorMin: 0.8, factorMax: 1.2, resultantMin: 0.65, resultantMax: 1.35 },
};

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
  }).refine((limits) => limits.factorMin < limits.factorMax && limits.resultantMin < limits.resultantMax, "El mínimo debe ser menor que el máximo."),
}).transform((catalog) => ({
  ...catalog,
  factors: Object.fromEntries(Object.entries(catalog.factors)
    .filter(([type]) => !COMPUTED_FACTORS.has(type as FactorType))) as FactorCatalog["factors"],
}));

/** The firm's stored catalog, or the defaults when it has none or it is unreadable. */
export function resolveFactorCatalog(stored: unknown): FactorCatalog {
  const parsed = factorCatalogSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_FACTOR_CATALOG;
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

/** Factors and the resultant factor outside the firm's limits. */
export function factorWarnings(
  factors: Array<{ label: string; value: number }>,
  resultant: number | null,
  limits: FactorLimits,
): FactorWarning[] {
  const warnings: FactorWarning[] = factors
    .filter((factor) => factor.value < limits.factorMin - 1e-9 || factor.value > limits.factorMax + 1e-9)
    .map((factor) => ({ kind: "factor", label: factor.label, value: factor.value }));
  if (resultant !== null && (resultant < limits.resultantMin - 1e-9 || resultant > limits.resultantMax + 1e-9)) {
    warnings.push({ kind: "resultante", label: "Factor resultante", value: resultant });
  }
  return warnings;
}
