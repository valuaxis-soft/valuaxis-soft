import { z } from "zod";
import { machineryDetailsSchema } from "./comparable-machinery";
import { SURFACE_POWERS } from "../engine/config";
import { MAX_REGRESSION_VARIABLES } from "../engine/regression";
import { capturedFormulasSchema } from "./captured-formulas";
import { CURRENCIES, DATA_VERIFIED, OPERATION_TYPES, STREET_TYPES, UNIT_BASES, URBAN_PROXIMITIES } from "./comparable-card";
import { COMPARABLE_CLASSES } from "./comparable-classes";
import { MAX_KIND_LABEL_LENGTH, isKnownKindKey } from "./comparable-kinds";
import { MAX_REVIEW_CHECKS, reviewCheckKeySchema, reviewStatusKeySchema } from "./comparable-review-checklist";
import { MAX_SCALE_LEVELS, REGRESSION_DEPENDENTS } from "./market-regression";
import { COVER_IMAGE_SCALE } from "../services/cover-image-focus";
import {
  BUILTIN_CHARACTERISTICS,
  CHARACTERISTIC_KINDS,
  COMPARABLE_TYPES,
  CUSTOM_CHARACTERISTIC_KEY,
  CUSTOM_FACTOR_KEY,
  EXTRA_STATISTIC_KEY,
  EXTRA_STATISTIC_KINDS,
  MAX_EXTRA_STATISTICS,
  FACTOR_TYPES,
  HOMOLOGATION_BASES,
  MAX_CHARACTERISTIC_FIELDS,
  MAX_COMPARABLE_ATTRIBUTES,
  MARKET_STATISTICS,
  FACTOR_LIMIT_MESSAGE,
  LEGACY_MAX_FACTOR_SLOTS,
  MAX_OFFER_OPTIONS,
  OFFER_LEVELS,
  factorKey,
  type StatisticKey,
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
/** A statistic of the box: the homologation's or one of the appraiser's. */
const statisticKeyName = z.string().refine(
  (key) => (MARKET_STATISTICS as readonly string[]).includes(key) || EXTRA_STATISTIC_KEY.test(key),
  "Estadístico inválido.",
);
const statisticKey = statisticKeyName.transform((key) => key as StatisticKey);

/** The appraiser's choice of the statistics of a box (a real estate market's, a machinery market's). */
export const printedStatisticsSchema = z.object({
  order: z.array(statisticKey).max(MARKET_STATISTICS.length + MAX_EXTRA_STATISTICS),
  hidden: z.array(statisticKey).max(MARKET_STATISTICS.length + MAX_EXTRA_STATISTICS),
  labels: z.record(statisticKeyName, z.string().trim().max(80)).optional(),
  extra: z.array(z.object({
    id: z.string().regex(EXTRA_STATISTIC_KEY, "Estadístico inválido."),
    label: z.string().trim().min(1, "Cada estadístico necesita un nombre.").max(80),
    kind: z.enum(EXTRA_STATISTIC_KINDS),
    formula: z.string().trim().max(300).nullable().optional(),
  })).max(MAX_EXTRA_STATISTICS, `Hasta ${MAX_EXTRA_STATISTICS} estadísticos propios.`).optional(),
});

/** The options of «Nivel de oferta observada», as the appraiser names them. */
export const offerLabelsSchema = z.array(z.string().trim().min(1, "Cada opción del nivel de oferta necesita un nombre.").max(40))
  .max(MAX_OFFER_OPTIONS, `El nivel de oferta lleva hasta ${MAX_OFFER_OPTIONS} opciones.`);
export const offerMarkSchema = z.number().int().min(0).max(MAX_OFFER_OPTIONS - 1);
/** A datum of the card, or a name of the specifications ("spec.frontage"). */
const fieldLabelKey = z.string().regex(/^(spec\.)?[A-Za-z][A-Za-z0-9]{0,40}$/, "Dato inválido.");
/** A datum of the card shown as a column: one of the card's, or a characteristic. */
const linkedFieldKey = z.string().regex(/^([A-Za-z][A-Za-z0-9]{0,40}|custom:[a-z0-9-]{1,40})$/, "Dato inválido.");
const MAX_LINKED_COLUMNS = 12;
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
  // «Tipo de vialidad»; left out by a client that does not know it (the master workbook), the stored one stays.
  streetType: z.enum(STREET_TYPES, "Tipo de vialidad inválido.").nullable().optional(),
  // With «Otro»: which type of road it is, as written (video 7.2).
  streetTypeOther: text(60).optional(),
  street: text(180).optional(),
  number: text(40).optional(),
  // «Esquina con» (video 7.3).
  crossStreet: text(180).optional(),
});

const count = (label: string) => z.number(`${label} es un número.`).int(`${label} es un número entero.`).min(0, `${label} no puede ser negativo.`).max(10_000).nullable().optional();

/** What the master workbook captures of the property beyond the homologation fields; the calculation does not read it. */
const propertyDetailsSchema = z.object({
  // «Tipo de inmueble» / «Tipo de bien» (comparable-kinds): Valuaxis's key or the firm's, its name and its class.
  kind: z.string().trim().max(80).refine((key) => !key || isKnownKindKey(key), "Tipo de inmueble inválido.").nullable().transform((value) => value || null).optional(),
  kindLabel: text(MAX_KIND_LABEL_LENGTH).optional(),
  assetClass: z.enum(COMPARABLE_CLASSES, "La clase es Inmuebles o Maquinaria y equipo.").nullable().optional(),
  year: z.number("El año es un número.").int("El año es un número entero.").min(1800, "El año va de 1800 en adelante.").max(2200, "Año inválido.").nullable().optional(),
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
  // An offer in dollars: the amount, and the rate (pesos per dollar) with its day and source; the price is the pesos.
  priceInCurrency: z.number("El precio en dólares es un número.").finite().positive("El precio en dólares es mayor que cero.").max(1e12).nullable().optional(),
  exchangeRate: z.number("El tipo de cambio es un número.").finite().positive("El tipo de cambio es mayor que cero.").max(1e6).nullable().optional(),
  exchangeRateDate: day.optional(),
  exchangeRateSource: text(200).optional(),
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
  // Characteristics added to this comparable only; a client of before leaves them out and they stay as stored.
  attributes: z.array(z.object({
    name: z.string().trim().max(60, "El nombre de una característica lleva hasta 60 letras."),
    value: z.string().trim().max(200, "El valor de una característica lleva hasta 200 letras."),
  })).max(MAX_COMPARABLE_ATTRIBUTES, `Hasta ${MAX_COMPARABLE_ATTRIBUTES} características agregadas por comparable.`).optional(),
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
  // The machine's data of a machinery comparable; left out, they stay as stored.
  machinery: machineryDetailsSchema.nullable().optional(),
  // Built-in factors once each, plus the firm's own: at most the six of the homologation and as many own ones.
  factors: z.array(factorSchema).max(FACTOR_TYPES.length + LEGACY_MAX_FACTOR_SLOTS)
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
  offerLabels: offerLabelsSchema.nullable().optional(),
  offerMark: offerMarkSchema.nullable().optional(),
  offerIntro: text(300).optional(),
  homologationBasis: z.enum(HOMOLOGATION_BASES).nullable().optional(),
  typicalFrontage: positive.optional(),
  typicalDepth: positive.optional(),
  characteristicFields: z.array(z.object({
    key: characteristicKey,
    label: z.string().trim().min(1, "Cada característica necesita un nombre.").max(60),
    hidden: z.boolean().optional(),
    kind: z.enum(CHARACTERISTIC_KINDS).optional(),
  }))
    .max(MAX_CHARACTERISTIC_FIELDS, `Hasta ${MAX_CHARACTERISTIC_FIELDS} características por mercado.`)
    .refine((fields) => new Set(fields.map((field) => field.key)).size === fields.length, "Cada característica va una sola vez.")
    .nullable()
    .optional(),
  subjectCharacteristics: characteristicValues,
  showFactorJustification: z.boolean().optional(),
  regression: regressionSchema.nullable().optional(),
  showHomologationTable: z.boolean().optional(),
  showHomologationNote: z.boolean().optional(),
  homologationNote: text(500).optional(),
  homologate: z.boolean().optional(),
  printedStatistics: printedStatisticsSchema.nullable().optional(),
  // The names of the card's data in this market and the data shown as columns of its tables (video 8.9).
  fieldLabels: z.record(fieldLabelKey, z.string().trim().max(60)).nullable().optional(),
  linkedColumns: z.object({
    caracteristicas: z.array(linkedFieldKey).max(MAX_LINKED_COLUMNS).optional(),
    ofertas: z.array(linkedFieldKey).max(MAX_LINKED_COLUMNS).optional(),
    homologacion: z.array(linkedFieldKey).max(MAX_LINKED_COLUMNS).optional(),
  }).nullable().optional(),
  factorSlots: z.array(z.object({
    type: z.enum(FACTOR_TYPES),
    label: z.string().trim().min(1).max(60),
    subjectOption: z.string().trim().max(60).nullable().optional(),
    key: customFactorKey,
  }))
    .min(1)
    // Six for a new one; one saved with seven or eight keeps them (the service refuses adding beyond six).
    .max(LEGACY_MAX_FACTOR_SLOTS, FACTOR_LIMIT_MESSAGE)
    .refine((slots) => new Set(slots.map(factorKey)).size === slots.length, "Cada factor va una sola vez.")
    .refine((slots) => slots.every((slot) => !slot.key || slot.type === "OTRO"), "Un factor del despacho es de tipo «Otro».")
    .refine((slots) => slots.some((slot) => slot.type === "SUPERFICIE"), "La homologación necesita el factor de superficie."),
  formulas: capturedFormulasSchema.optional(),
}).refine((settings) => settings.offerMark === null || settings.offerMark === undefined || !settings.offerLabels?.length
  || settings.offerMark < settings.offerLabels.length, { path: ["offerMark"], message: "La marca del nivel de oferta no es una de sus opciones." });

export type MarketSettingsPayload = z.infer<typeof marketSettingsSchema>;

export const comparableTypeSchema = z.enum(COMPARABLE_TYPES);

/** "Deshacer" of "Quitar este mercado": the comparables it set aside. */
export const restoreMarketSchema = z.object({
  comparableType: z.enum(COMPARABLE_TYPES),
  comparableIds: z.array(z.string().trim().min(1).max(80)).max(500),
});

/** "Ordenar" of a market's comparables: every one of them, once, in the new order. */
export const reorderComparablesSchema = z.object({
  comparableType: z.enum(COMPARABLE_TYPES),
  comparableIds: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
});

/** The review of a comparable in a valuation: it changes no calculation. */
export const comparableReviewSchema = z.object({
  // A built-in state or one the firm added (V8.12).
  status: reviewStatusKeySchema,
  // The firm's checklist (built-in keys and the ones it added); the server keeps their names with the review.
  checks: z.record(reviewCheckKeySchema, z.boolean())
    .refine((checks) => Object.keys(checks).length <= MAX_REVIEW_CHECKS * 2, "Demasiadas verificaciones.")
    .default({}),
  notes: text(2000).default(null),
});

export type ComparableReviewPayload = z.infer<typeof comparableReviewSchema>;

/** Comparables a review in bulk takes at once: more than any valuation has. */
export const MAX_BULK_REVIEW = 200;

/**
 * «Revisión en lote» (V8.13): the comparables chosen, the state they all
 * take, whether every check of the list is marked, and notes for all (left
 * out, each keeps its own).
 */
export const comparableBulkReviewSchema = z.object({
  comparableIds: z.array(z.uuid("Comparable no encontrado")).min(1, "Elige al menos un comparable.").max(MAX_BULK_REVIEW, `Se revisan hasta ${MAX_BULK_REVIEW} comparables a la vez.`),
  status: reviewStatusKeySchema,
  markAll: z.boolean().default(false),
  notes: text(2000).optional(),
});

export type ComparableBulkReviewPayload = z.infer<typeof comparableBulkReviewSchema>;

/** «Encuadre» and «Zoom» of a comparable's photo; null gives back the default (whole and centered). */
export const comparablePhotoFramingSchema = z.object({
  photoId: z.string().trim().min(1).max(80),
  framing: z.object({
    focus: z.object({ x: z.number().finite().min(0).max(100), y: z.number().finite().min(0).max(100) }),
    size: z.object({ fit: z.enum(["cover", "contain"]), scale: z.number().finite().min(COVER_IMAGE_SCALE.min).max(COVER_IMAGE_SCALE.max) }),
  }).nullable(),
});

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
  // Real estate or machinery: only the same class is compared (a client of before is real estate).
  assetClass: z.enum(COMPARABLE_CLASSES).nullable().optional(),
});

/** "Usar el existente": the comparable of the firm's base to bring. */
export const reuseComparableSchema = z.object({ comparableId: z.uuid("Comparable inválido.") });
