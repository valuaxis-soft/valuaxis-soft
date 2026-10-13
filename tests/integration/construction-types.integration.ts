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

test("a capture that still carries the type's data creates the type (valuations saved before the types had their panel)", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveCostCalculation(fixture.publicId, user, costsOf([{ ...arandasType, ...arandasCost }]));
  const types = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.deepEqual(types.types, [arandasType]);
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
  assert.deepEqual(concluded.types, [arandasType], "the final version still shows its types");
  await assert.rejects(
    saveConstructionTypes(fixture.publicId, user, { types: [] }),
    (error: Error & { status?: number }) => error.status === 409,
  );
});
