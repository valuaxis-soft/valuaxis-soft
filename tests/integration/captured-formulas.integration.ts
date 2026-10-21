/**
 * Formulas typed in the numeric fields of the calculation panels, on the
 * local database: saved with their values, read back, kept by clients that
 * do not send them while the value stays, checked by the server, and printed
 * by the calculation memory. And a construction type renamed by its row id
 * keeps the cost captured for it.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getConclusionCalculation, saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { getConstructionTypes, saveConstructionTypes } from "../../src/features/valuations/calculation/construction-types.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, emptyConstructionCost, type CostInputDto } from "../../src/features/valuations/calculation/cost-types";
import { getIncomeCalculation, saveIncomeCalculation } from "../../src/features/valuations/calculation/income.service";
import { DEFAULT_INCOME } from "../../src/features/valuations/calculation/income-types";
import { getMachineryCalculation, saveMachineryCalculation } from "../../src/features/valuations/calculation/machinery.service";
import { DEFAULT_MACHINERY_COST, EMPTY_MACHINERY_ITEM } from "../../src/features/valuations/calculation/machinery-types";
import { createComparable, getMarketCalculation, saveMarketSettings, updateComparable } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, comparableFormValues } from "../../src/features/valuations/calculation/market-types";
import { loadCalculationMemory } from "../../src/features/valuations/memory/calculation-memory.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });
const badRequest = (error: Error & { status?: number }) => error.status === 400;

const casa = { ref: "T-1", description: "Casa habitación", classification: "Moderno", quality: "Media", area: 120, age: 10, usefulLife: 60 };
const costsOf = (constructions: CostInputDto["constructions"], formulas?: CostInputDto["formulas"]): CostInputDto =>
  ({ land: { ...DEFAULT_LAND, unitValue: 9000 }, constructions, installations: [], indirects: [], ...(formulas ? { formulas } : {}) });

test("the cost approach and the construction types keep the formulas typed, and reload them", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [casa], formulas: { "types.0.area": "=100+20" } });
  const types = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.deepEqual(types.formulas, { "types.0.area": "=100+20" });

  const construction = { ...emptyConstructionCost("T-1"), conservation: 1, completion: 0.75, unitReplacementCost: 1345 * 235 };
  await saveCostCalculation(fixture.publicId, user, costsOf([construction], {
    "land.unitValue": "=4500*2",
    "constructions.0.unitReplacementCost": "=1345*235",
    "constructions.0.completion": "=50+25",
  }));
  let costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(costs.constructions[0].unitReplacementCost, 316075, "the value is the formula's result");
  assert.deepEqual(costs.formulas, {
    "land.unitValue": "=4500*2",
    "constructions.0.unitReplacementCost": "=1345*235",
    "constructions.0.completion": "=50+25",
  });
  assert.deepEqual(costs.typeFormulas, { "types.0.area": "=100+20" });

  // A client that sends no formulas keeps the ones whose value it did not change.
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...construction, completion: 0.8 }]));
  costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(costs.formulas, { "land.unitValue": "=4500*2", "constructions.0.unitReplacementCost": "=1345*235" });
  await saveConstructionTypes(fixture.publicId, user, { types: [{ ...casa, area: 130 }] });
  assert.deepEqual((await getConstructionTypes(fixture.publicId, fixture.organizationId)).formulas, {}, "a new area drops its formula");

  // A formula that does not give its value is rejected, and nothing changes.
  await assert.rejects(saveCostCalculation(fixture.publicId, user, costsOf([construction], { "constructions.0.unitReplacementCost": "=1345*236" })), badRequest);
  await assert.rejects(saveCostCalculation(fixture.publicId, user, costsOf([construction], { "constructions.0.ref": "=1" })), badRequest);
  assert.deepEqual((await getCostCalculation(fixture.publicId, fixture.organizationId)).formulas, costs.formulas);

  // The calculation memory prints them, by row, with the value each one gave.
  const { memory } = await loadCalculationMemory(user, fixture.publicId);
  const approach = memory.approaches.find((item) => item.key === "MOTOR.COSTOS");
  assert.deepEqual(approach?.captured, [
    { label: "Terreno · Valor unitario", formula: "=4500*2", value: "9,000" },
    { label: "Construcción T-1 · Valor unitario de reposición nuevo", formula: "=1345*235", value: "316,075" },
  ]);
});

test("renaming a construction type by its row keeps its cost capture, printed under the new reference", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [casa, { ...casa, ref: "T-2", description: "Bodega", area: 80 }] });
  await saveCostCalculation(fixture.publicId, user, costsOf([
    { ...emptyConstructionCost("T-1"), conservation: 0.9, conservationRating: 7, ageFactor: 0.95, otherFactor: 0.98, completion: 0.75, undivided: 0.5, unitReplacementCost: 12000 },
  ], { "constructions.0.unitReplacementCost": "=6000*2" }));
  const before = await getCostCalculation(fixture.publicId, fixture.organizationId);
  const [t1, t2] = (await getConstructionTypes(fixture.publicId, fixture.organizationId)).types;
  assert.ok(t1.id && t2.id, "each type carries the id of its row");

  // T-1 becomes T-3 and T-2 takes T-1: both by id, in one save.
  await saveConstructionTypes(fixture.publicId, user, { types: [{ ...t1, ref: "T-3" }, { ...t2, ref: "T-1" }] });
  const types = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.deepEqual(types.types.map((type) => [type.id, type.ref]), [[t1.id, "T-3"], [t2.id, "T-1"]], "the rows stay, with their new references");

  const after = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(after.constructions.length, 1);
  const row = after.constructions[0];
  assert.equal(row.ref, "T-3");
  assert.equal(row.description, "Casa habitación");
  const { ref: _before, ...kept } = before.constructions[0];
  const { ref: _after, ...now } = row;
  assert.deepEqual(now, kept, "VRN, factors, calificación, completion and undivided are intact");
  assert.deepEqual(after.formulas, before.formulas, "its formulas too");

  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const stored = await prisma.costoConstruccion.findMany({ where: { enfoqueCosto: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } } });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].IdTipoConstruccionAvaluo, t1.id, "the cost row still points at its type");
  assert.ok(Number(stored[0].NValorParcialVNR) > 0, "and was recomputed");

  // The memory and the trace name it by its new reference.
  const { memory } = await loadCalculationMemory(user, fixture.publicId);
  const approach = memory.approaches.find((item) => item.key === "MOTOR.COSTOS");
  assert.ok(approach?.steps.some((step) => step.key.startsWith("costos.construcciones.T-3.")));
  assert.ok(!approach?.steps.some((step) => step.key.startsWith("costos.construcciones.T-1.")), "T-1 is now the bodega, not valued");
  assert.deepEqual(approach?.captured.map((item) => item.label), ["Construcción T-3 · Valor unitario de reposición nuevo"]);

  // An id that is not of this version is refused; two rows cannot take one id.
  await assert.rejects(saveConstructionTypes(fixture.publicId, user, { types: [{ ...t1, id: t1.id! + 100_000 }] }), (error: Error & { status?: number }) => error.status === 409);
  await assert.rejects(saveConstructionTypes(fixture.publicId, user, { types: [{ ...t1, ref: "A" }, { ...t1, ref: "B" }] }), badRequest);
  // A client that sends no ids still matches by reference.
  await saveConstructionTypes(fixture.publicId, user, { types: [{ ...casa, ref: "T-3" }] });
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).constructions[0]?.unitReplacementCost, 12000);
});

test("the market, its comparables, income, machinery and the conclusion keep their formulas", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);

  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA", subjectArea: 169.78, baseArea: null, surfacePower: 6, adoptedUnitValue: 9000,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS, formulas: { adoptedUnitValue: "=4500*2" },
  });
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", {
    location: "Villa Toledo", area: 140, price: 1_260_000, landUse: null, shape: null, zone: null, frontage: null, depth: null,
    topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }],
    formulas: { price: "=9000*140", "factors.NEGOCIACION": "=1-0.05" },
  });
  let market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(market.settings.formulas, { adoptedUnitValue: "=4500*2" });
  const [comparable] = market.comparables;
  assert.deepEqual(comparable.formulas, { price: "=9000*140", "factors.NEGOCIACION": "=1-0.05" });
  // Sent back as stored (the panel's tables do), the formulas stay; a factor changed drops its own.
  await updateComparable(fixture.publicId, user, comparable.id, { ...comparableFormValues(comparable), formulas: undefined,
    factors: [{ ...comparable.factors[0], value: 0.9 }] });
  market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(market.comparables[0].formulas, { price: "=9000*140" });
  await assert.rejects(updateComparable(fixture.publicId, user, comparable.id, { ...comparableFormValues(market.comparables[0]), formulas: { area: "=100" } }), badRequest);

  await saveIncomeCalculation(fixture.publicId, user, {
    ...DEFAULT_INCOME,
    rentableUnits: [{ description: "Local", area: 120, unitRent: 150 }],
    deductions: [{ concept: "Vacíos", rate: 0.05 }],
    appliedRate: 0.08,
    formulas: { "rentableUnits.0.area": "=100+20", "deductions.0.rate": "=10/2", appliedRate: "=4*2" },
  });
  assert.deepEqual((await getIncomeCalculation(fixture.publicId, fixture.organizationId)).formulas,
    { "rentableUnits.0.area": "=100+20", "deductions.0.rate": "=10/2", appliedRate: "=4*2" }, "a rate typed as a percentage stores its fraction");
  await assert.rejects(saveIncomeCalculation(fixture.publicId, user, { ...DEFAULT_INCOME, appliedRate: 0.08, formulas: { appliedRate: "=0.08" } }), badRequest);

  await saveMachineryCalculation(fixture.publicId, user, {
    cost: { ...DEFAULT_MACHINERY_COST, item: { ...EMPTY_MACHINERY_ITEM, quotedPrice: 65000 }, conservationTwice: false, formulas: { "item.quotedPrice": "=650*100" } },
  });
  assert.deepEqual((await getMachineryCalculation(fixture.publicId, fixture.organizationId)).cost.formulas, { "item.quotedPrice": "=650*100" });

  await saveConclusionSettings(fixture.publicId, user, {
    method: { kind: "weighted", weights: { costos: 0.6, mercado: 0.4 } },
    justification: null,
    formulas: { "method.weights.costos": "=100-40" },
  });
  assert.deepEqual((await getConclusionCalculation(fixture.publicId, fixture.organizationId)).formulas, { "method.weights.costos": "=100-40" });

  const { memory } = await loadCalculationMemory(user, fixture.publicId);
  const captured = Object.fromEntries(memory.approaches.map((approach) => [approach.key, approach.captured]));
  assert.deepEqual(captured["MOTOR.MERCADO.TERRENO_VENTA"], [
    { label: "Valor unitario adoptado", formula: "=4500*2", value: "9,000" },
    { label: "Comparable 1 · Precio", formula: "=9000*140", value: "1,260,000" },
  ]);
  assert.deepEqual(captured["MOTOR.CONCLUSION"], [{ label: "Peso del enfoque de costos", formula: "=100-40", value: "60 %" }]);
});
