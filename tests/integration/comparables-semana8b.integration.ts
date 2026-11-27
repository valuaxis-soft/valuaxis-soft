/**
 * Video 8.13 (27 nov 2026) against the local database: the approximate
 * search by colonia and fraccionamiento, the pin of a comparable shared by
 * every capture of its number, the approximate location of a comparable
 * without a pin (with a fake geocoder, never Google) and the review of
 * several comparables at once. Every place and person is invented.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { comparablesAround, listComparablePins, locateComparablePins } from "../../src/features/maps/base-map/base-map.service";
import type { GeocodingResult } from "../../src/features/maps/server/geocoding.service";
import { getComparableCard } from "../../src/features/valuations/calculation/comparable-card.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable, deleteComparable, getMarketCalculation, reuseComparable, saveComparableReviews, updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import type { ComparableType } from "../../src/features/valuations/calculation/market-types";
import { listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { setBaseComparableCoordinates } from "../../src/features/valuations/comparable-base/comparable-base-write.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { locateComparable } from "../../src/features/valuations/comparable-base/comparable-location.service";
import { ownBaseSource } from "../../src/features/valuations/comparable-search/sources/own-base.source";
import type { ComparableSearchQuery } from "../../src/features/valuations/comparable-search/types";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** Another valuation of the fixture's organization. */
async function anotherValuation(fixture: Fixture) {
  const base = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion, IdUsuarioCreador: base.IdUsuarioCreador, IdEstadoAvaluo: base.IdEstadoAvaluo, IdTipoAvaluo: base.IdTipoAvaluo,
      IdTipoInmueble: base.IdTipoInmueble, IdTipoOperacion: base.IdTipoOperacion, SFolio: `TEST-${randomUUID().slice(0, 8)}`, STitulo: "Otro avalúo de prueba",
      DFechaModificacion: new Date(),
    },
  });
  return created.UIdentificadorPublico;
}

const comparable = (location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload => ({
  location, area, price, factors: [],
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: "Portal Ejemplo", contactName: "Asesor Inventado", contactPhone: "33 0000 2222", url: null, offerDate: "2026-11-01",
  ...extra,
});

const place = (street: string, neighborhood: string | null, subdivision: string | null) => ({
  street, number: "10", neighborhood, subdivision, municipality: "Villa Inventada", state: "Jalisco", postalCode: "45999",
});

const query = (text: string, filters: ComparableSearchQuery["filters"] = undefined, type: ComparableType = "INMUEBLE_RENTA"): ComparableSearchQuery =>
  ({ text, type, areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20, ...(filters ? { filters } : {}) });

async function found(fixture: Fixture, from: string, search: ComparableSearchQuery) {
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: from }, select: { IdAvaluo: true } });
  const results = await ownBaseSource.search(search, { organizationId: fixture.organizationId, valuationId: valuation.IdAvaluo, signal: new AbortController().signal });
  return results.map((result) => result.comparable.location).sort();
}

test("V8.13 (06:14): «Bugambilias» in Colonia finds the colonia, the fraccionamiento, its sections and misspellings; not another place", async () => {
  const fixture = await createValuationFixture();
  const rents: Array<[string, ReturnType<typeof place>]> = [
    ["Calle Remanso Uno 10, fracc. Ciudad Bugambilias", place("Remanso Uno", null, "Ciudad Bugambilias")],
    ["Calle Iris 10, col. Bugambilias Segunda Sección", place("Iris", "Bugambilias Segunda Sección", null)],
    ["Calle Azalea 10, col. Bugambilias 1a Secc.", place("Azalea", "Bugambilias 1a Secc.", null)],
    ["Calle Pino 10, col. Jardines Inventados", place("Pino", "Jardines Inventados", null)],
  ];
  for (const [location, address] of rents) await createComparable(fixture.publicId, fixture.user, "INMUEBLE_RENTA", comparable(location, 200, 30_000, { address }));
  const from = await anotherValuation(fixture);

  const all = rents.slice(0, 3).map(([location]) => location).sort();
  assert.deepEqual(await found(fixture, from, query("", { neighborhood: "Bugambilias" })), all, "the colonia also finds the fraccionamiento");
  assert.deepEqual(await found(fixture, from, query("", { neighborhood: "bugambílias" })), all, "without accents or case");
  assert.deepEqual(await found(fixture, from, query("", { neighborhood: "Buganbilias" })), all, "misspelled");
  assert.deepEqual(await found(fixture, from, query("Bugambilia")), all, "the text, in the singular");
  assert.deepEqual(await found(fixture, from, query("", { neighborhood: "Bugambilias 2a sección" })), [rents[1][0]], "«2a» is «Segunda»");
  assert.deepEqual(await found(fixture, from, query("", { neighborhood: "Bugambilias primera" })), [rents[2][0]], "«primera» is «1a»");
  assert.deepEqual(await found(fixture, from, query("", { neighborhood: "Arandas" })), [], "another place is not found");

  // The Comparables page and its map read the same conditions: «Fraccionamiento» also finds a colonia.
  const base = await listComparableBase(fixture.organizationId, parseComparableListParams({ fraccionamiento: "bugambilas" }));
  assert.deepEqual(base.items.map((item) => item.location).sort(), all);
});

test("V8.13 (10:15): a pin saved in one valuation reaches the capture another valuation's search offers, its card and the map", async () => {
  const fixture = await createValuationFixture();
  await createComparable(fixture.publicId, fixture.user, "INMUEBLE_RENTA", comparable("Calle Remanso Dos 10, Villa Inventada", 300, 40_000, {
    address: place("Remanso Dos", "Bugambilias", "Ciudad Bugambilias"),
  }));
  const [original] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_RENTA")).comparables;
  assert.equal(original.latitude, null);

  // Added to a second valuation from the search, the pin is placed and saved there.
  const second = await anotherValuation(fixture);
  await reuseComparable(second, fixture.user, "INMUEBLE_RENTA", original.id);
  const [copy] = (await getMarketCalculation(second, fixture.organizationId, "INMUEBLE_RENTA")).comparables;
  assert.equal(copy.folio, original.folio);
  const { id: _id, reference: _reference, photos: _photos, screenshot: _screenshot, review: _review, updatedOn: _updated, folio: _folio, factors: _factors, ...values } = copy;
  await updateComparable(second, fixture.user, copy.id, { ...values, factors: [], latitude: 20.6027, longitude: -103.4532 } as ComparableInputPayload);

  const [first] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_RENTA")).comparables;
  assert.deepEqual([first.latitude, first.longitude], [20.6027, -103.4532], "the first valuation's capture took the pin");

  // Taken out of the second market, a third valuation's search still offers it with its pin, and its card shows it.
  await deleteComparable(second, fixture.user, copy.id);
  const third = await anotherValuation(fixture);
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: third }, select: { IdAvaluo: true } });
  const results = await ownBaseSource.search(query("Remanso Dos"), { organizationId: fixture.organizationId, valuationId: valuation.IdAvaluo, signal: new AbortController().signal });
  assert.ok(results.length >= 1);
  for (const result of results) assert.deepEqual([result.comparable.latitude, result.comparable.longitude], [20.6027, -103.4532]);
  const card = await getComparableCard(original.id, fixture.organizationId);
  assert.deepEqual(card.location, { latitude: 20.6027, longitude: -103.4532, approximate: false, address: null });
  const pins = await listComparablePins(fixture.organizationId, parseComparableListParams({ q: "Remanso Dos" }), { withThumbnails: false });
  assert.deepEqual(pins.pins.map((pin) => [pin.lat, pin.lon, pin.approximate ?? false]), [[20.6027, -103.4532, false]]);

  // «Ubicar» from the card moves it on every capture too.
  await setBaseComparableCoordinates(fixture.user, original.id, { latitude: 20.61, longitude: -103.46 });
  const [moved] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_RENTA")).comparables;
  assert.deepEqual([moved.latitude, moved.longitude], [20.61, -103.46]);
  const kept = await prisma.comparableAvaluo.findFirstOrThrow({ where: { UIdentificadorPublico: copy.id }, select: { JUbicacionSnapshot: true } });
  assert.deepEqual(kept.JUbicacionSnapshot, { latitude: 20.61, longitude: -103.46 }, "also the capture set aside");
});

test("V8.13 (08:40): a comparable without a pin is located roughly by its address, once, and the maps and its card show it as approximate", async () => {
  const fixture = await createValuationFixture();
  const street = `Calle Gladiola ${randomUUID().slice(0, 6)}`;
  await createComparable(fixture.publicId, fixture.user, "INMUEBLE_RENTA", comparable(`${street} 10, Villa Inventada`, 250, 25_000, {
    address: place(street, "Bugambilias", null),
  }));
  const [rent] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_RENTA")).comparables;
  const params = parseComparableListParams({ q: street });
  const before = await listComparablePins(fixture.organizationId, params, { withThumbnails: false });
  assert.deepEqual({ pins: before.pins.length, unlocated: before.unlocated, toLocate: before.toLocate }, { pins: 0, unlocated: 1, toLocate: 1 });

  const asked: string[] = [];
  const geocoder = async (text: string): Promise<GeocodingResult[]> => {
    asked.push(text);
    return [
      { address: "Otra calle, 44100 Guadalajara, Jal., México", point: [20.67, -103.35], precision: "ROOFTOP" },
      { address: `${street} 10, Bugambilias, 45999 Villa Inventada, Jal., México`, point: [20.6, -103.45], precision: "RANGE_INTERPOLATED" },
    ];
  };
  assert.deepEqual(await locateComparablePins(fixture.organizationId, params, { geocoder }), { pinned: 0, approximated: 1 });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /45999 Villa Inventada, Jalisco, México$/);

  const after = await listComparablePins(fixture.organizationId, params, { withThumbnails: false });
  assert.deepEqual(after.pins.map((pin) => [pin.lat, pin.lon, pin.approximate]), [[20.6, -103.45, true]], "the answer in its postal code and municipality");
  assert.deepEqual({ located: after.located, approximate: after.approximate, unlocated: after.unlocated, toLocate: after.toLocate }, { located: 0, approximate: 1, unlocated: 0, toLocate: 0 });
  const around = await comparablesAround(fixture.organizationId, [20.6, -103.45], 500, params, { withThumbnails: false });
  assert.equal(around.length, 1, "«Buscar alrededor de» finds it by its approximate location");

  // Its card shows it as approximate, and asking again does not look the address up again.
  const card = await getComparableCard(rent.id, fixture.organizationId);
  assert.equal(card.location?.approximate, true);
  assert.deepEqual(await locateComparable(fixture.organizationId, rent.id, { geocoder }), { location: card.location });
  assert.equal(asked.length, 1);

  // Saved again with the same address it keeps it; a pin replaces it.
  const { id: _id, reference: _reference, photos: _photos, screenshot: _screenshot, review: _review, updatedOn: _updated, folio: _folio, factors: _factors, ...values } = rent;
  await updateComparable(fixture.publicId, fixture.user, rent.id, { ...values, factors: [], notes: "Con alberca" } as ComparableInputPayload);
  assert.equal((await getComparableCard(rent.id, fixture.organizationId)).location?.approximate, true);
  await updateComparable(fixture.publicId, fixture.user, rent.id, { ...values, factors: [], latitude: 20.601, longitude: -103.451 } as ComparableInputPayload);
  assert.deepEqual((await getComparableCard(rent.id, fixture.organizationId)).location, { latitude: 20.601, longitude: -103.451, approximate: false, address: null });
});

test("V8.13 (13:44): «Guardar revisión» of several comparables at once: one state, every check of their market, their notes kept", async () => {
  const fixture = await createValuationFixture();
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Lote 1, Villa Inventada", 400, 2_000_000));
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Lote 2, Villa Inventada", 420, 2_100_000));
  await createComparable(fixture.publicId, fixture.user, "INMUEBLE_VENTA", comparable("Casa 3, Villa Inventada", 180, 3_000_000));
  const lands = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  const [house] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).comparables;

  const saved = await saveComparableReviews(fixture.publicId, fixture.user, {
    comparableIds: [...lands.map((item) => item.id), house.id], status: "CON_OBSERVACIONES", markAll: true,
  });
  assert.equal(saved.length, 3);
  const byId = new Map(saved.map((item) => [item.comparableId, item.review]));
  for (const land of lands) {
    const review = byId.get(land.id);
    assert.equal(review?.status, "CON_OBSERVACIONES");
    assert.equal(review?.checks.builtArea, undefined, "land has no built area to check");
    assert.equal(review?.checks.link, true);
  }
  assert.equal(byId.get(house.id)?.checks.builtArea, true);
  assert.equal(byId.get(house.id)?.reviewedBy, fixture.user.name);

  // A comparable that is no longer in the valuation: nothing is saved.
  const other = await anotherValuation(fixture);
  await createComparable(other, fixture.user, "TERRENO_VENTA", comparable("Lote 9, Villa Inventada", 400, 2_000_000));
  const [foreign] = (await getMarketCalculation(other, fixture.organizationId, "TERRENO_VENTA")).comparables;
  await assert.rejects(
    saveComparableReviews(fixture.publicId, fixture.user, { comparableIds: [lands[0].id, foreign.id], status: "VERIFICADO", markAll: false }),
    /ya no está en el avalúo/,
  );
  const [still] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  assert.equal(still.review?.status, "CON_OBSERVACIONES");
});
