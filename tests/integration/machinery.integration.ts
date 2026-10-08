import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getConclusionCalculation, saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { machineryInputSchema } from "../../src/features/valuations/calculation/machinery-schemas";
import { getMachineryCalculation, saveMachineryCalculation } from "../../src/features/valuations/calculation/machinery.service";
import { MACHINERY_PROPERTY_TYPE } from "../../src/features/valuations/calculation/machinery-types";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { workbookCost, workbookMarket } from "../machinery-workbook.fixture";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

/** A valuation of machinery and equipment, as the creation form leaves it. */
async function machineryFixture() {
  const fixture = await createValuationFixture();
  const type = await prisma.tipoInmueble.findUniqueOrThrow({ where: { SClave: MACHINERY_PROPERTY_TYPE } });
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { IdTipoInmueble: type.IdTipoInmueble } });
  return fixture;
}

const stored = async (publicId: string) => {
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: publicId } });
  const approach = await prisma.enfoqueMaquinaria.findUniqueOrThrow({ where: { IdVersionAvaluo: valuation.IdVersionTrabajo! } });
  const executions = await prisma.ejecucionCalculo.findMany({
    where: { IdVersionAvaluo: valuation.IdVersionTrabajo!, SClaveCalculo: { startsWith: "MOTOR.MAQUINARIA." } },
    include: { resultados: true },
    orderBy: { SClaveCalculo: "asc" },
  });
  return { physical: approach.NValorFisico === null ? null : Number(approach.NValorFisico), market: approach.NValorMercado === null ? null : Number(approach.NValorMercado), executions };
};

test("the book's example saves, reloads and gives 933,000 by costs and 980,000 by market", async () => {
  const fixture = await machineryFixture();
  // What the editor sends goes through the API schema.
  const payload = machineryInputSchema.parse({ cost: workbookCost, market: workbookMarket });
  await saveMachineryCalculation(fixture.publicId, fixture.user, payload);

  const values = await stored(fixture.publicId);
  assert.equal(values.physical, 933000);
  assert.equal(values.market, 980000);
  assert.deepEqual(values.executions.map((row) => row.SClaveCalculo), ["MOTOR.MAQUINARIA.COSTOS", "MOTOR.MAQUINARIA.MERCADO"]);
  const step = (key: string) => Number(values.executions.flatMap((row) => row.resultados).find((row) => row.SClaveResultado === key)?.NValorNumerico);
  assert.ok(Math.abs(step("meh.bien.vnr") - 740788.9020491218) < 0.01, "W42");
  assert.ok(Math.abs(step("meh.aditamentos.total") - 192389.25) < 0.01, "V59");
  assert.ok(Math.abs(step("meh.mercado.mediana") - 978738.7347164522) < 0.01, "AI89");

  const back = await getMachineryCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(back.cost, workbookCost);
  assert.deepEqual(back.market, workbookMarket);
  assert.deepEqual(back.configured, { cost: true, market: true });
  assert.equal(back.applies, true);
  assert.equal(back.locked, false);

  const conclusion = await getConclusionCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(conclusion.values, { costos: 933000, mercado: 980000, ingresos: null });
  assert.equal(conclusion.marketSource, "MAQUINARIA_VENTA");
});

test("each capture is saved on its own and the conservation setting stays as saved", async () => {
  const fixture = await machineryFixture();
  await saveMachineryCalculation(fixture.publicId, fixture.user, machineryInputSchema.parse({ cost: { ...workbookCost, conservationTwice: false } }));
  assert.deepEqual(await stored(fixture.publicId).then(({ physical, market }) => ({ physical, market })), { physical: 952000, market: null });
  assert.deepEqual((await getMachineryCalculation(fixture.publicId, fixture.organizationId)).configured, { cost: true, market: false });

  await saveMachineryCalculation(fixture.publicId, fixture.user, machineryInputSchema.parse({ market: workbookMarket }));
  assert.deepEqual(await stored(fixture.publicId).then(({ physical, market }) => ({ physical, market })), { physical: 952000, market: 980000 });

  // A request that does not state the setting keeps the one the valuation has.
  const { conservationTwice: _setting, ...cost } = workbookCost;
  await saveMachineryCalculation(fixture.publicId, fixture.user, machineryInputSchema.parse({ cost: { ...cost, rounding: null } }));
  const values = await stored(fixture.publicId);
  // J42 · FMt · W34 + V59, without the FCo of the item and without rounding.
  const expected = 0.6395605718342495 * 0.95 * 1250502.5 + 192389.25;
  assert.ok(Math.abs((values.physical ?? 0) - expected) < 0.01, `unrounded physical value ${values.physical}`);
  assert.equal((await getMachineryCalculation(fixture.publicId, fixture.organizationId)).cost.conservationTwice, false);
});

test("an incomplete capture is kept without a value, and typing slips are rejected", async () => {
  const fixture = await machineryFixture();
  await saveMachineryCalculation(fixture.publicId, fixture.user, machineryInputSchema.parse({
    cost: { ...workbookCost, item: { ...workbookCost.item, rating: null } },
    market: { ...workbookMarket, usefulLife: null },
  }));
  const values = await stored(fixture.publicId);
  assert.deepEqual([values.physical, values.market, values.executions.length], [null, null, 0]);
  assert.equal((await getMachineryCalculation(fixture.publicId, fixture.organizationId)).cost.item.name, "Retroexcavadora hidráulica");

  const rejects = (input: unknown) => assert.equal(machineryInputSchema.safeParse(input).success, false);
  rejects({});
  rejects({ cost: { ...workbookCost, item: { ...workbookCost.item, rating: 11 } } });
  rejects({ cost: { ...workbookCost, item: { ...workbookCost.item, quotedPrice: -1 } } });
  rejects({ cost: { ...workbookCost, attachments: [workbookCost.attachments[0], workbookCost.attachments[0]] } });
  rejects({ market: { ...workbookMarket, offers: [{ ...workbookMarket.offers[0], ref: "" }] } });
});

test("a useful life the age has consumed becomes the age plus one", async () => {
  const fixture = await machineryFixture();
  await saveMachineryCalculation(fixture.publicId, fixture.user, machineryInputSchema.parse({
    cost: { ...workbookCost, attachments: [], rounding: null, item: { ...workbookCost.item, age: 35 } },
  }));
  // (1 − (35/36)^1.4) · 0.975 · 0.975 · 0.95 · 1,250,502.50
  const expected = (1 - (35 / 36) ** 1.4) * 0.975 * 0.975 * 0.95 * 1250502.5;
  assert.ok(Math.abs(((await stored(fixture.publicId)).physical ?? 0) - expected) < 0.01);
});

test("another organization cannot read or save it, and a valuation of another kind does not conclude with it", async () => {
  const fixture = await machineryFixture();
  const other = await createValuationFixture();
  await saveMachineryCalculation(fixture.publicId, fixture.user, machineryInputSchema.parse({ cost: workbookCost }));

  const notFound = (error: Error & { status?: number }) => error.status === 404;
  await assert.rejects(getMachineryCalculation(fixture.publicId, other.organizationId), notFound);
  await assert.rejects(saveMachineryCalculation(fixture.publicId, other.user, machineryInputSchema.parse({ market: workbookMarket })), notFound);
  assert.equal((await stored(fixture.publicId)).market, null);

  // A real-estate valuation keeps its own approaches even if a machinery capture is stored.
  await saveMachineryCalculation(other.publicId, other.user, machineryInputSchema.parse({ cost: workbookCost }));
  assert.equal((await getMachineryCalculation(other.publicId, other.organizationId)).applies, false);
  assert.deepEqual((await getConclusionCalculation(other.publicId, other.organizationId)).values, { costos: null, mercado: null, ingresos: null });
});

test("a concluded valuation rejects edits, and reopening copies the captures and their values", async () => {
  const fixture = await machineryFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_CONCLUIR", "AVALUO_REABRIR"] };
  await saveMachineryCalculation(fixture.publicId, user, machineryInputSchema.parse({ cost: workbookCost, market: workbookMarket }));
  await saveConclusionSettings(fixture.publicId, user, { method: { kind: "weighted", weights: { costos: 0.4, mercado: 0.6 } }, justification: null });
  // ROUND(0.4 · 930,000 + 0.6 · 980,000, −4): each approach is rounded in the summary, as the book does.
  const summary = async () => {
    const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
    const row = await prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: (valuation.IdVersionTrabajo ?? valuation.IdVersionFinal)! } });
    return [Number(row.NValorEnfoqueCostos), Number(row.NValorEnfoqueMercado), Number(row.NValorConcluido)];
  };
  assert.deepEqual(await summary(), [930000, 980000, 960000]);

  // Concluding needs the document structure, created on the first save.
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "costos", label: "V", title: "ENFOQUE DE COSTOS", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  await assert.rejects(
    saveMachineryCalculation(fixture.publicId, user, machineryInputSchema.parse({ cost: workbookCost })),
    (error: Error & { status?: number }) => error.status === 409,
  );
  const concluded = await getMachineryCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(concluded.locked, true);
  assert.deepEqual(concluded.cost, workbookCost, "the final version still shows its capture");

  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    reason: "Revisión de la cotización",
    acceptedText: "Acepto reabrir el avalúo",
  });
  const reopened = await getMachineryCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(reopened.locked, false);
  assert.deepEqual(reopened.cost, workbookCost);
  assert.deepEqual(reopened.market, workbookMarket);
  assert.deepEqual(await stored(fixture.publicId).then(({ physical, market }) => ({ physical, market })), { physical: 933000, market: 980000 });
  assert.deepEqual(await summary(), [930000, 980000, 960000]);
});
