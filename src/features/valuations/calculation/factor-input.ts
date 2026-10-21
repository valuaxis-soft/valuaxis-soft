/**
 * A homologation factor typed in a cell of the homologation table, as the
 * appraiser writes it in his Excel: a number (0.95), a formula (=0.9/1.05,
 * =(1345*235)^(1/6)) or nothing. "=subject/comparable" keeps both ratings, so
 * the cell reads back as it was typed.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { formulaOfText, type CapturedFormulas } from "./captured-formulas";
import { parseDecimal } from "./free-formula";
import { factorFormulaPath, factorKey, type ComparableDto, type ComparableFactorDto } from "./market-types";

const NUMBER = String.raw`\d*\.?\d+`;
const RATINGS = new RegExp(String.raw`^=\s*(${NUMBER})\s*/\s*(${NUMBER})\s*$`);

export type FactorInput =
  | { kind: "empty" }
  | { kind: "ratings"; subjectRating: number; comparableRating: number }
  /** `formula`: what was typed when it is a formula other than the ratings ("=(140/169.78)^(1/6)"). */
  | { kind: "value"; value: number; formula?: string }
  | { kind: "invalid" };

export function parseFactorInput(text: string): FactorInput {
  const typed = text.trim();
  if (!typed) return { kind: "empty" };
  const ratings = typed.match(RATINGS);
  if (ratings) {
    const subjectRating = Number(ratings[1]);
    const comparableRating = Number(ratings[2]);
    if (subjectRating > 0 && comparableRating > 0) return { kind: "ratings", subjectRating, comparableRating };
  }
  const value = parseDecimal(typed);
  if (value === null || !Number.isFinite(value) || value < 0) return { kind: "invalid" };
  const formula = formulaOfText(typed);
  return formula ? { kind: "value", value, formula } : { kind: "value", value };
}

/** What the cell shows while it is edited: the ratings as typed, the formula typed, the value, or nothing. */
export function factorInputText(
  factor: Pick<ComparableFactorDto, "value" | "subjectRating" | "comparableRating"> | undefined,
  formula?: string,
): string {
  if (!factor) return "";
  if (formula) return formula;
  if (factor.subjectRating && factor.comparableRating) return `=${factor.subjectRating}/${factor.comparableRating}`;
  return factor.value === null ? "" : String(factor.value);
}

/**
 * The comparable's factors with `factor` (by its key) set from what was typed,
 * or removed when the cell was emptied: an empty factor is 1, as before. The
 * justification already written for it stays.
 */
export function withTypedFactor(
  factors: ComparableFactorDto[],
  factor: Pick<ComparableFactorDto, "type" | "key">,
  input: Exclude<FactorInput, { kind: "invalid" }>,
): ComparableFactorDto[] {
  const sameFactor = (item: ComparableFactorDto) => factorKey(item) === factorKey(factor);
  const current = factors.find(sameFactor);
  const others = factors.filter((item) => !sameFactor(item));
  if (input.kind === "empty") return others;
  const base = { type: factor.type, ...(factor.key ? { key: factor.key } : {}), justification: current?.justification ?? null };
  return [
    ...others,
    input.kind === "ratings"
      ? { ...base, value: input.subjectRating / input.comparableRating, subjectRating: input.subjectRating, comparableRating: input.comparableRating }
      : { ...base, value: input.value, subjectRating: null, comparableRating: null },
  ];
}

/** The formula a comparable keeps for a factor typed as one; undefined otherwise. */
export const factorFormulaOf = (comparable: Pick<ComparableDto, "formulas">, factor: Pick<ComparableFactorDto, "type" | "key">) =>
  comparable.formulas?.[factorFormulaPath(factor)];

/** The comparable's formulas with the one of `factor` set (or removed when it has none). */
export function withFactorFormula(formulas: CapturedFormulas | undefined, factor: Pick<ComparableFactorDto, "type" | "key">, formula?: string) {
  const path = factorFormulaPath(factor);
  const { [path]: _replaced, ...others } = formulas ?? {};
  return formula ? { ...others, [path]: formula } : others;
}

/** The comparable with `factor` typed: its factors and, when it was a formula, the formula kept to read back. */
export function withTypedComparableFactor<T extends Pick<ComparableDto, "factors" | "formulas">>(
  comparable: T,
  factor: Pick<ComparableFactorDto, "type" | "key">,
  input: Exclude<FactorInput, { kind: "invalid" }>,
): T {
  return {
    ...comparable,
    factors: withTypedFactor(comparable.factors, factor, input),
    formulas: withFactorFormula(comparable.formulas, factor, input.kind === "value" ? input.formula : undefined),
  };
}
