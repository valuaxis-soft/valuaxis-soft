/**
 * Etapa 3 of the maps: the pins of the base of comparables obey the list's
 * filters and count the ones without coordinates; the radius search runs in
 * PostGIS (ST_DWithin over the captured coordinates) and answers closest
 * first; the valuations of the firm appear with their located subject; and
 * nothing crosses organizations.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { comparablesAround, listComparablePins, listValuationPins } from "../../src/features/maps/base-map/base-map.service";
import { distanceMeters } from "../../src/features/maps/base-map/radius";
import { saveSubjectLocation } from "../../src/features/maps/server/subject-location.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation } from "../../src/features/valuations/calculation/market.service";
import type { ComparableType } from "../../src/features/valuations/calculation/market-types";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

/** Calle Perla 3890, Loma Bonita Sur, Zapopan: the subject of the demonstration. */
const PERLA: [number, number] = [20.63442, -103.40239];
/** Degrees of latitude per meter, near enough at Zapopan. */
const METER = 1 / 111_195;

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Inmuebles24", contactName: null, contactPhone: null, url: "https://ejemplo.test/anuncio", offerDate: null,
    ...extra,
  };
}

const params = (query: Record<string, string | string[]> = {}) => parseComparableListParams(query);

test("the pins are the comparables with coordinates under the list's filters; the ones without count as 'sin ubicar'", async () => {
  const fixture = await createValuationFixture();
  const { publicId, user, organizationId } = fixture;
  const add = (type: ComparableType, payload: ComparableInputPayload) => createComparable(publicId, user, type, payload);
  // 150 m north, 400 m east, 2 km south, and one without coordinates.
  await add("INMUEBLE_VENTA", comparable("Casa a 150 m", 180, 3_200_000, { latitude: PERLA[0] + 150 * METER, longitude: PERLA[1], bedrooms: 3, bathrooms: 2 }));
  await add("TERRENO_VENTA", comparable("Terreno a 400 m", 300, 1_500_000, { latitude: PERLA[0], longitude: PERLA[1] + (400 * METER) / Math.cos((PERLA[0] * Math.PI) / 180) }));
  await add("INMUEBLE_RENTA", comparable("Renta a 2 km", 120, 18_000, { latitude: PERLA[0] - 2000 * METER, longitude: PERLA[1] }));
  await add("INMUEBLE_VENTA", comparable("Sin coordenadas", 200, 2_900_000));

  const all = await listComparablePins(organizationId, params(), { withThumbnails: false });
  assert.equal(all.located, 3);
  assert.equal(all.unlocated, 1);
  assert.deepEqual(all.pins.map((pin) => pin.location).sort(), ["Casa a 150 m", "Renta a 2 km", "Terreno a 400 m"]);
  const house = all.pins.find((pin) => pin.location === "Casa a 150 m")!;
  assert.equal(house.type, "INMUEBLE_VENTA");
  assert.equal(house.operationType, "VENTA");
  assert.ok(Math.abs(house.lat - (PERLA[0] + 150 * METER)) < 1e-9 && Math.abs(house.lon - PERLA[1]) < 1e-9);
  assert.equal(house.price, 3_200_000);
  assert.equal(house.area, 180);
  assert.equal(house.bedrooms, 3);
  assert.equal(house.url, "https://ejemplo.test/anuncio");
  assert.equal(house.expired, false);
  assert.ok(house.folio && house.folio > 0, "the number of the base travels with the pin");
  const market = await getMarketCalculation(publicId, organizationId, "INMUEBLE_VENTA");
  assert.ok(market.comparables.some((item) => item.id === house.id), "the pin's id is the capture 'Usar el existente' takes");

  // The filters of the list apply as they are: type, text, and "sin ubicar".
  const land = await listComparablePins(organizationId, params({ tipo: "TERRENO_VENTA" }), { withThumbnails: false });
  assert.deepEqual(land.pins.map((pin) => pin.location), ["Terreno a 400 m"]);
  assert.equal(land.unlocated, 0);
  const byText = await listComparablePins(organizationId, params({ q: "renta 2 km" }), { withThumbnails: false });
  assert.deepEqual(byText.pins.map((pin) => pin.location), ["Renta a 2 km"]);
  const unlocated = await listComparablePins(organizationId, params({ ubicacion: "sin" }), { withThumbnails: false });
  assert.equal(unlocated.pins.length, 0);
  assert.equal(unlocated.unlocated, 1);
  const capped = await listComparablePins(organizationId, params(), { withThumbnails: false, maxPins: 2 });
  assert.equal(capped.pins.length, 2, "the cap holds back pins");
  assert.equal(capped.located, 3, "but the count says how many there are");

  // Another firm sees nothing of this one.
  const other = await createValuationFixture();
  const theirs = await listComparablePins(other.organizationId, params(), { withThumbnails: false });
  assert.equal(theirs.pins.length + theirs.located + theirs.unlocated, 0);
});

test("the radius search answers the comparables within the meters asked, closest first, with the filters of the list", async () => {
  const { publicId, user, organizationId } = await createValuationFixture();
  const add = (type: ComparableType, payload: ComparableInputPayload) => createComparable(publicId, user, type, payload);
  await add("INMUEBLE_VENTA", comparable("A 350 m", 180, 3_000_000, { latitude: PERLA[0] + 350 * METER, longitude: PERLA[1] }));
  await add("TERRENO_VENTA", comparable("A 90 m", 300, 1_500_000, { latitude: PERLA[0] - 90 * METER, longitude: PERLA[1] }));
  await add("INMUEBLE_VENTA", comparable("A 480 m", 150, 2_500_000, { latitude: PERLA[0], longitude: PERLA[1] - (480 * METER) / Math.cos((PERLA[0] * Math.PI) / 180) }));
  await add("INMUEBLE_VENTA", comparable("A 1.5 km", 150, 2_500_000, { latitude: PERLA[0] + 1500 * METER, longitude: PERLA[1] }));
  await add("INMUEBLE_VENTA", comparable("Sin coordenadas", 150, 2_500_000));

  const within500 = await comparablesAround(organizationId, PERLA, 500, params(), { withThumbnails: false });
  assert.deepEqual(within500.map((hit) => hit.location), ["A 90 m", "A 350 m", "A 480 m"]);
  for (const hit of within500) {
    const expected = distanceMeters(PERLA, [hit.lat, hit.lon]);
    assert.ok(Math.abs(hit.distance - expected) < 2, `${hit.location}: PostGIS says ${hit.distance} m, haversine ${expected} m`);
  }
  assert.ok(within500[0].distance > 85 && within500[0].distance < 95);

  const within100 = await comparablesAround(organizationId, PERLA, 100, params(), { withThumbnails: false });
  assert.deepEqual(within100.map((hit) => hit.location), ["A 90 m"]);

  const housesWithin500 = await comparablesAround(organizationId, PERLA, 500, params({ tipo: "INMUEBLE_VENTA" }), { withThumbnails: false });
  assert.deepEqual(housesWithin500.map((hit) => hit.location), ["A 350 m", "A 480 m"], "the layer filter of the list narrows the hits");

  const elsewhere = await comparablesAround(organizationId, [19.4326, -99.1332], 5000, params(), { withThumbnails: false });
  assert.deepEqual(elsewhere, [], "nothing within 5 km of the Zócalo");

  const other = await createValuationFixture();
  assert.deepEqual(await comparablesAround(other.organizationId, PERLA, 5000, params(), { withThumbnails: false }), [], "another firm's base is not read");
});

test("the map of valuations shows each located subject of the firm, with folio, client and status", async () => {
  const fixture = await createValuationFixture();
  const { publicId, user, organizationId } = fixture;
  await prisma.avaluo.update({ where: { UIdentificadorPublico: publicId }, data: { SNombreCliente: "Banco del Bajío" } });
  assert.deepEqual(await listValuationPins(organizationId), [], "nothing until a subject is located");
  await saveSubjectLocation(publicId, user, { location: { point: PERLA, address: "Calle Perla 3890, Zapopan", source: "busqueda" } });

  const pins = await listValuationPins(organizationId);
  assert.equal(pins.length, 1);
  const [pin] = pins;
  assert.equal(pin.id, publicId);
  assert.equal(pin.client, "Banco del Bajío");
  assert.equal(pin.status, "nuevo");
  assert.equal(pin.statusName.length > 0, true);
  assert.equal(pin.archived, false);
  assert.deepEqual([pin.lat, pin.lon], PERLA);
  assert.equal(pin.address, "Calle Perla 3890, Zapopan");

  // Archived valuations stay on the map, marked; deleted ones leave it; other firms never see it.
  await prisma.avaluo.update({ where: { UIdentificadorPublico: publicId }, data: { DFechaArchivo: new Date() } });
  assert.equal((await listValuationPins(organizationId))[0].archived, true);
  const other = await createValuationFixture();
  assert.deepEqual(await listValuationPins(other.organizationId), []);
  await prisma.avaluo.update({ where: { UIdentificadorPublico: publicId }, data: { DFechaEliminacion: new Date() } });
  assert.deepEqual(await listValuationPins(organizationId), []);
});
