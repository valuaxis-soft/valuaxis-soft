import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getFactorCatalog, saveFactorCatalog } from "../../src/features/firm/firm.service";
import { DEFAULT_FACTOR_CATALOG } from "../../src/features/valuations/calculation/factor-catalog";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

test("a firm edits its catalog, and can go back to the proposal", async () => {
  const fixture = await createValuationFixture();
  const initial = await getFactorCatalog(fixture.organizationId);
  assert.equal(initial.customized, false);
  assert.deepEqual(initial.catalog, DEFAULT_FACTOR_CATALOG);

  const custom = { factors: { ZONA: [{ label: "Igual", value: 1 }, { label: "Mejor", value: 1.08 }] }, limits: { factorMin: 0.85, factorMax: 1.15, resultantMin: 0.7, resultantMax: 1.3 } };
  const saved = await saveFactorCatalog(fixture.user, custom);
  assert.equal(saved.customized, true);
  assert.deepEqual(saved.catalog, custom);

  const reset = await saveFactorCatalog(fixture.user, null);
  assert.equal(reset.customized, false);
  assert.deepEqual(reset.catalog, DEFAULT_FACTOR_CATALOG);
});

test("the subject's rating of a factor is saved with the market settings", async () => {
  const fixture = await createValuationFixture();
  const current = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  await saveMarketSettings(fixture.publicId, fixture.user, {
    ...current.settings,
    factorSlots: current.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, subjectOption: "Similar" } : slot)),
  });
  const after = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(after.settings.factorSlots.find((slot) => slot.type === "ZONA")?.subjectOption, "Similar");
});

test("changing the subject's rating updates the comparables rated from the catalog, not the ones typed by hand", async () => {
  const fixture = await createValuationFixture();
  const current = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const withSubject = (option: string) => ({
    ...current.settings,
    factorSlots: current.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, subjectOption: option } : slot)),
  });
  await saveMarketSettings(fixture.publicId, fixture.user, withSubject("Similar"));
  const base = { area: 200, price: 1_600_000, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null };
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", {
    ...base, location: "Del catálogo",
    factors: [{ type: "ZONA", value: 1 / 1.05, subjectRating: 1, comparableRating: 1.05, justification: "Zona: sujeto Similar (1) / comparable Superior (1.05)" }],
  });
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", {
    ...base, location: "A mano",
    factors: [{ type: "ZONA", value: 0.9 / 1.02, subjectRating: 0.9, comparableRating: 1.02, justification: null }],
  });

  await saveMarketSettings(fixture.publicId, fixture.user, withSubject("Superior"));
  const after = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const zona = (location: string) => after.comparables.find((row) => row.location === location)!.factors.find((factor) => factor.type === "ZONA")!;
  assert.equal(zona("Del catálogo").subjectRating, 1.05);
  assert.equal(zona("Del catálogo").value, 1);
  assert.equal(zona("Del catálogo").justification, "Zona: sujeto Superior (1.05) / comparable Superior (1.05)");
  assert.equal(zona("A mano").subjectRating, 0.9);
  assert.ok(Math.abs((zona("A mano").value ?? 0) - 0.9 / 1.02) < 1e-6);
});
