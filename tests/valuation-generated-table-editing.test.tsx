/**
 * Video 5.3 (Álvaro, nov 2026): the tables the calculation writes show in the
 * editor as any configurable table and are edited the same way (headers
 * renamed and grouped, columns hidden and moved, columns and rows of his own
 * with text or formulas, format), the figures of the calculation locked; all
 * of it stays when the calculation writes the table again, and the dictamen
 * prints exactly that.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { costDocumentBlocks } from "../src/features/valuations/calculation/cost-document";
import { DEFAULT_LAND, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { figureColumn, generatedTable, moneyColumn, resultantColumn, textColumn } from "../src/features/valuations/calculation/generated-content";
import {
  applyTableLayout,
  editGeneratedTable,
  layoutFromTable,
  layoutOf,
  sourceOf,
  withTableLayouts,
} from "../src/features/valuations/calculation/generated-table-layout";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { GeneratedTableEditor } from "../src/features/valuations/components/editor/generated-table-editor";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { buildFormulaIndex, compileFormula } from "../src/features/valuations/services/formula-references";
import {
  ensureTableV2,
  getDisplayColumns,
  getTableHeaderLayout,
  groupTableHeaders,
  insertTableColumnBeside,
  insertTableRow,
  moveTableColumnTo,
  printableColumns,
  printableRows,
  removeTableColumn,
  renameTableColumn,
  setCellFormula,
  setColumnHidden,
  setRowHidden,
  setTableWidthMode,
  updateHeaderGroupTitle,
  type TableV2,
} from "../src/features/valuations/services/table";
import { tableContextMenu } from "../src/features/valuations/services/table-context-menu";
import { decodeStoredTable, encodeTableCell, serializeTableForSave } from "../src/features/valuations/services/table-persistence";
import { evaluateTableFormulas, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";
import { calculatedCellReasons, calculatedColumnReasons, calculatedRowReasons, type CalculatedTableLock } from "../src/features/valuations/components/editor/calculated-table-context";

const TABLE_ID = "motor-costos-tabla-construcciones-valores";

/** The construction values as the cost approach writes them (two constructions, figures by hand). */
const written = (rows: string[][] = [["T-1", "Casa", "1.00", "0.72", "$ 1,200,000.00"], ["T-2", "Cochera", "1.00", "0.80", "$ 200,000.00"]]) =>
  generatedTable(TABLE_ID, "Valores de las construcciones",
    [figureColumn("Ref."), textColumn("Tipo"), figureColumn("Cons.", { group: "Factores" }), resultantColumn("FRe", "Factores"), moneyColumn("Valor parcial")],
    rows,
    { rowKeys: rows.map((row) => row[0]) });

/** An edit of the editor, as the table editor sends it. */
const edit = (table: TableContent, change: (table: TableV2) => TableV2) =>
  editGeneratedTable(table, (current) => ({ ...change(ensureTableV2(current)), version: 2 }) as unknown as TableContent);

const printedNames = (table: TableContent) => printableColumns(ensureTableV2(table)).map((column) => column.name);
const printedCells = (table: TableContent) => {
  const v2 = ensureTableV2(table);
  const results = evaluateTableFormulas(v2);
  return printableRows(v2).map((row) => printableColumns(v2).map((column) => getCellDisplayValue(v2, row.id, column.id, results)));
};
const columnId = (table: TableContent, name: string) => ensureTableV2(table).columns.find((column) => column.name === name)!.id;

const block = (table: TableContent): Block => ({
  id: "motor-costos", title: "ENFOQUE DE COSTOS", sectionLabel: "", enabled: true, required: false, concepts: [], images: [], tables: [],
  apartados: [{ id: "motor-costos-construcciones", title: "B) CONSTRUCCIONES", enabled: true, concepts: [], images: [], tables: [table] }],
});
const section = (table: TableContent): AppSection => ({ id: "costos", label: "", title: "COSTOS", sourceFile: "", enabled: true, required: false, blocks: [block(table)] });
const tableOf = (next: AppSection) => next.blocks[0].apartados[0].tables[0];

/** Everything the appraiser does to the table in the editor, step by step. */
function edited() {
  let table = written();
  const fre = columnId(table, "FRe");
  const cons = columnId(table, "Cons.");
  const tipo = columnId(table, "Tipo");
  const value = columnId(table, "Valor parcial");
  table = edit(table, (v2) => renameTableColumn(v2, fre, "F. Resultante"));
  table = edit(table, (v2) => ({ ...v2, schema: updateHeaderGroupTitle(v2.schema!, v2.schema!.headerGroups![0].id, "FACTORES DE DEMÉRITO") }));
  table = edit(table, (v2) => setColumnHidden(v2, cons, true));
  table = edit(table, (v2) => moveTableColumnTo(v2, value, tipo));
  // A column of his own after the value, with a formula over the calculation's figures.
  table = edit(table, (v2) => insertTableColumnBeside(v2, fre, "right", "Valor por m²"));
  const own = getDisplayColumns(ensureTableV2(table)).find((column) => column.name === "Valor por m²")!.id;
  const firstRow = ensureTableV2(table).rows[0].id;
  table = edit(table, (v2) => {
    const formula = compileFormula(`=${columnLetterOf(v2, value)}1/100`, { table: v2, index: buildFormulaIndex([]) });
    return formula.ok ? setCellFormula(v2, firstRow, own, formula.formula) : v2;
  });
  // A row of his own at the end, with a note.
  table = edit(table, (v2) => insertTableRow(v2, v2.rows.length));
  const note = ensureTableV2(table).rows.at(-1)!.id;
  table = edit(table, (v2) => ({ ...v2, rows: v2.rows.map((row) => (row.id === note ? { ...row, cells: { ...row.cells, [tipo]: { kind: "value", value: "Nota del valuador" } } } : row)) }));
  return { table, fre, cons, tipo, value, own, note };
}

const columnLetterOf = (table: TableV2, id: string) => String.fromCharCode(65 + getDisplayColumns(table).findIndex((column) => column.id === id));

test("a table the calculation writes is edited as a configurable table: rename, group title, hide, move, own column and row", () => {
  const { table, cons, own, note } = edited();
  const v2 = ensureTableV2(table);
  assert.deepEqual(printedNames(table), ["Ref.", "Valor parcial", "Tipo", "F. Resultante", "Valor por m²"]);
  assert.deepEqual(v2.schema?.hiddenColumns, [cons], "the hidden column stays in the editor, faded");
  assert.ok(v2.columns.some((column) => column.id === cons));
  // The group keeps its title as renamed, over the factors left (Cons. hidden, the own column inserted beside FRe).
  const top = getTableHeaderLayout(v2).topRow.map((cell) => (cell.kind === "group-title" ? cell.group.title : null)).filter(Boolean);
  assert.deepEqual(top, ["FACTORES DE DEMÉRITO"]);
  assert.equal(v2.rows.at(-1)!.id, note, "the own row goes last");
  assert.ok(layoutOf(table).extraColumns?.some((column) => column.id === own && column.cells), "the formula travels in the layout");
});

test("typing over a figure of the calculation is dropped: the cell stays what the calculation wrote", () => {
  const table = written();
  const fre = columnId(table, "FRe");
  const first = ensureTableV2(table).rows[0].id;
  const typed = edit(table, (v2) => ({ ...v2, rows: v2.rows.map((row) => (row.id === first ? { ...row, cells: { ...row.cells, [fre]: { kind: "value", value: "9.99" } } } : row)) }));
  assert.equal((ensureTableV2(typed).rows[0].cells[fre] as { value: string }).value, "0.72");
  // A column of the calculation taken out is hidden, never lost.
  const removed = edit(table, (v2) => removeTableColumn(v2, fre));
  assert.deepEqual(ensureTableV2(removed).schema?.hiddenColumns, [fre]);
  assert.equal(printedNames(removed).includes("FRe"), false);
  assert.ok(ensureTableV2(removed).columns.some((column) => column.id === fre));
});

test("recalculating keeps everything the appraiser set, and his formula reads the new figures", () => {
  const { table, own, note } = edited();
  const next = replaceGeneratedBlocks(section(table), (item) => item.id === "motor-costos", [
    block(written([["T-1", "Casa", "0.90", "0.65", "$ 1,300,000.00"], ["T-2", "Cochera", "1.00", "0.80", "$ 200,000.00"], ["T-3", "Bodega", "1.00", "0.70", "$ 90,000.00"]])),
  ]);
  const again = tableOf(next);
  assert.deepEqual(printedNames(again), ["Ref.", "Valor parcial", "Tipo", "F. Resultante", "Valor por m²"]);
  const cells = printedCells(again);
  assert.deepEqual(cells.map((row) => row.slice(0, 4)), [
    ["T-1", "$ 1,300,000.00", "Casa", "0.65"],
    ["T-2", "$ 200,000.00", "Cochera", "0.80"],
    ["T-3", "$ 90,000.00", "Bodega", "0.70"],
    ["", "", "Nota del valuador", ""],
  ], "the new figures of the calculation, the new comparable and the own row last");
  assert.equal(cells[0][4], "$13,000.00", "the own formula reads the new value");
  assert.equal(ensureTableV2(again).rows.at(-1)!.id, note);
  assert.ok(getDisplayColumns(ensureTableV2(again)).some((column) => column.id === own));
  // Written again the same: nothing changes.
  assert.equal(replaceGeneratedBlocks(next, (item) => item.id === "motor-costos", [
    block(written([["T-1", "Casa", "0.90", "0.65", "$ 1,300,000.00"], ["T-2", "Cochera", "1.00", "0.80", "$ 200,000.00"], ["T-3", "Bodega", "1.00", "0.70", "$ 90,000.00"]])),
  ]), next);
});

test("a double header the appraiser combines on a table the calculation writes stays when it is written again", () => {
  let table = written();
  table = edit(table, (v2) => groupTableHeaders(v2, columnId(table, "Ref."), columnId(table, "Tipo"), "CONSTRUCCIÓN"));
  const layout = layoutOf(table);
  assert.deepEqual(layout.groups?.map((group) => group.title), ["CONSTRUCCIÓN", "Factores"]);
  const [again] = withTableLayouts([block(written())], [block(table)]);
  const top = getTableHeaderLayout(ensureTableV2(again.apartados[0].tables[0])).topRow.map((cell) => (cell.kind === "group-title" ? [cell.group.title, cell.colSpan] : cell.columnId));
  assert.deepEqual(top, [["CONSTRUCCIÓN", 2], ["Factores", 2], columnId(table, "Valor parcial")]);
});

test("hidden rows, width and format chosen in the editor are the layout, and nothing set gives back the table as written", () => {
  const table = written();
  const second = ensureTableV2(table).rows[1].id;
  const changed = edit(edit(table, (v2) => setRowHidden(v2, second, true)), (v2) => setTableWidthMode(v2, "content"));
  assert.deepEqual(layoutOf(changed).hiddenRows, [second]);
  assert.equal(layoutOf(changed).widthMode, "content");
  assert.equal(printedCells(changed).length, 1);
  // Shown again and back to the page width: the layout is empty and the table is the calculation's.
  const back = edit(edit(changed, (v2) => setRowHidden(v2, second, false)), (v2) => setTableWidthMode(v2, "page"));
  assert.deepEqual(layoutFromTable(sourceOf(back), ensureTableV2(back)), {});
  assert.deepEqual(ensureTableV2(back).schema?.generated, undefined);
});

test("the dictamen prints what the editor shows: renamed and grouped headers, without the hidden column, with the own column and row", () => {
  const { table } = edited();
  const html = renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table }));
  assert.match(html, /F\. Resultante/);
  assert.match(html, /FACTORES DE DEMÉRITO/);
  assert.match(html, /Valor por m²/);
  assert.match(html, /Nota del valuador/);
  assert.match(html, /\$12,000\.00/, "the own formula prints its result");
  assert.doesNotMatch(html, />Cons\.</, "the hidden column does not print");
});

test("the editor shows the table with the grid of the configurable tables, its figures locked with the reason", () => {
  const { table } = edited();
  const html = renderToStaticMarkup(createElement(GeneratedTableEditor, { table, readOnly: false, onUpdate: () => {} }));
  assert.match(html, /data-table-editor="motor-costos-tabla-construcciones-valores"/, "the same table editor");
  assert.match(html, /aria-label="Formato de la tabla"/);
  assert.doesNotMatch(html, /Columnas de/, "no folded «Columnas de…» lists");
  const locked = html.match(/<input[^>]*data-calculated=""[^>]*>/g) ?? [];
  assert.equal(locked.length, 2 * 5, "every cell of the calculation (2 rows × 5 columns) is locked");
  assert.ok(locked.every((input) => /readOnly=""/i.test(input) && /Esta cifra la calcula el sistema/.test(input)));
  // The header of a column of the calculation is a field to rename it.
  assert.match(html, /<textarea[^>]*data-column-header="col-4"[^>]*>F\. Resultante<\/textarea>/);
});

test("the menus of a table the calculation writes say why its figures, rows and columns stay", () => {
  const lock: CalculatedTableLock = { row: (id) => id.startsWith("r-"), column: (id) => id.startsWith("col-") && id.split("-").length === 2 };
  const cell = tableContextMenu("editable", {
    kind: "cell", editable: false, hasFormula: false, hasValue: true, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true,
    reasons: calculatedCellReasons(lock, "r-1", "col-1"),
  }).flat();
  const item = (action: string) => cell.find((entry) => entry.action === action)!;
  assert.match(item("paste").hint ?? "", /Esta cifra la calcula el sistema/);
  assert.equal(item("insert-column-right").disabled, undefined, "columns of his own are inserted beside");
  assert.equal(item("insert-row-below").disabled, undefined, "and rows");
  assert.match(item("delete-row").hint ?? "", /la escribe el cálculo/);
  assert.match(item("delete-column").hint ?? "", /la escribe el cálculo/);
  assert.equal(calculatedCellReasons(lock, "row-own", "col-9-own"), undefined, "his own cells are his");
  const column = tableContextMenu("editable", { kind: "column", canInsertBeside: true, canRename: true, canMoveLeft: true, canMoveRight: true, canDelete: true, hidden: false, canHide: true, reasons: calculatedColumnReasons(lock, "col-2") }).flat();
  assert.equal(column.find((entry) => entry.action === "rename")!.disabled, undefined);
  assert.equal(column.find((entry) => entry.action === "hide-column")!.disabled, undefined);
  assert.equal(column.find((entry) => entry.action === "sort-asc")!.disabled, true);
  const row = tableContextMenu("editable", { kind: "row", canInsert: true, canMoveUp: true, canMoveDown: true, hidden: false, canHide: true, canDelete: true, reasons: calculatedRowReasons(lock, "r-1") }).flat();
  assert.equal(row.find((entry) => entry.action === "hide-row")!.disabled, undefined);
  assert.equal(row.find((entry) => entry.action === "move-row-up")!.disabled, true);
});

/* ── Golden: the figures of the calculation do not change ─────────── */

const casa = { ref: "T-1", description: "Casa", classification: "Moderno", quality: "Media", area: 120, age: 10, usefulLife: 60 };
const costs: CostCalculationDto = {
  land: { ...DEFAULT_LAND },
  types: [casa],
  constructions: [{ ...casa, conservation: 0.9, conservationRating: null, ageFactor: 0.8, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 10000 }],
  installations: [{ ...emptyInstallation(0), ref: "1", description: "Cisterna", quantity: 1, age: 10, usefulLife: 30, conservation: 1, ageFactor: 0.5, unitReplacementCost: 20000 }],
  indirects: [],
  market: { adoptedUnitValue: null, subjectArea: null, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
};

test("golden: the cost approach writes the same figures with and without the appraiser's layout (120 m² × $10,000 × 0.72 = $864,000)", () => {
  const input = toCostEngineInput(costs);
  assert.ok(input.ok);
  const trace = new Trace();
  const result = computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace);
  // By hand, as the firm's books: FRe 0.9 × 0.8 = 0.72; VRN 120 × 10,000 = 1,200,000; VNR 864,000; cisterna 20,000 × 0.5 = 10,000.
  assert.ok(Math.abs(trace.find("costos.construcciones.T-1.factorResultante")!.value - 0.72) < 1e-12);
  assert.ok(Math.abs(trace.find("costos.construcciones.T-1.vnrParcial")!.value - 864000) < 1e-6);

  const blocks = costDocumentBlocks(costs, result, trace);
  const tables = blocks.flatMap((item) => [...item.tables, ...item.apartados.flatMap((apartado) => apartado.tables)]);
  const before = tables.map((table) => printedCells(table));
  assert.ok(before.flat(2).includes("$ 864,000.00"), "the dictamen prints the value of the construction");
  // Every table renamed, regrouped, with an own column and row and another width: the calculation's cells are the same.
  const laidOut = tables.map((table) => {
    const v2 = ensureTableV2(table);
    const first = getDisplayColumns(v2)[0];
    let next = edit(table, (current) => renameTableColumn(current, first.id, `${first.name} (valuador)`));
    next = edit(next, (current) => insertTableColumnBeside(current, first.id, "right", "Notas"));
    next = edit(next, (current) => insertTableRow(current, current.rows.length));
    return edit(next, (current) => setTableWidthMode(current, "content"));
  });
  laidOut.forEach((table, index) => {
    const source = sourceOf(table);
    const v2 = ensureTableV2(table);
    for (const row of source.rows) {
      for (const column of source.columns) {
        assert.deepEqual(v2.rows.find((item) => item.id === row.id)!.cells[column.id], row.cells[column.id], `${tables[index].id} ${row.id} ${column.id}`);
      }
    }
    assert.deepEqual(printedCells(sourceOf(table) as unknown as TableContent), before[index]);
  });
  // Recalculated with the layouts: the same figures again.
  const again = withTableLayouts(costDocumentBlocks(costs, result, trace), blocks.map((item) => ({
    ...item,
    tables: item.tables.map((table) => laidOut[tables.indexOf(table)] ?? table),
    apartados: item.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((table) => laidOut[tables.indexOf(table)] ?? table) })),
  })));
  const rewritten = again.flatMap((item) => [...item.tables, ...item.apartados.flatMap((apartado) => apartado.tables)]);
  assert.deepEqual(rewritten.map((table) => printedCells(sourceOf(table) as unknown as TableContent)), before);
  assert.ok(rewritten.every((table) => printedNames(table).includes("Notas")));
  assert.deepEqual(rewritten.map((table) => printedCells(table)), laidOut.map((table) => printedCells(table)));
  assert.equal(applyTableLayout(rewritten[0], {}) !== undefined, true);
});

test("what the appraiser set travels in the saved table and comes back the same", () => {
  const { table } = edited();
  const payload = serializeTableForSave(table);
  const reloaded = decodeStoredTable({
    id: payload.id,
    title: payload.title,
    enabled: payload.enabled,
    schema: JSON.parse(JSON.stringify(payload.schema)),
    columns: payload.columns,
    rows: payload.rows.map((row) => ({ id: row.id, cells: payload.columns.map((column) => ({ ...encodeTableCell(row.cells[column.id]), numeric: null, boolean: null, date: null })) })),
  }) as unknown as TableContent;
  assert.deepEqual(layoutOf(reloaded), layoutOf(table));
  assert.deepEqual(printedNames(reloaded), printedNames(table));
  assert.deepEqual(printedCells(reloaded), printedCells(table));
});
