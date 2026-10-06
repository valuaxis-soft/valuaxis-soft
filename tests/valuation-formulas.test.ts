import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFormula, parseFormula, FORMULA_MAX_LENGTH } from "../src/features/valuations/calculation/free-formula";
import { applyConceptFormulaEverywhere } from "../src/features/valuations/concept-links";
import { conceptMetadataFromContent, hydrateConceptMetadata } from "../src/features/valuations/metadata";
import type { AppSection, Block, Concept, TableContent } from "../src/features/valuations/model";
import {
  buildFormulaIndex,
  cellAddress,
  cellReferenceText,
  columnLetter,
  compileFormula,
  conceptReferenceText,
  formulaToText,
  isFormulaText,
  type FormulaIndex,
} from "../src/features/valuations/services/formula-references";
import {
  buildFormulaFromSelection,
  fillColumnWithFormula,
  duplicateTableRow,
  ensureTableV2,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  readStoredFormula,
  removeTableColumn,
  removeTableRow,
  setCellFormula,
  setCellResultFormat,
  type TableFormula,
  type TableV2,
} from "../src/features/valuations/services/table";
import {
  evaluateTableFormulas,
  formatFormulaNumber,
  getCellDisplayValue,
  readSourceNumber,
} from "../src/features/valuations/services/table-formula-engine";
import { serializeTableForSave } from "../src/features/valuations/services/table-persistence";
import {
  applyValuationFormulas,
  conceptFormulaValue,
  conceptSourceValue,
  conceptTakesFormula,
} from "../src/features/valuations/services/valuation-formulas";

/* ------------------------------------------------------------------ */
/*  Builders                                                           */
/* ------------------------------------------------------------------ */

/** A table of plain values: ids are c1, c2… and r1, r2… */
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

const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, ...extra });

function sectionsOf(content: { concepts?: Concept[]; tables?: TableV2[]; blocks?: Block[] }): AppSection[] {
  const block = (id: string, concepts: Concept[], tables: TableV2[]): Block => ({
    id,
    title: "Bloque",
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts,
    apartados: [],
    tables: tables as unknown as TableContent[],
    images: [],
  });
  return [{
    id: "terreno",
    label: "TERRENO",
    title: "TERRENO",
    sourceFile: "",
    enabled: true,
    required: false,
    blocks: content.blocks ?? [block("bloque-1", content.concepts ?? [], content.tables ?? [])],
  }];
}

const tablesIn = (sections: AppSection[]) => sections.flatMap((section) => section.blocks.flatMap((block) => block.tables)).map((table) => ensureTableV2(table));
const conceptsIn = (sections: AppSection[]) => sections.flatMap((section) => section.blocks.flatMap((block) => block.concepts));
const NO_INDEX: FormulaIndex = buildFormulaIndex([]);

/** Writes a formula in a cell as the editor does: compiled against the table as it is shown. */
function typed(table: TableV2, address: string, text: string, index: FormulaIndex = NO_INDEX): TableV2 {
  const compiled = compileFormula(text, { index, table });
  assert.ok(compiled.ok, `${text} compiles${compiled.ok ? "" : `: ${compiled.message}`}`);
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, columnIndex) => columnLetter(columnIndex) === letters)!;
  return setCellFormula(table, table.rows[Number(number) - 1].id, column.id, compiled.formula);
}

/** What the cell at an address shows. */
function shown(table: TableV2, address: string): string {
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, columnIndex) => columnLetter(columnIndex) === letters)!;
  return getCellDisplayValue(table, table.rows[Number(number) - 1].id, column.id, evaluateTableFormulas(table));
}

const textOf = (table: TableV2, rowId: string, columnId: string, index: FormulaIndex = NO_INDEX) => {
  const cell = table.rows.find((row) => row.id === rowId)!.cells[columnId];
  assert.equal(cell.kind, "formula");
  return cell.kind === "formula" ? formulaToText(cell.formula, { index, table }) : "";
};

/* ------------------------------------------------------------------ */
/*  Parser                                                             */
/* ------------------------------------------------------------------ */

test("the parser reads cells, ranges, names of tables and concepts, and functions", () => {
  assert.deepEqual(parseFormula("B2*C2"), {
    type: "binary",
    operator: "*",
    left: { type: "cell", position: { column: 1, row: 1 } },
    right: { type: "cell", position: { column: 2, row: 1 } },
  });
  assert.deepEqual(parseFormula("b2"), { type: "cell", position: { column: 1, row: 1 } }, "lower case reads the same");
  assert.deepEqual(parseFormula("$B$2"), { type: "cell", position: { column: 1, row: 1 } }, "anchors are ignored");
  assert.deepEqual(parseFormula("AA10"), { type: "cell", position: { column: 26, row: 9 } });
  assert.deepEqual(parseFormula("SUMA(A1:A5)"), {
    type: "call",
    name: "SUM",
    args: [{ type: "range", from: { column: 0, row: 0 }, to: { column: 0, row: 4 } }],
  });
  assert.deepEqual(parseFormula("[Tabla de homologación]!C3"), { type: "cell", table: "Tabla de homologación", position: { column: 2, row: 2 } });
  assert.deepEqual(parseFormula("Homologación!C3"), { type: "cell", table: "Homologación", position: { column: 2, row: 2 } });
  assert.deepEqual(parseFormula("[Superficie total de terreno]"), { type: "name", name: "Superficie total de terreno" });
  assert.deepEqual(parseFormula("[T]!A1:B2"), { type: "range", table: "T", from: { column: 0, row: 0 }, to: { column: 1, row: 1 } });
});

test("functions are written in Spanish or English, with or without accents, and separate arguments with ; or ,", () => {
  for (const [written, name] of [
    ["SUMA(1;2)", "SUM"], ["sum(1;2)", "SUM"], ["PROMEDIO(1;2)", "AVERAGE"], ["PRODUCTO(1;2)", "PRODUCT"],
    ["RAIZ(4)", "SQRT"], ["RAÍZ(4)", "SQRT"], ["raíz(4)", "SQRT"], ["POTENCIA(2;3)", "POWER"], ["REDONDEAR(1.5;0)", "ROUND"],
    ["MIN(1;2)", "MIN"], ["MAX(1,2)", "MAX"],
  ] as const) {
    const parsed = parseFormula(written);
    assert.equal(parsed?.type === "call" ? parsed.name : null, name, written);
  }
});

test("plain arithmetic follows the precedence of a spreadsheet", () => {
  assert.equal(evaluateFormula("2+3*4"), 14);
  assert.equal(evaluateFormula("(2+3)*4"), 20);
  assert.equal(evaluateFormula("2^3^2"), 64, "powers are read from the left");
  assert.equal(evaluateFormula("-2^2"), 4, "the sign binds before the power");
  assert.equal(evaluateFormula("50%*200"), 100);
  assert.equal(evaluateFormula("RAIZ(27;3)"), 3);
  assert.equal(evaluateFormula("RAIZ(16)"), 4);
  assert.equal(evaluateFormula("POTENCIA(2;10)"), 1024);
  assert.equal(evaluateFormula("27^(1/3)"), 3);
  assert.equal(evaluateFormula("REDONDEAR(0.95*1.05*0.98;4)"), 0.9776);
  assert.equal(evaluateFormula("SUMA(1,234)"), 1234, "a comma before three digits is the thousands separator");
  assert.equal(evaluateFormula("MAX(1;5;3)-MIN(1;5;3)"), 4);
  assert.equal(evaluateFormula("1/0"), null);
  assert.equal(evaluateFormula("B2*2"), null, "a reference has no value in plain arithmetic");
});

test("what is not a formula is rejected, never run and never a crash", () => {
  const garbage = [
    "", " ", "=", "1+", "*2", "(1+2", "1+2)", "((", "))", "1 2", "1..2", "A", "B2C3", "A0", "A1:", "A1:B", ":A1",
    "SUMA(", "SUMA()", "SUMA(1;)", "NOEXISTE(1)", "alert(1)", "constructor(1)", "__proto__", "toString()", "hasOwnProperty(1)",
    "[", "[]", "[sin cerrar", "[]!A1", "[Tabla]!", "[Tabla]!1", "Tabla!", "'", "''", "1;2", "1,2", "A1!B2", "#REF!", "#REF!*2",
    "process.exit(1)", "require('fs')", "this", "globalThis", "`x`", "${1}", "1e309", "=1+1", "\u0000", "😀", "A1 B1", "2(3)",
    "eval(1)", "Function(1)", "import(1)", "a=1", "1==1", "1<2", "&&", "{}", "[1,2][0]", "x=>x",
  ];
  for (const text of garbage) {
    assert.equal(parseFormula(text), null, JSON.stringify(text));
    assert.equal(compileFormula(`=${text}`, { index: NO_INDEX, table: tableOf("t", "T", ["A"], [["1"]]) }).ok, false, JSON.stringify(text));
  }
  // The names a call can use are a closed list: a property of every object is not one of them.
  assert.equal(evaluateFormula("valueOf(1)"), null);
});

test("nesting deeper than anyone writes, and formulas longer than anyone types, are rejected without exhausting the stack", () => {
  const nested = (depth: number) => `${"(".repeat(depth)}1${")".repeat(depth)}`;
  assert.equal(evaluateFormula(nested(20)), 1);
  assert.equal(parseFormula(nested(60)), null);
  assert.equal(parseFormula(nested(900)), null);
  assert.equal(parseFormula("-".repeat(1_500) + "1"), null);
  assert.equal(parseFormula("RAIZ(".repeat(300) + "4" + ")".repeat(300)), null);
  assert.equal(parseFormula(Array.from({ length: 400 }, () => "1").join("+")) !== null, true, "a long sum is not nesting");
  assert.equal(parseFormula("1+".repeat(FORMULA_MAX_LENGTH) + "1"), null, "too long");
  assert.equal(parseFormula("(".repeat(200_000)), null);
});

/* ------------------------------------------------------------------ */
/*  Cells: text ⇄ stored formula                                       */
/* ------------------------------------------------------------------ */

const areas = () => tableOf("t-areas", "Superficies", ["Concepto", "Superficie", "Valor unitario", "Importe"], [
  ["Terreno", "169.78", "$ 9,000.00", ""],
  ["Construcción", "120.5", "$8,500", ""],
  ["Bodega", "10", "1,200.50", ""],
]);

test("a typed formula is stored by the ids of its cells and reads back as it was typed", () => {
  const table = typed(areas(), "D2", "=B2*C2");
  const cell = table.rows[1].cells.c4;
  assert.deepEqual(cell, {
    kind: "formula",
    formula: {
      expression: {
        type: "binary",
        operator: "MULTIPLY",
        left: { type: "operand", operand: { type: "cell", rowId: "r2", columnId: "c2" } },
        right: { type: "operand", operand: { type: "cell", rowId: "r2", columnId: "c3" } },
      },
    },
  });
  assert.equal(textOf(table, "r2", "c4"), "B2*C2");
  assert.equal(shown(table, "D2"), "$1,024,250.00", "an amount by a quantity is an amount");
});

test("text → stored → text is stable for every kind of formula", () => {
  const table = areas();
  for (const [written, expected] of [
    ["=B1*C1", "B1*C1"],
    ["= b1 * c1 ", "B1*C1"],
    ["=$B$1*C1", "B1*C1"],
    ["=(B1+B2)*C1", "(B1+B2)*C1"],
    ["=B1+B2*C1", "B1+B2*C1"],
    ["=B1-(B2-B3)", "B1-(B2-B3)"],
    ["=B1/(B2*B3)", "B1/(B2*B3)"],
    ["=B1^2", "B1^2"],
    ["=(B1*B2)^(1/6)", "(B1*B2)^(1/6)"],
    ["=-B1", "-B1"],
    ["=-(B1+B2)", "-(B1+B2)"],
    ["=B1*10%", "B1*10%"],
    ["=SUMA(B1:B3)", "SUMA(B1:B3)"],
    ["=sum(B1:B3)", "SUMA(B1:B3)"],
    ["=PROMEDIO(B1:B3; 5)", "PROMEDIO(B1:B3; 5)"],
    ["=PRODUCTO(B1,B2,B3)", "PRODUCTO(B1; B2; B3)"],
    ["=RAIZ(B1)", "RAIZ(B1)"],
    ["=raíz(B1; 3)", "RAIZ(B1; 3)"],
    ["=POTENCIA(B1; 2)", "POTENCIA(B1; 2)"],
    ["=REDONDEAR(B1/B2; 2)", "REDONDEAR(B1/B2; 2)"],
    ["=MIN(B1:B3)+MAX(B1:B3)", "MIN(B1:B3)+MAX(B1:B3)"],
    ["=1,234.5*B1", "1234.5*B1"],
    ["=B1×C1÷2", "B1*C1/2"],
  ] as const) {
    const compiled = compileFormula(written, { index: NO_INDEX, table });
    assert.ok(compiled.ok, written);
    const text = formulaToText(compiled.formula, { index: NO_INDEX, table });
    assert.equal(text, expected, written);
    const again = compileFormula(`=${text}`, { index: NO_INDEX, table });
    assert.ok(again.ok);
    assert.deepEqual(again.formula, compiled.formula, `${written} compiles to the same formula from its own text`);
  }
});

test("a formula that cannot be one says why in the appraiser's words", () => {
  const table = areas();
  const message = (text: string, index = NO_INDEX) => {
    const compiled = compileFormula(text, { index, table });
    assert.equal(compiled.ok, false, text);
    return compiled.ok ? "" : compiled.message;
  };
  assert.match(message("="), /después del signo =/);
  assert.match(message("=B2*"), /incompleta o mal escrita/);
  assert.match(message("=NOEXISTE(B2)"), /incompleta o mal escrita/);
  assert.match(message("=Z9"), /La celda Z9 no existe: la tabla tiene 3 filas y 4 columnas/);
  assert.match(message("=B9"), /La celda B9 no existe/);
  assert.match(message("=[No hay]!A1"), /No hay una tabla llamada «No hay»/);
  assert.match(message("=[No hay]"), /No hay un concepto llamado «No hay»/);
  const index = buildFormulaIndex(sectionsOf({ tables: [table] }));
  assert.match(message("=[Superficies]", index), /es una tabla: indica la celda/);
  // A concept has no table of its own.
  const inConcept = compileFormula("=B2", { index });
  assert.equal(inConcept.ok, false);
  assert.match(inConcept.ok ? "" : inConcept.message, /Indica de qué tabla es la celda/);
});

test("isFormulaText: only what starts with = asks to be computed", () => {
  assert.equal(isFormulaText("=B2"), true);
  assert.equal(isFormulaText("  =B2"), true);
  assert.equal(isFormulaText("B2"), false);
  assert.equal(isFormulaText("a = b"), false);
  assert.equal(isFormulaText(""), false);
});

test("column letters", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  assert.equal(cellAddress(areas(), "r2", "c3"), "C2");
  assert.equal(cellAddress(areas(), "r9", "c3"), null);
  assert.equal(cellAddress(areas(), "r2", "c9"), null);
});

/* ------------------------------------------------------------------ */
/*  References follow what they point at                               */
/* ------------------------------------------------------------------ */

test("moving rows and columns changes how the formula reads, not what it computes", () => {
  let table = typed(areas(), "D2", "=B2*C2");
  assert.equal(shown(table, "D2"), "$1,024,250.00");

  table = moveTableRow(table, 1, 0);
  assert.equal(textOf(table, "r2", "c4"), "B1*C1");
  assert.equal(shown(table, "D1"), "$1,024,250.00");

  table = moveTableColumn(table, 1, 2);
  assert.equal(textOf(table, "r2", "c4"), "C1*B1");
  assert.equal(shown(table, "D1"), "$1,024,250.00");

  table = moveTableColumn(table, 3, 0);
  assert.equal(textOf(table, "r2", "c4"), "D1*C1");
  assert.equal(shown(table, "A1"), "$1,024,250.00");
});

test("inserting rows and columns before a source shifts its address", () => {
  let table = typed(areas(), "D2", "=B2*C2");
  table = insertTableRow(table, 0);
  table = insertTableColumn(table, 1, "Nueva");
  assert.equal(textOf(table, "r2", "c4"), "C3*D3");
  assert.equal(shown(table, "E3"), "$1,024,250.00");
});

test("a range takes in the rows inserted between its corners", () => {
  let table = typed(areas(), "D1", "=SUMA(B1:B3)");
  assert.equal(shown(table, "D1"), "300.28");
  table = insertTableRow(table, 1);
  const inserted = table.rows[1];
  table = { ...table, rows: table.rows.map((row) => (row.id === inserted.id ? { ...row, cells: { ...row.cells, c2: { kind: "value", value: "100" } } } : row)) };
  assert.equal(textOf(table, "r1", "c4"), "SUMA(B1:B4)");
  assert.equal(shown(table, "D1"), "400.28");
  // Reversed corners are the same range.
  const reversed = typed(areas(), "D1", "=SUMA(B3:B1)");
  assert.equal(shown(reversed, "D1"), "300.28");
});

test("a deleted source reads #REF! in the formula and in the cell", () => {
  const original = typed(typed(areas(), "D2", "=B2*C2"), "D3", "=SUMA(B1:B3)");

  const withoutColumn = removeTableColumn(original, "c3");
  assert.equal(textOf(withoutColumn, "r2", "c4"), "B2*#REF!");
  assert.equal(shown(withoutColumn, "C2"), "#REF!");
  assert.equal(shown(withoutColumn, "C3"), "300.28", "a range whose corners remain still adds");

  const withoutRow = removeTableRow(original, 0);
  assert.equal(textOf(withoutRow, "r2", "c4"), "B1*C1", "the row above is gone: the formula's own row moved up");
  assert.equal(shown(withoutRow, "D1"), "$1,024,250.00");
  assert.equal(textOf(withoutRow, "r3", "c4"), "SUMA(#REF!)", "the first corner of the range was deleted");
  assert.equal(shown(withoutRow, "D2"), "#REF!");

  // What reads a broken formula is broken too.
  const chained = typed(withoutColumn, "A1", "=C2+1");
  assert.equal(shown(chained, "A1"), "#REF!");
  // #REF! cannot be applied again as a formula.
  assert.equal(compileFormula("=B2*#REF!", { index: NO_INDEX, table: withoutColumn }).ok, false);
});

test("copying a formula down the column and duplicating its row move the references of its own row", () => {
  let table = typed(areas(), "D1", "=B1*C1");
  table = fillColumnWithFormula(table, "r1", "c4");
  assert.equal(textOf(table, "r2", "c4"), "B2*C2");
  assert.equal(textOf(table, "r3", "c4"), "B3*C3");
  assert.equal(shown(table, "D3"), "12,005");

  table = duplicateTableRow(table, 0);
  const copy = table.rows[1];
  assert.equal(textOf(table, copy.id, "c4"), "B2*C2");
  assert.equal(shown(table, "D2"), shown(table, "D1"));
});

/* ------------------------------------------------------------------ */
/*  Homologation: several factors of a row                             */
/* ------------------------------------------------------------------ */

test("the factors of a homologation row multiply into its result", () => {
  let table = tableOf("t-homologacion", "Homologación", ["Ref", "Valor $/m²", "Neg.", "Zona", "Ubic.", "Sup.", "F. resultante", "Valor homologado"], [
    ["1", "$ 9,000.00", "0.95", "1.05", "0.98", "1.02", "", ""],
    ["2", "$ 8,200.00", "0.95", "1.00", "1.03", "0.97", "", ""],
  ]);
  table = typed(table, "G1", "=C1*D1*E1*F1");
  table = typed(table, "H1", "=B1*G1");
  table = fillColumnWithFormula(table, "r1", "c7");
  table = fillColumnWithFormula(table, "r1", "c8");
  assert.equal(shown(table, "G1"), "0.9971");
  assert.equal(shown(table, "H1"), "$8,973.91");
  assert.equal(shown(table, "G2"), "0.9491");
  assert.equal(shown(table, "H2"), "$7,782.99");
  table = typed(table, "G2", "=REDONDEAR(PRODUCTO(C2:F2); 2)");
  assert.equal(shown(table, "G2"), "0.95");
  assert.equal(shown(table, "H2"), "$7,790.00");
});

/* ------------------------------------------------------------------ */
/*  "Resultado / Fórmula": formulas built from selected cells          */
/* ------------------------------------------------------------------ */

test("the selection builder chains the four operations over the selected cells", () => {
  const cells = [{ rowId: "r1", columnId: "c2" }, { rowId: "r2", columnId: "c2" }, { rowId: "r3", columnId: "c2" }];
  const table = areas();
  const apply = (operation: Parameters<typeof buildFormulaFromSelection>[0], sources = cells, parameter?: number | null) => {
    const formula = buildFormulaFromSelection(operation, sources, { parameter });
    return formula ? { text: formulaToText(formula, { index: NO_INDEX, table }), shown: shown(setCellFormula(table, "r1", "c4", formula), "D1") } : null;
  };
  assert.deepEqual(apply("ADD"), { text: "B1+B2+B3", shown: "300.28" });
  assert.deepEqual(apply("SUBTRACT"), { text: "B1-B2-B3", shown: "39.28" });
  assert.deepEqual(apply("MULTIPLY"), { text: "B1*B2*B3", shown: "204,584.9" });
  assert.deepEqual(apply("DIVIDE", cells.slice(0, 2)), { text: "B1/B2", shown: "1.409" });
  assert.deepEqual(apply("SUM"), { text: "SUMA(B1; B2; B3)", shown: "300.28" });
  assert.deepEqual(apply("AVERAGE"), { text: "PROMEDIO(B1; B2; B3)", shown: "100.0933" });
  assert.equal(apply("MULTIPLY", cells.slice(0, 1)), null, "one cell is not a multiplication");
  assert.equal(apply("ADD", []), null);
});

test("the selection builder: power and root", () => {
  const base = [{ rowId: "r3", columnId: "c2" }];
  const two = [{ rowId: "r3", columnId: "c2" }, { rowId: "r1", columnId: "c1" }];
  const table = tableOf("t", "T", ["Exponente", "Base"], [["3", ""], ["", ""], ["", "8"]]);
  const apply = (operation: "POWER" | "ROOT", sources: typeof base, parameter?: number | null) => {
    const formula = buildFormulaFromSelection(operation, sources, { parameter });
    return formula ? { text: formulaToText(formula, { index: NO_INDEX, table }), shown: shown(setCellFormula(table, "r2", "c1", formula), "A2") } : null;
  };
  assert.deepEqual(apply("POWER", base, 2), { text: "B3^2", shown: "64" });
  assert.deepEqual(apply("POWER", two), { text: "B3^A1", shown: "512" });
  assert.equal(apply("POWER", base), null, "a power needs its exponent");
  assert.equal(apply("POWER", base, Number.NaN), null);
  assert.deepEqual(apply("ROOT", base), { text: "RAIZ(B3)", shown: "2.8284" });
  assert.deepEqual(apply("ROOT", base, 3), { text: "RAIZ(B3; 3)", shown: "2" });
  assert.deepEqual(apply("ROOT", two), { text: "RAIZ(B3; A1)", shown: "2" });
  assert.equal(apply("ROOT", [...two, { rowId: "r2", columnId: "c2" }]), null, "a root reads at most two cells");
  assert.equal(apply("POWER", two, 5)?.text, "B3^A1", "a second cell wins over the typed exponent");
});

/* ------------------------------------------------------------------ */
/*  Reading and writing numbers                                        */
/* ------------------------------------------------------------------ */

test("the number a written value stands for", () => {
  assert.deepEqual(readSourceNumber("169.78 m²"), { kind: "number", value: 169.78, money: false });
  assert.deepEqual(readSourceNumber("$ 9,000.00"), { kind: "number", value: 9000, money: true });
  assert.deepEqual(readSourceNumber("$9,000.00 MXN"), { kind: "number", value: 9000, money: true });
  assert.deepEqual(readSourceNumber("-$ 1,250.5"), { kind: "number", value: -1250.5, money: true });
  assert.deepEqual(readSourceNumber("5%"), { kind: "number", value: 0.05, money: false });
  assert.deepEqual(readSourceNumber("12.5 %"), { kind: "number", value: 0.125, money: false });
  assert.deepEqual(readSourceNumber(".5"), { kind: "number", value: 0.5, money: false });
  assert.deepEqual(readSourceNumber("1,528,020"), { kind: "number", value: 1528020, money: false });
  assert.deepEqual(readSourceNumber(""), { kind: "blank" });
  assert.deepEqual(readSourceNumber("—"), { kind: "blank" });
  for (const text of ["Villa Toledo", "12/03/2026", "10 x 20", "Lote 5 manzana 3", "#REF!", "=B2", "NaN", "Infinity"]) {
    assert.deepEqual(readSourceNumber(text), { kind: "text" }, text);
  }
});

test("arithmetic with text is #VALOR!, with nothing written it is zero, and sums skip both", () => {
  let table = tableOf("t", "T", ["A", "B", "C"], [["Villa Toledo", "", "10"], ["", "", ""]]);
  table = typed(table, "A2", "=A1*2");
  table = typed(table, "B2", "=B1+C1");
  table = typed(table, "C2", "=SUMA(A1:C1)");
  assert.equal(shown(table, "A2"), "#VALOR!");
  assert.equal(shown(table, "B2"), "10");
  assert.equal(shown(table, "C2"), "10");
  assert.equal(shown(typed(table, "A2", "=C1/B1"), "A2"), "#DIV/0!");
  assert.equal(shown(typed(table, "A2", "=RAIZ(0-C1)"), "A2"), "#ERROR");
});

test("a result is written with the format chosen for its cell, or follows its sources", () => {
  assert.equal(formatFormulaNumber(1528020, undefined), "1,528,020");
  assert.equal(formatFormulaNumber(0.97755, undefined), "0.9776");
  assert.equal(formatFormulaNumber(1528020, undefined, true), "$1,528,020.00");
  assert.equal(formatFormulaNumber(1234.5, { type: "number", precision: 2 }), "1,234.50");
  assert.equal(formatFormulaNumber(1234.5, { type: "currency", precision: 2 }), "$1,234.50");
  assert.equal(formatFormulaNumber(0.0525, { type: "percent", precision: 2 }), "5.25%");
  assert.equal(formatFormulaNumber(169.784, { type: "measurement", unit: "m²" } as never), "169.78 m²");

  let table = typed(areas(), "D1", "=B1*C1");
  assert.equal(shown(table, "D1"), "$1,528,020.00");
  table = setCellResultFormat(table, "r1", "c4", { type: "number", precision: 2 });
  assert.equal(shown(table, "D1"), "1,528,020.00");
  // Writing the formula again keeps the format chosen for its result.
  table = typed(table, "D1", "=B1*C1/2");
  assert.equal(shown(table, "D1"), "764,010.00");
  table = setCellResultFormat(table, "r1", "c4", null);
  assert.equal(shown(table, "D1"), "$764,010.00");
});

test("a concept contributes the number it shows", () => {
  assert.deepEqual(conceptSourceValue(concept("a", "Superficie", "169.78", { valueFormat: "m2" })), { kind: "number", value: 169.78, money: false });
  assert.deepEqual(conceptSourceValue(concept("a", "Superficie", "169.78 m²")), { kind: "number", value: 169.78, money: false });
  assert.deepEqual(conceptSourceValue(concept("a", "Valor", "$ 9,000.00")), { kind: "number", value: 9000, money: true });
  assert.deepEqual(conceptSourceValue(concept("a", "Valor", "9000", { type: "currency" })), { kind: "number", value: 9000, money: true });
  assert.deepEqual(conceptSourceValue(concept("a", "Demérito", "5", { valueFormat: "percent" })), { kind: "number", value: 0.05, money: false });
  assert.deepEqual(conceptSourceValue(concept("a", "Demérito", "5%")), { kind: "number", value: 0.05, money: false });
  assert.deepEqual(conceptSourceValue(concept("a", "Uso", "Habitacional")), { kind: "text" });
  assert.deepEqual(conceptSourceValue(concept("a", "Uso", "")), { kind: "blank" });
  assert.deepEqual(conceptSourceValue(concept("a", "Fecha", "2026-10-06", { type: "date" })), { kind: "text" });
  // Captured in hectares, shown in square metres: the formula reads what is shown.
  assert.deepEqual(conceptSourceValue(concept("a", "Superficie", "2", { valueFormat: "m2", sourceUnit: "ha" })), { kind: "number", value: 20000, money: false });
});

test("a computed concept stores its result so that its format prints it", () => {
  const ok = (value: number, money = false) => ({ ok: true as const, value, ...(money ? { money } : {}) });
  assert.equal(conceptFormulaValue(concept("a", "Valor", "", { type: "currency" }), ok(1528020.004)), "1528020.00");
  assert.equal(conceptFormulaValue(concept("a", "Valor", "", { valueFormat: "mxn" }), ok(0.005)), "0.01");
  assert.equal(conceptFormulaValue(concept("a", "Superficie", "", { valueFormat: "m2" }), ok(290.28)), "290.28");
  assert.equal(conceptFormulaValue(concept("a", "Factor", "", { type: "number" }), ok(0.977550001)), "0.9776");
  assert.equal(conceptFormulaValue(concept("a", "Demérito", "", { valueFormat: "percent" }), ok(0.0525)), "5.25");
  assert.equal(conceptFormulaValue(concept("a", "Texto", ""), ok(1528020, true)), "$1,528,020.00");
  assert.equal(conceptFormulaValue(concept("a", "Texto", ""), ok(1234.56789)), "1,234.5679");
  assert.equal(conceptFormulaValue(concept("a", "Texto", ""), { ok: false, error: "DIVIDE_BY_ZERO" }), "#DIV/0!");
  assert.equal(conceptFormulaValue(concept("a", "Texto", "", { type: "currency" }), { ok: false, error: "MISSING_REFERENCE" }), "#REF!");
});

test("which concepts take a formula", () => {
  for (const type of [undefined, "text", "number", "currency", "measurement"] as const) assert.equal(conceptTakesFormula({ type }), true, String(type));
  for (const type of ["date", "longText", "phone", "url", "email"] as const) assert.equal(conceptTakesFormula({ type: type as Concept["type"] }), false, type);
});

/* ------------------------------------------------------------------ */
/*  The whole valuation                                                */
/* ------------------------------------------------------------------ */

function valuation() {
  const lots = tableOf("t-lotes", "Superficies", ["Lote", "Superficie"], [["A", "169.78"], ["B", "120.50"], ["Total", ""]]);
  const values = tableOf("t-valores", "Valores", ["Concepto", "Importe"], [["Terreno", ""], ["Demérito", ""]]);
  return sectionsOf({
    concepts: [
      concept("c-unitario", "Valor unitario:", "9000", { type: "currency" }),
      concept("c-superficie", "Superficie total de terreno:", "", { valueFormat: "m2" }),
      concept("c-valor", "Valor del terreno:", "", { type: "currency" }),
      concept("c-demerito", "Demérito:", "5", { valueFormat: "percent" }),
      concept("c-nota", "Uso de suelo:", "Habitacional"),
    ],
    tables: [lots, values],
  });
}

/** Sets the formula of a concept or of a cell, compiled against the document as it is. */
function write(sections: AppSection[], target: { concept: string } | { table: string; address: string }, text: string): AppSection[] {
  const index = buildFormulaIndex(sections);
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      if ("concept" in target) {
        const compiled = compileFormula(text, { index });
        assert.ok(compiled.ok, `${text}${compiled.ok ? "" : `: ${compiled.message}`}`);
        return { ...block, concepts: applyConceptFormulaEverywhere(block.concepts, target.concept, compiled.formula) };
      }
      return {
        ...block,
        tables: block.tables.map((table) => {
          const v2 = ensureTableV2(table);
          return v2.id === target.table ? (typed(v2, target.address, text, index) as unknown as TableContent) : table;
        }),
      };
    }),
  }));
}

const valueOf = (sections: AppSection[], id: string) => conceptsIn(sections).find((item) => item.id === id)!.value;
const cellOf = (sections: AppSection[], tableId: string, address: string) => shown(tablesIn(sections).find((table) => table.id === tableId)!, address);

test("tables and concepts are named by their titles, numbered when repeated, and found without case or accents", () => {
  const sections = sectionsOf({
    concepts: [concept("a", "Superficie:", "1"), concept("b", "Superficie", "2"), concept("c", "", "3"), concept("d", "Lote [A]", "4")],
    tables: [tableOf("t1", "Homologación", ["A"], [["1"]]), tableOf("t2", "Homologación", ["A"], [["2"]]), tableOf("t3", "", ["A"], [["3"]])],
  });
  const index = buildFormulaIndex(sections);
  assert.deepEqual(index.concepts.map((entry) => entry.name), ["Superficie", "Superficie (2)", "Concepto sin título", "Lote (A)"]);
  assert.deepEqual(index.tables.map((entry) => entry.name), ["Homologación", "Homologación (2)", "Tabla"]);

  const table = index.tables[2].table;
  const compiled = compileFormula("=[homologacion]!A1+[HOMOLOGACIÓN (2)]!A1+[superficie (2)]+[lote (a)]", { index, table });
  assert.ok(compiled.ok);
  assert.equal(formulaToText(compiled.formula, { index, table }), "[Homologación]!A1+[Homologación (2)]!A1+[Superficie (2)]+[Lote (A)]");
  // Naming the formula's own table is the same as not naming it.
  const own = compileFormula("=[Tabla]!A1", { index, table });
  assert.ok(own.ok);
  assert.equal(formulaToText(own.formula, { index, table }), "A1");
});

test("a click writes the reference as the formula needs it", () => {
  const sections = valuation();
  const index = buildFormulaIndex(sections);
  const lots = index.tableById.get("t-lotes")!.table;
  assert.equal(cellReferenceText(index, "t-lotes", lots, "r2", "c2", "t-lotes"), "B2", "a cell of the same table");
  assert.equal(cellReferenceText(index, "t-lotes", lots, "r2", "c2", "t-valores"), "[Superficies]!B2", "a cell of another table");
  assert.equal(cellReferenceText(index, "t-lotes", lots, "r2", "c2", undefined), "[Superficies]!B2", "a cell, from a concept");
  assert.equal(cellReferenceText(index, "t-lotes", lots, "r9", "c2", undefined), null);
  assert.equal(conceptReferenceText(index, "c-superficie"), "[Superficie total de terreno]");
  assert.equal(conceptReferenceText(index, "no-existe"), null);
});

test("cells read other tables and concepts, concepts read cells and concepts, in dependency order", () => {
  let sections = valuation();
  // Written from the last one to the first: the order they are computed in is theirs, not the order they are written in.
  sections = write(sections, { table: "t-valores", address: "B2" }, "=B1*[Demérito]");
  sections = write(sections, { table: "t-valores", address: "B1" }, "=[Valor del terreno]");
  sections = write(sections, { concept: "c-valor" }, "=[Superficie total de terreno]*[Valor unitario]");
  sections = write(sections, { concept: "c-superficie" }, "=[Superficies]!B3");
  sections = write(sections, { table: "t-lotes", address: "B3" }, "=SUMA(B1:B2)");
  const computed = applyValuationFormulas(sections);

  assert.equal(cellOf(computed, "t-lotes", "B3"), "290.28");
  assert.equal(valueOf(computed, "c-superficie"), "290.28");
  assert.equal(valueOf(computed, "c-valor"), "2612520.00");
  assert.equal(cellOf(computed, "t-valores", "B1"), "$2,612,520.00");
  assert.equal(cellOf(computed, "t-valores", "B2"), "$130,626.00");

  // The formulas read back with the names of what they point at.
  const index = buildFormulaIndex(computed);
  const valores = index.tableById.get("t-valores")!.table;
  assert.equal(textOf(valores, "r2", "c2", index), "B1*[Demérito]");
  assert.equal(formulaToText(conceptsIn(computed).find((item) => item.id === "c-superficie")!.formula!, { index }), "[Superficies]!B3");
  assert.equal(formulaToText(conceptsIn(computed).find((item) => item.id === "c-valor")!.formula!, { index }), "[Superficie total de terreno]*[Valor unitario]");
});

test("changing a source recomputes what depends on it; applying again changes nothing", () => {
  let sections = valuation();
  sections = write(sections, { table: "t-lotes", address: "B3" }, "=SUMA(B1:B2)");
  sections = write(sections, { concept: "c-superficie" }, "=[Superficies]!B3");
  sections = write(sections, { concept: "c-valor" }, "=[Superficie total de terreno]*[Valor unitario]");
  const computed = applyValuationFormulas(sections);
  assert.equal(valueOf(computed, "c-valor"), "2612520.00");
  assert.equal(applyValuationFormulas(computed), computed, "nothing changed: the same sections");

  const edited = computed.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({ ...block, concepts: block.concepts.map((item) => (item.id === "c-unitario" ? { ...item, value: "10000" } : item)) })),
  }));
  const recomputed = applyValuationFormulas(edited);
  assert.equal(valueOf(recomputed, "c-valor"), "2902800.00");
  assert.equal(recomputed[0].blocks[0].tables, edited[0].blocks[0].tables, "tables that did not change are the same objects");
  assert.equal(applyValuationFormulas(recomputed), recomputed);
});

test("a valuation without formulas is returned as it is", () => {
  const sections = valuation();
  assert.equal(applyValuationFormulas(sections), sections);
});

test("a formula that reads itself, directly or through others, is #CIRCULAR and so is what reads it; the rest still computes", () => {
  let sections = valuation();
  sections = write(sections, { table: "t-lotes", address: "B3" }, "=SUMA(B1:B3)");
  assert.equal(cellOf(applyValuationFormulas(sections), "t-lotes", "B3"), "#CIRCULAR", "a cell inside its own range");

  sections = valuation();
  sections = write(sections, { concept: "c-superficie" }, "=[Valores]!B1");
  sections = write(sections, { table: "t-valores", address: "B1" }, "=[Valor del terreno]/2");
  sections = write(sections, { concept: "c-valor" }, "=[Superficie total de terreno]*[Valor unitario]");
  sections = write(sections, { table: "t-valores", address: "B2" }, "=B1+1");
  sections = write(sections, { table: "t-lotes", address: "B3" }, "=SUMA(B1:B2)");
  const computed = applyValuationFormulas(sections);
  assert.equal(valueOf(computed, "c-superficie"), "#CIRCULAR");
  assert.equal(valueOf(computed, "c-valor"), "#CIRCULAR");
  assert.equal(cellOf(computed, "t-valores", "B1"), "#CIRCULAR");
  assert.equal(cellOf(computed, "t-valores", "B2"), "#CIRCULAR", "reads the cycle");
  assert.equal(cellOf(computed, "t-lotes", "B3"), "290.28", "outside the cycle");

  // A concept that reads itself.
  sections = write(valuation(), { concept: "c-valor" }, "=[Valor del terreno]+1");
  assert.equal(valueOf(applyValuationFormulas(sections), "c-valor"), "#CIRCULAR");

  // Breaking the cycle computes again.
  const fixed = applyValuationFormulas(write(computed, { concept: "c-superficie" }, "=[Superficies]!B3"));
  assert.equal(valueOf(fixed, "c-valor"), "2612520.00");
  assert.equal(cellOf(fixed, "t-valores", "B2"), "$1,306,261.00");
});

test("a long chain of formulas computes without exhausting the stack", () => {
  const rows = 1_500;
  let table = tableOf("t", "T", ["A"], Array.from({ length: rows }, () => ["1"]));
  table = {
    ...table,
    rows: table.rows.map((row, index) => (index === 0 ? row : {
      ...row,
      cells: { c1: { kind: "formula", formula: { expression: { type: "binary", operator: "ADD", left: { type: "operand", operand: { type: "cell", rowId: table.rows[index - 1].id, columnId: "c1" } }, right: { type: "constant", value: 1 } } } } },
    })),
  };
  assert.equal(shown(table, `A${rows}`), "1,500");
});

test("deleting what a formula reads leaves #REF! in the concept and in the cell that read it", () => {
  let sections = valuation();
  sections = write(sections, { concept: "c-valor" }, "=[Superficies]!B1*[Valor unitario]");
  sections = write(sections, { table: "t-valores", address: "B1" }, "=[Valor del terreno]+[Demérito]");
  assert.equal(valueOf(applyValuationFormulas(sections), "c-valor"), "1528020.00");

  const withoutTable = sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({ ...block, tables: block.tables.filter((table) => table.id !== "t-lotes") })) }));
  const computed = applyValuationFormulas(withoutTable);
  assert.equal(valueOf(computed, "c-valor"), "#REF!");
  assert.equal(cellOf(computed, "t-valores", "B1"), "#REF!");
  const index = buildFormulaIndex(computed);
  assert.equal(formulaToText(conceptsIn(computed).find((item) => item.id === "c-valor")!.formula!, { index }), "#REF!*[Valor unitario]");

  const withoutConcept = sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({ ...block, concepts: block.concepts.filter((item) => item.id !== "c-demerito") })) }));
  const second = applyValuationFormulas(withoutConcept);
  assert.equal(cellOf(second, "t-valores", "B1"), "#REF!");
  assert.equal(textOf(tablesIn(second)[1], "r1", "c2", buildFormulaIndex(second)), "[Valor del terreno]+#REF!");
});

test("renaming a table or a concept changes how the formula reads, not what it points at", () => {
  let sections = write(valuation(), { concept: "c-valor" }, "=[Superficies]!B1*[Valor unitario]");
  sections = sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map((item) => (item.id === "c-unitario" ? { ...item, label: "Valor por m²:" } : item)),
      tables: block.tables.map((table) => (table.id === "t-lotes" ? { ...table, title: "Lotes" } : table)),
    })),
  }));
  const computed = applyValuationFormulas(sections);
  assert.equal(valueOf(computed, "c-valor"), "1528020.00");
  assert.equal(formulaToText(conceptsIn(computed).find((item) => item.id === "c-valor")!.formula!, { index: buildFormulaIndex(computed) }), "[Lotes]!B1*[Valor por m²]");
});

test("a reference written before the first save still finds its concept once saving has turned the id into a key", () => {
  const before = sectionsOf({ concepts: [concept("Concepto Área 1", "Área", "10"), concept("total", "Total", "")] });
  const withFormula = write(before, { concept: "total" }, "=[Área]*2");
  // The save stores the concept under the key of its id.
  const reloaded = withFormula.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({ ...block, concepts: block.concepts.map((item) => (item.id === "total" ? item : { ...item, id: "concepto_area_1" })) })) }));
  const computed = applyValuationFormulas(reloaded);
  assert.equal(valueOf(computed, "total"), "20");
  assert.equal(formulaToText(conceptsIn(computed).find((item) => item.id === "total")!.formula!, { index: buildFormulaIndex(computed) }), "[Área]*2");
});

test("concepts that share a value share its formula", () => {
  const shared = { valueKey: "valor-terreno" };
  let sections = sectionsOf({
    concepts: [concept("a", "Superficie", "100"), concept("b", "Valor unitario", "50"), concept("v1", "Valor del terreno", "", { ...shared, type: "currency" }), concept("v2", "Valor (resumen)", "", shared)],
  });
  sections = write(sections, { concept: "v2" }, "=[Superficie]*[Valor unitario]");
  const computed = applyValuationFormulas(sections);
  assert.ok(conceptsIn(computed).find((item) => item.id === "v1")!.formula, "set on every concept of the value");
  assert.equal(valueOf(computed, "v1"), "5000.00", "each one stores the result as its own format reads it");
  assert.equal(valueOf(computed, "v2"), "5,000");

  // Removing the formula leaves the value typed, everywhere.
  const cleared = sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({ ...block, concepts: applyConceptFormulaEverywhere(block.concepts, "v1", undefined, "42") })) }));
  assert.deepEqual(conceptsIn(cleared).filter((item) => item.valueKey).map((item) => [item.formula, item.value]), [[undefined, "42"], [undefined, "42"]]);
});

test("a table written by a calculation can be read; a concept that does not hold a number is not computed", () => {
  const generated = tableOf("motor-mercado-tabla-homologacion", "Homologación", ["Ref", "Valor"], [["1", "$ 7,806.43"]]);
  const block: Block = { id: "motor-mercado", title: "Mercado", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [generated as unknown as TableContent], images: [] };
  const own: Block = { ...block, id: "bloque-propio", tables: [], concepts: [concept("c", "Valor de mercado", "", { type: "currency" }), concept("d", "Fecha", "2026-10-06", { type: "date" })] };
  let sections = sectionsOf({ blocks: [block, own] });
  const index = buildFormulaIndex(sections);
  assert.equal(index.tableById.get(generated.id)!.generated, true);
  assert.equal(index.conceptById.get("c")!.generated, false);
  sections = write(sections, { concept: "c" }, "=[Homologación]!B1*100");
  assert.equal(valueOf(applyValuationFormulas(sections), "c"), "780643.00");

  // A formula left on a date is ignored: the date stays.
  const compiled = compileFormula("=1+1", { index });
  assert.ok(compiled.ok);
  const withDateFormula = sections.map((section) => ({ ...section, blocks: section.blocks.map((item) => ({ ...item, concepts: item.concepts.map((entry) => (entry.id === "d" ? { ...entry, formula: compiled.formula } : entry)) })) }));
  assert.equal(valueOf(applyValuationFormulas(withDateFormula), "d"), "2026-10-06");
});

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

test("the computed results are not saved with the table", () => {
  const sections = applyValuationFormulas(write(valuation(), { table: "t-lotes", address: "B3" }, "=SUMA(B1:B2)"));
  const table = sections[0].blocks[0].tables[0];
  assert.ok((table as unknown as TableV2).formulaResults, "the editor holds them");
  const saved = serializeTableForSave(table);
  assert.equal("formulaResults" in saved, false);
  assert.equal(saved.rows[2].cells.c2.kind, "formula");
});

test("the formula of a concept travels in its configuration and is read back; what is not a formula is dropped", () => {
  const compiled = compileFormula("=[Superficie total de terreno]*[Valor unitario]", { index: buildFormulaIndex(valuation()) });
  assert.ok(compiled.ok);
  const payload = { ...conceptMetadataFromContent({ ...concept("c-valor", "Valor", "1", { type: "currency", formula: compiled.formula }), enabled: true }) };
  assert.deepEqual(payload.formula, compiled.formula);
  const stored = JSON.parse(JSON.stringify({ kind: "concept", payload }));
  assert.deepEqual(hydrateConceptMetadata(stored).formula, compiled.formula);
  assert.equal(hydrateConceptMetadata({ kind: "concept", payload: { type: "currency" } }).formula, undefined);

  for (const garbage of [null, 1, "=1+1", [], {}, { expression: null }, { expression: "1+1" }, { expression: { type: "eval", code: "1" } }, { expression: { type: "binary", operator: "ADD", left: { type: "constant", value: 1 } } }, { expression: { type: "constant", value: "1" } }]) {
    assert.equal(readStoredFormula(garbage), undefined, JSON.stringify(garbage));
    assert.equal(hydrateConceptMetadata({ kind: "concept", payload: { formula: garbage } }).formula, undefined);
  }
  let deep: unknown = { type: "constant", value: 1 };
  for (let depth = 0; depth < 500; depth += 1) deep = { type: "function", name: "ABS", args: [deep] };
  assert.equal(readStoredFormula({ expression: deep }), undefined, "deeper than the editor writes");
});

test("a stored formula that is malformed is an error in its cell, never an exception", () => {
  const table = tableOf("t", "T", ["A", "B"], [["1", ""]]);
  const broken = [
    { expression: { type: "operand", operand: { type: "nada" } } },
    { expression: { type: "function", name: "NOEXISTE", args: [] } },
    { expression: { type: "function", name: "constructor", args: [] } },
    { expression: { type: "binary", operator: "ELEVAR", left: { type: "constant", value: 1 }, right: { type: "constant", value: 1 } } },
    { expression: { type: "operand", operand: { type: "cell", rowId: "r1" } } },
    { expression: { type: "operand", operand: { type: "span", from: null, to: null } } },
    { expression: null },
    {},
  ] as unknown as TableFormula[];
  for (const formula of broken) {
    const withFormula = setCellFormula(table, "r1", "c2", formula);
    assert.match(shown(withFormula, "B1"), /^#/, JSON.stringify(formula));
    assert.equal(typeof formulaToText(formula, { index: NO_INDEX, table: withFormula }), "string");
    const sections = sectionsOf({ tables: [withFormula], concepts: [concept("c", "C", "", { formula })] });
    // Without an expression there is no formula: the concept keeps what it had.
    assert.match(valueOf(applyValuationFormulas(sections), "c"), formula.expression ? /^#/ : /^$/);
  }
});
