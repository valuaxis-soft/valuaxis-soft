import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  deleteComparable,
  getMarketCalculation,
  saveMarketSettings,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, type ComparableType } from "../../src/features/valuations/calculation/market-types";
import { addFoundComparables, searchComparables } from "../../src/features/valuations/comparable-search/comparable-search.service";
import { ownBaseSource } from "../../src/features/valuations/comparable-search/sources/own-base.source";
import type { ComparableSearchQuery } from "../../src/features/valuations/comparable-search/types";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** Another valuation of the fixture's organization, to search from or to be found in. */
async function anotherValuation(fixture: Fixture, folio = `TEST-${randomUUID().slice(0, 8)}`) {
  const base = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion,
      IdUsuarioCreador: base.IdUsuarioCreador,
      IdEstadoAvaluo: base.IdEstadoAvaluo,
      IdTipoAvaluo: base.IdTipoAvaluo,
      IdTipoInmueble: base.IdTipoInmueble,
      IdTipoOperacion: base.IdTipoOperacion,
      SFolio: folio,
      STitulo: "Otro avalúo de prueba",
      DFechaModificacion: new Date(),
    },
  });
  return created.UIdentificadorPublico;
}

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: "Regular", zone: null, frontage: null, depth: null, topography: "Plano", services: "Completos",
    notes: null, sourceName: "Altos 360", contactName: null, contactPhone: null, url: null, offerDate: "2026-05-04",
    ...extra,
  };
}

const lands = [
  comparable("Calle Juárez 12, col. Centro, Arandas", 140, 1_260_000, { url: "https://portal.example/anuncio/1" }),
  comparable("Virreyes 30, Arandas", 140, 1_220_000, { notes: "Frente al jardín Hidalgo" }),
  comparable("16 de Septiembre 8, Arandas", 192.5, 2_032_590),
  comparable("Encino y Araucaria, Tepatitlán", 196.62, 2_261_130, { zone: "Peñón alto" }),
];

async function capture(publicId: string, fixture: Fixture, items: ComparableInputPayload[], type: ComparableType = "TERRENO_VENTA") {
  for (const item of items) await createComparable(publicId, fixture.user, type, item);
}

const query = (text: string, overrides: Partial<ComparableSearchQuery> = {}): ComparableSearchQuery =>
  ({ text, type: "TERRENO_VENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20, ...overrides });

async function locations(publicId: string, fixture: Fixture, search: ComparableSearchQuery) {
  const response = await searchComparables(publicId, fixture.user, search);
  assert.deepEqual(response.sources.map((source) => source.error), [null], "the own base answers");
  return response.results.map((result) => result.comparable.location).sort();
}

async function concludeAndReopen(publicId: string, fixture: Fixture) {
  // Concluding needs the document structure, created on the first save.
  await saveValuationSections({
    publicId, organizationId: fixture.organizationId, user: fixture.user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId, organizationId: fixture.organizationId, user: fixture.user });
  await reopenValuation({
    publicId, organizationId: fixture.organizationId,
    user: { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión de comparables", acceptedText: "Acepto reabrir el avalúo",
  });
}

test("the own base is searched by text without accents or case, by type and by ranges", async () => {
  const fixture = await createValuationFixture();
  await capture(fixture.publicId, fixture, lands);
  await capture(fixture.publicId, fixture, [comparable("Local en Juárez 40, Arandas", 80, 18_000)], "INMUEBLE_RENTA");
  const current = await anotherValuation(fixture);

  assert.deepEqual(await locations(current, fixture, query("ARANDAS")), [
    "16 de Septiembre 8, Arandas", "Calle Juárez 12, col. Centro, Arandas", "Virreyes 30, Arandas",
  ]);
  // Typed without the accent, found with it; and the other way around.
  assert.deepEqual(await locations(current, fixture, query("juarez")), ["Calle Juárez 12, col. Centro, Arandas"]);
  assert.deepEqual(await locations(current, fixture, query("Tépatitlan")), ["Encino y Araucaria, Tepatitlán"]);
  // Every word must be there, in any order; notes and zone count too.
  assert.deepEqual(await locations(current, fixture, query("arandas centro juarez")), ["Calle Juárez 12, col. Centro, Arandas"]);
  assert.deepEqual(await locations(current, fixture, query("jardin hidalgo")), ["Virreyes 30, Arandas"]);
  assert.deepEqual(await locations(current, fixture, query("penon")), ["Encino y Araucaria, Tepatitlán"]);
  assert.deepEqual(await locations(current, fixture, query("arandas zapopan")), []);
  // Punctuation, LIKE wildcards included, is not searched: only letters and digits reach the database.
  assert.deepEqual(await locations(current, fixture, query("%%%")), []);
  assert.deepEqual(await locations(current, fixture, query("%tepatitlan_")), ["Encino y Araucaria, Tepatitlán"]);

  // Ranges, both ends inclusive.
  assert.deepEqual(await locations(current, fixture, query("arandas", { areaMin: 150 })), ["16 de Septiembre 8, Arandas"]);
  assert.deepEqual(await locations(current, fixture, query("arandas", { areaMin: 140, areaMax: 140, priceMax: 1_220_000 })), ["Virreyes 30, Arandas"]);
  assert.deepEqual(await locations(current, fixture, query("arandas", { priceMin: 1_260_000, priceMax: 2_032_590 })), [
    "16 de Septiembre 8, Arandas", "Calle Juárez 12, col. Centro, Arandas",
  ]);

  // Only the type asked for.
  assert.deepEqual(await locations(current, fixture, query("juarez", { type: "INMUEBLE_RENTA" })), ["Local en Juárez 40, Arandas"]);
  assert.deepEqual(await locations(current, fixture, query("arandas", { type: "INMUEBLE_VENTA" })), []);

  // What a result carries: the source, the folio it came from, the link and the capture day.
  const [hit] = (await searchComparables(current, fixture.user, query("juarez"))).results;
  const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).SFolio;
  assert.equal(hit.sourceId, "despacho");
  assert.equal(hit.sourceLabel, "Comparables del despacho");
  assert.equal(hit.origin, `avalúo ${folio}`);
  assert.equal(hit.comparable.url, "https://portal.example/anuncio/1");
  assert.equal(hit.comparable.sourceName, "Altos 360");
  assert.equal(hit.comparable.offerDate, "2026-05-04");
  assert.match(hit.capturedOn ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(hit.photoCount, 0);
  assert.ok(!("factors" in hit.comparable), "factors depend on the subject and are not offered");
});

test("the valuation's own comparables are never offered to it, and deleted valuations are not searched", async () => {
  const fixture = await createValuationFixture();
  await capture(fixture.publicId, fixture, lands.slice(0, 2));
  assert.deepEqual(await locations(fixture.publicId, fixture, query("arandas")), [], "nothing from itself");

  const other = await anotherValuation(fixture);
  await capture(other, fixture, [lands[2], lands[1]]);
  // From the first: only what it does not have yet (Virreyes is in both).
  assert.deepEqual(await locations(fixture.publicId, fixture, query("arandas")), ["16 de Septiembre 8, Arandas"]);
  // From a third: Virreyes, captured in two valuations, comes once.
  const third = await anotherValuation(fixture);
  assert.deepEqual(await locations(third, fixture, query("arandas")), [
    "16 de Septiembre 8, Arandas", "Calle Juárez 12, col. Centro, Arandas", "Virreyes 30, Arandas",
  ]);

  await prisma.avaluo.update({ where: { UIdentificadorPublico: other }, data: { DFechaEliminacion: new Date() } });
  assert.deepEqual(await locations(third, fixture, query("arandas")), ["Calle Juárez 12, col. Centro, Arandas", "Virreyes 30, Arandas"]);
  await prisma.avaluo.update({ where: { UIdentificadorPublico: fixture.publicId }, data: { BActivo: false } });
  assert.deepEqual(await locations(third, fixture, query("arandas")), []);
});

test("after concluding and reopening, each comparable is offered once, as its valuation shows it today", async () => {
  const fixture = await createValuationFixture();
  await capture(fixture.publicId, fixture, lands.slice(0, 3));
  const current = await anotherValuation(fixture);

  // Concluded: the final version is what the valuation shows.
  await saveValuationSections({
    publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  assert.equal((await locations(current, fixture, query("arandas"))).length, 3);

  await reopenValuation({
    publicId: fixture.publicId, organizationId: fixture.organizationId,
    user: { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión de comparables", acceptedText: "Acepto reabrir el avalúo",
  });
  const rows = await prisma.comparableAvaluo.count({ where: { avaluo: { UIdentificadorPublico: fixture.publicId } } });
  assert.equal(rows, 6, "the three comparables now exist in two versions");
  assert.deepEqual(await locations(current, fixture, query("arandas")), [
    "16 de Septiembre 8, Arandas", "Calle Juárez 12, col. Centro, Arandas", "Virreyes 30, Arandas",
  ]);

  // Edited and deleted in the working version: the search follows it, not the concluded one.
  const working = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const virreyes = working.comparables.find((item) => item.location.startsWith("Virreyes"))!;
  const juarez = working.comparables.find((item) => item.location.includes("Juárez"))!;
  await updateComparable(fixture.publicId, fixture.user, virreyes.id, { ...lands[1], price: 1_300_000 });
  await deleteComparable(fixture.publicId, fixture.user, juarez.id);
  const response = await searchComparables(current, fixture.user, query("arandas"));
  assert.deepEqual(response.results.map((result) => [result.comparable.location, result.comparable.price]).sort(), [
    ["16 de Septiembre 8, Arandas", 2_032_590], ["Virreyes 30, Arandas", 1_300_000],
  ]);

  // A second round of versions does not multiply them either.
  await concludeAndReopen(fixture.publicId, fixture);
  assert.equal((await locations(current, fixture, query("arandas"))).length, 2);
});

test("the search never returns comparables of another organization", async () => {
  const mine = await createValuationFixture();
  const theirs = await createValuationFixture();
  const marker = `Fraccionamiento ${randomUUID().slice(0, 8)}`;
  // The same text in both organizations, with different figures to tell them apart.
  await capture(mine.publicId, mine, [comparable(`${marker} lote uno, Arandas`, 200, 1_000_000)]);
  await capture(theirs.publicId, theirs, [
    comparable(`${marker} lote uno, Arandas`, 300, 3_000_000, { url: "https://portal.example/de-otro-despacho" }),
    comparable(`${marker} lote dos, Arandas`, 310, 3_100_000, { notes: "Dato confidencial del otro despacho" }),
  ]);
  const myOther = await anotherValuation(mine);
  const theirOther = await anotherValuation(theirs);

  const offered = async (publicId: string, fixture: Fixture, text: string) =>
    (await searchComparables(publicId, fixture.user, query(text, { limit: 50 }))).results.map((result) => result.comparable.price);

  assert.deepEqual(await offered(myOther, mine, marker), [1_000_000]);
  assert.deepEqual((await offered(theirOther, theirs, marker)).sort(), [3_000_000, 3_100_000]);
  // Words that only the other organization wrote find nothing.
  assert.deepEqual(await offered(myOther, mine, "confidencial"), []);
  assert.deepEqual(await offered(myOther, mine, `${marker} dos`), []);
  // A broad word: whatever else the local database holds, every result is of an organization's own valuations.
  for (const [publicId, fixture] of [[myOther, mine], [theirOther, theirs]] as const) {
    const response = await searchComparables(publicId, fixture.user, query("arandas", { limit: 50 }));
    const ids = response.results.map((result) => result.id);
    const rows = await prisma.comparableAvaluo.findMany({
      where: { UIdentificadorPublico: { in: ids } },
      select: { avaluo: { select: { IdOrganizacion: true } } },
    });
    assert.equal(rows.length, ids.length);
    assert.ok(rows.every((row) => row.avaluo.IdOrganizacion === fixture.organizationId), "a comparable of another organization was offered");
  }

  // The source itself, asked directly: the organization of the context decides, whatever valuation id comes with it.
  const theirValuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: theirOther } });
  const direct = await ownBaseSource.search(query(marker), {
    organizationId: mine.organizationId, valuationId: theirValuation.IdAvaluo, signal: new AbortController().signal,
  });
  assert.deepEqual(direct.map((result) => result.comparable.price), [1_000_000]);

  // A valuation of another organization cannot be searched from, nor added to: it does not exist for this user.
  const notFound = (error: Error & { status?: number }) => error.status === 404;
  await assert.rejects(searchComparables(theirOther, mine.user, query(marker)), notFound);
  await assert.rejects(
    addFoundComparables(theirOther, mine.user, "TERRENO_VENTA", {
      results: [{ sourceId: "despacho", origin: null, comparable: comparable("Escrito por otro despacho", 1, 1) }],
    }),
    notFound,
  );
  assert.equal((await getMarketCalculation(theirOther, theirs.organizationId, "TERRENO_VENTA")).comparables.length, 0);
});

test("adding the chosen results creates comparables, recomputes, and they are not offered again", async () => {
  const fixture = await createValuationFixture();
  await capture(fixture.publicId, fixture, [
    { ...lands[0], factors: [{ type: "NEGOCIACION", value: 0.9, subjectRating: null, comparableRating: null, justification: null }] },
    lands[1], lands[2],
  ]);
  const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).SFolio;
  const current = await anotherValuation(fixture);
  await saveMarketSettings(current, fixture.user, {
    comparableType: "TERRENO_VENTA", subjectArea: 169.78, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  await capture(current, fixture, [comparable("Mixtecos 5, Arandas", 140, 1_330_000)]);
  const approach = async () => {
    const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: current } });
    return prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
  };
  const meanBefore = Number((await approach()).NValorPromedioHomologado);

  const found = (await searchComparables(current, fixture.user, query("arandas"))).results;
  assert.equal(found.length, 3);
  const chosen = found.filter((result) => !result.comparable.location.startsWith("Virreyes"))
    .map(({ sourceId, origin, comparable: item }) => ({ sourceId, origin, comparable: item }));
  assert.deepEqual(await addFoundComparables(current, fixture.user, "TERRENO_VENTA", { results: chosen }), { added: 2, skipped: 0 });

  const calculation = await getMarketCalculation(current, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(calculation.comparables.map((item) => item.reference), [1, 2, 3]);
  const added = calculation.comparables.find((item) => item.location.includes("Juárez"))!;
  assert.equal(added.area, 140);
  assert.equal(added.price, 1_260_000);
  assert.equal(added.url, "https://portal.example/anuncio/1");
  assert.equal(added.sourceName, "Altos 360");
  assert.equal(added.notes, `Encontrado en Comparables del despacho (avalúo ${folio}).`);
  assert.deepEqual(added.factors, [], "the factors of the other valuation's subject are not copied");
  assert.deepEqual(added.photos, []);

  // The stored result follows the three comparables.
  const stored = await approach();
  assert.notEqual(Number(stored.NValorPromedioHomologado).toFixed(2), meanBefore.toFixed(2));
  assert.ok(Number(stored.NValorMercado) > 0);

  // Searching again offers only what is left; adding the same again adds nothing.
  assert.deepEqual(await locations(current, fixture, query("arandas")), ["Virreyes 30, Arandas"]);
  assert.deepEqual(await addFoundComparables(current, fixture.user, "TERRENO_VENTA", { results: chosen }), { added: 0, skipped: 2 });
  assert.equal((await getMarketCalculation(current, fixture.organizationId, "TERRENO_VENTA")).comparables.length, 3);
  // The valuation they came from is untouched.
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables.length, 3);

  await assert.rejects(
    addFoundComparables(current, fixture.user, "TERRENO_VENTA", {
      results: [{ sourceId: "portal-inexistente", origin: null, comparable: comparable("Lote nuevo", 1, 1) }],
    }),
    (error: Error & { status?: number }) => error.status === 400,
  );
});

test("a concluded valuation can search but not add", async () => {
  const fixture = await createValuationFixture();
  await capture(fixture.publicId, fixture, lands.slice(0, 1));
  const current = await anotherValuation(fixture);
  await capture(current, fixture, [comparable("Mixtecos 5, Arandas", 140, 1_330_000)]);
  await saveValuationSections({
    publicId: current, organizationId: fixture.organizationId, user: fixture.user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: current, organizationId: fixture.organizationId, user: fixture.user });

  const found = (await searchComparables(current, fixture.user, query("arandas"))).results;
  assert.deepEqual(found.map((result) => result.comparable.location), ["Calle Juárez 12, col. Centro, Arandas"]);
  await assert.rejects(
    addFoundComparables(current, fixture.user, "TERRENO_VENTA", {
      results: found.map(({ sourceId, origin, comparable: item }) => ({ sourceId, origin, comparable: item })),
    }),
    (error: Error & { status?: number }) => error.status === 409,
  );
  assert.equal((await getMarketCalculation(current, fixture.organizationId, "TERRENO_VENTA")).comparables.length, 1);
});
