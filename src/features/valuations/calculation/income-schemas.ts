import { z } from "zod";
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES } from "../engine/income";

export const incomeInputSchema = z.object({
  rentableUnits: z.array(z.object({
    description: z.string().trim().max(180),
    area: z.number().finite().min(0).max(1e9).nullable(),
    unitRent: z.number().finite().min(0).max(1e9).nullable(),
  })).min(1).max(20),
  deductions: z.array(z.object({
    concept: z.string().trim().min(1, "Cada deducción necesita su concepto.").max(180),
    rate: z.number().finite().min(0).max(1).nullable(),
  })).max(20),
  ratingColumns: z.array(z.number().int().min(0).max(RATE_TABLE_RATES.length - 1).nullable()).length(RATE_TABLE_CRITERIA.length),
  appliedRate: z.number().finite().positive().max(1).nullable(),
});

export type IncomeInputPayload = z.infer<typeof incomeInputSchema>;
