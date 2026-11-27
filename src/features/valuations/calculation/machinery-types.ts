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
import type { CapturedFormulas } from "./captured-formulas";
import { MARKET_STATISTICS, printedStatisticsOf, type OfferLevel, type PrintedStatistics } from "./market-types";

/** Key of the property type (TipoInmueble) whose valuations use the machinery panels. */
export const MACHINERY_PROPERTY_TYPE = "MAQUINARIA_EQUIPO";

/** `ValuationDetail.propertyKind` of a machinery valuation. */
export const isMachineryPropertyKind = (propertyKind: string | null | undefined) =>
  propertyKind?.toUpperCase() === MACHINERY_PROPERTY_TYPE;

/**
 * Whether the FCo of the item multiplies the resulting factor on top of the
 * rating that already enters the age factor, as the book does. Decided with
 * the appraiser on 9 Oct 2026 (question 3): both apply, exactly as the book
 * (933,000 in its example). A valuation keeps the setting it was saved with.
 */
export const MACHINERY_CONSERVATION_TWICE = true;

/** The table's factor for a rating, or null when the rating is not one of the table (question 3: the item's FCo starts from it). */
export function conservationFromRating(rating: number | null): number | null {
  return MACHINERY_CONSERVATION.find((row) => row.rating === rating)?.factor ?? null;
}

/** Whether a captured FCo is the one the rating's table row gives, so a new rating may replace it. */
export function conservationFollowsRating(conservation: number | null, rating: number | null): boolean {
  const fromRating = conservationFromRating(rating);
  return fromRating !== null && conservation === fromRating;
}

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
  /** Formulas typed in the numeric fields, by path ("item.quotedPrice"); absent keeps the stored ones whose value did not change. */
  formulas?: CapturedFormulas;
};

export type MachineryOfferDto = {
  ref: string;
  /** Number of its card in the firm's base (C-00091), when it came from one (the AI search); null for an offer typed here. */
  folio: number | null;
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
  /** The factors the appraiser added to the homologation, by their key (`MachineryFactorColumn`); a missing one is 1. */
  extraFactors: Record<string, number>;
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

/**
 * A factor of the market's homologation, a column of its table (video 8.10:
 * the factors are the homologation's columns): one of the book's (FCo, FMt,
 * FOt, FOe) with the name the appraiser gives it, or one he added (`x…`),
 * whose value each offer carries in `extraFactors`. FEd, the age factor,
 * always multiplies; the FRe is FEd times these.
 */
export type MachineryFactorColumn = { key: string; label: string };

/** The tables of the market a datum of the offer can be added to as a column. */
export const MACHINERY_LINK_TABLES = ["resumen", "contacto", "homologacion"] as const;
export type MachineryLinkTable = (typeof MACHINERY_LINK_TABLES)[number];

export type MachineryMarketDto = {
  /** The book's level, as captured before its options could be renamed; `offerMark` is read first. */
  offerLevel: OfferLevel | null;
  /** The options of «Nivel de oferta observada», the place of the one observed and the sentence above, as a real estate market. */
  offerLabels?: string[] | null;
  offerMark?: number | null;
  offerIntro?: string | null;
  /** Useful life (V.U.T.) of the offers that do not carry their own. */
  usefulLife: number | null;
  offers: MachineryOfferDto[];
  /** Free rows of the technical characteristics, in printing order. */
  characteristics: MachineryCharacteristicDto[];
  /** Formulas typed in the numeric fields, by path ("offers.0.price"); absent keeps the stored ones whose value did not change. */
  formulas?: CapturedFormulas;
  /** Excel ROUND digits of the market value, the appraiser's choice; null is no rounding. */
  rounding: RoundingDigits;
  /** The factors of the homologation in their order; absent, the book's four. */
  factorColumns?: MachineryFactorColumn[] | null;
  /** The names the appraiser gave the data of the offers, by key: the column, the row and the card read the same one. */
  fieldLabels?: Record<string, string> | null;
  /** Data of the offer shown as columns of a table, in the order added. */
  linkedColumns?: Partial<Record<MachineryLinkTable, string[]>> | null;
  /** The statistics of the box under the homologation: which print, their names, their order and the appraiser's own. */
  printedStatistics?: PrintedStatistics | null;
  /** «Monto adicional a considerar», added to the rounded median; 0 by default. */
  additionalAmount?: number;
  /** «Justificación de los factores utilizados», after the homologation; none by default. */
  justification?: string | null;
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
    ref: `C${index + 1}`, folio: null, description: "", brand: "", model: "", year: "", hours: "", attachments: "", date: "", price: null,
    contact: "", company: "", phone: "", email: "", link: "", location: "", notes: "",
    fees: 0, installation: 0, age: null, usefulLife: null, rating: null, conservation: 1, maintenance: 1, technological: 1, economic: 1,
    extraFactors: {},
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

/** The book's factors of the homologation after the age factor, with their short names. */
const MACHINERY_FACTOR_KEYS: readonly string[] = MACHINERY_FACTORS.map((factor) => factor.key);
const isBookFactor = (key: string): key is keyof MachineryFactors => MACHINERY_FACTOR_KEYS.includes(key);
const DEFAULT_MACHINERY_FACTOR_COLUMNS: readonly MachineryFactorColumn[] = MACHINERY_FACTORS.map((factor) => ({ key: factor.key, label: factor.short }));
/** Key of a factor the appraiser added. */
export const EXTRA_FACTOR_KEY = /^x[a-z0-9]{1,20}$/;
/**
 * Six factors per homologation, as in every market (video 8.13, 18:01): the
 * FEd, which the age gives, and up to five more; the FRe is not one of them.
 */
export const MAX_MACHINERY_FACTORS = 5;
/** What a homologation saved while ten were allowed may still hold: it keeps its factors and adds no more. */
export const LEGACY_MAX_MACHINERY_FACTORS = 10;
export const MACHINERY_FACTOR_LIMIT_MESSAGE = `La homologación lleva hasta ${MAX_MACHINERY_FACTORS + 1} factores contando el FEd, sin contar el FRe. Quita uno para agregar otro.`;
/** Whether the homologation may have `next` factors besides the FEd after having `previous`: up to five, or no more than it had. */
export const machineryFactorCountAllowed = (next: number, previous: number) => next <= MAX_MACHINERY_FACTORS || next <= previous;

/** The name the book gives one of its factors (FCo…), or null for one the appraiser added. */
export const bookFactorShort = (key: string) => MACHINERY_FACTORS.find((factor) => factor.key === key)?.short ?? null;

/** The factors of the market's homologation, in their order: the appraiser's, or the book's four. */
export function machineryFactorColumns(market: Pick<MachineryMarketDto, "factorColumns">): MachineryFactorColumn[] {
  const chosen = market.factorColumns;
  if (!chosen) return [...DEFAULT_MACHINERY_FACTOR_COLUMNS];
  const seen = new Set<string>();
  return chosen
    .filter((column) => {
      if (!(isBookFactor(column.key) || EXTRA_FACTOR_KEY.test(column.key)) || seen.has(column.key)) return false;
      seen.add(column.key);
      return true;
    })
    .map((column) => ({ key: column.key, label: column.label.trim() || bookFactorShort(column.key) || "Factor" }));
}

/** The value of one factor of an offer: the book's from its field, the added ones from `extraFactors` (1 while empty). */
export function machineryOfferFactor(offer: Pick<MachineryOfferDto, keyof MachineryFactors | "extraFactors">, key: string): number {
  if (isBookFactor(key)) return offer[key];
  const value = offer.extraFactors?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

/**
 * The factors of an offer as the engine multiplies them: a factor of the book
 * taken out of the table counts as 1, the ones added come after them. With
 * the book's four, exactly the book's.
 */
function offerFactorsFor(offer: MachineryOfferDto, columns: readonly MachineryFactorColumn[]) {
  const keys = new Set(columns.map((column) => column.key));
  const factors = Object.fromEntries(MACHINERY_FACTOR_KEYS.map((key) => [key, keys.has(key) ? machineryOfferFactor(offer, key) : 1])) as MachineryFactors;
  const extra = columns.filter((column) => !isBookFactor(column.key)).map((column) => ({ label: column.label, value: machineryOfferFactor(offer, column.key) }));
  return extra.length ? { factors, extra } : { factors };
}

/** The book's statistics in the box: the mean and the median; the others may be printed too. */
export const DEFAULT_MACHINERY_STATISTICS: PrintedStatistics = {
  order: ["mean", "median", ...MARKET_STATISTICS.filter((key) => key !== "mean" && key !== "median")],
  hidden: MARKET_STATISTICS.filter((key) => key !== "mean" && key !== "median"),
  labels: { mean: "Valor Prom. Homologado", median: "Mediana" },
};

/** The appraiser's choice of statistics, every one once; missing, the book's. */
export const machineryStatisticsOf = (market: Pick<MachineryMarketDto, "printedStatistics">): PrintedStatistics =>
  (market.printedStatistics ? printedStatisticsOf({ printedStatistics: market.printedStatistics }) : DEFAULT_MACHINERY_STATISTICS);

export function toMachineryMarketEngineInput(market: MachineryMarketDto): { ok: true; input: MachineryMarketInput } | { ok: false; reason: string } {
  const offers = market.offers.filter((row) => isOfferComplete(row, market.usefulLife));
  const columns = machineryFactorColumns(market);
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
        ...offerFactorsFor(row, columns),
      })),
      rounding: market.rounding,
      ...(market.additionalAmount ? { additionalAmount: market.additionalAmount } : {}),
    },
  };
}
