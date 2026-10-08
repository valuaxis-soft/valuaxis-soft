import { z } from "zod";
import { MACHINERY_CONSERVATION } from "../engine/machinery";
import { OFFER_LEVELS } from "./market-types";
import { roundingSchema } from "./market-schemas";

const text = (max: number) => z.string().trim().max(max);
const amount = z.number().finite().min(0).max(1e12).nullable();
const factor = z.number().finite().min(0).max(10);
// Expenses are fractions of the quotation; several times its amount is a typing slip.
const rate = z.number().finite().min(0).max(10);
const years = z.number().finite().min(0).max(1000).nullable();
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
});

const marketSchema = z.object({
  offerLevel: z.enum(OFFER_LEVELS).nullable(),
  usefulLife: years,
  offers: z.array(z.object({
    ref: ref("Cada oferta necesita su referencia."),
    description: text(300), brand: text(120), model: text(120), year: text(20), hours: text(60), attachments: text(300), date: text(60),
    price: amount,
    contact: text(200), company: text(200), phone: text(60), email: text(200), link: text(500), location: text(200), notes: text(1000),
    fees: rate, installation: rate,
    age: years,
    usefulLife: years,
    rating,
    ...depreciationFactors,
  })).max(30).refine(uniqueRefs, "Las referencias de las ofertas no se pueden repetir."),
  rounding: roundingSchema,
});

/** Either capture, or both: the one that is absent stays as it is stored. */
export const machineryInputSchema = z.object({ cost: costSchema.optional(), market: marketSchema.optional() })
  .refine((value) => value.cost !== undefined || value.market !== undefined, "Envía la captura de costos o la de mercado.");

export type MachineryInputPayload = z.infer<typeof machineryInputSchema>;
