import { z } from "zod";
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES } from "../engine/income";
import { capturedFormulasSchema } from "./captured-formulas";

const optionalNumber = (max: number) => z.number().finite().min(0).max(max).nullable();

export const incomeInputSchema = z.object({
  method: z.enum(["tabla", "anualidad", "mercado"]),
  annuity: z.object({
    vacancyDays: optionalNumber(3650),
    contractYears: optionalNumber(100),
    otherMonthlyIncome: optionalNumber(1e12),
    tiie: optionalNumber(1),
    inflation: z.number().finite().min(-1).max(1).nullable(),
    remainingLifeYears: optionalNumber(200),
    option: z.union([z.literal(1), z.literal(2)]),
  }),
  marketRate: z.object({
    negotiation: optionalNumber(1),
    vacancy: optionalNumber(1),
    salePrices: z.record(z.string().max(12), z.number().finite().min(0).max(1e12).nullable())
      .refine((prices) => Object.keys(prices).length <= 50, "Demasiados comparables."),
  }),
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
  rateFromMarket: z.number().finite().positive().max(1).nullable().default(null),
  weightedRate: z.number().finite().positive().max(1).nullable().default(null),
  // Excel ROUND digits: 2 (cents) to -5 (hundreds of thousands); null, not rounded.
  rounding: z.number().int().min(-5).max(2).nullable().default(null),
  formulas: capturedFormulasSchema.optional(),
});

/** What a save sends; the rates of «Tasa a utilizar» and the rounding may be left out (clients of before), and are then empty. */
export type IncomeInputPayload = z.input<typeof incomeInputSchema>;
