import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, type ComparableFactorDto, type FactorType } from "../../src/features/valuations/calculation/market-types";
import { getIncomeCalculation, saveIncomeCalculation } from "../../src/features/valuations/calculation/income.service";
import {
  ANNUITY_DEDUCTIONS,
  DEFAULT_ANNUITY,
  DEFAULT_INCOME,
  DEFAULT_MARKET_RATE,
  MARKET_RATE_EXPENSES,
  toIncomeEngineInput,
} from "../../src/features/valuations/calculation/income-types";
import { DEFAULT_ENGINE_CONFIG } from "../../src/features/valuations/engine/config";
import { computeIncomeApproach } from "../../src/features/valuations/engine/income";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const factor = (type: FactorType, value: number, subjectRating: number | null = null, comparableRating: number | null = null): ComparableFactorDto =>
  ({ type, value, subjectRating, comparableRating, justification: null });
const rent = (location: string, area: number, price: number, better: boolean): ComparableInputPayload => ({
  location, area, price,
  factors: [factor("NEGOCIACION", 0.95), better ? factor("UBICACION", 1 / 0.95, 1, 0.95) : factor("UBICACION", 1)],
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
});

/** `rounding`: how the rent market rounds its monthly rent; absent, the system's default. */
async function rentMarket(subjectArea: number, adopted: number | null, rows: ComparableInputPayload[], rounding?: number | null) {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, {
    comparableType: "INMUEBLE_RENTA", subjectArea, baseArea: null, surfacePower: 6,
    adoptedUnitValue: adopted, justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
    ...(rounding === undefined ? {} : { rounding }),
  });
  for (const row of rows) await createComparable(fixture.publicId, fixture.user, "INMUEBLE_RENTA", row);
  return fixture;
}

const stored = async (publicId: string) => {
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: publicId } });
  const approach = await prisma.enfoqueIngreso.findUniqueOrThrow({ where: { IdVersionAvaluo: valuation.IdVersionTrabajo! } });
  return Number(approach.NValorCapitalizacion);
};

test("TU annuity method stores 110,689.59 (option 2) and 230,800.37 (option 1)", async () => {
  // The TU book does not round the rent market's monthly rent (its profile: market rounding none): 160 m² × $14.
  const fixture = await rentMarket(160, 14, [
    rent("Renta 1", 260, 3500, false), rent("Renta 2", 250, 3200, false),
    rent("Renta 3", 240, 3400, true), rent("Renta 4", 230, 3100, true),
  ], null);
  const payload = {
    ...DEFAULT_INCOME,
    method: "anualidad" as const,
    rentableUnits: [{ description: "Terreno", area: 160, unitRent: null }],
    deductions: [{ concept: "Servicios de agua", rate: 0.1 }, ...ANNUITY_DEDUCTIONS.filter((row) => row.concept !== "Otros")],
    annuity: { ...DEFAULT_ANNUITY, tiie: 0.0792, inflation: 0.045, remainingLifeYears: 12, option: 2 as const },
  };
  await saveIncomeCalculation(fixture.publicId, fixture.user, payload);
  assert.ok(Math.abs((await stored(fixture.publicId)) - 110689.59) < 0.01);

  await saveIncomeCalculation(fixture.publicId, fixture.user, { ...payload, annuity: { ...payload.annuity, option: 1 } });
  assert.ok(Math.abs((await stored(fixture.publicId)) - 230800.37) < 0.01);
  const back = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(back.method, "anualidad");
  assert.equal(back.annuity.option, 1);
});

test("TR market-rate method stores the value from sale prices of the rent comparables", async () => {
  const fixture = await rentMarket(7295.15, null, [
    rent("Parcela 1", 4780, 7500, false), rent("Parcela 2", 4700, 7500, false),
    rent("Parcela 3", 3200, 6000, true), rent("Parcela 4", 2800, 5000, true),
  ]);
  const income = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(income.rentMarket.comparables.map((row) => row.reference), [1, 2, 3, 4]);
  await saveIncomeCalculation(fixture.publicId, fixture.user, {
    ...DEFAULT_INCOME,
    method: "mercado",
    deductions: MARKET_RATE_EXPENSES,
    marketRate: { ...DEFAULT_MARKET_RATE, negotiation: 0, vacancy: 0.03, salePrices: { 1: 3120000, 2: 2900000, 3: 2500000, 4: 2100000 } },
  });
  // Stored = the engine with the appraiser's surface rule; the book's 5,090,678.68 is checked
  // against its own profile in tests/valuation-engine-income-methods.test.ts.
  const saved = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  const input = toIncomeEngineInput(saved);
  assert.ok(input.ok);
  const expected = computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG).value;
  assert.ok(expected > 0);
  assert.ok(Math.abs((await stored(fixture.publicId)) - expected) < 0.01);
});

test("TCH: «Tasa a utilizar» and the rounding are kept, the rent comes from the rent market and the value is rounded as chosen", async () => {
  // The book's rent market: 250 m² at $30 adopted; the book's ratings (8.857142 %), no rate typed.
  const fixture = await rentMarket(250, 30, [
    rent("Renta 1", 260, 7800, false), rent("Renta 2", 250, 7600, false),
    rent("Renta 3", 240, 7000, true), rent("Renta 4", 230, 6900, true),
  ]);
  const payload = {
    ...DEFAULT_INCOME,
    rentableUnits: [{ description: "Casa habitación", area: null, unitRent: null }],
    ratingColumns: [1, 3, 1, 2, 2, 0, 4],
    rateFromMarket: 0.09,
    rounding: -4,
  };
  await saveIncomeCalculation(fixture.publicId, fixture.user, payload);
  const back = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([back.rateFromMarket, back.weightedRate, back.rounding], [0.09, null, -4]);
  // 250 m² × $30 inherited, less 31 %, over 8.857142…% with every decimal: 701,129.03, rounded to tens of thousands.
  const input = toIncomeEngineInput(back);
  assert.ok(input.ok);
  const result = computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG);
  assert.equal(result.grossMonthlyRent, 7500);
  assert.equal(Math.round(result.unroundedValue * 100) / 100, 701129.03);
  assert.equal(result.value, 700000);
  assert.equal(await stored(fixture.publicId), 700000);
  // A client of before, without those fields, saves as always.
  const { rateFromMarket: _market, rounding: _rounding, weightedRate: _weighted, ...older } = payload;
  await saveIncomeCalculation(fixture.publicId, fixture.user, older);
  const again = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual([again.rateFromMarket, again.weightedRate, again.rounding], [null, null, null]);
  assert.ok(Math.abs((await stored(fixture.publicId)) - 701129.03) < 0.01);
});

test("the gross rent is the rent market's monthly rent with the rounding chosen there (video 8.14, 04:10)", async () => {
  // 236 m² × $130 = $30,680, rounded to thousands in the rent market: $31,000.
  const fixture = await rentMarket(236, 130, [
    rent("Renta 1", 300, 40000, false), rent("Renta 2", 325, 34000, false),
    rent("Renta 3", 250, 32000, true), rent("Renta 4", 280, 33500, true),
  ], -3);
  await saveIncomeCalculation(fixture.publicId, fixture.user, {
    ...DEFAULT_INCOME,
    rentableUnits: [{ description: "Superficie rentable", area: null, unitRent: null }],
    deductions: [{ concept: "Todas", rate: 0.31 }],
    appliedRate: 0.08,
  });
  const income = await getIncomeCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(income.rentMarket.concludedMonthlyRent, 31000);
  assert.ok(Math.abs((await stored(fixture.publicId)) - 31000 * 0.69 * 12 / 0.08) < 0.01);
});
