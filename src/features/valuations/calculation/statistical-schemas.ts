import { z } from "zod";

import { BUILTIN_CHARACTERISTICS, COMPARABLE_TYPES, CUSTOM_CHARACTERISTIC_KEY } from "./market-types";
import {
  MAX_SCALE_LEVELS,
  MAX_STATISTICAL_COMPARABLES,
  MAX_STATISTICAL_FIELDS,
  MAX_STATISTICAL_VARIABLES,
  SCALE_MODES,
  STATISTICAL_CODINGS,
  STATISTICAL_DEPENDENTS,
  normalizedLevel,
} from "./statistical-types";

/** A field of the capture: one of the market's characteristics, or one the appraiser adds. Never the price, which is Y. */
const fieldKey = z.string().refine(
  (key) => key !== "price" && key !== "notes" && ((BUILTIN_CHARACTERISTICS as readonly string[]).includes(key) || CUSTOM_CHARACTERISTIC_KEY.test(key)),
  "Característica inválida.",
);
const values = z.record(fieldKey, z.string().trim().max(120))
  .transform((record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value)));
const amount = z.number().finite().positive().max(1e12).nullable();

const scaleSchema = z.array(z.object({
  label: z.string().trim().min(1, "Cada nivel de la escala necesita su nombre.").max(80),
  value: z.number().finite().min(-1e6).max(1e6),
}))
  .max(MAX_SCALE_LEVELS, `Una escala lleva hasta ${MAX_SCALE_LEVELS} niveles.`)
  .refine((levels) => new Set(levels.map((level) => normalizedLevel(level.label))).size === levels.length, "Cada nivel de la escala va una sola vez (sin importar mayúsculas ni espacios).")
  .nullable()
  .optional();

const methodSchema = z.object({
  enabled: z.boolean(),
  showInDictamen: z.boolean(),
  title: z.string().trim().max(160).nullable().optional().transform((value) => value || null),
});

export const statisticalInputSchema = z.object({
  settings: z.object({
    comparableType: z.enum(COMPARABLE_TYPES),
    fields: z.array(z.object({ key: fieldKey, label: z.string().trim().min(1, "Cada característica necesita un nombre.").max(60) }))
      .min(1)
      .max(MAX_STATISTICAL_FIELDS, `Se capturan hasta ${MAX_STATISTICAL_FIELDS} características.`)
      .refine((fields) => fields.some((field) => field.key === "area"), "La superficie no se puede quitar: el valor unitario la necesita.")
      .refine((fields) => new Set(fields.map((field) => field.key)).size === fields.length, "Cada característica va una sola vez."),
    subject: values,
    dependent: z.enum(STATISTICAL_DEPENDENTS),
    variables: z.array(z.object({
      key: fieldKey,
      coding: z.enum(STATISTICAL_CODINGS),
      base: z.number().finite().min(-1e9).max(1e9).nullable().optional(),
      scaleMode: z.enum(SCALE_MODES).nullable().optional(),
      scale: scaleSchema,
    }))
      .max(MAX_STATISTICAL_VARIABLES, `Se usan hasta ${MAX_STATISTICAL_VARIABLES} criterios.`)
      .refine((variables) => new Set(variables.map((variable) => variable.key)).size === variables.length, "Cada criterio va una sola vez."),
    regression: methodSchema.extend({ showResidual: z.boolean().optional() }),
    goal: methodSchema,
    showComparison: z.boolean(),
  }),
  comparables: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    reference: z.number().int().min(1).max(MAX_STATISTICAL_COMPARABLES),
    price: amount,
    values,
    excluded: z.boolean().optional(),
    marketComparableId: z.string().max(80).nullable().optional(),
    sourceKey: z.string().max(200).nullable().optional(),
  }))
    .max(MAX_STATISTICAL_COMPARABLES, `Se capturan hasta ${MAX_STATISTICAL_COMPARABLES} comparables.`)
    .refine((comparables) => new Set(comparables.map((comparable) => comparable.id)).size === comparables.length, "Cada comparable va una sola vez."),
});

export type StatisticalInputPayload = z.infer<typeof statisticalInputSchema>;
