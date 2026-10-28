import { z } from "zod";
import { SURFACE_POWERS } from "../engine/config";
import { MAX_REGRESSION_VARIABLES } from "../engine/regression";
import { capturedFormulasSchema } from "./captured-formulas";
import { CURRENCIES, DATA_VERIFIED, OPERATION_TYPES, UNIT_BASES, URBAN_PROXIMITIES } from "./comparable-card";
import { REVIEW_CHECKS, REVIEW_STATUSES } from "./comparable-review";
import { MAX_SCALE_LEVELS, REGRESSION_DEPENDENTS } from "./market-regression";
import {
  BUILTIN_CHARACTERISTICS,
  COMPARABLE_TYPES,
  CUSTOM_CHARACTERISTIC_KEY,
  CUSTOM_FACTOR_KEY,
  FACTOR_TYPES,
  HOMOLOGATION_BASES,
  MAX_FACTOR_SLOTS,
  MAX_OFFER_OPTIONS,
  OFFER_LEVELS,
  factorKey,
} from "./market-types";

const text = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
const positive = z.number().finite().positive().max(1e12).nullable();

/** The appraiser picks the power n among 3, 6, 9 and 12. */
export const surfacePowerSchema = z.number().refine(
  (value) => (SURFACE_POWERS as readonly number[]).includes(value),
  "La potencia n debe ser 3, 6, 9 o 12.",
);
/** Excel ROUND digits: 2 keeps cents, -4 rounds to tens of thousands; null is no rounding. */
export const roundingSchema = z.number().int().min(-6).max(2).nullable();

const customFactorKey = z.string().regex(CUSTOM_FACTOR_KEY, "Factor personalizado inválido.").nullable().optional();

const factorSchema = z.object({
  type: z.enum(FACTOR_TYPES),
  key: customFactorKey,
  value: z.number().finite().min(0).max(100).nullable(),
  subjectRating: z.number().finite().positive().max(1000).nullable(),
  comparableRating: z.number().finite().positive().max(1000).nullable(),
  justification: text(1000),
});

const characteristicKey = z.string().refine(
  (key) => (BUILTIN_CHARACTERISTICS as readonly string[]).includes(key) || CUSTOM_CHARACTERISTIC_KEY.test(key),
  "Característica inválida.",
);
/** Values of the characteristics by field key; empty ones are not kept. */
const characteristicValues = z.record(characteristicKey, z.string().trim().max(300))
  .transform((values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value)))
  .optional();

/** The longest listing "Pegar anuncio" reads (LISTING_TEXT_MAX); not imported, the AI module imports this one. */
const LISTING_TEXT_MAX = 12_000;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable();
const addressSchema = z.object({
  state: text(80).optional(),
  municipality: text(120).optional(),
  postalCode: z.string().trim().regex(/^(\d{5})?$/, "El código postal lleva 5 dígitos.").nullable().transform((value) => value || null).optional(),
  neighborhood: text(120).optional(),
  subdivision: text(120).optional(),
  street: text(180).optional(),
  number: text(40).optional(),
});

const count = (label: string) => z.number(`${label} es un número.`).int(`${label} es un número entero.`).min(0, `${label} no puede ser negativo.`).max(10_000).nullable().optional();

/** What the master workbook captures of the property beyond the homologation fields; the calculation does not read it. */
const propertyDetailsSchema = z.object({
  age: z.number("La edad es un número.").finite().min(0, "La edad no puede ser negativa.").max(1000).nullable().optional(),
  levels: count("Niveles"),
  parking: count("Estacionamientos"),
  paving: text(80).optional(),
  blockPosition: text(80).optional(),
  unitBasis: z.enum(UNIT_BASES, "Base del unitario inválida.").nullable().optional(),
});

/** What the master workbook captures of the listing: its id in the portal, its currency, its evidence and its verification. */
const listingDetailsSchema = z.object({
  publicationId: text(120).optional(),
  currency: z.enum(CURRENCIES, "La moneda es MXN o USD.").nullable().optional(),
  photoUrl: z.string().trim().max(1000).nullable()
    .refine((value) => !value || /^https?:\/\//i.test(value), "La URL de la fotografía debe empezar con http:// o https://.")
    .transform((value) => value || null).optional(),
  priceChangedOn: day.optional(),
  dataOrigin: text(80).optional(),
  extractionConfidence: text(40).optional(),
  dataVerified: z.enum(DATA_VERIFIED, "Datos verificados es Sí, No o Parcialmente.").nullable().optional(),
});

export const comparableInputSchema = z.object({
  location: z.string().trim().min(1, "Captura la ubicación del comparable.").max(500),
  area: positive,
  price: positive,
  landUse: text(180),
  landUseKey: text(60).optional(),
  shape: text(80),
  zone: text(80),
  frontCount: z.number().int("El número de frentes debe ser un entero.").min(1, "El número de frentes debe ser 1 o más.").max(20).nullable().optional(),
  frontage: positive,
  depth: positive,
  topography: text(80),
  services: text(180),
  conservation: text(80).optional(),
  quality: text(80).optional(),
  notes: text(1000),
  extra: characteristicValues,
  characteristicsText: text(2000).optional(),
  factorJustification: text(2000).optional(),
  regressionExcluded: z.boolean().optional(),
  sourceName: text(180),
  contactName: text(180),
  contactPhone: text(40),
  url: z.string().trim().max(1000).nullable()
    .refine((value) => !value || /^https?:\/\//i.test(value), "La liga debe empezar con http:// o https://.")
    .transform((value) => value || null),
  offerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable(),
  // Fields of the card and its evidence; a client of before leaves them out and they stay as stored.
  consultedOn: day.optional(),
  validUntil: day.optional(),
  validityMonths: z.number("La vigencia es un número de meses.").int("La vigencia va en meses completos.").min(1, "La vigencia va de 1 a 12 meses.").max(12, "La vigencia va de 1 a 12 meses.").nullable().optional(),
  listingText: text(LISTING_TEXT_MAX).optional(),
  address: addressSchema.nullable().optional(),
  urbanProximity: z.enum(URBAN_PROXIMITIES, "Proximidad urbana inválida.").nullable().optional(),
  operationType: z.enum(OPERATION_TYPES, "Tipo de operación inválido.").nullable().optional(),
  latitude: z.number("La latitud debe ser un número.").finite().min(-90, "La latitud va de -90 a 90.").max(90, "La latitud va de -90 a 90.").nullable().optional(),
  longitude: z.number("La longitud debe ser un número.").finite().min(-180, "La longitud va de -180 a 180.").max(180, "La longitud va de -180 a 180.").nullable().optional(),
  // Data of a built comparable for the search of the firm's base; the calculation does not read them.
  landArea: positive.optional(),
  bedrooms: z.number("Las recámaras son un número.").int("Las recámaras son un número entero.").min(0, "Las recámaras no pueden ser negativas.").max(500).nullable().optional(),
  bathrooms: z.number("Los baños son un número.").finite().min(0, "Los baños no pueden ser negativos.").max(500)
    .refine((value) => Number.isInteger(value * 2), "Los baños van en enteros o medios: 2 o 2.5.").nullable().optional(),
  constructionType: text(120).optional(),
  // The master workbook's other columns (comparable-master); a client of before leaves them out and they stay as stored.
  propertyDetails: propertyDetailsSchema.nullable().optional(),
  listingDetails: listingDetailsSchema.nullable().optional(),
  // Built-in factors once each, plus the firm's own: at most the six of the homologation and as many own ones.
  factors: z.array(factorSchema).max(FACTOR_TYPES.length + MAX_FACTOR_SLOTS)
    .refine((factors) => new Set(factors.map(factorKey)).size === factors.length, "Cada tipo de factor va una sola vez."),
  formulas: capturedFormulasSchema.optional(),
});

/** A qualitative variable: each written value and the number it takes, once each. */
const regressionScaleSchema = z.array(z.object({
  label: z.string().trim().min(1, "Cada nivel de la escala necesita su texto.").max(80),
  value: z.number().finite().min(-1e6).max(1e6),
}))
  .max(MAX_SCALE_LEVELS, `Una escala lleva hasta ${MAX_SCALE_LEVELS} niveles.`)
  .refine((levels) => new Set(levels.map((level) => level.label.toLowerCase())).size === levels.length, "Cada nivel de la escala va una sola vez.")
  .nullable()
  .optional();

const regressionSchema = z.object({
  method: z.literal("REGRESION_LINEAL"),
  enabled: z.boolean(),
  dependent: z.enum(REGRESSION_DEPENDENTS),
  variables: z.array(z.object({ key: characteristicKey.refine((key) => key !== "price" && key !== "notes", "El precio y las observaciones no son variables de la regresión."), scale: regressionScaleSchema }))
    .max(MAX_REGRESSION_VARIABLES, `La regresión lleva hasta ${MAX_REGRESSION_VARIABLES} variables.`)
    .refine((variables) => new Set(variables.map((variable) => variable.key)).size === variables.length, "Cada variable va una sola vez."),
  showInDictamen: z.boolean(),
});

export type ComparableInputPayload = z.infer<typeof comparableInputSchema>;

export const marketSettingsSchema = z.object({
  comparableType: z.enum(COMPARABLE_TYPES),
  subjectArea: positive,
  baseArea: positive,
  surfacePower: surfacePowerSchema,
  adoptedUnitValue: positive,
  justification: text(2000),
  additionalAmount: z.number().finite().min(0).max(1e12),
  additionalAmountInCalculation: z.boolean().optional(),
  showAdditionalAmount: z.boolean().optional(),
  rounding: roundingSchema.optional(),
  // Captures of the appraiser's format; clients that do not send them leave them as stored.
  offerLevel: z.enum(OFFER_LEVELS).nullable().optional(),
  offerLabels: z.array(z.string().trim().min(1, "Cada opción del nivel de oferta necesita un nombre.").max(40))
    .max(MAX_OFFER_OPTIONS, `El nivel de oferta lleva hasta ${MAX_OFFER_OPTIONS} opciones.`).nullable().optional(),
  offerMark: z.number().int().min(0).max(MAX_OFFER_OPTIONS - 1).nullable().optional(),
  offerIntro: text(300).optional(),
  homologationBasis: z.enum(HOMOLOGATION_BASES).nullable().optional(),
  typicalFrontage: positive.optional(),
  typicalDepth: positive.optional(),
  characteristicFields: z.array(z.object({ key: characteristicKey, label: z.string().trim().min(1, "Cada característica necesita un nombre.").max(60) }))
    .max(40)
    .refine((fields) => new Set(fields.map((field) => field.key)).size === fields.length, "Cada característica va una sola vez.")
    .nullable()
    .optional(),
  subjectCharacteristics: characteristicValues,
  showFactorJustification: z.boolean().optional(),
  regression: regressionSchema.nullable().optional(),
  showHomologationNote: z.boolean().optional(),
  homologationNote: text(500).optional(),
  factorSlots: z.array(z.object({
    type: z.enum(FACTOR_TYPES),
    label: z.string().trim().min(1).max(60),
    subjectOption: z.string().trim().max(60).nullable().optional(),
    key: customFactorKey,
  }))
    .min(1)
    .max(MAX_FACTOR_SLOTS, `La homologación lleva hasta ${MAX_FACTOR_SLOTS} factores (sin contar el FRe).`)
    .refine((slots) => new Set(slots.map(factorKey)).size === slots.length, "Cada factor va una sola vez.")
    .refine((slots) => slots.every((slot) => !slot.key || slot.type === "OTRO"), "Un factor del despacho es de tipo «Otro».")
    .refine((slots) => slots.some((slot) => slot.type === "SUPERFICIE"), "La homologación necesita el factor de superficie."),
  formulas: capturedFormulasSchema.optional(),
}).refine((settings) => settings.offerMark === null || settings.offerMark === undefined || !settings.offerLabels?.length
  || settings.offerMark < settings.offerLabels.length, { path: ["offerMark"], message: "La marca del nivel de oferta no es una de sus opciones." });

export type MarketSettingsPayload = z.infer<typeof marketSettingsSchema>;

export const comparableTypeSchema = z.enum(COMPARABLE_TYPES);

/** The review of a comparable in a valuation: it changes no calculation. */
export const comparableReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES, "Estado de revisión inválido."),
  checks: z.partialRecord(z.enum(REVIEW_CHECKS), z.boolean()).default({}),
  notes: text(2000).default(null),
});

export type ComparableReviewPayload = z.infer<typeof comparableReviewSchema>;

/** What the duplicate check reads of a comparable being captured. */
export const duplicateProbeSchema = z.object({
  url: z.string().trim().max(1000).nullable().default(null),
  location: z.string().trim().max(500).default(""),
  address: addressSchema.nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().default(null),
  price: z.number().finite().positive().max(1e12).nullable().default(null),
  area: z.number().finite().positive().max(1e12).nullable().default(null),
  sourceName: z.string().trim().max(180).nullable().optional(),
  publicationId: z.string().trim().max(120).nullable().optional(),
});

/** "Usar el existente": the comparable of the firm's base to bring. */
export const reuseComparableSchema = z.object({ comparableId: z.uuid("Comparable inválido.") });
