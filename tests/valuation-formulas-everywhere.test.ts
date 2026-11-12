/**
 * One formula system in every table and numeric field (client's videos of
 * November 2026): "=" in a field of a calculation panel writes the same
 * formulas, with references to the valuation, as the editor's tables; "10%"
 * counts and reads as 0.1; letters in a numeric field are marked; a value
 * (not only a formula) copies to its row or column; a formula that only
 * brings another concept's value offers to link it. Values are invented.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { formulaOfText } from "../src/features/valuations/calculation/captured-formulas";
import { NUMERIC_FIELD_MESSAGE, numericFieldProblem, parseDecimal, percentAsNumberText } from "../src/features/valuations/calculation/free-formula";
import { linkConceptValueTo, resolveEffectiveConcept } from "../src/features/valuations/concept-links";
import type { AppSection, Block, Concept, TableContent } from "../src/features/valuations/model";
import { formatMoneyForDocument } from "../src/features/valuations/services/concept-value-format";
import { capturedFormulaText } from "../src/features/valuations/services/formula-reference-values";
import { buildFormulaIndex, compileFormula, referencedConceptOnly } from "../src/features/valuations/services/formula-references";
import { fillColumnWithFormula, fillRowWithFormula, type TableV2 } from "../src/features/valuations/services/table";
import { EMPTY_CELL_HINT, captureFillTargets, tableContextMenu, type TableMenuAction } from "../src/features/valuations/services/table-context-menu";

const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, type: "number", ...extra });

function tableOf(id: string, title: string, columns: string[], rows: string[][]): TableV2 {
  return {
    id,
    title,
    version: 2,
    columns: columns.map((name, index) => ({ id: `c${index + 1}`, name })),
    rows: rows.map((row, rowIndex) => ({
      id: `r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`c${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

function valuation(concepts: Concept[], tables: TableV2[] = []): AppSection[] {
  const block: Block = {
    id: "bloque-terreno",
    title: "Terreno",
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts,
    apartados: [],
    tables: tables as unknown as TableContent[],
    images: [],
  };
  return [{ id: "terreno", label: "TERRENO", title: "TERRENO", sourceFile: "", enabled: true, required: false, blocks: [block] }];
}

const sections = valuation(
  [concept("c-superficie", "Superficie total de terreno", "1250"), concept("c-colonia", "Colonia", "Centro", { type: "text" })],
  [tableOf("t-lotes", "Lotes", ["Lote", "Superficie"], [["A", "600"], ["B", "650"]])],
);
const index = buildFormulaIndex(sections);

test("a field of a calculation panel takes a reference to a concept: it keeps the formula with the number it reads", () => {
  const typed = "=[Superficie total de terreno]*2";
  const captured = capturedFormulaText(typed, index);
  assert.deepEqual(captured, { ok: true, text: "=1250*2" });
  // What the panel saves is a formula the capture computes and the server checks.
  assert.equal(formulaOfText(captured.ok ? captured.text : ""), "=1250*2");
  assert.equal(parseDecimal(captured.ok ? captured.text : ""), 2500);
});

test("a panel field takes cells of the document's tables, and keeps arithmetic of its own", () => {
  assert.deepEqual(capturedFormulaText("=[Lotes]!B1+[Lotes]!B2", index), { ok: true, text: "=600+650" });
  assert.deepEqual(capturedFormulaText("=SUMA([Lotes]!B1:B2)", index), { ok: true, text: "=SUMA(600; 650)" });
  assert.deepEqual(capturedFormulaText("=(1345*235)^(1/6)", index), { ok: true, text: "=(1345*235)^(1/6)" });
});

test("a reference without a number answers with the reason instead of a wrong figure", () => {
  const result = capturedFormulaText("=[Colonia]*2", index);
  assert.equal(result.ok, false);
  assert.equal(capturedFormulaText("=[No existe]*2", index).ok, false);
});

test("«10%» typed in a numeric field reads and stays as 0.1", () => {
  assert.equal(percentAsNumberText("10%"), "0.1");
  assert.equal(percentAsNumberText(" 10 % "), "0.1");
  assert.equal(percentAsNumberText("-5%"), "-0.05");
  assert.equal(percentAsNumberText("12.5"), "12.5", "a number stays as typed");
  assert.equal(percentAsNumberText("=10%*2"), "=10%*2", "a formula is the formula bar's");
  assert.equal(percentAsNumberText("abc%"), "abc%", "what is not a number is left to be marked");
  assert.equal(parseDecimal(percentAsNumberText("10%")), parseDecimal("10%"), "the value does not change, only how it reads");
});

test("letters in a numeric field are marked (a warning only); numbers, amounts, percentages and formulas are not", () => {
  assert.equal(numericFieldProblem("abc"), NUMERIC_FIELD_MESSAGE);
  assert.equal(numericFieldProblem("12 metros"), NUMERIC_FIELD_MESSAGE);
  assert.equal(numericFieldProblem("150.5"), null);
  assert.equal(numericFieldProblem("$ 9,000"), null);
  assert.equal(numericFieldProblem("10%"), null);
  assert.equal(numericFieldProblem(""), null);
  assert.equal(numericFieldProblem("=5*2"), null);
});

const rows = () => tableOf("t", "Frentes", ["Comparable", "Frentes"], [["C1", "1"], ["C2", ""], ["C3", "2"], ["C4", ""]]);
const cell = (table: TableV2, row: string, column: string) => table.rows.find((item) => item.id === row)?.cells[column];

test("«Copiar valor a toda la columna» writes a plain value in the empty cells and keeps what was written", () => {
  const filled = fillColumnWithFormula(rows(), "r1", "c2");
  assert.deepEqual(filled.rows.map((row) => (row.cells.c2 as { value: string }).value), ["1", "1", "2", "1"]);
});

test("«Copiar valor a toda la fila» writes a plain value in the empty cells of the row", () => {
  const table = tableOf("t", "Fila", ["A", "B", "C"], [["5", "", "7"]]);
  const filled = fillRowWithFormula(table, "r1", "c1");
  assert.deepEqual(["c1", "c2", "c3"].map((id) => (cell(filled, "r1", id) as { value: string }).value), ["5", "5", "7"]);
  assert.equal(fillRowWithFormula(tableOf("t", "Vacía", ["A", "B"], [["", ""]]), "r1", "c1").rows[0].cells.c2?.kind, "value", "an empty cell copies nothing");
});

test("the menu copies a value too, and only an empty cell has nothing to copy", () => {
  const base = { kind: "cell" as const, editable: true, hasFormula: false, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true };
  const find = (menu: ReturnType<typeof tableContextMenu>, action: TableMenuAction) => menu.flat().find((entry) => entry.action === action)!;
  for (const kind of ["editable", "capture"] as const) {
    const withValue = tableContextMenu(kind, { ...base, hasValue: true });
    assert.equal(find(withValue, "fill-column").label, "Copiar valor a toda la columna");
    assert.equal(find(withValue, "fill-column").disabled, undefined, kind);
    assert.equal(find(withValue, "fill-row").disabled, undefined, kind);
    const empty = tableContextMenu(kind, base);
    assert.equal(find(empty, "fill-row").disabled, true);
    assert.equal(find(empty, "fill-row").hint, EMPTY_CELL_HINT);
  }
  // A capture table writes the value in the empty fields of its column, as a formula.
  assert.deepEqual(captureFillTargets([{ takesTyping: true, text: "1", hasFormula: false }, { takesTyping: true, text: "", hasFormula: false }, { takesTyping: true, text: "3", hasFormula: false }], 0), [1]);
});

test("a formula that only brings another concept's value can be linked to it", () => {
  const only = compileFormula("=[Superficie total de terreno]", { index });
  const more = compileFormula("=[Superficie total de terreno]*2", { index });
  assert.ok(only.ok && more.ok);
  assert.equal(referencedConceptOnly(only.formula), "c-superficie");
  assert.equal(referencedConceptOnly(more.formula), null, "an operation is not a link");
  assert.equal(referencedConceptOnly(undefined), null);

  const concepts = [concept("c-superficie", "Superficie total de terreno", "1250"), concept("c-sup-construccion", "Superficie de terreno (resumen)", "", { formula: only.formula })];
  const linked = linkConceptValueTo(concepts, "c-sup-construccion", "c-superficie");
  const [source, target] = linked;
  assert.equal(target.value, "1250");
  assert.equal(target.formula, undefined, "the link replaces the formula");
  assert.equal(target.label, "Superficie de terreno (resumen)", "its title stays its own");
  assert.ok(source.valueKey && source.valueKey === target.valueKey, "both share the value");
  // A later change of the source shows in the linked concept.
  const changed = linked.map((item) => (item.id === "c-superficie" ? { ...item, value: "1300" } : item));
  assert.equal(resolveEffectiveConcept(changed[1], changed).value, "1300");
});

test("the concluded amount reads in the panel as the dictamen prints it, with «M.N.»", () => {
  assert.equal(formatMoneyForDocument(2_200_000, { legalTender: true }), "$2,200,000.00 M.N.");
});
