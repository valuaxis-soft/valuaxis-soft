/**
 * Free calculations, as in a spreadsheet: a value that starts with "=" is
 * computed. Operators + − * / ^ and %, parentheses, and the functions
 * SUMA, PROMEDIO, PRODUCTO, MIN, MAX, ABS, RAIZ(x), RAIZ(x; n), POTENCIA(x; n)
 * and REDONDEAR(x; decimales), also by their English names. Precedence follows
 * Excel: a sign binds first, then ^ (left to right), then * /, then + −.
 * So =(1345*235)^1/6 is the product divided by six; the sixth root is
 * =(1345*235)^(1/6) or =RAIZ(1345*235; 6).
 *
 * Arguments are separated with ";". A "," separates them too, except between
 * a digit and exactly three digits, where it is the thousands separator of a
 * number: =SUMA(A1,B2) adds two cells and =SUMA(1,234) is 1234.
 *
 * A formula may name other values: a cell by its position (B2), a range
 * (A1:A5), a cell of another table ([Tabla de homologación]!C3) and a concept
 * ([Superficie total de terreno]). This module only reads them; what they
 * point at is resolved in services/formula-references.ts. The numeric fields
 * of the calculation panels take plain arithmetic: a formula that names a
 * value has no result there.
 */

/** Zero-based position of a cell in its table as shown: column A row 1 is { column: 0, row: 0 }. */
export type CellPosition = { column: number; row: number };

export type FormulaFunctionName = "SUM" | "AVERAGE" | "PRODUCT" | "MIN" | "MAX" | "ABS" | "SQRT" | "POWER" | "ROUND";

/** A formula as written, before its references are resolved. */
export type FormulaSyntax =
  | { type: "number"; value: number }
  | { type: "unary"; operator: "-" | "%"; operand: FormulaSyntax }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: FormulaSyntax; right: FormulaSyntax }
  | { type: "call"; name: FormulaFunctionName; args: FormulaSyntax[] }
  | { type: "cell"; table?: string; position: CellPosition }
  | { type: "range"; table?: string; from: CellPosition; to: CellPosition }
  | { type: "name"; name: string };

/** Longest formula read; anything longer is not a formula someone typed. */
export const FORMULA_MAX_LENGTH = 2_000;
const MAX_DEPTH = 50;

/**
 * Rounds to `decimals` as written in decimal, halves away from zero:
 * 0.95 × 1.05 × 0.98 is 0.97755 and rounds to 0.9776, although the binary
 * number that stands for it falls just short of the half.
 */
export function roundDecimal(value: number, decimals: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(decimals)) return Number.NaN;
  // Beyond fifteen digits there are no decimals left to round.
  if (decimals >= 0 && Math.abs(value) >= 1e15) return value;
  // Fifteen significant digits are what a double holds exactly; the rest is noise of the arithmetic.
  const [mantissa, exponent = "0"] = Math.abs(value).toPrecision(15).split("e");
  const rounded = Math.round(Number(`${mantissa}e${Number(exponent) + decimals}`));
  return Math.sign(value) * Number(`${rounded}e${-decimals}`);
}

/** What each function computes from its numbers; NaN when the arguments do not fit. */
export const FORMULA_FUNCTIONS: Record<FormulaFunctionName, (args: number[]) => number> = {
  SUM: (args) => args.reduce((total, value) => total + value, 0),
  AVERAGE: (args) => (args.length ? args.reduce((total, value) => total + value, 0) / args.length : Number.NaN),
  PRODUCT: (args) => args.reduce((total, value) => total * value, 1),
  MIN: (args) => (args.length ? Math.min(...args) : Number.NaN),
  MAX: (args) => (args.length ? Math.max(...args) : Number.NaN),
  ABS: (args) => (args.length === 1 ? Math.abs(args[0]) : Number.NaN),
  SQRT: (args) => (args.length === 1 ? Math.sqrt(args[0]) : args.length === 2 ? args[0] ** (1 / args[1]) : Number.NaN),
  POWER: (args) => (args.length === 2 ? args[0] ** args[1] : Number.NaN),
  ROUND: (args) => (args.length === 2 ? roundDecimal(args[0], args[1]) : args.length === 1 ? roundDecimal(args[0], 0) : Number.NaN),
};

/** The names a function is written with; the first one is how a formula is shown back. */
export const FORMULA_FUNCTION_NAMES: Record<FormulaFunctionName, string[]> = {
  SUM: ["SUMA", "SUM"],
  AVERAGE: ["PROMEDIO", "AVERAGE"],
  PRODUCT: ["PRODUCTO", "PRODUCT"],
  MIN: ["MIN"],
  MAX: ["MAX"],
  ABS: ["ABS"],
  SQRT: ["RAIZ", "SQRT"],
  POWER: ["POTENCIA", "POWER"],
  ROUND: ["REDONDEAR", "ROUND"],
};

const FUNCTION_BY_NAME = new Map<string, FormulaFunctionName>(
  (Object.entries(FORMULA_FUNCTION_NAMES) as Array<[FormulaFunctionName, string[]]>).flatMap(([name, aliases]) =>
    aliases.map((alias): [string, FormulaFunctionName] => [alias, name])),
);

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "cell"; position: CellPosition }
  /** A name between brackets or quotes: a concept, or a table when "!" follows. */
  | { kind: "quoted"; value: string }
  | { kind: "symbol"; value: string };

const withoutAccents = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "A" → 0, "Z" → 25, "AA" → 26. */
function columnIndex(letters: string) {
  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function tokenize(source: string): Token[] | null {
  if (source.length > FORMULA_MAX_LENGTH) return null;
  const tokens: Token[] = [];
  const text = source.replace(/÷/g, "/");
  /** The last token closes an operand, so a name cannot follow it: an "x" there multiplies. */
  const afterOperand = () => {
    const last = tokens.at(-1);
    return Boolean(last && (last.kind === "number" || last.kind === "cell" || last.kind === "quoted" || (last.kind === "symbol" && (last.value === ")" || last.value === "%"))));
  };
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    // The currency sign is noise, and so are the anchors of $A$1.
    const skipped = /^[\s$]+/.exec(rest);
    if (skipped) {
      index += skipped[0].length;
      continue;
    }
    // Thousands separators belong to the number: "1,260,000.50".
    const number = /^(\d+(?:,\d{3})+(?!\d)(?:\.\d+)?|\d+\.?\d*|\.\d+)/.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0].replace(/,/g, "")) });
      index += number[0].length;
      continue;
    }
    if (rest[0] === "×" || (/^x/i.test(rest) && afterOperand())) {
      tokens.push({ kind: "symbol", value: "*" });
      index += 1;
      continue;
    }
    const cell = /^([A-Za-z]{1,3})\$?(\d{1,5})(?![\w(])/.exec(rest);
    if (cell && Number(cell[2]) > 0) {
      tokens.push({ kind: "cell", position: { column: columnIndex(cell[1]), row: Number(cell[2]) - 1 } });
      index += cell[0].length;
      continue;
    }
    const name = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]+/.exec(rest);
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      index += name[0].length;
      continue;
    }
    if (rest[0] === "[" || rest[0] === "'") {
      const end = rest.indexOf(rest[0] === "[" ? "]" : "'", 1);
      const value = end === -1 ? "" : rest.slice(1, end).trim();
      if (!value) return null;
      tokens.push({ kind: "quoted", value });
      index += end + 1;
      continue;
    }
    if (!"+-*/^%();,:!".includes(rest[0])) return null;
    tokens.push({ kind: "symbol", value: rest[0] });
    index += 1;
  }
  return tokens;
}

/** Reads a formula without its "=". Null when it is not a valid one. */
export function parseFormula(source: string): FormulaSyntax | null {
  const tokens = tokenize(source);
  if (!tokens?.length) return null;
  let position = 0;
  let depth = 0;
  const peek = (value: string) => { const token = tokens[position]; return token?.kind === "symbol" && token.value === value; };
  const take = (value: string) => { if (!peek(value)) return false; position += 1; return true; };
  const fail = (): never => { throw new SyntaxError("formula"); };
  /** Signs, parentheses and calls nest; a formula deeper than anyone writes is rejected. */
  const nested = <T,>(read: () => T): T => {
    if (++depth > MAX_DEPTH) fail();
    try {
      return read();
    } finally {
      depth -= 1;
    }
  };

  const expression = (): FormulaSyntax => {
    let left = term();
    for (;;) {
      if (take("+")) left = { type: "binary", operator: "+", left, right: term() };
      else if (take("-")) left = { type: "binary", operator: "-", left, right: term() };
      else return left;
    }
  };
  const term = (): FormulaSyntax => {
    let left = power();
    for (;;) {
      if (take("*")) left = { type: "binary", operator: "*", left, right: power() };
      else if (take("/")) left = { type: "binary", operator: "/", left, right: power() };
      else return left;
    }
  };
  const power = (): FormulaSyntax => {
    let left = unary();
    while (take("^")) left = { type: "binary", operator: "^", left, right: unary() };
    return left;
  };
  const unary = (): FormulaSyntax => {
    if (take("-")) return nested(() => ({ type: "unary", operator: "-", operand: unary() }));
    if (take("+")) return nested(unary);
    let value = primary();
    while (take("%")) value = { type: "unary", operator: "%", operand: value };
    return value;
  };
  /** B2 or A1:A5, of the formula's own table or of `table`. */
  const cells = (table?: string): FormulaSyntax => {
    const from = tokens[position];
    if (from?.kind !== "cell") return fail();
    position += 1;
    const qualifier = table === undefined ? {} : { table };
    if (!take(":")) return { type: "cell", ...qualifier, position: from.position };
    const to = tokens[position];
    if (to?.kind !== "cell") return fail();
    position += 1;
    return { type: "range", ...qualifier, from: from.position, to: to.position };
  };
  const primary = (): FormulaSyntax => {
    const token = tokens[position];
    if (!token) return fail();
    if (token.kind === "number") { position += 1; return { type: "number", value: token.value }; }
    if (token.kind === "cell") return cells();
    if (token.kind === "quoted") {
      position += 1;
      return take("!") ? cells(token.value) : { type: "name", name: token.value };
    }
    return nested(() => {
      if (token.kind === "name") {
        position += 1;
        // A table named with a single word needs no brackets: Homologación!C3.
        if (take("!")) return cells(token.value);
        const name = FUNCTION_BY_NAME.get(withoutAccents(token.value).toUpperCase());
        if (!name || !take("(")) return fail();
        const args = [expression()];
        while (take(";") || take(",")) args.push(expression());
        if (!take(")")) return fail();
        return { type: "call", name, args };
      }
      if (take("(")) {
        const value = expression();
        if (!take(")")) return fail();
        return value;
      }
      return fail();
    });
  };

  try {
    const parsed = expression();
    return position === tokens.length ? parsed : null;
  } catch {
    return null;
  }
}

/** The value of plain arithmetic; NaN when the formula names a cell or a concept. */
function computePlain(node: FormulaSyntax): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "unary":
      return node.operator === "-" ? -computePlain(node.operand) : computePlain(node.operand) / 100;
    case "binary": {
      const left = computePlain(node.left);
      const right = computePlain(node.right);
      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      if (node.operator === "/") return left / right;
      return left ** right;
    }
    case "call":
      return FORMULA_FUNCTIONS[node.name](node.args.map(computePlain));
    default:
      return Number.NaN;
  }
}

/** The value of a formula without its "=", or null when it is not a valid one. */
export function evaluateFormula(source: string): number | null {
  const parsed = parseFormula(source);
  if (!parsed) return null;
  const value = computePlain(parsed);
  return Number.isFinite(value) ? value : null;
}

/** "1,260,000.50", "$ 9000" or "=5*10000" → number; empty or invalid → null. */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("=")) return evaluateFormula(trimmed.slice(1));
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
