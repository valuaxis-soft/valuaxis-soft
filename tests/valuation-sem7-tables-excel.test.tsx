/**
 * Video 7.4 and 7.3 (17 nov 2026): the tables copy, paste and fill as Excel,
 * Enter goes down, the table's format is a gear with its name and is in the
 * right click, and the precision and the conservation criteria are
 * configuration, not content.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { parseFactorInput } from "../src/features/valuations/calculation/factor-input";
import { focusCaptureCell } from "../src/features/valuations/components/calculation/calc-table-context-menu";
import { CalculationPrecisionSummary } from "../src/features/valuations/components/calculation/calculation-precision-control";
import { CommitCell } from "../src/features/valuations/components/calculation/commit-cell";
import { TableFormatControl } from "../src/features/valuations/components/editor/table-format-control";
import { ensureTableV2, fillColumnWithFormula, fillReplacedCount, fillRowWithFormula, type TableV2 } from "../src/features/valuations/services/table";
import {
  captureFillPlan,
  captureFillSummary,
  copiedCaptureText,
  fillReplaceConfirmation,
  pasteValuesText,
  tableContextMenu,
  withTableFormatGroup,
} from "../src/features/valuations/services/table-context-menu";
import "./support/ssr-portal-shim";

/* ------------------------------------------------------------------ */
/*  V7.4-11: a suggestion is not a value                               */
/* ------------------------------------------------------------------ */

test("V7.4-11: a factor left empty shows its 1.00 but tells the fill it is empty", () => {
  const html = renderToStaticMarkup(<CommitCell ariaLabel="Ubic." value="" display="1.00" computed numeric onCommit={() => {}} />);
  assert.match(html, /value="1.00"/, "the cell shows the suggestion");
  assert.match(html, /data-value=""/, "and says nothing was captured");
  // The column of «Ubic.» as the fill reads it now: the comparable 1 holds 0.95, the others only show 1.00.
  const captured = (text: string) => ({ takesTyping: true, text, hasFormula: false, noFill: null });
  const plan = captureFillPlan([captured("0.95"), captured(""), captured("")], 0, "empty");
  assert.deepEqual(plan.targets, [1, 2]);
  assert.equal(captureFillSummary(plan.targets.length, plan.computedSkipped, "column"), "Se llenaron 2 celdas de la columna.");
});

/* ------------------------------------------------------------------ */
/*  V7.4-13 and 17: copy takes the formula; paste values, the number   */
/* ------------------------------------------------------------------ */

test("V7.4-17: «Copiar» takes the formula of the cell, with the value it shows as a fallback", () => {
  assert.equal(copiedCaptureText({ formula: "=1/1.1", value: "0.91" }), "=1/1.1");
  assert.equal(copiedCaptureText({ formula: null, value: "0.95" }), "0.95");
});

test("V7.4-13: «Pegar solo valores» pastes the number a formula gives, not the formula without its «=»", () => {
  assert.equal(pasteValuesText("=1/1.1"), "0.909090909091");
  assert.equal(pasteValuesText("=0.9/1.05"), "0.857142857143");
  assert.equal(pasteValuesText("0.95"), "0.95", "a value pastes as it is");
  // A formula with a reference the clipboard cannot compute pastes the value the cell showed.
  assert.equal(pasteValuesText("=Terreno!B3*2", { formula: "=Terreno!B3*2", value: "24.00" }), "24.00");
  assert.equal(pasteValuesText("=Terreno!B3*2"), null);
});

test("V7.4-13: arithmetic typed without «=» is a factor, and the warning gives examples, not a range", () => {
  const typed = parseFactorInput("1/1.1");
  assert.equal(typed.kind, "ratings");
  assert.ok(typed.kind === "ratings" && Math.abs(typed.subjectRating / typed.comparableRating - 0.909090909) < 1e-9);
  const product = parseFactorInput("0.9*1.05");
  assert.ok(product.kind === "value" && Math.abs(product.value - 0.945) < 1e-12 && product.formula === "=0.9*1.05");
  assert.equal(parseFactorInput("abc").kind, "invalid");
  assert.equal(parseFactorInput("1.05").kind, "value");
  const source = readFileSync("src/features/valuations/components/calculation/market-homologation-table.tsx", "utf8");
  assert.doesNotMatch(source, /no es un factor válido: escribe un número o una fórmula como =0\.9\/1\.05/);
});

/* ------------------------------------------------------------------ */
/*  V7.4-18: copy to the whole row or column replaces, asked first     */
/* ------------------------------------------------------------------ */

test("V7.4-18: «Copiar … a toda la columna» replaces what the cells hold; «solo a las vacías» keeps it", () => {
  const cell = (text: string, noFill: "computed" | "other" | null = null) => ({ takesTyping: true, text, hasFormula: false, noFill });
  const column = [cell("=1/1.1"), cell("0.95"), cell(""), cell("", "computed"), cell("1.02", "computed"), cell("libre", "other")];
  const all = captureFillPlan(column, 0, "all");
  assert.deepEqual(all.targets, [1, 2, 4], "the old values too; an empty calculated cell and the free text are left alone");
  assert.equal(all.replaced, 2);
  assert.equal(all.computedSkipped, 1);
  assert.equal(captureFillSummary(all.targets.length, all.computedSkipped, "column", all.replaced),
    "Se llenaron 3 celdas de la columna (se reemplazaron 2 que tenían valor). Se omitió 1 celda que calcula el sistema; para cambiarla, escribe en ella.");
  assert.deepEqual(captureFillPlan(column, 0, "empty").targets, [2]);

  const ask = fillReplaceConfirmation(2, "column", "fórmula");
  assert.equal(ask.title, "¿Reemplazar 2 celdas de la columna?");
  assert.equal(ask.confirmLabel, "Reemplazar");
  assert.match(ask.description, /Deshacer/);

  const menu = tableContextMenu("capture", { kind: "cell", editable: true, hasFormula: true, canPaste: true, canInsertRow: false, canInsertColumn: false, canDeleteColumn: false, canDeleteRow: false });
  const labels = menu.flat().map((item) => item.label);
  for (const label of ["Copiar fórmula a toda la columna", "Copiar fórmula a toda la fila", "Copiar fórmula solo a las vacías de la columna", "Copiar fórmula solo a las vacías de la fila"]) {
    assert.ok(labels.includes(label), label);
  }
});

test("V7.4-18: in the editor's tables the fill replaces too, and says how many cells it would write over", () => {
  const table = ensureTableV2({
    id: "t", title: "Prueba", columns: ["A", "B"],
    rows: [["0.95", "1"], ["", "2"], ["0.90", ""]],
  } as never) as TableV2;
  const columnA = table.columns[0].id;
  const [first, second, third] = table.rows.map((row) => row.id);
  assert.equal(fillReplacedCount(table, first, columnA, "column"), 1);
  const value = (current: TableV2, rowId: string) => (current.rows.find((row) => row.id === rowId)?.cells[columnA] as { value: string }).value;
  const kept = fillColumnWithFormula(table, first, columnA);
  assert.deepEqual([value(kept, second), value(kept, third)], ["0.95", "0.90"]);
  const replaced = fillColumnWithFormula(table, first, columnA, { overwrite: true });
  assert.deepEqual([value(replaced, second), value(replaced, third)], ["0.95", "0.95"]);
  assert.equal(fillReplacedCount(table, third, columnA, "row"), 0);
  const row = fillRowWithFormula(table, second, table.columns[1].id, { overwrite: true });
  assert.equal(value(row, second), "2");
});

/* ------------------------------------------------------------------ */
/*  V7.4-12: Enter goes down                                           */
/* ------------------------------------------------------------------ */

/** A capture table as the DOM gives it, enough for `focusCaptureCell`: rows of cells, each with its field or none. */
function fakeTable(fields: Array<Array<"field" | "none" | "disabled">>) {
  const focused: string[] = [];
  const section = { rows: [] as unknown[] };
  for (const [rowIndex, line] of fields.entries()) {
    const row = { parentElement: section, cells: [] as unknown[] };
    for (const [cellIndex, kind] of line.entries()) {
      const field = kind === "none" ? null : {
        disabled: kind === "disabled", readOnly: false,
        focus: () => focused.push(`${rowIndex}:${cellIndex}`), select: () => undefined,
      };
      const cell: Record<string, unknown> = { cellIndex, parentElement: row, querySelector: () => field };
      cell.closest = () => cell;
      row.cells.push(cell);
    }
    section.rows.push(row);
  }
  const at = (row: number, column: number) => (section.rows[row] as { cells: Array<{ closest: () => unknown }> }).cells[column] as unknown as HTMLElement;
  return { at, focused };
}

test("V7.4-12: Enter goes to the cell below in its column, skipping a row without a field there; Shift+Enter goes up", () => {
  const table = fakeTable([["field", "field"], ["field", "none"], ["field", "field"], ["none", "field"]]);
  assert.equal(focusCaptureCell(table.at(0, 1), 1), true);
  assert.deepEqual(table.focused, ["2:1"], "the total without a field is skipped");
  assert.equal(focusCaptureCell(table.at(2, 0), -1), true);
  assert.deepEqual(table.focused, ["2:1", "1:0"]);
  assert.equal(focusCaptureCell(table.at(2, 0), 1), false, "nothing below: the cell is only left");
  const disabled = fakeTable([["field"], ["disabled"], ["field"]]);
  focusCaptureCell(disabled.at(0, 0), 1);
  assert.deepEqual(disabled.focused, ["2:0"]);
});

test("V7.4-12: the capture cells and the frame of every capture table move down on Enter", () => {
  const cell = readFileSync("src/features/valuations/components/calculation/commit-cell.tsx", "utf8");
  assert.match(cell, /focusCaptureCell\(cell, event\.shiftKey \? -1 : 1\)/);
  const frame = readFileSync("src/features/valuations/components/calculation/calc-table-context-menu.tsx", "utf8");
  assert.match(frame, /focusCaptureCell\(field, event\.shiftKey \? -1 : 1\)/, "the costs' fields, which do not handle keys, too");
});

/* ------------------------------------------------------------------ */
/*  V7.3-01: the gear, and the table's format in the right click       */
/* ------------------------------------------------------------------ */

test("V7.3-01: «Formato de la tabla» is a gear with its name, not the ⅄ alone", () => {
  const table = ensureTableV2({ id: "t", title: "Tabla de prueba", columns: ["A"], rows: [["1"]] } as never) as TableV2;
  const html = renderToStaticMarkup(<TableFormatControl table={table} readOnly={false} onChange={() => {}} />);
  assert.match(html, /lucide-settings2|lucide-settings-2/);
  assert.doesNotMatch(html, /lucide-merge/);
  assert.match(html, />Formato de la tabla</);
});

test("V7.3-01: the right click on a cell, a header, a row or the title offers the format and the title in the dictamen", () => {
  const cell = tableContextMenu("editable", { kind: "cell", editable: true, hasFormula: false, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true });
  const shown = withTableFormatGroup(cell, { captionShown: true }).at(-1)!;
  assert.deepEqual(shown.map((item) => item.label), ["Formato de la tabla (espacio, sangría, decimales)…", "Ocultar el título en el dictamen"]);
  const hidden = withTableFormatGroup(cell, { captionShown: false }).at(-1)!;
  assert.equal(hidden[1].action, "caption-show");
  // Units and decimals stay in the cell's own menu.
  assert.ok(cell.flat().some((item) => item.label === "Unidades de valor"));
  assert.ok(cell.flat().some((item) => item.label === "Decimales"));
  const editor = readFileSync("src/features/valuations/components/editor/table-editor.tsx", "utf8");
  assert.equal(editor.match(/withTableItems\(/g)?.length, 4, "cell, header and row menus, and the helper itself");
  assert.match(editor, /aria-label="Menú del título de la tabla"/);
});

/* ------------------------------------------------------------------ */
/*  V7.4-01 and 21: configuration only at the top                      */
/* ------------------------------------------------------------------ */

test("V7.4-01: the precision is chosen only in Carátula › Configuración del avalúo; the panels say it and link there", () => {
  for (const panel of ["market-calculation-panel.tsx", "cost-calculation-panel.tsx"]) {
    const source = readFileSync(`src/features/valuations/components/calculation/${panel}`, "utf8");
    assert.doesNotMatch(source, /<CalculationPrecisionControl/, panel);
  }
  const settings = readFileSync("src/features/valuations/components/editor/valuation-settings-panel.tsx", "utf8");
  assert.match(settings, /<CalculationPrecisionControl/);
  const html = renderToStaticMarkup(<CalculationPrecisionSummary precision={{ decimals: 2, calculateWithShown: true }} />);
  assert.match(html, /Factores con 2 decimales, calculando con la precisión mostrada/);
  assert.match(html, /Se cambia en Carátula › Configuración del avalúo/);
  assert.doesNotMatch(html, /<select/, "no control repeated in the content");
});

test("V7.4-21: the conservation criteria of B) and C) are in the costs' configuration, not inside each table", () => {
  const source = readFileSync("src/features/valuations/components/calculation/cost-calculation-panel.tsx", "utf8");
  const config = source.indexOf('title="Configuración del cálculo de costos"');
  assert.ok(config > 0);
  const editors = [...source.matchAll(/<ConservationCriterionEditor/g)].map((match) => match.index!);
  assert.equal(editors.length, 2);
  assert.ok(editors.every((index) => index > config && index < source.indexOf("</EditorConfigPanel>")), "both inside the configuration panel");
});
