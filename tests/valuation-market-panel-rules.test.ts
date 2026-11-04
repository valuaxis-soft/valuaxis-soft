import assert from "node:assert/strict";
import { test } from "node:test";
import { marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import {
  defaultMarketSettings,
  duplicateCharacteristicLabel,
  homologatesOf,
  nextCharacteristicLabel,
  printedCharacteristicFields,
  printsHomologationTable,
  toMarketEngineInput,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { changedComparables } from "../src/features/valuations/components/calculation/market-calculation-panel";
import { characteristicNumberText } from "../src/features/valuations/components/calculation/market-characteristics-table";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { sampleSizeRecommendation } from "../src/features/valuations/engine/regression";
import type { TableContent } from "../src/features/valuations/model";
import { ensureTableV2 } from "../src/features/valuations/services/table";

function comparable(reference: number, area: number, price: number, negotiation = 0.95): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: "Regular", zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: [{ type: "NEGOCIACION", value: negotiation, subjectRating: null, comparableRating: null, justification: null }],
  };
}

const calculation: MarketCalculationDto = {
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 180, surfacePower: 6 },
  comparables: [comparable(1, 180, 1_800_000), comparable(2, 220, 2_200_000), comparable(3, 250, 2_400_000), comparable(4, 200, 1_950_000)],
  locked: false,
};

test("a new characteristic is numbered after the ones there are, and a repeated name is told", () => {
  assert.equal(nextCharacteristicLabel([{ label: "FORMA" }]), "Nueva característica");
  assert.equal(nextCharacteristicLabel([{ label: "Nueva característica" }]), "Nueva característica 2");
  assert.equal(nextCharacteristicLabel([{ label: "nueva característica" }, { label: "Nueva característica 2" }]), "Nueva característica 3");
  const fields = [{ key: "shape", label: "FORMA" }, { key: "custom:a", label: "Vista" }];
  assert.equal(duplicateCharacteristicLabel(fields, "forma", 1)?.key, "shape");
  assert.equal(duplicateCharacteristicLabel(fields, "FORMA", 0), null, "a field is not a duplicate of itself");
  assert.equal(duplicateCharacteristicLabel(fields, "Frente", 1), null);
});

test("up to thirty characteristics, hidden ones kept but not printed", () => {
  const many = Array.from({ length: 31 }, (_, index) => ({ key: `custom:f${index}`, label: `Campo ${index}` }));
  const settings = { ...defaultMarketSettings("TERRENO_VENTA"), characteristicFields: many };
  assert.equal(marketSettingsSchema.safeParse(settings).success, false, "thirty-one is one too many");
  assert.equal(marketSettingsSchema.safeParse({ ...settings, characteristicFields: many.slice(0, 30) }).success, true);
  const parsed = marketSettingsSchema.safeParse({ ...settings, characteristicFields: [{ key: "shape", label: "FORMA", hidden: true }, { key: "area", label: "SUPERFICIE" }] });
  assert.ok(parsed.success && parsed.data.characteristicFields?.[0].hidden === true, "hidden is kept");
  assert.deepEqual(printedCharacteristicFields([{ key: "shape", label: "FORMA", hidden: true }, { key: "area", label: "SUPERFICIE" }]).map((field) => field.key), ["area"]);
  const hidden: MarketCalculationDto = {
    ...calculation,
    settings: { ...calculation.settings, characteristicFields: [{ key: "shape", label: "FORMA", hidden: true }, { key: "area", label: "SUPERFICIE" }] },
  };
  const [block] = marketDocumentBlocks(hidden, null);
  const table = ensureTableV2(block.apartados[0].tables[0] as TableContent);
  const line = Object.values(table.rows[0].cells).map((cell) => (cell?.kind === "value" ? cell.value : "")).join(" | ");
  assert.match(line, /SUPERFICIE: 180\.00 m²/);
  assert.doesNotMatch(line, /FORMA/, "a hidden characteristic prints nothing; its value stays with the comparable");
  assert.equal(hidden.comparables[0].shape, "Regular");
});

test("the document's number format in the capture: separator or not", () => {
  assert.equal(characteristicNumberText("1800000", true), "1,800,000");
  assert.equal(characteristicNumberText("1800000", false), "1800000");
  assert.equal(characteristicNumberText("1,800,000.5", false), "1800000.5");
  assert.equal(characteristicNumberText("Regular", true), "Regular");
  assert.equal(characteristicNumberText("", true), "");
});

test("«Homologar» off: no factor applies, the statistics are those of the offers, the ±30 % range stays and the table does not print", () => {
  const off: MarketCalculationDto = { ...calculation, settings: { ...calculation.settings, homologate: false } };
  assert.equal(homologatesOf(calculation.settings), true);
  assert.equal(homologatesOf(off.settings), false);
  assert.equal(printsHomologationTable(off.settings), false);
  assert.equal(printsHomologationTable({ homologate: true, showHomologationTable: false }), false);
  const input = toMarketEngineInput(off);
  assert.ok(input.ok);
  assert.deepEqual(input.input.comparables.map((row) => row.factors), [[], [], [], []]);
  assert.deepEqual(input.input.comparables.map((row) => row.surfaceFactor), [1, 1, 1, 1]);
  const result = computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
  const offers = off.comparables.map((row) => (row.price as number) / (row.area as number));
  assert.deepEqual(result.homologation.comparables.map((row) => row.homologatedUnitValue), offers);
  assert.ok(Math.abs(result.homologation.stats.mean - offers.reduce((a, b) => a + b, 0) / 4) < 1e-9);
  assert.ok(result.adoptedLimits.min < result.homologation.stats.mean && result.adoptedLimits.max > result.homologation.stats.mean);
  // Typed outside ±30 % it is still refused.
  const outside = toMarketEngineInput({ ...off, settings: { ...off.settings, adoptedUnitValue: 20_000 } });
  assert.ok(outside.ok);
  assert.equal(computeMarketApproach(outside.input, DEFAULT_ENGINE_CONFIG).adoptedOutsideLimits, true);
  // With homologation the negotiation factor applies.
  const on = toMarketEngineInput(calculation);
  assert.ok(on.ok);
  assert.ok(Math.abs(computeMarketApproach(on.input, DEFAULT_ENGINE_CONFIG).homologation.comparables[0].homologatedUnitValue - offers[0] * 0.95) < 1e-6);
  // The dictamen: the offers table carries the boxes, no homologation apartado.
  const [block] = marketDocumentBlocks(off, result);
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES (TERRENOS)"]);
  assert.equal(marketSettingsSchema.safeParse({ ...off.settings, factorSlots: off.settings.factorSlots }).success, true);
});

test("the undo snapshot restores the comparables whose capture changed, by id", () => {
  const current = calculation.comparables;
  const before = [comparable(1, 180, 1_800_000, 0.9), comparable(2, 220, 2_200_000), { ...comparable(3, 250, 2_400_000), shape: "Irregular" }, comparable(9, 1, 1)];
  const changed = changedComparables(current, before);
  assert.deepEqual(changed.map((row) => row.id), ["c-1", "c-3"], "a removed comparable (9) is not restored; untouched ones are not sent again");
  assert.equal(changed[0].factors[0].value, 0.9);
  assert.equal(changed[1].shape, "Irregular");
  assert.deepEqual(changedComparables(current, current), []);
});

test("the recommendation of ten to twenty comparables per criterion, never blocking", () => {
  assert.equal(sampleSizeRecommendation(30, 3), null);
  assert.equal(sampleSizeRecommendation(10, 1), null);
  assert.equal(sampleSizeRecommendation(0, 0), null);
  const advice = sampleSizeRecommendation(14, 3);
  assert.ok(advice?.startsWith("Recomendación: de 10 a 20 comparables por criterio"));
  assert.match(advice as string, /con 14 comparables conviene usar hasta 1 criterio/);
  assert.match(advice as string, /con 3 criterios convienen al menos 30 comparables \(hay 14\)/);
  assert.match(advice as string, /El cálculo se hace de todos modos\./);
  assert.match(sampleSizeRecommendation(5, 2) as string, /no alcanza ni para un criterio/);
});
