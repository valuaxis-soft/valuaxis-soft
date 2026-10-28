/**
 * Income approach in the dictamen: generated blocks in the income section with
 * the rentable units, deductions, the rate table and the capitalized value.
 */
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, type IncomeApproachResult } from "../engine/income";
import type { Block, TableContent } from "../model";
import { RATE_TABLE_OPTIONS, rentMarketStats, type IncomeCalculationDto } from "./income-types";
import { GENERATED_BLOCK_PREFIX } from "./market-document";

export const INCOME_BLOCK_PREFIX = `${GENERATED_BLOCK_PREFIX}ingresos`;

/** Template blocks of the income section that the generated blocks stand in for. */
export const INCOME_TEMPLATE_BLOCK_IDS = [
  "ingresos-block-1-capitalizacion-de-rentas",
  "ingresos-block-2-tasa-de-capitalizacion",
  "ingresos-block-3-resultado-del-enfoque-de-ingresos",
];

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value: number, digits = 2) => `${(value * 100).toLocaleString("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
const area = (value: number) => `${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

function block(id: string, title: string, parts: Partial<Pick<Block, "concepts" | "tables">>): Block {
  return { id, title, sectionLabel: "", enabled: true, required: false, concepts: parts.concepts ?? [], apartados: [], tables: parts.tables ?? [], images: [] };
}

/**
 * Concepts with an id of their own (`prefix-key`), so a label the appraiser
 * renamed follows its concept when rows before it come and go.
 */
const concepts = (prefix: string, rows: [string, string, string][]) =>
  rows.map(([key, label, value]) => ({ id: `${prefix}-${key}`, label, value, enabled: true }));

/**
 * The rent market's dispersion, as the market approach prints it: the lowest
 * and highest rents offered and homologated, and the initial and final
 * dispersions (max / min). None without rent comparables.
 */
function dispersionBlock(calculation: IncomeCalculationDto, result: IncomeApproachResult): Block[] {
  const stats = rentMarketStats(calculation, result);
  if (!stats) return [];
  const prefix = `${INCOME_BLOCK_PREFIX}-dispersion`;
  const unit = (value: number) => `${money.format(value)} /m²/mes`;
  const ratio = (value: number) => value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [block(prefix, "DISPERSIÓN DEL MERCADO DE RENTAS", {
    concepts: concepts(prefix, [
      ["oferta-minimo", "Mínimo de oferta", unit(stats.offerMin)],
      ["oferta-maximo", "Máximo de oferta", unit(stats.offerMax)],
      ["inicial", "Dispersión inicial", ratio(stats.initialDispersion)],
      ["homologado-minimo", "Mínimo homologado", unit(stats.min)],
      ["homologado-maximo", "Máximo homologado", unit(stats.max)],
      ["final", "Dispersión final", ratio(stats.dispersion)],
    ]),
  })];
}

function table(id: string, title: string, columns: string[], rows: string[][]): TableContent {
  return { id, title, columns, rows, enabled: true };
}

export function incomeDocumentBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult | null): Block[] {
  if (!result) return [];
  if (result.marketRate) return [...dispersionBlock(calculation, result), ...marketRateBlocks(calculation, result, result.marketRate)];
  const prefix = INCOME_BLOCK_PREFIX;
  const units = calculation.rentableUnits.filter((unit) => (unit.area ?? calculation.rentMarket.subjectArea ?? 0) > 0);
  const rows = units.map((unit) => {
    const unitArea = unit.area ?? calculation.rentMarket.subjectArea ?? 0;
    const unitRent = unit.unitRent ?? result.unitRent;
    return [unit.description || "Superficie rentable", area(unitArea), `${money.format(unitRent)} /m²/mes`, money.format(unitArea * unitRent)];
  });
  const blocks = [
    ...dispersionBlock(calculation, result),
    block(`${prefix}-rentas`, "CAPITALIZACIÓN DE RENTAS", {
      tables: [table(`${prefix}-tabla-rentas`, "Renta bruta mensual", ["Concepto", "Superficie rentable", "Renta unitaria", "Renta mensual"], rows)],
      concepts: concepts(`${prefix}-rentas`, [
        ["bruta", "Renta bruta mensual", money.format(result.grossMonthlyRent)],
        ...(result.annuity
          ? [
              ["vacios", "Vacíos", `${calculation.annuity.vacancyDays ?? 0} días en ${calculation.annuity.contractYears ?? 0} años (${percent(result.annuity.vacancyFactor)})`],
              ["efectiva", "Renta bruta efectiva mensual", money.format(result.annuity.effectiveGrossRent)],
            ] as [string, string, string][]
          : []),
        ["deducciones", "Deducciones", percent(result.deductionsRate)],
        ["neta-mensual", "Renta neta mensual", money.format(result.netMonthlyRent)],
        ["neta-anual", "Renta neta anual", money.format(result.netAnnualRent)],
      ]),
    }),
    block(`${prefix}-deducciones`, "DEDUCCIONES", {
      tables: [table(`${prefix}-tabla-deducciones`, "Deducciones sobre la renta bruta", ["Concepto", "Porcentaje", "Importe mensual"],
        calculation.deductions.map((deduction) => [
          deduction.concept,
          percent(deduction.rate ?? 0),
          money.format((deduction.rate ?? 0) * result.grossMonthlyRent),
        ]))],
    }),
  ];
  if (result.annuity) {
    const annuity = result.annuity;
    blocks.push(block(`${prefix}-tasa`, "TASA DE CAPITALIZACIÓN", {
      concepts: concepts(`${prefix}-tasa`, [
        ["tiie", "TIIE a 28 días", percent(calculation.annuity.tiie ?? 0, 4)],
        ["inflacion", "Inflación anual estimada", percent(calculation.annuity.inflation ?? 0, 4)],
        ["recuperacion", "Recuperación del capital (1 / vida útil remanente)", percent(1 / (calculation.annuity.remainingLifeYears ?? 1), 4)],
        ["tasa", "Tasa de capitalización", percent(annuity.option2.rate, 4)],
        ["valor-presente", "Valor presente de la renta neta mensual a " + annuity.option2.months + " meses", money.format(annuity.option2.value)],
        ["tasa-mercado", "Tasa de capitalización neta, base mercado", percent(annuity.option1.rate, 4)],
        ["valor-mercado", "Valor con la tasa base mercado", money.format(annuity.option1.value)],
        ["opcion", "Valor que se concluye", annuity.option === 2 ? "Valor presente (anualidad)" : "Tasa base mercado"],
      ]),
    }));
    blocks.push(block(`${prefix}-resultado`, "RESULTADO DEL ENFOQUE DE INGRESOS", {
      concepts: concepts(`${prefix}-resultado`, [["valor", "Valor por capitalización de rentas", money.format(result.value)]]),
    }));
    return blocks;
  }
  const ratingRows = calculation.ratingColumns.every((column) => column !== null)
    ? RATE_TABLE_CRITERIA.map((criterion, index) => {
        const column = calculation.ratingColumns[index] as number;
        return [criterion, RATE_TABLE_OPTIONS[criterion][column], percent(RATE_TABLE_RATES[column], 0)];
      })
    : [];
  blocks.push(block(`${prefix}-tasa`, "TASA DE CAPITALIZACIÓN", {
    tables: ratingRows.length ? [table(`${prefix}-tabla-tasa`, "Construcción de la tasa", ["Criterio", "Calificación", "Tasa"], ratingRows)] : [],
    concepts: concepts(`${prefix}-tasa`, [
      ...(result.tableRate !== null ? [["tabla", "Tasa resultante de la tabla", percent(result.tableRate, 4)] as [string, string, string]] : []),
      ["aplicada", "Tasa aplicada", percent(result.appliedRate, 4)],
    ]),
  }));
  blocks.push(block(`${prefix}-resultado`, "RESULTADO DEL ENFOQUE DE INGRESOS", {
    concepts: concepts(`${prefix}-resultado`, [["valor", "Valor por capitalización de rentas", money.format(result.value)]]),
  }));
  return blocks;
}

/** TR: the market rate from each rent comparable's income against its sale price. */
function marketRateBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult, market: NonNullable<IncomeApproachResult["marketRate"]>): Block[] {
  const prefix = INCOME_BLOCK_PREFIX;
  const locations = new Map(calculation.rentMarket.comparables.map((row) => [String(row.reference), row.location]));
  return [
    block(`${prefix}-tasa-mercado`, "TASA DE CAPITALIZACIÓN DE MERCADO", {
      tables: [table(`${prefix}-tabla-tasa-mercado`, "Ingreso neto de operación contra precio de venta",
        ["Comparable", "Ingreso neto anual", "Precio de venta", "Tasa"],
        market.comparables.map((row) => [
          `${row.id}. ${locations.get(row.id) ?? ""}`.trim(),
          money.format(row.netIncome),
          money.format(row.salePrice),
          percent(row.rate, 4),
        ]))],
      concepts: concepts(`${prefix}-tasa-mercado`, [
        ["negociacion", "Negociación", percent(calculation.marketRate.negotiation ?? 0)],
        ["vacios", "Vacíos", percent(calculation.marketRate.vacancy ?? 0)],
        ["gastos", "Gastos de operación", percent(market.expensesRate)],
        ["tasa", "Tasa de mercado (promedio)", percent(market.meanRate, 4)],
      ]),
    }),
    block(`${prefix}-resultado`, "RESULTADO DEL ENFOQUE DE INGRESOS", {
      concepts: concepts(`${prefix}-resultado`, [
        ["ingreso", "Ingreso neto de operación anual del sujeto", money.format(result.netAnnualRent)],
        ["valor", "Valor por capitalización de rentas", money.format(result.value)],
      ]),
    }),
  ];
}
