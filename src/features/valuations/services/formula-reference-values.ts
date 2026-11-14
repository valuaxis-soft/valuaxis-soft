/**
 * A formula that names cells and concepts of the valuation, written with the
 * numbers it reads instead: "=G1*F1" as "=1200*0.95". The calculation memory
 * prints both; the capture tables of the calculation panels (comparables,
 * homologation) keep only the second, since their formulas are evaluated by
 * the free formula of the capture, which knows arithmetic and functions but
 * not the document. Pure TypeScript.
 */
import { roundDecimal } from "../calculation/free-formula";
import { compileFormula, formulaToText, type FormulaIndex } from "./formula-references";
import { getDisplayColumns, type FormulaOperand, type TableFormula, type TableV2 } from "./table";
import { formulaCellKey, readSourceNumber, referenceKey } from "./table-formula-engine";
import { conceptSourceValue } from "./valuation-formulas";

/** Most decimals a substituted figure keeps: factors and rates need them. */
const SUBSTITUTED_DECIMALS = 6;
/** A range of more cells than this keeps its reference in the formula with values. */
export const MAX_SUBSTITUTED_CELLS = 12;

/** A number as it is typed in a formula: no separators, no exponent, a negative in parentheses. */
export function formulaNumber(value: number) {
  const fixed = roundDecimal(value, SUBSTITUTED_DECIMALS).toFixed(SUBSTITUTED_DECIMALS).replace(/\.?0+$/, "");
  const text = fixed === "-0" ? "0" : fixed;
  return value < 0 ? `(${text})` : text;
}

/** The number a cell holds for a formula: its result, or what was typed when it reads as one. */
export function cellNumber(table: TableV2, rowId: string, columnId: string): number | null {
  const cell = table.rows.find((row) => row.id === rowId)?.cells[columnId];
  if (!cell) return null;
  if (cell.kind === "formula") {
    const result = table.formulaResults?.[formulaCellKey(rowId, columnId)];
    return result?.ok ? result.value : null;
  }
  const read = readSourceNumber(cell.value);
  return read.kind === "number" ? read.value : null;
}

/** The cells between two corners as the table shows them, by rows. */
export function spanCells(table: TableV2, from: { rowId: string; columnId: string }, to: { rowId: string; columnId: string }) {
  const columns = getDisplayColumns(table);
  const rowIndex = (id: string) => table.rows.findIndex((row) => row.id === id);
  const columnIndex = (id: string) => columns.findIndex((column) => column.id === id);
  const [r1, r2, c1, c2] = [rowIndex(from.rowId), rowIndex(to.rowId), columnIndex(from.columnId), columnIndex(to.columnId)];
  if ([r1, r2, c1, c2].includes(-1)) return null;
  const cells: Array<{ rowId: string; columnId: string }> = [];
  for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row += 1) {
    for (let column = Math.min(c1, c2); column <= Math.max(c1, c2); column += 1) {
      cells.push({ rowId: table.rows[row].id, columnId: columns[column].id });
    }
  }
  return cells;
}

/** The values a reference reads, written as a formula takes them; null keeps the reference. */
export function referenceValues(index: FormulaIndex, operand: FormulaOperand, home: TableV2 | undefined): string | null {
  const tableOf = (tableId: string | undefined) => (tableId && tableId !== home?.id ? index.tableById.get(tableId)?.table : home);
  const list = (table: TableV2 | undefined, cells: Array<{ rowId: string; columnId: string }> | null) => {
    if (!table || !cells?.length || cells.length > MAX_SUBSTITUTED_CELLS) return null;
    const values = cells.map((cell) => cellNumber(table, cell.rowId, cell.columnId));
    if (values.some((value) => value === null)) return null;
    return values.map((value) => formulaNumber(value as number)).join("; ");
  };
  switch (operand.type) {
    case "cell":
      return list(tableOf(operand.tableId), [operand]);
    case "span": {
      const table = tableOf(operand.tableId);
      return list(table, table ? spanCells(table, operand.from, operand.to) : null);
    }
    case "range":
      return list(home, operand.cells);
    case "row":
      return list(home, home ? getDisplayColumns(home).map((column) => ({ rowId: operand.rowId, columnId: column.id })) : null);
    case "column":
      return list(home, home?.rows.map((row) => ({ rowId: row.id, columnId: operand.columnId })) ?? null);
    case "concept": {
      const concept = index.conceptById.get(referenceKey(String(operand.conceptId)))?.concept;
      const read = concept ? conceptSourceValue(concept) : null;
      return read?.kind === "number" ? formulaNumber(read.value) : null;
    }
    default:
      return null;
  }
}

/** "=G1*F1" written with the numbers it reads, "=1200*0.95". */
export function formulaWithValues(formula: TableFormula, index: FormulaIndex, table: TableV2 | undefined): string {
  return `=${formulaToText(formula, { index, table, referenceValue: (operand, home) => referenceValues(index, operand, home) })}`;
}

/**
 * A formula typed in a capture cell, with the cells and concepts it names
 * replaced by their numbers, so the capture (which knows no document) can
 * evaluate and keep it. A formula that names nothing comes back as typed;
 * one that cannot be read, or that names a cell without a number, answers
 * with the reason.
 */
export function substituteFormulaReferences(text: string, index: FormulaIndex): { ok: true; text: string } | { ok: false; message: string } {
  const compiled = compileFormula(text, { index });
  if (!compiled.ok) return compiled;
  let missing = false;
  const written = formulaToText(compiled.formula, {
    index,
    referenceValue: (operand, home) => {
      const value = referenceValues(index, operand, home);
      if (value === null) missing = true;
      return value;
    },
  });
  if (missing) return { ok: false, message: "Alguna de las celdas o conceptos que nombra la fórmula no tiene un número." };
  return { ok: true, text: `=${written}` };
}

/**
 * What a capture field (a cell of a capture table, a numeric field of a
 * calculation panel) keeps of a formula typed in it: the formula with the
 * numbers its references read ("=[Superficie total de terreno]*2" kept as
 * "=1250*2"). Arithmetic the document's formulas do not read may still be
 * the capture's own (=(1345*235)^(1/6)): it is kept as typed. A formula that
 * names something without a number answers with the reason.
 */
export function capturedFormulaText(text: string, index: FormulaIndex): { ok: true; text: string } | { ok: false; message: string } {
  const substituted = substituteFormulaReferences(text, index);
  if (substituted.ok) return substituted;
  if (!/[A-Za-z]/.test(text.replace(/[A-Za-z]+\(/g, ""))) return { ok: true, text };
  return substituted;
}
