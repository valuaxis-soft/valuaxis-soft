/**
 * The income approach as the firm's books (Álvaro, observations 8.3 and 8.4,
 * 24 nov 2026, and the Grok audit FAL-13 / FAL-45): Bravo Armejo's rate table
 * «XII.3 CALCULO DE TASA» and «XII.4 TASA A UTILIZAR» with the figures of the
 * TCH book (docs/fase0/dump/TCH/09_IX_ENF_INGRESOS.txt, the same in Arandas)
 * and of his «Avalúo casa Bugambilias», the rent inherited from the rent
 * market, the rate with every decimal, the rounding with «M.N.», and the
 * tables of a generated block laid out like any block's.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { moveTableRow, placeTableAlone, placeTableBeside, tablePlacement, withAppraiserLayout } from "../src/features/valuations/calculation/generated-block-layout";
import {
  BRAVO_ARMEJO_SOURCE,
  INCOME_CAPTURE,
  INCOME_TEMPLATE_BLOCK_IDS,
  incomeCaptureBlocks,
  incomeDocumentBlocks,
  incomeTemplateUntouched,
} from "../src/features/valuations/calculation/income-document";
import { DEFAULT_ANNUITY, DEFAULT_DEDUCTIONS, DEFAULT_MARKET_RATE, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeIncomeApproach, rateTableBreakdown } from "../src/features/valuations/engine/income";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import { ensureTableV2, type TableV2 } from "../src/features/valuations/services/table";

/** TCH: 250 m² at $30, the book's deductions (31 %) and its ratings (K31, O33, K35, M37, M40, H43, R45). */
const tch: IncomeCalculationDto = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Casa habitación de 2 niveles", area: 250, unitRent: null }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: [1, 3, 1, 2, 2, 0, 4],
  appliedRate: null,
  rateFromMarket: null,
  weightedRate: null,
  rounding: null,
  rentMarket: { adoptedUnitRent: 30, subjectArea: 250, comparables: [], homologation: null },
  configured: true,
  locked: false,
};

const close = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${message ?? ""} ${actual} ≠ ${expected}`);
const resultOf = (calculation: IncomeCalculationDto) => {
  const input = toIncomeEngineInput(calculation);
  assert.ok(input.ok, input.ok ? "" : input.reason);
  return computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG);
};
const tableIn = (blocks: Block[], id: string) => ensureTableV2(blocks.flatMap((block) => block.tables).find((table) => table.id === id)!);
const text = (table: TableV2, rowId: string) => table.columns.map((column) => {
  const cell = table.rows.find((row) => row.id === rowId)?.cells[column.id];
  return cell?.kind === "value" ? cell.value : "";
});
const rowsText = (table: TableV2) => table.rows.map((row) => text(table, row.id));

test("the rate table works out as the TCH book: sums, capitalization, partial rates and 8.857142 % (rows 47 to U50)", () => {
  const breakdown = rateTableBreakdown(tch.ratingColumns);
  assert.deepEqual(breakdown.sums, [1, 2, 2, 1, 1, 0]);
  [1, 1.1428571428571428, 1.2857142857142856, 1.4285714285714286, 1.5714285714285716, 1.7142857142857144]
    .forEach((expected, column) => close(breakdown.capitalization[column], expected, `H48…U48 ${column}`));
  [1, 2.2857142857142856, 2.571428571428571, 1.4285714285714286, 1.5714285714285716, 0]
    .forEach((expected, column) => close(breakdown.partials[column], expected, `H49…U49 ${column}`));
  close(breakdown.resultant!, 0.08857142857142858, "U50");
  // With a criterion not rated there is no resultant rate yet.
  assert.equal(rateTableBreakdown([1, 3, null, 2, 2, 0, 4]).resultant, null);
});

test("the rate table of Álvaro's «Bugambilias» book gives 8.00 %", () => {
  const breakdown = rateTableBreakdown([1, 0, 1, 0, 4, 0, 1]);
  assert.deepEqual(breakdown.sums, [3, 3, 0, 0, 1, 0]);
  close(breakdown.resultant!, 0.08);
});

test("«Cálculo de tasa» prints exactly as the book: TASAS over 7 %…12 %, each criterion with its «calificación» row shaded, totals and Bravo Armejo cited", () => {
  const blocks = incomeDocumentBlocks(tch, resultOf(tch));
  const table = tableIn(blocks, INCOME_CAPTURE.rating.table);
  assert.deepEqual(table.columns.map((column) => column.name), ["CONCEPTO", "7%", "8%", "9%", "10%", "11%", "12%"]);
  assert.deepEqual(table.schema?.headerGroups?.map((group) => group.title), ["TASAS"]);
  const rows = rowsText(table);
  assert.deepEqual(rows[0], ["EDAD (AÑOS)", "0 - 5", "5 - 20", "20 - 40", "40 - 50", "50 - 60", "MÁS DE 60"]);
  assert.deepEqual(rows[1], ["calificación", "", "1", "", "", "", ""], "K31");
  assert.deepEqual(rows[3], ["calificación", "", "", "", "1", "", ""], "O33");
  assert.deepEqual(rows[8], ["REL. SUP. (TERRENO/CONSTR.)", "CONST>TERR", "CONST>TERR", "CONST>TERR", "CONST=TERR", "TERR > CONST", "TERR > CONST"]);
  assert.deepEqual(rows[9], ["RELACIÓN", "MAYOR 3-1", "HASTA 3-1", "HASTA 2-1", "1 -1", "HASTA 3-1", "MAYOR 3-1"]);
  assert.deepEqual(rows[12], ["INMUEBLE", "UNIF.", "HAB-COM", "CONDOM.", "CONDOM.", "UNIF.", "INDUSTRIA"]);
  assert.deepEqual(rows[14], ["CLASIFICACIÓN DE ZONA", "LUJO", "1ER. ORDEN", "2DO. ORDEN", "3ER. ORDEN", "PROL. SERV. COM.", "PROL. SERV. INC."]);
  assert.deepEqual(rows.slice(-4), [
    ["SUMA CALIFICACIONES", "1", "2", "2", "1", "1", "0"],
    ["CAPITALIZACIÓN", "1.0000", "1.1429", "1.2857", "1.4286", "1.5714", "1.7143"],
    ["TASAS PARCIALES", "1.0000", "2.2857", "2.5714", "1.4286", "1.5714", "0.0000"],
    ["", "", "", "", "", "TASA RESULTANTE:", "8.8571%"],
  ]);
  // Only the seven «calificación» rows take the alternate color; the rest print white.
  const shaded = new Set(table.schema?.shadedRows);
  assert.deepEqual(table.rows.filter((row) => shaded.has(row.id)).map((row) => text(table, row.id)[0]), Array(7).fill("calificación"));
  assert.deepEqual(table.schema?.notes, [{ position: "bottom", text: BRAVO_ARMEJO_SOURCE, small: true }]);
  const html = renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table: table as unknown as TableContent }));
  assert.equal((html.match(/data-shaded-row=""/g) ?? []).length, 7);
  assert.equal((html.match(/var\(--doc-zebra,#F1F5F9\)/g) ?? []).length, 7, "the palette's alternate color, with the color of always as fallback");
  assert.ok(html.includes("Fuente: tabla de Bravo Armejo para la construcción de la tasa de capitalización."));
});

test("«Tasa a utilizar»: I) resultant, II) market and III) weighted when captured, IV) the rate applied", () => {
  const blocks = incomeDocumentBlocks({ ...tch, appliedRate: 0.0886, rateFromMarket: 0.09 }, resultOf({ ...tch, appliedRate: 0.0886 }));
  const table = tableIn(blocks, INCOME_CAPTURE.rateToUse.table);
  assert.deepEqual(rowsText(table), [
    ["I) Tasa resultante:", "8.8571%"],
    ["II) Tasa obtenida de mercado:", "9.0000%"],
    ["III) Tasa ponderada:", ""],
    ["IV) Tasa aplicada:", "8.8600%"],
  ]);
  // The TCH book's value with its applied rate (I65 = I63 / I64).
  assert.equal(blocks.at(-1)!.concepts.at(-1)!.value, "$700,902.93 M.N.");
});

test("FAL-13: without a rate typed, the value divides by the table's rate with every decimal, not by the one printed", () => {
  // 8.428571 % (59 / 7): printed 8.4286 %, the audit saw a value divided by 8.43 %.
  const calculation = { ...tch, ratingColumns: [1, 1, 1, 1, 2, 2, 2] };
  const result = resultOf(calculation);
  close(result.appliedRate, 0.59 / 7);
  close(result.value, 62100 / (0.59 / 7));
  assert.notEqual(Math.round(result.value * 100), Math.round((62100 / 0.0843) * 100));
  assert.equal(Math.round(result.value * 100) / 100, 736779.66);
});

test("FAL-45: the value follows the rounding chosen and prints with «M.N.»; the unrounded one is printed beside it", () => {
  const calculation = { ...tch, appliedRate: 0.0886, rounding: -4 };
  const result = resultOf(calculation);
  assert.equal(result.value, 700000);
  close(result.unroundedValue, 700902.934537246);
  const concepts = incomeDocumentBlocks(calculation, result).at(-1)!.concepts.map((concept) => [concept.label, concept.value]);
  assert.deepEqual(concepts, [
    ["Valor por capitalización de rentas, sin redondear", "$700,902.93"],
    ["Valor por capitalización de rentas", "$700,000.00 M.N."],
  ]);
});

test("FAL-13: the rent adopted in the rent market and its subject's area flow into the rentable surface, with the rents worked out before the rate", () => {
  const calculation: IncomeCalculationDto = {
    ...tch,
    rentableUnits: [{ description: "", area: null, unitRent: null }],
    ratingColumns: [null, null, null, null, null, null, null],
    rentMarket: { adoptedUnitRent: 112, subjectArea: 248, comparables: [], homologation: null },
  };
  const input = toIncomeEngineInput(calculation);
  assert.equal(input.ok, false, "the rate is still missing");
  for (const blocks of [incomeCaptureBlocks(calculation, null), incomeDocumentBlocks(calculation, null, input.ok ? "" : input.reason)]) {
    const rents = blocks.find((block) => block.id === "motor-ingresos-rentas")!;
    const table = ensureTableV2(rents.tables[0]);
    assert.deepEqual(text(table, table.rows[0].id), ["Superficie rentable", "248.00 m²", "$112.00 /m²/mes", "$27,776.00"]);
    assert.equal(rents.concepts.find((concept) => concept.id.endsWith("-bruta"))!.value, "$27,776.00");
    assert.equal(rents.concepts.find((concept) => concept.id.endsWith("-neta-mensual"))!.value, "$19,165.44");
  }
  // One rent: the engine takes the adopted one, as the memory does.
  const rated = resultOf({ ...calculation, ratingColumns: tch.ratingColumns });
  assert.equal(rated.unitRent, 112);
  assert.equal(rated.grossMonthlyRent, 27776);
});

test("the template's income blocks give way to the pages only while nothing was written in them", () => {
  const template = (value: string): Pick<AppSection, "blocks"> => ({
    blocks: INCOME_TEMPLATE_BLOCK_IDS.map((id) => ({
      id, title: id, sectionLabel: "", enabled: true, required: false, apartados: [], tables: [], images: [],
      concepts: [{ id: `${id}-c`, label: "Tasa adoptada", value, enabled: true }],
    })),
  });
  assert.equal(incomeTemplateUntouched(template("")), true);
  assert.equal(incomeTemplateUntouched(template("8.5 % según mercado")), false);
});

/* --------------------- Tables of a generated block --------------------- */

const ownTable = { id: "tabla-propia-1", title: "Notas del valuador", columns: ["A", "B"], rows: [["x", "y"]], enabled: true } as TableContent;
const section = (blocks: Block[]): AppSection => ({ id: "ingresos", label: "XII", title: "ENFOQUE DE INGRESOS", sourceFile: "", enabled: true, required: false, blocks });

test("two tables of a generated block side by side, split again and moved, as any block's", () => {
  const rate = incomeDocumentBlocks(tch, resultOf(tch)).find((block) => block.id === "motor-ingresos-tasa")!;
  const layout = resolveContentLayout(rate);
  const [first, second] = rate.tables.map((table) => table.id);
  assert.deepEqual(tablePlacement(layout, second), { beside: true, alone: false, up: true, down: false });
  const beside = placeTableBeside(layout, second);
  assert.equal(beside.rows.length, layout.rows.length - 1);
  assert.deepEqual(beside.rows.at(-1)!.columns.map((column) => column.items[0].id), [first, second]);
  assert.deepEqual(tablePlacement(beside, second).alone, true);
  const apart = placeTableAlone(beside, second);
  assert.deepEqual(apart.rows.map((row) => row.columns.map((column) => column.items[0].id)), layout.rows.map((row) => row.columns.map((column) => column.items[0].id)));
  const moved = moveTableRow(apart, second, -1);
  assert.deepEqual(moved.rows.map((row) => row.columns[0].items[0].id), [second, first]);
});

test("the appraiser's own table and the layout stay when the calculation writes the block again", () => {
  const written = incomeDocumentBlocks(tch, resultOf(tch));
  const rate = written.find((block) => block.id === "motor-ingresos-tasa")!;
  const withOwn = { ...rate, tables: [...rate.tables, ownTable] };
  const [, toUse] = rate.tables.map((table) => table.id);
  const arranged: Block = { ...withOwn, contentLayout: placeTableBeside(resolveContentLayout(withOwn), toUse) };
  const before = section(written.map((block) => (block.id === rate.id ? arranged : block)));
  // Another rating: the rate table changes, the appraiser's table and the two tables side by side stay.
  const again = { ...tch, ratingColumns: [1, 0, 1, 0, 4, 0, 1] };
  const after = replaceGeneratedBlocks(before, (block) => block.id.startsWith("motor-ingresos"), incomeDocumentBlocks(again, resultOf(again)));
  const kept = after.blocks.find((block) => block.id === rate.id)!;
  assert.deepEqual(kept.tables.map((table) => table.id), [...rate.tables.map((table) => table.id), ownTable.id]);
  assert.ok(text(tableIn([kept], INCOME_CAPTURE.rating.table), tableIn([kept], INCOME_CAPTURE.rating.table).rows.at(-1)!.id).includes("8.0000%"));
  const rows = resolveContentLayout(kept).rows.map((row) => row.columns.map((column) => column.items[0].id));
  assert.deepEqual(rows, [[rate.tables[0].id, toUse], [ownTable.id]]);
  // Written again the same, nothing changes.
  assert.equal(replaceGeneratedBlocks(after, (block) => block.id.startsWith("motor-ingresos"), incomeDocumentBlocks(again, resultOf(again))), after);
  // A block without anything of the appraiser's is written as the calculation gives it.
  assert.equal(withAppraiserLayout(rate, undefined), rate);
});
