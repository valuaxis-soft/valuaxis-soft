import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFormula, parseDecimal } from "../src/features/valuations/calculation/free-formula";
import {
  buildFormulaIndex,
  columnLetter,
  compileFormula,
  formulaTextProblem,
  formulaToText,
  withReference,
} from "../src/features/valuations/services/formula-references";
import { setCellFormula, type TableV2 } from "../src/features/valuations/services/table";
import { evaluateTableFormulas, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";

const NO_INDEX = buildFormulaIndex([]);

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

/** Writes a formula as the editor does and reads back its text and what the cell shows. */
function written(table: TableV2, address: string, text: string) {
  const compiled = compileFormula(text, { index: NO_INDEX, table });
  assert.ok(compiled.ok, `${text}${compiled.ok ? "" : `: ${compiled.message}`}`);
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, index) => columnLetter(index) === letters)!;
  const row = table.rows[Number(number) - 1];
  const next = setCellFormula(table, row.id, column.id, compiled.formula);
  return {
    text: formulaToText(compiled.formula, { index: NO_INDEX, table: next }),
    shown: getCellDisplayValue(next, row.id, column.id, evaluateTableFormulas(next)),
    table: next,
  };
}

const values = () => tableOf(["A", "B", "C"], [["2", "10", ""], ["4", "20", ""], ["8", "30", ""]]);

test("the parentheses are kept exactly as written, needed or not", () => {
  assert.equal(written(values(), "C1", "=(A1*B1)+(A2*B2)").text, "(A1*B1)+(A2*B2)");
  assert.equal(written(values(), "C1", "=((A1+B1))").text, "((A1+B1))");
  assert.equal(written(values(), "C1", "=(A1+B1)*2").shown, "24");
  // Only parentheses: brackets are names of concepts and tables, never grouping.
  assert.equal(written(values(), "C1", "=A1+B1*2").text, "A1+B1*2", "none added either");
});

test("MIN and MAX over a range or a whole column, LN, LOG base 10 and powers", () => {
  assert.equal(written(values(), "C1", "=MIN(B1:B3)").shown, "10");
  assert.equal(written(values(), "C1", "=MAX(B:B)").shown, "30");
  assert.equal(written(values(), "C1", "=MAX(B:B)").text, "MAX(B:B)");
  assert.equal(written(values(), "C1", "=MIN(A:B)").shown, "2", "several columns");
  assert.equal(written(values(), "C1", "=LOG(100)").shown, "2");
  assert.equal(written(values(), "C1", "=LN(1)").shown, "0");
  assert.equal(written(values(), "C1", "=A2^2").shown, "16");
  assert.equal(written(values(), "C1", "=(A1*B1)^(1/2)").shown, "4.4721");
  assert.equal(evaluateFormula("LOG(8; 2)"), 3);
  assert.equal(evaluateFormula("LN(0)"), null, "no logarithm of zero");
  assert.equal(evaluateFormula("2^3^2"), 64, "left to right, as Excel");
});

test("spaces and an initial == are tolerated; what is wrong is said while it is typed", () => {
  assert.equal(written(values(), "C1", " ==  A1 + B1 ").shown, "12");
  assert.equal(parseDecimal("== 5 * 2"), 10);
  assert.equal(formulaTextProblem("=A1+"), "Falta un valor después del último operador.");
  assert.match(formulaTextProblem("=(A1+B1") ?? "", /Falta un paréntesis de cierre/);
  assert.match(formulaTextProblem("=PROMEDIOS(A1:A3)") ?? "", /La función «PROMEDIOS» no existe/);
  assert.equal(formulaTextProblem("=A1*(B1+2)"), null);
  assert.equal(formulaTextProblem("="), null, "nothing written yet");
});

test("a click right after another replaces the reference, as a spreadsheet; after an operator it adds one", () => {
  const first = withReference("=", { start: 1, end: 1 }, "B2", null);
  assert.equal(first.text, "=B2");
  const second = withReference(first.text, { start: 3, end: 3 }, "C3", first.reference);
  assert.equal(second.text, "=C3", "replaced, not =B2C3");
  // An operator typed in between ends the first reference.
  const typed = "=C3*";
  const third = withReference(typed, { start: 4, end: 4 }, "D4", null);
  assert.equal(third.text, "=C3*D4");
  // A caret moved elsewhere is not the place of the last reference.
  assert.equal(withReference("=B2+1", { start: 5, end: 5 }, "E5", { start: 1, end: 3, text: "B2" }).text, "=B2+1E5");
});
