/**
 * Audit of the tables (Nov 2026): "Quitar tabla" asks first and can be undone,
 * a column of figures without a format warns about letters, a table the
 * calculation writes takes "Formato de la tabla", a capture table copies a
 * formula to its row and column, and the Comparables list moves a column left
 * or right from the header's right click.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  canMoveColumnBy,
  defaultColumnLayout,
  moveColumnBy,
  parseColumnLayout,
  serializeColumnLayout,
  toggleColumn,
  visibleColumns,
} from "../src/features/valuations/comparable-base/column-layout";
import { figureColumn, generatedTable, moneyColumn, textColumn } from "../src/features/valuations/calculation/generated-content";
import { applyTableLayout, layoutOf, sourceOf, withColumnHidden, withTableFormat, withTableLayouts } from "../src/features/valuations/calculation/generated-table-layout";
import { GeneratedTableColumns } from "../src/features/valuations/components/editor/generated-table-columns";
import { requestTableRemoval, TableEditorItem } from "../src/features/valuations/components/editor/table-editor";
import type { Block, TableContent } from "../src/features/valuations/model";
import {
  NUMERIC_CELL_MESSAGE,
  ensureTableV2,
  isInferredNumericColumn,
  numericCellProblem,
  setCellFormula,
  setColumnFormat,
  sortTableRows,
  type TableV2,
} from "../src/features/valuations/services/table";
import { captureFillTargets, tableContextMenu, type TableMenuItem } from "../src/features/valuations/services/table-context-menu";
import { evaluateTableFormulas, figureWithDecimals, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";
import { buildFormulaIndex, compileFormula } from "../src/features/valuations/services/formula-references";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

function tableOf(columns: string[], rows: string[][]): TableV2 {
  return {
    id: "t",
    title: "Superficies",
    version: 2,
    columns: columns.map((name, index) => ({ id: `c${index + 1}`, name })),
    rows: rows.map((row, rowIndex) => ({
      id: `r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`c${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

const item = (groups: TableMenuItem[][], action: string) => groups.flat().find((candidate) => candidate.action === action)!;

/* ------------------------------------------------------------------ */
/*  1. "Quitar tabla" asks first and can be undone                     */
/* ------------------------------------------------------------------ */

test("«Quitar tabla» asks with the dialog of every deletion, naming the table, and removes only on confirm", () => {
  const asked: Array<{ title: string; description: string; confirmLabel: string; onConfirm: () => void }> = [];
  const removed: string[] = [];
  requestTableRemoval((request) => asked.push(request), { id: "tabla-1", title: "Medidas y colindancias" }, (id) => removed.push(id));
  assert.equal(asked.length, 1, "it asks");
  assert.deepEqual(removed, [], "nothing is removed before the answer");
  assert.equal(asked[0].title, "¿Eliminar la tabla «Medidas y colindancias»?");
  assert.equal(asked[0].confirmLabel, "Eliminar tabla");
  assert.match(asked[0].description, /Deshacer/, "it says the deletion can be undone");
  asked[0].onConfirm();
  assert.deepEqual(removed, ["tabla-1"]);
});

test("the table's trash can goes through the confirmation", () => {
  const table = tableOf(["A"], [["1"]]) as unknown as TableContent;
  const html = renderToStaticMarkup(createElement(TableEditorItem, {
    table, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {}, readOnly: false,
  }));
  assert.match(html, /data-remove-table="t"/);
  assert.match(html, /title="Quitar tabla"/);
});

/* ------------------------------------------------------------------ */
/*  2. A column of figures without a format warns about letters        */
/* ------------------------------------------------------------------ */

test("a column without a format whose values are figures marks letters typed in it, and only warns", () => {
  const table = tableOf(["Lado", "Metros"], [["Norte", "12.5"], ["Sur", "12.50 m"], ["Este", "10%"], ["Oeste", "doce"]]);
  assert.equal(table.columns[1].format, undefined, "no format was given");
  assert.ok(isInferredNumericColumn(table, "c2"));
  assert.equal(numericCellProblem(table, "c2", table.rows[3].cells.c2), NUMERIC_CELL_MESSAGE, "the letters are marked");
  assert.equal(numericCellProblem(table, "c2", table.rows[2].cells.c2), null, "«10%» is a number");
  assert.equal(numericCellProblem(table, "c1", table.rows[0].cells.c1), null, "the column of names stays text");
  const stored = table.rows[3].cells.c2;
  assert.equal(stored.kind === "value" ? stored.value : null, "doce", "what was typed is kept");
});

test("«10%» in a column of figures counts as 0.10 in the formulas and sorts as a number", () => {
  let table = tableOf(["Concepto", "Valor", "Resultado"], [["A", "200", ""], ["B", "10%", ""], ["C", "50", ""]]);
  assert.ok(isInferredNumericColumn(table, "c2"));
  const compiled = compileFormula("=B1*B2", { index: buildFormulaIndex([]), table });
  assert.ok(compiled.ok);
  table = setCellFormula(table, "r1", "c3", compiled.formula);
  assert.equal(getCellDisplayValue(table, "r1", "c3", evaluateTableFormulas(table)), "20");
  assert.deepEqual(sortTableRows(table, "c2", "asc").rows.map((row) => row.id), ["r2", "r3", "r1"]);
});

test("a column of texts, dates or phones, or with few figures, is not taken as numeric", () => {
  assert.equal(isInferredNumericColumn(tableOf(["Fecha"], [["2026-10-01"], ["2026-11-01"], ["2026-12-01"]]), "c1"), false);
  assert.equal(isInferredNumericColumn(tableOf(["Teléfono"], [["33 1234 5678"], ["33 8765 4321"]]), "c1"), false);
  assert.equal(isInferredNumericColumn(tableOf(["Dato"], [["120"], ["Casa"], ["Lote"]]), "c1"), false, "texts are most of it");
  assert.equal(isInferredNumericColumn(tableOf(["Dato"], [["120"], [""]]), "c1"), false, "a single figure is not a column of figures");
  // A column given the text format stays text whatever it holds.
  const text = setColumnFormat(tableOf(["Clave"], [["1"], ["2"], ["x"]]), "c1", { type: "text" });
  assert.equal(numericCellProblem(text, "c1", text.rows[2].cells.c1), null);
});

/* ------------------------------------------------------------------ */
/*  3. "Formato de la tabla" in the tables the calculation writes       */
/* ------------------------------------------------------------------ */

function costTable(): TableContent {
  return generatedTable("motor-costos-construcciones", "Construcciones", [
    textColumn("Ref."),
    figureColumn("Edad"),
    figureColumn("FRe"),
    moneyColumn("Valor neto"),
    figureColumn("Superficie"),
    figureColumn("Indiviso"),
  ], [
    ["1", "10", "0.8523", "$ 1,234,567.89", "169.78 m²", "12%"],
    ["2", "25", "0.7", "$ 980,000.00", "80.00 m²", "88%"],
  ]);
}

const printedRow = (table: TableContent, rowIndex = 0) => {
  const v2 = ensureTableV2(table);
  const results = evaluateTableFormulas(v2);
  return v2.columns.map((column) => getCellDisplayValue(v2, v2.rows[rowIndex].id, column.id, results));
};

test("the decimals of a calculated table change how its figures print, never its values; references, ages and counts stay", () => {
  const written = costTable();
  const formatted = applyTableLayout(written, withTableFormat(layoutOf(written), { decimals: 1 }));
  assert.deepEqual(printedRow(formatted), ["1", "10", "0.9", "$ 1,234,567.9", "169.8 m²", "12.0%"]);
  assert.deepEqual(printedRow(applyTableLayout(written, withTableFormat(layoutOf(written), { decimals: 3 })), 1), ["2", "25", "0.700", "$ 980,000.000", "80.000 m²", "88.000%"]);
  // The values the calculation wrote are untouched, in the printed table and in its source.
  const cell = ensureTableV2(formatted).rows[0].cells["col-3"];
  assert.equal(cell.kind === "value" ? cell.value : null, "0.8523");
  assert.deepEqual(sourceOf(formatted).rows, ensureTableV2(written).rows);
  // Back to the calculation's.
  const back = applyTableLayout(formatted, withTableFormat(layoutOf(formatted), { decimals: null }));
  assert.deepEqual(printedRow(back), ["1", "10", "0.8523", "$ 1,234,567.89", "169.78 m²", "12%"]);
});

test("a figure is rounded as written; text is left alone", () => {
  assert.equal(figureWithDecimals("0.125", 2), "0.13");
  assert.equal(figureWithDecimals("-$ 1,000.5", 0), "-$ 1,001");
  assert.equal(figureWithDecimals("Casa", 2), null);
  assert.equal(figureWithDecimals("T-1", 2), null);
  assert.equal(figureWithDecimals("10", 2), null, "a whole count stays");
});

test("the width and decimals of a calculated table stay when the calculation writes it again, with its hidden columns", () => {
  const written = costTable();
  const layout = withTableFormat(withColumnHidden(layoutOf(written), "col-2", true), { widthMode: "content", decimals: 2 });
  const block = { id: "b", title: "Costos", concepts: [], images: [], apartados: [], tables: [applyTableLayout(written, layout)] } as unknown as Block;
  const [again] = withTableLayouts([{ ...block, tables: [costTable()] }], [block]);
  const table = ensureTableV2(again.tables[0]);
  assert.equal(table.schema?.widthMode, "content");
  assert.equal(table.schema?.decimals, 2);
  assert.ok(!table.columns.some((column) => column.id === "col-2"), "the hidden column stays hidden");
  // "Ajustar a la página" over a table the calculation printed as wide as its content.
  const page = applyTableLayout(again.tables[0], withTableFormat(layoutOf(again.tables[0]), { widthMode: "page" }));
  assert.equal(ensureTableV2(page).schema?.widthMode, undefined);
});

test("a calculated block offers «Formato de la tabla» beside its columns", () => {
  const html = renderToStaticMarkup(createElement(GeneratedTableColumns, { table: costTable(), readOnly: false, onChange: () => {} }));
  assert.match(html, /aria-label="Formato de la tabla"/);
});

/* ------------------------------------------------------------------ */
/*  4. Copying a formula across a capture table                        */
/* ------------------------------------------------------------------ */

test("a capture cell with a formula copies it to its row and its column; without one the items say why", () => {
  const withFormula = tableContextMenu("capture", { kind: "cell", editable: true, hasFormula: true, canPaste: true, canInsertRow: false, canInsertColumn: false, canDeleteColumn: false, canDeleteRow: false });
  assert.equal(item(withFormula, "fill-row").disabled, undefined);
  assert.equal(item(withFormula, "fill-column").disabled, undefined);
  const generated = tableContextMenu("generated", { kind: "cell", editable: false, hasFormula: true, canPaste: false, canInsertRow: false, canInsertColumn: false, canDeleteColumn: false, canDeleteRow: false });
  assert.equal(item(generated, "fill-row").disabled, true, "a table the calculation writes takes no formulas");
});

test("the formula goes to the empty cells that take typing, never over what was captured", () => {
  const cells = [
    { takesTyping: true, text: "1,345", hasFormula: true },
    { takesTyping: true, text: "", hasFormula: false },
    { takesTyping: true, text: "0.95", hasFormula: false },
    { takesTyping: false, text: "", hasFormula: false },
    null,
    { takesTyping: true, text: "  ", hasFormula: false },
    { takesTyping: true, text: "20", hasFormula: true },
  ];
  assert.deepEqual(captureFillTargets(cells, 0), [1, 5]);
});

/* ------------------------------------------------------------------ */
/*  5. Comparables: moving a column from the header's right click      */
/* ------------------------------------------------------------------ */

test("«Mover a la izquierda/derecha» passes the next visible column and is kept with the layout", () => {
  const layout = defaultColumnLayout();
  const keys = (columns: typeof layout) => visibleColumns(columns).map((column) => column.key);
  assert.equal(canMoveColumnBy(layout, "numero", -1), false, "the first one goes no further left");
  assert.equal(canMoveColumnBy(layout, "usado", 1), false, "the last one goes no further right");
  const right = moveColumnBy(layout, "precio", 1);
  // "fuente" is hidden: the column passes "fecha", the next one shown.
  assert.deepEqual(keys(right), ["numero", "ubicacion", "tipo", "superficies", "fecha", "precio", "vigencia", "usado"]);
  assert.deepEqual(keys(moveColumnBy(right, "precio", -1)), keys(layout));
  assert.deepEqual(moveColumnBy(layout, "numero", -1), layout);
  // Shown again, the hidden column keeps its place among the others.
  assert.deepEqual(keys(toggleColumn(right, "fuente")), ["numero", "ubicacion", "tipo", "superficies", "fuente", "fecha", "precio", "vigencia", "usado"]);
  // The order is saved as the rest of the view.
  assert.deepEqual(parseColumnLayout(serializeColumnLayout(right)), right);
});
