/**
 * Income approach in the dictamen: one generated block, «ENFOQUE DE
 * INGRESOS», with its subbloques numbered as the books (video 8.14, 08:25:
 * «tengo un título y tengo sus bloques… sub bloques»; «XII.1 CÁLCULO DE LA
 * RENTA MENSUAL BRUTA», «XII.2 IMPORTE DE DEDUCCIONES», «XII.3 CALCULO DE
 * TASA», «XII.4 TASA A UTILIZAR», «XII.5 DETERMINACIÓN DEL VALOR…»), every
 * datum in a table, the concluded value in the dark bar of the other
 * approaches. The rent market's dispersion stays in the rent market (08.14,
 * 01:17: «esto queda ya en mercado de rentas»).
 *
 * Deterministic: the same calculation gives the same blocks, ids and tables,
 * so a valuation saved before can be written again with them.
 */
import { RATE_TABLE_RATES, rateTableBreakdown, type IncomeApproachResult } from "../engine/income";
import type { Apartado, AppSection, Block, TableContent } from "../model";
import { cellStyleKey } from "../services/table-cell-style";
import type { TableCellStyle, TableSummaryBox, TableSummaryRow, TableV2 } from "../services/table";
import {
  concludedMonthlyRentFor,
  isRatingRow,
  rateTableOf,
  ratingColumnsFor,
  type IncomeCalculationDto,
  type RateTableRowDto,
} from "./income-types";
import { captureColumnPlace } from "./capture-display";
import {
  figure,
  figureColumn,
  generatedApartado,
  generatedBlock,
  generatedColumnId,
  generatedRowIds,
  generatedTable,
  moneyColumn,
  percent as bookPercent,
  textColumn,
} from "./generated-content";
import { isOwnTable } from "./generated-block-layout";
import { GENERATED_BLOCK_PREFIX, replaceGeneratedBlocks } from "./market-document";

export const INCOME_BLOCK_PREFIX = `${GENERATED_BLOCK_PREFIX}ingresos`;
/** The one block of the income approach. */
export const INCOME_BLOCK_ID = `${INCOME_BLOCK_PREFIX}-enfoque`;
const INCOME_TITLE = "ENFOQUE DE INGRESOS";

/** Template blocks of the income section that the generated blocks stand in for. */
export const INCOME_TEMPLATE_BLOCK_IDS = [
  "ingresos-block-1-capitalizacion-de-rentas",
  "ingresos-block-2-tasa-de-capitalizacion",
  "ingresos-block-3-resultado-del-enfoque-de-ingresos",
];

/**
 * The template's blocks of the income section are as the template left them:
 * no value written in their concepts, no table or image added. Only then do
 * the pages of an approach never saved take their place.
 */
export function incomeTemplateUntouched(section: Pick<AppSection, "blocks">): boolean {
  const ids = new Set(INCOME_TEMPLATE_BLOCK_IDS);
  const filled = (container: Pick<Block, "concepts" | "tables" | "images">) =>
    container.concepts.some((concept) => concept.value.trim() !== "") || container.tables.length > 0 || container.images.length > 0;
  return section.blocks
    .filter((item) => ids.has(item.id.toLowerCase()))
    .every((item) => !filled(item) && item.apartados.every((apartado) => !filled(apartado)));
}

/** Printed under the rate table: whose table it is (Álvaro, 24 nov 2026: «hacer la referencia de quien trabajó esa tabla»). */
export const BRAVO_ARMEJO_SOURCE = "Fuente: tabla de Bravo Armejo para la construcción de la tasa de capitalización.";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value: number, digits = 2) => `${(value * 100).toLocaleString("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
const area = (value: number) => `${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
/** The capitalized value, with the legal tender mark, as the conclusion prints it. */
const legalTender = (value: number) => `${money.format(value)} M.N.`;

/** Printed where the rate is missing: the value cannot be capitalized yet. */
export const NO_CAPITALIZATION_RATE = "Sin tasa de capitalización";
/** Printed where the rent is missing: no unit rent captured nor adopted in the rent market. */
export const NO_UNIT_RENT = "Sin renta unitaria";

const EMPTY = "—";

/**
 * A table the calculation writes, with its title printed as the tables of
 * rents and deductions always printed it: «Mostrar el título en el dictamen»
 * starts checked and unchecking it hides it (video 8.14, 20:44).
 */
function withCaption(table: TableContent): TableContent {
  const v2 = table as unknown as TableV2;
  if (!v2.schema?.hideCaption) return table;
  const { hideCaption: _hidden, ...schema } = v2.schema;
  return { ...v2, schema } as unknown as TableContent;
}

/* ------------------------------------------------------------------ */
/*  Ids: the block, its subbloques and its tables                      */
/* ------------------------------------------------------------------ */

const P = INCOME_BLOCK_PREFIX;
const apartadoId = (key: string) => `${INCOME_BLOCK_ID}-${key}`;
const UNITS_TABLE_ID = `${P}-tabla-rentas`;
const DEDUCTIONS_TABLE_ID = `${P}-tabla-deducciones`;
const DEDUCTIONS_SECOND_TABLE_ID = `${P}-tabla-deducciones-2`;
const RATE_TABLE_ID = `${P}-tabla-calculo-tasa`;
const RATE_TO_USE_TABLE_ID = `${P}-tabla-tasa-utilizar`;
const RATE_RESULT_TABLE_ID = `${P}-tabla-resultado-tasa`;
const ANNUITY_TABLE_ID = `${P}-tabla-tasa-anualidad`;
const MARKET_RATE_TABLE_ID = `${P}-tabla-tasa-mercado`;
const RESULT_TABLE_ID = `${P}-tabla-resultado`;

const rowIdOf = (tableId: string, key: string) => generatedRowIds(tableId, 1, [key])[0];

/** The rows of the value's table, by what each is. */
type ResultRow = "bruta" | "vacios" | "efectiva" | "deducciones" | "neta-mensual" | "neta-anual" | "tasa" | "sin-redondeo" | "negociacion" | "gastos";

/* ------------------------------------------------------------------ */
/*  Where each deduction goes                                          */
/* ------------------------------------------------------------------ */

/**
 * The table and row of each deduction: one table, or two side by side when
 * the appraiser divides it (video 8.14, 16:10: «me gustaría que se pudiera
 * dividir en dos»); the second starts at `split`. Both count in the total.
 */
export function deductionPlaces(count: number, split: number | null | undefined): { table: string; row: string }[] {
  const at = split && split > 0 && split < count ? split : count;
  const first = generatedRowIds(DEDUCTIONS_TABLE_ID, at);
  const second = generatedRowIds(DEDUCTIONS_SECOND_TABLE_ID, count - at);
  return [
    ...first.map((row) => ({ table: DEDUCTIONS_TABLE_ID, row })),
    ...second.map((row) => ({ table: DEDUCTIONS_SECOND_TABLE_ID, row })),
  ];
}

/* ------------------------------------------------------------------ */
/*  XII.3 Cálculo de tasa (Bravo Armejo)                               */
/* ------------------------------------------------------------------ */

/** The ids of the rows of the rate table, by the key of each. */
const rateRowIds = (rows: ReadonlyArray<RateTableRowDto>) => generatedRowIds(RATE_TABLE_ID, rows.length, rows.map((row) => row.key));

/** The rows of the rate table as they print: the options of each criterion and the 1 of each rated column in its «calificación». */
function rateTableTexts(rows: ReadonlyArray<RateTableRowDto>, ratingColumns: ReadonlyArray<number | null>): string[][] {
  let criterion = 0;
  return rows.map((row) => {
    if (!isRatingRow(row)) return [row.cells[0] ?? "", ...RATE_TABLE_RATES.map((_, column) => row.cells[column + 1] ?? "")];
    const chosen = ratingColumns[criterion] ?? null;
    criterion += 1;
    return [row.cells[0] ?? "", ...RATE_TABLE_RATES.map((_, column) => (column === chosen ? "1" : ""))];
  });
}

/** What the ratings give: the sums, the capitalization, the partial rates and the resultant rate, as the books close the table. */
function rateResultRows(ratingColumns: ReadonlyArray<number | null>): { rows: string[][]; keys: string[] } {
  const breakdown = rateTableBreakdown(ratingColumns);
  return {
    rows: [
      ["SUMA CALIFICACIONES", ...breakdown.sums.map((sum) => String(sum))],
      ["CAPITALIZACIÓN", ...breakdown.capitalization.map((value) => figure(value, 4))],
      ["TASAS PARCIALES", ...breakdown.partials.map((value) => figure(value, 4))],
      // The label in the column of the concepts, as the other results; the rate under the last rate (a word among figures read as a mistake).
      ["TASA RESULTANTE", "", "", "", "", "", breakdown.resultant === null ? EMPTY : bookPercent(breakdown.resultant, 4)],
    ],
    keys: ["suma", "capitalizacion", "parciales", "resultante"],
  };
}

/** Every cell of a table centered (video 8.10, 23:40: «centrado todo»), with the style of each row on its concept. */
function centeredCells(table: TableV2, conceptStyle: (index: number) => TableCellStyle): Record<string, TableCellStyle> {
  const styles: Record<string, TableCellStyle> = {};
  table.rows.forEach((row, index) => {
    table.columns.forEach((column, columnIndex) => {
      styles[cellStyleKey(row.id, column.id)] = columnIndex === 0 ? { align: "center", ...conceptStyle(index) } : { align: "center" };
    });
  });
  return styles;
}

const ensureV2 = (content: TableContent) => content as unknown as TableV2;
const asContent = (table: TableV2) => table as unknown as TableContent;

/**
 * «XII.3 CÁLCULO DE TASA» as the book reads (video 8.10, 23:20): CONCEPTO and
 * the six rates under TASAS, each criterion in bold with its second rows in
 * italics, and its «calificación» row; every cell centered. A row reading
 * «calificación» is shaded with the palette's alternate color wherever the
 * appraiser puts it, the others white (video 8.14, 24:20: «se debería de
 * alternar automáticamente»).
 */
function rateTable(rows: ReadonlyArray<RateTableRowDto>, ratingColumns: ReadonlyArray<number | null>): TableContent {
  const columns = [textColumn("CONCEPTO"), ...RATE_TABLE_RATES.map((rate) => figureColumn(bookPercent(rate), { group: "TASAS" }))];
  const generated = ensureV2(generatedTable(RATE_TABLE_ID, "Cálculo de tasa", columns, rateTableTexts(rows, ratingColumns), { rowKeys: rows.map((row) => row.key) }));
  const shaded = generated.rows.filter((_, index) => isRatingRow(rows[index])).map((row) => row.id);
  // The first row of each criterion in bold, as the books; its next rows in italics; «calificación» plain.
  const firstOfCriterion = rows.map((row, index) => !isRatingRow(row) && (index === 0 || isRatingRow(rows[index - 1])));
  const styles = centeredCells(generated, (index) => (isRatingRow(rows[index]) ? {} : firstOfCriterion[index] ? { bold: true } : { italic: true }));
  return asContent({ ...generated, schema: { ...generated.schema!, shadedRows: shaded, cellStyles: styles, keepTogether: true } });
}

/**
 * What the ratings give, as a table of its own under the criteria (video
 * 8.10, 24:30: «una tablita aparte… esto hasta aquí termina y esto es
 * resultado de esto»): SUMA CALIFICACIONES, CAPITALIZACIÓN (rate / criteria
 * × 100), TASAS PARCIALES and TASA RESULTANTE, in bold and centered, with
 * Bravo Armejo cited under it.
 */
function rateResultTable(ratingColumns: ReadonlyArray<number | null>): TableContent {
  const { rows, keys } = rateResultRows(ratingColumns);
  const columns = [textColumn("RESULTADO"), ...RATE_TABLE_RATES.map((rate) => figureColumn(bookPercent(rate), { group: "TASAS" }))];
  const generated = ensureV2(generatedTable(RATE_RESULT_TABLE_ID, "Resultado del cálculo de tasa", columns, rows, {
    rowKeys: keys,
    notes: [{ position: "bottom", text: BRAVO_ARMEJO_SOURCE, small: true }],
  }));
  const styles = centeredCells(generated, () => ({ bold: true }));
  const last = generated.rows.at(-1)!.id;
  styles[cellStyleKey(last, generatedColumnId(6))] = { bold: true, align: "center" };
  return asContent({ ...generated, schema: { ...generated.schema!, cellStyles: styles, keepTogether: true } });
}

/** «XII.4 TASA A UTILIZAR»: the resultant rate, the market and weighted rates when captured, and the rate applied. */
function rateToUseTable(calculation: IncomeCalculationDto, tableRate: number | null, appliedRate: number | null): TableContent {
  const shown = (value: number | null) => (value === null ? "" : bookPercent(value, 4));
  const table = ensureV2(generatedTable(RATE_TO_USE_TABLE_ID, "Tasa a utilizar", [textColumn("Concepto"), figureColumn("Tasa")], [
    ["I) Tasa resultante:", tableRate === null ? EMPTY : bookPercent(tableRate, 4)],
    ["II) Tasa obtenida de mercado:", shown(calculation.rateFromMarket ?? null)],
    ["III) Tasa ponderada:", shown(calculation.weightedRate ?? null)],
    ["IV) Tasa aplicada:", appliedRate === null ? EMPTY : bookPercent(appliedRate, 4)],
  ], { rowKeys: ["resultante", "mercado", "ponderada", "aplicada"], widthMode: "content" }));
  return asContent({ ...table, schema: { ...table.schema!, keepTogether: true } });
}

/* ------------------------------------------------------------------ */
/*  XII.5 Determinación del valor                                      */
/* ------------------------------------------------------------------ */

/** The bar of the concluded value, as the market's and the costs' (video 8.14, 26:25: «no tiene formato… denle formato»). */
const valueBox = (value: string): TableSummaryBox => ({
  id: "valor",
  position: "bottom",
  align: "end",
  rows: [{ id: "valor", label: "VALOR DE CAPITALIZACIÓN:", value, emphasis: "total" } satisfies TableSummaryRow],
});

/**
 * «DETERMINACIÓN DEL VALOR POR CAPITALIZACIÓN DE RENTAS» as the books close
 * the approach (XII.5, rows 60 to 65): the gross income, the deductions, the
 * net rents, the rate and, in the bar under them, the value.
 */
function resultTable(rows: [ResultRow, string, string][], value: string): TableContent {
  return generatedTable(RESULT_TABLE_ID, "Determinación del valor", [textColumn("Concepto"), figureColumn("Importe", { align: "right" })],
    rows.map(([, label, text]) => [label, text]),
    { rowKeys: rows.map(([key]) => key), summaryBoxes: [valueBox(value)], widthMode: "content" });
}

/* ------------------------------------------------------------------ */
/*  The block                                                          */
/* ------------------------------------------------------------------ */

/** A rentable surface with what it inherits: the subject's area of the rent market (one surface) and the rent adopted there. */
function inheritedUnits(calculation: IncomeCalculationDto, result: IncomeApproachResult | null) {
  const subjectArea = calculation.rentMarket.subjectArea;
  const adopted = calculation.rentMarket.adoptedUnitRent;
  const marketRent = adopted && adopted > 0 ? adopted : result?.unitRent ?? null;
  return calculation.rentableUnits.map((unit) => ({
    description: unit.description,
    area: unit.area ?? (calculation.rentableUnits.length === 1 && subjectArea && subjectArea > 0 ? subjectArea : null),
    unitRent: unit.unitRent ?? marketRent,
  }));
}

/**
 * The subbloques of the rate table (TCH) and annuity (TU) methods, with what
 * is captured so far: the rents and deductions are worked out as soon as
 * there are an area and a rent, whatever the rate (FAL-13: «renta mensual —»
 * until the seven criteria were rated). `capture`: every row being written,
 * also a surface without area or a deduction without its concept.
 */
function rentApartados(calculation: IncomeCalculationDto, result: IncomeApproachResult | null, options: { reason?: string; capture?: boolean }): Apartado[] {
  const all = inheritedUnits(calculation, result);
  const units = options.capture ? all : all.filter((unit) => (unit.area ?? 0) > 0);
  const priced = units.filter((unit) => (unit.area ?? 0) > 0);
  // One surface that inherits the rent market's area and rent takes the monthly rent concluded there, rounded as it was (video 8.14, 04:10).
  const concluded = concludedMonthlyRentFor(calculation);
  const gross = result
    ? result.grossMonthlyRent
    : concluded !== null
      ? concluded
      : priced.length && priced.every((unit) => unit.unitRent !== null)
        ? priced.reduce((sum, unit) => sum + (unit.area as number) * (unit.unitRent as number), 0)
        : null;
  const deductionsRate = result ? result.deductionsRate : calculation.deductions.reduce((sum, deduction) => sum + (deduction.rate ?? 0), 0);
  const net = result ? result.netMonthlyRent : gross === null ? null : gross * (1 - deductionsRate);
  const rentOr = (value: number | null) => (value === null ? NO_UNIT_RENT : money.format(value));
  const missingRent = options.capture ? EMPTY : NO_UNIT_RENT;
  const unitRows = units.map((unit) => [
    unit.description || "Superficie rentable",
    unit.area === null ? EMPTY : area(unit.area),
    unit.unitRent === null ? missingRent : `${money.format(unit.unitRent)} /m²/mes`,
    concluded !== null ? money.format(concluded) : unit.area === null || unit.unitRent === null ? missingRent : money.format(unit.area * unit.unitRent),
  ]);
  const unitsTable = withCaption(generatedTable(UNITS_TABLE_ID, "Renta bruta mensual",
    [textColumn("Concepto"), figureColumn("Superficie rentable"), moneyColumn("Renta unitaria"), moneyColumn("Renta mensual")],
    unitRows,
    { summaryBoxes: [{ id: "total", position: "bottom", align: "end", rows: [{ id: "bruta", label: "Renta bruta mensual:", value: rentOr(gross), emphasis: "strong" }] }] }));

  // The deductions, in one table or two side by side, with their total in the table (video 8.14, 21:20: «no puedo llegar al total de deducción»).
  const deductions = options.capture ? calculation.deductions : calculation.deductions.filter((deduction) => deduction.concept.trim());
  const deductionRows = deductions.map((deduction) => [
    deduction.concept,
    deduction.rate === null && options.capture ? EMPTY : percent(deduction.rate ?? 0),
    gross === null || (deduction.rate === null && options.capture) ? missingRent : money.format((deduction.rate ?? 0) * gross),
  ]);
  const places = deductionPlaces(deductionRows.length, calculation.deductionsSplit);
  const splitAt = places.findIndex((place) => place.table === DEDUCTIONS_SECOND_TABLE_ID);
  const totalBox: TableSummaryBox = {
    id: "total",
    position: "bottom",
    align: "end",
    rows: [
      { id: "porcentaje", label: "TOTAL DE DEDUCCIONES:", value: percent(deductionsRate), emphasis: "strong" },
      { id: "importe", label: "Importe mensual:", value: gross === null ? missingRent : money.format(gross * deductionsRate) },
    ],
  };
  const deductionColumns = [textColumn("Concepto"), figureColumn("Porcentaje"), moneyColumn("Importe mensual")];
  const deductionTables = (splitAt === -1
    ? [generatedTable(DEDUCTIONS_TABLE_ID, "Deducciones sobre la renta bruta", deductionColumns, deductionRows, { summaryBoxes: [totalBox] })]
    : [
        generatedTable(DEDUCTIONS_TABLE_ID, "Deducciones sobre la renta bruta", deductionColumns, deductionRows.slice(0, splitAt)),
        generatedTable(DEDUCTIONS_SECOND_TABLE_ID, "Deducciones sobre la renta bruta (continuación)", deductionColumns, deductionRows.slice(splitAt), { summaryBoxes: [totalBox] }),
      ]).map(withCaption);

  const apartados: Apartado[] = [
    generatedApartado(apartadoId("rentas"), "CÁLCULO DE LA RENTA MENSUAL BRUTA", { tables: [unitsTable] }),
    // Two tables side by side, as the books print the deductions in columns.
    withSideBySide(generatedApartado(apartadoId("deducciones"), "IMPORTE DE DEDUCCIONES", { tables: deductionTables })),
  ];

  let appliedRate: number | null;
  if (calculation.method === "anualidad") {
    const annuity = result?.annuity;
    appliedRate = annuity ? annuity.option === 2 ? annuity.option2.rate : annuity.option1.rate : null;
    const rows: [string, string, string][] = annuity
      ? [
          ["tiie", "TIIE a 28 días", percent(calculation.annuity.tiie ?? 0, 4)],
          ["inflacion", "Inflación anual estimada", percent(calculation.annuity.inflation ?? 0, 4)],
          ["recuperacion", "Recuperación del capital (1 / vida útil remanente)", percent(1 / (calculation.annuity.remainingLifeYears ?? 1), 4)],
          ["tasa", "Tasa de capitalización", percent(annuity.option2.rate, 4)],
          ["valor-presente", `Valor presente de la renta neta mensual a ${annuity.option2.months} meses`, money.format(annuity.option2.value)],
          ["tasa-mercado", "Tasa de capitalización neta, base mercado", percent(annuity.option1.rate, 4)],
          ["valor-mercado", "Valor con la tasa base mercado", money.format(annuity.option1.value)],
          ["opcion", "Valor que se concluye", annuity.option === 2 ? "Valor presente (anualidad)" : "Tasa base mercado"],
        ]
      : [["aplicada", "Tasa aplicada", "Sin datos de la anualidad: TIIE, inflación y vida útil remanente"]];
    apartados.push(generatedApartado(apartadoId("tasa"), "TASA DE CAPITALIZACIÓN", {
      tables: [generatedTable(ANNUITY_TABLE_ID, "Tasa de capitalización", [textColumn("Concepto"), figureColumn("Valor", { align: "right" })],
        rows.map(([, label, value]) => [label, value]), { rowKeys: rows.map(([key]) => key), widthMode: "content" })],
    }));
  } else {
    const rows = rateTableOf(calculation);
    const ratings = ratingColumnsFor(rows, calculation.ratingColumns);
    const tableRate = result?.tableRate ?? rateTableBreakdown(ratings).resultant;
    appliedRate = result?.appliedRate ?? calculation.appliedRate ?? tableRate;
    apartados.push(
      generatedApartado(apartadoId("tasa"), "CÁLCULO DE TASA", { tables: [rateTable(rows, ratings), rateResultTable(ratings)] }),
      generatedApartado(apartadoId("tasa-utilizar"), "TASA A UTILIZAR", { tables: [rateToUseTable(calculation, tableRate, appliedRate)] }),
    );
  }

  const missing = gross === null
    ? (options.reason ? `${NO_UNIT_RENT}: ${options.reason}` : NO_UNIT_RENT)
    : options.reason ?? NO_CAPITALIZATION_RATE;
  const rounded = result && calculation.rounding !== null && calculation.rounding !== undefined;
  const annual = result ? result.netAnnualRent : net === null ? null : net * 12;
  const resultRows: [ResultRow, string, string][] = [
    ["bruta", "Ingreso bruto mensual ($):", rentOr(gross)],
    ...(result?.annuity
      ? [
          ["vacios", "Vacíos:", `${calculation.annuity.vacancyDays ?? 0} días en ${calculation.annuity.contractYears ?? 0} años (${percent(result.annuity.vacancyFactor)})`],
          ["efectiva", "Renta bruta efectiva mensual ($):", money.format(result.annuity.effectiveGrossRent)],
        ] as [ResultRow, string, string][]
      : []),
    ["deducciones", "Total de deducciones (%):", percent(deductionsRate)],
    ["neta-mensual", "Renta neta mensual ($):", rentOr(net)],
    ["neta-anual", "Renta neta anual ($):", rentOr(annual)],
    ["tasa", "Tasa de capitalización (%):", appliedRate === null ? EMPTY : percent(appliedRate, 4)],
    ...(rounded ? [["sin-redondeo", "Valor sin redondear:", money.format(result.unroundedValue)] as [ResultRow, string, string]] : []),
  ];
  apartados.push(generatedApartado(apartadoId("resultado"), "DETERMINACIÓN DEL VALOR POR CAPITALIZACIÓN DE RENTAS", {
    tables: [resultTable(resultRows, result ? legalTender(result.value) : missing)],
  }));
  return apartados;
}

/** Two tables of a subbloque in one row, side by side; one table, as it comes. */
function withSideBySide(apartado: Apartado): Apartado {
  if (apartado.tables.length < 2) return apartado;
  return {
    ...apartado,
    contentLayout: {
      version: 2,
      rows: [{ id: `r-${apartado.id}`, columns: apartado.tables.map((table) => ({ id: `c-${table.id}`, items: [{ type: "table" as const, id: table.id }] })) }],
    },
  };
}

const incomeBlock = (apartados: Apartado[]): Block[] => (apartados.length ? [generatedBlock(INCOME_BLOCK_ID, INCOME_TITLE, { apartados })] : []);

/**
 * What the income approach can already print while the calculation is not
 * complete: the rentable units with their rents (the ones inherited from the
 * rent market too), the gross and net rents when every unit has a rent, the
 * deductions, the rate table with what is rated, and the reason the value is
 * not there yet instead of a dash in every line.
 */
export function partialIncomeBlocks(calculation: IncomeCalculationDto, reason: string): Block[] {
  if (calculation.method === "mercado") {
    const priced = Object.values(calculation.marketRate.salePrices).some((price) => price && price > 0);
    if (!priced && !calculation.rentMarket.comparables.length) return [];
    return incomeBlock([generatedApartado(apartadoId("resultado"), "DETERMINACIÓN DEL VALOR POR CAPITALIZACIÓN DE RENTAS", {
      tables: [resultTable([["tasa", "Tasa de mercado (promedio):", EMPTY]], reason)],
    })]);
  }
  return incomeBlock(rentApartados(calculation, null, { reason }));
}

export function incomeDocumentBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult | null, reason?: string): Block[] {
  if (!result) return reason ? partialIncomeBlocks(calculation, reason) : [];
  if (result.marketRate) return incomeBlock(marketRateApartados(calculation, result, result.marketRate));
  return incomeBlock(rentApartados(calculation, result, {}));
}

/**
 * Where the income approach captures in the tables of its pages: the rentable
 * surfaces, the deductions, the rows of the rate table and the 1 of each
 * criterion, the rates of «Tasa a utilizar» and the value's bar.
 */
export const INCOME_CAPTURE = {
  // By place: the tables of rents and deductions were saved with column ids of their own.
  units: { table: UNITS_TABLE_ID, description: captureColumnPlace(0), area: captureColumnPlace(1), unitRent: captureColumnPlace(2), monthly: captureColumnPlace(3) },
  deductions: {
    tables: [DEDUCTIONS_TABLE_ID, DEDUCTIONS_SECOND_TABLE_ID] as const,
    concept: captureColumnPlace(0),
    rate: captureColumnPlace(1),
    amount: captureColumnPlace(2),
    places: deductionPlaces,
  },
  /** The table of what the ratings give, under the criteria. */
  rateResult: { table: RATE_RESULT_TABLE_ID },
  /** Bravo Armejo's table: each row by its key, the column of each rate (7 % … 12 %). */
  rating: {
    table: RATE_TABLE_ID,
    rowIds: rateRowIds,
    label: generatedColumnId(0),
    column: (rate: number) => generatedColumnId(rate + 1),
  },
  rateToUse: {
    table: RATE_TO_USE_TABLE_ID,
    column: generatedColumnId(1),
    rows: {
      rateFromMarket: rowIdOf(RATE_TO_USE_TABLE_ID, "mercado"),
      weightedRate: rowIdOf(RATE_TO_USE_TABLE_ID, "ponderada"),
      appliedRate: rowIdOf(RATE_TO_USE_TABLE_ID, "aplicada"),
    },
  },
  /** «Determinación del valor»: its rows, the column of its figures and the bar of the value. */
  result: {
    table: RESULT_TABLE_ID,
    row: (key: ResultRow) => rowIdOf(RESULT_TABLE_ID, key),
    column: generatedColumnId(1),
    box: "valor.valor",
  },
  rows: (table: string, count: number) => generatedRowIds(table, count),
};

/**
 * The pages of the income approach as the editor captures in them (never
 * saved): the same blocks the dictamen gets, with every rentable surface and
 * deduction being written and the whole rate table; without a result, their
 * figures are what can be worked out already. The market-rate method (TR)
 * prints no table of what it captures: none here.
 */
export function incomeCaptureBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult | null): Block[] {
  if (calculation.method === "mercado") return [];
  return incomeBlock(rentApartados(calculation, result && !result.marketRate ? result : null, { capture: true }));
}

/** TR: the market rate from each rent comparable's income against its sale price. */
function marketRateApartados(calculation: IncomeCalculationDto, result: IncomeApproachResult, market: NonNullable<IncomeApproachResult["marketRate"]>): Apartado[] {
  const locations = new Map(calculation.rentMarket.comparables.map((row) => [String(row.reference), row.location]));
  const rounded = calculation.rounding !== null && calculation.rounding !== undefined;
  return [
    generatedApartado(apartadoId("tasa-mercado"), "TASA DE CAPITALIZACIÓN DE MERCADO", {
      tables: [generatedTable(MARKET_RATE_TABLE_ID, "Ingreso neto de operación contra precio de venta",
        [textColumn("Comparable"), moneyColumn("Ingreso neto anual"), moneyColumn("Precio de venta"), figureColumn("Tasa")],
        market.comparables.map((row) => [
          `${row.id}. ${locations.get(row.id) ?? ""}`.trim(),
          money.format(row.netIncome),
          money.format(row.salePrice),
          percent(row.rate, 4),
        ]))],
    }),
    generatedApartado(apartadoId("resultado"), "DETERMINACIÓN DEL VALOR POR CAPITALIZACIÓN DE RENTAS", {
      tables: [resultTable([
        ["negociacion", "Negociación:", percent(calculation.marketRate.negotiation ?? 0)],
        ["vacios", "Vacíos:", percent(calculation.marketRate.vacancy ?? 0)],
        ["gastos", "Gastos de operación:", percent(market.expensesRate)],
        ["tasa", "Tasa de mercado (promedio):", percent(market.meanRate, 4)],
        ["neta-anual", "Ingreso neto de operación anual del sujeto ($):", money.format(result.netAnnualRent)],
        ...(rounded ? [["sin-redondeo", "Valor sin redondear:", money.format(result.unroundedValue)] as [ResultRow, string, string]] : []),
      ], legalTender(result.value))],
    }),
  ];
}

/* ------------------------------------------------------------------ */
/*  Valuations written with the pages of before                        */
/* ------------------------------------------------------------------ */

/** The blocks of before, one per page, and the subbloque each became. */
const LEGACY_BLOCKS: Record<string, string> = {
  [`${P}-rentas`]: apartadoId("rentas"),
  [`${P}-deducciones`]: apartadoId("deducciones"),
  [`${P}-tasa`]: apartadoId("tasa"),
  [`${P}-tasa-mercado`]: apartadoId("tasa-mercado"),
  [`${P}-resultado`]: apartadoId("resultado"),
};

/**
 * Writes the income pages in the section. A valuation written before with
 * one block per page (and the rent market's dispersion among them) takes the
 * one block with its subbloques; the tables the appraiser added to those
 * blocks go to the subbloque each page became, the dispersion leaves.
 */
export function withIncomeBlocks(section: AppSection, blocks: Block[]): AppSection {
  const legacy = section.blocks.filter((block) => block.id.toLowerCase() in LEGACY_BLOCKS || block.id.toLowerCase() === `${P}-dispersion`);
  const carried = legacy.length && blocks.length
    ? blocks.map((block) => {
        if (block.id !== INCOME_BLOCK_ID) return block;
        const own = new Map<string, TableContent[]>();
        for (const old of legacy) {
          const target = LEGACY_BLOCKS[old.id.toLowerCase()];
          const tables = old.tables.filter(isOwnTable);
          if (target && tables.length) own.set(target, [...(own.get(target) ?? []), ...tables]);
        }
        return own.size
          ? { ...block, apartados: block.apartados.map((apartado) => (own.has(apartado.id) ? { ...apartado, tables: [...apartado.tables, ...own.get(apartado.id)!] } : apartado)) }
          : block;
      })
    : blocks;
  return replaceGeneratedBlocks(section, (block) => block.id.startsWith(INCOME_BLOCK_PREFIX), carried, { placeholderIds: INCOME_TEMPLATE_BLOCK_IDS });
}
