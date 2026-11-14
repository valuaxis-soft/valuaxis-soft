/**
 * Selecting cells and titles of a table to give them format at once (video
 * 5.7, 10:55 and 16:50: «seleccionar negritas… decimales a varias a la vez»):
 * the selection itself, copying and pasting with Excel, the format on all of
 * them and how the dictamen prints it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { figureColumn, generatedTable, textColumn } from "../src/features/valuations/calculation/generated-content";
import { applyTableLayout, layoutOf, withCellStyles, withTableLayouts } from "../src/features/valuations/calculation/generated-table-layout";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { TableEditorItem } from "../src/features/valuations/components/editor/table-editor";
import type { Block, TableContent } from "../src/features/valuations/model";
import {
  EMPTY_SELECTION,
  clampSelection,
  isTabularText,
  parseTabularText,
  pastePlan,
  selectAll,
  selectColumn,
  selectPoint,
  selectRow,
  selectTitle,
  selectionCount,
  selectionGrid,
  selectionPoints,
  toTabularText,
  type GridShape,
} from "../src/features/valuations/services/cell-selection";
import { buildFormulaIndex, compileFormula } from "../src/features/valuations/services/formula-references";
import { ensureTableV2, setColumnFormat, type TableV2 } from "../src/features/valuations/services/table";
import {
  TITLE_STYLE_KEY,
  bodyCellsOf,
  cellStyleKey,
  clearCellContents,
  clearTableFormat,
  headerStyleKey,
  markIsOn,
  setCellsValueFormat,
  setGeneratedCellDecimals,
  setTableCellStyles,
  tableCellStyle,
  toggleTableMark,
  writeCellTexts,
} from "../src/features/valuations/services/table-cell-style";
import { CAPTURE_FORMAT_HINT, GENERATED_UNITS_HINT, tableContextMenu, type TableMenuGroup } from "../src/features/valuations/services/table-context-menu";
import { evaluateTableFormulas, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";
import "./support/ssr-portal-shim";

/** «Medidas y colindancias» as an appraiser fills it: invented data. */
function measures(): TableV2 {
  const rows = [
    ["Al Norte", "12.5", "Calle Encino"],
    ["Al Sur", "12.5", "Lote 14"],
    ["Al Oriente", "20", "Lote 9"],
    ["Al Poniente", "20", "Calle Roble"],
  ];
  return {
    id: "t-medidas",
    title: "Medidas y colindancias",
    version: 2,
    columns: [
      { id: "rumbo", name: "Rumbo" },
      { id: "distancia", name: "Distancia" },
      { id: "colindancia", name: "Colindancia" },
    ],
    rows: rows.map((row, index) => ({
      id: `r${index + 1}`,
      cells: { rumbo: { kind: "value", value: row[0] }, distancia: { kind: "value", value: row[1] }, colindancia: { kind: "value", value: row[2] } },
    })),
  };
}

const SHAPE: GridShape = { rows: 4, cols: 3, header: true };
const keysOf = (table: TableV2, points: Array<{ row: number; col: number }>) =>
  points.map(({ row, col }) => (row < 0 ? headerStyleKey(table.columns[col].id) : cellStyleKey(table.rows[row].id, table.columns[col].id)));
const item = (groups: TableMenuGroup[], action: string) => groups.flat().find((entry) => entry.action === action)!;

/* ------------------------------------------------------------------ */
/*  1. Selecting                                                       */
/* ------------------------------------------------------------------ */

test("a drag or Shift+click selects a range, whichever way, and Ctrl/⌘+click adds a cell or takes it out", () => {
  // Click on B2, drag to C4 (the distances and the neighbors of three rows).
  let selection = selectPoint(EMPTY_SELECTION, { row: 1, col: 1 }, "replace");
  selection = selectPoint(selection, { row: 3, col: 2 }, "extend");
  assert.deepEqual(selectionPoints(selection, SHAPE), [
    { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 1 }, { row: 3, col: 2 },
  ]);
  // Dragged upward to the left, the same rectangle.
  const backwards = selectPoint(selectPoint(EMPTY_SELECTION, { row: 3, col: 2 }, "replace"), { row: 1, col: 1 }, "extend");
  assert.deepEqual(selectionPoints(backwards, SHAPE), selectionPoints(selection, SHAPE));
  // Ctrl+click adds A1; again on it, takes it out.
  const added = selectPoint(selection, { row: 0, col: 0 }, "add");
  assert.equal(selectionCount(added, SHAPE), 7);
  assert.equal(selectionCount(selectPoint(added, { row: 0, col: 0 }, "add"), SHAPE), 6);
  // A plain click starts again.
  assert.equal(selectionCount(selectPoint(added, { row: 2, col: 0 }, "replace"), SHAPE), 1);
});

test("a column's letter takes the column with its header, a row's number the row, and Ctrl/⌘+A everything with the title", () => {
  const column = selectColumn(EMPTY_SELECTION, SHAPE, 1, "replace");
  assert.deepEqual(selectionPoints(column, SHAPE).map((point) => point.row), [-1, 0, 1, 2, 3]);
  // Shift on another letter reaches it.
  assert.equal(selectionCount(selectColumn(column, SHAPE, 2, "extend"), SHAPE), 10);
  // Ctrl on another letter adds it apart.
  assert.equal(selectionCount(selectColumn(column, SHAPE, 0, "add"), SHAPE), 10);
  const row = selectRow(EMPTY_SELECTION, SHAPE, 2, "replace");
  assert.deepEqual(selectionPoints(row, SHAPE), [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }]);
  const all = selectAll(SHAPE, true);
  assert.equal(all.title, true);
  assert.equal(selectionCount(all, SHAPE), 16, "12 cells, 3 headers and the title");
  // The title alone, or joined to the cells.
  assert.deepEqual(selectTitle(row, "replace"), { ranges: [], title: true });
  assert.equal(selectionCount(selectTitle(row, "add"), SHAPE), 4);
});

test("rows deleted under a selection leave it inside the table", () => {
  const selection = selectPoint(selectPoint(EMPTY_SELECTION, { row: 1, col: 0 }, "replace"), { row: 3, col: 2 }, "extend");
  const smaller = clampSelection(selection, { rows: 2, cols: 3, header: true });
  assert.deepEqual(selectionPoints(smaller, { rows: 2, cols: 3, header: true }).map((point) => point.row), [1, 1, 1]);
  assert.equal(clampSelection(selection, SHAPE), selection, "unchanged when it fits");
});

/* ------------------------------------------------------------------ */
/*  2. Copying and pasting, also with Excel                            */
/* ------------------------------------------------------------------ */

test("what Excel copies (tabs, lines, quoted cells) reads as rows and cells, and the copy reads back the same", () => {
  assert.deepEqual(parseTabularText("Al Norte\t12.50\r\nAl Sur\t12.50\r\n"), [["Al Norte", "12.50"], ["Al Sur", "12.50"]]);
  // A cell with a line break or a tab inside comes in quotes, with its quotes doubled.
  assert.deepEqual(parseTabularText("\"Calle\nEncino\"\t\"dice \"\"sí\"\"\"\n3\t"), [["Calle\nEncino", "dice \"sí\""], ["3", ""]]);
  assert.deepEqual(parseTabularText("solo"), [["solo"]]);
  const grid = [["Calle\tA", "1,200.00"], ["dice \"no\"", ""]];
  assert.deepEqual(parseTabularText(toTabularText(grid)), grid);
  assert.equal(isTabularText("12.5"), false, "one value is pasted in its cell by the browser");
  assert.equal(isTabularText("12.5\r\n"), false, "Excel ends a single cell with a line break");
  assert.equal(isTabularText("12.5\t20"), true);
  assert.equal(isTabularText("12.5\n20"), true);
});

test("Ctrl/⌘+C copies the rectangle of the selection; cells left out of it go empty", () => {
  const table = measures();
  const read = ({ row, col }: { row: number; col: number }) => {
    if (row < 0) return table.columns[col].name;
    const cell = table.rows[row].cells[table.columns[col].id];
    return cell.kind === "value" ? cell.value : "";
  };
  const selection = selectPoint(selectPoint(EMPTY_SELECTION, { row: -1, col: 0 }, "replace"), { row: 1, col: 1 }, "extend");
  assert.equal(toTabularText(selectionGrid(selection, SHAPE, read)), "Rumbo\tDistancia\nAl Norte\t12.5\nAl Sur\t12.5");
  const scattered = selectPoint(selectPoint(EMPTY_SELECTION, { row: 0, col: 0 }, "replace"), { row: 1, col: 2 }, "add");
  assert.deepEqual(selectionGrid(scattered, SHAPE, read), [["Al Norte", "", ""], ["", "", "Lote 14"]]);
});

test("a paste goes from the top left cell of the selection, inside the table; one value fills every cell selected; a block repeats over a range that holds it whole", () => {
  const at = (row: number, col: number) => selectPoint(EMPTY_SELECTION, { row, col }, "replace");
  const plan = pastePlan(at(2, 1), SHAPE, [["20.00", "Lote 9"], ["20.00", "Calle Roble"], ["99", "fuera"]]);
  assert.deepEqual(plan.map((entry) => [entry.point.row, entry.point.col, entry.text]), [
    [2, 1, "20.00"], [2, 2, "Lote 9"], [3, 1, "20.00"], [3, 2, "Calle Roble"],
  ], "the row that does not fit is left out");
  const column = selectPoint(at(0, 1), { row: 3, col: 1 }, "extend");
  assert.deepEqual(pastePlan(column, SHAPE, [["15"]]).map((entry) => entry.point.row), [0, 1, 2, 3]);
  assert.deepEqual(pastePlan(column, SHAPE, [["a"], ["b"]]).map((entry) => entry.text), ["a", "b", "a", "b"]);
  // A whole column selected from its letter pastes from its first row, never over the header.
  assert.equal(pastePlan(selectColumn(EMPTY_SELECTION, SHAPE, 2, "replace"), SHAPE, [["x"], ["y"]])[0].point.row, 0);
});

test("the paste writes text as text and a formula that compiles as a formula, keeping each cell's format; Supr empties the cells and keeps it", () => {
  let table = setColumnFormat(measures(), "distancia", { type: "measurement", unit: "m", precision: 2 });
  table = { ...table, rows: table.rows.map((row) => (row.id === "r1" ? { ...row, cells: { ...row.cells, distancia: { kind: "value", value: "12.5", format: { type: "measurement", unit: "m", precision: 1 } } } } : row)) };
  const compile = (text: string) => {
    const compiled = compileFormula(text, { index: buildFormulaIndex([]), table });
    return compiled.ok ? compiled.formula : null;
  };
  const pasted = writeCellTexts(table, [
    { rowId: "r1", columnId: "distancia", text: "13.25" },
    { rowId: "r2", columnId: "distancia", text: "=B1*2" },
    { rowId: "r3", columnId: "colindancia", text: "Calle Fresno" },
  ], compile);
  assert.deepEqual(pasted.rows[0].cells.distancia, { kind: "value", value: "13.25", format: { type: "measurement", unit: "m", precision: 1 } });
  assert.equal(pasted.rows[1].cells.distancia.kind, "formula");
  assert.equal(getCellDisplayValue(pasted, "r2", "distancia", evaluateTableFormulas(pasted)), "26.5", "the pasted formula computes");
  const cleared = clearCellContents(pasted, [{ rowId: "r1", columnId: "distancia" }, { rowId: "r2", columnId: "distancia" }]);
  assert.deepEqual(cleared.rows[0].cells.distancia, { kind: "value", value: "", format: { type: "measurement", unit: "m", precision: 1 } });
  assert.deepEqual(cleared.rows[1].cells.distancia, { kind: "value", value: "" }, "the formula goes with what was written");
});

/* ------------------------------------------------------------------ */
/*  3. Format on all the cells at once                                 */
/* ------------------------------------------------------------------ */

test("N on a selection makes every cell bold; once all are, it takes it off; a header, bold already, loses it", () => {
  const table = measures();
  const keys = keysOf(table, [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]);
  const bold = toggleTableMark(table, keys, "bold");
  assert.ok(keys.every((key) => tableCellStyle(bold, key).bold === true));
  assert.equal(bold.schema?.zones.length, 0, "a free table keeps no zones");
  // One more cell not bold: N makes them all bold.
  const mixed = [...keys, cellStyleKey("r4", "rumbo")];
  assert.equal(markIsOn(bold, mixed, "bold"), false);
  assert.equal(markIsOn(toggleTableMark(bold, mixed, "bold"), mixed, "bold"), true);
  // All bold: off, and no style is left.
  assert.equal(toggleTableMark(bold, keys, "bold").schema?.cellStyles, undefined);
  // A header is bold by default: N takes it off, and again gives it back without a style of its own.
  const header = [headerStyleKey("rumbo")];
  const isHeader = (key: string) => key.startsWith("header:");
  const plain = toggleTableMark(table, header, "bold", isHeader);
  assert.equal(tableCellStyle(plain, header[0]).bold, false);
  assert.equal(toggleTableMark(plain, header, "bold", isHeader).schema?.cellStyles, undefined);
});

test("alignment, italic and underline go on the cells, the headers and the title alike; «Limpiar formato» takes them off and keeps what is written", () => {
  const table = measures();
  const keys = [TITLE_STYLE_KEY, headerStyleKey("distancia"), cellStyleKey("r1", "distancia"), cellStyleKey("r2", "distancia")];
  const styled = toggleTableMark(toggleTableMark(setTableCellStyles(table, keys, { align: "right" }), keys, "italic"), keys, "underline");
  assert.deepEqual(tableCellStyle(styled, TITLE_STYLE_KEY), { italic: true, underline: true, align: "right" });
  assert.deepEqual(bodyCellsOf(styled, keys), [{ rowId: "r1", columnId: "distancia" }, { rowId: "r2", columnId: "distancia" }]);
  const withFormat = setCellsValueFormat(styled, bodyCellsOf(styled, keys), { decimals: 2 });
  const clean = clearTableFormat(withFormat, keys);
  assert.equal(clean.schema?.cellStyles, undefined);
  assert.equal(clean.rows[0].cells.distancia.format, undefined);
  assert.deepEqual(clean.rows.map((row) => row.cells.distancia.kind === "value" && row.cells.distancia.value), ["12.5", "12.5", "20", "20"]);
});

test("«Unidades de valor» and «Decimales» on several cells: each keeps the other half of its own format, or of its column's", () => {
  let table = setColumnFormat(measures(), "distancia", { type: "measurement", unit: "m" });
  // The first distance had 1 decimal of its own.
  table = { ...table, rows: table.rows.map((row) => (row.id === "r1" ? { ...row, cells: { ...row.cells, distancia: { kind: "value", value: "12.5", format: { type: "number", precision: 1 } } } } : row)) };
  const cells = ["r1", "r2", "r3"].map((rowId) => ({ rowId, columnId: "distancia" }));
  const twoDecimals = setCellsValueFormat(table, cells, { decimals: 2 });
  assert.deepEqual(twoDecimals.rows.slice(0, 3).map((row) => row.cells.distancia.format), [
    { type: "number", precision: 2 },
    { type: "measurement", unit: "m", precision: 2 },
    { type: "measurement", unit: "m", precision: 2 },
  ]);
  assert.equal(twoDecimals.rows[3].cells.distancia.format, undefined, "the cell not selected keeps its column's");
  const shown = (v2: TableV2, rowId: string) => getCellDisplayValue(v2, rowId, "distancia", evaluateTableFormulas(v2));
  assert.equal(shown(twoDecimals, "r3"), "20.00 m");
  const squareMeters = setCellsValueFormat(twoDecimals, cells, { unit: { kind: "unit", unit: "m2" } });
  assert.deepEqual(squareMeters.rows[0].cells.distancia.format, { type: "measurement", unit: "m2", precision: 2 }, "the decimals stay");
  assert.equal(shown(squareMeters, "r1"), "12.50 m²");
});

test("the right click of a cell offers the format of the selection; a capture table keeps it disabled with the reason, a calculated one its decimals", () => {
  const base = { kind: "cell" as const, editable: true, hasFormula: false, hasValue: true, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true };
  const many = tableContextMenu("editable", { ...base, selected: 6 });
  assert.equal(item(many, "copy").label, "Copiar (6 celdas)");
  assert.equal(item(many, "clear").label, "Limpiar contenido (6 celdas)");
  assert.equal(item(many, "bold").disabled, undefined);
  const capture = tableContextMenu("capture", { ...base, canInsertRow: false });
  assert.equal(item(capture, "bold").disabled, true);
  assert.equal(item(capture, "bold").hint, CAPTURE_FORMAT_HINT);
  const generated = tableContextMenu("generated", { ...base, editable: false });
  assert.equal(item(generated, "bold").disabled, undefined, "bold prints, the figure stays");
  assert.equal(item(generated, "format-decimals").disabled, undefined);
  assert.equal(item(generated, "format").hint, GENERATED_UNITS_HINT);
  assert.equal(item(generated, "clear").disabled, true, "its figures are the calculation's");
});

/* ------------------------------------------------------------------ */
/*  4. The dictamen prints it, and the editor shows it                  */
/* ------------------------------------------------------------------ */

test("the dictamen prints the bold, italic, underline and alignment of cells, headers and title", () => {
  let table = measures();
  table = toggleTableMark(table, [cellStyleKey("r1", "rumbo"), cellStyleKey("r2", "rumbo")], "bold");
  table = setTableCellStyles(table, [cellStyleKey("r1", "distancia")], { align: "right", italic: true });
  table = toggleTableMark(table, [TITLE_STYLE_KEY], "underline");
  table = toggleTableMark(table, [headerStyleKey("colindancia")], "bold", () => true);
  const html = renderToStaticMarkup(createElement(DocumentTable, { table: table as unknown as TableContent, variant: "report" }));
  assert.match(html, /<caption[^>]*style="text-decoration:underline"[^>]*>Medidas y colindancias/);
  assert.match(html, /<th[^>]*style="font-weight:400"[^>]*>Colindancia<\/th>/);
  assert.match(html, /<td[^>]*style="font-weight:700"[^>]*>Al Norte<\/td>/);
  assert.match(html, /<td[^>]*style="font-style:italic;text-align:right"[^>]*>12.5<\/td>/);
  assert.match(html, /<td[^>]*>Al Oriente<\/td>/);
  assert.doesNotMatch(html, /<td[^>]*style="[^"]*"[^>]*>Al Oriente/, "a cell without style prints as before");
});

test("the editor shows the style on the cells and offers the selection, its bar and the column letters and row numbers that select", () => {
  const table = toggleTableMark(measures(), [cellStyleKey("r1", "rumbo")], "bold");
  const html = renderToStaticMarkup(createElement(TableEditorItem, {
    table: table as unknown as TableContent, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {}, readOnly: false,
  }));
  assert.match(html, /data-cell-selection-hint=""/);
  assert.match(html, /Selecciona celdas para darles formato/);
  assert.match(html, /data-grid-title=""/);
  assert.match(html, /data-grid-row="-1" data-grid-col="0"/);
  assert.match(html, /data-grid-row="3" data-grid-col="2"/);
  assert.match(html, /data-select-column="1"/);
  assert.match(html, /title="Fila 1. Clic: seleccionar la fila"/);
  assert.match(html, /value="Al Norte"[^>]*style="font-weight:700"|style="font-weight:700"[^>]*value="Al Norte"/);
});

/* ------------------------------------------------------------------ */
/*  5. Tables the calculation writes                                   */
/* ------------------------------------------------------------------ */

function costTable(): TableContent {
  return generatedTable("motor-costos-construcciones", "Construcciones", [textColumn("Ref."), figureColumn("FRe"), figureColumn("Superficie")], [
    ["1", "0.8523", "169.78 m²"],
    ["2", "0.7", "80.00 m²"],
  ]);
}

test("in a table the calculation writes, the style and decimals of its cells print, its values never change, and the next calculation keeps them", () => {
  const written = costTable();
  const printed = ensureTableV2(written);
  const [rowOne, rowTwo] = printed.rows.map((row) => row.id);
  const fre = printed.columns[1].id;
  const area = printed.columns[2].id;
  const styled = toggleTableMark(printed, [cellStyleKey(rowOne, fre), headerStyleKey(area)], "italic");
  const styles = setGeneratedCellDecimals(styled.schema?.cellStyles, [cellStyleKey(rowOne, fre), cellStyleKey(rowTwo, area)], 2);
  const formatted = ensureTableV2(applyTableLayout(written, withCellStyles(layoutOf(written), styles)));
  const results = evaluateTableFormulas(formatted);
  assert.equal(getCellDisplayValue(formatted, rowOne, fre, results), "0.85");
  assert.equal(getCellDisplayValue(formatted, rowTwo, area, results), "80.00 m²");
  assert.equal(getCellDisplayValue(formatted, rowTwo, fre, results), "0.7", "a cell not chosen prints as written");
  const value = formatted.rows[0].cells[fre];
  assert.equal(value.kind === "value" ? value.value : null, "0.8523", "the calculation's value stays");
  // The calculation writes the block again: the style is kept.
  const block = { id: "b", title: "Costos", concepts: [], images: [], apartados: [], tables: [formatted as unknown as TableContent] } as unknown as Block;
  const [again] = withTableLayouts([{ ...block, tables: [costTable()] }], [block]);
  assert.deepEqual(tableCellStyle(ensureTableV2(again.tables[0]), cellStyleKey(rowOne, fre)), { italic: true, decimals: 2 });
  const html = renderToStaticMarkup(createElement(DocumentTable, { table: again.tables[0], variant: "report" }));
  assert.match(html, /<td[^>]*style="font-style:italic"[^>]*>0.85<\/td>/);
  // Taken all out, the layout is the calculation's again.
  assert.equal(layoutOf(applyTableLayout(written, withCellStyles(layoutOf(formatted), undefined))).cellStyles, undefined);
});
