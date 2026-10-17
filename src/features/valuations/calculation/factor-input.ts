/**
 * A homologation factor typed in a cell of the homologation table, as the
 * appraiser writes it in his Excel: a number (0.95), a formula (=0.9/1.05,
 * =(1345*235)^(1/6)) or nothing. "=subject/comparable" keeps both ratings, so
 * the cell reads back as it was typed.
 *
 * Pure TypeScript — no React, no side effects.
 */
import { parseDecimal } from "./free-formula";
import { factorKey, type ComparableFactorDto } from "./market-types";

const NUMBER = String.raw`\d*\.?\d+`;
const RATINGS = new RegExp(String.raw`^=\s*(${NUMBER})\s*/\s*(${NUMBER})\s*$`);

export type FactorInput =
  | { kind: "empty" }
  | { kind: "ratings"; subjectRating: number; comparableRating: number }
  | { kind: "value"; value: number }
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
  return value !== null && Number.isFinite(value) && value >= 0 ? { kind: "value", value } : { kind: "invalid" };
}

/** What the cell shows while it is edited: the ratings as typed, the value, or nothing. */
export function factorInputText(factor: Pick<ComparableFactorDto, "value" | "subjectRating" | "comparableRating"> | undefined): string {
  if (!factor) return "";
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
