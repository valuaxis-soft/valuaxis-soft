/**
 * Video 8.14 of Álvaro (27 Nov 2026), the income approach: the rent market's
 * dispersion leaves it and a calculation's subbloque can be deleted; the
 * gross rent is the monthly rent concluded in the rent market, rounded as he
 * rounded it there ($31,000, not 236 m² × $130 = $30,680); one block with its
 * numbered subbloques and every datum in a table, the value in the dark bar;
 * the deductions in two tables with their total; Bravo Armejo's table with
 * the rows and criteria he adds; percentages written «3 %»; the rounding as an
 * option of the concluded value.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { captureDisplayBlocks } from "../src/features/valuations/calculation/capture-display";
import { percentUnitsText } from "../src/features/valuations/calculation/free-formula";
import { INCOME_CAPTURE, deductionPlaces, incomeCaptureBlocks, incomeDocumentBlocks, withIncomeBlocks } from "../src/features/valuations/calculation/income-document";
import {
  DEFAULT_ANNUITY,
  DEFAULT_MARKET_RATE,
  DEFAULT_RATE_TABLE,
  RATING_ROW_LABEL,
  editRateRows,
  isRatingRow,
  rateCriteriaOf,
  toIncomeEngineInput,
  withRateRows,
  type IncomeCalculationDto,
  type RateTableRowDto,
} from "../src/features/valuations/calculation/income-types";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { RoundingMenu } from "../src/features/valuations/components/calculation/rounding-menu";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import { blockMetadataFromContent, hydrateBlockMetadata } from "../src/features/valuations/metadata";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, type TableV2 } from "../src/features/valuations/services/table";

/** The case of the video: 236 m² at $130 adopted in the rent market, which concludes $31,000 rounded to thousands; the TCH deductions (31 %), 8 %. */
const bugambilias: IncomeCalculationDto = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Superficie rentable", area: null, unitRent: null }],
  deductions: [
    ["Vacíos", 0.1], ["Impuesto predial", 0.04], ["ISR", 0.04], ["Mantenimiento", 0.06], ["Administración", 0.03],
    ["Seguros", 0.03], ["Energía eléctrica", 0.01], ["Agua", 0], ["Depreciación fiscal", 0],
  ].map(([concept, rate]) => ({ concept: concept as string, rate: rate as number })),
  ratingColumns: [1, 0, 1, 0, 4, 0, 1],
  appliedRate: null,
  rateFromMarket: null,
  weightedRate: null,
  rounding: null,
  rentMarket: { adoptedUnitRent: 130, concludedMonthlyRent: 31000, subjectArea: 236, comparables: [], homologation: null },
  configured: true,
  locked: false,
};

const resultOf = (calculation: IncomeCalculationDto) => {
  const input = toIncomeEngineInput(calculation);
  assert.ok(input.ok, input.ok ? "" : input.reason);
  return computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG);
};
const tablesOf = (blocks: Block[]) => blocks.flatMap((block) => [...block.tables, ...block.apartados.flatMap((apartado) => apartado.tables)]);
const tableIn = (blocks: Block[], id: string) => ensureTableV2(tablesOf(blocks).find((table) => table.id === id)!);
const texts = (table: TableV2) => table.rows.map((row) => table.columns.map((column) => {
  const cell = row.cells[column.id];
  return cell?.kind === "value" ? cell.value : "";
}));

test("the gross rent is the monthly rent concluded in the rent market, with its rounding: $31,000, not $30,680 (video 8.14, 04:10)", () => {
  const result = resultOf(bugambilias);
  assert.equal(result.grossMonthlyRent, 31000);
  assert.equal(result.unitRent, 130);
  assert.equal(result.netMonthlyRent, 31000 * 0.69);
  assert.equal(result.netAnnualRent, 31000 * 0.69 * 12);
  assert.equal(Math.round(result.value * 100) / 100, 3208500);
  // The rents table prints it in the surface's row and under the table.
  const blocks = incomeDocumentBlocks(bugambilias, result);
  const units = tableIn(blocks, INCOME_CAPTURE.units.table);
  assert.deepEqual(texts(units)[0], ["Superficie rentable", "236.00 m²", "$130.00 /m²/mes", "$31,000.00"]);
  assert.equal(units.schema?.summaryBoxes?.[0].rows[0].value, "$31,000.00");
  // Without a concluded rent, as before: area × rent.
  const unrounded = resultOf({ ...bugambilias, rentMarket: { ...bugambilias.rentMarket, concludedMonthlyRent: null } });
  assert.equal(unrounded.grossMonthlyRent, 30680);
  // A surface of his own (another area, or its own rent) is worked out as area × rent.
  assert.equal(resultOf({ ...bugambilias, rentableUnits: [{ description: "Local", area: 200, unitRent: null }] }).grossMonthlyRent, 26000);
  assert.equal(resultOf({ ...bugambilias, rentableUnits: [{ description: "Local", area: null, unitRent: 120 }] }).grossMonthlyRent, 28320);
  // The same area typed is still the market's subject: it takes the concluded rent.
  assert.equal(resultOf({ ...bugambilias, rentableUnits: [{ description: "Local", area: 236, unitRent: null }] }).grossMonthlyRent, 31000);
});

test("the market's area and rent typed again (236 m², $130) still take the rent concluded there: $31,000, not $30,680 (QA of video 8.14, 02:46)", () => {
  const typed = { ...bugambilias, rentableUnits: [{ description: "Superficie rentable", area: 236, unitRent: 130 }] };
  const result = resultOf(typed);
  assert.equal(result.grossMonthlyRent, 31000);
  assert.equal(result.netMonthlyRent, 21390);
  assert.equal(Math.round(result.value * 100) / 100, 3208500);
  // The rents table prints the concluded rent in the surface's row, and the annuity method takes it too.
  const units = tableIn(incomeDocumentBlocks(typed, result), INCOME_CAPTURE.units.table);
  assert.deepEqual(texts(units)[0], ["Superficie rentable", "236.00 m²", "$130.00 /m²/mes", "$31,000.00"]);
  // The same figure with float noise from the market (129.999999…) is still the market's rent.
  assert.equal(resultOf({ ...typed, rentMarket: { ...typed.rentMarket, adoptedUnitRent: 130.0000001 } }).grossMonthlyRent, 31000);
  // A rent he changed on purpose, or another area, is his own: area × his rent.
  assert.equal(resultOf({ ...typed, rentableUnits: [{ description: "Superficie rentable", area: 236, unitRent: 125 }] }).grossMonthlyRent, 29500);
  assert.equal(resultOf({ ...typed, rentableUnits: [{ description: "Superficie rentable", area: 230, unitRent: 130 }] }).grossMonthlyRent, 29900);
  // Two surfaces are his own breakdown, as before.
  assert.equal(resultOf({ ...typed, rentableUnits: [{ description: "A", area: 136, unitRent: 130 }, { description: "B", area: 100, unitRent: 130 }] }).grossMonthlyRent, 30680);
});

test("every datum of the income approach is in a table and the value is in the dark bar of the other approaches (video 8.14, 13:35 and 26:25)", () => {
  const blocks = incomeDocumentBlocks({ ...bugambilias, rounding: -4 }, resultOf({ ...bugambilias, rounding: -4 }));
  const result = tableIn(blocks, INCOME_CAPTURE.result.table);
  assert.deepEqual(texts(result), [
    ["Ingreso bruto mensual ($):", "$31,000.00"],
    ["Total de deducciones (%):", "31.00 %"],
    ["Renta neta mensual ($):", "$21,390.00"],
    ["Renta neta anual ($):", "$256,680.00"],
    ["Tasa de capitalización (%):", "8.0000 %"],
    ["Valor sin redondear:", "$3,208,500.00"],
  ]);
  assert.deepEqual(result.schema?.summaryBoxes?.[0].rows, [{ id: "valor", label: "VALOR DE CAPITALIZACIÓN:", value: "$3,210,000.00 M.N.", emphasis: "total" }]);
  assert.equal(INCOME_CAPTURE.result.box, "valor.valor", "the bar the rounding menu sits on");
});

test("the deductions are divided in two tables side by side; all count, and their total closes the second (video 8.14, 16:10 and 21:20)", () => {
  const calculation = { ...bugambilias, deductionsSplit: 5 };
  const result = resultOf(calculation);
  assert.ok(Math.abs(result.deductionsRate - 0.31) < 1e-12, "the nine deductions, in both tables");
  const apartado = incomeDocumentBlocks(calculation, result)[0].apartados.find((item) => item.id.endsWith("-deducciones"))!;
  const [first, second] = apartado.tables.map((table) => ensureTableV2(table));
  assert.deepEqual(texts(first).map((row) => row[0]), ["Vacíos", "Impuesto predial", "ISR", "Mantenimiento", "Administración"]);
  assert.deepEqual(texts(second).map((row) => row[0]), ["Seguros", "Energía eléctrica", "Agua", "Depreciación fiscal"]);
  assert.equal(first.schema?.summaryBoxes, undefined);
  assert.deepEqual(second.schema?.summaryBoxes?.[0].rows.map((row) => [row.label, row.value]), [["TOTAL DE DEDUCCIONES:", "31.00 %"], ["Importe mensual:", "$9,610.00"]]);
  assert.deepEqual(apartado.contentLayout?.rows.map((row) => row.columns.map((column) => column.items[0].id)), [[first.id, second.id]], "side by side");
  // Each deduction is captured in its row of its table.
  const places = deductionPlaces(9, 5);
  assert.deepEqual(places.map((place) => place.table), [...Array(5).fill(first.id), ...Array(4).fill(second.id)]);
  assert.deepEqual(places.slice(5).map((place) => place.row), second.rows.map((row) => row.id));
  // A split past the last deduction is one table.
  assert.ok(deductionPlaces(3, 5).every((place) => place.table === first.id));
});

test("Bravo Armejo's table: a criterion he adds with its «calificación» counts, the rows alternate color by what they say (video 8.14, 24:20)", () => {
  // «TOPOGRAFÍA» added after the last criterion, with its rating row.
  const added = editRateRows(DEFAULT_RATE_TABLE, "criterion-below", DEFAULT_RATE_TABLE.length - 1);
  assert.equal(added.length, DEFAULT_RATE_TABLE.length + 2);
  assert.ok(isRatingRow(added.at(-1)!), "its «calificación» comes with it");
  const rows: RateTableRowDto[] = added.map((row, index) => (index === added.length - 2 ? { ...row, cells: ["TOPOGRAFÍA", "PLANA", "SEMIPLANA", "ASCENDENTE", "DESCENDENTE", "ACCIDENTADA", "MUY ACCIDENTADA"] } : row));
  const table = withRateRows({ rateTable: DEFAULT_RATE_TABLE, ratingColumns: bugambilias.ratingColumns }, rows);
  assert.deepEqual(table.ratingColumns, [...bugambilias.ratingColumns, null], "the ratings stay on their criteria");
  assert.equal(rateCriteriaOf(rows).at(-1)!.name, "TOPOGRAFÍA");
  // Not rated yet: the value waits for it.
  const pending = toIncomeEngineInput({ ...bugambilias, ...table });
  assert.equal(pending.ok, false);
  assert.match(pending.ok ? "" : pending.reason, /los 8 criterios/);
  // Rated at 7 %: eight criteria, each column's rate over eight (rate / 8 × 100).
  const rated = { ...bugambilias, ...table, ratingColumns: [...bugambilias.ratingColumns, 0] };
  const result = resultOf(rated);
  assert.ok(Math.abs(result.tableRate! - (3 * 0.07 + 3 * 0.08 + 0.11 + 0.07) / 8) < 1e-12);
  // Every criterion at 8 %: the rate is 8 %, with seven criteria or eight.
  assert.ok(Math.abs(resultOf({ ...rated, ratingColumns: Array(8).fill(1) }).tableRate! - 0.08) < 1e-12);

  // In the dictamen: his row and its «calificación», shaded as the others; the sums count it.
  const blocks = incomeDocumentBlocks(rated, result);
  const printed = tableIn(blocks, INCOME_CAPTURE.rating.table);
  assert.deepEqual(texts(printed).at(-2), ["TOPOGRAFÍA", "PLANA", "SEMIPLANA", "ASCENDENTE", "DESCENDENTE", "ACCIDENTADA", "MUY ACCIDENTADA"]);
  assert.deepEqual(texts(printed).at(-1), [RATING_ROW_LABEL, "1", "", "", "", "", ""]);
  assert.equal(printed.schema?.shadedRows?.length, 8);
  assert.deepEqual(texts(tableIn(blocks, INCOME_CAPTURE.rateResult.table))[0], ["SUMA CALIFICACIONES", "4", "3", "0", "0", "1", "0"]);
  // A row he types «Calificación» (any accent or capital) is a rating row: painted and counted.
  assert.ok(isRatingRow({ cells: ["CALIFICACION"] }) && isRatingRow({ cells: [" Calificación "] }) && !isRatingRow({ cells: ["Calificaciones finales"] }));
  // A row taken out takes its rating with it, the others stay on theirs.
  const withoutAge = withRateRows(table, editRateRows(editRateRows(rows, "delete", 1), "delete", 0));
  assert.deepEqual(withoutAge.ratingColumns, [...bugambilias.ratingColumns.slice(1), null]);
  // A row inserted under a criterion is one more of its rows, in italics.
  const twoRows = editRateRows(DEFAULT_RATE_TABLE, "row-below", 0);
  assert.equal(rateCriteriaOf(twoRows).length, 7);
  const styles = ensureTableV2(tablesOf(incomeDocumentBlocks({ ...bugambilias, rateTable: twoRows }, null, "x")).find((item) => item.id === INCOME_CAPTURE.rating.table)!).schema!.cellStyles!;
  const rowIds = INCOME_CAPTURE.rating.rowIds(twoRows);
  assert.equal(styles[`${rowIds[1]}:col-1`]?.italic, true);
});

test("the rate table's cells are the appraiser's: the capture holds every row with its own id", () => {
  const rows = editRateRows(DEFAULT_RATE_TABLE, "criterion-below", 2);
  const captured = tableIn(incomeCaptureBlocks({ ...bugambilias, rateTable: rows, ratingColumns: [...bugambilias.ratingColumns, null] }, null), INCOME_CAPTURE.rating.table);
  assert.deepEqual(captured.rows.map((row) => row.id), INCOME_CAPTURE.rating.rowIds(rows));
  assert.equal(new Set(INCOME_CAPTURE.rating.rowIds(rows)).size, rows.length, "unique");
  // Inserted after the «calificación» of «VIDA ÚTIL REMANENTE»: the third criterion is the new one.
  assert.equal(rateCriteriaOf(rows).length, 8);
  assert.equal(rows[4].cells[0], "");
  assert.ok(isRatingRow(rows[5]));
});

test("a percentage is written «3 %» in a field in percent: it is the 3, not 0.03 (video 8.14, 22:14)", () => {
  assert.equal(percentUnitsText("3 %"), "3");
  assert.equal(percentUnitsText("3%"), "3");
  assert.equal(percentUnitsText("2.5 %"), "2.5");
  assert.equal(percentUnitsText("3"), "3");
  assert.equal(percentUnitsText("=B1*2"), "=B1*2");
});

/* ------------------------- The block in the section ------------------------- */

const section = (blocks: Block[]): AppSection => ({ id: "ingresos", label: "XIII", title: "ENF. INGRESOS", sourceFile: "", enabled: true, required: false, blocks });
const ownTable = { id: "tabla-propia-1", title: "Tabla configurable", columns: ["Concepto", "Porcentaje"], rows: [["Seguros", "3%"]], enabled: true } as TableContent;
const legacyBlock = (id: string, tables: TableContent[] = []): Block => ({ id, title: id, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables, images: [] });

test("a valuation written with one block per page takes the one block; his tables go to their subbloque, the dispersion leaves (video 8.14, 00:20)", () => {
  const old = section([
    legacyBlock("motor-ingresos-dispersion"),
    legacyBlock("motor-ingresos-rentas"),
    legacyBlock("motor-ingresos-deducciones", [ownTable]),
    legacyBlock("motor-ingresos-tasa"),
    legacyBlock("motor-ingresos-resultado"),
    legacyBlock("propio-del-valuador"),
  ]);
  const next = withIncomeBlocks(old, incomeDocumentBlocks(bugambilias, resultOf(bugambilias)));
  assert.deepEqual(next.blocks.map((block) => block.id), ["motor-ingresos-enfoque", "propio-del-valuador"]);
  const deductions = next.blocks[0].apartados.find((apartado) => apartado.id.endsWith("-deducciones"))!;
  assert.deepEqual(deductions.tables.map((table) => table.id), ["motor-ingresos-tabla-deducciones", ownTable.id]);
  // Written again, his table stays in its subbloque and nothing changes.
  const again = withIncomeBlocks(next, incomeDocumentBlocks(bugambilias, resultOf(bugambilias)));
  assert.equal(again, next);
});

test("a subbloque of a calculation is deleted, not only hidden: it is not written again, and it comes back when the list is undone (video 8.14, 01:47)", () => {
  const written = withIncomeBlocks(section([]), incomeDocumentBlocks(bugambilias, resultOf(bugambilias)));
  const block = written.blocks[0];
  const gone = block.apartados[1].id;
  const deleted = section([{ ...block, apartados: block.apartados.filter((apartado) => apartado.id !== gone), removedApartados: [gone] }]);
  const again = replaceGeneratedBlocks(deleted, (item) => item.id.startsWith("motor-ingresos"), incomeDocumentBlocks(bugambilias, resultOf({ ...bugambilias, appliedRate: 0.09 })));
  assert.ok(!again.blocks[0].apartados.some((apartado) => apartado.id === gone));
  assert.deepEqual(again.blocks[0].removedApartados, [gone], "the deletion is kept");
  // Nor is it captured in.
  const shown = captureDisplayBlocks(deleted.blocks, { blocks: incomeCaptureBlocks(bugambilias, null), placeholderIds: [] });
  assert.ok(!shown[0].block.apartados.some((apartado) => apartado.id === gone));
  // Saved and opened again, the deletion is there.
  const saved = blockMetadataFromContent(deleted.blocks[0]);
  assert.deepEqual(hydrateBlockMetadata({ kind: "block", payload: saved }).removedApartados, [gone]);
  assert.equal(hydrateBlockMetadata({ kind: "block", payload: {} }).removedApartados, undefined);
  // Without the list, it is written again.
  const restored = replaceGeneratedBlocks(section([{ ...deleted.blocks[0], removedApartados: undefined }]), (item) => item.id.startsWith("motor-ingresos"), incomeDocumentBlocks(bugambilias, resultOf(bugambilias)));
  assert.ok(restored.blocks[0].apartados.some((apartado) => apartado.id === gone));
});

test("the rounding is an option of the concluded value: «⋯» and the right click, not a box apart (video 8.14, 05:20)", () => {
  const html = renderToStaticMarkup(<RoundingMenu label="valor por ingresos" value={-3} onChange={() => undefined}>$3,209,000.00</RoundingMenu>);
  assert.ok(html.includes("$3,209,000.00"));
  assert.match(html, /aria-label="Redondeo del valor por ingresos"/);
  assert.match(html, /data-rounding-menu="-3"/);
  assert.match(html, /a miles/);
  // It sits in a line of text too (the conclusion's «vinculado con … $X»): no block inside a paragraph.
  assert.doesNotMatch(html, /<div/);
  // Read only: the value and what it is rounded to, no menu.
  const locked = renderToStaticMarkup(<RoundingMenu label="valor por ingresos" value={null} readOnly onChange={() => undefined}>$3,208,500.00</RoundingMenu>);
  assert.ok(!locked.includes("data-rounding-trigger"));
  assert.match(locked, /sin redondeo/);
});
