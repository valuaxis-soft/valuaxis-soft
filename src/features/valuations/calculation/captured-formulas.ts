/**
 * Formulas typed in the numeric fields of the calculation panels ("=1345*235"),
 * kept next to the value they give so the field reads back as it was typed and
 * the calculation memory prints them. A capture keeps them in a map from the
 * field's path in what it saves ("land.unitValue", "constructions.0.completion")
 * to the formula with its "=". The value stays the number the engine uses.
 *
 * The server checks each formula it receives: it must give the value sent
 * with it (a percentage field gives the percentage, and stores its fraction).
 * It does not recompute the value from the formula: the value is what the
 * appraiser saw when he left the field, and a formula that disagrees with it
 * is a client error, rejected. A client that sends no formulas keeps the
 * stored ones of the fields whose value it did not change; the others are dropped.
 *
 * Pure TypeScript — no React, no database.
 */
import { z } from "zod";
import { FORMULA_MAX_LENGTH, evaluateFormula, parseDecimal, roundDecimal } from "./free-formula";

/** Path of a field → the formula typed in it, with its "=". */
export type CapturedFormulas = Record<string, string>;

/** Most formulas a capture keeps: far more than the fields of any panel. */
const MAX_FORMULAS = 2_000;
const PATH = /^[A-Za-z0-9_:-]+(\.[A-Za-z0-9_:-]+)*$/;

export const capturedFormulasSchema = z.record(
  z.string().max(200).regex(PATH, "Ruta de campo inválida."),
  z.string().trim().min(2).max(FORMULA_MAX_LENGTH).startsWith("=", "Una fórmula empieza con «=»."),
).refine((formulas) => Object.keys(formulas).length <= MAX_FORMULAS, "Demasiadas fórmulas.");

/** The formula of a typed text: what was typed when it starts with "=" and computes; null otherwise. */
export function formulaOfText(text: string | null | undefined): string | null {
  const typed = (text ?? "").trim();
  return typed.startsWith("=") && parseDecimal(typed) !== null ? typed : null;
}

/** The formulas a capture stored, without anything that is not one. */
export function storedFormulas(value: unknown): CapturedFormulas {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
    PATH.test(entry[0]) && typeof entry[1] === "string" && entry[1].trim().startsWith("=")));
}

/** What sits at `path` of a value: "constructions.0.completion" reads the first construction's completion. */
export function valueAtPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else {
      if (!Object.hasOwn(current, segment)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

const numberAt = (source: unknown, path: string) => {
  const value = valueAtPath(source, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Values the same up to the decimals a client rounds a percentage's fraction to. */
export function sameFormulaValue(left: number, right: number) {
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

/** Decimals the database keeps of the captured numbers (money 2, surfaces 4, factors and rates 8). */
const STORED_DECIMALS = [2, 4, 8];

/**
 * Whether `value` is what the formula gives: exactly, or as the database
 * stored it, with fewer decimals. A client that sends back a value it read
 * (33.33 for =100/3) keeps its formula.
 */
export function givesValue(result: number, value: number) {
  return sameFormulaValue(result, value) || STORED_DECIMALS.some((decimals) => sameFormulaValue(roundDecimal(result, decimals), value));
}

/** Which fields are typed as percentages and stored as fractions (75 typed, 0.75 stored). */
export type PercentFields = (path: string) => boolean;
const NO_PERCENT: PercentFields = () => false;

/** The value a field takes from its formula: the result, or its fraction for a percentage. */
export function formulaFieldValue(formula: string, path: string, percent: PercentFields = NO_PERCENT): number | null {
  const result = evaluateFormula(formula.trim().replace(/^=/, ""));
  if (result === null) return null;
  return percent(path) ? result / 100 : result;
}

export type FormulaReconciliation =
  | { ok: true; formulas: CapturedFormulas }
  | { ok: false; path: string; message: string };

/**
 * The formulas to store with `next`. With `sent` (the client keeps formulas),
 * each one must sit on a numeric field and give its value. Without it, the
 * stored formulas stay on the fields whose value did not change.
 */
export function reconcileFormulas(input: {
  next: unknown;
  sent: CapturedFormulas | undefined;
  previous: unknown;
  previousFormulas: CapturedFormulas;
  percent?: PercentFields;
}): FormulaReconciliation {
  const percent = input.percent ?? NO_PERCENT;
  if (input.sent === undefined) {
    const kept = Object.entries(input.previousFormulas).filter(([path]) => {
      const value = numberAt(input.next, path);
      const before = numberAt(input.previous, path);
      return value !== null && before !== null && sameFormulaValue(value, before);
    });
    return { ok: true, formulas: Object.fromEntries(kept) };
  }
  const formulas: CapturedFormulas = {};
  for (const [path, typed] of Object.entries(input.sent)) {
    const formula = typed.trim();
    const value = numberAt(input.next, path);
    if (value === null) return { ok: false, path, message: `La fórmula ${formula} no corresponde a un valor numérico capturado (${path}).` };
    const result = formulaFieldValue(formula, path, percent);
    if (result === null) return { ok: false, path, message: `La fórmula ${formula} no se puede calcular (${path}).` };
    if (!givesValue(result, value)) return { ok: false, path, message: `La fórmula ${formula} no da el valor capturado (${path}).` };
    formulas[path] = formula;
  }
  return { ok: true, formulas };
}

/* ------------------------------------------------------------------ */
/*  The panels' drafts                                                 */
/* ------------------------------------------------------------------ */

/**
 * The formulas of a draft edited as text: every text of `draft` that is a
 * formula, at the path where `saved` (what the draft saves) has a number.
 * Draft and saved value share their shape; a text field is never a formula.
 */
export function collectFormulas(draft: unknown, saved: unknown, prefix = ""): CapturedFormulas {
  const formulas: CapturedFormulas = {};
  const visit = (text: unknown, value: unknown, path: string) => {
    if (typeof value === "number") {
      const formula = typeof text === "string" ? formulaOfText(text) : null;
      if (formula && PATH.test(path)) formulas[path] = formula;
      return;
    }
    if (!value || typeof value !== "object" || !text || typeof text !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      visit((text as Record<string, unknown>)[key], child, path ? `${path}.${key}` : key);
    }
  };
  visit(draft, saved, prefix);
  return formulas;
}

/** The formulas of a list of fields given by their path and their text, as a panel whose draft has its own shape lists them. */
export function formulasOfFields(fields: Iterable<readonly [path: string, text: string]>): CapturedFormulas {
  const formulas: CapturedFormulas = {};
  for (const [path, text] of fields) {
    const formula = formulaOfText(text);
    if (formula) formulas[path] = formula;
  }
  return formulas;
}

/**
 * The draft with the stored formulas in place of the numbers they gave, so
 * a field reads back as it was typed. Only a text of the draft is replaced.
 */
export function withFormulaTexts<T>(draft: T, formulas: CapturedFormulas | undefined): T {
  if (!formulas || !Object.keys(formulas).length) return draft;
  const copy = structuredClone(draft);
  for (const [path, formula] of Object.entries(formulas)) {
    const segments = path.split(".");
    const last = segments.pop() as string;
    const parent = valueAtPath(copy, segments.join("."));
    const container = segments.length ? parent : copy;
    if (container && typeof container === "object" && typeof (container as Record<string, unknown>)[last] === "string") {
      (container as Record<string, unknown>)[last] = formula;
    }
  }
  return copy;
}

/** The text a field shows while it is edited: its formula when it has one. */
export const formulaOr = (formulas: CapturedFormulas | undefined, path: string, text: string) => formulas?.[path] ?? text;

/** The formulas of the rows kept, renumbered: rows 0 and 2 of three kept become 0 and 1. */
export function renumberFormulas(formulas: CapturedFormulas, list: string, kept: number[]): CapturedFormulas {
  const position = new Map(kept.map((index, next) => [index, next]));
  const pattern = new RegExp(`^${list.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)(\\..+)$`);
  return Object.fromEntries(Object.entries(formulas).flatMap(([path, formula]) => {
    const match = pattern.exec(path);
    if (!match) return [[path, formula]];
    const next = position.get(Number(match[1]));
    return next === undefined ? [] : [[`${list}.${next}${match[2]}`, formula]];
  }));
}
