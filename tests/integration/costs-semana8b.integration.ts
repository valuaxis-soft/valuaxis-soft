/**
 * Video 8.14, 42:27–46:20 (27 Nov 2026): the valuation had no construction
 * type, so B) «Valor de las construcciones» never entered the physical value
 * and could not be captured from the cost approach. A construction added in
 * the cost table creates its type; its data written there is the type's; and
 * values of the appraiser's own count in the physical value. The figures are
 * the firm's TCH book (B: ROUND(2,952,342.00, -4) = 2,950,000). Local database only.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getConstructionTypes } from "../../src/features/valuations/calculation/construction-types.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, costColumnsOf, emptyConstructionCost, type CostInputDto } from "../../src/features/valuations/calculation/cost-types";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

const tchCost = { ...emptyConstructionCost("T-1"), conservation: 0.98, unitReplacementCost: 12550 };

async function storedApproach(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.enfoqueCosto.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
}

test("a construction added in the cost table, with no type yet, creates it with its data and B enters the physical value", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  const input: CostInputDto = {
    land: { ...DEFAULT_LAND },
    constructions: [{ ...tchCost, description: "Casa habitación 2 niveles", area: 250, age: 7, usefulLife: 70 }],
    installations: [],
    indirects: [],
  };
  await saveCostCalculation(fixture.publicId, user, input);
  const types = await getConstructionTypes(fixture.publicId, fixture.organizationId);
  assert.deepEqual(types.types.map((type) => [type.ref, type.description, type.area, type.age, type.usefulLife]), [["T-1", "Casa habitación 2 niveles", 250, 7, 70]]);
  let approach = await storedApproach(fixture);
  assert.equal(Number(approach.NValorConstrucciones), 2950000);
  assert.equal(Number(approach.NValorFisicoTotal), 2950000);

  // Its data written again in the cost table is the type's: the construction section shows it, and B follows.
  await saveCostCalculation(fixture.publicId, user, { ...input, constructions: [{ ...tchCost, area: 200 }] });
  const after = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(after.types[0].area, 200);
  assert.equal(after.types[0].description, "Casa habitación 2 niveles", "what the row does not carry stays");
  approach = await storedApproach(fixture);
  // 200 · 12,550 · 0.98 · (1 − (7/70)^1.4) = 2,361,873.60 → 2,360,000.
  assert.equal(Number(approach.NValorConstrucciones), 2360000);
  // Scoped to this valuation's working version: other tests running at the same time also have a T-1.
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const construction = await prisma.construccionAvaluo.findFirstOrThrow({
    where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1, tiposConstruccion: { some: { SReferencia: "T-1" } } },
    orderBy: { IdConstruccionAvaluo: "desc" },
  });
  assert.equal(Number(construction.NSuperficieConstruida), 200, "the built area follows its types");

  // A value of his own counts in the physical value and is kept with the approach.
  const columns = { ...costColumnsOf(null), extraValues: [{ id: "v1", label: "Obras de urbanización", amount: 100000 }] };
  await saveCostCalculation(fixture.publicId, user, { ...input, constructions: [{ ...tchCost }], columns });
  approach = await storedApproach(fixture);
  assert.equal(Number(approach.NValorFisicoTotal), 2460000, "ROUND(2,360,000 + 100,000, -4)");
  assert.deepEqual((await getCostCalculation(fixture.publicId, fixture.organizationId)).columns?.extraValues, columns.extraValues);
});

test("an indirect's percentage over 100 % is refused with a message in %", async () => {
  const fixture = await createValuationFixture();
  const { costInputSchema } = await import("../../src/features/valuations/calculation/cost-schemas");
  const parsed = costInputSchema.safeParse({ land: { ...DEFAULT_LAND }, constructions: [], installations: [], indirects: [{ concept: "Proyecto", percentage: 10, base: null }] });
  assert.equal(parsed.success, false);
  assert.match(parsed.error?.issues[0].message ?? "", /0 % a 100 %/);
  await saveCostCalculation(fixture.publicId, editor(fixture), {
    land: { ...DEFAULT_LAND }, constructions: [{ ...tchCost, description: "Casa", area: 250, age: 7, usefulLife: 70 }], installations: [],
    indirects: [{ concept: "Proyecto", percentage: 0.1, base: null }],
  });
  const approach = await storedApproach(fixture);
  assert.equal(Number(approach.NValorIndirectos), 295000, "10 % of B: 2,950,000 · 0.10");
});
