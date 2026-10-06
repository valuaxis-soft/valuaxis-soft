/**
 * Formula Engine — evaluation of the formulas of table cells and concepts,
 * in dependency order, with cycle detection and safe error handling.
 *
 * A formula reads cells of its own table, cells of other tables and concepts
 * of the valuation. `evaluateFormulaWorld` computes every formula of a set of
 * tables and concepts; `evaluateTableFormulas` answers for one table.
 *
 * Pure TypeScript — no React, no side effects.
 */

import { FORMULA_FUNCTIONS, roundDecimal } from "../calculation/free-formula";
import {
  getDisplayColumns,
  type TableV2,
  type TableRow,
  type TableCellFormat,
  type FormulaExpression,
  type FormulaOperand,
  type FormulaBinaryOp,
  type FormulaCompareOp,
  type FormulaResult,
  type TableFormula,
} from "./table";

type FormulaFailure = Extract<FormulaResult, { ok: false }>;
type FormulaError = FormulaFailure["error"];

/* ================================================================== */
/*  WORLD — what formulas can read                                     */
/* ================================================================== */

/** What a cell or a concept that is not a formula contributes to one. */
export type SourceValue =
  | { kind: "number"; value: number; money: boolean }
  /** Nothing written: zero in arithmetic, left out of sums and averages. */
  | { kind: "blank" }
  /** Text that is not a number. */
  | { kind: "text" };

export type FormulaConceptSource =
  | { kind: "value"; value: SourceValue }
  /** Concepts that share a value share the formula: `key` names the one computation. */
  | { kind: "formula"; key: string; formula: TableFormula };

export type FormulaWorld = {
  /** Tables by id. */
  tables: ReadonlyMap<string, TableV2>;
  /** Concepts by `referenceKey(id)`. */
  concepts: ReadonlyMap<string, FormulaConceptSource>;
};

export type FormulaWorldResults = {
  /** Table id → "rowId:columnId" → result, for every formula cell. */
  cells: Map<string, Map<string, FormulaResult>>;
  /** Key of the concept source → result. */
  concepts: Map<string, FormulaResult>;
};

/**
 * How an id is compared. Saving a concept turns its id into a database key
 * (lower case, no accents or symbols), so a reference written before the
 * first save must still find the concept after a reload.
 */
export function referenceKey(id: string) {
  return id
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .toLowerCase();
}

export const formulaCellKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`;

const BLANK: SourceValue = { kind: "blank" };
const TEXT: SourceValue = { kind: "text" };

/**
 * The number a written value stands for: "$ 9,000.00" is 9000, "169.78 m²" is
 * 169.78 and "5%" is 0.05. Text that is not a number with a unit is text.
 */
export function readSourceNumber(text: string): SourceValue {
  const written = String(text ?? "").trim();
  if (!written || written === "—" || written === "-") return BLANK;
  const match = /^(-?)\s*\$?\s*(-?)\s*(\d[\d,]*\.?\d*|\.\d+)\s*(.*)$/.exec(written);
  if (!match) return TEXT;
  const [, signBefore, signAfter, digits, suffix] = match;
  // A unit follows the number ("m²", "MXN", "%"); more figures mean a date, a range or an address.
  if (suffix.length > 16 || /\d/.test(suffix)) return TEXT;
  const magnitude = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(magnitude)) return TEXT;
  const signed = signBefore || signAfter ? -magnitude : magnitude;
  return {
    kind: "number",
    value: suffix.startsWith("%") ? signed / 100 : signed,
    money: written.includes("$") || /^(mxn|pesos)\b/i.test(suffix),
  };
}

/* ================================================================== */
/*  EVALUATION CONTEXT                                                 */
/* ================================================================== */

type Read = SourceValue | { kind: "error"; failure: FormulaFailure };
type Value = { value: number; money: boolean };

type Context = {
  world: FormulaWorld;
  /** Table of the formula being evaluated: where a cell without `tableId` lives. */
  homeTableId: string | undefined;
  /** Results of the formulas already computed, by node key. */
  results: Map<string, FormulaResult>;
  rowMaps: WeakMap<TableV2, Map<string, TableRow>>;
};

const MAX_EXPRESSION_DEPTH = 200;
const NODE_SEPARATOR = "\u0000";
const cellNodeKey = (tableId: string, rowId: string, columnId: string) => ["cell", tableId, rowId, columnId].join(NODE_SEPARATOR);

const failure = (error: FormulaError, detail?: string): FormulaFailure => ({ ok: false, error, ...(detail ? { detail } : {}) });
const errorRead = (error: FormulaError, detail?: string): Read => ({ kind: "error", failure: failure(error, detail) });

function rowsOf(ctx: Context, table: TableV2) {
  let rows = ctx.rowMaps.get(table);
  if (!rows) {
    rows = new Map(table.rows.map((row) => [row.id, row]));
    ctx.rowMaps.set(table, rows);
  }
  return rows;
}

function tableOf(ctx: Context, tableId: string | undefined) {
  const id = tableId ?? ctx.homeTableId;
  return id === undefined ? undefined : ctx.world.tables.get(id);
}

/** What a formula's result contributes where another formula reads it. */
function readResult(result: FormulaResult | undefined): Read {
  // A formula is computed after the ones it reads; one that is not there yet is part of a cycle.
  if (!result) return errorRead("CIRCULAR_REFERENCE");
  return result.ok ? { kind: "number", value: result.value, money: result.money === true } : { kind: "error", failure: result };
}

function readCell(ctx: Context, tableId: string | undefined, rowId: string, columnId: string): Read {
  const table = tableOf(ctx, tableId);
  if (!table) return errorRead("MISSING_REFERENCE", "Table not found");
  const row = rowsOf(ctx, table).get(rowId);
  if (!row) return errorRead("DELETED_ROW", `Row ${rowId} not found`);
  if (!table.columns.some((column) => column.id === columnId)) return errorRead("DELETED_COLUMN", `Column ${columnId} not found`);
  const cell = row.cells[columnId];
  if (!cell) return BLANK;
  if (cell.kind === "formula") return readResult(ctx.results.get(cellNodeKey(table.id, rowId, columnId)));
  return readSourceNumber(cell.value);
}

function readConcept(ctx: Context, conceptId: string): Read {
  const source = ctx.world.concepts.get(referenceKey(conceptId));
  if (!source) return errorRead("MISSING_REFERENCE", "Concept not found");
  return source.kind === "formula" ? readResult(ctx.results.get(source.key)) : source.value;
}

/** The cells an operand names, in reading order; a failure when a corner of a range is gone. */
function operandCells(ctx: Context, operand: FormulaOperand): Array<{ tableId: string | undefined; rowId: string; columnId: string }> | FormulaFailure {
  switch (operand.type) {
    case "cell":
      return [{ tableId: operand.tableId, rowId: operand.rowId, columnId: operand.columnId }];
    case "range":
      return operand.cells.map((cell) => ({ tableId: undefined, rowId: cell.rowId, columnId: cell.columnId }));
    case "row": {
      const table = tableOf(ctx, undefined);
      if (!table || !rowsOf(ctx, table).has(operand.rowId)) return failure("DELETED_ROW");
      return table.columns.map((column) => ({ tableId: undefined, rowId: operand.rowId, columnId: column.id }));
    }
    case "column": {
      const table = tableOf(ctx, undefined);
      if (!table?.columns.some((column) => column.id === operand.columnId)) return failure("DELETED_COLUMN");
      return table.rows.map((row) => ({ tableId: undefined, rowId: row.id, columnId: operand.columnId }));
    }
    case "span": {
      const table = tableOf(ctx, operand.tableId);
      if (!table) return failure("MISSING_REFERENCE", "Table not found");
      const columns = getDisplayColumns(table);
      const rowIndex = (rowId: string) => table.rows.findIndex((row) => row.id === rowId);
      const columnIndex = (columnId: string) => columns.findIndex((column) => column.id === columnId);
      const rows = [rowIndex(operand.from.rowId), rowIndex(operand.to.rowId)];
      const cols = [columnIndex(operand.from.columnId), columnIndex(operand.to.columnId)];
      if (rows.includes(-1)) return failure("DELETED_ROW");
      if (cols.includes(-1)) return failure("DELETED_COLUMN");
      const cells = [];
      for (let row = Math.min(...rows); row <= Math.max(...rows); row += 1) {
        for (let column = Math.min(...cols); column <= Math.max(...cols); column += 1) {
          cells.push({ tableId: operand.tableId, rowId: table.rows[row].id, columnId: columns[column].id });
        }
      }
      return cells;
    }
    default:
      return [];
  }
}

const isList = (operand: FormulaOperand) => operand.type === "range" || operand.type === "row" || operand.type === "column" || operand.type === "span";

/** Numbers of the cells of a list; empty cells and text are left out, as a spreadsheet does. */
function listValues(ctx: Context, operand: FormulaOperand): Value[] | FormulaFailure {
  const cells = operandCells(ctx, operand);
  if (!Array.isArray(cells)) return cells;
  const values: Value[] = [];
  for (const cell of cells) {
    const read = readCell(ctx, cell.tableId, cell.rowId, cell.columnId);
    if (read.kind === "error") return read.failure;
    if (read.kind === "number") values.push({ value: read.value, money: read.money });
  }
  return values;
}

/** A single value where the formula does arithmetic with it. */
function scalar(read: Read): FormulaResult {
  if (read.kind === "error") return read.failure;
  if (read.kind === "text") return failure("INVALID_NUMBER");
  if (read.kind === "blank") return { ok: true, value: 0 };
  return number(read.value, read.money);
}

function number(value: number, money: boolean): FormulaResult {
  if (!Number.isFinite(value)) return failure("INVALID_OPERATION", "Not a finite number");
  return money ? { ok: true, value, money: true } : { ok: true, value };
}

function resolveOperand(ctx: Context, operand: FormulaOperand): FormulaResult {
  switch (operand.type) {
    case "constant":
      return number(Number(operand.value), false);
    case "cell":
      return scalar(readCell(ctx, operand.tableId, operand.rowId, operand.columnId));
    case "concept":
      return scalar(readConcept(ctx, operand.conceptId));
    default: {
      if (!isList(operand)) return failure("INVALID_OPERATION", "Unknown operand");
      // A range where a single value is expected is its sum.
      const values = listValues(ctx, operand);
      if (!Array.isArray(values)) return values;
      return number(values.reduce((total, item) => total + item.value, 0), values.some((item) => item.money));
    }
  }
}

/* ================================================================== */
/*  EXPRESSION EVALUATOR                                               */
/* ================================================================== */

function evaluateExpression(ctx: Context, expr: FormulaExpression, depth = 0): FormulaResult {
  if (depth > MAX_EXPRESSION_DEPTH || !expr || typeof expr !== "object") return failure("INVALID_OPERATION", "Malformed expression");
  switch (expr.type) {
    case "constant":
      return number(Number(expr.value), false);

    case "operand":
      return expr.operand && typeof expr.operand === "object" ? resolveOperand(ctx, expr.operand) : failure("INVALID_OPERATION", "Malformed operand");

    case "binary":
      return evaluateBinary(ctx, expr.operator, expr.left, expr.right, depth);

    case "compare":
      return evaluateCompare(ctx, expr.operator, expr.left, expr.right, depth);

    case "function":
      return evaluateFunction(ctx, String(expr.name ?? ""), Array.isArray(expr.args) ? expr.args : [], depth);

    default:
      return failure("INVALID_OPERATION", "Unknown expression type");
  }
}

function evaluateBinary(
  ctx: Context,
  operator: FormulaBinaryOp,
  left: FormulaExpression,
  right: FormulaExpression,
  depth: number,
): FormulaResult {
  const l = evaluateExpression(ctx, left, depth + 1);
  if (!l.ok) return l;
  const r = evaluateExpression(ctx, right, depth + 1);
  if (!r.ok) return r;
  const lMoney = l.money === true;
  const rMoney = r.money === true;

  switch (operator) {
    case "ADD": return number(l.value + r.value, lMoney || rMoney);
    case "SUBTRACT": return number(l.value - r.value, lMoney || rMoney);
    case "MULTIPLY": return number(l.value * r.value, lMoney || rMoney);
    case "DIVIDE":
      if (r.value === 0) return failure("DIVIDE_BY_ZERO");
      // An amount by a quantity is a unit price; an amount by an amount is a ratio.
      return number(l.value / r.value, lMoney && !rMoney);
    case "MODULO":
      if (r.value === 0) return failure("DIVIDE_BY_ZERO");
      return number(l.value % r.value, false);
    case "POWER": return number(Math.pow(l.value, r.value), false);
    default:
      return failure("INVALID_OPERATION", `Unknown operator ${String(operator)}`);
  }
}

function evaluateCompare(
  ctx: Context,
  operator: FormulaCompareOp,
  left: FormulaExpression,
  right: FormulaExpression,
  depth: number,
): FormulaResult {
  const l = evaluateExpression(ctx, left, depth + 1);
  if (!l.ok) return l;
  const r = evaluateExpression(ctx, right, depth + 1);
  if (!r.ok) return r;

  let result: boolean;
  switch (operator) {
    case "EQUAL": result = l.value === r.value; break;
    case "NOT_EQUAL": result = l.value !== r.value; break;
    case "GREATER_THAN": result = l.value > r.value; break;
    case "GREATER_OR_EQUAL": result = l.value >= r.value; break;
    case "LESS_THAN": result = l.value < r.value; break;
    case "LESS_OR_EQUAL": result = l.value <= r.value; break;
    default:
      return failure("INVALID_OPERATION", `Unknown compare operator ${String(operator)}`);
  }
  return { ok: true, value: result ? 1 : 0 };
}

/* ================================================================== */
/*  BUILT-IN FUNCTIONS                                                 */
/* ================================================================== */

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const exactly = (count: number, fn: (...args: number[]) => number) => (args: number[]) => (args.length === count ? fn(...args) : Number.NaN);

/** Functions over the numbers of their arguments; a range contributes each of its cells. */
const NUMERIC_FUNCTIONS: Record<string, (args: number[]) => number> = {
  ...FORMULA_FUNCTIONS,
  // The average of nothing is zero, as tables saved before typed formulas computed it.
  AVERAGE: (args) => (args.length ? FORMULA_FUNCTIONS.AVERAGE(args) : 0),
  MIN: (args) => (args.length ? Math.min(...args) : 0),
  MAX: (args) => (args.length ? Math.max(...args) : 0),
  NEG: exactly(1, (value) => -value),
  PERCENT: exactly(1, (value) => value / 100),
  COUNT: (args) => args.length,
  COUNT_NUMERIC: (args) => args.length,
  MEDIAN: median,
  ROUND_UP: exactly(1, Math.ceil),
  ROUND_DOWN: exactly(1, Math.floor),
  FLOOR: exactly(1, Math.floor),
  CEIL: exactly(1, Math.ceil),
  SIGN: exactly(1, Math.sign),
  CLAMP: exactly(3, (value, min, max) => Math.max(min, Math.min(max, value))),
  PERCENT_OF: exactly(2, (percent, base) => (percent / 100) * base),
};

/** Functions whose result is an amount when what they read is one. */
const KEEPS_MONEY = new Set<string>(["SUM", "AVERAGE", "PRODUCT", "MIN", "MAX", "ABS", "ROUND", "NEG", "PERCENT", "MEDIAN", "ROUND_UP", "ROUND_DOWN", "FLOOR", "CEIL", "CLAMP"]);
/** Of these, the ones that take the kind of their first argument only. */
const MONEY_OF_FIRST = new Set<string>(["ROUND", "CLAMP"]);

function evaluateFunction(ctx: Context, rawName: string, args: FormulaExpression[], depth: number): FormulaResult {
  const name = rawName.toUpperCase();
  const evaluate = (arg: FormulaExpression) => evaluateExpression(ctx, arg, depth + 1);

  // Logic picks what to evaluate.
  switch (name) {
    case "IF": {
      if (args.length !== 3) return failure("INVALID_OPERATION", "IF needs 3 args (condition, true, false)");
      const condition = evaluate(args[0]);
      if (!condition.ok) return condition;
      return evaluate(condition.value !== 0 ? args[1] : args[2]);
    }
    case "IFERROR": {
      if (args.length !== 2) return failure("INVALID_OPERATION", "IFERROR needs 2 args (expression, fallback)");
      const result = evaluate(args[0]);
      return result.ok ? result : evaluate(args[1]);
    }
    case "AND":
    case "OR": {
      for (const arg of args) {
        const result = evaluate(arg);
        if (!result.ok) return result;
        if ((result.value !== 0) === (name === "OR")) return { ok: true, value: name === "OR" ? 1 : 0 };
      }
      return { ok: true, value: name === "OR" ? 0 : 1 };
    }
    case "NOT": {
      if (args.length !== 1) return failure("INVALID_OPERATION", "NOT needs 1 arg");
      const result = evaluate(args[0]);
      return result.ok ? { ok: true, value: result.value === 0 ? 1 : 0 } : result;
    }
    case "PERCENT_CHANGE": {
      if (args.length !== 2) return failure("INVALID_OPERATION", "PERCENT_CHANGE needs 2 args (old, new)");
      const before = evaluate(args[0]);
      if (!before.ok) return before;
      const after = evaluate(args[1]);
      if (!after.ok) return after;
      if (before.value === 0) return failure("DIVIDE_BY_ZERO", "PERCENT_CHANGE base is 0");
      return number(((after.value - before.value) / Math.abs(before.value)) * 100, false);
    }
  }

  const fn = Object.hasOwn(NUMERIC_FUNCTIONS, name) ? NUMERIC_FUNCTIONS[name] : undefined;
  if (!fn) return failure("UNKNOWN_FUNCTION", `Function ${rawName} not found`);

  const values: Value[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg?.type === "operand" && arg.operand && isList(arg.operand)) {
      const list = listValues(ctx, arg.operand);
      if (!Array.isArray(list)) return list;
      if (index === 0 || !MONEY_OF_FIRST.has(name)) values.push(...list);
      else values.push(...list.map((item) => ({ ...item, money: false })));
      continue;
    }
    const result = evaluate(arg);
    if (!result.ok) return result;
    values.push({ value: result.value, money: result.money === true && (index === 0 || !MONEY_OF_FIRST.has(name)) });
  }
  return number(fn(values.map((item) => item.value)), KEEPS_MONEY.has(name) && values.some((item) => item.money));
}

/* ================================================================== */
/*  DEPENDENCIES                                                       */
/* ================================================================== */

/** Keys of the formulas an expression reads. */
function expressionDependencies(ctx: Context, expr: FormulaExpression, into: Set<string>, depth = 0): void {
  if (depth > MAX_EXPRESSION_DEPTH || !expr || typeof expr !== "object") return;
  switch (expr.type) {
    case "operand": {
      const operand = expr.operand;
      if (!operand || typeof operand !== "object") return;
      if (operand.type === "concept") {
        const source = ctx.world.concepts.get(referenceKey(String(operand.conceptId)));
        if (source?.kind === "formula") into.add(source.key);
        return;
      }
      const cells = operandCells(ctx, operand);
      if (!Array.isArray(cells)) return;
      for (const cell of cells) {
        const table = tableOf(ctx, cell.tableId);
        if (table && rowsOf(ctx, table).get(cell.rowId)?.cells[cell.columnId]?.kind === "formula") {
          into.add(cellNodeKey(table.id, cell.rowId, cell.columnId));
        }
      }
      return;
    }
    case "binary":
    case "compare":
      expressionDependencies(ctx, expr.left, into, depth + 1);
      expressionDependencies(ctx, expr.right, into, depth + 1);
      return;
    case "function":
      if (Array.isArray(expr.args)) for (const arg of expr.args) expressionDependencies(ctx, arg, into, depth + 1);
      return;
    default:
  }
}

type FormulaNode = { key: string; homeTableId: string | undefined; formula: TableFormula };

/**
 * Formulas in the order they must be computed, each after the ones it reads,
 * and the ones that read themselves through any path. Walks the graph with
 * its own stack: a long chain of formulas does not exhaust the call stack.
 */
function orderNodes(nodes: Map<string, FormulaNode>, dependenciesOf: (node: FormulaNode) => string[]) {
  const order: FormulaNode[] = [];
  const circular = new Set<string>();
  const state = new Map<string, "visiting" | "done">();

  for (const root of nodes.values()) {
    if (state.has(root.key)) continue;
    const stack: Array<{ node: FormulaNode; dependencies: string[]; next: number }> = [];
    const enter = (node: FormulaNode) => {
      state.set(node.key, "visiting");
      stack.push({ node, dependencies: dependenciesOf(node), next: 0 });
    };
    enter(root);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.next >= frame.dependencies.length) {
        state.set(frame.node.key, "done");
        order.push(frame.node);
        stack.pop();
        continue;
      }
      const key = frame.dependencies[frame.next];
      frame.next += 1;
      const dependency = nodes.get(key);
      if (!dependency) continue;
      const seen = state.get(key);
      if (seen === "visiting") {
        // Everything on the path from the formula found again back to itself is the cycle.
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          circular.add(stack[index].node.key);
          if (stack[index].node.key === key) break;
        }
      } else if (!seen) {
        enter(dependency);
      }
    }
  }
  return { order, circular };
}

/* ================================================================== */
/*  PUBLIC API                                                         */
/* ================================================================== */

/**
 * Computes every formula of the tables and concepts of a world.
 *
 * Each formula is computed once, after the ones it reads. A formula that
 * reads itself, directly or through others, is a CIRCULAR_REFERENCE, and so
 * is whatever reads it. A malformed formula is an error, never an exception.
 */
export function evaluateFormulaWorld(world: FormulaWorld): FormulaWorldResults {
  const ctx: Context = { world, homeTableId: undefined, results: new Map(), rowMaps: new WeakMap() };
  const nodes = new Map<string, FormulaNode>();
  const cellNodes: Array<{ tableId: string; cellKey: string; nodeKey: string }> = [];

  for (const table of world.tables.values()) {
    for (const row of table.rows) {
      for (const column of table.columns) {
        const cell = row.cells[column.id];
        if (cell?.kind !== "formula") continue;
        const nodeKey = cellNodeKey(table.id, row.id, column.id);
        nodes.set(nodeKey, { key: nodeKey, homeTableId: table.id, formula: cell.formula });
        cellNodes.push({ tableId: table.id, cellKey: formulaCellKey(row.id, column.id), nodeKey });
      }
    }
  }
  const conceptKeys = new Set<string>();
  for (const source of world.concepts.values()) {
    if (source.kind !== "formula" || nodes.has(source.key)) continue;
    nodes.set(source.key, { key: source.key, homeTableId: undefined, formula: source.formula });
    conceptKeys.add(source.key);
  }

  const { order, circular } = orderNodes(nodes, (node) => {
    const dependencies = new Set<string>();
    try {
      expressionDependencies({ ...ctx, homeTableId: node.homeTableId }, node.formula?.expression, dependencies);
    } catch {
      // A formula that cannot be read has no dependencies; evaluating it reports the error.
    }
    return [...dependencies];
  });

  for (const node of order) {
    if (circular.has(node.key)) {
      ctx.results.set(node.key, failure("CIRCULAR_REFERENCE"));
      continue;
    }
    let result: FormulaResult;
    try {
      result = evaluateExpression({ ...ctx, homeTableId: node.homeTableId }, node.formula?.expression);
    } catch {
      result = failure("INVALID_OPERATION", "Malformed formula");
    }
    ctx.results.set(node.key, result);
  }

  const cells = new Map<string, Map<string, FormulaResult>>();
  for (const { tableId, cellKey, nodeKey } of cellNodes) {
    let ofTable = cells.get(tableId);
    if (!ofTable) cells.set(tableId, (ofTable = new Map()));
    ofTable.set(cellKey, ctx.results.get(nodeKey) ?? failure("INVALID_OPERATION"));
  }
  const concepts = new Map<string, FormulaResult>();
  for (const key of conceptKeys) concepts.set(key, ctx.results.get(key) ?? failure("INVALID_OPERATION"));
  return { cells, concepts };
}

/**
 * The results of the formulas of a table: a map of "rowId:columnId" → result.
 *
 * A table of a valuation carries the results computed with the whole document
 * (`formulaResults`). A table on its own is computed here: its formulas read
 * its own cells, and a reference to another table or to a concept is missing.
 */
export function evaluateTableFormulas(table: TableV2): Map<string, FormulaResult> {
  if (table.formulaResults) return new Map(Object.entries(table.formulaResults));
  return evaluateFormulaWorld({ tables: new Map([[table.id, table]]), concepts: new Map() }).cells.get(table.id) ?? new Map();
}

/** How an error is written in a cell, as spreadsheets write theirs. */
export function formulaErrorLabel(error: FormulaError): string {
  switch (error) {
    case "DIVIDE_BY_ZERO": return "#DIV/0!";
    case "INVALID_NUMBER": return "#VALOR!";
    case "MISSING_REFERENCE":
    case "DELETED_ROW":
    case "DELETED_COLUMN": return "#REF!";
    case "CIRCULAR_REFERENCE": return "#CIRCULAR";
    case "UNKNOWN_FUNCTION": return "#NOMBRE?";
    default: return "#ERROR";
  }
}

/** The same error, explained to whoever wrote the formula. */
export function formulaErrorMessage(error: FormulaError): string {
  switch (error) {
    case "DIVIDE_BY_ZERO": return "La fórmula divide entre cero.";
    case "INVALID_NUMBER": return "La fórmula usa un valor que no es un número.";
    case "MISSING_REFERENCE":
    case "DELETED_ROW":
    case "DELETED_COLUMN": return "La fórmula usa una celda, una tabla o un concepto que ya no existe.";
    case "CIRCULAR_REFERENCE": return "La fórmula se usa a sí misma, directamente o a través de otras.";
    case "UNKNOWN_FUNCTION": return "La fórmula usa una función que no existe.";
    default: return "La fórmula no se puede calcular.";
  }
}

/**
 * Get the display value for a cell, considering formulas and formatting.
 */
export function getCellDisplayValue(
  table: TableV2,
  rowId: string,
  columnId: string,
  formulaResults: Map<string, FormulaResult>,
): string {
  const row = table.rows.find((r) => r.id === rowId);
  if (!row) return "";
  const cell = row.cells[columnId];
  if (!cell) return "";

  if (cell.kind === "value") {
    return cell.value;
  }

  // Formula cell
  const result = formulaResults.get(formulaCellKey(rowId, columnId));
  if (!result) return "#PENDING";
  if (!result.ok) return formulaErrorLabel(result.error);
  return formatFormulaNumber(result.value, cell.format, result.money === true);
}

/** Longest tail of decimals a result shows when nothing says how many; REDONDEAR asks for fewer. */
export const FORMULA_RESULT_MAX_DECIMALS = 4;

const currencyFormat = (precision: number) => new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: precision,
  maximumFractionDigits: precision,
});

/**
 * A result as the cell shows it. Without a format of its own it follows its
 * sources: an amount of money reads "$9,000.00", anything else is a number
 * with thousands separators and up to four decimals.
 */
export function formatFormulaNumber(value: number, format: TableCellFormat | undefined, money = false): string {
  // Rounded as written in decimal before it is formatted, so a half rounds up as it reads.
  const rounded = (decimals: number) => roundDecimal(value, decimals);
  if (!format) {
    if (money) return currencyFormat(2).format(rounded(2));
    return new Intl.NumberFormat("es-MX", { maximumFractionDigits: FORMULA_RESULT_MAX_DECIMALS }).format(rounded(FORMULA_RESULT_MAX_DECIMALS));
  }
  switch (format.type) {
    case "currency":
      return currencyFormat(format.precision ?? 2).format(rounded(format.precision ?? 2));
    case "percent":
      return `${roundDecimal(value * 100, format.precision ?? 0).toFixed(format.precision ?? 0)}%`;
    case "number":
      return new Intl.NumberFormat("es-MX", {
        minimumFractionDigits: format.precision ?? 0,
        maximumFractionDigits: format.precision ?? 6,
      }).format(rounded(format.precision ?? 6));
    case "measurement": {
      const unitSymbol = format.unit || "m";
      const unitLabel = format.customUnit || unitSymbol;
      const precision = format.precision ?? 2;
      return `${new Intl.NumberFormat("es-MX", { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(rounded(precision))} ${unitLabel}`;
    }
    case "date":
      return new Date(value).toLocaleDateString("es-MX");
    case "boolean":
      return value !== 0 ? "Sí" : "No";
    default:
      return String(value);
  }
}
