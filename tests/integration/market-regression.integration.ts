import assert from "node:assert/strict";
import { after, test } from "node:test";
import { computeMarketRegression, defaultMarketRegression } from "../../src/features/valuations/calculation/market-regression";
import type { ComparableInputPayload, MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  getMarketCalculation,
  saveMarketSettings,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, comparableFormValues, defaultCharacteristicFields } from "../../src/features/valuations/calculation/market-types";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });
const AGE = "custom:edad";

/** REG.LIN.3: surface, $/m² and age of the ten comparables. */
const WORKBOOK: Array<[number, number, number]> = [
  [455, 39, 5], [230, 35, 10], [250, 32, 10], [240, 32, 5], [220, 35, 9], [200, 37, 9], [210, 34, 5], [200, 40, 6], [250, 32, 6], [200, 40, 5],
];

const comparable = ([area, unitValue, age]: [number, number, number], index: number): ComparableInputPayload => ({
  location: `Comparable ${index + 1}`, area, price: area * unitValue, factors: [], extra: { [AGE]: String(age) },
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
});

const settings: MarketSettingsPayload = {
  comparableType: "INMUEBLE_VENTA",
  subjectArea: 200,
  baseArea: null,
  surfacePower: 3,
  adoptedUnitValue: 35,
  justification: null,
  additionalAmount: 0,
  factorSlots: DEFAULT_FACTOR_SLOTS,
  characteristicFields: [...defaultCharacteristicFields("INMUEBLE_VENTA"), { key: AGE, label: "EDAD" }],
  subjectCharacteristics: { [AGE]: "12" },
  regression: { ...defaultMarketRegression(), enabled: true, variables: [{ key: "area" }, { key: AGE }], showInDictamen: true },
};

async function stored(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal ?? -1;
  const approach = await prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: versionId } });
  const execution = await prisma.ejecucionCalculo.findFirstOrThrow({
    where: { IdVersionAvaluo: versionId, SClaveCalculo: "MOTOR.MERCADO.INMUEBLE_VENTA" },
    include: { resultados: true },
  });
  const step = (key: string) => execution.resultados.find((row) => row.SClaveResultado === key);
  return { approach, execution, step };
}

test("the regression is saved with the market, reloads, keeps its trace and leaves the market value alone", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveMarketSettings(fixture.publicId, user, settings);
  for (const [index, item] of WORKBOOK.entries()) await createComparable(fixture.publicId, user, "INMUEBLE_VENTA", comparable(item, index));

  const reloaded = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.deepEqual(reloaded.settings.regression, settings.regression);
  assert.equal(reloaded.comparables[0].extra?.[AGE], "5");
  const outcome = computeMarketRegression(reloaded);
  assert.ok(outcome?.ok);
  assert.equal(outcome.result.unitValue, 33.66013722373354);
  assert.equal(outcome.result.value, 6732.027444746708);

  const { approach, execution, step } = await stored(fixture);
  // The market's value is the adopted 35 $/m² × 200 m², not the regression's.
  assert.equal(Number(approach.NValorHomologadoUtilizado), 35);
  assert.equal(Number(approach.NValorMercado), 7000);
  assert.ok(Math.abs(Number(step("mercado.regresion.valor")?.NValorNumerico) - 6732.027444746708) < 1e-6);
  assert.ok(Math.abs(Number(step("mercado.regresion.constante.A")?.NValorNumerico) - 37.242816724519066) < 1e-7, "the column keeps eight decimals");
  assert.equal(Number(step("mercado.regresion.suma.XY")?.NValorNumerico), 87715);
  assert.equal((execution.JValoresSalida as { regression?: { n: number } }).regression?.n, 10);

  // A client that does not send the regression leaves it as stored.
  const { regression: _regression, ...withoutRegression } = settings;
  await saveMarketSettings(fixture.publicId, user, { ...withoutRegression, adoptedUnitValue: 36 });
  assert.deepEqual((await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).settings.regression, settings.regression);
});

test("excluding a comparable is kept with it, leaves the homologation whole, and is copied on reopening", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveMarketSettings(fixture.publicId, user, settings);
  for (const [index, item] of WORKBOOK.entries()) await createComparable(fixture.publicId, user, "INMUEBLE_VENTA", comparable(item, index));
  const before = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  const first = before.comparables[0];
  await updateComparable(fixture.publicId, user, first.id, { ...comparableFormValues(first), regressionExcluded: true });

  const excluded = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.equal(excluded.comparables[0].regressionExcluded, true);
  assert.equal(excluded.comparables[1].regressionExcluded, undefined);
  const outcome = computeMarketRegression(excluded);
  assert.ok(outcome?.ok);
  assert.equal(outcome.result.fit.n, 9);
  const { approach, step } = await stored(fixture);
  assert.equal(Number(approach.NValorMercado), 7000);
  assert.equal(Number(step("mercado.regresion.suma.N")?.NValorNumerico), 9);

  // Editing the comparable from the form, which does not send the flag, keeps it.
  const { regressionExcluded: _flag, ...formValues } = comparableFormValues(excluded.comparables[0]);
  await updateComparable(fixture.publicId, user, first.id, { ...formValues, location: "Comparable uno" });
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).comparables[0].regressionExcluded, true);

  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  await assert.rejects(
    saveMarketSettings(fixture.publicId, user, { ...settings, regression: { ...settings.regression!, enabled: false } }),
    (error: Error & { status?: number }) => error.status === 409,
  );
  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: { ...user, permissions: [...user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión de la regresión",
    acceptedText: "Acepto reabrir el avalúo",
  });
  const reopened = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.deepEqual(reopened.settings.regression, settings.regression);
  assert.equal(reopened.comparables[0].regressionExcluded, true);

  // Back in: the ten comparables of the workbook again.
  await updateComparable(fixture.publicId, user, reopened.comparables[0].id, { ...comparableFormValues(reopened.comparables[0]), regressionExcluded: false });
  const included = computeMarketRegression(await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA"));
  assert.ok(included?.ok);
  assert.equal(included.result.value, 6732.027444746708);
});

test("another organization cannot read or change the regression", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, editor(fixture), settings);
  await assert.rejects(getMarketCalculation(fixture.publicId, other.organizationId, "INMUEBLE_VENTA"), (error: Error & { status?: number }) => error.status === 404);
  await assert.rejects(
    saveMarketSettings(fixture.publicId, editor(other), { ...settings, regression: null }),
    (error: Error & { status?: number }) => error.status === 404,
  );
  assert.deepEqual((await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).settings.regression, settings.regression);
});
