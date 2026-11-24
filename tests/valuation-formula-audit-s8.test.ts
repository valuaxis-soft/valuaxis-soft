/**
 * Formulas as the audit of week 8 (23 nov 2026) tried them: the functions of
 * Excel the appraiser uses (FAL-09), text in a numeric cell (FAL-08) and a
 * formula with no number, which the dictamen never prints (FAL-07).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { evaluateFormula } from "../src/features/valuations/calculation/free-formula";
import { DocumentConceptValue } from "../src/features/valuations/components/document-concept-value";
import {
  buildFormulaIndex,
  columnLetter,
  compileFormula,
  formulaTextProblem,
  formulaToText,
} from "../src/features/valuations/services/formula-references";
import { numericCellProblem, readTypedNumber, setCellFormula, type TableV2 } from "../src/features/valuations/services/table";
import { evaluateTableFormulas, getCellDisplayValue, getCellPrintedValue } from "../src/features/valuations/services/table-formula-engine";

const NO_INDEX = buildFormulaIndex([]);

function tableOf(rows: string[][]): TableV2 {
  return {
    id: "t",
    title: "Tabla",
    version: 2,
    columns: rows[0].map((_, index) => ({ id: `c${index + 1}`, name: columnLetter(index) })),
    rows: rows.map((row, rowIndex) => ({
      id: `r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`c${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

/** Writes a formula in a cell as the editor does: its text read back, what the editor shows and what the dictamen prints. */
function written(table: TableV2, address: string, text: string) {
  const compiled = compileFormula(text, { index: NO_INDEX, table });
  assert.ok(compiled.ok, `${text}${compiled.ok ? "" : `: ${compiled.message}`}`);
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, index) => columnLetter(index) === letters)!;
  const row = table.rows[Number(number) - 1];
  const next = setCellFormula(table, row.id, column.id, compiled.formula);
  const results = evaluateTableFormulas(next);
  return {
    text: formulaToText(compiled.formula, { index: NO_INDEX, table: next }),
    shown: getCellDisplayValue(next, row.id, column.id, results),
    printed: getCellPrintedValue(next, row.id, column.id, results),
  };
}

// Conservation ratings and unit values of five comparables, as a column of the homologation.
const ratings = () => tableOf([["8", "12500", ""], ["7", "13100", ""], ["8", "11900", ""], ["6", "14250", ""], ["8", "12800", ""]]);

test("FAL-09: MEDIANA, MODA, CONTAR, CONTAR.SI, SUMAR.SI and PROMEDIO.SI over a range, with their Spanish names", () => {
  assert.equal(written(ratings(), "C1", "=MEDIANA(B1:B5)").shown, "12,800");
  assert.equal(written(ratings(), "C1", "=MODA(A1:A5)").shown, "8", "the conservation that repeats most");
  assert.equal(written(ratings(), "C1", "=CONTAR(A1:A5)").shown, "5");
  assert.equal(written(ratings(), "C1", '=CONTAR.SI(A1:A5; ">=8")').shown, "3");
  assert.equal(written(ratings(), "C1", "=CONTAR.SI(A1:A5; 7)").shown, "1", "a bare value is equal to it");
  assert.equal(written(ratings(), "C1", '=SUMAR.SI(B1:B5; ">13000")').shown, "27,350");
  assert.equal(written(ratings(), "C1", '=PROMEDIO.SI(B1:B5; "<13000")').shown, "12,400");
  // Read back as typed, with the Spanish names.
  assert.equal(written(ratings(), "C1", '=countif(A1:A5; ">=8")').text, 'CONTAR.SI(A1:A5; ">=8")');
  assert.equal(written(ratings(), "C1", "=median(B1:B5)").text, "MEDIANA(B1:B5)");
});

test("FAL-09: SI with comparisons, Y, O, NO and SI.ERROR", () => {
  assert.equal(written(ratings(), "C1", "=SI(A1>=8; B1*1.05; B1)").shown, "13,125");
  assert.equal(written(ratings(), "C2", "=SI(A2>=8; B2*1.05; B2)").shown, "13,100");
  assert.equal(written(ratings(), "C1", "=SI(A1>=8; B1*1.05; B1)").text, "SI(A1>=8; B1*1.05; B1)");
  assert.equal(written(ratings(), "C1", "=SI(Y(A1>6; A4<7); 1; 0)").shown, "1");
  assert.equal(written(ratings(), "C1", "=SI(O(A1<6; A4>7); 1; 0)").shown, "0");
  assert.equal(written(ratings(), "C1", "=NO(A1=8)").shown, "0");
  assert.equal(written(ratings(), "C1", "=A1<>A4").shown, "1");
  assert.equal(written(ratings(), "C1", "=SI.ERROR(B1/0; 0)").shown, "0");
  assert.equal(evaluateFormula("SI(2>1; 10; 20)"), 10);
  assert.equal(evaluateFormula("SI(2<1; 10)"), 0, "without its third argument, 0");
});

test("FAL-09: REDONDEAR.MAS, REDONDEAR.MENOS and ENTERO as Excel computes them", () => {
  assert.equal(evaluateFormula("REDONDEAR.MAS(1987000; -4)"), 1_990_000);
  assert.equal(evaluateFormula("REDONDEAR.MENOS(1987000; -4)"), 1_980_000);
  assert.equal(evaluateFormula("REDONDEAR.MAS(0.1*3; 2)"), 0.3, "0.30000000000000004 is 0.3");
  assert.equal(evaluateFormula("REDONDEAR.MAS(-2.341; 1)"), -2.4, "away from zero");
  assert.equal(evaluateFormula("REDONDEAR.MENOS(-2.349; 2)"), -2.34, "toward zero");
  assert.equal(evaluateFormula("ENTERO(8.9)"), 8);
  assert.equal(evaluateFormula("ENTERO(-8.1)"), -9, "down, as Excel");
  assert.equal(evaluateFormula("MODA(1; 2; 3)"), null, "nothing repeats: no mode, as #N/A");
});

test("FAL-09: a function that does not exist names the ones there are, the new ones among them", () => {
  const problem = formulaTextProblem("=BUSCARV(A1; B1:C5; 2)") ?? "";
  assert.match(problem, /La función «BUSCARV» no existe/);
  for (const name of ["MEDIANA", "MODA", "SI", "CONTAR.SI", "REDONDEAR.MAS", "ENTERO", "Y", "O"]) assert.match(problem, new RegExp(`\\b${name.replace(".", "\\.")}\\b`));
});

test("FAL-08: letters glued to a figure are not a number; a unit is", () => {
  assert.equal(readTypedNumber("12a"), null);
  assert.equal(readTypedNumber("abc"), null);
  assert.equal(readTypedNumber("150m²"), 150);
  assert.equal(readTypedNumber("169.78 m²"), 169.78);
  assert.equal(readTypedNumber("150 m2"), 150);
  assert.equal(readTypedNumber("$ 9,000.00"), 9000);
  assert.equal(readTypedNumber("20 años"), 20);
});

test("FAL-08: «12a» in a column of figures is marked and =A3*2 gives #VALOR!, never 24 in silence", () => {
  const table = tableOf([["10"], ["11"], ["12a"], ["13"], [""]]);
  assert.equal(numericCellProblem(table, "c1", table.rows[2].cells.c1), "Este campo es numérico");
  const result = written(table, "A5", "=A3*2");
  assert.equal(result.shown, "#VALOR!");
  assert.equal(result.printed, "—", "the dictamen prints a dash");
});

test("FAL-07: a formula that divides by zero or reads an empty cell shows the error in the editor and prints «—»", () => {
  const table = tableOf([["100", "", ""]]);
  const byZero = written(table, "C1", "=1/0");
  assert.equal(byZero.shown, "#DIV/0!");
  assert.equal(byZero.printed, "—");
  const emptySource = written(table, "C1", "=A1/B1");
  assert.equal(emptySource.shown, "#DIV/0!");
  assert.equal(emptySource.printed, "—");
  assert.equal(written(table, "C1", "=A1*2").printed, "200", "a figure prints as always");
});

test("FAL-07: a concept computed by a formula without a number prints «—», not its error", () => {
  const concept = { id: "k", label: "Superficie", value: "#DIV/0!", formula: { expression: { type: "constant" as const, value: 0 } } };
  assert.equal(renderToStaticMarkup(createElement(DocumentConceptValue, { concept })), "—");
  assert.equal(renderToStaticMarkup(createElement(DocumentConceptValue, { concept: { ...concept, value: "205" } })), "205");
});
