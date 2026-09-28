import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseComparableRows } from "../../src/features/valuations/calculation/comparable-import";
import { getMarketCalculation, importComparables } from "../../src/features/valuations/calculation/market.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

test("imported comparables are numbered after the existing ones and feed the calculation", async () => {
  const fixture = await createValuationFixture();
  const parsed = parseComparableRows([
    ["Ubicación", "Superficie del terreno (m²)", "Precio de oferta ($)"],
    ["Calle Uno 1", 400, 1200000],
    ["Calle Dos 2", 500, 1400000],
    ["Calle Tres 3", 450, 1350000],
  ], "TERRENO_VENTA");
  const payloads = parsed.rows.map((row) => row.payload!);

  assert.equal(await importComparables(fixture.publicId, fixture.user, "TERRENO_VENTA", payloads.slice(0, 2)), 2);
  await importComparables(fixture.publicId, fixture.user, "TERRENO_VENTA", payloads.slice(2));

  const calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(calculation.comparables.map((row) => [row.reference, row.location, row.area, row.price]), [
    [1, "Calle Uno 1", 400, 1200000],
    [2, "Calle Dos 2", 500, 1400000],
    [3, "Calle Tres 3", 450, 1350000],
  ]);
  // Other comparable types are untouched.
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_RENTA")).comparables.length, 0);
});
