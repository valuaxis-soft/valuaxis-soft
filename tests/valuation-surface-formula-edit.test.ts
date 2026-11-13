/**
 * Video 6.2, 02:36 (V6.2-05): the surface factor the homologation computes
 * shows its formula, with its numbers, while its cell is edited, instead of
 * an empty cell; a factor the appraiser wrote shows what he wrote.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecimal } from "../src/features/valuations/calculation/free-formula";
import {
  defaultMarketSettings,
  marketEngineConfig,
  surfaceFactorFormulas,
  toMarketEngineInput,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { computeMarketApproach } from "../src/features/valuations/engine/market";

function comparable(reference: number, area: number, surfaceFactor?: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Lote inventado ${reference}`, area, price: area * 1000,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    extra: {}, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: surfaceFactor === undefined ? [] : [{ type: "SUPERFICIE", value: surfaceFactor, subjectRating: null, comparableRating: null }] as ComparableDto["factors"],
  };
}

test("the computed surface factor is written as its formula with the numbers the calculation uses", () => {
  const market: Pick<MarketCalculationDto, "settings" | "comparables"> = {
    settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 360, surfacePower: 3 },
    comparables: [comparable(1, 408), comparable(2, 300, 0.97)],
  };
  const formulas = surfaceFactorFormulas(market);
  assert.equal(formulas.get("2"), undefined, "a factor written by the appraiser shows what he wrote");
  const formula = formulas.get("1") ?? "";
  assert.ok(formula.startsWith("=("), formula);
  assert.match(formula, /\^\(1\/3\)$/);
  // The formula gives the factor the homologation computes.
  const input = toMarketEngineInput(market);
  assert.ok(input.ok);
  const computed = computeMarketApproach(input.input, marketEngineConfig(market.settings)).homologation.comparables.find((row) => row.id === "1");
  assert.ok(computed);
  assert.ok(Math.abs((parseDecimal(formula) ?? 0) - computed.surfaceFactor) < 0.005, `${formula} vs ${computed.surfaceFactor}`);
});
