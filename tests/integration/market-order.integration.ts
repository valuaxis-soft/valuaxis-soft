import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, reorderComparables, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import { ValuationWorkflowError } from "../../src/features/valuations/services/valuation-workflow/errors";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

function comparable(location: string, area: number, price: number): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: "Regular", zone: null, frontage: null, depth: null, topography: "Plano", services: "Completos",
    notes: null, sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null,
  };
}

test("V7.2-14: the comparables take the order given; references 1..n follow it and a list of before is refused", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA", subjectArea: 300, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  for (const [location, area, price] of [["Calle A", 300, 2_400_000], ["Calle B", 300, 1_800_000], ["Calle C", 300, 2_100_000]] as const) {
    await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable(location, area, price));
  }
  const before = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  // «Ordenar por $/m² ↑»: B, C, A.
  const sorted = [...before.comparables].sort((a, b) => a.price! / a.area! - b.price! / b.area!);
  await reorderComparables(fixture.publicId, user, "TERRENO_VENTA", sorted.map((item) => item.id));
  const after = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(after.comparables.map((item) => item.location), ["Calle B", "Calle C", "Calle A"]);
  assert.deepEqual(after.comparables.map((item) => item.reference), [1, 2, 3]);
  // A list missing one of them (another tab added or removed one) moves nothing.
  await assert.rejects(
    reorderComparables(fixture.publicId, user, "TERRENO_VENTA", after.comparables.slice(0, 2).map((item) => item.id)),
    (error) => error instanceof ValuationWorkflowError && error.status === 409,
  );
  const same = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(same.comparables.map((item) => item.location), ["Calle B", "Calle C", "Calle A"]);
});

test("V7.2-18: an added area of the market keeps its kind when the settings are stored", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "INMUEBLE_VENTA", subjectArea: 120, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
    characteristicFields: [{ key: "area", label: "SUP. CONST." }, { key: "custom:sup-comun", label: "Sup. común", kind: "area" }],
  });
  const stored = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  assert.deepEqual(stored.settings.characteristicFields?.[1], { key: "custom:sup-comun", label: "Sup. común", kind: "area" });
});
