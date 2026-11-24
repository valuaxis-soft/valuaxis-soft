/**
 * Income approach in the dictamen: generated blocks in the income section with
 * the rentable units, deductions, the rate table and the capitalized value.
 *
 * Deterministic: the same calculation gives the same blocks, ids and tables,
 * so a valuation saved before can be written again with them.
 */
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, rateTableBreakdown, type IncomeApproachResult } from "../engine/income";
import type { AppSection, Block, TableContent } from "../model";
import { cellStyleKey } from "../services/table-cell-style";
import type { TableCellStyle, TableV2 } from "../services/table";
import { rentMarketStats, type IncomeCalculationDto } from "./income-types";
import { captureColumnPlace } from "./capture-display";
import { figure, generatedColumnId, generatedRowIds, generatedTable, percent as bookPercent, textColumn, figureColumn } from "./generated-content";
import { GENERATED_BLOCK_PREFIX } from "./market-document";

export const INCOME_BLOCK_PREFIX = `${GENERATED_BLOCK_PREFIX}ingresos`;

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
function dispersionBlock(calculation: IncomeCalculationDto, result: IncomeApproachResult | null): Block[] {
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

/** The tables of rents and deductions as the dictamen has always saved them (their column ids are their own). */
function legacyTable(id: string, title: string, columns: string[], rows: string[][]): TableContent {
  return { id, title, columns, rows, enabled: true };
}

/** Printed where the rate is missing: the value cannot be capitalized yet. */
export const NO_CAPITALIZATION_RATE = "Sin tasa de capitalización";
/** Printed where the rent is missing: no unit rent captured nor adopted in the rent market. */
export const NO_UNIT_RENT = "Sin renta unitaria";

const EMPTY = "—";

/* ------------------------------------------------------------------ */
/*  XII.3 Cálculo de tasa (Bravo Armejo)                               */
/* ------------------------------------------------------------------ */

/**
 * The criteria of the rate table as the books print them («XII.3 CALCULO DE
 * TASA», TCH and Arandas, rows 30 to 45): what each column means, in one or
 * two rows, and under them the row where the column is rated. In the order of
 * RATE_TABLE_CRITERIA.
 */
const RATE_TABLE_ROWS: { key: string; rows: string[][] }[] = [
  { key: "edad", rows: [["EDAD (AÑOS)", "0 - 5", "5 - 20", "20 - 40", "40 - 50", "50 - 60", "MÁS DE 60"]] },
  { key: "vida-util", rows: [["VIDA ÚTIL REMANENTE", "MÁS DE 60", "50 - 60", "40 - 50", "20 - 40", "5 - 20", "TERMINADA"]] },
  { key: "conservacion", rows: [["ESTADO DE CONSERVACIÓN", "NUEVA", "MUY BUENO", "BUENO", "REGULAR", "MALO", "RUINOSO"]] },
  { key: "proyecto", rows: [["PROYECTO", "MUY BUENO", "BUENO", "ADECUADO", "REGULAR", "DEFICIENTE", "MALO"]] },
  {
    key: "relacion",
    rows: [
      ["REL. SUP. (TERRENO/CONSTR.)", "CONST>TERR", "CONST>TERR", "CONST>TERR", "CONST=TERR", "TERR > CONST", "TERR > CONST"],
      ["RELACIÓN", "MAYOR 3-1", "HASTA 3-1", "HASTA 2-1", "1 -1", "HASTA 3-1", "MAYOR 3-1"],
    ],
  },
  {
    key: "uso",
    rows: [
      ["USO DEL INMUEBLE", "CASA", "EDIF. PROD.", "DPTO/CASA", "OFNA/LOCAL", "OFNA/LOCAL", "BODEGA"],
      ["INMUEBLE", "UNIF.", "HAB-COM", "CONDOM.", "CONDOM.", "UNIF.", "INDUSTRIA"],
    ],
  },
  { key: "zona", rows: [["CLASIFICACIÓN DE ZONA", "LUJO", "1ER. ORDEN", "2DO. ORDEN", "3ER. ORDEN", "PROL. SERV. COM.", "PROL. SERV. INC."]] },
];

const RATE_TABLE_ID = `${INCOME_BLOCK_PREFIX}-tabla-calculo-tasa`;
const RATE_TO_USE_TABLE_ID = `${INCOME_BLOCK_PREFIX}-tabla-tasa-utilizar`;
/** The rated row of each criterion: «calificación», as the books. */
const RATING_LABEL = "calificación";

const rowKeyOf = (key: string, index: number) => (index === 0 ? key : `${key}-${index + 1}`);
const ratingKey = (key: string) => `calificacion-${key}`;
const rowIdOf = (tableId: string, key: string) => generatedRowIds(tableId, 1, [key])[0];

/** The rows of the rate table and the key of each, as the books lay it out; `marks` writes the 1 of each rated column. */
function rateTableRows(ratingColumns: ReadonlyArray<number | null>): { rows: string[][]; keys: string[] } {
  const rows: string[][] = [];
  const keys: string[] = [];
  RATE_TABLE_ROWS.forEach((criterion, index) => {
    criterion.rows.forEach((row, rowIndex) => {
      rows.push(row);
      keys.push(rowKeyOf(criterion.key, rowIndex));
    });
    const chosen = ratingColumns[index] ?? null;
    rows.push([RATING_LABEL, ...RATE_TABLE_RATES.map((_, column) => (column === chosen ? "1" : ""))]);
    keys.push(ratingKey(criterion.key));
  });
  const breakdown = rateTableBreakdown(RATE_TABLE_CRITERIA.map((_, index) => ratingColumns[index] ?? null));
  rows.push(["SUMA CALIFICACIONES", ...breakdown.sums.map((sum) => String(sum))]);
  keys.push("suma");
  rows.push(["CAPITALIZACIÓN", ...breakdown.capitalization.map((value) => figure(value, 4))]);
  keys.push("capitalizacion");
  rows.push(["TASAS PARCIALES", ...breakdown.partials.map((value) => figure(value, 4))]);
  keys.push("parciales");
  rows.push(["", "", "", "", "", "TASA RESULTANTE:", breakdown.resultant === null ? EMPTY : bookPercent(breakdown.resultant, 4)]);
  keys.push("resultante");
  return { rows, keys };
}

/**
 * «XII.3 CÁLCULO DE TASA» exactly as the books: CONCEPTO and the six rates
 * under TASAS, each criterion's descriptors and its «calificación» row, the
 * sums, the capitalization (rate / 7 × 100), the partial rates and the
 * resultant rate. The «calificación» rows are shaded with the palette's
 * alternate table color, the others white (24 nov 2026), and Bravo Armejo is
 * cited under it.
 */
function rateTable(ratingColumns: ReadonlyArray<number | null>): TableContent {
  const { rows, keys } = rateTableRows(ratingColumns);
  const columns = [textColumn("CONCEPTO"), ...RATE_TABLE_RATES.map((rate) => figureColumn(bookPercent(rate), { group: "TASAS" }))];
  const generated = ensureV2(generatedTable(RATE_TABLE_ID, "Cálculo de tasa", columns, rows, {
    rowKeys: keys,
    notes: [{ position: "bottom", text: BRAVO_ARMEJO_SOURCE, small: true }],
  }));
  const rowIds = generated.rows.map((row) => row.id);
  const bold: Record<string, TableCellStyle> = {};
  keys.forEach((key, index) => {
    // The criteria and the totals in bold, as the books; «calificación» and the second rows of a criterion are not.
    if (!key.startsWith("calificacion-") && !/-\d+$/.test(key)) bold[cellStyleKey(rowIds[index], generatedColumnId(0))] = { bold: true, align: "center" };
  });
  const last = rowIds.at(-1) as string;
  bold[cellStyleKey(last, generatedColumnId(5))] = { bold: true, align: "right" };
  bold[cellStyleKey(last, generatedColumnId(6))] = { bold: true };
  return {
    ...generated,
    schema: {
      ...generated.schema!,
      shadedRows: keys.flatMap((key, index) => (key.startsWith("calificacion-") ? [rowIds[index]] : [])),
      cellStyles: bold,
    },
  } as unknown as TableContent;
}

const ensureV2 = (content: TableContent) => content as unknown as TableV2;

/** «XII.4 TASA A UTILIZAR»: the resultant rate, the market and weighted rates when captured, and the rate applied. */
function rateToUseTable(calculation: IncomeCalculationDto, tableRate: number | null, appliedRate: number | null): TableContent {
  const shown = (value: number | null) => (value === null ? "" : bookPercent(value, 4));
  return generatedTable(RATE_TO_USE_TABLE_ID, "Tasa a utilizar", [textColumn("Concepto"), figureColumn("Tasa")], [
    ["I) Tasa resultante:", tableRate === null ? EMPTY : bookPercent(tableRate, 4)],
    ["II) Tasa obtenida de mercado:", shown(calculation.rateFromMarket ?? null)],
    ["III) Tasa ponderada:", shown(calculation.weightedRate ?? null)],
    ["IV) Tasa aplicada:", appliedRate === null ? EMPTY : bookPercent(appliedRate, 4)],
  ], { rowKeys: ["resultante", "mercado", "ponderada", "aplicada"], widthMode: "content" });
}

/* ------------------------------------------------------------------ */
/*  The blocks                                                         */
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
 * The blocks of the rate table (TCH) and annuity (TU) methods, with what is
 * captured so far: the rents and deductions are worked out as soon as there
 * are an area and a rent, whatever the rate (FAL-13: «renta mensual —»
 * until the seven criteria were rated). `capture`: every row being written,
 * also a surface without area or a deduction without its concept.
 */
function rentBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult | null, options: { reason?: string; capture?: boolean }): Block[] {
  const prefix = INCOME_BLOCK_PREFIX;
  const all = inheritedUnits(calculation, result);
  const units = options.capture ? all : all.filter((unit) => (unit.area ?? 0) > 0);
  const priced = units.filter((unit) => (unit.area ?? 0) > 0);
  const gross = result
    ? result.grossMonthlyRent
    : priced.length && priced.every((unit) => unit.unitRent !== null)
      ? priced.reduce((sum, unit) => sum + (unit.area as number) * (unit.unitRent as number), 0)
      : null;
  const deductionsRate = result ? result.deductionsRate : calculation.deductions.reduce((sum, deduction) => sum + (deduction.rate ?? 0), 0);
  const net = result ? result.netMonthlyRent : gross === null ? null : gross * (1 - deductionsRate);
  const rentOr = (value: number | null) => (value === null ? NO_UNIT_RENT : money.format(value));
  const rows = units.map((unit) => [
    unit.description || "Superficie rentable",
    unit.area === null ? EMPTY : area(unit.area),
    unit.unitRent === null ? (options.capture ? EMPTY : NO_UNIT_RENT) : `${money.format(unit.unitRent)} /m²/mes`,
    unit.area === null || unit.unitRent === null ? (options.capture ? EMPTY : NO_UNIT_RENT) : money.format(unit.area * unit.unitRent),
  ]);
  const deductions = options.capture ? calculation.deductions : calculation.deductions.filter((deduction) => deduction.concept.trim());
  // The capture names its columns as the calculation (col-1…), the same on every render, so a field being typed in stays in its cell.
  const table = (id: string, title: string, columns: string[], tableRows: string[][]) => (options.capture
    ? generatedTable(id, title, columns.map((name) => textColumn(name)), tableRows)
    : legacyTable(id, title, columns, tableRows));
  const blocks: Block[] = [
    ...dispersionBlock(calculation, result),
    block(`${prefix}-rentas`, "CAPITALIZACIÓN DE RENTAS", {
      tables: [table(`${prefix}-tabla-rentas`, "Renta bruta mensual", ["Concepto", "Superficie rentable", "Renta unitaria", "Renta mensual"], rows)],
      concepts: concepts(`${prefix}-rentas`, [
        ["bruta", "Renta bruta mensual", rentOr(gross)],
        ...(result?.annuity
          ? [
              ["vacios", "Vacíos", `${calculation.annuity.vacancyDays ?? 0} días en ${calculation.annuity.contractYears ?? 0} años (${percent(result.annuity.vacancyFactor)})`],
              ["efectiva", "Renta bruta efectiva mensual", money.format(result.annuity.effectiveGrossRent)],
            ] as [string, string, string][]
          : []),
        ["deducciones", "Deducciones", percent(deductionsRate)],
        ["neta-mensual", "Renta neta mensual", rentOr(net)],
        ["neta-anual", "Renta neta anual", rentOr(result ? result.netAnnualRent : net === null ? null : net * 12)],
      ]),
    }),
    block(`${prefix}-deducciones`, "DEDUCCIONES", {
      tables: [table(`${prefix}-tabla-deducciones`, "Deducciones sobre la renta bruta", ["Concepto", "Porcentaje", "Importe mensual"],
        deductions.map((deduction) => [
          deduction.concept,
          deduction.rate === null && options.capture ? EMPTY : percent(deduction.rate ?? 0),
          gross === null || (deduction.rate === null && options.capture) ? (options.capture ? EMPTY : NO_UNIT_RENT) : money.format((deduction.rate ?? 0) * gross),
        ]))],
    }),
  ];

  if (calculation.method === "anualidad") {
    const annuity = result?.annuity;
    blocks.push(block(`${prefix}-tasa`, "TASA DE CAPITALIZACIÓN", {
      concepts: concepts(`${prefix}-tasa`, annuity
        ? [
            ["tiie", "TIIE a 28 días", percent(calculation.annuity.tiie ?? 0, 4)],
            ["inflacion", "Inflación anual estimada", percent(calculation.annuity.inflation ?? 0, 4)],
            ["recuperacion", "Recuperación del capital (1 / vida útil remanente)", percent(1 / (calculation.annuity.remainingLifeYears ?? 1), 4)],
            ["tasa", "Tasa de capitalización", percent(annuity.option2.rate, 4)],
            ["valor-presente", "Valor presente de la renta neta mensual a " + annuity.option2.months + " meses", money.format(annuity.option2.value)],
            ["tasa-mercado", "Tasa de capitalización neta, base mercado", percent(annuity.option1.rate, 4)],
            ["valor-mercado", "Valor con la tasa base mercado", money.format(annuity.option1.value)],
            ["opcion", "Valor que se concluye", annuity.option === 2 ? "Valor presente (anualidad)" : "Tasa base mercado"],
          ]
        : [["aplicada", "Tasa aplicada", "Sin datos de la anualidad: TIIE, inflación y vida útil remanente"]]),
    }));
  } else {
    const tableRate = result?.tableRate ?? rateTableBreakdown(RATE_TABLE_CRITERIA.map((_, index) => calculation.ratingColumns[index] ?? null)).resultant;
    const appliedRate = result?.appliedRate ?? calculation.appliedRate ?? tableRate;
    blocks.push(block(`${prefix}-tasa`, "TASA DE CAPITALIZACIÓN", {
      tables: [rateTable(calculation.ratingColumns), rateToUseTable(calculation, tableRate, appliedRate)],
    }));
  }

  const missing = gross === null
    ? (options.reason ? `${NO_UNIT_RENT}: ${options.reason}` : NO_UNIT_RENT)
    : options.reason ?? NO_CAPITALIZATION_RATE;
  const rounded = result && calculation.rounding !== null && calculation.rounding !== undefined;
  blocks.push(block(`${prefix}-resultado`, "RESULTADO DEL ENFOQUE DE INGRESOS", {
    concepts: concepts(`${prefix}-resultado`, result
      ? [
          ...(rounded ? [["sin-redondeo", "Valor por capitalización de rentas, sin redondear", money.format(result.unroundedValue)] as [string, string, string]] : []),
          ["valor", "Valor por capitalización de rentas", legalTender(result.value)],
        ]
      : [["valor", "Valor por capitalización de rentas", missing]]),
  }));
  return blocks;
}

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
    return [block(`${INCOME_BLOCK_PREFIX}-resultado`, "RESULTADO DEL ENFOQUE DE INGRESOS", {
      concepts: concepts(`${INCOME_BLOCK_PREFIX}-resultado`, [["valor", "Valor por capitalización de rentas", reason]]),
    })];
  }
  return rentBlocks(calculation, null, { reason });
}

export function incomeDocumentBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult | null, reason?: string): Block[] {
  if (!result) return reason ? partialIncomeBlocks(calculation, reason) : [];
  if (result.marketRate) return [...dispersionBlock(calculation, result), ...marketRateBlocks(calculation, result, result.marketRate)];
  return rentBlocks(calculation, result, {});
}

/**
 * Where the income approach captures in the tables of its pages: the rentable
 * surfaces, the deductions, the 1 of each criterion of the rate table and the
 * rates of «Tasa a utilizar».
 */
export const INCOME_CAPTURE = {
  // By place: the tables of rents and deductions were saved with column ids of their own.
  units: { table: `${INCOME_BLOCK_PREFIX}-tabla-rentas`, description: captureColumnPlace(0), area: captureColumnPlace(1), unitRent: captureColumnPlace(2) },
  deductions: { table: `${INCOME_BLOCK_PREFIX}-tabla-deducciones`, concept: captureColumnPlace(0), rate: captureColumnPlace(1) },
  /** The «calificación» row of each criterion, and the column of each rate (7 % … 12 %). */
  rating: {
    table: RATE_TABLE_ID,
    row: (criterion: number) => rowIdOf(RATE_TABLE_ID, ratingKey(RATE_TABLE_ROWS[criterion].key)),
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
  return rentBlocks(calculation, result && !result.marketRate ? result : null, { capture: true });
}

/** TR: the market rate from each rent comparable's income against its sale price. */
function marketRateBlocks(calculation: IncomeCalculationDto, result: IncomeApproachResult, market: NonNullable<IncomeApproachResult["marketRate"]>): Block[] {
  const prefix = INCOME_BLOCK_PREFIX;
  const locations = new Map(calculation.rentMarket.comparables.map((row) => [String(row.reference), row.location]));
  const rounded = calculation.rounding !== null && calculation.rounding !== undefined;
  return [
    block(`${prefix}-tasa-mercado`, "TASA DE CAPITALIZACIÓN DE MERCADO", {
      tables: [legacyTable(`${prefix}-tabla-tasa-mercado`, "Ingreso neto de operación contra precio de venta",
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
        ...(rounded ? [["sin-redondeo", "Valor por capitalización de rentas, sin redondear", money.format(result.unroundedValue)] as [string, string, string]] : []),
        ["valor", "Valor por capitalización de rentas", legalTender(result.value)],
      ]),
    }),
  ];
}
