/**
 * Observation 4.12: a value adopted outside the ±30 % of the homologated mean
 * and median is saved as typed, but the server refuses to conclude while that
 * market is in the dictamen; left out of it ("Agregar al informe" off), or
 * with a value within the range, the valuation concludes.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ADOPTED_VALUE_OUTSIDE_MESSAGE } from "../../src/features/valuations/calculation/adopted-value-check";
import type { ComparableInputPayload, MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { defaultMarketSettings } from "../../src/features/valuations/calculation/market-types";
import {
  concludeValuation,
  saveValuationSections,
  ValuationWorkflowError,
  type SectionPayload,
} from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const comparable = (location: string, price: number): ComparableInputPayload => ({
  location, area: 200, price, factors: [],
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
});

/** A document with a required section and the market's section, the land market in or out of the dictamen. */
const document = (landInReport: boolean): SectionPayload[] => [
  {
    id: "costos",
    label: "ENF. COSTOS",
    title: "ENF. COSTOS",
    blocks: [{ id: "bloque-terreno", title: "Terreno", concepts: [{ id: "concepto-valor", label: "Valor", value: "1.00" }], images: [] }],
  },
  { id: "mercadoVenta", label: "ENF. MERCADO VENTA", title: "ENF. MERCADO VENTA", ...(landInReport ? {} : { excludedFromReport: ["mercado-terrenos"] }), blocks: [] },
];

const save = (fixture: Fixture, landInReport: boolean) =>
  saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user, sections: document(landInReport) });
const conclude = (fixture: Fixture) => concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
const adopt = (fixture: Fixture, adoptedUnitValue: number) =>
  saveMarketSettings(fixture.publicId, fixture.user, { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200, adoptedUnitValue } as MarketSettingsPayload);

async function landMarket(fixture: Fixture, adoptedUnitValue: number) {
  await adopt(fixture, adoptedUnitValue);
  for (const price of [2_000_000, 2_000_000, 2_200_000, 2_200_000]) {
    await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable(`Lote ${price}`, price));
  }
}

test("a value adopted outside the ±30 % is saved, but the valuation does not conclude until it is within", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, true);
  await landMarket(fixture, 100_000);
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(market.settings.adoptedUnitValue, 100_000, "saved as typed");

  await assert.rejects(conclude(fixture), (error: unknown) => {
    assert.ok(error instanceof ValuationWorkflowError);
    assert.equal(error.status, 409);
    assert.ok(error.message.startsWith(ADOPTED_VALUE_OUTSIDE_MESSAGE), error.message);
    assert.match(error.message, /terrenos en venta/);
    return true;
  });
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.equal(avaluo.BBloqueado, false, "not concluded");

  await adopt(fixture, 10_500);
  const concluded = await conclude(fixture);
  assert.ok("hash" in concluded, "within the range it concludes");
});

test("a market left out of the dictamen does not hold back concluding", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, false);
  await landMarket(fixture, 100_000);
  const concluded = await conclude(fixture);
  assert.ok("hash" in concluded);
});

test("the homologation table prints unless turned off, and a client that does not send the choice keeps it", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, true);
  await adopt(fixture, 10_500);
  const read = () => getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const { settings } = await read();
  assert.equal(settings.showHomologationTable, true, "never chosen: it prints");
  await saveMarketSettings(fixture.publicId, fixture.user, { ...settings, showHomologationTable: false } as MarketSettingsPayload);
  assert.equal((await read()).settings.showHomologationTable, false);
  const { showHomologationTable: _shown, ...former } = (await read()).settings;
  await saveMarketSettings(fixture.publicId, fixture.user, former as MarketSettingsPayload);
  assert.equal((await read()).settings.showHomologationTable, false, "left as stored");
});
