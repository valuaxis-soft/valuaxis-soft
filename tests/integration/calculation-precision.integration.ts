import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getCalculationPrecision, saveCalculationPrecision } from "../../src/features/valuations/calculation/calculation-precision.service";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(async () => {
  await prisma.$disconnect();
});

const offer = (location: string, comparableRating: number): ComparableInputPayload => ({
  location, area: 200, price: 14_361.99 * 200, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null,
  services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
  factors: [{ type: "ZONA", value: null, subjectRating: 1, comparableRating, justification: null }],
});

async function withMarket(fixture: Awaited<ReturnType<typeof createValuationFixture>>) {
  await saveMarketSettings(fixture.publicId, fixture.user, {
    comparableType: "TERRENO_VENTA", subjectArea: 200, baseArea: null, surfacePower: 3, adoptedUnitValue: 14_000,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", offer("Juárez 12, Arandas", 1.0328));
}

const storedMean = async (publicId: string) =>
  Number((await prisma.enfoqueMercado.findFirstOrThrow({ where: { versionAvaluo: { avaluo: { UIdentificadorPublico: publicId } } } })).NValorPromedioHomologado);

test("a new valuation calculates with the precision shown; changing it recomputes what is stored; reopening keeps it", async () => {
  const fixture = await createValuationFixture({ precision: "shown" });
  await withMarket(fixture);
  assert.deepEqual(await getCalculationPrecision(fixture.publicId, fixture.organizationId), { decimals: 2, calculateWithShown: true, locked: false });
  // 14,361.99 × 0.97: the printed figures multiply to the printed result.
  assert.equal(await storedMean(fixture.publicId), 13_931.13);
  assert.deepEqual((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).precision, { decimals: 2, calculateWithShown: true });

  await saveCalculationPrecision(fixture.publicId, fixture.user, { decimals: 4, calculateWithShown: false });
  assert.ok(Math.abs(await storedMean(fixture.publicId) - 14_361.99 / 1.0328) < 1e-4, "every decimal, recomputed at once");

  await saveCalculationPrecision(fixture.publicId, fixture.user, { decimals: 4, calculateWithShown: true });
  await saveValuationSections({
    publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  await reopenValuation({
    publicId: fixture.publicId, organizationId: fixture.organizationId,
    user: { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión", acceptedText: "Acepto reabrir el avalúo",
  });
  assert.deepEqual(await getCalculationPrecision(fixture.publicId, fixture.organizationId), { decimals: 4, calculateWithShown: true, locked: false });
});

test("a valuation of before (no precision stored) keeps calculating with every decimal", async () => {
  const fixture = await createValuationFixture();
  await withMarket(fixture);
  assert.deepEqual(await getCalculationPrecision(fixture.publicId, fixture.organizationId), { decimals: 2, calculateWithShown: false, locked: false });
  assert.ok(Math.abs(await storedMean(fixture.publicId) - 14_361.99 / 1.0328) < 1e-4);
});
