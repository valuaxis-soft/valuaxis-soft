/**
 * Excel's ROUND: halves go away from zero, decided on the decimal digits of
 * the number (what Excel shows), not on its binary value. 8,575,000 rounded to
 * -4 gives 8,580,000, as in the Arandas dictamen.
 *
 * `digits` follows Excel: 2 keeps cents, -4 rounds to tens of thousands.
 */
export function excelRound(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const negative = value < 0;
  // Shortest decimal form that round-trips, e.g. "8.575e+6".
  const [mantissa, exponentText] = Math.abs(value).toExponential().split("e");
  const significant = mantissa.replace(".", "");
  const exponent = Number(exponentText);
  const kept = exponent + 1 + digits;
  if (kept < 0) return 0;
  if (kept >= significant.length) return value;

  const head = BigInt(kept === 0 ? 0 : significant.slice(0, kept));
  const rounded = Number(significant[kept]) >= 5 ? head + BigInt(1) : head;
  const result = Number(`${rounded}e${-digits}`);
  return negative ? -result : result;
}

/** Cents: the decimals a unit value is shown with. */
const AMOUNT_DIGITS = 2;

/**
 * A factor as it is shown, when the valuation calculates with the precision
 * shown (`EngineConfig.displayedPrecision`); as it is otherwise. Returns the
 * value and the trace field of its rounding.
 */
export function shownFactor(value: number, precision: { factors: number } | null): { value: number; rounding?: number } {
  return precision ? { value: excelRound(value, precision.factors), rounding: precision.factors } : { value };
}

/** A unit value as it is shown (cents), when the valuation calculates with the precision shown. */
export function shownAmount(value: number, precision: { factors: number } | null): { value: number; rounding?: number } {
  return precision ? { value: excelRound(value, AMOUNT_DIGITS), rounding: AMOUNT_DIGITS } : { value };
}

/** Rounds when a rounding is configured; `null` keeps the value as is. */
export function roundIfSet(value: number, digits: number | null): number {
  return digits === null ? value : excelRound(value, digits);
}
