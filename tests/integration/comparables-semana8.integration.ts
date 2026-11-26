/**
 * Week 8 of the comparables (videos 8.7 to 8.12 and the audio of 26 nov 2026)
 * against the local database, with a fake in place of the AI provider: the
 * history of «Buscar con IA» and its count of listings found, the cards that
 * stay in the firm's base after leaving a valuation (C-00144…147), «Es el
 * mismo: actualizar los datos de su ficha», the firm's states of the review,
 * the trash of old comparables (numbers never given again), the search from
 * the machinery panel and «Pegar anuncio» that failed now and then. Every
 * place, listing and person is invented.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, test } from "node:test";

import { proposeComparableFromListing, LISTING_UNREADABLE, AiAssistError } from "../../src/features/ai/ai-assist.service";
import { AiGatewayError, type AiGateway } from "../../src/features/ai/ai-gateway";
import { overrideAiGateway, overrideAiWebSearch } from "../../src/features/ai/ai-gateway-provider";
import { getComparableReviewSettings, saveReviewStatuses } from "../../src/features/firm/comparable-review-settings.service";
import { createComparable, deleteComparable, getMarketCalculation, saveComparableReview } from "../../src/features/valuations/calculation/market.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { createBaseComparable } from "../../src/features/valuations/comparable-base/comparable-base-write.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { listTrash, previewOldComparables, restoreFromTrash, trashOldComparables } from "../../src/features/valuations/comparable-base/comparable-trash.service";
import {
  addWebListings, addWebListingsToMachinery, startWebSearch, webSearchSetup, webSearchStatus, type WebSearchStatusDto,
} from "../../src/features/valuations/comparable-search/web-search.service";
import { candidateInputOf } from "../../src/features/valuations/comparable-search/web-listings";
import { createFakeAiGateway, EMPTY_EXTRACTION } from "../support/fake-ai-gateway";
import { createValuationFixture, prisma } from "./support";

overrideAiGateway(null);
afterEach(() => {
  overrideAiGateway(null);
  overrideAiWebSearch(undefined);
});
after(async () => {
  overrideAiGateway(undefined);
  await prisma.$disconnect();
});

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
const origin = { ip: "203.0.113.40", userAgent: "Pruebas" };
const site = `https://portal-${randomUUID().slice(0, 8)}.example`;
const listing = (path: string, overrides: Record<string, unknown> = {}) => ({
  title: `Terreno ${path}`, propertyType: "terreno", operation: "venta", landArea: 6000, builtArea: null, price: 3_000_000, currency: "MXN",
  neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", addressOrReference: "", portal: "Portal Ejemplo",
  url: `${site}/anuncio/${path}`, urlKind: "anuncio", pageStatus: "sin_abrir", listingDate: "", notes: "",
  street: "", streetNumber: "", subdivision: "", postalCode: "", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, floor: "",
  age: null, frontage: null, depth: null, frontCount: null, landUse: "", topography: "", services: "", shape: "", conservation: "", amenities: "",
  contactName: "", agency: "", contactPhone: "", publicationId: "",
  ...overrides,
});

function turnOn(answer: (prompt: { user: string }) => unknown) {
  const fake = createFakeAiGateway({ webSearch: { answer, queries: ["terrenos Villa Ejemplo"] } });
  overrideAiGateway(fake.gateway);
  overrideAiWebSearch(true);
  return fake;
}

/** Starts a search and waits for it, as the browser does. */
async function search(fixture: Fixture, text: string, extra: { count?: number; type?: "TERRENO_VENTA" | "INMUEBLE_VENTA" | "INMUEBLE_RENTA"; target?: "market" | "machinery"; kind?: null } = {}) {
  const { jobId } = await startWebSearch(fixture.publicId, fixture.user, {
    type: extra.type ?? "TERRENO_VENTA", text, previous: [], knownUrls: [], count: extra.count ?? 5, kind: extra.kind ?? null, target: extra.target,
  }, origin);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const status: WebSearchStatusDto = webSearchStatus(fixture.publicId, fixture.user, jobId);
    if (status.status !== "running") return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The search did not end.");
}

const comparable = (location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload => ({
  location, area, price, factors: [],
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: "Portal Ejemplo", contactName: "Asesor Inventado", contactPhone: "33 0000 1111", url: null, offerDate: "2026-11-01",
  ...extra,
});

test("V8.8: every search stays with what was asked and what it found, the dialog shows them again, and the listings found count used or not", async () => {
  turnOn((prompt) => ({
    marketNote: "",
    candidates: prompt.user.includes("segunda") ? [listing("tres"), listing("cuatro"), listing("cinco")] : [listing("uno")],
  }));
  const fixture = await createValuationFixture();
  const first = await search(fixture, "Terrenos en venta en Villa Ejemplo, primera búsqueda");
  assert.equal(first.status, "done");
  if (first.status !== "done") return;
  assert.ok(first.round, "the search is kept");
  assert.deepEqual(first.quota, { used: 1, cap: 25, cards: 0 });
  const second = await search(fixture, "Terrenos en venta en Villa Ejemplo, segunda búsqueda", { count: 3 });
  assert.equal(second.status, "done");
  if (second.status !== "done") return;
  assert.deepEqual(second.quota, { used: 4, cap: 25, cards: 0 }, "«4/25 anuncios encontrados con IA» even with no card created");

  // Closing and opening again: both searches, with their requests and listings, without searching again.
  const setup = await webSearchSetup(fixture.publicId, fixture.user, "TERRENO_VENTA");
  assert.deepEqual(setup.history.map((round) => [round.request, round.found, round.candidates.map((candidate) => candidate.url)]), [
    ["Terrenos en venta en Villa Ejemplo, primera búsqueda", 1, [`${site}/anuncio/uno`]],
    ["Terrenos en venta en Villa Ejemplo, segunda búsqueda", 3, [`${site}/anuncio/tres`, `${site}/anuncio/cuatro`, `${site}/anuncio/cinco`]],
  ]);
  assert.deepEqual(setup.quota, { used: 4, cap: 25, cards: 0 });
  // Another market of the same valuation shows its own searches; the count is the valuation's.
  const houses = await webSearchSetup(fixture.publicId, fixture.user, "INMUEBLE_VENTA");
  assert.deepEqual(houses.history, []);
  assert.equal(houses.quota.used, 4);
});

test("V8.8 (14:23): a card created from an AI result stays in the firm's base after it leaves the valuation, with its number, and the history marks it", async () => {
  turnOn(() => ({ marketNote: "", candidates: [listing("a"), listing("b", { landArea: 6100 })] }));
  const fixture = await createValuationFixture();
  const found = await search(fixture, "Terrenos en venta en Villa Ejemplo");
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  await addWebListings(fixture.publicId, fixture.user, "TERRENO_VENTA", found.candidates.map(candidateInputOf));
  const { comparables } = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(comparables.length, 2);
  const folios = comparables.map((item) => item.folio);

  // «Eliminar» both from the market, as the appraiser did with C-00144 to C-00147.
  for (const item of comparables) await deleteComparable(fixture.publicId, fixture.user, item.id);
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables.length, 0);
  const base = await listComparableBase(fixture.organizationId, parseComparableListParams({ q: "Villa Ejemplo" }));
  assert.deepEqual(base.items.map((item) => item.folio).sort(), [...folios].sort(), "same numbers, still in the base");
  // Taken out again with nothing new: no second copy.
  const copies = await prisma.comparableAvaluo.count({ where: { IdAvaluo: null, IdOrganizacion: fixture.organizationId } });
  assert.equal(copies, 2);

  // Opening the AI search again: the listings are there, marked as cards of the base, and can come back without searching.
  const setup = await webSearchSetup(fixture.publicId, fixture.user, "TERRENO_VENTA");
  assert.deepEqual(setup.history[0].candidates.map((candidate) => candidate.existing?.folio ?? null).sort(), [...folios].sort());
  const again = await addWebListings(fixture.publicId, fixture.user, "TERRENO_VENTA", setup.history[0].candidates.map(candidateInputOf));
  assert.deepEqual({ created: again.created, reused: again.reused }, { created: 0, reused: 2 });
  assert.deepEqual((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables.map((item) => item.folio).sort(), [...folios].sort());
});

test("V8.12: «Es el mismo: actualizar los datos de su ficha» keeps its number and takes what is captured now, even when the base's data are newer", async () => {
  const fixture = await createValuationFixture();
  const stored = await createBaseComparable(fixture.user, "TERRENO_VENTA", comparable("Paseo Inventado 10, Villa Ejemplo", 300, 1_500_000));
  const before = await prisma.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: stored.id }, include: { propiedad: true } });
  // A capture consulted before the base's data: the import would keep the base's; the explicit answer takes the capture.
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Paseo Inventado 10, Villa Ejemplo", 320, 1_650_000, { consultedOn: "2026-01-15" }), { mergeInto: stored.id });
  const [card] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  assert.equal(card.folio, before.propiedad.IFolioComparable);
  assert.equal(card.area, 320);
  assert.equal(card.price, 1_650_000);
  // The base shows its most recent capture: the one just captured.
  const base = await listComparableBase(fixture.organizationId, parseComparableListParams({ q: "Paseo Inventado" }));
  assert.equal(base.items.length, 1);
  assert.equal(base.items[0].price, 1_650_000);
});

test("V8.12: the firm edits its states of the review; a state deleted keeps its name on the comparables that have it", async () => {
  const fixture = await createValuationFixture();
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Calle Inventada 5, Villa Ejemplo", 200, 1_000_000));
  const [card] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  const builtIn = await getComparableReviewSettings(fixture.organizationId);
  assert.deepEqual(builtIn.statuses.map((item) => item.label), ["Sin revisar", "Verificado y vigente", "Verificado y no vigente", "Con observaciones", "Rechazado"]);

  const statuses = [...builtIn.statuses.map((item) => (item.key === "VERIFICADO" ? { ...item, label: "Vigente" } : item)), { key: "custom-disponible", label: "Disponible", tone: "verde" as const }];
  const saved = await saveReviewStatuses(fixture.user, { statuses });
  assert.deepEqual(saved.statuses.map((item) => item.label), ["Sin revisar", "Vigente", "Verificado y no vigente", "Con observaciones", "Rechazado", "Disponible"]);

  const review = await saveComparableReview(fixture.publicId, fixture.user, card.id, { status: "custom-disponible", checks: {}, notes: null });
  assert.deepEqual({ status: review.status, label: review.statusLabel, tone: review.statusTone }, { status: "custom-disponible", label: "Disponible", tone: "verde" });

  // «Disponible» leaves the list: the comparable keeps it, with its name, until the appraiser gives it another.
  await saveReviewStatuses(fixture.user, { statuses: statuses.filter((item) => item.key !== "custom-disponible") });
  const [after] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  assert.deepEqual({ status: after.review?.status, label: after.review?.statusLabel }, { status: "custom-disponible", label: "Disponible" });
  // Another firm keeps the built-in list.
  const other = await createValuationFixture();
  assert.equal((await getComparableReviewSettings(other.organizationId)).statuses.length, 5);
});

test("V8.8 (12:30): old comparables go to the trash and come back; their numbers are never given again", async () => {
  const fixture = await createValuationFixture();
  const old = await createBaseComparable(fixture.user, "TERRENO_VENTA", comparable("Camino Viejo 1, Villa Ejemplo", 500, 900_000));
  const recent = await createBaseComparable(fixture.user, "TERRENO_VENTA", comparable("Camino Nuevo 2, Villa Ejemplo", 500, 950_000));
  await prisma.comparableAvaluo.update({ where: { UIdentificadorPublico: old.id }, data: { DFechaActualizacionDatos: new Date(Date.now() - 400 * 24 * 3600 * 1000) } });
  const folioOf = async (id: string) => (await prisma.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: id }, include: { propiedad: true } })).propiedad.IFolioComparable as number;
  const [oldFolio, recentFolio] = [await folioOf(old.id), await folioOf(recent.id)];

  assert.equal((await previewOldComparables(fixture.organizationId, 24)).count, 0);
  const preview = await previewOldComparables(fixture.organizationId, 12);
  assert.equal(preview.count, 1);
  const { folios } = await trashOldComparables(fixture.user, 12);
  assert.deepEqual(folios, [oldFolio]);
  const listed = await listComparableBase(fixture.organizationId, parseComparableListParams({ q: "Camino" }));
  assert.deepEqual(listed.items.map((item) => item.folio), [recentFolio], "out of the list, the searches and the map");
  assert.deepEqual((await listTrash(fixture.organizationId)).map((item) => item.folio), [oldFolio]);

  // A new comparable takes the next number, never the one in the trash.
  const next = await createBaseComparable(fixture.user, "TERRENO_VENTA", comparable("Camino Otro 3, Villa Ejemplo", 500, 990_000));
  assert.ok((await folioOf(next.id)) > recentFolio);

  // «Deshacer»: back, as it was, with its number.
  assert.deepEqual(await restoreFromTrash(fixture.user, folios), { restored: 1 });
  const back = await listComparableBase(fixture.organizationId, parseComparableListParams({ q: "Camino" }));
  assert.ok(back.items.some((item) => item.folio === oldFolio));
  assert.deepEqual(await listTrash(fixture.organizationId), []);
});

test("audio of 26 nov: the machinery panel searches machinery for sale or rent; its listings become cards of the base, never land", async () => {
  const fake = turnOn(() => ({ marketNote: "", candidates: [listing("retro", { title: "Retroexcavadora inventada 2018", propertyType: "retroexcavadora", landArea: null, price: 1_200_000, notes: "Marca Inventada, modelo X1, 2018, 3,000 horas" })] }));
  const fixture = await createValuationFixture();
  const setup = await webSearchSetup(fixture.publicId, fixture.user, "INMUEBLE_VENTA", "machinery");
  assert.match(setup.suggestion, /Necesito cinco, con precio, marca, modelo, año, horas de uso o kilometraje/);
  const found = await search(fixture, "Retroexcavadoras en venta en Jalisco", { type: "INMUEBLE_VENTA", target: "machinery" });
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  assert.match(fake.prompts.at(-1)?.prompt.user ?? "", /maquinaria y equipo en venta[\s\S]*Clase de bien: maquinaria y equipo/);
  const { items } = await addWebListingsToMachinery(fixture.publicId, fixture.user, "INMUEBLE_VENTA", found.candidates.map(candidateInputOf), null);
  assert.equal(items.length, 1);
  assert.equal(items[0].outcome, "CREATED");
  const card = await prisma.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: items[0].comparableId } });
  assert.equal(card.IdAvaluo, null, "in the firm's base, not in a market");
  assert.equal((card.JPropiedadSnapshot as { details?: { assetClass?: string } }).details?.assetClass, "MAQUINARIA");
  // The same listing again: its card is used, not captured twice.
  const again = await addWebListingsToMachinery(fixture.publicId, fixture.user, "INMUEBLE_VENTA", found.candidates.map(candidateInputOf), null);
  assert.equal(again.items[0].outcome, "REUSED");
  await assert.rejects(
    startWebSearch(fixture.publicId, fixture.user, { type: "TERRENO_VENTA", text: "Retroexcavadoras en venta", previous: [], knownUrls: [], count: 5, target: "machinery" }, origin),
    /no como terreno/,
  );
});

test("V8.12 (07:24): «Pegar anuncio» asks again when the answer comes cut, and says in words what to do when it fails twice", async () => {
  const fixture = await createValuationFixture();
  const text = "Casa en venta en Fraccionamiento Inventado, Villa Ejemplo. Precio $2,350,000. Terreno 160 m2. ID del anuncio EB-XX0002.";
  let calls = 0;
  const flaky = (failures: number): AiGateway => ({
    ...createFakeAiGateway().gateway,
    async extract<T>() {
      calls += 1;
      if (calls <= failures) throw new AiGatewayError("invalid_output");
      return { data: { ...EMPTY_EXTRACTION, price: "$2,350,000", landArea: "160 m2" } as T, usage: { model: "fake", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  });
  overrideAiGateway(flaky(1));
  const proposal = await proposeComparableFromListing(fixture.publicId, fixture.user, { text, url: null }, origin);
  assert.equal(proposal.price?.amount, 2_350_000);
  assert.equal(calls, 2);

  calls = 0;
  overrideAiGateway(flaky(2));
  await assert.rejects(
    proposeComparableFromListing(fixture.publicId, fixture.user, { text, url: null }, origin),
    (error: unknown) => error instanceof AiAssistError && error.status === 422 && error.message === LISTING_UNREADABLE,
  );
});
