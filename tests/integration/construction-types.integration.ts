/**
 * Construction types captured once (question 10, 9 Oct 2026): the
 * construction section holds surface, age and useful life; the cost approach
 * picks each type by reference and keeps its own columns. Local database only.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getConstructionTypes, saveConstructionTypes } from "../../src/features/valuations/calculation/construction-types.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, emptyConstructionCost, type CostInputDto } from "../../src/features/valuations/calculation/cost-types";
import { concludeValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

// The Arandas building: 467.27 m², 2 of 70 years, conservation 0.98, VRN 14,361.99 $/m².
const arandasType = { ref: "T-1", description: "Edificio de uso mixto", classification: "Moderno", quality: "Media", area: 467.27, age: 2, usefulLife: 70 };
const arandasCost = { ...emptyConstructionCost("T-1"), conservation: 0.98, unitReplacementCost: 14361.99 };
const costsOf = (constructions: CostInputDto["constructions"]): CostInputDto =>
  ({ land: { ...DEFAULT_LAND }, constructions, installations: [], indirects: [] });

async function storedConstructionValue(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const approach = await prisma.enfoqueCosto.findUniqueOrThrow({
    where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 },
    include: { costosConstrucciones: { include: { tipoConstruccionAvaluo: true } } },
  });
  return { value: Number(approach.NValorConstrucciones), rows: approach.costosConstrucciones };
}

test("the section captures the types, the cost approach picks them, and a new age in the source moves the cost result", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [arandasType, { ...arandasType, ref: "T-2", description: "Bodega", area: 80, age: 10, usefulLife: 50 }] });
  const types = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.deepEqual(types.types.map((type) => [type.ref, type.area, type.age, type.usefulLife]), [["T-1", 467.27, 2, 70], ["T-2", 80, 10, 50]]);

  // Costs pick T-1 only, with its own columns and none of the type's data.
  await saveCostCalculation(fixture.publicId, user, costsOf([arandasCost]));
  let costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(costs.types.length, 2, "every type is offered to the cost panel");
  assert.deepEqual(costs.constructions.map((row) => [row.ref, row.description, row.area, row.age, row.usefulLife, row.conservation, row.unitReplacementCost]),
    [["T-1", "Edificio de uso mixto", 467.27, 2, 70, 0.98, 14361.99]]);
  let stored = await storedConstructionValue(fixture);
  assert.equal(stored.value, 6530000, "Arandas: ROUND(6,531,386.08, -4)");
  assert.equal(Number(stored.rows[0].NValorParcialVNR), 6531386.08);

  // The age changes in the source only; the cost approach recomputes with it.
  await saveConstructionTypes(fixture.publicId, user, { types: [{ ...arandasType, age: 20 }, { ...arandasType, ref: "T-2", description: "Bodega", area: 80, age: 10, usefulLife: 50 }] });
  costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(costs.constructions[0].age, 20);
  assert.equal(costs.constructions[0].conservation, 0.98, "the cost columns stay");
  stored = await storedConstructionValue(fixture);
  // Age factor 1 − (20/70)^1.4 = 0.826865…; VNR = 467.27 · 14,361.99 · 0.98 · 0.826865… = 5,438,260.17; rounded to tens of thousands.
  assert.equal(Number(stored.rows[0].NValorParcialVNR), 5438260.17);
  assert.equal(stored.value, 5440000);
  assert.equal(stored.rows[0].tipoConstruccionAvaluo.SReferencia, "T-1");
  assert.equal(Number(stored.rows[0].tipoConstruccionAvaluo.NVidaUtilRemanente), 50);

  // A type the cost approach does not know is rejected; a removed type takes its cost row with it.
  await assert.rejects(
    saveCostCalculation(fixture.publicId, user, costsOf([arandasCost, { ...emptyConstructionCost("T-9"), conservation: 1, unitReplacementCost: 1000 }])),
    (error: Error & { status?: number }) => error.status === 400 && /T-9/.test(error.message),
  );
  await saveConstructionTypes(fixture.publicId, user, { types: [{ ...arandasType, ref: "T-2", description: "Bodega", area: 80, age: 10, usefulLife: 50 }] });
  costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(costs.constructions, []);
  assert.equal((await storedConstructionValue(fixture)).rows.length, 0);
});

test("a row removed from the cost calculation leaves the type in its section; deleting the last type empties the section", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  const bodega = { ...arandasType, ref: "T-2", description: "Bodega", area: 80, age: 10, usefulLife: 50 };
  // Nothing captured yet: the construction section tables stay as the appraiser wrote them.
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).typesCaptured, false);
  await saveCostCalculation(fixture.publicId, user, costsOf([]));
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).typesCaptured, false, "an empty cost capture creates no construction record");

  await saveConstructionTypes(fixture.publicId, user, { types: [arandasType, bodega] });
  await saveCostCalculation(fixture.publicId, user, costsOf([arandasCost, { ...emptyConstructionCost("T-2"), conservation: 0.9, unitReplacementCost: 9000 }]));
  assert.equal((await storedConstructionValue(fixture)).rows.length, 2);

  // Out of the calculation, still described in the section.
  await saveCostCalculation(fixture.publicId, user, costsOf([arandasCost]));
  let costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(costs.constructions.map((row) => row.ref), ["T-1"]);
  assert.deepEqual(costs.types.map((type) => type.ref), ["T-1", "T-2"]);
  assert.equal((await storedConstructionValue(fixture)).value, 6530000);

  // Deleted in the section: gone from the types, the cost rows and the result.
  await saveConstructionTypes(fixture.publicId, user, { types: [] });
  costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([costs.types, costs.constructions, costs.typesCaptured], [[], [], true]);
  assert.equal((await storedConstructionValue(fixture)).rows.length, 0);
});

test("the age factor and FRe take the Excel formula when empty, a typed value overrides it and survives a rename, and percentages stay fractions", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [arandasType] });
  await saveCostCalculation(fixture.publicId, user, costsOf([arandasCost]));
  let stored = await storedConstructionValue(fixture);
  // R26 = 1 − (2/70)^1.4 and T26 = 0.98 · R26, as the Arandas book.
  assert.equal(Number(stored.rows[0].NFactorEdad), 0.99310864);
  assert.equal(Number(stored.rows[0].NFactorResultante), 0.97324647);

  // Typed: an age factor of 0.9, completion 75 % and undivided 50 % (fractions on the wire).
  const installation = {
    ref: "1", description: "Cisterna de 18 mil lts", share: "C" as const, unit: "Lote", quantity: 1, age: 2, usefulLife: 70, conservation: 0.975,
    maintenance: "Bueno", ageFactor: null, otherFactor: 1, resultantFactor: 0.5, completion: 1, undivided: 1, unitReplacementCost: 90000,
  };
  await saveCostCalculation(fixture.publicId, user, {
    ...costsOf([{ ...arandasCost, ageFactor: 0.9, completion: 0.75, undivided: 0.5 }]),
    land: { ...DEFAULT_LAND, surfaceFactor: 1.05 },
    installations: [installation],
  });
  let costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([costs.constructions[0].ageFactor, costs.constructions[0].resultantFactor, costs.constructions[0].completion, costs.constructions[0].undivided], [0.9, null, 0.75, 0.5]);
  assert.deepEqual([costs.installations[0].ageFactor, costs.installations[0].resultantFactor], [null, 0.5]);
  assert.equal(costs.land.surfaceFactor, 1.05);
  stored = await storedConstructionValue(fixture);
  assert.equal(Number(stored.rows[0].NFactorEdad), 0.9);
  // 0.98 · 0.9 · 14,361.99 · 467.27 · 0.75 · 0.5 = 2,219,639.13.
  assert.equal(Number(stored.rows[0].NValorParcialVNR), 2219639.13);
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const installationCost = await prisma.costoInstalacion.findFirstOrThrow({ where: { enfoqueCosto: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } } });
  // The age factor of the installation follows its formula; its FRe is the typed one: 0.5 · 90,000.
  assert.equal(Number(installationCost.NFactorEdad), 0.99310864);
  assert.equal(Number(installationCost.NValorParcialVNR), 45000);

  // A change of the type in its section keeps the factor typed for it.
  await saveConstructionTypes(fixture.publicId, user, { types: [{ ...arandasType, description: "Edificio mixto" }] });
  costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([costs.constructions[0].description, costs.constructions[0].ageFactor], ["Edificio mixto", 0.9]);

  // Cleared, it goes back to the formula; an older client that omits the factors gets the formulas too.
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...arandasCost, ageFactor: null }]));
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).constructions[0].ageFactor, null);
  assert.equal(Number((await storedConstructionValue(fixture)).rows[0].NFactorEdad), 0.99310864);
  const { ageFactor: _age, resultantFactor: _resultant, ...older } = arandasCost;
  await saveCostCalculation(fixture.publicId, user, costsOf([older]));
  assert.equal((await storedConstructionValue(fixture)).value, 6530000);
});

test("the calificación of the conservation is kept per construction and installation, gives the Cons. when none is typed, and a typed one wins", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [arandasType] });
  const installation = {
    ref: "1", description: "Cisterna", share: "P" as const, unit: "Lote", quantity: 1, age: 2, usefulLife: 70, conservation: null, conservationRating: 6,
    maintenance: "", ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 90000,
  };
  // Calificación 8 (Regular) = 0.975 in place of the typed 0.98.
  await saveCostCalculation(fixture.publicId, user, { ...costsOf([{ ...arandasCost, conservation: null, conservationRating: 8 }]), installations: [installation] });
  let costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([costs.constructions[0].conservation, costs.constructions[0].conservationRating], [null, 8]);
  assert.deepEqual([costs.installations[0].conservation, costs.installations[0].conservationRating], [null, 6]);
  let stored = await storedConstructionValue(fixture);
  // T26 = 0.975 · (1 − (2/70)^1.4).
  assert.equal(Number(stored.rows[0].NFactorResultante), 0.96828093);

  // A typed factor wins over the calificación, which stays chosen.
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...arandasCost, conservation: 0.98, conservationRating: 8 }]));
  costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([costs.constructions[0].conservation, costs.constructions[0].conservationRating], [0.98, 8]);
  stored = await storedConstructionValue(fixture);
  assert.equal(Number(stored.rows[0].NFactorResultante), 0.97324647);

  // Without either the row waits, as before the ratings.
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...arandasCost, conservation: null }]));
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).constructions[0].conservationRating, null);
  assert.equal((await storedConstructionValue(fixture)).value, 0);
});

test("a capture that still carries the type's data creates the type (valuations saved before the types had their panel)", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...arandasType, ...arandasCost }]));
  const types = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.deepEqual(types.types.map(({ id: _id, ...type }) => type), [arandasType]);
  const costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(costs.constructions[0].area, 467.27);
  assert.equal((await storedConstructionValue(fixture)).value, 6530000);

  // Once the type exists, the section is the source: the type's data sent with the costs is ignored.
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...arandasType, ...arandasCost, age: 50, area: 1 }]));
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).constructions[0].age, 2);
  assert.equal((await getConstructionTypes(fixture.publicId, fixture.organizationId)).types[0].area, 467.27);
});

test("the types belong to the organization and a concluded valuation keeps them read-only", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [arandasType] });
  await assert.rejects(getConstructionTypes(fixture.publicId, fixture.organizationId + 1), (error: Error & { status?: number }) => error.status === 404);
  await assert.rejects(
    saveConstructionTypes(fixture.publicId, { ...user, organizationId: fixture.organizationId + 1 }, { types: [] }),
    (error: Error & { status?: number }) => error.status === 404,
  );

  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "construccion", label: "III", title: "INF. CONSTRUCCION", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  const concluded = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.equal(concluded.locked, true);
  assert.deepEqual(concluded.types.map(({ id: _id, ...type }) => type), [arandasType], "the final version still shows its types");
  await assert.rejects(
    saveConstructionTypes(fixture.publicId, user, { types: [] }),
    (error: Error & { status?: number }) => error.status === 409,
  );
});
