/**
 * FAL-14 of the audit of week 8: the machinery valuation printed its physical
 * value as $1,987,000.00 in Costos («A miles») and $1,990,000.00 in the
 * conclusion, rounded a second time to tens of thousands. One figure per
 * value across the dictamen: the summary lists the cost and market values as
 * their approach rounded them; only the concluded value takes the
 * conclusion's rounding, and income, which has no rounding of its own.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ENGINE_CONFIG, EXCEL_PROFILES, withRounding } from "../src/features/valuations/engine/config";
import { concludeValue } from "../src/features/valuations/engine/conclusion";

test("machinery: the physical value of Costos is the one the summary lists; the market concludes", () => {
  const result = concludeValue(
    { values: { costos: 1_987_000, mercado: 1_040_000, ingresos: null }, method: { kind: "single", approach: "mercado" } },
    DEFAULT_ENGINE_CONFIG,
  );
  assert.deepEqual(result.summary, { costos: 1_987_000, mercado: 1_040_000, ingresos: null });
  assert.equal(result.value, 1_040_000);
});

test("a house: market and costs as their approach printed them, income and the concluded value with the conclusion's rounding", () => {
  const result = concludeValue(
    { values: { costos: 8_010_000, mercado: 7_390_400, ingresos: 3_148_754.45 }, method: { kind: "single", approach: "mercado" } },
    DEFAULT_ENGINE_CONFIG,
  );
  assert.deepEqual(result.summary, { costos: 8_010_000, mercado: 7_390_400, ingresos: 3_150_000 });
  assert.equal(result.value, 7_390_000, "the conclusion «A decenas de miles», the appraiser's choice");
  const unrounded = concludeValue(
    { values: { costos: 8_010_000, mercado: 7_390_400, ingresos: null }, method: { kind: "single", approach: "mercado" } },
    withRounding(DEFAULT_ENGINE_CONFIG, { conclusion: null }),
  );
  assert.equal(unrounded.value, 7_390_400, "without a rounding of the conclusion, the market value itself");
  assert.equal(withRounding(DEFAULT_ENGINE_CONFIG, { conclusion: -3 }).rounding.summaryRoundsApproaches, false, "the appraiser's roundings keep the rule");
});

test("the books keep rounding each approach in the summary, as the MEH sheet (933,000 → 930,000)", () => {
  const result = concludeValue(
    { values: { costos: 933_000, mercado: 980_000, ingresos: null }, method: { kind: "single", approach: "costos" } },
    EXCEL_PROFILES.ARANDAS,
  );
  assert.equal(result.summary.costos, 930_000);
  assert.equal(result.value, 930_000);
});
