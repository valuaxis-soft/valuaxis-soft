/**
 * Table Formula Engine — structured formula evaluation, dependency tracking,
 * cycle detection, and safe error handling.
 *
 * Pure TypeScript — no React, no side effects.
 */

import type {
  TableV2,
  TableCellFormat,
  FormulaExpression,
  FormulaOperand,
  FormulaBinaryOp,
  FormulaCompareOp,
  TableEvaluationContext,
  FormulaResult,
} from "./table";

/* ================================================================== */
/*  OPERAND RESOLUTION                                                 */
/* ================================================================== */

/** Resolve a cell reference to its numeric raw value. */
function resolveCellRef(
  ctx: TableEvaluationContext,
  rowId: string,
  columnId: string,
): FormulaResult {
  const row = ctx.rowMap.get(rowId);
  if (!row) return { ok: false, error: "DELETED_ROW", detail: `Row ${rowId} not found` };
  const col = ctx.columnMap.get(columnId);
  if (!col) return { ok: false, error: "DELETED_COLUMN", detail: `Column ${columnId} not found` };
  const cell = row.cells[columnId];
  if (!cell) return { ok: false, error: "MISSING_REFERENCE", detail: `Cell ${rowId}:${columnId} missing` };

  if (cell.kind === "formula") {
    const key = `${rowId}:${columnId}`;
    if (ctx.resultCache.has(key)) {
      return { ok: true, value: ctx.resultCache.get(key)! };
    }
    if (ctx.evaluating.has(key)) {
      return { ok: false, error: "CIRCULAR_REFERENCE", detail: `Cycle at ${rowId}:${columnId}` };
    }
    ctx.evaluating.add(key);
    const result = evaluateExpression(ctx, cell.formula.expression);
    ctx.evaluating.delete(key);
    if (result.ok) {
      ctx.resultCache.set(key, result.value);
    }
    return result;
  }

  // value cell — parse to number
  const num = parseNumber(cell.value);
  if (num === null) {
    return { ok: false, error: "INVALID_NUMBER", detail: `Cannot parse "${cell.value}" as number` };
  }
  return { ok: true, value: num };
}

/** Resolve a row reference to all numeric values in that row. */
function resolveRowRef(ctx: TableEvaluationContext, rowId: string): FormulaResult {
  const row = ctx.rowMap.get(rowId);
  if (!row) return { ok: false, error: "DELETED_ROW", detail: `Row ${rowId} not found` };
  // Sum all numeric values in the row
  let sum = 0;
  for (const col of ctx.columnMap.values()) {
    const cell = row.cells[col.id];
    if (cell?.kind === "value") {
      const num = parseNumber(cell.value);
      if (num !== null) sum += num;
    } else if (cell?.kind === "formula") {
      const result = resolveCellRef(ctx, rowId, col.id);
      if (result.ok) sum += result.value;
    }
  }
  return { ok: true, value: sum };
}

/** Resolve a column reference to all numeric values in that column. */
function resolveColumnRef(ctx: TableEvaluationContext, columnId: string): FormulaResult {
  const col = ctx.columnMap.get(columnId);
  if (!col) return { ok: false, error: "DELETED_COLUMN", detail: `Column ${columnId} not found` };
  let sum = 0;
  for (const row of ctx.table.rows) {
    const cell = row.cells[columnId];
    if (cell?.kind === "value") {
      const num = parseNumber(cell.value);
      if (num !== null) sum += num;
    } else if (cell?.kind === "formula") {
      const result = resolveCellRef(ctx, row.id, columnId);
      if (result.ok) sum += result.value;
    }
  }
  return { ok: true, value: sum };
}

/** Resolve a range reference to all numeric values. */
function resolveRangeRef(
  ctx: TableEvaluationContext,
  cells: Array<{ rowId: string; columnId: string }>,
): FormulaResult {
  let sum = 0;
  for (const ref of cells) {
    const result = resolveCellRef(ctx, ref.rowId, ref.columnId);
    if (result.ok) sum += result.value;
  }
  return { ok: true, value: sum };
}

/** Resolve any operand to a numeric value. */
function resolveOperand(ctx: TableEvaluationContext, operand: FormulaOperand): FormulaResult {
  switch (operand.type) {
    case "cell":
      return resolveCellRef(ctx, operand.rowId, operand.columnId);
    case "row":
      return resolveRowRef(ctx, operand.rowId);
    case "column":
      return resolveColumnRef(ctx, operand.columnId);
    case "range":
      return resolveRangeRef(ctx, operand.cells);
    case "constant":
      return { ok: true, value: operand.value };
  }
}

/* ================================================================== */
/*  EXPRESSION EVALUATOR                                               */
/* ================================================================== */

function evaluateExpression(ctx: TableEvaluationContext, expr: FormulaExpression): FormulaResult {
  switch (expr.type) {
    case "constant":
      return { ok: true, value: expr.value };

    case "operand":
      return resolveOperand(ctx, expr.operand);

    case "binary":
      return evaluateBinary(ctx, expr.operator, expr.left, expr.right);

    case "compare":
      return evaluateCompare(ctx, expr.operator, expr.left, expr.right);

    case "function":
      return evaluateFunction(ctx, expr.name, expr.args);

    default:
      return { ok: false, error: "INVALID_OPERATION", detail: `Unknown expression type` };
  }
}

function evaluateBinary(
  ctx: TableEvaluationContext,
  operator: FormulaBinaryOp,
  left: FormulaExpression,
  right: FormulaExpression,
): FormulaResult {
  const l = evaluateExpression(ctx, left);
  if (!l.ok) return l;
  const r = evaluateExpression(ctx, right);
  if (!r.ok) return r;

  switch (operator) {
    case "ADD": return { ok: true, value: l.value + r.value };
    case "SUBTRACT": return { ok: true, value: l.value - r.value };
    case "MULTIPLY": return { ok: true, value: l.value * r.value };
    case "DIVIDE":
      if (r.value === 0) return { ok: false, error: "DIVIDE_BY_ZERO" };
      return { ok: true, value: l.value / r.value };
    case "MODULO":
      if (r.value === 0) return { ok: false, error: "DIVIDE_BY_ZERO" };
      return { ok: true, value: l.value % r.value };
    case "POWER": return { ok: true, value: Math.pow(l.value, r.value) };
    default:
      return { ok: false, error: "INVALID_OPERATION", detail: `Unknown operator ${operator}` };
  }
}

function evaluateCompare(
  ctx: TableEvaluationContext,
  operator: FormulaCompareOp,
  left: FormulaExpression,
  right: FormulaExpression,
): FormulaResult {
  const l = evaluateExpression(ctx, left);
  if (!l.ok) return l;
  const r = evaluateExpression(ctx, right);
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
      return { ok: false, error: "INVALID_OPERATION", detail: `Unknown compare operator ${operator}` };
  }
  return { ok: true, value: result ? 1 : 0 };
}

/* ================================================================== */
/*  BUILT-IN FUNCTIONS                                                 */
/* ================================================================== */

type BuiltInFunction = (
  ctx: TableEvaluationContext,
  args: FormulaExpression[],
) => FormulaResult;

const BUILT_IN_FUNCTIONS: Record<string, BuiltInFunction> = {
  // Aggregates
  SUM: (ctx, args) => aggregate(ctx, args, (vals) => vals.reduce((a, b) => a + b, 0)),
  AVERAGE: (ctx, args) => {
    const result = aggregate(ctx, args, (vals) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    return result;
  },
  MIN: (ctx, args) => aggregate(ctx, args, (vals) => vals.length ? Math.min(...vals) : 0),
  MAX: (ctx, args) => aggregate(ctx, args, (vals) => vals.length ? Math.max(...vals) : 0),
  COUNT: (ctx, args) => aggregate(ctx, args, (vals) => vals.length),
  COUNT_NUMERIC: (ctx, args) => aggregate(ctx, args, (vals) => vals.length),
  PRODUCT: (ctx, args) => aggregate(ctx, args, (vals) => vals.reduce((a, b) => a * b, 1)),
  MEDIAN: (ctx, args) => {
    const results = collectValues(ctx, args);
    const numeric: number[] = [];
    for (const r of results) {
      if (!r.ok) return r;
      numeric.push(r.value);
    }
    if (numeric.length === 0) return { ok: true, value: 0 };
    const sorted = [...numeric].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return { ok: true, value: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid] };
  },

  // Numeric
  ABS: (ctx, args) => unary(ctx, args, (v) => Math.abs(v)),
  ROUND: (ctx, args) => unary(ctx, args, (v) => Math.round(v)),
  ROUND_UP: (ctx, args) => unary(ctx, args, (v) => Math.ceil(v)),
  ROUND_DOWN: (ctx, args) => unary(ctx, args, (v) => Math.floor(v)),
  FLOOR: (ctx, args) => unary(ctx, args, (v) => Math.floor(v)),
  CEIL: (ctx, args) => unary(ctx, args, (v) => Math.ceil(v)),
  SQRT: (ctx, args) => unary(ctx, args, (v) => {
    if (v < 0) return { ok: false, error: "INVALID_OPERATION" as const, detail: "SQRT of negative" };
    return { ok: true, value: Math.sqrt(v) };
  }),
  SIGN: (ctx, args) => unary(ctx, args, (v) => Math.sign(v)),
  CLAMP: (ctx, args) => {
    if (args.length !== 3) return { ok: false, error: "INVALID_OPERATION", detail: "CLAMP needs 3 args (value, min, max)" };
    const val = evaluateExpression(ctx, args[0]);
    if (!val.ok) return val;
    const min = evaluateExpression(ctx, args[1]);
    if (!min.ok) return min;
    const max = evaluateExpression(ctx, args[2]);
    if (!max.ok) return max;
    return { ok: true, value: Math.max(min.value, Math.min(max.value, val.value)) };
  },

  // Percentage
  PERCENT_OF: (ctx, args) => {
    if (args.length !== 2) return { ok: false, error: "INVALID_OPERATION", detail: "PERCENT_OF needs 2 args" };
    const percent = evaluateExpression(ctx, args[0]);
    if (!percent.ok) return percent;
    const base = evaluateExpression(ctx, args[1]);
    if (!base.ok) return base;
    return { ok: true, value: (percent.value / 100) * base.value };
  },
  PERCENT_CHANGE: (ctx, args) => {
    if (args.length !== 2) return { ok: false, error: "INVALID_OPERATION", detail: "PERCENT_CHANGE needs 2 args (old, new)" };
    const oldVal = evaluateExpression(ctx, args[0]);
    if (!oldVal.ok) return oldVal;
    const newVal = evaluateExpression(ctx, args[1]);
    if (!newVal.ok) return newVal;
    if (oldVal.value === 0) return { ok: false, error: "DIVIDE_BY_ZERO", detail: "PERCENT_CHANGE base is 0" };
    return { ok: true, value: ((newVal.value - oldVal.value) / Math.abs(oldVal.value)) * 100 };
  },

  // Logic
  IF: (ctx, args) => {
    if (args.length !== 3) return { ok: false, error: "INVALID_OPERATION", detail: "IF needs 3 args (condition, true, false)" };
    const cond = evaluateExpression(ctx, args[0]);
    if (!cond.ok) return cond;
    return cond.value !== 0
      ? evaluateExpression(ctx, args[1])
      : evaluateExpression(ctx, args[2]);
  },
  IFERROR: (ctx, args) => {
    if (args.length !== 2) return { ok: false, error: "INVALID_OPERATION", detail: "IFERROR needs 2 args (expression, fallback)" };
    const result = evaluateExpression(ctx, args[0]);
    if (result.ok) return result;
    return evaluateExpression(ctx, args[1]);
  },
  AND: (ctx, args) => {
    for (const arg of args) {
      const r = evaluateExpression(ctx, arg);
      if (!r.ok) return r;
      if (r.value === 0) return { ok: true, value: 0 };
    }
    return { ok: true, value: 1 };
  },
  OR: (ctx, args) => {
    for (const arg of args) {
      const r = evaluateExpression(ctx, arg);
      if (!r.ok) return r;
      if (r.value !== 0) return { ok: true, value: 1 };
    }
    return { ok: true, value: 0 };
  },
  NOT: (ctx, args) => {
    if (args.length !== 1) return { ok: false, error: "INVALID_OPERATION", detail: "NOT needs 1 arg" };
    const r = evaluateExpression(ctx, args[0]);
    if (!r.ok) return r;
    return { ok: true, value: r.value === 0 ? 1 : 0 };
  },
};

/* ================================================================== */
/*  AGGREGATE / UNARY HELPERS                                          */
/* ================================================================== */

function collectValues(ctx: TableEvaluationContext, args: FormulaExpression[]): FormulaResult[] {
  return args.map((arg) => evaluateExpression(ctx, arg));
}

function aggregate(
  ctx: TableEvaluationContext,
  args: FormulaExpression[],
  fn: (values: number[]) => number,
): FormulaResult {
  const results = collectValues(ctx, args);
  const numeric: number[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    numeric.push(r.value);
  }
  return { ok: true, value: fn(numeric) };
}

function unary(
  ctx: TableEvaluationContext,
  args: FormulaExpression[],
  fn: (v: number) => FormulaResult | number,
): FormulaResult {
  if (args.length !== 1) return { ok: false, error: "INVALID_OPERATION", detail: "Expected 1 argument" };
  const r = evaluateExpression(ctx, args[0]);
  if (!r.ok) return r;
  const result = fn(r.value);
  return typeof result === "number" ? { ok: true, value: result } : result;
}

/* ================================================================== */
/*  FUNCTION DISPATCH                                                  */
/* ================================================================== */

function evaluateFunction(
  ctx: TableEvaluationContext,
  name: string,
  args: FormulaExpression[],
): FormulaResult {
  const fn = BUILT_IN_FUNCTIONS[name.toUpperCase()];
  if (!fn) return { ok: false, error: "UNKNOWN_FUNCTION", detail: `Function ${name} not found` };
  return fn(ctx, args);
}

/* ================================================================== */
/*  NUMBER PARSING                                                     */
/* ================================================================== */

function parseNumber(value: string): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const trimmed = String(value).trim().replace(/[$,]/g, "");
  const num = Number(trimmed);
  if (isNaN(num)) return null;
  return num;
}

/* ================================================================== */
/*  PUBLIC API — EVALUATE ENTIRE TABLE                                 */
/* ================================================================== */

/**
 * Evaluate all formulas in a table and return a map of cellKey → FormulaResult.
 *
 * This is the canonical evaluation entry point.
 * It handles dependency resolution, cycle detection, and caching.
 */
export function evaluateTableFormulas(table: TableV2): Map<string, FormulaResult> {
  const rowMap = new Map(table.rows.map((r) => [r.id, r]));
  const columnMap = new Map(table.columns.map((c) => [c.id, c]));

  const ctx: TableEvaluationContext = {
    table,
    rowMap,
    columnMap,
    resultCache: new Map(),
    evaluating: new Set(),
  };

  const results = new Map<string, FormulaResult>();

  for (const row of table.rows) {
    for (const col of table.columns) {
      const cell = row.cells[col.id];
      if (cell?.kind === "formula") {
        const key = `${row.id}:${col.id}`;
        const result = evaluateExpression(ctx, cell.formula.expression);
        results.set(key, result);
      }
    }
  }

  return results;
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
  const key = `${rowId}:${columnId}`;
  const result = formulaResults.get(key);
  if (!result) return "#PENDING";
  if (!result.ok) return `#${result.error}`;
  return formatNumber(result.value, cell.format);
}

function formatNumber(value: number, format?: TableCellFormat): string {
  if (!format) return String(value);
  switch (format.type) {
    case "currency":
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: format.precision ?? 2,
        maximumFractionDigits: format.precision ?? 2,
      }).format(value);
    case "percent":
      return `${(value * 100).toFixed(format.precision ?? 0)}%`;
    case "number":
      return new Intl.NumberFormat("es-MX", {
        minimumFractionDigits: format.precision ?? 0,
        maximumFractionDigits: format.precision ?? 6,
      }).format(value);
    case "measurement": {
      const unitSymbol = format.unit || "m";
      const unitLabel = format.customUnit || unitSymbol;
      const precision = format.precision ?? 2;
      return `${new Intl.NumberFormat("es-MX", { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value)} ${unitLabel}`;
    }
    case "date":
      return new Date(value).toLocaleDateString("es-MX");
    case "boolean":
      return value !== 0 ? "Sí" : "No";
    default:
      return String(value);
  }
}
