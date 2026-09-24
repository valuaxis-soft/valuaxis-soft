import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const amount = z.number().finite().min(0).max(1e12).nullable();
const factor = z.number().finite().min(0).max(10);
const fraction = z.number().finite().min(0).max(1);

const uniqueRefs = (rows: { ref: string }[]) => new Set(rows.map((row) => row.ref.toLowerCase())).size === rows.length;

export const costInputSchema = z.object({
  land: z.object({
    subjectArea: amount,
    referenceArea: amount,
    unitValue: amount,
    surfacePower: z.number().finite().positive().max(20),
    factors: z.object({
      negotiation: factor,
      location: factor,
      services: factor,
      classification: factor,
      topography: factor,
    }),
  }),
  constructions: z.array(z.object({
    ref: text(20).min(1, "Cada construcción necesita su referencia."),
    description: text(500),
    classification: text(120),
    quality: text(120),
    area: amount,
    age: amount,
    usefulLife: amount,
    conservation: factor.nullable(),
    otherFactor: factor,
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
    maintenance: text(120),
    otherFactor: factor,
    completion: fraction,
    undivided: fraction,
    unitReplacementCost: amount,
  })).max(60).refine(uniqueRefs, "Las referencias de las instalaciones no se pueden repetir."),
  indirects: z.array(z.object({
    concept: text(180),
    percentage: z.number().finite().min(0).max(1).nullable(),
    base: amount,
  })).max(20),
});

export type CostInputPayload = z.infer<typeof costInputSchema>;
