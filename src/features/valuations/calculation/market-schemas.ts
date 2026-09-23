import { z } from "zod";
import { COMPARABLE_TYPES, FACTOR_TYPES } from "./market-types";

const text = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
const positive = z.number().finite().positive().max(1e12).nullable();

const factorSchema = z.object({
  type: z.enum(FACTOR_TYPES),
  value: z.number().finite().min(0).max(100).nullable(),
  subjectRating: z.number().finite().positive().max(1000).nullable(),
  comparableRating: z.number().finite().positive().max(1000).nullable(),
  justification: text(1000),
});

export const comparableInputSchema = z.object({
  location: z.string().trim().min(1, "Captura la ubicación del comparable.").max(500),
  area: positive,
  price: positive,
  landUse: text(180),
  shape: text(80),
  zone: text(80),
  frontage: positive,
  depth: positive,
  topography: text(80),
  services: text(180),
  notes: text(1000),
  sourceName: text(180),
  contactName: text(180),
  contactPhone: text(40),
  url: z.string().trim().max(1000).nullable()
    .refine((value) => !value || /^https?:\/\//i.test(value), "La liga debe empezar con http:// o https://.")
    .transform((value) => value || null),
  offerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable(),
  factors: z.array(factorSchema).max(FACTOR_TYPES.length)
    .refine((factors) => new Set(factors.map((factor) => factor.type)).size === factors.length, "Cada tipo de factor va una sola vez."),
});

export type ComparableInputPayload = z.infer<typeof comparableInputSchema>;

export const marketSettingsSchema = z.object({
  comparableType: z.enum(COMPARABLE_TYPES),
  subjectArea: positive,
  baseArea: positive,
  surfacePower: z.number().finite().positive().max(20),
  adoptedUnitValue: positive,
  justification: text(2000),
  additionalAmount: z.number().finite().min(0).max(1e12),
  factorSlots: z.array(z.object({ type: z.enum(FACTOR_TYPES), label: z.string().trim().min(1).max(60) }))
    .min(1)
    .max(FACTOR_TYPES.length)
    .refine((slots) => new Set(slots.map((slot) => slot.type)).size === slots.length, "Cada factor va una sola vez.")
    .refine((slots) => slots.some((slot) => slot.type === "SUPERFICIE"), "La homologación necesita el factor de superficie."),
});

export type MarketSettingsPayload = z.infer<typeof marketSettingsSchema>;

export const comparableTypeSchema = z.enum(COMPARABLE_TYPES);
