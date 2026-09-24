/**
 * Income approach in the dictamen: generated blocks in the income section with
 * the rentable units, deductions, the rate table and the capitalized value.
 */
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, type IncomeApproachResult } from "../engine/income";
import type { Block, TableContent } from "../model";
import { RATE_TABLE_OPTIONS, type IncomeCalculationDto } from "./income-types";
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

const concepts = (prefix: string, rows: [string, string][]) =>
  rows.map(([label, value], index) => ({ id: `${prefix}-${index + 1}`, label, value, enabled: true }));

function table(id: string, title: string, columns: string[], rows: string[][]): TableContent {
  return { id, title, columns, rows, enabled: true };
}

export function incomeDocumentBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult | null): Block[] {
  if (!result) return [];
  const prefix = INCOME_BLOCK_PREFIX;
  const units = calculation.rentableUnits.filter((unit) => (unit.area ?? calculation.rentMarket.subjectArea ?? 0) > 0);
  const rows = units.map((unit) => {
    const unitArea = unit.area ?? calculation.rentMarket.subjectArea ?? 0;
    const unitRent = unit.unitRent ?? result.unitRent;
    return [unit.description || "Superficie rentable", area(unitArea), `${money.format(unitRent)} /m²/mes`, money.format(unitArea * unitRent)];
  });
  const blocks = [
    block(`${prefix}-rentas`, "CAPITALIZACIÓN DE RENTAS", {
      tables: [table(`${prefix}-tabla-rentas`, "Renta bruta mensual", ["Concepto", "Superficie rentable", "Renta unitaria", "Renta mensual"], rows)],
      concepts: concepts(`${prefix}-rentas`, [
        ["Renta bruta mensual", money.format(result.grossMonthlyRent)],
        ["Deducciones", percent(result.deductionsRate)],
        ["Renta neta mensual", money.format(result.netMonthlyRent)],
        ["Renta neta anual", money.format(result.netAnnualRent)],
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
  const ratingRows = calculation.ratingColumns.every((column) => column !== null)
    ? RATE_TABLE_CRITERIA.map((criterion, index) => {
        const column = calculation.ratingColumns[index] as number;
        return [criterion, RATE_TABLE_OPTIONS[criterion][column], percent(RATE_TABLE_RATES[column], 0)];
      })
    : [];
  blocks.push(block(`${prefix}-tasa`, "TASA DE CAPITALIZACIÓN", {
    tables: ratingRows.length ? [table(`${prefix}-tabla-tasa`, "Construcción de la tasa", ["Criterio", "Calificación", "Tasa"], ratingRows)] : [],
    concepts: concepts(`${prefix}-tasa`, [
      ...(result.tableRate !== null ? [["Tasa resultante de la tabla", percent(result.tableRate, 4)] as [string, string]] : []),
      ["Tasa aplicada", percent(result.appliedRate, 4)],
    ]),
  }));
  blocks.push(block(`${prefix}-resultado`, "RESULTADO DEL ENFOQUE DE INGRESOS", {
    concepts: concepts(`${prefix}-resultado`, [["Valor por capitalización de rentas", money.format(result.value)]]),
  }));
  return blocks;
}
