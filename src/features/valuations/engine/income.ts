/**
 * Income approach (capitalización de rentas), method A of
 * docs/fase0/metodologia/03-rentas-ingresos.md: the one in TCH and Arandas.
 * The TU and TR variants wait for the appraiser (question 2).
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

export type IncomeApproachInput = {
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

export type IncomeApproachResult = {
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
  const rentMarket = input.rentMarket ? homologate(input.rentMarket, config.surfaceOrientation.income, trace, "ingresos.rentas") : null;
  const unitRent = trace.record({
    key: "ingresos.rentaUnitaria",
    label: "Renta unitaria adoptada ($/m²/mes)",
    formula: input.adoptedUnitRent === undefined ? "promedio homologado de rentas" : "captura del perito",
    inputs: { sugerida: rentMarket?.stats.mean ?? null, capturada: input.adoptedUnitRent ?? null },
    value: input.adoptedUnitRent ?? requireValue(rentMarket?.stats.mean, "Falta la renta unitaria o el mercado de rentas."),
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
  return { rentMarket, unitRent, grossMonthlyRent, deductionsRate, netMonthlyRent, netAnnualRent, tableRate, appliedRate, value };
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
