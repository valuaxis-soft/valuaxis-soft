import { z } from "zod";
import { capturedFormulasSchema } from "./captured-formulas";
import { SUMMARY_SOURCES } from "./conclusion-types";
import { roundingSchema } from "./market-schemas";
import { INTANGIBLE_REFUSAL_MESSAGE, mentionsIntangibles } from "../services/intangible-labels";

const approach = z.enum(["costos", "mercado", "ingresos"]);
/** The name of a value of the resumen never concludes on intangibles (24 Nov 2026). */
const summaryRow = z.object({
  source: z.enum(SUMMARY_SOURCES),
  label: z.string().trim().max(200).refine((label) => !mentionsIntangibles(label), INTANGIBLE_REFUSAL_MESSAGE),
});

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
  /** Absent keeps what is stored. */
  concludedNameFromRow: z.boolean().optional(),
  valueChart: z.boolean().optional(),
});

export type ConclusionSettingsPayload = z.infer<typeof conclusionSettingsSchema>;
