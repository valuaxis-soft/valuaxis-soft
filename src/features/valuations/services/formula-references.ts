/**
 * Formulas as the appraiser writes and reads them, and as they are stored.
 *
 * Written: cells by their position in the table as shown (B2, A1:A5, with
 * the "$" of Excel to fix a row or a column: $B$2, B$2, $B2), a cell
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
import { FORMULA_FUNCTION_NAMES, formulaReferenceSpans, parseFormula, type CellPosition, type FormulaFunctionName, type FormulaSyntax } from "../calculation/free-formula";
import { isGeneratedBlock } from "../calculation/market-document";
import type { Apartado, AppSection, Block, Concept, TableContent } from "../model";
import { resolveBlockFlowV2 } from "./block-flow";
import { resolveContentLayout } from "./content-layout";
import { normalizeConceptTitle } from "./concept-title";
import {
  ensureTableV2,
  getDisplayColumns,
  type FormulaBinaryOp,
  type FormulaCellCorner,
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
  /** The block that holds it: a generated block's id says which calculation wrote it. */
  blockId: string;
  /** The title of the subbloque that holds it, or of its block. */
  blockTitle: string;
  /** The block that holds it, by its title, and its subbloque when it is in one: where «Buscar valor» shows it. */
  place: { block: string; apartado?: string };
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

type IndexedContainer = { title: string; place: FormulaEntryPlace["place"]; concepts: Concept[]; tables: TableContent[] };

/** The concepts of each row of a block or a subbloque, as the editor shows them: left to right in a row. */
function conceptRows(container: Block | Apartado): Array<{ rowId: string; concepts: Concept[] }> {
  const byId = new Map(container.concepts.map((concept) => [concept.id, concept]));
  return resolveContentLayout(container).rows.map((row) => ({
    rowId: row.id,
    concepts: row.columns.flatMap((column) => column.items.flatMap((item) => {
      const concept = item.type === "concept" ? byId.get(item.id) : undefined;
      return concept ? [concept] : [];
    })),
  }));
}

/** The concepts of a block or a subbloque row by row; any the layout does not place, after them. */
function conceptsInLayoutOrder(container: Block | Apartado): Concept[] {
  const ordered = conceptRows(container).flatMap((row) => row.concepts);
  const placed = new Set(ordered.map((concept) => concept.id));
  return [...ordered, ...container.concepts.filter((concept) => !placed.has(concept.id))];
}

/**
 * A block and its subbloques in the order the editor shows them (video 7.3,
 * 5:38: «Buscar valor» listed a concept added again at the end, not where
 * it is): the block's rows and its subbloques as its flow lays them out.
 */
function containersInLayoutOrder(block: Block): IndexedContainer[] {
  const own = (concepts: Concept[], tables: TableContent[]): IndexedContainer => ({ title: block.title, place: { block: block.title }, concepts, tables });
  const ofApartado = (apartado: Apartado): IndexedContainer => ({
    title: apartado.title || block.title,
    place: { block: block.title, ...(apartado.title.trim() ? { apartado: apartado.title } : {}) },
    concepts: conceptsInLayoutOrder(apartado),
    tables: apartado.tables,
  });
  const rows = new Map(conceptRows(block).map((row) => [row.rowId, row.concepts]));
  const apartados = new Map(block.apartados.map((apartado) => [apartado.id, apartado]));
  const placed = new Set<string>();
  const containers: IndexedContainer[] = [own([], block.tables)];
  for (const structural of resolveBlockFlowV2(block)?.rows ?? []) {
    for (const item of structural.items) {
      if (item.type === "content-row") {
        const concepts = rows.get(item.rowId) ?? [];
        concepts.forEach((concept) => placed.add(concept.id));
        if (concepts.length) containers.push(own(concepts, []));
        continue;
      }
      const apartado = apartados.get(item.apartadoId);
      if (!apartado) continue;
      containers.push(ofApartado(apartado));
      apartados.delete(item.apartadoId);
    }
  }
  containers.push(own(block.concepts.filter((concept) => !placed.has(concept.id)), []));
  for (const apartado of apartados.values()) containers.push(ofApartado(apartado));
  return containers;
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
      const generated = isGeneratedBlock(block);
      for (const container of containersInLayoutOrder(block)) {
        const { title } = container;
        const place: FormulaEntryPlace = {
          sectionId: section.id,
          sectionTitle: section.title || section.label,
          blockId: block.id,
          blockTitle: title,
          place: container.place,
          generated,
        };
        const content = container;
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

/** "$B$2", "B$2" or "B2": the address of a cell a formula reads, with the "$" it was written with. */
function anchoredAddress(table: TableV2, corner: FormulaCellCorner): string | null {
  const row = table.rows.findIndex((item) => item.id === corner.rowId);
  const column = getDisplayColumns(table).findIndex((item) => item.id === corner.columnId);
  if (row === -1 || column === -1) return null;
  return `${corner.fixedColumn ? "$" : ""}${columnLetter(column)}${corner.fixedRow ? "$" : ""}${row + 1}`;
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
  /**
   * Writes a reference as the value it reads instead of its position or name
   * (the calculation memory's "=1200*0.95"); null keeps the reference.
   */
  referenceValue?: (operand: FormulaOperand, table: TableV2 | undefined) => string | null;
};

export type CompiledFormula = { ok: true; formula: TableFormula } | { ok: false; message: string };

class FormulaReferenceError extends Error {}

/** The parentheses the appraiser wrote, stored as a function of one argument that gives it back. */
export const GROUP_FUNCTION = "PAREN";

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
  const cellOf = (table: TableV2, position: CellPosition): FormulaCellCorner => {
    const cell = cellAt(table, position);
    if (!cell) {
      const size = `${table.rows.length} ${table.rows.length === 1 ? "fila" : "filas"} y ${getDisplayColumns(table).length} columnas`;
      throw new FormulaReferenceError(`La celda ${positionText(position)} no existe: la tabla tiene ${size}.`);
    }
    // The "$" of the reference stays with it, for the copies of the formula.
    return { ...cell, ...(position.fixedColumn ? { fixedColumn: true } : {}), ...(position.fixedRow ? { fixedRow: true } : {}) };
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
    case "group":
      // Kept as written, so the formula reads back with the appraiser's own parentheses.
      return { type: "function", name: GROUP_FUNCTION, args: [resolveSyntax(node.inner, scope)] };
    case "columns": {
      const { table, tableId } = tableFor(node.table);
      const columns = getDisplayColumns(table);
      const [first, last] = [Math.min(node.from, node.to), Math.max(node.from, node.to)];
      if (!columns[first] || !columns[last]) {
        throw new FormulaReferenceError(`La columna ${columnLetter(columns[first] ? last : first)} no existe: la tabla tiene ${columns.length} columnas.`);
      }
      // One column of the formula's own table follows its rows, also the ones added later.
      if (!tableId && first === last) return { type: "operand", operand: { type: "column", columnId: columns[first].id } };
      if (!table.rows.length) throw new FormulaReferenceError("La tabla no tiene filas todavía.");
      const rows = table.rows;
      return {
        type: "operand",
        operand: {
          type: "span", ...(tableId ? { tableId } : {}),
          from: { rowId: rows[0].id, columnId: columns[first].id }, to: { rowId: rows[rows.length - 1].id, columnId: columns[last].id },
        },
      };
    }
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

/** What follows the "=" of a formula: without the spaces around it nor the extra "=" of "==B2". */
export const formulaSource = (text: string) => text.trim().replace(/^(=\s*)+/, "").trim();

const FUNCTION_LIST = "SUMA, PROMEDIO, PRODUCTO, MIN, MAX, ABS, RAIZ, POTENCIA, REDONDEAR, LN y LOG";

/** Why a formula cannot be read, as precisely as the text tells. */
function formulaSyntaxProblem(source: string): string {
  let depth = 0;
  for (const character of source.replace(/\[[^\]]*\]|'[^']*'/g, "")) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return "Sobra un paréntesis de cierre «)»: cada «(» lleva el suyo.";
  }
  if (depth > 0) return `Falta ${depth === 1 ? "un paréntesis de cierre «)»" : `cerrar ${depth} paréntesis «)»`}.`;
  if (/\[[^\]]*$/.test(source)) return "Falta el corchete de cierre «]» del nombre.";
  const unknown = [...source.matchAll(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]{2,})\s*\(/g)]
    .map((match) => match[1])
    .find((name) => !Object.values(FORMULA_FUNCTION_NAMES).flat().includes(name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()));
  if (unknown) return `La función «${unknown}» no existe. Puedes usar ${FUNCTION_LIST}.`;
  if (/[+\-*/^]\s*$/.test(source)) return "Falta un valor después del último operador.";
  if (/[+*/^]{2,}|[+\-*/^]\s*[*/^]/.test(source)) return "Hay dos operadores seguidos: escribe un valor entre ellos.";
  if (/=/.test(source)) return "El signo = va solo al principio de la fórmula.";
  return `La fórmula está incompleta o mal escrita. Ejemplos: =B2*C2, =(B2+C2)/2, =SUMA(A1:A5), =MIN(B:B), =RAIZ(B2; 3). Funciones: ${FUNCTION_LIST}.`;
}

/** A reference a click wrote into a formula: where it is and what it says. */
export type InsertedReference = { start: number; end: number; text: string };

/** A cell, a range or a column of a table as written: B2, $B$2, A1:A5, B:B. */
const CELL_TEXT = /\$?[A-Za-z]{1,3}\$?\d{1,5}(?::\$?[A-Za-z]{1,3}\$?\d{1,5})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}/y;

/**
 * Where each reference of a formula is written, as the appraiser typed it:
 * a concept or a table between brackets ([Superficie], [Tabla]!B2), a sheet
 * between quotes, and the cells and ranges. Used to never write a reference
 * inside another one.
 */
export function referenceSpansOf(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === "[" || character === "'") {
      const close = text.indexOf(character === "[" ? "]" : "'", index + 1);
      // A name still being written runs to the end.
      let end = close === -1 ? text.length : close + 1;
      if (text[end] === "!") {
        CELL_TEXT.lastIndex = end + 1;
        const cell = CELL_TEXT.exec(text);
        end = cell ? CELL_TEXT.lastIndex : end + 1;
      }
      spans.push({ start: index, end });
      index = end;
      continue;
    }
    // A cell starts a word: «LN(B2)» is a function and then a cell, «B2» a cell.
    if (/[A-Za-z$]/.test(character) && !/[\wÁÉÍÓÚÜÑáéíóúüñ$.]/.test(text[index - 1] ?? "")) {
      CELL_TEXT.lastIndex = index;
      const cell = CELL_TEXT.exec(text);
      if (cell && !/[\w(]/.test(text[CELL_TEXT.lastIndex] ?? "")) {
        spans.push({ start: index, end: CELL_TEXT.lastIndex });
        index = CELL_TEXT.lastIndex;
        continue;
      }
      const word = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]+/y;
      word.lastIndex = index;
      index = word.exec(text) ? word.lastIndex : index + 1;
      continue;
    }
    index += 1;
  }
  return spans;
}

/**
 * The formula with a clicked reference written at the caret, never inside
 * another reference (video 7.3, 3:15: a click with the caret inside
 * «[Superficie total de Terreno]» wrote «[Superfici[Frente…]e total…]»): a
 * caret inside a reference goes to its end, and a selection that takes part
 * of one takes all of it. A click right after a reference, with no operator
 * written between them, replaces it, as a spreadsheet does: =B2, then a
 * click on C3, reads =C3, not =B2C3; the same when the formula was opened
 * already written (=[Superficie], a click on Frente: =[Frente]).
 */
export function withReference(text: string, selection: { start: number; end: number }, reference: string, last: InsertedReference | null) {
  let { start, end } = selection;
  const spans = referenceSpansOf(text);
  for (const span of spans) {
    if (start > span.start && start < span.end) start = start === end ? span.end : span.start;
    if (end > span.start && end < span.end) end = span.end;
  }
  if (end < start) end = start;
  if (start === end) {
    if (last && start === last.end && text.slice(last.start, last.end) === last.text) {
      start = last.start;
    } else {
      // The reference right before the caret, with only spaces between: it is replaced.
      const before = spans.find((span) => span.end <= start && text.slice(span.end, start).trim() === "");
      const closest = spans.filter((span) => span.end <= start).at(-1);
      if (before && closest === before) start = before.start;
    }
  }
  return {
    text: text.slice(0, start) + reference + text.slice(end),
    reference: { start, end: start + reference.length, text: reference } satisfies InsertedReference,
  };
}

/** What is wrong with the writing of a formula, while it is typed; null when it reads (its references are checked on applying it). */
export function formulaTextProblem(text: string): string | null {
  const source = formulaSource(text);
  if (!source) return null;
  return parseFormula(source) ? null : formulaSyntaxProblem(source);
}

/** Whether a written value asks to be computed. */
export const isFormulaText = (text: string) => text.trimStart().startsWith("=");

/** The concept a formula only reads (=[Superficie total de terreno]), which can be linked instead; null for anything else. */
export function referencedConceptOnly(formula: TableFormula | undefined): string | null {
  const expression = formula?.expression;
  return expression?.type === "operand" && expression.operand.type === "concept" ? String(expression.operand.conceptId) : null;
}

/**
 * The stored formula for what the appraiser wrote, with or without its "=".
 * When it cannot be one, `message` says why in the appraiser's words.
 */
export function compileFormula(text: string, scope: FormulaScope): CompiledFormula {
  // Spaces anywhere and an "==" typed by habit are not mistakes.
  const source = formulaSource(text);
  if (!source.trim()) return { ok: false, message: "Escribe la operación después del signo =." };
  const syntax = parseFormula(source);
  if (!syntax) return { ok: false, message: formulaSyntaxProblem(source) };
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
  const value = operand.type === "constant" ? null : scope.referenceValue?.(operand, scope.table) ?? null;
  if (value !== null) return value;
  /** The table a reference reads and what is written before its cells. */
  const place = (tableId: string | undefined): { table: TableV2; prefix: string } | null => {
    if (!tableId || tableId === scope.table?.id) return scope.table ? { table: scope.table, prefix: "" } : null;
    const entry = scope.index.tableById.get(tableId);
    return entry ? { table: entry.table, prefix: `[${entry.name}]!` } : null;
  };
  const cells = (tableId: string | undefined, ...corners: FormulaCellCorner[]) => {
    const found = place(tableId);
    if (!found) return MISSING_REFERENCE_TEXT;
    const addresses = corners.map((corner) => anchoredAddress(found.table, corner));
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
      const column = scope.table ? getDisplayColumns(scope.table).findIndex((item) => item.id === operand.columnId) : -1;
      return column === -1 ? MISSING_REFERENCE_TEXT : `${columnLetter(column)}:${columnLetter(column)}`;
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
      if (name === GROUP_FUNCTION && args.length === 1) return { text: `(${write(args[0], scope, depth + 1).text})`, precedence: PRIMARY_PRECEDENCE };
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

/* ================================================================== */
/*  REFERENCES COLORED WHILE A FORMULA IS WRITTEN                      */
/* ================================================================== */

/** How many colors the references of a formula take turns with, as a spreadsheet does. */
export const FORMULA_REFERENCE_COLOR_COUNT = 8;

export type FormulaReferenceHighlight = {
  start: number;
  end: number;
  /** 0 to FORMULA_REFERENCE_COLOR_COUNT − 1; a reference written twice takes the same color. */
  color: number;
  /** The table it reads; null when there is no such table. */
  tableId: string | null;
  /** "rowId:columnId" of every cell it covers that exists. */
  cells: string[];
};

/**
 * Each cell or range named in a formula being written, with its color and
 * the cells it covers: the editor paints the text and the cells alike.
 * `homeTableId` is the table of the cell being edited; a concept has none.
 */
export function formulaReferenceHighlights(text: string, index: FormulaIndex, homeTableId: string | undefined): FormulaReferenceHighlight[] {
  const colors = new Map<string, number>();
  return formulaReferenceSpans(text).map((span) => {
    const cells = text.slice(span.start, span.end).replace(/[\s$]/g, "").toUpperCase().split("!").at(-1) ?? "";
    const key = span.table === undefined ? cells : `${nameKey(span.table)}!${cells}`;
    if (!colors.has(key)) colors.set(key, colors.size % FORMULA_REFERENCE_COLOR_COUNT);
    const entry = span.table === undefined
      ? (homeTableId ? index.tableById.get(homeTableId) : undefined)
      : index.tableByName.get(nameKey(span.table));
    const covered: string[] = [];
    if (entry) {
      const columns = getDisplayColumns(entry.table);
      const [top, bottom] = [Math.min(span.from.row, span.to.row), Math.max(span.from.row, span.to.row)];
      const [left, right] = [Math.min(span.from.column, span.to.column), Math.max(span.from.column, span.to.column)];
      for (const row of entry.table.rows.slice(top, bottom + 1)) {
        for (const column of columns.slice(left, right + 1)) covered.push(`${row.id}:${column.id}`);
      }
    }
    return { start: span.start, end: span.end, color: colors.get(key)!, tableId: entry?.id ?? null, cells: covered };
  });
}
