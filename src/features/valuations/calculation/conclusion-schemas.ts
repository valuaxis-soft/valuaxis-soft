import { z } from "zod";

const approach = z.enum(["costos", "mercado", "ingresos"]);

export const conclusionSettingsSchema = z.object({
  method: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("single"), approach }),
    z.object({ kind: z.literal("weighted"), weights: z.partialRecord(approach, z.number().finite().min(0).max(1)) }),
  ]),
  justification: z.string().trim().max(4000).nullable().transform((value) => value || null),
});

export type ConclusionSettingsPayload = z.infer<typeof conclusionSettingsSchema>;
