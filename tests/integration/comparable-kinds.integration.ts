/**
 * Kinds of comparable, real estate and machinery apart, offers in dollars and
 * age, against the database (24 Nov 2026). Each test makes its own firm.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { addCustomComparableKind, getCustomComparableKinds, removeCustomComparableKind } from "../../src/features/firm/comparable-kinds.service";
import { addCustomUnit, addFirmListItem, getCustomUnits, getFirmLists } from "../../src/features/firm/firm.service";
import { findDuplicates } from "../../src/features/valuations/calculation/comparable-card.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation } from "../../src/features/valuations/calculation/market.service";
import { createBaseComparable } from "../../src/features/valuations/comparable-base/comparable-base-write.service";
import { listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { searchComparables } from "../../src/features/valuations/comparable-search/comparable-search.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

function comparable(location: string, area: number | null, price: number | null, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal Ejemplo", contactName: null, contactPhone: null, url: null, offerDate: "2026-11-20",
    ...extra,
  };
}

const list = (organizationId: number, query: Record<string, string>) => listComparableBase(organizationId, parseComparableListParams(query));

test("a firm extends the kinds: kept once, for that firm only, and taken out without touching the comparables", async () => {
  const firm = await createValuationFixture();
  const other = await createValuationFixture();
  // The firm's units (and its other lists) share the JSON list: they stay.
  await prisma.organizacion.update({ where: { IdOrganizacion: firm.organizationId }, data: { JUnidadesPersonalizadas: ["piezas"] } });
  const added = await addCustomComparableKind(firm.user, "Retroexcavadora", "MAQUINARIA");
  assert.deepEqual(added.kind, { key: "custom:retroexcavadora", label: "Retroexcavadora", class: "MAQUINARIA" });
  const again = await addCustomComparableKind(firm.user, "retroexcavadora", "MAQUINARIA");
  assert.equal(again.kinds.length, 1, "the same name is not kept twice");
  await addCustomComparableKind(firm.user, "Oficina", "INMUEBLE");
  assert.deepEqual((await getCustomComparableKinds(firm.organizationId)).map((kind) => kind.label), ["Retroexcavadora"], "one of Valuaxis is not added");
  assert.deepEqual(await getCustomComparableKinds(other.organizationId), [], "another firm does not see it");
  const units = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: firm.organizationId }, select: { JUnidadesPersonalizadas: true } });
  assert.deepEqual(units.JUnidadesPersonalizadas, ["piezas", { lista: "tipoComparable", clase: "MAQUINARIA", nombre: "Retroexcavadora" }]);
  // Saving a unit and an item of the firm's other lists (#160) keeps the kinds, and the other way round.
  await addCustomUnit(firm.user, "lotes");
  await addFirmListItem(firm.user, { list: "queSeValua", appraisalClass: "MAQUINARIA", name: "Grúa" });
  assert.deepEqual((await getCustomComparableKinds(firm.organizationId)).map((kind) => kind.label), ["Retroexcavadora"]);
  assert.deepEqual(await getCustomUnits(firm.organizationId), ["piezas", "lotes"]);
  assert.deepEqual((await getFirmLists(firm.organizationId)).essences.MAQUINARIA, ["Grúa"]);

  const machine = await createBaseComparable(firm.user, "INMUEBLE_VENTA", comparable("Patio Ficticio 3, Arandas", null, 950_000, {
    propertyDetails: { kind: "custom:retroexcavadora", kindLabel: "Retroexcavadora", assetClass: "MAQUINARIA" },
  }));
  await removeCustomComparableKind(firm.user, "custom:retroexcavadora");
  assert.deepEqual(await getCustomComparableKinds(firm.organizationId), []);
  const [item] = (await list(firm.organizationId, { tipoBien: "custom:retroexcavadora" })).items;
  assert.equal(item.id, machine.id);
  assert.equal(item.kind?.label, "Retroexcavadora", "the comparable keeps the name it was captured with");
});

test("real estate and machinery never mix: the valuation's market, its search, the duplicates and the base's filters", async () => {
  const firm = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  const phone = "3480001122";
  const house = await createBaseComparable(firm.user, "INMUEBLE_VENTA", comparable(`Hidalgo 12, col. Centro ${marker}, Arandas`, 150, 2_000_000, {
    contactPhone: phone, propertyDetails: { kind: "CASA_HABITACION", assetClass: "INMUEBLE" },
  }));
  // A machine with the same phone, area and price as the house: still not its duplicate.
  const machine = await createBaseComparable(firm.user, "INMUEBLE_VENTA", comparable(`Patio Hidalgo ${marker}, Arandas`, 150, 2_000_000, {
    contactPhone: phone, propertyDetails: { kind: "MAQUINARIA_CONSTRUCCION", assetClass: "MAQUINARIA", year: 2018, age: 8 },
    machinery: { brand: "Marca Ficticia" },
  }));
  // A machine has one «Año»: the one of its data (#160), beside the rest of them.
  const stored = await prisma.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: machine.id } });
  const snapshot = stored.JPropiedadSnapshot as { details?: { year?: unknown }; machinery?: unknown };
  assert.deepEqual(snapshot.machinery, { brand: "Marca Ficticia", year: 2018 });
  assert.equal(snapshot.details?.year, null);
  // One of before, with only its type of construction.
  const flat = await createBaseComparable(firm.user, "INMUEBLE_VENTA", comparable(`Juárez 4 depto 2, ${marker}, Arandas`, 80, 1_100_000, {
    constructionType: "Departamento",
  }));

  const realEstate = await findDuplicates(null, firm.organizationId, { url: null, location: "", contactPhone: phone, price: 2_000_000, area: 150 });
  assert.deepEqual(realEstate.map((match) => match.comparableId), [house.id]);
  const machinery = await findDuplicates(null, firm.organizationId, { url: null, location: "", contactPhone: phone, price: 2_000_000, area: 150, assetClass: "MAQUINARIA" });
  assert.deepEqual(machinery.map((match) => match.comparableId), [machine.id]);

  // The search of a valuation's market (real estate) does not bring the machine.
  const found = await searchComparables(firm.publicId, firm.user, {
    text: marker, type: "INMUEBLE_VENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20,
  });
  const foundLocations = found.results.map((hit) => hit.comparable.location).sort();
  assert.deepEqual(foundLocations, [`Hidalgo 12, col. Centro ${marker}, Arandas`, `Juárez 4 depto 2, ${marker}, Arandas`]);
  const flats = await searchComparables(firm.publicId, firm.user, {
    text: marker, type: "INMUEBLE_VENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20, filters: { kind: "DEPARTAMENTO" },
  });
  assert.deepEqual(flats.results.map((hit) => hit.comparable.location), [`Juárez 4 depto 2, ${marker}, Arandas`], "a comparable of before by its type of construction");

  // The base shows both, and filters by class and kind; the item says its kind, class and age.
  const ids = async (query: Record<string, string>) => (await list(firm.organizationId, { q: marker, ...query })).items.map((item) => item.id).sort();
  assert.deepEqual(await ids({}), [house.id, machine.id, flat.id].sort());
  assert.deepEqual(await ids({ clase: "maquinaria" }), [machine.id]);
  assert.deepEqual(await ids({ clase: "inmueble" }), [house.id, flat.id].sort());
  assert.deepEqual(await ids({ tipoBien: "DEPARTAMENTO" }), [flat.id]);
  const item = (await list(firm.organizationId, { q: marker, clase: "maquinaria" })).items[0];
  assert.deepEqual([item.kind?.label, item.assetClass, item.age, item.year], ["Maquinaria de construcción", "MAQUINARIA", 8, 2018]);

  // A machine never goes into a market of the valuation.
  await assert.rejects(
    createComparable(firm.publicId, firm.user, "INMUEBLE_VENTA", comparable("Patio 9, Arandas", null, 500_000, { propertyDetails: { kind: "CAMION" } })),
    /maquinaria y equipo no va en un mercado de inmuebles/,
  );
});

test("an offer in dollars is stored with its pesos, the calculation uses them, and without a rate it waits", async () => {
  const firm = await createValuationFixture();
  await createComparable(firm.publicId, firm.user, "TERRENO_VENTA", comparable("Calle Ficticia 1, Arandas", 200, 1, {
    listingDetails: { currency: "USD", priceInCurrency: 100_000, exchangeRate: 18.3456, exchangeRateDate: "2026-11-24" },
  }));
  await createComparable(firm.publicId, firm.user, "TERRENO_VENTA", comparable("Calle Ficticia 2, Arandas", 200, null, {
    listingDetails: { currency: "USD", priceInCurrency: 90_000 },
  }));
  const market = await getMarketCalculation(firm.publicId, firm.organizationId, "TERRENO_VENTA");
  const [withRate, waiting] = market.comparables;
  assert.equal(withRate.price, 1_834_560);
  assert.deepEqual(withRate.listingDetails, {
    currency: "USD", priceInCurrency: 100_000, exchangeRate: 18.3456, exchangeRateDate: "2026-11-24",
    exchangeRateSource: "Tipo de cambio FIX publicado en el DOF del 24/11/2026",
  });
  assert.equal(withRate.propertyDetails, null, "nothing of a kind was sent");
  assert.equal(waiting.price, null);
  assert.equal(waiting.listingDetails?.priceInCurrency, 90_000);
  const stored = await prisma.comparableAvaluo.findFirstOrThrow({ where: { UIdentificadorPublico: withRate.id } });
  assert.equal(Number(stored.NPrecioCapturado), 1_834_560, "the price column the filters read is in pesos");
  assert.equal(Number(stored.NValorUnitarioCapturado), 9172.8);
});
