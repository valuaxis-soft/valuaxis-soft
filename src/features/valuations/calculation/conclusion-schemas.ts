import { z } from "zod";
import { capturedFormulasSchema } from "./captured-formulas";
import { SUMMARY_SOURCES } from "./conclusion-types";
import { roundingSchema } from "./market-schemas";

const approach = z.enum(["costos", "mercado", "ingresos"]);
const summaryRow = z.object({ source: z.enum(SUMMARY_SOURCES), label: z.string().trim().max(200) });

export const conclusionSettingsSchema = z.object({
  method: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("single"), approach }),
    z.object({ kind: z.literal("weighted"), weights: z.partialRecord(approach, z.number().finite().min(0).max(1)) }),
  ]),
  justification: z.string().trim().max(4000).nullable().transform((value) => value || null),
  rounding: roundingSchema.optional(),
  formulas: capturedFormulasSchema.optional(),
  /** Absent keeps the resumen as stored; an empty list lists the approaches as always. */
  summaryRows: z.array(summaryRow).max(SUMMARY_SOURCES.length).optional(),
});

export type ConclusionSettingsPayload = z.infer<typeof conclusionSettingsSchema>;
