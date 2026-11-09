import assert from "node:assert/strict";
import test from "node:test";
import { parseDecimal } from "../src/features/valuations/calculation/free-formula";
import { constructionTypesLinkedToCosts } from "../src/features/valuations/calculation/cost-types";
import { normalizeNumericConceptInput, normalizeNumericInput } from "../src/features/valuations/services/concept-value-format";
import { columnLetter, compileFormula, formulaToText, buildFormulaIndex } from "../src/features/valuations/services/formula-references";
import {
  NUMERIC_CELL_MESSAGE,
  fillRowWithFormula,
  isNumericCell,
  numericCellProblem,
  printableColumns,
  printableRows,
  readTypedNumber,
  setCellFormula,
  setCellResultFormat,
  setColumnFormat,
  setColumnHidden,
  setColumnWidth,
  columnWidthOf,
  setRowHidden,
  setTableDecimals,
  sortTableRows,
  tableDecimals,
  type TableV2,
} from "../src/features/valuations/services/table";
import {
  CAPTURE_FORMAT_HINT,
  GENERATED_STRUCTURE_HINT,
  NO_FORMULA_HINT,
  tableContextMenu,
  type TableMenuItem,
} from "../src/features/valuations/services/table-context-menu";
import { evaluateTableFormulas, getCellDisplayValue, readSourceNumber } from "../src/features/valuations/services/table-formula-engine";

/* ------------------------------------------------------------------ */
/*  Builders                                                           */
/* ------------------------------------------------------------------ */

function tableOf(columns: string[], rows: string[][]): TableV2 {
  return {
    id: "t",
    title: "Tabla",
    version: 2,
    columns: columns.map((name, index) => ({ id: `c${index + 1}`, name })),
    rows: rows.map((row, rowIndex) => ({
      id: `r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`c${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

const NO_INDEX = buildFormulaIndex([]);

function typed(table: TableV2, address: string, text: string): TableV2 {
  const compiled = compileFormula(text, { index: NO_INDEX, table });
  assert.ok(compiled.ok, `${text} compiles${compiled.ok ? "" : `: ${compiled.message}`}`);
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, columnIndex) => columnLetter(columnIndex) === letters)!;
  return setCellFormula(table, table.rows[Number(number) - 1].id, column.id, compiled.formula);
}

function shown(table: TableV2, address: string): string {
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, columnIndex) => columnLetter(columnIndex) === letters)!;
  return getCellDisplayValue(table, table.rows[Number(number) - 1].id, column.id, evaluateTableFormulas(table));
}

const textOf = (table: TableV2, rowId: string, columnId: string) => {
  const cell = table.rows.find((row) => row.id === rowId)!.cells[columnId];
  return cell.kind === "formula" ? formulaToText(cell.formula, { index: NO_INDEX, table }) : `value:${cell.value}`;
};

const item = (items: TableMenuItem[][], action: string, label?: string) =>
  items.flat().find((candidate) => candidate.action === action && (label === undefined || candidate.label === label))!;

/* ------------------------------------------------------------------ */
/*  Percentages                                                        */
/* ------------------------------------------------------------------ */

test("«10%» typed in a cell is a tenth for the formulas, with or without a space, and with its sign", () => {
  assert.deepEqual(readSourceNumber("10%"), { kind: "number", value: 0.1, money: false });
  assert.deepEqual(readSourceNumber("10 %"), { kind: "number", value: 0.1, money: false });
  assert.deepEqual(readSourceNumber("-5%"), { kind: "number", value: -0.05, money: false });
  assert.equal(readTypedNumber("12.5%"), 0.125);
  assert.equal(readTypedNumber("abc"), null);

  let table = tableOf(["Concepto", "Dato", "Porcentaje"], [["Norte", "200", "10%"]]);
  table = typed(table, "B1", "=200*C1");
  assert.equal(shown(table, "B1"), "20");
});

test("the numeric fields of the calculation panels and the numeric concepts read a percentage too", () => {
  assert.equal(parseDecimal("10%"), 0.1);
  assert.equal(parseDecimal("10 %"), 0.1);
  assert.equal(parseDecimal("-5%"), -0.05);
  assert.equal(parseDecimal("%"), null);
  assert.equal(normalizeNumericInput("10%"), "0.1");
  assert.equal(normalizeNumericInput("-5 %"), "-0.05");
  assert.equal(normalizeNumericInput("1,250%"), "12.5");
  // A concept shown as a percentage stores the number before the sign: "10" prints "10 %".
  assert.equal(normalizeNumericConceptInput("10%", { type: "number", valueFormat: "percent" }), "10");
  assert.equal(normalizeNumericConceptInput("10%", { type: "number" }), "0.1");
  assert.equal(normalizeNumericInput("12.5"), "12.5", "a plain number stays as before");
});

/* ------------------------------------------------------------------ */
/*  Numeric cells                                                      */
/* ------------------------------------------------------------------ */

test("letters in a numeric cell are marked and left out of the calculations; numbers with units pass", () => {
  let table = tableOf(["Concepto", "Dato"], [["Norte", "abc"], ["Sur", "$ 9,000.00"], ["Este", "10 %"], ["Oeste", ""]]);
  assert.equal(numericCellProblem(table, "c2", table.rows[0].cells.c2), null, "a free column takes any text");

  table = setColumnFormat(table, "c2", { type: "number", precision: 2 });
  assert.ok(isNumericCell(table, "c2", table.rows[0].cells.c2));
  assert.equal(numericCellProblem(table, "c2", table.rows[0].cells.c2), NUMERIC_CELL_MESSAGE);
  assert.equal(numericCellProblem(table, "c2", table.rows[1].cells.c2), null);
  assert.equal(numericCellProblem(table, "c2", table.rows[2].cells.c2), null);
  assert.equal(numericCellProblem(table, "c2", table.rows[3].cells.c2), null, "an empty cell is not a mistake");
  assert.equal(numericCellProblem(table, "c1", table.rows[0].cells.c1), null, "the text column is still text");

  // The sum skips the text; arithmetic with it is #VALOR!.
  table = typed(table, "B4", "=SUMA(B1:B3)");
  assert.equal(shown(table, "B4"), "$9,000.10");
  const withProduct = typed(table, "B4", "=B1*2");
  assert.equal(shown(withProduct, "B4"), "#VALOR!");

  // A cell's own format marks it numeric too, and writes the number as the format says.
  const money = setCellResultFormat(tableOf(["A"], [["1500"], ["x"]]), "r1", "c1", { type: "currency", precision: 2 });
  assert.equal(shown(money, "A1"), "$1,500.00");
  const text = setCellResultFormat(money, "r2", "c1", { type: "currency", precision: 2 });
  assert.equal(numericCellProblem(text, "c1", text.rows[1].cells.c1), NUMERIC_CELL_MESSAGE);
  assert.equal(shown(text, "A2"), "x", "what was typed stays in view, marked");
  // Without the format the column still holds figures (two amounts and a sum), so the letters are still marked;
  // given the text format, it takes any text.
  const back = setColumnFormat(table, "c2", null);
  assert.equal(numericCellProblem(back, "c2", back.rows[0].cells.c2), NUMERIC_CELL_MESSAGE);
  const asText = setColumnFormat(table, "c2", { type: "text" });
  assert.equal(numericCellProblem(asText, "c2", asText.rows[0].cells.c2), null);
});

/* ------------------------------------------------------------------ */
/*  Copying a formula across the row                                   */
/* ------------------------------------------------------------------ */

test("copying a formula across the row moves the columns of its references and keeps the ones fixed with $", () => {
  let table = tableOf(["Base", "Factor", "Ene", "Feb", "Mar"], [["100", "1.5", "", "", ""], ["2", "3", "", "", ""]]);
  table = typed(table, "C1", "=$A1*B1");
  table = fillRowWithFormula(table, "r1", "c3");
  assert.equal(textOf(table, "r1", "c4"), "$A1*C1", "the fixed column stays, the relative one moves");
  assert.equal(textOf(table, "r1", "c5"), "$A1*D1");
  assert.equal(textOf(table, "r1", "c1"), "value:100", "cells with a value are not overwritten");
  assert.equal(textOf(table, "r1", "c2"), "value:1.5");
  assert.equal(shown(table, "C1"), "150");
  assert.equal(shown(table, "D1"), "15,000");
  assert.equal(shown(table, "E1"), "1,500,000");

  // Overwriting copies to the left too, and a reference past the first column reads #REF!.
  const everywhere = fillRowWithFormula(typed(table, "C2", "=B2*A2"), "r2", "c3", { overwrite: true });
  assert.equal(textOf(everywhere, "r2", "c2"), "A2*#REF!");
  assert.equal(textOf(everywhere, "r2", "c4"), "C2*B2");
  assert.equal(shown(everywhere, "B2"), "#REF!");

  // A range of the row grows with the copies; a column fixed at its start stays.
  let summed = tableOf(["A", "B", "C", "D"], [["1", "2", "3", ""]]);
  summed = typed(summed, "D1", "=SUMA($A1:C1)");
  summed = fillRowWithFormula(typed(summed, "B1", "=SUMA($A1:A1)"), "r1", "c2", { overwrite: true });
  assert.equal(textOf(summed, "r1", "c3"), "SUMA($A1:B1)");
  assert.equal(textOf(summed, "r1", "c4"), "SUMA($A1:C1)");
  // A cell without a formula copies nothing.
  const plain = tableOf(["A", "B"], [["1", "2"]]);
  assert.equal(fillRowWithFormula(plain, "r1", "c1"), plain);
});

/* ------------------------------------------------------------------ */
/*  Decimals of the table                                              */
/* ------------------------------------------------------------------ */

test("the decimals of a table apply to the results of its formulas, not to a cell with a format of its own", () => {
  let table = tableOf(["A", "B", "C", "D"], [["10", "3", "", ""]]);
  table = typed(table, "C1", "=A1/B1");
  table = typed(table, "D1", "=A1/B1");
  table = setCellResultFormat(table, "r1", "c4", { type: "number", precision: 1 });
  assert.equal(shown(table, "C1"), "3.3333", "four decimals until the table says otherwise");

  const two = setTableDecimals(table, 2);
  assert.equal(tableDecimals(two), 2);
  assert.equal(shown(two, "C1"), "3.33");
  assert.equal(shown(two, "D1"), "3.3", "the cell keeps its own format");

  const none = setTableDecimals(table, 0);
  assert.equal(shown(none, "C1"), "3");
  assert.equal(tableDecimals(setTableDecimals(table, 9)), 4, "never more than four");
  assert.equal(tableDecimals(setTableDecimals(two, null)), undefined);
  assert.equal(shown(setTableDecimals(two, null), "C1"), "3.3333");

  // Money keeps its sign and takes the decimals asked.
  let money = tableOf(["A", "B"], [["$ 1,000.50", ""]]);
  money = typed(money, "B1", "=A1*3");
  assert.equal(shown(setTableDecimals(money, 0), "B1"), "$3,002");
  assert.equal(shown(setTableDecimals(money, 2), "B1"), "$3,001.50");
});

/* ------------------------------------------------------------------ */
/*  Sorting, hiding and widths                                         */
/* ------------------------------------------------------------------ */

test("sorting by a column puts numbers before texts and empty cells last, and the formulas keep reading their rows", () => {
  let table = tableOf(["Concepto", "Dato"], [["Norte", "20"], ["Sur", ""], ["Este", "abc"], ["Oeste", "5"], ["Centro", "Árbol"]]);
  table = typed(table, "B2", "=B1+B4");
  const asc = sortTableRows(table, "c2", "asc", evaluateTableFormulas(table));
  assert.deepEqual(asc.rows.map((row) => row.cells.c1.kind === "value" && row.cells.c1.value), ["Oeste", "Norte", "Sur", "Este", "Centro"]);
  assert.equal(shown(asc, "C1".replace("C", "B")), "5");
  // The formula still adds the cells of Norte and Oeste, wherever they went.
  const formulaRow = asc.rows.findIndex((row) => row.id === "r2");
  assert.equal(shown(asc, `B${formulaRow + 1}`), "25");
  const desc = sortTableRows(table, "c1", "desc");
  // Sur, Oeste, Norte, Este, Centro.
  assert.deepEqual(desc.rows.map((row) => row.id), ["r2", "r4", "r1", "r3", "r5"]);
});

test("a column or a row hidden in the editor is left out of the printed table and keeps feeding the formulas", () => {
  let table = tableOf(["A", "B", "C"], [["1", "2", ""], ["3", "4", ""]]);
  table = typed(table, "C1", "=A1*B1");
  table = setColumnHidden(table, "c1", true);
  table = setRowHidden(table, "r2", true);
  assert.deepEqual(printableColumns(table).map((column) => column.id), ["c2", "c3"]);
  assert.deepEqual(printableRows(table).map((row) => row.id), ["r1"]);
  assert.equal(shown(table, "C1"), "2", "hidden columns still count");
  table = setColumnHidden(table, "c1", false);
  table = setRowHidden(table, "r2", false);
  assert.equal(table.schema?.hiddenColumns, undefined);
  assert.equal(table.schema?.hiddenRows, undefined);

  // A width given by hand is kept in the schema and taken back with null.
  const wide = setColumnWidth(table, "c2", 120.4);
  assert.equal(columnWidthOf(wide, "c2"), 120);
  assert.equal(columnWidthOf(setColumnWidth(wide, "c2", null), "c2"), undefined);
  assert.equal(columnWidthOf(setColumnWidth(wide, "c2", -3), "c2"), undefined);
});

/* ------------------------------------------------------------------ */
/*  The menu model                                                     */
/* ------------------------------------------------------------------ */

test("the cell menu of an editable table offers every item of the model, and the formula copies only once there is a formula", () => {
  const without = tableContextMenu("editable", { kind: "cell", editable: true, hasFormula: false, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true });
  assert.deepEqual(without.map((group) => group.map((entry) => entry.label)), [
    ["Cortar", "Copiar", "Pegar", "Pegar solo valores"],
    ["Insertar fila arriba", "Insertar fila abajo", "Insertar columna a la izquierda", "Insertar columna a la derecha", "Eliminar fila", "Eliminar columna"],
    ["Insertar fórmula…", "Copiar fórmula a toda la columna", "Copiar fórmula a toda la fila", "Operaciones"],
    ["Formato del valor…", "Limpiar contenido"],
  ]);
  assert.equal(item(without, "fill-column").disabled, true);
  assert.equal(item(without, "fill-column").hint, NO_FORMULA_HINT);
  assert.equal(item(without, "fill-row").disabled, true);
  assert.equal(item(without, "edit-formula", "Operaciones").submenu, "operations");
  assert.equal(item(without, "format").submenu, "formats");
  assert.equal(item(without, "delete-row").destructive, true);

  const withFormula = tableContextMenu("editable", { kind: "cell", editable: true, hasFormula: true, canPaste: true, canInsertRow: true, canInsertColumn: false, canDeleteColumn: false, canDeleteRow: false });
  assert.equal(item(withFormula, "fill-column").disabled, undefined);
  assert.equal(item(withFormula, "fill-row").disabled, undefined);
  assert.equal(item(withFormula, "edit-formula", "Editar fórmula…").label, "Editar fórmula…");
  assert.ok(item(withFormula, "remove-formula"));
  assert.equal(item(withFormula, "insert-column-left").disabled, true);
  assert.equal(item(withFormula, "delete-row").disabled, true);
});

test("a capture table of the calculation keeps the same menu, with what it cannot do disabled and explained", () => {
  const cell = tableContextMenu("capture", { kind: "cell", editable: true, hasFormula: false, canPaste: true, canInsertRow: false, canInsertColumn: false, canDeleteColumn: false, canDeleteRow: true });
  assert.equal(item(cell, "cut").disabled, undefined, "a captured cell is cut and pasted");
  assert.equal(item(cell, "edit-formula").disabled, undefined);
  assert.equal(item(cell, "insert-row-above").disabled, true);
  assert.equal(item(cell, "insert-column-left").disabled, true);
  assert.equal(item(cell, "delete-row").disabled, undefined, "the row can be taken out");
  assert.equal(item(cell, "fill-column").disabled, true);
  assert.equal(item(cell, "format").disabled, true);
  assert.equal(item(cell, "format").hint, CAPTURE_FORMAT_HINT);
  assert.ok(!cell.flat().some((entry) => entry.submenu === "operations"), "the operations are for the editor's own tables");

  const computed = tableContextMenu("capture", { kind: "cell", editable: false, hasFormula: false, canPaste: false, canInsertRow: false, canInsertColumn: false, canDeleteColumn: false, canDeleteRow: false });
  assert.equal(item(computed, "copy").disabled, undefined, "a computed figure can always be copied");
  assert.equal(item(computed, "cut").disabled, true);
  assert.equal(item(computed, "clear").disabled, true);

  const generated = tableContextMenu("generated", { kind: "column", canInsertBeside: false, canRename: true, canMoveLeft: false, canMoveRight: false, canDelete: false, hidden: false, canHide: true });
  assert.equal(item(generated, "rename").disabled, undefined, "renaming a generated column works through its layout");
  assert.equal(item(generated, "hide-column").disabled, undefined);
  assert.equal(item(generated, "insert-column-left").disabled, true);
  assert.equal(item(generated, "insert-column-left").hint, GENERATED_STRUCTURE_HINT);
  assert.equal(item(generated, "sort-asc").disabled, true);
  assert.equal(item(generated, "delete-column").disabled, true);
});

test("the column, row and block menus follow the model and the state of what was clicked", () => {
  const column = tableContextMenu("editable", { kind: "column", canInsertBeside: true, canRename: true, canMoveLeft: false, canMoveRight: true, canDelete: true, hidden: true, canHide: true });
  assert.deepEqual(column.map((group) => group.map((entry) => entry.label)), [
    ["Insertar columna a la izquierda", "Insertar columna a la derecha", "Renombrar", "Mover a la izquierda", "Mover a la derecha", "Ancho de columna…", "Formato de la columna", "Ordenar A→Z", "Ordenar Z→A", "Mostrar en el dictamen"],
    ["Eliminar columna"],
  ]);
  assert.equal(item(column, "move-left").disabled, true);
  assert.equal(item(column, "show-column").disabled, undefined);

  const row = tableContextMenu("editable", { kind: "row", canInsert: true, canMoveUp: true, canMoveDown: false, hidden: false, canHide: true, canDelete: false });
  assert.deepEqual(row.map((group) => group.map((entry) => entry.label)), [
    ["Insertar fila arriba", "Insertar fila abajo", "Duplicar fila", "Mover arriba", "Mover abajo", "Ocultar fila en el dictamen"],
    ["Eliminar fila"],
  ]);
  assert.equal(item(row, "move-row-down").disabled, true);
  assert.equal(item(row, "delete-row").disabled, true);

  const block = tableContextMenu("editable", { kind: "block", canRename: false, canTransfer: true, hidden: false, canHide: true, pageBreakBefore: true, canPageBreak: true, canDelete: true });
  assert.deepEqual(block.map((group) => group.map((entry) => entry.label)), [
    ["Renombrar", "Copiar", "Duplicar", "Mover a…", "Ocultar en el dictamen", "Quitar el salto de página antes"],
    ["Eliminar bloque…"],
  ]);
  assert.equal(item(block, "block-rename").disabled, true);
});

/* ------------------------------------------------------------------ */
/*  The link between the construction types and the cost approach      */
/* ------------------------------------------------------------------ */

test("the types feed the cost approach until every one of them was taken out of it", () => {
  const types = [{ ref: "T-1" }, { ref: "T-2" }, { ref: "" }];
  assert.equal(constructionTypesLinkedToCosts(types, undefined), true);
  assert.equal(constructionTypesLinkedToCosts(types, { excludedTypes: ["t-1"] }), true, "one type still enters");
  assert.equal(constructionTypesLinkedToCosts(types, { excludedTypes: ["T-1", "t-2 "] }), false);
  assert.equal(constructionTypesLinkedToCosts([], { excludedTypes: ["T-1"] }), true, "without types there is nothing unlinked");
});
