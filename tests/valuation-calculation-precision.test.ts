import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_PRECISION,
  NEW_VALUATION_PRECISION,
  precisionOf,
  withPrecision,
} from "../src/features/valuations/calculation/calculation-precision";
import {
  additionalAmountOf,
  defaultMarketSettings,
  marketEngineConfig,
  printsAdditionalAmount,
  toMarketEngineInput,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { SURFACE_SLOT } from "../src/features/valuations/engine/factors";
import { computeMarketApproach } from "../src/features/valuations/engine/market";

// The appraiser's case: a unit value of 14,361.99 and a factor shown 0.97 that is 1 / 1.0328 = 0.96824…
const comparable = { id: "1", price: 14_361.99 * 200, area: 200, factors: [{ key: "zona", label: "Zona", subjectRating: 1, comparableRating: 1.0328 }, SURFACE_SLOT] };
const input = { subjectArea: 200, surfacePower: 3, comparables: [comparable] };

test("calculating with the precision shown: the printed figures multiply to the printed result", () => {
  const shown = computeMarketApproach(input, withPrecision(DEFAULT_ENGINE_CONFIG, NEW_VALUATION_PRECISION)).homologation.comparables[0];
  assert.equal(shown.unitValue, 14_361.99);
  assert.equal(shown.resultantFactor, 0.97);
  assert.equal(shown.homologatedUnitValue, 13_931.13, "14,361.99 × 0.97");

  // As before: shown 0.97 but multiplied by every decimal.
  const full = computeMarketApproach(input, withPrecision(DEFAULT_ENGINE_CONFIG, LEGACY_PRECISION)).homologation.comparables[0];
  assert.ok(Math.abs(full.resultantFactor - 1 / 1.0328) < 1e-12);
  assert.ok(Math.abs(full.homologatedUnitValue - 14_361.99 / 1.0328) < 1e-6);

  // Four decimals shown, four used.
  const four = computeMarketApproach(input, withPrecision(DEFAULT_ENGINE_CONFIG, { decimals: 4, calculateWithShown: true })).homologation.comparables[0];
  assert.equal(four.resultantFactor, 0.9682);
  assert.equal(four.homologatedUnitValue, 13_905.28);
});

test("a valuation of before keeps its behavior; one stored unreadable is too", () => {
  assert.deepEqual(precisionOf(null), LEGACY_PRECISION);
  assert.deepEqual(precisionOf({ decimals: 3, calculateWithShown: true }), LEGACY_PRECISION);
  assert.deepEqual(precisionOf({ decimals: 4, calculateWithShown: false }), { decimals: 4, calculateWithShown: false });
  assert.equal(withPrecision(DEFAULT_ENGINE_CONFIG, undefined).displayedPrecision, null);
  assert.deepEqual(marketEngineConfig({}, NEW_VALUATION_PRECISION).displayedPrecision, { factors: 2 });
});

test("the cost approach rounds conservation, age and resultant factors as they are shown", () => {
  const construction = { ref: "T-1", area: 100, age: 10, usefulLife: 60, conservation: 0.987, unitReplacementCost: 10_000 };
  const config = withPrecision(DEFAULT_ENGINE_CONFIG, NEW_VALUATION_PRECISION);
  const result = computeCostApproach({ constructions: [construction] }, { ...config, rounding: { ...config.rounding, costs: { ...config.rounding.costs, constructions: null } } });
  // Edad 1 − (10/60)^1.4 = 0.9188… → 0.92; Cons. 0.987 → 0.99; FRe 0.99 × 0.92 = 0.9108 → 0.91.
  assert.equal(result.constructions, 0.91 * 10_000 * 100);

  // The factors added after "Otro" are rounded as shown too, and so is the FRe they give: 0.99 × 0.92 × 0.95 = 0.86526 → 0.87.
  const withExtras = computeCostApproach(
    { constructions: [{ ...construction, extraFactors: [0.954] }] },
    { ...config, rounding: { ...config.rounding, costs: { ...config.rounding.costs, constructions: null } } },
  );
  assert.equal(withExtras.constructions, 0.87 * 10_000 * 100);
});

test("dispersion before and after homologating, and the lowest and highest offer", () => {
  const two = { ...input, comparables: [comparable, { id: "2", price: 10_000 * 250, area: 250, factors: [SURFACE_SLOT] }] };
  const { stats } = computeMarketApproach(two, DEFAULT_ENGINE_CONFIG).homologation;
  assert.equal(stats.offerMin, 10_000);
  assert.ok(Math.abs(stats.offerMax - 14_361.99) < 1e-9);
  assert.ok(Math.abs(stats.initialDispersion - 1.436199) < 1e-9);
  assert.ok(Math.abs(stats.dispersion - stats.max / stats.min) < 1e-12);
});

test("the additional amount: out of the calculation it adds nothing and does not print; it prints only when marked", () => {
  const settings = { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 100, additionalAmount: 50_000 };
  const offer: ComparableDto = {
    id: "c", reference: 1, location: "Juárez 12", area: 100, price: 1_000_000, landUse: null, shape: null, zone: null, frontage: null,
    depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null,
    offerDate: null, photos: [], factors: [],
  };
  const value = (next: MarketCalculationDto["settings"]) => {
    const engine = toMarketEngineInput({ settings: next, comparables: [offer] });
    assert.ok(engine.ok);
    return computeMarketApproach(engine.input, marketEngineConfig(next)).value;
  };
  assert.equal(value(settings), 1_050_000);
  assert.equal(printsAdditionalAmount(settings), true, "a capture of before with an amount prints it");
  assert.equal(printsAdditionalAmount({ ...settings, additionalAmount: 0 }), false, "nothing to print: no line of «$ -»");
  assert.equal(printsAdditionalAmount({ ...settings, showAdditionalAmount: false }), false);
  const out = { ...settings, additionalAmountInCalculation: false, showAdditionalAmount: true };
  assert.equal(additionalAmountOf(out), 0);
  assert.equal(value(out), 1_000_000);
  assert.equal(printsAdditionalAmount(out), false, "unmarking «cálculo» unmarks «mostrar en dictamen»");
});
