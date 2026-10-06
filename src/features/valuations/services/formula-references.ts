/**
 * Formulas as the appraiser writes and reads them, and as they are stored.
 *
 * Written: cells by their position in the table as shown (B2, A1:A5), a cell
 * of another table by the table's name ([Tabla de homologación]!C3) and a
 * concept by its title ([Superficie total de terreno]).
 *
 * Stored: every reference by the stable id of what it points at (table, row,
 * column, concept), so moving, inserting, renaming or deleting around it
 * leaves the formula pointing at the same value. `compileFormula` goes from
 * the text to the stored formula and `formulaToText` back.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { FORMULA_FUNCTION_NAMES, parseFormula, type CellPosition, type FormulaFunctionName, type FormulaSyntax } from "../calculation/free-formula";
import { isGeneratedBlock } from "../calculation/market-document";
import type { AppSection, Concept } from "../model";
import { normalizeConceptTitle } from "./concept-title";
import {
  ensureTableV2,
  getDisplayColumns,
  type FormulaBinaryOp,
  type FormulaExpression,
  type FormulaOperand,
  type TableFormula,
  type TableV2,
} from "./table";
import { referenceKey } from "./table-formula-engine";

/* ================================================================== */
/*  INDEX — the named values of a valuation                            */
/* ================================================================== */

type FormulaEntryPlace = {
  sectionId: string;
  sectionTitle: string;
  blockTitle: string;
  /** Written by a calculation of the engine: a source of references, never a place for formulas. */
  generated: boolean;
};

export type FormulaTableEntry = FormulaEntryPlace & {
  id: string;
  /** How formulas name the table: its title, numbered when another table has the same one. */
  name: string;
  table: TableV2;
};

export type FormulaConceptEntry = FormulaEntryPlace & {
  id: string;
  /** How formulas name the concept: its title, numbered when another concept has the same one. */
  name: string;
  concept: Concept;
};

export type FormulaIndex = {
  tables: FormulaTableEntry[];
  concepts: FormulaConceptEntry[];
  tableById: Map<string, FormulaTableEntry>;
  conceptById: Map<string, FormulaConceptEntry>;
  tableByName: Map<string, FormulaTableEntry>;
  conceptByName: Map<string, FormulaConceptEntry>;
};

/** Names compare without case, accents or repeated spaces. */
function nameKey(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A name that can be written between brackets. */
function writableName(name: string, fallback: string) {
  return name.replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim() || fallback;
}

function uniqueName(base: string, taken: Set<string>) {
  let name = base;
  for (let count = 2; taken.has(nameKey(name)); count += 1) name = `${base} (${count})`;
  taken.add(nameKey(name));
  return name;
}

const tablesV2 = new WeakMap<object, TableV2>();

/** The table in its canonical shape; the same object for the same table, so results can be compared by identity. */
export function canonicalTable(table: unknown): TableV2 {
  if (typeof table !== "object" || table === null) return ensureTableV2(table);
  let canonical = tablesV2.get(table);
  if (!canonical) {
    canonical = ensureTableV2(table);
    tablesV2.set(table, canonical);
  }
  return canonical;
}

/** Every table and concept of the valuation, in document order, with the name formulas use for each. */
export function buildFormulaIndex(sections: AppSection[]): FormulaIndex {
  const index: FormulaIndex = {
    tables: [],
    concepts: [],
    tableById: new Map(),
    conceptById: new Map(),
    tableByName: new Map(),
    conceptByName: new Map(),
  };
  const tableNames = new Set<string>();
  const conceptNames = new Set<string>();

  for (const section of sections) {
    for (const block of section.blocks) {
      const place: FormulaEntryPlace = {
        sectionId: section.id,
        sectionTitle: section.title || section.label,
        blockTitle: block.title,
        generated: isGeneratedBlock(block),
      };
      const containers = [{ title: block.title, content: block }, ...block.apartados.map((apartado) => ({ title: apartado.title || block.title, content: apartado }))];
      for (const { title, content } of containers) {
        for (const concept of content.concepts) {
          if (index.conceptById.has(referenceKey(concept.id))) continue;
          const entry: FormulaConceptEntry = {
            ...place,
            blockTitle: title,
            id: concept.id,
            name: uniqueName(writableName(normalizeConceptTitle(concept.label), "Concepto sin título"), conceptNames),
            concept,
          };
          index.concepts.push(entry);
          index.conceptById.set(referenceKey(concept.id), entry);
          index.conceptByName.set(nameKey(entry.name), entry);
        }
        for (const table of content.tables) {
          if (index.tableById.has(table.id)) continue;
          const entry: FormulaTableEntry = {
            ...place,
            blockTitle: title,
            id: table.id,
            name: uniqueName(writableName(table.title, "Tabla"), tableNames),
            table: canonicalTable(table),
          };
          index.tables.push(entry);
          index.tableById.set(table.id, entry);
          index.tableByName.set(nameKey(entry.name), entry);
        }
      }
    }
  }
  return index;
}

export const EMPTY_FORMULA_INDEX: FormulaIndex = buildFormulaIndex([]);

/* ================================================================== */
/*  POSITIONS — A1 ⇄ ids                                               */
/* ================================================================== */

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let letters = "";
  for (let rest = index; rest >= 0; rest = Math.floor(rest / 26) - 1) {
    letters = String.fromCharCode(65 + (rest % 26)) + letters;
  }
  return letters;
}

const positionText = (position: CellPosition) => `${columnLetter(position.column)}${position.row + 1}`;

/** "B2" for a cell of the table as it is shown now; null when its row or column is gone. */
export function cellAddress(table: TableV2, rowId: string, columnId: string): string | null {
  const row = table.rows.findIndex((item) => item.id === rowId);
  const column = getDisplayColumns(table).findIndex((item) => item.id === columnId);
  return row === -1 || column === -1 ? null : positionText({ column, row });
}

function cellAt(table: TableV2, position: CellPosition): { rowId: string; columnId: string } | null {
  const row = table.rows[position.row];
  const column = getDisplayColumns(table)[position.column];
  return row && column ? { rowId: row.id, columnId: column.id } : null;
}

/* ================================================================== */
/*  TEXT → STORED FORMULA                                              */
/* ================================================================== */

export type FormulaScope = {
  index: FormulaIndex;
  /** The table of the cell that holds the formula; none for the formula of a concept. */
  table?: TableV2;
};

export type CompiledFormula = { ok: true; formula: TableFormula } | { ok: false; message: string };

class FormulaReferenceError extends Error {}

const BINARY_OPERATORS: Record<"+" | "-" | "*" | "/" | "^", FormulaBinaryOp> = {
  "+": "ADD",
  "-": "SUBTRACT",
  "*": "MULTIPLY",
  "/": "DIVIDE",
  "^": "POWER",
};

function resolveSyntax(node: FormulaSyntax, scope: FormulaScope): FormulaExpression {
  /** The table a reference reads, and how the stored reference names it. */
  const tableFor = (name: string | undefined): { table: TableV2; tableId?: string } => {
    if (name === undefined) {
      if (!scope.table) throw new FormulaReferenceError("Indica de qué tabla es la celda, por ejemplo [Nombre de la tabla]!B2.");
      return { table: scope.table };
    }
    const entry = scope.index.tableByName.get(nameKey(name));
    if (!entry) throw new FormulaReferenceError(`No hay una tabla llamada «${name}».`);
    return entry.id === scope.table?.id ? { table: scope.table } : { table: entry.table, tableId: entry.id };
  };
  const cellOf = (table: TableV2, position: CellPosition) => {
    const cell = cellAt(table, position);
    if (!cell) {
      const size = `${table.rows.length} ${table.rows.length === 1 ? "fila" : "filas"} y ${getDisplayColumns(table).length} columnas`;
      throw new FormulaReferenceError(`La celda ${positionText(position)} no existe: la tabla tiene ${size}.`);
    }
    return cell;
  };

  switch (node.type) {
    case "number":
      return { type: "constant", value: node.value };
    case "unary":
      return { type: "function", name: node.operator === "-" ? "NEG" : "PERCENT", args: [resolveSyntax(node.operand, scope)] };
    case "binary":
      return { type: "binary", operator: BINARY_OPERATORS[node.operator], left: resolveSyntax(node.left, scope), right: resolveSyntax(node.right, scope) };
    case "call":
      return { type: "function", name: node.name, args: node.args.map((arg) => resolveSyntax(arg, scope)) };
    case "cell": {
      const { table, tableId } = tableFor(node.table);
      return { type: "operand", operand: { type: "cell", ...(tableId ? { tableId } : {}), ...cellOf(table, node.position) } };
    }
    case "range": {
      const { table, tableId } = tableFor(node.table);
      return { type: "operand", operand: { type: "span", ...(tableId ? { tableId } : {}), from: cellOf(table, node.from), to: cellOf(table, node.to) } };
    }
    case "name": {
      const entry = scope.index.conceptByName.get(nameKey(node.name));
      if (entry) return { type: "operand", operand: { type: "concept", conceptId: entry.id } };
      if (scope.index.tableByName.has(nameKey(node.name))) {
        throw new FormulaReferenceError(`«${node.name}» es una tabla: indica la celda, por ejemplo [${node.name}]!B2.`);
      }
      throw new FormulaReferenceError(`No hay un concepto llamado «${node.name}».`);
    }
  }
}

/** Whether a written value asks to be computed. */
export const isFormulaText = (text: string) => text.trimStart().startsWith("=");

/**
 * The stored formula for what the appraiser wrote, with or without its "=".
 * When it cannot be one, `message` says why in the appraiser's words.
 */
export function compileFormula(text: string, scope: FormulaScope): CompiledFormula {
  const source = text.trim().replace(/^=/, "");
  if (!source.trim()) return { ok: false, message: "Escribe la operación después del signo =." };
  const syntax = parseFormula(source);
  if (!syntax) {
    return { ok: false, message: "La fórmula está incompleta o mal escrita. Ejemplos: =B2*C2, =SUMA(A1:A5), =RAIZ(B2; 3)." };
  }
  try {
    return { ok: true, formula: { expression: resolveSyntax(syntax, scope) } };
  } catch (error) {
    if (error instanceof FormulaReferenceError) return { ok: false, message: error.message };
    throw error;
  }
}

/* ================================================================== */
/*  STORED FORMULA → TEXT                                              */
/* ================================================================== */

/** Shown where a formula points at something that is no longer there. */
export const MISSING_REFERENCE_TEXT = "#REF!";

const PRECEDENCE: Partial<Record<FormulaBinaryOp, number>> = { ADD: 1, SUBTRACT: 1, MULTIPLY: 2, DIVIDE: 2, POWER: 3 };
const OPERATOR_TEXT: Partial<Record<FormulaBinaryOp, string>> = { ADD: "+", SUBTRACT: "-", MULTIPLY: "*", DIVIDE: "/", POWER: "^" };
const SIGN_PRECEDENCE = 4;
const PRIMARY_PRECEDENCE = 5;

type Written = { text: string; precedence: number };

/** A number as it is typed: no exponent, and enough decimals to read the same value back. */
function numberText(value: number) {
  if (!Number.isFinite(value)) return MISSING_REFERENCE_TEXT;
  const text = String(Math.abs(value));
  return /e/i.test(text) ? Math.abs(value).toFixed(12).replace(/\.?0+$/, "") : text;
}

function operandText(operand: FormulaOperand, scope: FormulaScope): string {
  /** The table a reference reads and what is written before its cells. */
  const place = (tableId: string | undefined): { table: TableV2; prefix: string } | null => {
    if (!tableId || tableId === scope.table?.id) return scope.table ? { table: scope.table, prefix: "" } : null;
    const entry = scope.index.tableById.get(tableId);
    return entry ? { table: entry.table, prefix: `[${entry.name}]!` } : null;
  };
  const cells = (tableId: string | undefined, ...corners: Array<{ rowId: string; columnId: string }>) => {
    const found = place(tableId);
    if (!found) return MISSING_REFERENCE_TEXT;
    const addresses = corners.map((corner) => cellAddress(found.table, corner.rowId, corner.columnId));
    return addresses.some((address) => address === null) ? MISSING_REFERENCE_TEXT : `${found.prefix}${addresses.join(":")}`;
  };

  switch (operand.type) {
    case "constant":
      return numberText(operand.value);
    case "cell":
      return cells(operand.tableId, operand);
    case "span":
      return cells(operand.tableId, operand.from, operand.to);
    case "concept": {
      const entry = scope.index.conceptById.get(referenceKey(String(operand.conceptId)));
      return entry ? `[${entry.name}]` : MISSING_REFERENCE_TEXT;
    }
    case "row": {
      const columns = scope.table ? getDisplayColumns(scope.table) : [];
      if (!columns.length) return MISSING_REFERENCE_TEXT;
      return cells(undefined, { rowId: operand.rowId, columnId: columns[0].id }, { rowId: operand.rowId, columnId: columns[columns.length - 1].id });
    }
    case "column": {
      const rows = scope.table?.rows ?? [];
      if (!rows.length) return MISSING_REFERENCE_TEXT;
      return cells(undefined, { rowId: rows[0].id, columnId: operand.columnId }, { rowId: rows[rows.length - 1].id, columnId: operand.columnId });
    }
    case "range":
      return operand.cells.map((cell) => cells(undefined, cell)).join("; ");
    default:
      return MISSING_REFERENCE_TEXT;
  }
}

function functionName(name: string) {
  const upper = name.toUpperCase();
  return Object.hasOwn(FORMULA_FUNCTION_NAMES, upper) ? FORMULA_FUNCTION_NAMES[upper as FormulaFunctionName][0] : upper;
}

function write(expression: FormulaExpression, scope: FormulaScope, depth: number): Written {
  if (depth > 200 || !expression || typeof expression !== "object") return { text: MISSING_REFERENCE_TEXT, precedence: PRIMARY_PRECEDENCE };
  const grouped = (child: FormulaExpression, minimum: number) => {
    const written = write(child, scope, depth + 1);
    return written.precedence < minimum ? `(${written.text})` : written.text;
  };

  switch (expression.type) {
    case "constant":
      return expression.value < 0
        ? { text: `-${numberText(expression.value)}`, precedence: SIGN_PRECEDENCE }
        : { text: numberText(expression.value), precedence: PRIMARY_PRECEDENCE };
    case "operand": {
      const operand = expression.operand;
      if (operand?.type === "constant" && operand.value < 0) return { text: `-${numberText(operand.value)}`, precedence: SIGN_PRECEDENCE };
      // A list of loose cells where one value is expected is their sum.
      if (operand?.type === "range") return { text: `${functionName("SUM")}(${operandText(operand, scope)})`, precedence: PRIMARY_PRECEDENCE };
      return { text: operand ? operandText(operand, scope) : MISSING_REFERENCE_TEXT, precedence: PRIMARY_PRECEDENCE };
    }
    case "binary": {
      const precedence = PRECEDENCE[expression.operator];
      const operator = OPERATOR_TEXT[expression.operator];
      if (!precedence || !operator) {
        return { text: `RESIDUO(${grouped(expression.left, 0)}; ${grouped(expression.right, 0)})`, precedence: PRIMARY_PRECEDENCE };
      }
      // Operators of the same level are read from the left, so the right side keeps its parentheses.
      return { text: `${grouped(expression.left, precedence)}${operator}${grouped(expression.right, precedence + 1)}`, precedence };
    }
    case "function": {
      const args = Array.isArray(expression.args) ? expression.args : [];
      const name = String(expression.name ?? "").toUpperCase();
      if (name === "NEG" && args.length === 1) return { text: `-${grouped(args[0], SIGN_PRECEDENCE)}`, precedence: SIGN_PRECEDENCE };
      if (name === "PERCENT" && args.length === 1) return { text: `${grouped(args[0], PRIMARY_PRECEDENCE)}%`, precedence: PRIMARY_PRECEDENCE };
      const written = args.map((arg) =>
        arg?.type === "operand" && arg.operand?.type === "range" ? operandText(arg.operand, scope) : write(arg, scope, depth + 1).text);
      return { text: `${functionName(name)}(${written.join("; ")})`, precedence: PRIMARY_PRECEDENCE };
    }
    default:
      return { text: MISSING_REFERENCE_TEXT, precedence: PRIMARY_PRECEDENCE };
  }
}

/**
 * The formula as the appraiser reads and corrects it, without its "=":
 * positions and names of what its references point at today. A reference to
 * something deleted reads #REF!.
 */
export function formulaToText(formula: TableFormula, scope: FormulaScope): string {
  try {
    return write(formula?.expression, scope, 0).text;
  } catch {
    // A stored formula that does not have the shape of one points at nothing.
    return MISSING_REFERENCE_TEXT;
  }
}

/* ================================================================== */
/*  REFERENCES AS INSERTED BY A CLICK                                  */
/* ================================================================== */

/** What clicking a cell writes into the formula being edited in `homeTableId` (none: a concept). */
export function cellReferenceText(index: FormulaIndex, tableId: string, table: TableV2, rowId: string, columnId: string, homeTableId: string | undefined): string | null {
  const address = cellAddress(table, rowId, columnId);
  if (!address) return null;
  if (tableId === homeTableId) return address;
  const entry = index.tableById.get(tableId);
  return entry ? `[${entry.name}]!${address}` : null;
}

/** What clicking a concept writes into the formula being edited. */
export function conceptReferenceText(index: FormulaIndex, conceptId: string): string | null {
  const entry = index.conceptById.get(referenceKey(conceptId));
  return entry ? `[${entry.name}]` : null;
}
