import { z } from "zod";
import { MACHINERY_CONSERVATION } from "../engine/machinery";
import { EXTRA_FACTOR_KEY, MACHINERY_CHARACTERISTICS_MAX, LEGACY_MAX_MACHINERY_FACTORS, MACHINERY_FACTORS, MACHINERY_FACTOR_LIMIT_MESSAGE } from "./machinery-types";
import { MACHINERY_OFFER_FIELD_KEYS } from "./machinery-market-columns";
import { OFFER_LEVELS } from "./market-types";
import { capturedFormulasSchema } from "./captured-formulas";
import { offerLabelsSchema, offerMarkSchema, printedStatisticsSchema, roundingSchema } from "./market-schemas";

const text = (max: number) => z.string().trim().max(max);
const amount = z.number().finite().min(0).max(1e12).nullable();
// The messages are the appraiser's: a value out of range stops the save, and they read what to correct.
const factor = z.number().finite()
  .min(0, "Los factores no pueden ser negativos.")
  .max(10, "Un factor no puede pasar de 10.");
// Expenses are fractions of the quotation; several times its amount is a typing slip.
const rate = z.number().finite()
  .min(0, "Los gastos no pueden ser negativos.")
  .max(10, "Los gastos se escriben como fracción de la cotización, no como importe: 0.02 es 2 %.");
const years = z.number().finite()
  .min(0, "Los años no pueden ser negativos.")
  .max(1000, "Revisa los años: no pueden pasar de 1,000.")
  .nullable();
/** The rating looks its factor up in the book's table, so it is one of its rows. */
const rating = z.number().refine((value) => MACHINERY_CONSERVATION.some((row) => row.rating === value), "La calificación de conservación va de 1 a 10.").nullable();
const depreciationFactors = { conservation: factor, maintenance: factor, technological: factor, economic: factor };

const uniqueRefs = (rows: { ref: string }[]) => new Set(rows.map((row) => row.ref.toLowerCase())).size === rows.length;
// Trace keys are built from the references.
const ref = (message: string) => text(20).min(1, message).regex(/^[^.\s]+$/, "Las referencias no llevan espacios ni puntos.");

const costSchema = z.object({
  item: z.object({
    name: text(200), brand: text(120), model: text(120), year: text(20), serial: text(120), engineNumber: text(120), plate: text(60),
    other: text(300), hours: text(60), physicalState: text(120), deficiencies: text(500), attachmentsNote: text(500), notes: text(1000),
    quotationKind: text(40), supplier: text(200), contact: text(200), originCountry: text(120), quotationDate: text(60),
    quotedPrice: amount,
    exchangeRate: z.number().finite().min(0).max(1e6),
    otherFactor: factor,
    customs: rate, freight: rate, insurance: rate, engineering: rate, installation: rate, otherExpenses: rate,
    expensesNotes: text(1000),
    maintenanceKind: text(120),
    age: years,
    usefulLife: years,
    rating,
    ...depreciationFactors,
  }),
  attachments: z.array(z.object({
    ref: ref("Cada aditamento necesita su referencia."),
    description: text(300), brand: text(120), supplier: text(200), source: text(300), quotationKind: text(40),
    quotedPrice: amount,
    fees: rate, engineering: rate, installation: rate,
    age: years,
    usefulLife: years,
    ...depreciationFactors,
  })).max(40).refine(uniqueRefs, "Las referencias de los aditamentos no se pueden repetir."),
  rounding: roundingSchema,
  // Absent: the setting the system uses today (question 3, pending with the appraiser).
  conservationTwice: z.boolean().optional(),
  formulas: capturedFormulasSchema.optional(),
});

const fieldKey = z.string().refine((key) => MACHINERY_OFFER_FIELD_KEYS.includes(key), "Dato inválido.");
const linkedFields = z.array(fieldKey).max(MACHINERY_OFFER_FIELD_KEYS.length);
const factorColumnKey = z.string().refine((key) => MACHINERY_FACTORS.some((item) => item.key === key) || EXTRA_FACTOR_KEY.test(key), "Factor inválido.");

const marketSchema = z.object({
  offerLevel: z.enum(OFFER_LEVELS).nullable(),
  // Captures of the appraiser's format; clients that do not send them leave them as the defaults.
  offerLabels: offerLabelsSchema.nullable().optional(),
  offerMark: offerMarkSchema.nullable().optional(),
  offerIntro: text(300).nullable().optional(),
  factorColumns: z.array(z.object({ key: factorColumnKey, label: text(40) }))
    // Five besides the FEd for a new one; one saved with more keeps them (the service refuses adding beyond five).
    .max(LEGACY_MAX_MACHINERY_FACTORS, MACHINERY_FACTOR_LIMIT_MESSAGE)
    .refine((columns) => new Set(columns.map((column) => column.key)).size === columns.length, "Cada factor va una sola vez.")
    .nullable().optional(),
  fieldLabels: z.record(fieldKey, text(60)).nullable().optional(),
  linkedColumns: z.object({ resumen: linkedFields.optional(), contacto: linkedFields.optional(), homologacion: linkedFields.optional() }).nullable().optional(),
  printedStatistics: printedStatisticsSchema.nullable().optional(),
  additionalAmount: z.number().finite().min(0).max(1e12).optional(),
  justification: text(2000).nullable().optional(),
  usefulLife: years,
  offers: z.array(z.object({
    ref: ref("Cada oferta necesita su referencia."),
    folio: z.number().int().positive().nullable().optional(),
    extraFactors: z.record(z.string().regex(EXTRA_FACTOR_KEY), factor).optional(),
    description: text(300), brand: text(120), model: text(120), year: text(20), hours: text(60), attachments: text(300), date: text(60),
    price: amount,
    contact: text(200), company: text(200), phone: text(60), email: text(200), link: text(500), location: text(200), notes: text(1000),
    fees: rate, installation: rate,
    age: years,
    usefulLife: years,
    rating,
    ...depreciationFactors,
  })).max(30).refine(uniqueRefs, "Las referencias de las ofertas no se pueden repetir."),
  // Free descriptive rows of the technical characteristics. Absent: the capture has none.
  characteristics: z.array(z.object({
    label: text(80).min(1, "Cada característica técnica necesita su concepto."),
    subject: text(200),
    values: z.array(text(200)).max(30),
  })).max(MACHINERY_CHARACTERISTICS_MAX, `Se capturan hasta ${MACHINERY_CHARACTERISTICS_MAX} características técnicas.`).default([]),
  rounding: roundingSchema,
  formulas: capturedFormulasSchema.optional(),
}).refine(
  // A value that belongs to no offer, or an offer without its value, would print under the wrong comparable.
  (market) => market.characteristics.every((row) => row.values.length === market.offers.length),
  "Cada característica técnica lleva un valor por oferta.",
);

/** Either capture, or both: the one that is absent stays as it is stored. */
export const machineryInputSchema = z.object({ cost: costSchema.optional(), market: marketSchema.optional() })
  .refine((value) => value.cost !== undefined || value.market !== undefined, "Envía la captura de costos o la de mercado.");

export type MachineryInputPayload = z.infer<typeof machineryInputSchema>;
