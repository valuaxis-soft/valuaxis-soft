import assert from "node:assert/strict";
import { after, test } from "node:test";
import { defaultMarketRegression } from "../../src/features/valuations/calculation/market-regression";
import type { ComparableInputPayload, MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, defaultCharacteristicFields } from "../../src/features/valuations/calculation/market-types";
import type { StatisticalInputPayload } from "../../src/features/valuations/calculation/statistical-schemas";
import { computeStatisticalGoal, computeStatisticalRegression, defaultStatisticalSettings } from "../../src/features/valuations/calculation/statistical-types";
import { getStatisticalCalculation, saveStatisticalCalculation } from "../../src/features/valuations/calculation/statistical.service";
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

const marketComparable = ([area, unitValue, age]: [number, number, number], index: number): ComparableInputPayload => ({
  location: `Comparable ${index + 1}`, area, price: area * unitValue, factors: [], extra: { [AGE]: String(age) },
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
});

/** A market saved before the statistical apartado, with its regression inside. */
const legacyMarket: MarketSettingsPayload = {
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

/** The client's goal programming workbook, captured in the apartado with its own comparables. */
const GOAL_ROWS = [
  [106, 136, 2, 42, 3, 3, 4, 3450000], [204, 229, 2, 30, 5, 2, 1, 3850000], [176, 260, 2, 35, 3, 3, 3, 5150000],
  [77, 114, 2, 55, 3, 4, 1, 2490000], [180, 216, 2, 55, 4, 4, 4, 4850000], [140, 194, 3, 50, 3, 3, 4, 5500000],
];
const GOAL_KEYS = ["custom:m2t", "area", "custom:plantas", "custom:vur", "custom:rec", "custom:edocon", "custom:colonia"];

function goalPayload(): StatisticalInputPayload {
  const defaults = defaultStatisticalSettings("INMUEBLE_VENTA");
  return {
    settings: {
      ...defaults,
      fields: GOAL_KEYS.map((key) => ({ key, label: key === "area" ? "M2C" : key.replace("custom:", "").toUpperCase() })),
      subject: Object.fromEntries(GOAL_KEYS.map((key, j) => [key, String([137.24, 146.52, 2, 40, 3, 3, 1][j])])),
      variables: GOAL_KEYS.map((key) => ({ key, coding: "DIRECT" as const })),
      goal: { enabled: true, showInDictamen: true, title: null },
      regression: { ...defaults.regression, title: null },
      showComparison: true,
    },
    comparables: GOAL_ROWS.map((row, index) => ({
      id: `pm-${index + 1}`,
      reference: index + 1,
      price: row[7],
      values: Object.fromEntries(GOAL_KEYS.map((key, j) => [key, String(row[j])])),
    })),
  };
}

async function versionOf(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal ?? -1;
}

test("a regression kept in the market is read in compatibility, unchanged, until saved in the apartado", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveMarketSettings(fixture.publicId, user, legacyMarket);
  for (const [index, item] of WORKBOOK.entries()) await createComparable(fixture.publicId, user, "INMUEBLE_VENTA", marketComparable(item, index));

  const read = await getStatisticalCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.equal(read.fromMarket, true);
  assert.equal(read.configured, false);
  assert.equal(read.comparables.length, 10);
  const outcome = computeStatisticalRegression(read);
  assert.ok(outcome?.ok);
  assert.equal(outcome.result.value, 6732.027444746708);
  // The market keeps its regression as it was, and no apartado row exists yet.
  assert.deepEqual((await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).settings.regression, legacyMarket.regression);
  const versionId = await versionOf(fixture);
  assert.equal(await prisma.metodoEstadistico.count({ where: { IdVersionAvaluo: versionId } }), 0);
  // The market's own run no longer carries regression steps.
  const marketRun = await prisma.ejecucionCalculo.findFirstOrThrow({ where: { IdVersionAvaluo: versionId, SClaveCalculo: "MOTOR.MERCADO.INMUEBLE_VENTA" }, include: { resultados: true } });
  assert.equal(marketRun.resultados.some((row) => row.SClaveResultado.startsWith("mercado.regresion")), false);

  // Saving in the apartado keeps a copy of its own, with the trace of its run.
  const { settings, comparables } = read;
  await saveStatisticalCalculation(fixture.publicId, user, { settings, comparables });
  const saved = await getStatisticalCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.equal(saved.fromMarket, false);
  assert.equal(saved.configured, true);
  const row = await prisma.metodoEstadistico.findFirstOrThrow({ where: { IdVersionAvaluo: versionId } });
  assert.equal(Number(row.NValorRegresion), 6732.03);
  const run = await prisma.ejecucionCalculo.findFirstOrThrow({ where: { IdVersionAvaluo: versionId, SClaveCalculo: "MOTOR.ESTADISTICO.INMUEBLE_VENTA" }, include: { resultados: true } });
  const step = (key: string) => run.resultados.find((item) => item.SClaveResultado === key);
  assert.ok(Math.abs(Number(step("estadistico.regresion.valor")?.NValorNumerico) - 6732.027444746708) < 1e-6);
  assert.ok(step("estadistico.regresion.anova.f"));
  assert.ok(step("estadistico.regresion.r"));
  // The market's value is still the adopted 35 $/m² × 200 m².
  const approach = await prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: versionId } });
  assert.equal(Number(approach.NValorMercado), 7000);
});

test("the goal programming is solved on the server with HiGHS: LINGO's value, stored with its trace, copied on reopening", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveStatisticalCalculation(fixture.publicId, user, goalPayload());

  const read = await getStatisticalCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.equal(read.goal?.solution.status, "OPTIMAL");
  const goal = computeStatisticalGoal(read);
  assert.ok(goal?.outcome.ok);
  assert.ok(Math.abs(goal.outcome.fit.estimate - 2874584.35) <= 0.05);
  assert.ok(Math.abs(goal.outcome.fit.objective - 1149695.65) <= 0.05);
  assert.deepEqual(goal.outcome.fit.deviations.filter((row) => row.observe).map((row) => row.id), ["1", "3", "6"]);
  const versionId = await versionOf(fixture);
  const row = await prisma.metodoEstadistico.findFirstOrThrow({ where: { IdVersionAvaluo: versionId } });
  assert.equal(Number(row.NValorMetas), 2874584.35);
  const run = await prisma.ejecucionCalculo.findFirstOrThrow({ where: { IdVersionAvaluo: versionId, SClaveCalculo: "MOTOR.ESTADISTICO.INMUEBLE_VENTA" }, include: { resultados: true } });
  assert.ok(Math.abs(Number(run.resultados.find((item) => item.SClaveResultado === "estadistico.metas.valor")?.NValorNumerico) - 2874584.35) <= 0.05);

  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  await assert.rejects(saveStatisticalCalculation(fixture.publicId, user, goalPayload()), (error: Error & { status?: number }) => error.status === 409);
  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: { ...user, permissions: [...user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión de la programación por metas",
    acceptedText: "Acepto reabrir el avalúo",
  });
  const reopened = await getStatisticalCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.equal(reopened.configured, true);
  assert.equal(reopened.comparables.length, 6);
  assert.deepEqual(reopened.settings.goal, goalPayload().settings.goal);
  // The other types are untouched.
  assert.equal((await getStatisticalCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).configured, false);
});

test("another organization cannot read or change the statistical methods", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  await saveStatisticalCalculation(fixture.publicId, editor(fixture), goalPayload());
  await assert.rejects(getStatisticalCalculation(fixture.publicId, other.organizationId, "INMUEBLE_VENTA"), (error: Error & { status?: number }) => error.status === 404);
  await assert.rejects(saveStatisticalCalculation(fixture.publicId, editor(other), goalPayload()), (error: Error & { status?: number }) => error.status === 404);
});
