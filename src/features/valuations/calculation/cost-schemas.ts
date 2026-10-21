import { z } from "zod";
import { isConservationRating } from "./cost-types";
import { roundingSchema, surfacePowerSchema } from "./market-schemas";

const text = (max: number) => z.string().trim().max(max);
const amount = z.number().finite().min(0).max(1e12).nullable();
const factor = z.number().finite().min(0).max(10);
const fraction = z.number().finite().min(0).max(1);
/** A factor with an Excel formula: empty (or missing, in older clients) takes the formula. */
const formulaFactor = factor.nullable().default(null);
/** Calificación of the conservation, as the sheet «ROSS HEIDECKE» rates it; missing in older clients. */
const conservationRating = z.number().refine(isConservationRating, "La calificación de conservación va de 2 a 10.").nullable().default(null);

const uniqueRefs = (rows: { ref: string }[]) => new Set(rows.map((row) => row.ref.toLowerCase())).size === rows.length;

const constructionRef = text(20).min(1, "Cada construcción necesita su referencia.");

/** The construction types of the construction section: the single capture of their surface, age and useful life. */
export const constructionTypesSchema = z.object({
  types: z.array(z.object({
    ref: constructionRef,
    description: text(500),
    classification: text(120),
    quality: text(120),
    area: amount,
    age: amount,
    usefulLife: amount,
  })).max(30).refine(uniqueRefs, "Las referencias de los tipos de construcción no se pueden repetir."),
});

export type ConstructionTypesPayload = z.infer<typeof constructionTypesSchema>;

export const costInputSchema = z.object({
  land: z.object({
    subjectArea: amount,
    referenceArea: amount,
    unitValue: amount,
    surfacePower: surfacePowerSchema,
    factors: z.object({
      negotiation: factor,
      location: factor,
      services: factor,
      classification: factor,
      topography: factor,
    }),
    surfaceFactor: formulaFactor,
    resultantFactor: formulaFactor,
  }),
  // The type's data is optional: it belongs to the construction section, and only creates a missing type.
  constructions: z.array(z.object({
    ref: constructionRef,
    description: text(500).optional(),
    classification: text(120).optional(),
    quality: text(120).optional(),
    area: amount.optional(),
    age: amount.optional(),
    usefulLife: amount.optional(),
    conservation: factor.nullable(),
    conservationRating,
    ageFactor: formulaFactor,
    otherFactor: factor,
    resultantFactor: formulaFactor,
    completion: fraction,
    undivided: fraction,
    unitReplacementCost: amount,
  })).max(30).refine(uniqueRefs, "Las referencias de las construcciones no se pueden repetir."),
  installations: z.array(z.object({
    ref: text(20).min(1, "Cada instalación necesita su referencia."),
    description: text(500).min(1, "Describe cada instalación especial."),
    share: z.enum(["P", "C"]),
    unit: text(30),
    quantity: amount,
    age: amount,
    usefulLife: amount,
    conservation: factor.nullable(),
    conservationRating,
    maintenance: text(120),
    ageFactor: formulaFactor,
    otherFactor: factor,
    resultantFactor: formulaFactor,
    completion: fraction,
    undivided: fraction,
    unitReplacementCost: amount,
  })).max(60).refine(uniqueRefs, "Las referencias de las instalaciones no se pueden repetir."),
  indirects: z.array(z.object({
    concept: text(180),
    percentage: z.number().finite().min(0).max(1).nullable(),
    base: amount,
  })).max(20),
  rounding: z.object({ land: roundingSchema, constructions: roundingSchema, installations: roundingSchema, physicalValue: roundingSchema }).optional(),
});

/** What the service takes: the parsed body, or a capture of an older client without the formula factors. */
export type CostInputPayload = z.input<typeof costInputSchema>;
