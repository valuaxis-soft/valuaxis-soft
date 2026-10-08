/**
 * Machinery and equipment (MEH) as the editor and the API exchange it: the
 * cost capture (the item, its quotation, expenses, depreciation and
 * attachments) and the market capture (offers of similar equipment), following
 * the sheets «IV. ENF. COSTOS» and «V. ENF. MERCADO» of the firm's book, and
 * their conversion to the engine input.
 */
import type { RoundingDigits } from "../engine/config";
import {
  MACHINERY_CONSERVATION,
  MACHINERY_ROUNDING,
  type MachineryCostInput,
  type MachineryFactors,
  type MachineryMarketInput,
} from "../engine/machinery";
import type { OfferLevel } from "./market-types";

/** Key of the property type (TipoInmueble) whose valuations use the machinery panels. */
export const MACHINERY_PROPERTY_TYPE = "MAQUINARIA_EQUIPO";

/** `ValuationDetail.propertyKind` of a machinery valuation. */
export const isMachineryPropertyKind = (propertyKind: string | null | undefined) =>
  propertyKind?.toUpperCase() === MACHINERY_PROPERTY_TYPE;

/**
 * Whether the captured FCo of the item multiplies the resulting factor on top
 * of the rating that already enters the age factor, as the book does. Pending
 * with the appraiser (PENDING_DECISIONS, question 3); a valuation keeps the
 * setting it was saved with.
 */
export const MACHINERY_CONSERVATION_TWICE = true;

/** Kind of quotation, as the book marks it (V.2). */
export const QUOTATION_KINDS = ["Nuevo Igual", "Usado Igual", "Similar Nuevo", "Similar Usado"] as const;

/** Expenses that take the unit V.R.N. to the installed one (V.3), as fractions. */
export const MACHINERY_EXPENSES = [
  { key: "customs", label: "Gastos Aduanales" },
  { key: "freight", label: "Fletes y Maniobras" },
  { key: "insurance", label: "Seguros y/o Fianzas" },
  { key: "engineering", label: "Ingenierías" },
  { key: "installation", label: "Instalación" },
  { key: "otherExpenses", label: "Otros Gastos" },
] as const;

/** Depreciation factors after the age factor, in the book's order. */
export const MACHINERY_FACTORS = [
  { key: "conservation", short: "FCo", label: "Conservación FCo" },
  { key: "maintenance", short: "FMt", label: "Mantenimiento FMt" },
  { key: "technological", short: "FOt", label: "Obsolescencia Tecnofuncional FOt" },
  { key: "economic", short: "FOe", label: "Obsolescencia Económica FOe" },
] as const satisfies readonly { key: keyof MachineryFactors; short: string; label: string }[];

export type MachineryItemDto = {
  // V.1 Identificación del bien.
  name: string;
  brand: string;
  model: string;
  year: string;
  serial: string;
  engineNumber: string;
  plate: string;
  other: string;
  hours: string;
  physicalState: string;
  deficiencies: string;
  attachmentsNote: string;
  notes: string;
  // V.2 V.R.N. unitario.
  quotationKind: string;
  supplier: string;
  contact: string;
  originCountry: string;
  quotationDate: string;
  /** Quotation in its currency. */
  quotedPrice: number | null;
  /** Pesos per unit of that currency; 1 for a quotation in pesos. */
  exchangeRate: number;
  otherFactor: number;
  // V.3 V.R.N. instalado.
  customs: number;
  freight: number;
  insurance: number;
  engineering: number;
  installation: number;
  otherExpenses: number;
  expensesNotes: string;
  // V.4 V.N.R. unitario instalado.
  maintenanceKind: string;
  age: number | null;
  usefulLife: number | null;
  /** Conservation rating of the inspection, 1 to 10. */
  rating: number | null;
  conservation: number;
  maintenance: number;
  technological: number;
  economic: number;
};

export type MachineryAttachmentDto = {
  ref: string;
  description: string;
  brand: string;
  supplier: string;
  source: string;
  quotationKind: string;
  /** Quotation in pesos. */
  quotedPrice: number | null;
  /** F.E.E.S., engineering and installation expenses, as fractions. */
  fees: number;
  engineering: number;
  installation: number;
  age: number | null;
  usefulLife: number | null;
  conservation: number;
  maintenance: number;
  technological: number;
  economic: number;
};

export type MachineryCostDto = {
  item: MachineryItemDto;
  attachments: MachineryAttachmentDto[];
  /** Excel ROUND digits of the physical value, the appraiser's choice; null is no rounding. */
  rounding: RoundingDigits;
  conservationTwice: boolean;
};

export type MachineryOfferDto = {
  ref: string;
  // Resumen de comparables.
  description: string;
  brand: string;
  model: string;
  year: string;
  hours: string;
  attachments: string;
  date: string;
  /** Asking price. */
  price: number | null;
  // Información de contacto.
  contact: string;
  company: string;
  phone: string;
  email: string;
  link: string;
  location: string;
  notes: string;
  // Cálculo del V.N.R. homologado.
  /** F.E.E.S. and installation expenses that put the offer on site, as fractions. */
  fees: number;
  installation: number;
  age: number | null;
  /** Its own useful life; empty to use the shared one. */
  usefulLife: number | null;
  rating: number | null;
  conservation: number;
  maintenance: number;
  technological: number;
  economic: number;
};

/**
 * A free row of the block «CARACTERÍSTICAS TÉCNICAS» (Cabina, Kilómetros,
 * Procedencia, Nivel de demanda…): what the appraiser describes of the subject
 * and of each offer. Descriptive only: it never enters the calculation.
 */
export type MachineryCharacteristicDto = {
  label: string;
  subject: string;
  /** One value per offer, in the order of the offers. */
  values: string[];
};

export const MACHINERY_CHARACTERISTICS_MAX = 30;

export type MachineryMarketDto = {
  offerLevel: OfferLevel | null;
  /** Useful life (V.U.T.) of the offers that do not carry their own. */
  usefulLife: number | null;
  offers: MachineryOfferDto[];
  /** Free rows of the technical characteristics, in printing order. */
  characteristics: MachineryCharacteristicDto[];
  /** Excel ROUND digits of the market value, the appraiser's choice; null is no rounding. */
  rounding: RoundingDigits;
};

export type MachineryInputDto = { cost?: MachineryCostDto; market?: MachineryMarketDto };

export type MachineryCalculationDto = {
  cost: MachineryCostDto;
  market: MachineryMarketDto;
  /** Which captures the appraiser has saved at least once. */
  configured: { cost: boolean; market: boolean };
  /** The valuation is of machinery and equipment, so the conclusion takes these values. */
  applies: boolean;
  locked: boolean;
};

export const EMPTY_MACHINERY_ITEM: MachineryItemDto = {
  name: "", brand: "", model: "", year: "", serial: "", engineNumber: "", plate: "", other: "", hours: "",
  physicalState: "", deficiencies: "", attachmentsNote: "", notes: "",
  quotationKind: "", supplier: "", contact: "", originCountry: "", quotationDate: "", quotedPrice: null, exchangeRate: 1, otherFactor: 1,
  customs: 0, freight: 0, insurance: 0, engineering: 0, installation: 0, otherExpenses: 0, expensesNotes: "",
  maintenanceKind: "", age: null, usefulLife: null, rating: null, conservation: 1, maintenance: 1, technological: 1, economic: 1,
};

export const DEFAULT_MACHINERY_COST: MachineryCostDto = {
  item: EMPTY_MACHINERY_ITEM,
  attachments: [],
  rounding: MACHINERY_ROUNDING.physicalValue,
  conservationTwice: MACHINERY_CONSERVATION_TWICE,
};

export const DEFAULT_MACHINERY_MARKET: MachineryMarketDto = { offerLevel: null, usefulLife: null, offers: [], characteristics: [], rounding: MACHINERY_ROUNDING.market };

/** The free rows with exactly one value per offer: a capture saved before they existed has none. */
export function alignedCharacteristics(characteristics: Partial<MachineryCharacteristicDto>[] | undefined, offerCount: number): MachineryCharacteristicDto[] {
  return (characteristics ?? []).map((row) => ({
    label: row.label ?? "",
    subject: row.subject ?? "",
    values: Array.from({ length: offerCount }, (_, index) => row.values?.[index] ?? ""),
  }));
}

export function emptyAttachment(index: number): MachineryAttachmentDto {
  return {
    ref: String(index + 1), description: "", brand: "", supplier: "", source: "", quotationKind: "", quotedPrice: null,
    fees: 0, engineering: 0, installation: 0, age: null, usefulLife: null, conservation: 1, maintenance: 1, technological: 1, economic: 1,
  };
}

export function emptyOffer(index: number): MachineryOfferDto {
  return {
    ref: `C${index + 1}`, description: "", brand: "", model: "", year: "", hours: "", attachments: "", date: "", price: null,
    contact: "", company: "", phone: "", email: "", link: "", location: "", notes: "",
    fees: 0, installation: 0, age: null, usefulLife: null, rating: null, conservation: 1, maintenance: 1, technological: 1, economic: 1,
  };
}

const positive = (value: number | null): value is number => value !== null && value > 0;
const isRating = (value: number | null): value is number => MACHINERY_CONSERVATION.some((row) => row.rating === value);
const factorsOf = (row: MachineryFactors): MachineryFactors =>
  ({ conservation: row.conservation, maintenance: row.maintenance, technological: row.technological, economic: row.economic });

/** An attachment enters the calculation once its numbers are captured. */
export function isAttachmentComplete(row: MachineryAttachmentDto) {
  return Boolean(row.ref.trim()) && positive(row.quotedPrice) && row.age !== null && row.age >= 0 && positive(row.usefulLife);
}

export function toMachineryCostEngineInput(cost: MachineryCostDto): { ok: true; input: MachineryCostInput } | { ok: false; reason: string } {
  const { item } = cost;
  if (!positive(item.quotedPrice)) return { ok: false, reason: "Captura la cotización del bien." };
  if (!positive(item.exchangeRate)) return { ok: false, reason: "El tipo de cambio debe ser mayor que cero." };
  if (item.age === null || item.age < 0 || !positive(item.usefulLife)) return { ok: false, reason: "Captura la edad y la vida útil total del bien." };
  if (!isRating(item.rating)) return { ok: false, reason: "Captura la calificación de conservación del bien, de 1 a 10." };
  return {
    ok: true,
    input: {
      item: {
        quotedPrice: item.quotedPrice,
        exchangeRate: item.exchangeRate,
        otherFactor: item.otherFactor,
        expenses: MACHINERY_EXPENSES.map((expense) => ({ concept: expense.label, rate: item[expense.key] })),
        age: item.age,
        usefulLife: item.usefulLife,
        rating: item.rating,
        factors: factorsOf(item),
      },
      attachments: cost.attachments.filter(isAttachmentComplete).map((row) => ({
        ref: row.ref,
        description: row.description,
        quotedPrice: row.quotedPrice as number,
        expenseRates: [row.fees, row.engineering, row.installation],
        age: row.age as number,
        usefulLife: row.usefulLife as number,
        factors: factorsOf(row),
      })),
      conservationTwice: cost.conservationTwice,
      rounding: cost.rounding,
    },
  };
}

/** An offer enters the calculation once its price, age, rating and a useful life are captured. */
export function isOfferComplete(row: MachineryOfferDto, sharedUsefulLife: number | null) {
  return Boolean(row.ref.trim()) && positive(row.price) && row.age !== null && row.age >= 0 && isRating(row.rating)
    && positive(row.usefulLife ?? sharedUsefulLife);
}

export function toMachineryMarketEngineInput(market: MachineryMarketDto): { ok: true; input: MachineryMarketInput } | { ok: false; reason: string } {
  const offers = market.offers.filter((row) => isOfferComplete(row, market.usefulLife));
  if (!offers.length) return { ok: false, reason: "Captura al menos una oferta con su precio, edad, vida útil y calificación de conservación." };
  return {
    ok: true,
    input: {
      // Every offer left has a useful life; the shared one only fills the ones without their own.
      usefulLife: positive(market.usefulLife) ? market.usefulLife : (offers[0].usefulLife as number),
      offers: offers.map((row) => ({
        id: row.ref,
        price: row.price as number,
        surcharge: row.fees + row.installation,
        age: row.age as number,
        ...(row.usefulLife === null ? {} : { usefulLife: row.usefulLife }),
        rating: row.rating as number,
        factors: factorsOf(row),
      })),
      rounding: market.rounding,
    },
  };
}
