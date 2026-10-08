/**
 * Machinery and equipment (MEH): cost approach for the item and its
 * attachments, and market approach over offers of similar equipment.
 * Formulas follow docs/fase0/metodologia/01-costos.md §3.8 and
 * 02-mercado-homologacion.md §3.5, so the results match the MEH book.
 */
import { effectiveUsefulLife } from "./factors";
import type { RoundingDigits } from "./config";
import { roundIfSet } from "./rounding";
import { Trace } from "./trace";

/** Rating 1–10 → factor and legend, as in the MEH book (`B41`, `'ll. DATOS'!H195`). */
export const MACHINERY_CONSERVATION = [
  { rating: 10, factor: 1, label: "Nuevo" },
  { rating: 9, factor: 0.99, label: "Excelente" },
  { rating: 8, factor: 0.975, label: "Muy bueno" },
  { rating: 7, factor: 0.92, label: "Bueno" },
  { rating: 6, factor: 0.82, label: "Regular" },
  { rating: 5, factor: 0.66, label: "Deficiente" },
  { rating: 4, factor: 0.47, label: "Malo" },
  { rating: 3, factor: 0.25, label: "Muy malo" },
  { rating: 2, factor: 0.1, label: "Ruinoso" },
  { rating: 1, factor: 0, label: "Chatarra" },
] as const;

export function conservationFactor(rating: number): number {
  const row = MACHINERY_CONSERVATION.find((item) => item.rating === rating);
  if (!row) throw new Error(`La calificación de conservación debe ser un entero de 1 a 10; se recibió ${rating}.`);
  return row.factor;
}

/**
 * The book's "calificación promedio": the most marked rating of the
 * inspection checklist; on a tie the lower rating wins (MATCH on MAX).
 */
export function modeRating(ratings: number[]): number {
  if (!ratings.length) throw new Error("Marque al menos una calificación de conservación.");
  const counts = new Map<number, number>();
  for (const rating of ratings) counts.set(rating, (counts.get(rating) ?? 0) + 1);
  return [...counts].sort(([ratingA, countA], [ratingB, countB]) => countB - countA || ratingA - ratingB)[0][0];
}

/** Roundings of the MEH book, the starting ones: the physical value to thousands, the market value to tens of thousands. */
export const MACHINERY_ROUNDING = { physicalValue: -3, market: -4 } as const satisfies Record<string, RoundingDigits>;

/** Multipliers after the age factor, in the book's order: FCo · FMt · FOt · FOe. */
export type MachineryFactors = { conservation: number; maintenance: number; technological: number; economic: number };

export type MachineryItemInput = {
  /** Quotation in its currency. */
  quotedPrice: number;
  exchangeRate: number;
  /** "Otro" factor on the quotation (`U28`); 1 when none. */
  otherFactor: number;
  /** Customs, freight, insurance, engineering, installation, others; fractions. */
  expenses: { concept: string; rate: number }[];
  age: number;
  usefulLife: number;
  /** 1–10; its table factor multiplies the age factor. */
  rating: number;
  factors: MachineryFactors;
};

export type AttachmentInput = {
  ref: string;
  description?: string;
  /** Quotation in MXN. */
  quotedPrice: number;
  /** F.E.E.S., engineering, installation; fractions. */
  expenseRates: number[];
  age: number;
  usefulLife: number;
  factors: MachineryFactors;
};

export type MachineryCostInput = {
  item: MachineryItemInput;
  attachments?: AttachmentInput[];
  /**
   * The book multiplies the rating's factor into the age factor and then the
   * captured FCo again (pregunta 3). `false` applies only the rating.
   */
  conservationTwice: boolean;
  /** Excel ROUND digits of the physical value, the appraiser's choice; the book rounds to thousands (−3). */
  rounding?: RoundingDigits;
};

export type MachineryCostResult = {
  item: {
    quotedMxn: number;
    newReplacementValue: number;
    expensesRate: number;
    installedValue: number;
    ratingFactor: number;
    ageFactor: number;
    resultantFactor: number;
    value: number;
  };
  attachments: { ref: string; installedValue: number; ageFactor: number; resultantFactor: number; value: number }[];
  attachmentsTotal: number;
  /** Item + attachments, rounded: ROUND(…, −3) in the book, `V61`. */
  physicalValue: number;
  trace: Trace;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser mayor que cero.`);
}

export function computeMachineryCost(input: MachineryCostInput, trace = new Trace()): MachineryCostResult {
  const { item } = input;
  assertPositive(item.usefulLife, "La vida útil del bien");
  const quotedMxn = trace.record({
    key: "meh.bien.cotizacionMxn", label: "Cotización en pesos", formula: "cotizacion · tipoCambio",
    inputs: { cotizacion: item.quotedPrice, tipoCambio: item.exchangeRate }, value: item.quotedPrice * item.exchangeRate,
  });
  const newReplacementValue = trace.record({
    key: "meh.bien.vrnUnitario", label: "V.R.N. unitario", formula: "cotizacionMxn · otro",
    inputs: { cotizacionMxn: quotedMxn, otro: item.otherFactor }, value: quotedMxn * item.otherFactor,
  });
  const expensesRate = trace.record({
    key: "meh.bien.gastos", label: "Gastos de importación e instalación", formula: "Σ gastos",
    inputs: Object.fromEntries(item.expenses.map((expense) => [expense.concept, expense.rate])), value: sum(item.expenses.map((expense) => expense.rate)),
  });
  const installedValue = trace.record({
    key: "meh.bien.vrnInstalado", label: "V.R.N. instalado", formula: "vrnUnitario · (1 + gastos)",
    inputs: { vrnUnitario: newReplacementValue, gastos: expensesRate }, value: newReplacementValue * (1 + expensesRate),
  });
  const ratingFactor = conservationFactor(item.rating);
  // An age at or past the useful life takes a useful life of age + 1, as in the other approaches.
  const itemLife = effectiveUsefulLife(item.age, item.usefulLife, true);
  const ageFactor = trace.record({
    key: "meh.bien.fed", label: "Factor de edad y conservación", formula: "(1 − (edad / vidaUtil)^1.4) · Fcal",
    inputs: { edad: item.age, vidaUtil: itemLife, calificacion: item.rating, Fcal: ratingFactor },
    value: (1 - (item.age / itemLife) ** 1.4) * ratingFactor,
  });
  const conservation = input.conservationTwice ? item.factors.conservation : 1;
  const resultantFactor = trace.record({
    key: "meh.bien.fre", label: "Factor resultante", formula: "FEd · FCo · FMt · FOt · FOe",
    inputs: { FEd: ageFactor, FCo: conservation, FMt: item.factors.maintenance, FOt: item.factors.technological, FOe: item.factors.economic },
    value: ageFactor * conservation * item.factors.maintenance * item.factors.technological * item.factors.economic,
  });
  const itemValue = trace.record({
    key: "meh.bien.vnr", label: "V.N.R. del bien", formula: "FRe · vrnInstalado",
    inputs: { FRe: resultantFactor, vrnInstalado: installedValue }, value: resultantFactor * installedValue,
  });

  const attachments = (input.attachments ?? []).map((attachment) => {
    assertPositive(attachment.usefulLife, `La vida útil del aditamento ${attachment.ref}`);
    const key = `meh.aditamentos.${attachment.ref}`;
    const rates = sum(attachment.expenseRates);
    const life = effectiveUsefulLife(attachment.age, attachment.usefulLife, true);
    const installed = trace.record({
      key: `${key}.vrnInstalado`, label: `V.R.N. instalado ${attachment.ref}`, formula: "cotizacion + gastos · cotizacion",
      inputs: { cotizacion: attachment.quotedPrice, gastos: rates }, value: attachment.quotedPrice + rates * attachment.quotedPrice,
    });
    // Linear, unlike the item's exponent 1.4 (hallazgo 16).
    const age = trace.record({
      key: `${key}.fed`, label: `Factor de edad ${attachment.ref}`, formula: "(vidaUtil − edad) / vidaUtil",
      inputs: { edad: attachment.age, vidaUtil: life }, value: (life - attachment.age) / life,
    });
    const { conservation: fco, maintenance, technological, economic } = attachment.factors;
    const resultant = trace.record({
      key: `${key}.fre`, label: `Factor resultante ${attachment.ref}`, formula: "FEd · FCo · FMt · FOt · FOe",
      inputs: { FEd: age, FCo: fco, FMt: maintenance, FOt: technological, FOe: economic },
      value: age * fco * maintenance * technological * economic,
    });
    const value = trace.record({
      key: `${key}.vnr`, label: `V.N.R. ${attachment.ref}`, formula: "vrnInstalado · FRe",
      inputs: { vrnInstalado: installed, FRe: resultant }, value: installed * resultant,
    });
    return { ref: attachment.ref, installedValue: installed, ageFactor: age, resultantFactor: resultant, value };
  });
  const attachmentsTotal = trace.record({
    key: "meh.aditamentos.total", label: "Aditamentos", formula: "Σ V.N.R. aditamentos",
    inputs: Object.fromEntries(attachments.map((attachment) => [attachment.ref, attachment.value])), value: sum(attachments.map((attachment) => attachment.value)),
  });
  const digits = input.rounding === undefined ? MACHINERY_ROUNDING.physicalValue : input.rounding;
  const physicalValue = trace.record({
    key: "meh.valorFisico", label: "Valor físico", formula: digits === null ? "bien + aditamentos" : `ROUND(bien + aditamentos, ${digits})`,
    inputs: { bien: itemValue, aditamentos: attachmentsTotal }, value: roundIfSet(itemValue + attachmentsTotal, digits),
    ...(digits === null ? {} : { rounding: digits }),
  });

  return {
    item: { quotedMxn, newReplacementValue, expensesRate, installedValue, ratingFactor, ageFactor, resultantFactor, value: itemValue },
    attachments,
    attachmentsTotal,
    physicalValue,
    trace,
  };
}

export type MachineryOfferInput = {
  id: string;
  /** Asking price. */
  price: number;
  /** Surcharge on the price (`%G`), a fraction. */
  surcharge: number;
  age: number;
  /** The offer's own useful life (`M73`); the shared one when it has none. */
  usefulLife?: number;
  rating: number;
  factors: MachineryFactors;
};

export type MachineryMarketInput = {
  usefulLife: number;
  offers: MachineryOfferInput[];
  /** Excel ROUND digits of the market value, the appraiser's choice; the book rounds to tens of thousands (−4). */
  rounding?: RoundingDigits;
};

export type MachineryMarketResult = {
  offers: { id: string; adjustedPrice: number; ageFactor: number; resultantFactor: number; value: number }[];
  mean: number;
  median: number;
  /** The median, rounded: ROUND(…, −4) in the book. */
  value: number;
  trace: Trace;
};

/**
 * Each offer is depreciated by its own age and rating, like the item in the
 * cost approach; the subject's age does not enter (hallazgo in §3.5).
 */
export function computeMachineryMarket(input: MachineryMarketInput, trace = new Trace()): MachineryMarketResult {
  assertPositive(input.usefulLife, "La vida útil");
  if (!input.offers.length) throw new Error("Capture al menos una oferta de mercado.");
  const offers = input.offers.map((offer) => {
    const key = `meh.mercado.${offer.id}`;
    const adjustedPrice = trace.record({
      key: `${key}.precio`, label: `Precio ajustado ${offer.id}`, formula: "precio · (1 + G)",
      inputs: { precio: offer.price, G: offer.surcharge }, value: offer.price * (1 + offer.surcharge),
    });
    const ratingFactor = conservationFactor(offer.rating);
    if (offer.usefulLife !== undefined) assertPositive(offer.usefulLife, `La vida útil de la oferta ${offer.id}`);
    const life = effectiveUsefulLife(offer.age, offer.usefulLife ?? input.usefulLife, true);
    const ageFactor = trace.record({
      key: `${key}.fed`, label: `Factor de edad ${offer.id}`, formula: "(1 − (edad / vidaUtil)^1.4) · Fcal",
      inputs: { edad: offer.age, vidaUtil: life, calificacion: offer.rating, Fcal: ratingFactor },
      value: (1 - (offer.age / life) ** 1.4) * ratingFactor,
    });
    const { conservation, maintenance, technological, economic } = offer.factors;
    const resultantFactor = trace.record({
      key: `${key}.fre`, label: `Factor resultante ${offer.id}`, formula: "FEd · FCo · FMt · FOt · FOe",
      inputs: { FEd: ageFactor, FCo: conservation, FMt: maintenance, FOt: technological, FOe: economic },
      value: ageFactor * conservation * maintenance * technological * economic,
    });
    const value = trace.record({
      key: `${key}.valor`, label: `Valor homologado ${offer.id}`, formula: "FRe · precioAjustado",
      inputs: { FRe: resultantFactor, precioAjustado: adjustedPrice }, value: resultantFactor * adjustedPrice,
    });
    return { id: offer.id, adjustedPrice, ageFactor, resultantFactor, value };
  });

  const values = offers.map((offer) => offer.value);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const mean = trace.record({
    key: "meh.mercado.promedio", label: "Promedio", formula: "Σ valores / n",
    inputs: { n: values.length }, value: sum(values) / values.length,
  });
  const median = trace.record({
    key: "meh.mercado.mediana", label: "Mediana", formula: "MEDIAN(valores)",
    inputs: { n: values.length }, value: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
  });
  const digits = input.rounding === undefined ? MACHINERY_ROUNDING.market : input.rounding;
  const value = trace.record({
    key: "meh.mercado.valor", label: "Valor de mercado", formula: digits === null ? "mediana" : `ROUND(mediana, ${digits})`,
    inputs: { mediana: median }, value: roundIfSet(median, digits),
    ...(digits === null ? {} : { rounding: digits }),
  });
  return { offers, mean, median, value, trace };
}
