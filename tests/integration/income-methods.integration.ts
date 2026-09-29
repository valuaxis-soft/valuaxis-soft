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
} from "../../src/features/valuations/calculation/income-types";
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

async function rentMarket(subjectArea: number, adopted: number | null, rows: ComparableInputPayload[]) {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, {
    comparableType: "INMUEBLE_RENTA", subjectArea, baseArea: null, surfacePower: 6,
    adoptedUnitValue: adopted, justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
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
  const fixture = await rentMarket(160, 14, [
    rent("Renta 1", 260, 3500, false), rent("Renta 2", 250, 3200, false),
    rent("Renta 3", 240, 3400, true), rent("Renta 4", 230, 3100, true),
  ]);
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

test("TR market-rate method stores 5,090,678.68 from sale prices of the rent comparables", async () => {
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
  assert.ok(Math.abs((await stored(fixture.publicId)) - 5090678.68) < 0.01);
});
