/**
 * Formulas typed in the numeric fields of the calculation panels: what the
 * panels keep of them, what the server accepts, and how the calculation
 * memory prints them.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  capturedFormulasSchema,
  collectFormulas,
  formulaOfText,
  givesValue,
  reconcileFormulas,
  renumberFormulas,
  valueAtPath,
  withFormulaTexts,
} from "../src/features/valuations/calculation/captured-formulas";
import { COST_PERCENT_FIELDS, DEFAULT_LAND, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { factorInputText, factorFormulaOf, parseFactorInput, withTypedComparableFactor } from "../src/features/valuations/calculation/factor-input";
import { INCOME_PERCENT_FIELDS } from "../src/features/valuations/calculation/income-types";
import { characteristicText, characteristicValueText, comparableFormulaValues, withCharacteristic, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import { buildCalculationMemory } from "../src/features/valuations/memory/calculation-memory";

test("a typed text is a formula when it starts with = and computes", () => {
  assert.equal(formulaOfText(" =1345*235 "), "=1345*235");
  assert.equal(formulaOfText("316075"), null);
  assert.equal(formulaOfText("=1/0"), null, "a formula without a result is not kept");
  assert.equal(formulaOfText("=[Superficie]"), null, "the panels take plain arithmetic");
});

test("a draft's formulas are collected at the path of the number they give, and read back into the draft", () => {
  const draft = { land: { unitValue: "=1345*235", subjectArea: "169.78" }, rows: [{ ref: "=T-1", completion: "=50+25" }] };
  const saved = { land: { unitValue: 316075, subjectArea: 169.78 }, rows: [{ ref: "=T-1", completion: 0.75 }] };
  const formulas = collectFormulas(draft, saved);
  assert.deepEqual(formulas, { "land.unitValue": "=1345*235", "rows.0.completion": "=50+25" }, "a text field is never a formula");
  const plain = { land: { unitValue: "316075", subjectArea: "169.78" }, rows: [{ ref: "T-1", completion: "75" }] };
  const read = withFormulaTexts(plain, formulas);
  assert.equal(read.land.unitValue, "=1345*235");
  assert.equal(read.rows[0].completion, "=50+25");
  assert.equal(plain.land.unitValue, "316075", "the draft given is not changed");
  assert.deepEqual(withFormulaTexts(plain, { "rows.3.completion": "=1" }), plain, "a path the draft does not have is left out");
  assert.equal(valueAtPath(saved, "rows.0.completion"), 0.75);
  assert.equal(valueAtPath(saved, "rows.x.completion"), undefined);
});

test("the server keeps a formula only when it gives the value sent with it", () => {
  const next = { land: { unitValue: 316075 }, constructions: [{ completion: 0.75 }] };
  const accepted = reconcileFormulas({
    next,
    sent: { "land.unitValue": "=1345*235", "constructions.0.completion": "=50+25" },
    previous: {},
    previousFormulas: {},
    percent: COST_PERCENT_FIELDS,
  });
  assert.deepEqual(accepted, { ok: true, formulas: { "land.unitValue": "=1345*235", "constructions.0.completion": "=50+25" } }, "a percentage gives its fraction");

  const wrong = reconcileFormulas({ next, sent: { "land.unitValue": "=1345*236" }, previous: {}, previousFormulas: {} });
  assert.equal(wrong.ok, false);
  assert.match(wrong.ok ? "" : wrong.message, /no da el valor capturado/);
  const nowhere = reconcileFormulas({ next, sent: { "land.missing": "=1" }, previous: {}, previousFormulas: {} });
  assert.equal(nowhere.ok, false, "a formula needs a numeric field");
  assert.ok(givesValue(100 / 3, 33.33), "the value as the database stored it, with two decimals");
  assert.ok(!givesValue(100 / 3, 33.3));
});

test("a client that sends no formulas keeps the stored ones of the values it did not change", () => {
  const previous = { land: { unitValue: 316075, subjectArea: 120 } };
  const previousFormulas = { "land.unitValue": "=1345*235", "land.subjectArea": "=100+20" };
  const result = reconcileFormulas({ next: { land: { unitValue: 316075, subjectArea: 150 } }, sent: undefined, previous, previousFormulas });
  assert.deepEqual(result, { ok: true, formulas: { "land.unitValue": "=1345*235" } }, "the changed value drops its formula");
  assert.deepEqual(reconcileFormulas({ next: previous, sent: {}, previous, previousFormulas }), { ok: true, formulas: {} }, "an empty map clears them");
});

test("rows that are not saved take their formulas with them; the rest follow their position", () => {
  assert.deepEqual(
    renumberFormulas({ "indirects.0.base": "=1", "indirects.2.base": "=2", "land.unitValue": "=3" }, "indirects", [0, 2]),
    { "indirects.0.base": "=1", "indirects.1.base": "=2", "land.unitValue": "=3" },
  );
  assert.deepEqual(renumberFormulas({ "indirects.1.base": "=1" }, "indirects", [0, 2]), {});
});

test("the formulas of a capture are paths to formulas, as the API takes them", () => {
  assert.ok(capturedFormulasSchema.safeParse({ "constructions.0.unitReplacementCost": "=1345*235", "factors.custom:vista": "=1/0.9" }).success);
  assert.ok(!capturedFormulasSchema.safeParse({ "land.unitValue": "1345" }).success, "a formula starts with =");
  assert.ok(!capturedFormulasSchema.safeParse({ "land..unitValue": "=1" }).success);
  assert.ok(INCOME_PERCENT_FIELDS("deductions.2.rate") && !INCOME_PERCENT_FIELDS("rentableUnits.0.area"));
});

test("a factor typed as a formula, and a numeric characteristic, keep the formula on the comparable", () => {
  const comparable = {
    area: 140, price: 1_260_000, frontage: null, depth: null, frontCount: null, extra: {},
    factors: [], formulas: {},
  } as unknown as ComparableDto;
  const input = parseFactorInput("=(140/169.78)^(1/6)");
  assert.equal(input.kind === "value" ? input.formula : null, "=(140/169.78)^(1/6)");
  const typed = withTypedComparableFactor(comparable, { type: "SUPERFICIE" }, input as Exclude<typeof input, { kind: "invalid" }>);
  assert.deepEqual(typed.formulas, { "factors.SUPERFICIE": "=(140/169.78)^(1/6)" });
  assert.equal(factorInputText(typed.factors[0], factorFormulaOf(typed, { type: "SUPERFICIE" })), "=(140/169.78)^(1/6)", "reads back as typed");
  const plain = withTypedComparableFactor(typed, { type: "SUPERFICIE" }, { kind: "value", value: 0.97 });
  assert.deepEqual(plain.formulas, {}, "a number typed over it drops the formula");

  const priced = withCharacteristic(typed, "price", "=1345*235*4", 1345 * 235 * 4);
  assert.equal(priced.price, 1_264_300);
  assert.equal(characteristicText(priced, "price"), "=1345*235*4");
  assert.equal(characteristicValueText(priced, "price"), "1264300");
  assert.deepEqual(comparableFormulaValues(priced).factors, { SUPERFICIE: (140 / 169.78) ** (1 / 6) });
  assert.equal(withCharacteristic(priced, "price", "1200000", 1_200_000).formulas?.price, undefined);
});

test("the calculation memory prints each value typed as a formula, with its formula and value, by row", () => {
  const cost: CostCalculationDto = {
    land: { ...DEFAULT_LAND, subjectArea: 169.78, unitValue: 9000 },
    types: [{ id: 7, ref: "T-1", description: "Casa", classification: "", quality: "", area: 120, age: 10, usefulLife: 60 }],
    constructions: [{
      id: 7, ref: "T-1", description: "Casa", classification: "", quality: "", area: 120, age: 10, usefulLife: 60,
      conservation: 1, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 0.75, undivided: 1, unitReplacementCost: 316075,
    }],
    installations: [],
    indirects: [],
    market: { adoptedUnitValue: 9000, subjectArea: 169.78, baseArea: null },
    configured: true,
    typesCaptured: true,
    locked: false,
    formulas: { "land.unitValue": "=4500*2", "constructions.0.unitReplacementCost": "=1345*235", "constructions.0.completion": "=50+25" },
    typeFormulas: { "types.0.area": "=100+20" },
  };
  const memory = buildCalculationMemory({
    sections: [],
    calculations: { markets: [], cost, income: null, machinery: null, conclusion: null },
    stored: [],
    folio: "VDA-0001",
    valuationDate: "2026-10-21",
    firmName: "Valuadores de los Altos",
    concluded: false,
    generatedAt: new Date("2026-10-21T12:00:00Z"),
  });
  const costs = memory.approaches.find((approach) => approach.key === "MOTOR.COSTOS");
  assert.deepEqual(costs?.captured, [
    { label: "Tipo T-1 · Superficie", formula: "=100+20", value: "120" },
    { label: "Terreno · Valor unitario", formula: "=4500*2", value: "9,000" },
    { label: "Construcción T-1 · Valor unitario de reposición nuevo", formula: "=1345*235", value: "316,075" },
    { label: "Construcción T-1 · Grado de terminación", formula: "=50+25", value: "75 %" },
  ]);
});
