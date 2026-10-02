/**
 * The appraiser's rules as the services store them: the ±30 % guard on the
 * adopted value, a typed surface factor, the roundings he chooses and
 * indirects on the constructions (docs/fase0/RESPUESTAS-PERITO.md).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getConclusionCalculation, saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_COST_ROUNDING, DEFAULT_LAND, emptyConstruction } from "../../src/features/valuations/calculation/cost-types";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings, updateComparable } from "../../src/features/valuations/calculation/market.service";
import { defaultMarketSettings, type ComparableFactorDto } from "../../src/features/valuations/calculation/market-types";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const comparable = (location: string, area: number, price: number, factors: ComparableFactorDto[] = []): ComparableInputPayload => ({
  location, area, price, factors, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
});

const settings = { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200 };

/** Three lots of 200 m² at 10,000, 10,000 and 11,500 $/m²: mean 10,500, median 10,000. */
async function market(fixture: Fixture) {
  await saveMarketSettings(fixture.publicId, fixture.user, settings);
  for (const [location, price] of [["Uno", 2_000_000], ["Dos", 2_000_000], ["Tres", 2_300_000]] as const) {
    await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable(location, 200, price));
  }
}

async function storedMarket(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1, tipoComparable: { SClave: "TERRENO_VENTA" } } });
}

test("the adopted value is the appraiser's, within 30 % of the mean and the median", async () => {
  const fixture = await createValuationFixture();
  await market(fixture);
  assert.equal(Number((await storedMarket(fixture)).NValorHomologadoUtilizado), 10500, "sin captura, el promedio");

  // Limits: 10,000 × 0.7 = 7,000 and 10,500 × 1.3 = 13,650.
  for (const adoptedUnitValue of [7000, 12000, 13650]) {
    await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, adoptedUnitValue });
    assert.equal(Number((await storedMarket(fixture)).NValorHomologadoUtilizado), adoptedUnitValue);
  }
  for (const adoptedUnitValue of [6999, 13651, 130000]) {
    await assert.rejects(
      saveMarketSettings(fixture.publicId, fixture.user, { ...settings, adoptedUnitValue }),
      (error: Error & { status?: number }) => error.status === 400 && /debe quedar entre 7,000 y 13,650/.test(error.message),
      String(adoptedUnitValue),
    );
  }
  // A rejected value changes nothing.
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).settings.adoptedUnitValue, 13650);
});

test("a surface factor typed for a comparable is stored and used; emptied, the formula returns", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, subjectArea: 100 });
  const typed: ComparableFactorDto = { type: "SUPERFICIE", value: 0.9, subjectRating: null, comparableRating: null, justification: null };
  const zone: ComparableFactorDto = { type: "ZONA", value: 0.95, subjectRating: null, comparableRating: null, justification: "Zona con menos servicios" };
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Con factor", 200, 2_000_000, [typed, zone]));

  let calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(calculation.comparables[0].factors.find((factor) => factor.type === "SUPERFICIE")?.value, 0.9);
  assert.equal(calculation.comparables[0].factors.find((factor) => factor.type === "ZONA")?.justification, "Zona con menos servicios");
  assert.ok(Math.abs(Number((await storedMarket(fixture)).NValorPromedioHomologado) - 10000 * 0.9 * 0.95) < 1e-6);

  await updateComparable(fixture.publicId, fixture.user, calculation.comparables[0].id, comparable("Con factor", 200, 2_000_000, [{ ...typed, value: null }, zone]));
  calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(calculation.comparables[0].factors.some((factor) => factor.type === "SUPERFICIE"), false);
  // Direct homologation: (subject / comparable)^(1/3).
  assert.ok(Math.abs(Number((await storedMarket(fixture)).NValorPromedioHomologado) - 10000 * (100 / 200) ** (1 / 3) * 0.95) < 1e-6);
});

test("with a lote tipo the market value carries the subject's factor against it", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, subjectArea: 160, baseArea: 250, surfacePower: 6, adoptedUnitValue: 10000, rounding: null });
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Uno", 250, 2_500_000));
  assert.ok(Math.abs(Number((await storedMarket(fixture)).NValorMercado) - 160 * 10000 * (250 / 160) ** (1 / 6)) < 0.01);
});

test("the roundings of the market, the costs and the conclusion are the appraiser's and survive a reload", async () => {
  const fixture = await createValuationFixture();
  await market(fixture);
  // 200 m² × 10,333 = 2,066,600.
  await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, adoptedUnitValue: 10333 });
  assert.equal(Number((await storedMarket(fixture)).NValorMercado), 2_066_600, "a centenas mientras no elija");
  await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, adoptedUnitValue: 10333.33, rounding: null });
  assert.ok(Math.abs(Number((await storedMarket(fixture)).NValorMercado) - 2_066_666) < 1e-6);
  await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, adoptedUnitValue: 10333.33, rounding: -4 });
  assert.equal(Number((await storedMarket(fixture)).NValorMercado), 2_070_000);
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).settings.rounding, -4);

  const construction = { ...emptyConstruction(0), description: "Casa", area: 123, age: 0, usefulLife: 70, conservation: 1, unitReplacementCost: 9876.5 };
  const costs = { land: { ...DEFAULT_LAND, subjectArea: 200 }, constructions: [construction], installations: [], indirects: [] };
  await saveCostCalculation(fixture.publicId, fixture.user, costs);
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const storedCosts = () => prisma.enfoqueCosto.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
  assert.equal(Number((await storedCosts()).NValorConstrucciones), 1_210_000, "a decenas de miles mientras no elija");
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).rounding, undefined);

  const rounding = { ...DEFAULT_COST_ROUNDING, constructions: null, physicalValue: -3 };
  await saveCostCalculation(fixture.publicId, fixture.user, { ...costs, rounding });
  assert.ok(Math.abs(Number((await storedCosts()).NValorConstrucciones) - 123 * 9876.5) < 0.01);
  assert.equal(Number((await storedCosts()).NValorFisicoTotal) % 1000, 0);
  assert.deepEqual((await getCostCalculation(fixture.publicId, fixture.organizationId)).rounding, rounding);

  const method = { kind: "single" as const, approach: "mercado" as const };
  await saveConclusionSettings(fixture.publicId, fixture.user, { method, justification: null, rounding: -5 });
  const summary = () => prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
  assert.equal(Number((await summary()).NValorConcluido), 2_100_000);
  assert.equal((await getConclusionCalculation(fixture.publicId, fixture.organizationId)).rounding, -5);
  await saveConclusionSettings(fixture.publicId, fixture.user, { method, justification: null, rounding: null });
  assert.equal(Number((await summary()).NValorConcluido), 2_070_000);
});

test("an indirect without a base is charged on the constructions; one that is removed leaves no trace", async () => {
  const fixture = await createValuationFixture();
  const construction = { ...emptyConstruction(0), description: "Casa", area: 100, age: 0, usefulLife: 70, conservation: 1, unitReplacementCost: 10000 };
  const base = { land: DEFAULT_LAND, constructions: [construction], installations: [], rounding: { ...DEFAULT_COST_ROUNDING, constructions: null, physicalValue: null } };
  await saveCostCalculation(fixture.publicId, fixture.user, { ...base, indirects: [{ concept: "Licencias", percentage: 0.05, base: null }] });
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const stored = () => prisma.enfoqueCosto.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
  assert.equal(Number((await stored()).NValorIndirectos), 50_000);
  assert.equal(Number((await stored()).NValorFisicoTotal), 1_050_000);

  await saveCostCalculation(fixture.publicId, fixture.user, { ...base, indirects: [] });
  assert.equal(Number((await stored()).NValorIndirectos), 0);
  assert.equal(Number((await stored()).NValorFisicoTotal), 1_000_000);
});

test("an age past the useful life is valued with a useful life of age plus one", async () => {
  const fixture = await createValuationFixture();
  const construction = { ...emptyConstruction(0), description: "Casa antigua", area: 100, age: 102, usefulLife: 100, conservation: 1, unitReplacementCost: 10000 };
  await saveCostCalculation(fixture.publicId, fixture.user, {
    land: DEFAULT_LAND, constructions: [construction], installations: [], indirects: [],
    rounding: { ...DEFAULT_COST_ROUNDING, constructions: null, physicalValue: null },
  });
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const stored = await prisma.enfoqueCosto.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 }, include: { costosConstrucciones: true } });
  const expected = 1 - (102 / 103) ** 1.4;
  assert.ok(Math.abs(Number(stored.costosConstrucciones[0].NFactorEdad) - expected) < 1e-6);
  assert.ok(Math.abs(Number(stored.NValorConstrucciones) - expected * 1_000_000) < 0.01);
  assert.ok(Number(stored.NValorConstrucciones) > 0);
});
