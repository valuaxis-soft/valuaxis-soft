/**
 * Free calculations in a numeric field, as in a spreadsheet: a value that
 * starts with "=" is computed. Operators + − * / ^ and %, parentheses, and
 * RAIZ(x), RAIZ(x; n), POTENCIA(x; n), REDONDEAR(x; decimales). Precedence
 * follows Excel: a sign binds first, then ^ (left to right), then * /, then + −.
 * So =(1345*235)^1/6 is the product divided by six; the sixth root is
 * =(1345*235)^(1/6) or =RAIZ(1345*235; 6).
 */
const FUNCTIONS: Record<string, (args: number[]) => number> = {
  RAIZ: (args) => (args.length === 1 ? Math.sqrt(args[0]) : args.length === 2 ? args[0] ** (1 / args[1]) : Number.NaN),
  POTENCIA: (args) => (args.length === 2 ? args[0] ** args[1] : Number.NaN),
  REDONDEAR: (args) => (args.length === 2 ? Math.round(args[0] * 10 ** args[1]) / 10 ** args[1] : args.length === 1 ? Math.round(args[0]) : Number.NaN),
};
FUNCTIONS.SQRT = FUNCTIONS.RAIZ;
FUNCTIONS.POWER = FUNCTIONS.POTENCIA;
FUNCTIONS.ROUND = FUNCTIONS.REDONDEAR;

type Token = { kind: "number"; value: number } | { kind: "name"; value: string } | { kind: "symbol"; value: string };

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  // Thousands separators and the currency sign are noise; arguments are split with ";".
  const text = source.replace(/\$/g, "").replace(/(\d),(?=\d{3}(\D|$))/g, "$1").replace(/[×x](?=\s*[\d(.-])/gi, "*").replace(/÷/g, "/");
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) {
      index += space[0].length;
      continue;
    }
    const number = /^(\d+\.?\d*|\.\d+)/.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const name = /^[A-Za-zÁÉÍÓÚáéíóú]+/.exec(rest);
    if (name) {
      tokens.push({ kind: "name", value: name[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() });
      index += name[0].length;
      continue;
    }
    if (!"+-*/^%();".includes(rest[0])) return null;
    tokens.push({ kind: "symbol", value: rest[0] });
    index += 1;
  }
  return tokens;
}

/** The value of a formula without its "=", or null when it is not a valid one. */
export function evaluateFormula(source: string): number | null {
  const tokens = tokenize(source);
  if (!tokens?.length) return null;
  let position = 0;
  let depth = 0;
  const peek = (value: string) => { const token = tokens[position]; return token?.kind === "symbol" && token.value === value; };
  const take = (value: string) => { if (!peek(value)) return false; position += 1; return true; };
  const fail = () => { throw new SyntaxError("formula"); };

  const expression = (): number => {
    let value = term();
    for (;;) {
      if (take("+")) value += term();
      else if (take("-")) value -= term();
      else return value;
    }
  };
  const term = (): number => {
    let value = power();
    for (;;) {
      if (take("*")) value *= power();
      else if (take("/")) value /= power();
      else return value;
    }
  };
  const power = (): number => {
    let value = unary();
    while (take("^")) value **= unary();
    return value;
  };
  const unary = (): number => {
    if (take("-")) return -unary();
    if (take("+")) return unary();
    let value = primary();
    while (take("%")) value /= 100;
    return value;
  };
  const primary = (): number => {
    const token = tokens[position];
    if (!token) return fail();
    if (token.kind === "number") { position += 1; return token.value; }
    if (++depth > 50) return fail();
    try {
      if (token.kind === "name") {
        const fn = FUNCTIONS[token.value];
        position += 1;
        if (!fn || !take("(")) return fail();
        const args = [expression()];
        while (take(";")) args.push(expression());
        if (!take(")")) return fail();
        return fn(args);
      }
      if (take("(")) {
        const value = expression();
        if (!take(")")) return fail();
        return value;
      }
      return fail();
    } finally {
      depth -= 1;
    }
  };

  try {
    const value = expression();
    return position === tokens.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
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
