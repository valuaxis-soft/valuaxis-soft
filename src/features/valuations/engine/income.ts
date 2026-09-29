/**
 * Income approach (capitalización de rentas), the three methods of
 * docs/fase0/metodologia/03-rentas-ingresos.md:
 * - "tabla" (A, TCH and Arandas): gross rent less deductions, capitalized at
 *   the rate of the 7-criteria table or the one the appraiser applies.
 * - "anualidad" (B, TU): vacancy by days, then deductions; option 1 (the
 *   printed "market" rate) or option 2 (present value of a monthly annuity at
 *   TIIE − inflation + 1/remaining life), which is what the books conclude.
 * - "mercado" (C, TR): the rate comes from sale/rent pairs of the same
 *   comparables; value = subject net income / mean rate.
 * Every method fills the same result fields; the detail of B and C is apart.
 */
import type { EngineConfig } from "./config";
import { homologate, type HomologationInput, type HomologationResult } from "./market";
import { Trace } from "./trace";

/** Rates of the six columns of the rate table: 7 % … 12 %. */
export const RATE_TABLE_RATES = [0.07, 0.08, 0.09, 0.1, 0.11, 0.12] as const;

/** Criteria of the rate table, one column chosen per criterion. */
export const RATE_TABLE_CRITERIA = [
  "Edad",
  "Vida útil remanente",
  "Estado de conservación",
  "Proyecto",
  "Relación terreno / construcción",
  "Uso del inmueble",
  "Clasificación de zona",
] as const;

export type IncomeMethod = "tabla" | "anualidad" | "mercado";

/** TU: vacancy by days, other income, and the two capitalization options. */
export type AnnuityInput = {
  vacancyDays: number;
  contractYears: number;
  otherMonthlyIncome: number;
  /** TIIE 28 days and expected inflation, as fractions. */
  tiie: number;
  inflation: number;
  remainingLifeYears: number;
  /** 1: the printed market-based rate; 2: the annuity the books conclude with (question 2). */
  option: 1 | 2;
};

/** TR: each rent comparable's sale price, and the operating discounts. */
export type MarketRateInput = {
  /** Sale price of each rent comparable, in the rent market's order; null skips it. */
  salePrices: Array<number | null>;
  negotiation: number;
  vacancy: number;
  expenses: { concept: string; rate: number }[];
  subjectArea: number;
};

export type IncomeApproachInput = {
  /** Defaults to "tabla" (method A). */
  method?: IncomeMethod;
  annuity?: AnnuityInput;
  marketRate?: MarketRateInput;
  /** Rent comparables (monthly rent as price, rentable area as area). */
  rentMarket?: HomologationInput;
  /** $/m²/month the appraiser adopts; the homologated mean when missing. */
  adoptedUnitRent?: number;
  rentableUnits: { description: string; area: number; unitRent?: number }[];
  deductions: { concept: string; rate: number }[];
  capitalization: {
    /** Column index (0-based) chosen for each criterion of the rate table. */
    ratingColumns?: number[];
    rates?: readonly number[];
    /** Rate the appraiser applies; the rate from the table when missing. */
    appliedRate?: number;
  };
};

export type AnnuityDetail = {
  vacancyFactor: number;
  effectiveGrossRent: number;
  option1: { rate: number; value: number };
  option2: { rate: number; months: number; value: number };
  option: 1 | 2;
};

export type MarketRateDetail = {
  comparables: Array<{ id: string; netIncome: number; unitIncome: number; salePrice: number; rate: number }>;
  expensesRate: number;
  meanUnitIncome: number;
  meanRate: number;
};

export type IncomeApproachResult = {
  method: IncomeMethod;
  annuity: AnnuityDetail | null;
  marketRate: MarketRateDetail | null;
  rentMarket: HomologationResult | null;
  unitRent: number;
  grossMonthlyRent: number;
  deductionsRate: number;
  netMonthlyRent: number;
  netAnnualRent: number;
  tableRate: number | null;
  appliedRate: number;
  value: number;
};

export function computeIncomeApproach(input: IncomeApproachInput, config: EngineConfig, trace = new Trace()): IncomeApproachResult {
  const method = input.method ?? "tabla";
  const rentMarket = input.rentMarket ? homologate(input.rentMarket, config.surfaceOrientation.income, trace, "ingresos.rentas") : null;
  if (method === "mercado") return marketRateMethod(input, rentMarket, trace);
  // When every unit carries its own rent there is no market to average; the
  // adopted rent is then their area-weighted mean.
  const ownRents = input.rentableUnits.every((unit) => unit.unitRent !== undefined) && input.rentableUnits.length > 0;
  const totalArea = input.rentableUnits.reduce((sum, unit) => sum + unit.area, 0);
  const weightedRent = ownRents && totalArea > 0
    ? input.rentableUnits.reduce((sum, unit) => sum + unit.area * unit.unitRent!, 0) / totalArea
    : undefined;
  const unitRent = trace.record({
    key: "ingresos.rentaUnitaria",
    label: "Renta unitaria adoptada ($/m²/mes)",
    formula: input.adoptedUnitRent !== undefined
      ? "captura del perito"
      : rentMarket ? "promedio homologado de rentas" : "promedio ponderado de las rentas por tipo",
    inputs: { sugerida: rentMarket?.stats.mean ?? null, capturada: input.adoptedUnitRent ?? null },
    value: input.adoptedUnitRent ?? requireValue(rentMarket?.stats.mean ?? weightedRent, "Falta la renta unitaria o el mercado de rentas."),
  });

  let grossMonthlyRent = 0;
  input.rentableUnits.forEach((unit, index) => {
    const rent = unit.unitRent ?? unitRent;
    grossMonthlyRent += trace.record({
      key: `ingresos.rentaTipo${index + 1}`,
      label: `Renta mensual, ${unit.description}`,
      formula: "superficie rentable × renta unitaria",
      inputs: { superficieRentable: unit.area, rentaUnitaria: rent },
      value: unit.area * rent,
    });
  });
  trace.record({ key: "ingresos.rentaBruta", label: "Renta bruta mensual", formula: "Σ rentas por tipo", inputs: {}, value: grossMonthlyRent });

  const deductionsRate = trace.record({
    key: "ingresos.deducciones",
    label: "Deducciones",
    formula: "Σ porcentajes de deducción",
    inputs: Object.fromEntries(input.deductions.map((deduction) => [deduction.concept, deduction.rate])),
    value: input.deductions.reduce((sum, deduction) => sum + deduction.rate, 0),
  });
  if (method === "anualidad") {
    return annuityMethod(input, { rentMarket, unitRent, grossMonthlyRent, deductionsRate }, trace);
  }
  const netMonthlyRent = trace.record({
    key: "ingresos.rentaNetaMensual",
    label: "Renta neta mensual",
    formula: "renta bruta − renta bruta × deducciones",
    inputs: { rentaBruta: grossMonthlyRent, deducciones: deductionsRate },
    value: grossMonthlyRent - grossMonthlyRent * deductionsRate,
  });
  const netAnnualRent = trace.record({
    key: "ingresos.rentaNetaAnual",
    label: "Renta neta anual",
    formula: "renta neta mensual × 12",
    inputs: { rentaNetaMensual: netMonthlyRent },
    value: netMonthlyRent * 12,
  });

  const tableRate = input.capitalization.ratingColumns
    ? trace.record({
        key: "ingresos.tasaTabla",
        label: "Tasa resultante de la tabla",
        formula: "Σ (calificaciones de la columna × tasa / criterios × 100) / 100",
        inputs: Object.fromEntries(input.capitalization.ratingColumns.map((column, index) => [
          RATE_TABLE_CRITERIA[index] ?? `criterio ${index + 1}`,
          (input.capitalization.rates ?? RATE_TABLE_RATES)[column],
        ])),
        value: rateFromTable(input.capitalization.ratingColumns, input.capitalization.rates ?? RATE_TABLE_RATES),
      })
    : null;
  const appliedRate = trace.record({
    key: "ingresos.tasaAplicada",
    label: "Tasa de capitalización aplicada",
    formula: input.capitalization.appliedRate === undefined ? "tasa de la tabla" : "captura del perito",
    inputs: { tasaTabla: tableRate, capturada: input.capitalization.appliedRate ?? null },
    value: input.capitalization.appliedRate ?? requireValue(tableRate, "Falta la tasa de capitalización."),
  });
  const value = trace.record({
    key: "ingresos.valor",
    label: "Valor por capitalización de rentas",
    formula: "renta neta anual / tasa aplicada",
    inputs: { rentaNetaAnual: netAnnualRent, tasa: appliedRate },
    value: netAnnualRent / appliedRate,
  });
  return { method, annuity: null, marketRate: null, rentMarket, unitRent, grossMonthlyRent, deductionsRate, netMonthlyRent, netAnnualRent, tableRate, appliedRate, value };
}

/** Method B (TU): vacancy in cascade, then deductions; two ways to capitalize. */
function annuityMethod(
  input: IncomeApproachInput,
  base: { rentMarket: HomologationResult | null; unitRent: number; grossMonthlyRent: number; deductionsRate: number },
  trace: Trace,
): IncomeApproachResult {
  const annuity = input.annuity;
  if (!annuity) throw new Error("Faltan los datos de vacíos, TIIE, inflación y vida útil remanente.");
  const { grossMonthlyRent, deductionsRate, unitRent } = base;
  const vacancyFactor = trace.record({
    key: "ingresos.factorVacios",
    label: "Factor de vacíos",
    formula: "días de vacío / (años de contrato × 360)",
    inputs: { dias: annuity.vacancyDays, anios: annuity.contractYears },
    value: annuity.vacancyDays / (annuity.contractYears * 360),
  });
  const effectiveGrossRent = trace.record({
    key: "ingresos.rentaBrutaEfectiva",
    label: "Renta bruta efectiva mensual",
    formula: "renta bruta − renta bruta × vacíos + otros ingresos",
    inputs: { rentaBruta: grossMonthlyRent, vacios: vacancyFactor, otrosIngresos: annuity.otherMonthlyIncome },
    value: grossMonthlyRent - grossMonthlyRent * vacancyFactor + annuity.otherMonthlyIncome,
  });
  const netMonthlyRent = trace.record({
    key: "ingresos.rentaNetaMensual",
    label: "Renta neta mensual",
    formula: "renta bruta efectiva − renta bruta efectiva × deducciones",
    inputs: { rentaBrutaEfectiva: effectiveGrossRent, deducciones: deductionsRate },
    value: effectiveGrossRent - effectiveGrossRent * deductionsRate,
  });
  const netAnnualRent = trace.record({
    key: "ingresos.rentaNetaAnual",
    label: "Renta neta anual",
    formula: "renta neta mensual × 12",
    inputs: { rentaNetaMensual: netMonthlyRent },
    value: netMonthlyRent * 12,
  });

  // Option 1, as printed in TU (I78..K82). The books' own formula, kept to reproduce them.
  const effectiveDeductions = 1 - netMonthlyRent / grossMonthlyRent;
  const option1Rate = trace.record({
    key: "ingresos.tasaOpcion1",
    label: "Tasa de capitalización neta, base mercado (opción 1)",
    formula: "(renta unitaria × 12 − renta unitaria × 12 × deducciones efectivas / 100) / renta bruta",
    inputs: { rentaUnitaria: unitRent, deduccionesEfectivas: effectiveDeductions, rentaBruta: grossMonthlyRent },
    value: (unitRent * 12 - (unitRent * 12 * effectiveDeductions) / 100) / grossMonthlyRent,
  });
  const option1Value = trace.record({
    key: "ingresos.valorOpcion1",
    label: "Valor, opción 1",
    formula: "renta neta anual / tasa opción 1",
    inputs: { rentaNetaAnual: netAnnualRent, tasa: option1Rate },
    value: netAnnualRent / option1Rate,
  });

  // Option 2 (I87..K92): present value of a monthly annuity over the remaining life.
  const option2Rate = trace.record({
    key: "ingresos.tasaOpcion2",
    label: "Tasa de capitalización (opción 2)",
    formula: "(TIIE − inflación) + 1 / vida útil remanente",
    inputs: { tiie: annuity.tiie, inflacion: annuity.inflation, vidaUtilRemanente: annuity.remainingLifeYears },
    value: annuity.tiie - annuity.inflation + 1 / annuity.remainingLifeYears,
  });
  const months = annuity.remainingLifeYears * 12;
  const monthlyRate = option2Rate / 12;
  const option2Value = trace.record({
    key: "ingresos.valorOpcion2",
    label: "Valor, opción 2 (anualidad)",
    formula: "renta neta mensual × (1 − (1 + tasa / 12)^−meses) / (tasa / 12)",
    inputs: { rentaNetaMensual: netMonthlyRent, tasa: option2Rate, meses: months },
    value: (netMonthlyRent * (1 - (1 + monthlyRate) ** -months)) / monthlyRate,
  });

  const option = annuity.option;
  const value = trace.record({
    key: "ingresos.valor",
    label: "Valor por capitalización de rentas",
    formula: `opción ${option}`,
    inputs: { opcion1: option1Value, opcion2: option2Value },
    value: option === 1 ? option1Value : option2Value,
  });
  return {
    method: "anualidad",
    annuity: {
      vacancyFactor,
      effectiveGrossRent,
      option1: { rate: option1Rate, value: option1Value },
      option2: { rate: option2Rate, months, value: option2Value },
      option,
    },
    marketRate: null,
    rentMarket: base.rentMarket,
    unitRent,
    grossMonthlyRent,
    deductionsRate,
    netMonthlyRent,
    netAnnualRent,
    tableRate: null,
    appliedRate: option === 1 ? option1Rate : option2Rate,
    value,
  };
}

/**
 * Method C (TR): each comparable's annual net operating income against its
 * sale price gives a market rate; the subject's income at the mean unit
 * income, capitalized at the mean rate. Areas in m²; the books show $/Ha,
 * which cancels out. Like the books, the comparable income comes from the
 * homologated rent (a point for the appraiser, 03 §9.5).
 */
function marketRateMethod(input: IncomeApproachInput, rentMarket: HomologationResult | null, trace: Trace): IncomeApproachResult {
  const market = input.marketRate;
  if (!market) throw new Error("Faltan los precios de venta de los comparables y los gastos de operación.");
  if (!rentMarket || !input.rentMarket) throw new Error("Falta el mercado de rentas.");
  const expensesRate = trace.record({
    key: "ingresos.gastosOperacion",
    label: "Gastos de operación",
    formula: "Σ porcentajes de gasto",
    inputs: Object.fromEntries(market.expenses.map((expense) => [expense.concept, expense.rate])),
    value: market.expenses.reduce((sum, expense) => sum + expense.rate, 0),
  });

  const comparables = rentMarket.comparables.flatMap((row, index) => {
    const salePrice = market.salePrices[index];
    const area = input.rentMarket!.comparables[index]?.area;
    if (!salePrice || !area) return [];
    const scale = input.rentMarket!.unitScale ?? 1;
    const grossIncome = (row.homologatedUnitValue / scale) * area * (1 - market.negotiation);
    const netIncome = trace.record({
      key: `ingresos.ino${row.id}`,
      label: `Ingreso neto de operación anual, comparable ${row.id}`,
      formula: "renta homologada × superficie × (1 − negociación) × (1 − vacíos) × (1 − gastos)",
      inputs: { rentaHomologada: row.homologatedUnitValue, superficie: area, negociacion: market.negotiation, vacios: market.vacancy, gastos: expensesRate },
      value: grossIncome * (1 - market.vacancy) * (1 - expensesRate),
    });
    const netPrice = salePrice * (1 - market.negotiation);
    const rate = trace.record({
      key: `ingresos.tasa${row.id}`,
      label: `Tasa de mercado, comparable ${row.id}`,
      formula: "ingreso neto / precio de venta neto",
      inputs: { ingresoNeto: netIncome, precioVenta: netPrice },
      value: netIncome / netPrice,
    });
    return [{ id: row.id, netIncome, unitIncome: netIncome / area, salePrice: netPrice, rate }];
  });
  if (!comparables.length) throw new Error("Ningún comparable de renta tiene precio de venta.");

  const meanUnitIncome = comparables.reduce((sum, row) => sum + row.unitIncome, 0) / comparables.length;
  const meanRate = trace.record({
    key: "ingresos.tasaMercado",
    label: "Tasa de mercado (promedio)",
    formula: "promedio de las tasas de los comparables",
    inputs: Object.fromEntries(comparables.map((row) => [row.id, row.rate])),
    value: comparables.reduce((sum, row) => sum + row.rate, 0) / comparables.length,
  });
  const netAnnualRent = trace.record({
    key: "ingresos.rentaNetaAnual",
    label: "Ingreso neto de operación anual del sujeto",
    formula: "ingreso unitario promedio × superficie del sujeto",
    inputs: { ingresoUnitario: meanUnitIncome, superficie: market.subjectArea },
    value: meanUnitIncome * market.subjectArea,
  });
  const value = trace.record({
    key: "ingresos.valor",
    label: "Valor por capitalización de rentas",
    formula: "ingreso neto anual del sujeto / tasa de mercado",
    inputs: { ingresoNeto: netAnnualRent, tasa: meanRate },
    value: netAnnualRent / meanRate,
  });
  const retained = (1 - market.negotiation) * (1 - market.vacancy) * (1 - expensesRate);
  return {
    method: "mercado",
    annuity: null,
    marketRate: { comparables, expensesRate, meanUnitIncome, meanRate },
    rentMarket,
    unitRent: meanUnitIncome,
    grossMonthlyRent: netAnnualRent / retained / 12,
    deductionsRate: 1 - retained,
    netMonthlyRent: netAnnualRent / 12,
    netAnnualRent,
    tableRate: null,
    appliedRate: meanRate,
    value,
  };
}

/**
 * Same arithmetic as the books (row 47 to U50): per column, count × rate /
 * criteria × 100, summed left to right and divided by 100.
 */
function rateFromTable(columns: number[], rates: readonly number[]): number {
  const criteria = columns.length;
  let total = 0;
  rates.forEach((rate, column) => {
    const count = columns.filter((chosen) => chosen === column).length;
    total += count * ((rate / criteria) * 100);
  });
  return total / 100;
}

function requireValue(value: number | null | undefined, message: string): number {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
