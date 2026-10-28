import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { findDuplicates, getComparableCard } from "../../src/features/valuations/calculation/comparable-card.service";
import { formatComparableId, todayInMexico } from "../../src/features/valuations/calculation/comparable-card";
import { addMonths } from "../../src/features/valuations/calculation/comparable-validity";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  getMarketCalculation,
  importComparables,
  reuseComparable,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { comparableFormValues, type ComparableType } from "../../src/features/valuations/calculation/market-types";
import { comparableAttributeNames, listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { createValuationFixture, prisma } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

after(() => prisma.$disconnect());

async function anotherValuation(base: Fixture, client: string | null) {
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: base.publicId } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: valuation.IdOrganizacion,
      IdUsuarioCreador: valuation.IdUsuarioCreador,
      IdEstadoAvaluo: valuation.IdEstadoAvaluo,
      IdTipoAvaluo: valuation.IdTipoAvaluo,
      IdTipoInmueble: valuation.IdTipoInmueble,
      IdTipoOperacion: valuation.IdTipoOperacion,
      SFolio: `TEST-${randomUUID().slice(0, 8)}`,
      STitulo: "Otro avalúo",
      SNombreCliente: client,
      DFechaModificacion: new Date(),
    },
  });
  return created.UIdentificadorPublico;
}

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Inmuebles24", contactName: "Ana López", contactPhone: null, url: null, offerDate: null,
    ...extra,
  };
}

const list = (organizationId: number, query: Record<string, string | string[]>, today?: string) =>
  listComparableBase(organizationId, parseComparableListParams(query), { today });
const comparablesOf = async (publicId: string, organizationId: number, type: ComparableType) =>
  (await getMarketCalculation(publicId, organizationId, type)).comparables;
const sixMonthsAgo = () => new Date(Date.now() - 200 * 86_400_000);

test("the base lists each comparable once, with the valuations and clients that used it, and filters by every characteristic", async () => {
  const owner = await createValuationFixture();
  await prisma.avaluo.update({ where: { UIdentificadorPublico: owner.publicId }, data: { SNombreCliente: "Banco del Bajío" } });
  const marker = randomUUID().slice(0, 6);
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable(`Juárez 12, col. Centro ${marker}, Arandas`, 180, 3_200_000, {
    address: { state: "Jalisco", municipality: "Arandas", postalCode: "47180", neighborhood: `Centro ${marker}`, street: "Juárez", number: "12" },
    landUse: "Habitacional H-3", landArea: 250, bedrooms: 3, bathrooms: 2.5, constructionType: "Casa habitación",
  }));
  await createComparable(owner.publicId, owner.user, "TERRENO_VENTA", comparable(`Hidalgo 8, col. Llano ${marker}, Tepatitlán`, 400, 1_200_000, {
    address: { state: "Jalisco", municipality: "Tepatitlán", postalCode: "47600", neighborhood: `Llano ${marker}` },
    landUse: "Comercial",
  }));
  const [house] = await comparablesOf(owner.publicId, owner.organizationId, "INMUEBLE_VENTA");
  const [land] = await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA");
  // The house is used again in a valuation of another client.
  const second = await anotherValuation(owner, "Grupo Altos");
  await reuseComparable(second, owner.user, "INMUEBLE_VENTA", house.id);

  const all = await list(owner.organizationId, {});
  assert.equal(all.total, 2, "the house reused in two valuations is one comparable of the base");
  const houseRow = all.items.find((item) => item.folio === house.folio);
  assert.ok(houseRow);
  assert.equal(houseRow.uses.length, 2);
  assert.deepEqual(houseRow.uses.map((use) => use.client).sort(), ["Banco del Bajío", "Grupo Altos"]);
  assert.equal(houseRow.landArea, 250);
  assert.equal(houseRow.builtArea, 180);
  assert.equal(houseRow.bedrooms, 3);
  assert.equal(houseRow.bathrooms, 2.5);
  assert.equal(houseRow.constructionType, "Casa habitación");
  assert.equal(houseRow.validity.updatedOn, todayInMexico());
  assert.equal(houseRow.validity.validUntil, addMonths(todayInMexico(), 6));
  assert.equal(houseRow.validity.expired, false);

  const folios = async (query: Record<string, string | string[]>) => (await list(owner.organizationId, query)).items.map((item) => item.folio);
  assert.deepEqual(await folios({ cliente: "grupo altos" }), [house.folio], "used in valuations of that client");
  assert.deepEqual((await folios({ cliente: "bajio" })).sort(), [house.folio, land.folio].sort(), "both were used for that client");
  assert.deepEqual(await folios({ municipio: "tepatitlan" }), [land.folio], "without accents");
  assert.deepEqual(await folios({ colonia: `centro ${marker}` }), [house.folio]);
  assert.deepEqual(await folios({ cp: "47600" }), [land.folio]);
  assert.deepEqual(await folios({ tipo: "TERRENO_VENTA" }), [land.folio]);
  assert.deepEqual((await folios({ tipo: ["TERRENO_VENTA", "INMUEBLE_VENTA"] })).length, 2);
  assert.deepEqual(await folios({ operacion: "renta" }), []);
  assert.deepEqual(await folios({ construccion: "casa" }), [house.folio]);
  assert.deepEqual(await folios({ uso: "comercial" }), [land.folio]);
  assert.deepEqual(await folios({ terrenoMin: "300" }), [land.folio], "the land area of a house is its own field");
  assert.deepEqual(await folios({ terrenoMin: "200", terrenoMax: "260" }), [house.folio]);
  assert.deepEqual(await folios({ construidaMin: "150", construidaMax: "200" }), [house.folio]);
  assert.deepEqual(await folios({ recamaras: "3" }), [house.folio]);
  assert.deepEqual(await folios({ recamaras: "4" }), []);
  assert.deepEqual(await folios({ banos: "2" }), [house.folio]);
  assert.deepEqual(await folios({ q: formatComparableId(land.folio) ?? "" }), [land.folio], "the number finds the comparable");
  assert.deepEqual(await folios({ q: "juarez" }), [house.folio]);
  assert.deepEqual(await folios({ orden: "precio_asc" }), [land.folio, house.folio]);
  assert.deepEqual(await folios({ orden: "precio_desc" }), [house.folio, land.folio]);
  assert.deepEqual(await folios({ desde: todayInMexico(), hasta: todayInMexico() }).then((items) => items.length), 2);
  assert.deepEqual(await folios({ hasta: "2020-01-01" }), []);

  // Pages.
  const first = await listComparableBase(owner.organizationId, parseComparableListParams({ orden: "numero" }), { pageSize: 1 });
  const next = await listComparableBase(owner.organizationId, parseComparableListParams({ orden: "numero", page: "2" }), { pageSize: 1 });
  assert.equal(first.total, 2);
  assert.equal(next.total, 2);
  assert.notEqual(first.items[0].folio, next.items[0].folio);
  const past = await listComparableBase(owner.organizationId, parseComparableListParams({ page: "9" }), { pageSize: 1 });
  assert.deepEqual([past.items.length, past.total], [0, 2], "past the last page there is still the total");

  // Expired comparables are marked, never hidden unless asked.
  await prisma.comparableAvaluo.updateMany({
    where: { UIdentificadorPublico: land.id },
    data: { DFechaActualizacionDatos: sixMonthsAgo() },
  });
  assert.deepEqual(await folios({ vigencia: "vencido" }), [land.folio]);
  assert.deepEqual(await folios({ vigencia: "vigente" }), [house.folio]);
  assert.equal((await list(owner.organizationId, {})).items.find((item) => item.folio === land.folio)?.validity.expired, true);

  // Another firm sees none of it.
  const stranger = await createValuationFixture();
  assert.deepEqual(await list(stranger.organizationId, {}), { items: [], total: 0 });
  assert.deepEqual((await list(stranger.organizationId, { q: formatComparableId(land.folio) ?? "" })).items, []);
});

test("updating a comparable's data renews its validity; rating its factors or reusing it does not", async () => {
  const owner = await createValuationFixture();
  await createComparable(owner.publicId, owner.user, "TERRENO_VENTA", comparable("Morelos 5, col. Centro, Arandas", 300, 900_000));
  const [stored] = await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA");
  assert.equal(stored.updatedOn, todayInMexico());
  const old = sixMonthsAgo();
  await prisma.comparableAvaluo.updateMany({ where: { UIdentificadorPublico: stored.id }, data: { DFechaActualizacionDatos: old } });
  const card = await getComparableCard(stored.id, owner.organizationId);
  assert.equal(card.validity.expired, true);
  assert.ok(card.warnings.some((warning) => warning.key === "EXPIRED"), "the card warns, nothing blocks");

  // Rating a factor is homologation work: the date stays.
  const [expired] = await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA");
  await updateComparable(owner.publicId, owner.user, expired.id, {
    ...comparableFormValues(expired),
    factors: [{ type: "ZONA", value: 1.05, subjectRating: null, comparableRating: null, justification: null }],
  });
  assert.equal((await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA"))[0].updatedOn, todayInMexico(old));

  // A reused comparable keeps the date of its data.
  const second = await anotherValuation(owner, null);
  await reuseComparable(second, owner.user, "TERRENO_VENTA", expired.id);
  assert.equal((await comparablesOf(second, owner.organizationId, "TERRENO_VENTA"))[0].updatedOn, todayInMexico(old));

  // Changing its data renews it.
  const [rated] = await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA");
  await updateComparable(owner.publicId, owner.user, rated.id, { ...comparableFormValues(rated), price: 950_000 });
  const [renewed] = await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA");
  assert.equal(renewed.updatedOn, todayInMexico());
  const renewedCard = await getComparableCard(renewed.id, owner.organizationId);
  assert.equal(renewedCard.validity.expired, false);
  assert.equal(renewedCard.warnings.some((warning) => warning.key === "EXPIRED"), false);
  assert.equal((await list(owner.organizationId, { vigencia: "vencido" })).total, 0, "the base takes the latest data of the comparable");
});

test("a possible duplicate is the same (most recent data, existing number) or a different one (both kept)", async () => {
  const owner = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  await createComparable(owner.publicId, owner.user, "TERRENO_VENTA", comparable(`Allende 30, col. ${marker}, Arandas`, 500, 1_500_000, {
    offerDate: "2026-09-01",
  }));
  const [source] = await comparablesOf(owner.publicId, owner.organizationId, "TERRENO_VENTA");
  const next = await anotherValuation(owner, null);

  // Almost everything the same but the number of the street: found as similar.
  const similar = await findDuplicates(next, owner.organizationId, {
    url: null, location: `Allende, col. ${marker}, Arandas`, contactPhone: null, price: 1_505_000, area: 500,
  });
  assert.deepEqual(similar.map((match) => [match.comparableId, match.reasons]), [[source.id, ["SIMILAR"]]]);
  assert.equal(similar[0].updatedOn, todayInMexico());
  // Another price is still the same place and area: a possible duplicate the appraiser decides on (27 Oct 2026),
  // the case that went unnoticed when every rule asked for the same price.
  assert.deepEqual((await findDuplicates(next, owner.organizationId, {
    url: null, location: `Allende, col. ${marker}, Arandas`, contactPhone: null, price: 1_800_000, area: 500,
  })).map((match) => [match.comparableId, match.reasons]), [[source.id, ["PLACE_AREA"]]]);
  assert.deepEqual(await findDuplicates(next, owner.organizationId, {
    url: null, location: `Allende, col. ${marker}, Arandas`, contactPhone: null, price: 1_800_000, area: 650,
  }), [], "another area is another property");

  // "Es el mismo": the capture's data under the existing number.
  await createComparable(next, owner.user, "TERRENO_VENTA", comparable(`Allende 30, col. ${marker}, Arandas`, 500, 1_450_000, {
    consultedOn: todayInMexico(),
  }), { mergeInto: source.id });
  const [merged] = await comparablesOf(next, owner.organizationId, "TERRENO_VENTA");
  assert.equal(merged.folio, source.folio);
  assert.equal(merged.price, 1_450_000, "the most recent data stays");
  const base = await list(owner.organizationId, { q: formatComparableId(source.folio) ?? "" });
  assert.equal(base.total, 1);
  assert.equal(base.items[0].price, 1_450_000);
  assert.equal(base.items[0].uses.length, 2);

  // An import row of an older offer answered "es el mismo": the base's data is the more recent, so it stays.
  const third = await anotherValuation(owner, null);
  await importComparables(third, owner.user, "TERRENO_VENTA", [
    { mergeInto: merged.id, payload: comparable(`Allende 30, col. ${marker}, Arandas`, 500, 1_300_000, { offerDate: "2026-01-15" }) },
    comparable(`Allende 30, col. ${marker}, Arandas`, 500, 1_450_000),
  ]);
  const imported = await comparablesOf(third, owner.organizationId, "TERRENO_VENTA");
  assert.equal(imported[0].folio, source.folio);
  assert.equal(imported[0].price, 1_450_000, "the older offer did not replace the newer data");
  assert.notEqual(imported[1].folio, source.folio, "\"son diferentes\": both are kept, each with its number");

  // Another firm cannot merge into this one.
  const stranger = await createValuationFixture();
  await assert.rejects(
    createComparable(stranger.publicId, stranger.user, "TERRENO_VENTA", comparable("Allende 30", 500, 1_450_000), { mergeInto: source.id }),
    (error: Error & { status?: number }) => error.status === 404,
  );
});

test("characteristics added to a comparable are kept, offered by name, and filter the base by name and value", async () => {
  const owner = await createValuationFixture();
  const marker = randomUUID().slice(0, 8);
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable(`Juárez 40, col. Centro ${marker}, Arandas`, 150, 2_500_000, {
    attributes: [{ name: "Alberca", value: "Sí, techada" }, { name: "Vista", value: "Al lago" }, { name: "", value: "sin nombre" }],
  }));
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable(`Juárez 42, col. Centro ${marker}, Arandas`, 150, 2_400_000, {
    attributes: [{ name: "Alberca", value: "No" }],
  }));
  const [first] = await comparablesOf(owner.publicId, owner.organizationId, "INMUEBLE_VENTA");
  assert.deepEqual(first.attributes, [{ name: "Alberca", value: "Sí, techada" }, { name: "Vista", value: "Al lago" }]);

  // An edit from a client of before (without attributes) keeps them.
  const { attributes: _attributes, ...values } = comparableFormValues(first);
  await updateComparable(owner.publicId, owner.user, first.id, { ...values, notes: "Revisado" });
  assert.equal((await comparablesOf(owner.publicId, owner.organizationId, "INMUEBLE_VENTA"))[0].attributes?.length, 2);

  const names = await comparableAttributeNames(owner.organizationId);
  assert.ok(names.includes("Alberca") && names.includes("Vista"));
  const locations = async (query: Record<string, string>) =>
    (await list(owner.organizationId, { q: marker, ...query })).items.map((item) => item.location).sort();
  assert.deepEqual(await locations({ caracteristica: "alberca" }), [`Juárez 40, col. Centro ${marker}, Arandas`, `Juárez 42, col. Centro ${marker}, Arandas`]);
  assert.deepEqual(await locations({ caracteristica: "alberca", valorCaracteristica: "si" }), [`Juárez 40, col. Centro ${marker}, Arandas`], "the value without accents or case");
  assert.deepEqual(await locations({ valorCaracteristica: "lago" }), [`Juárez 40, col. Centro ${marker}, Arandas`], "a value alone looks in every characteristic");
  assert.deepEqual(await locations({ caracteristica: "jardín" }), []);
});
