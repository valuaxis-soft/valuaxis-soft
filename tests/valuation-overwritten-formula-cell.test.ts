/**
 * Video 7.4 (V7.4-20 and V7.4-16): a homologation cell held «=1/1.1»; typing
 * 1.16 over it without "=" showed 1.16 but nothing was saved, so the FRe kept
 * using 0.909 (0.95 × 0.909 × 1.16 = 1.00 where the appraiser's Excel gives
 * 1.10). The number typed over a formula is the formula field's draft: it is
 * what leaving the cell applies, and the factor stored is that number.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { factorInputText, factorFormulaOf, parseFactorInput, withTypedComparableFactor } from "../src/features/valuations/calculation/factor-input";
import { marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { appliedFormulaDraft, typedFormulaDraft } from "../src/features/valuations/components/editor/formula-editing";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { ensureTableV2 } from "../src/features/valuations/services/table";

/** Focusing a cell that holds a formula shows it as the draft (useFormulaField.onFocus). */
const focused = (stored: string) => ({ text: stored, initial: stored });

test("V7.4-20: a number typed without «=» over a formula is what leaving the cell applies", () => {
  const draft = typedFormulaDraft(focused("=1/1.1"), "1.16", null);
  assert.deepEqual(draft, { text: "1.16", initial: "=1/1.1" }, "the field keeps the number, not the formula");
  assert.equal(appliedFormulaDraft(draft), "1.16");
  // Typed over the formula's result, without entering it first, the same.
  assert.equal(appliedFormulaDraft(typedFormulaDraft(null, "1.06", "=1/1.1")), "1.06");
  // With "=" it is still a formula.
  assert.equal(appliedFormulaDraft(typedFormulaDraft(focused("=1/1.1"), "=1/1.2", null)), "=1/1.2");
  // Left as it was, nothing is sent; a lone "=" neither.
  assert.equal(appliedFormulaDraft(focused("=1/1.1")), null);
  assert.equal(appliedFormulaDraft(typedFormulaDraft(focused("=1/1.1"), "=", null)), null);
  // A cell that never held a formula types as a plain value: the field does not take it.
  assert.equal(typedFormulaDraft(null, "1.16", null), null);
});

function comparable(reference: number, factors: ComparableDto["factors"]): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable inventado ${reference}`, area: 200, price: 2_000_000,
    landUse: null, shape: "Regular", zone: null, frontage: 10, depth: 20, topography: null, services: "Completos", notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors,
  };
}

const negotiation = { type: "NEGOCIACION" as const, value: 0.95, subjectRating: null, comparableRating: null, justification: null };
const ubicacion = { type: "UBICACION" as const };

/** A comparable of the same surface as the subject (Sup. 1): its FRe is 0.95 × Ubic. */
function marketWith(text: string): MarketCalculationDto {
  const input = parseFactorInput(text);
  assert.notEqual(input.kind, "invalid");
  const base = comparable(3, [negotiation]);
  return {
    settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200, surfacePower: 6, adoptedUnitValue: 10_000, rounding: -2 },
    comparables: [input.kind === "invalid" ? base : withTypedComparableFactor(base, ubicacion, input)],
    locked: false,
  };
}

function homologated(target: MarketCalculationDto) {
  const input = toMarketEngineInput(target);
  assert.ok(input.ok);
  return computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG).homologation.comparables[0];
}

test("V7.4-20: 0.95 × 1.16 typed over «=1/1.1» is the FRe 1.10 of the appraiser's Excel, and 0.95 × 1.06 is 1.01", () => {
  const formula = marketWith("=1/1.1");
  assert.equal(homologated(formula).resultantFactor.toFixed(2), "0.86");

  // What the cell applies now: the number typed over the formula.
  const overwritten = (typed: string) => {
    const applied = appliedFormulaDraft(typedFormulaDraft(focused(factorInputText(formula.comparables[0].factors[1])), typed, null));
    assert.equal(applied, typed);
    return marketWith(applied ?? "");
  };
  const with116 = overwritten("1.16");
  const factor = with116.comparables[0].factors.find((item) => item.type === "UBICACION");
  assert.deepEqual(factor, { type: "UBICACION", value: 1.16, subjectRating: null, comparableRating: null, justification: null }, "the number is stored, not the ratings");
  assert.equal(factorFormulaOf(with116.comparables[0], ubicacion), undefined);
  assert.equal(factorInputText(factor), "1.16", "editing the cell again shows the number, not the old formula");
  const row = homologated(with116);
  assert.equal(row.resultantFactor.toFixed(2), "1.10");
  assert.notEqual(row.resultantFactor.toFixed(2), (0.95 * (1 / 1.1) * 1.16).toFixed(2), "not the 1.00 of the video");
  assert.ok(Math.abs(row.homologatedUnitValue - 11_020) < 1e-6, `homologado ${row.homologatedUnitValue}`);

  assert.equal(homologated(overwritten("1.06")).resultantFactor.toFixed(2), "1.01");
  assert.notEqual(homologated(overwritten("1.06")).resultantFactor.toFixed(2), "0.92", "not the 0.92 of the video");
});

/** The comparable's row of the printed homologation, by column name. */
function printedRow(target: MarketCalculationDto) {
  const input = toMarketEngineInput(target);
  assert.ok(input.ok);
  const table = ensureTableV2(marketDocumentBlocks(target, computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG))[0].apartados[1].tables[0]);
  return Object.fromEntries(table.columns.map((column) => {
    const cell = table.rows[0].cells[column.id];
    return [column.name, cell?.kind === "value" ? cell.value : ""];
  }));
}

test("V7.4-16: the number typed prints with the column's two decimals in the preview's homologation", () => {
  assert.equal(printedRow(marketWith("1"))["Ubic."], "1.00");
  assert.equal(printedRow(marketWith("1"))["FRe"], "0.95");
  assert.equal(printedRow(marketWith("1.16"))["Ubic."], "1.16");
  assert.equal(printedRow(marketWith("1.16"))["FRe"], "1.10");
});
