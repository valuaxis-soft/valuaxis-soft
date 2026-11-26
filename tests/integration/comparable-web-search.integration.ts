/**
 * «Buscar con IA» against the local database, with a fake in place of the
 * provider (tests/support/fake-ai-gateway.ts): the switch, permissions,
 * tenant isolation, limits, what a search answers and records, and the
 * comparables «Crear fichas» creates. No test here reaches the real service,
 * whatever the .env holds, and every place and listing is invented.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, test } from "node:test";
import sharp from "sharp";
import { POST as postPhoto } from "../../src/app/api/avaluos/[id]/mercado/comparables/[comparableId]/fotos/route";
import { POST as postScreenshot } from "../../src/app/api/avaluos/[id]/mercado/comparables/[comparableId]/pantalla/route";
import { POST as postListings } from "../../src/app/api/avaluos/[id]/mercado/comparables/buscar-ia/fichas/route";
import { GET as getStatus } from "../../src/app/api/avaluos/[id]/mercado/comparables/buscar-ia/[jobId]/route";
import { GET as getSetup, POST as postSearch } from "../../src/app/api/avaluos/[id]/mercado/comparables/buscar-ia/route";
import { GET as getBaseSearch } from "../../src/app/api/avaluos/[id]/mercado/comparables/buscar/route";
import { overrideAiGateway, overrideAiWebSearch } from "../../src/features/ai/ai-gateway-provider";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import { listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { candidateInputOf, normalizeWebListings, type WebListingSearchAnswer } from "../../src/features/valuations/comparable-search/web-listings";
import type { WebSearchStatusDto } from "../../src/features/valuations/comparable-search/web-search.service";
import { concludeValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createFakeAiGateway } from "../support/fake-ai-gateway";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
type Body = { error?: string; data?: Record<string, unknown> };

// Off unless a test puts a fake: the key of the .env is never used.
overrideAiGateway(null);
afterEach(() => {
  overrideAiGateway(null);
  overrideAiWebSearch(undefined);
});
after(async () => {
  overrideAiGateway(undefined);
  await prisma.$disconnect();
});

/** A member of the fixture's organization with `roleKey`, signed in. */
async function signIn(fixture: Fixture, roleKey: string) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return jar;
}

const BASE = "http://localhost/api/avaluos";
const json = async (response: Response) => ({ status: response.status, headers: response.headers, body: (await response.json()) as Body });
const headers = { "content-type": "application/json", "x-real-ip": "203.0.113.30", "user-agent": "Pruebas" };

const setup = (jar: TestCookieJar, publicId: string, type = "TERRENO_VENTA") =>
  withCookies(jar, () => getSetup(new Request(`${BASE}/${publicId}/mercado/comparables/buscar-ia?tipo=${type}`), { params: Promise.resolve({ id: publicId }) })).then(json);
const start = (jar: TestCookieJar, publicId: string, body: unknown, type = "TERRENO_VENTA") =>
  withCookies(jar, () => postSearch(
    new Request(`${BASE}/${publicId}/mercado/comparables/buscar-ia?tipo=${type}`, { method: "POST", headers, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: publicId }) },
  )).then(json);
const status = (jar: TestCookieJar, publicId: string, jobId: string) =>
  withCookies(jar, () => getStatus(new Request(`${BASE}/${publicId}/mercado/comparables/buscar-ia/${jobId}`), { params: Promise.resolve({ id: publicId, jobId }) })).then(json);
const createCards = (jar: TestCookieJar, publicId: string, candidates: unknown[], type = "TERRENO_VENTA") =>
  withCookies(jar, () => postListings(
    new Request(`${BASE}/${publicId}/mercado/comparables/buscar-ia/fichas?tipo=${type}`, { method: "POST", headers, body: JSON.stringify({ candidates }) }),
    { params: Promise.resolve({ id: publicId }) },
  )).then(json);

/** Asks until the search ends, as the browser does. */
async function finished(jar: TestCookieJar, publicId: string, jobId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await status(jar, publicId, jobId);
    assert.equal(response.status, 200, response.body.error);
    const data = response.body.data as unknown as WebSearchStatusDto;
    if (data.status !== "running") return data;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The search did not end.");
}

async function searchAndWait(jar: TestCookieJar, publicId: string, body: unknown = { text: REQUEST }) {
  const started = await start(jar, publicId, body);
  assert.equal(started.status, 202, started.body.error);
  return finished(jar, publicId, String(started.body.data?.jobId));
}

const REQUEST = "Terrenos en venta de 5,000 a 7,000 m² en Villa Ejemplo, Jalisco";
const site = `https://portal-${randomUUID().slice(0, 8)}.example`;
const listing = (path: string, overrides: Record<string, unknown> = {}) => ({
  title: `Terreno ${path}`, propertyType: "terreno", operation: "venta", landArea: 6000, builtArea: null, price: 3_000_000, currency: "MXN",
  neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", addressOrReference: "", portal: "Portal Ejemplo",
  url: `${site}/anuncio/${path}`, urlKind: "anuncio", pageStatus: "sin_abrir", listingDate: "", notes: "",
  // What else a listing may publish; here, nothing.
  street: "", streetNumber: "", subdivision: "", postalCode: "", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, floor: "",
  age: null, frontage: null, depth: null, frontCount: null, landUse: "", topography: "", services: "", shape: "", conservation: "", amenities: "",
  contactName: "", agency: "", contactPhone: "", publicationId: "",
  ...overrides,
});
const ANSWER = {
  candidates: [
    listing("uno", { landArea: 7881, price: 4_216_335, addressOrReference: "a 2 km del libramiento norte" }),
    listing("dos", { price: null }),
    listing("sin-liga", { url: "" }),
    listing("de-memoria"),
  ],
  marketNote: "El mercado publicado es reducido.",
};
const fakeSearch = (answer: unknown = ANSWER) => createFakeAiGateway({
  webSearch: { answer, resultUrls: [`${site}/anuncio/uno`, `${site}/anuncio/dos`], queries: ["terrenos en venta Villa Ejemplo", "terrenos Villa Ejemplo 6000 m2"] },
});
function turnOn(answer?: unknown) {
  const fake = fakeSearch(answer);
  overrideAiGateway(fake.gateway);
  overrideAiWebSearch(true);
  return fake;
}

const usageOf = (fixture: Fixture, action: string) =>
  prisma.auditoria.findMany({ where: { SIdentificadorEntidad: fixture.publicId, SAccion: action }, orderBy: { IdAuditoria: "asc" } });
const market = (fixture: Fixture) => getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");

test("without the key, or with the switch off, the search says why and the firm's base still answers", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const noKey = await setup(jar, fixture.publicId);
  assert.equal(noKey.status, 200);
  assert.equal(noKey.body.data?.enabled, false);
  assert.match(String(noKey.body.data?.disabledReason), /no tiene configurada la llave del servicio de IA/);
  const refused = await start(jar, fixture.publicId, { text: REQUEST });
  assert.equal(refused.status, 503);
  assert.match(refused.body.error ?? "", /no tiene configurada la llave/);

  // A key alone is not enough: the search is turned on apart, because of what it costs.
  const fake = fakeSearch();
  overrideAiGateway(fake.gateway);
  overrideAiWebSearch(false);
  const off = await setup(jar, fixture.publicId);
  assert.equal(off.body.data?.enabled, false);
  assert.match(String(off.body.data?.disabledReason), /está apagada en esta instalación/);
  const stillRefused = await start(jar, fixture.publicId, { text: REQUEST });
  assert.equal(stillRefused.status, 503);
  assert.equal(fake.prompts.length, 0, "the provider was never called");

  const base = await withCookies(jar, () => getBaseSearch(
    new Request(`${BASE}/${fixture.publicId}/mercado/comparables/buscar?tipo=TERRENO_VENTA&q=villa`),
    { params: Promise.resolve({ id: fixture.publicId }) },
  )).then(json);
  assert.equal(base.status, 200, base.body.error);
  assert.deepEqual(base.body.data?.results, []);
});

test("the box starts with a request written from the subject of the valuation", async () => {
  turnOn();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  await saveMarketSettings(fixture.publicId, fixture.user, {
    comparableType: "TERRENO_VENTA", subjectArea: 6000, baseArea: null, surfacePower: 6, adoptedUnitValue: null, justification: null,
    additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  const response = await setup(jar, fixture.publicId);
  assert.equal(response.status, 200, response.body.error);
  assert.equal(response.body.data?.enabled, true);
  assert.equal(response.body.data?.disabledReason, null);
  assert.match(String(response.body.data?.suggestion), /^Terrenos en venta.*de 4,200 a 7,800 m² de terreno \(el sujeto mide 6,000 m²\)/);
  assert.equal((await setup(jar, fixture.publicId, "OTRO")).status, 400);
});

test("who can read the valuation may search; creating comparables needs editing; nobody reaches another firm's", async () => {
  const fake = turnOn();
  const anonymous = await start(new TestCookieJar(), (await createValuationFixture()).publicId, { text: REQUEST });
  assert.equal(anonymous.status, 401);
  assert.equal(fake.prompts.length, 0);

  const fixture = await createValuationFixture();
  const reader = await signIn(fixture, "CONSULTA");
  const found = await searchAndWait(reader, fixture.publicId);
  assert.equal(found.status, "done");
  const denied = await createCards(reader, fixture.publicId, found.status === "done" ? found.candidates.slice(0, 1) : []);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "Permiso insuficiente");
  assert.deepEqual((await market(fixture)).comparables, []);

  // Another organization: the valuation is not found, and neither is a search started in it.
  const intruder = await createValuationFixture();
  const intruderJar = await signIn(intruder, "ADMINISTRADOR");
  const calls = fake.prompts.length;
  assert.equal((await setup(intruderJar, fixture.publicId)).status, 404);
  assert.equal((await start(intruderJar, fixture.publicId, { text: REQUEST })).status, 404);
  assert.equal((await createCards(intruderJar, fixture.publicId, found.status === "done" ? found.candidates.slice(0, 1) : [])).status, 404);
  assert.equal(fake.prompts.length, calls, "the provider was not called for another organization");

  const started = await start(reader, fixture.publicId, { text: REQUEST });
  const jobId = String(started.body.data?.jobId);
  await finished(reader, fixture.publicId, jobId);
  // Someone else's search, even with its id: not found, in their valuation or in the victim's.
  assert.equal((await status(intruderJar, fixture.publicId, jobId)).status, 404);
  assert.equal((await status(intruderJar, intruder.publicId, jobId)).status, 404);
  assert.equal((await status(reader, fixture.publicId, "no-es-un-id")).status, 400);
  assert.equal((await status(reader, fixture.publicId, randomUUID())).status, 404);
});

test("a search answers with what was found: no invented address, $/m² computed here, and only its cost recorded", async () => {
  const fake = turnOn();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const result = await searchAndWait(jar, fixture.publicId, { text: REQUEST, previous: ["terrenos en la mancha urbana"], knownUrls: [`${site}/ya-visto`] });
  assert.equal(result.status, "done");
  if (result.status !== "done") return;
  assert.deepEqual(result.candidates.map((candidate) => candidate.url), [`${site}/anuncio/uno`, `${site}/anuncio/dos`, `${site}/anuncio/de-memoria`]);
  assert.equal(result.discarded, 1, "the candidate without an address on the web");
  assert.equal(result.searches, 2);
  assert.equal(result.marketNote, "El mercado publicado es reducido.");
  const [first, second, third] = result.candidates;
  assert.equal(first.unitValue, 535);
  assert.equal(first.reference, "a 2 km del libramiento norte");
  assert.equal(second.price, null);
  assert.equal(second.unitValue, null);
  assert.deepEqual([first.urlConfirmed, second.urlConfirmed, third.urlConfirmed], [true, true, false]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.existing), [null, null, null]);

  // What the model was sent: the rules, the request as data, what was asked before and what not to repeat.
  assert.equal(fake.prompts.length, 1);
  const [{ kind, prompt }] = fake.prompts;
  assert.equal(kind, "search");
  assert.match(prompt.user, new RegExp(`<solicitud>\\n${REQUEST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n</solicitud>`));
  assert.match(prompt.user, /<solicitud_anterior>\nterrenos en la mancha urbana\n<\/solicitud_anterior>/);
  assert.match(prompt.user, /<ya_encontrados>[\s\S]*ya-visto/);
  // Nothing of the valuation or the firm travels unless the appraiser writes it.
  assert.ok(!prompt.user.includes(fixture.publicId));

  // Searching saves nothing in the valuation.
  assert.deepEqual((await market(fixture)).comparables, []);

  const [usage, ...more] = await usageOf(fixture, "AI_COMPARABLE_SEARCH");
  assert.deepEqual(more, []);
  assert.equal(usage.IdUsuario, fixture.user.id);
  assert.equal(usage.IdOrganizacion, fixture.organizationId);
  assert.equal(usage.SDireccionIP, "203.0.113.30");
  const { seconds, modelSeconds, ...metadata } = usage.JMetadatos as Record<string, number | string>;
  assert.equal(typeof seconds, "number");
  assert.equal(typeof modelSeconds, "number");
  assert.deepEqual(metadata, {
    model: "fake-search", inputTokens: 42_000, outputTokens: 3_000, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 2,
    candidates: 3, discarded: 1, discardedListingPages: 0, discardedUnpublished: 0, discardedExtra: 0, requested: 5,
    pagesOpened: 0, pagesRead: 0, pageInputTokens: 0, pageOutputTokens: 0,
    firstSearchSeconds: null, lastToolSeconds: null, reportStartSeconds: null, turns: null, characters: REQUEST.length,
  });
  // Neither the request nor the listings are in the record.
  assert.ok(!JSON.stringify(usage.JMetadatos).includes("Villa Ejemplo"));
});

test("a request too short or too long is rejected before the provider is called", async () => {
  const fake = turnOn();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const short = await start(jar, fixture.publicId, { text: "terrenos" });
  assert.equal(short.status, 400);
  assert.match(short.body.error ?? "", /Describe lo que buscas con al menos 15 letras/);
  assert.equal((await start(jar, fixture.publicId, { text: "x".repeat(2001) })).status, 400);
  assert.equal((await start(jar, fixture.publicId, { text: REQUEST }, "OTRO")).status, 400);
  assert.equal(fake.prompts.length, 0);
});

test("a failure of the provider reaches the appraiser in words, and one person runs one search at a time", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  overrideAiGateway(createFakeAiGateway({ failure: "timeout" }).gateway);
  overrideAiWebSearch(true);
  const failed = await searchAndWait(jar, fixture.publicId);
  assert.deepEqual(failed, { status: "failed", error: "El servicio de IA tardó demasiado en responder. Intenta de nuevo." });
  assert.deepEqual(await usageOf(fixture, "AI_COMPARABLE_SEARCH"), []);

  const slow = createFakeAiGateway({ webSearch: { answer: ANSWER, queries: ["terrenos Villa Ejemplo"], delayMs: 300 } });
  overrideAiGateway(slow.gateway);
  const first = await start(jar, fixture.publicId, { text: REQUEST });
  assert.equal(first.status, 202);
  const running = await status(jar, fixture.publicId, String(first.body.data?.jobId));
  assert.equal(running.body.data?.status, "running");
  assert.equal(running.body.data?.searches, 1);
  assert.equal(running.body.data?.query, "terrenos Villa Ejemplo");
  const second = await start(jar, fixture.publicId, { text: REQUEST });
  assert.equal(second.status, 409);
  assert.match(second.body.error ?? "", /Ya tienes una búsqueda con IA en curso/);
  assert.equal((await finished(jar, fixture.publicId, String(first.body.data?.jobId))).status, "done");
  assert.equal(slow.prompts.length, 1);
});

test("the seventh search of a person in ten minutes waits, without calling the provider", async () => {
  const fake = turnOn();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  for (let attempt = 0; attempt < 6; attempt += 1) assert.equal((await searchAndWait(jar, fixture.publicId)).status, "done");
  const limited = await start(jar, fixture.publicId, { text: REQUEST });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error ?? "", /Llegaste al límite de búsquedas con IA/);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(fake.prompts.length, 6);
});

test("«Crear fichas» adds the chosen listings to the market and to the firm's base, unverified, and respects duplicates", async () => {
  const fake = turnOn();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const found = await searchAndWait(jar, fixture.publicId);
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  const [first, second] = found.candidates;

  const created = await createCards(jar, fixture.publicId, [first, second]);
  assert.equal(created.status, 201, created.body.error);
  assert.deepEqual({ created: created.body.data?.created, reused: created.body.data?.reused, skipped: created.body.data?.skipped }, { created: 2, reused: 0, skipped: 0 });

  const { comparables } = await market(fixture);
  assert.equal(comparables.length, 2);
  const [one, two] = comparables;
  assert.equal(one.location, "a 2 km del libramiento norte, Las Lomas, Villa Ejemplo, Jalisco");
  assert.equal(one.area, 7881);
  assert.equal(one.price, 4_216_335);
  assert.equal(one.url, `${site}/anuncio/uno`);
  assert.equal(one.sourceName, "Portal Ejemplo");
  assert.equal(one.operationType, "VENTA");
  assert.deepEqual({ state: one.address?.state, municipality: one.address?.municipality, neighborhood: one.address?.neighborhood }, { state: "Jalisco", municipality: "Villa Ejemplo", neighborhood: "Las Lomas" });
  assert.equal(one.listingDetails?.dataVerified, "NO");
  assert.equal(one.listingDetails?.dataOrigin, "Búsqueda con IA");
  assert.match(one.notes ?? "", /Encontrado en Búsqueda con IA \(Portal Ejemplo\)\.$/);
  // Pending review, without evidence: the appraiser completes it.
  assert.equal(one.review?.status ?? "POR_REVISAR", "POR_REVISAR");
  assert.deepEqual(one.photos, []);
  assert.equal(one.screenshot ?? null, null);
  // What the listing did not publish stays empty.
  assert.equal(two.price, null);
  assert.equal(two.area, 6000);
  // In the firm's base, each with its number.
  assert.ok(one.folio && two.folio && one.folio !== two.folio);
  const base = await listComparableBase(fixture.organizationId, parseComparableListParams({ q: "Villa Ejemplo" }));
  assert.deepEqual(base.items.map((item) => item.folio).sort(), [one.folio, two.folio].sort());

  const [audit] = await usageOf(fixture, "COMPARABLES_AI_SEARCH_ADD");
  assert.deepEqual(audit.JMetadatos, { type: "TERRENO_VENTA", created: 2, reused: 0, skipped: 0 });

  // Again: they are already in the valuation.
  const again = await createCards(jar, fixture.publicId, [first, second]);
  assert.deepEqual({ created: again.body.data?.created, reused: again.body.data?.reused, skipped: again.body.data?.skipped }, { created: 0, reused: 0, skipped: 2 });
  assert.equal((await market(fixture)).comparables.length, 2);

  // A new search does not propose again what this very valuation has (V8.2), nor what its searches already found and are kept (V8.8):
  // the model is told, and what it repeats is left out.
  const later = await searchAndWait(jar, fixture.publicId);
  assert.equal(later.status, "done");
  if (later.status !== "done") return;
  assert.deepEqual(later.candidates.map((candidate) => candidate.url), []);
  assert.match(fake.prompts.at(-1)?.prompt.user ?? "", new RegExp(`<ya_encontrados>[\\s\\S]*${site.replace(/[.]/g, "\\.")}/anuncio/uno`));
  assert.match(fake.prompts.at(-1)?.prompt.user ?? "", new RegExp(`<ya_encontrados>[\\s\\S]*${site.replace(/[.]/g, "\\.")}/anuncio/de-memoria`));

  // In another valuation of the same firm the listing is brought from the base, with its number: one comparable, not two.
  const source = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const other = await prisma.avaluo.create({
    data: {
      IdOrganizacion: source.IdOrganizacion, IdUsuarioCreador: source.IdUsuarioCreador, IdEstadoAvaluo: source.IdEstadoAvaluo, IdTipoAvaluo: source.IdTipoAvaluo,
      IdTipoInmueble: source.IdTipoInmueble, IdTipoOperacion: source.IdTipoOperacion, SFolio: `TEST-${randomUUID().slice(0, 8)}`, STitulo: "Otro avalúo de prueba",
      DFechaModificacion: new Date(),
    },
  });
  const elsewhere = await searchAndWait(jar, other.UIdentificadorPublico);
  assert.equal(elsewhere.status, "done");
  if (elsewhere.status !== "done") return;
  assert.deepEqual(elsewhere.candidates[0].existing && { folio: elsewhere.candidates[0].existing.folio, inValuation: elsewhere.candidates[0].existing.inValuation }, { folio: one.folio, inValuation: false });
  const reused = await createCards(jar, other.UIdentificadorPublico, [elsewhere.candidates[0], elsewhere.candidates[2]]);
  assert.equal(reused.status, 201, reused.body.error);
  assert.deepEqual({ created: reused.body.data?.created, reused: reused.body.data?.reused, skipped: reused.body.data?.skipped }, { created: 1, reused: 1, skipped: 0 });
  const otherMarket = await getMarketCalculation(other.UIdentificadorPublico, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(otherMarket.comparables.map((comparable) => comparable.url), [`${site}/anuncio/uno`, `${site}/anuncio/de-memoria`]);
  assert.equal(otherMarket.comparables[0].folio, one.folio);
});

test("«Crear fichas» fills the card with everything the listing published and says which comparable each listing became, to attach the appraiser's images", async () => {
  turnOn({
    marketNote: "",
    candidates: [
      listing("casa", {
        title: "Casa en Fraccionamiento Inventado", propertyType: "Casa", landArea: 160, builtArea: 185, price: 2_350_000,
        street: "Av. Ficticia 245", postalCode: "47600", bedrooms: 3, bathrooms: 2, halfBaths: 1, parking: 2, levels: 2, age: 12,
        frontage: 8, depth: 20, landUse: "Habitacional", services: "Todos los servicios", conservation: "Buen estado",
        amenities: "jardín, cocina integral", contactName: "Asesora Ficticia", contactPhone: "33 0000 0000", publicationId: "EB-XX0001",
      }),
      listing("otra", { title: "Casa sin más datos", propertyType: "Casa", landArea: null, builtArea: 120 }),
    ],
  });
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const started = await start(jar, fixture.publicId, { text: "Casas en venta en Villa Ejemplo, Jalisco, de 150 a 220 m²" }, "INMUEBLE_VENTA");
  assert.equal(started.status, 202, started.body.error);
  const found = await finished(jar, fixture.publicId, String(started.body.data?.jobId));
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  assert.equal(found.candidates[0].bathrooms, 2.5);

  const created = await createCards(jar, fixture.publicId, found.candidates, "INMUEBLE_VENTA");
  assert.equal(created.status, 201, created.body.error);
  const items = created.body.data?.items as Array<{ url: string; outcome: string; comparableId: string | null }>;
  assert.deepEqual(items.map((item) => [item.url, item.outcome]), [[`${site}/anuncio/casa`, "CREATED"], [`${site}/anuncio/otra`, "CREATED"]]);

  const calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA");
  const house = calculation.comparables.find((item) => item.id === items[0].comparableId);
  assert.ok(house, "the id answered is the comparable of the valuation");
  assert.equal(house.area, 185);
  assert.equal(house.landArea, 160);
  assert.equal(house.bedrooms, 3);
  assert.equal(house.bathrooms, 2.5);
  assert.equal(house.conservation, "Buen estado");
  assert.deepEqual(house.propertyDetails && { age: house.propertyDetails.age, levels: house.propertyDetails.levels, parking: house.propertyDetails.parking }, { age: 12, levels: 2, parking: 2 });
  assert.equal(house.frontage, 8);
  assert.equal(house.depth, 20);
  assert.equal(house.landUse, "Habitacional");
  assert.equal(house.services, "Todos los servicios");
  assert.equal(house.contactName, "Asesora Ficticia");
  assert.equal(house.contactPhone, "33 0000 0000");
  assert.equal(house.address?.street, "Av. Ficticia 245");
  assert.equal(house.address?.postalCode, "47600");
  assert.equal(house.listingDetails?.publicationId, "EB-XX0001");
  assert.match(house.notes ?? "", /Amenidades: jardín, cocina integral/);
  // Nothing invented for the listing that published little.
  const plain = calculation.comparables.find((item) => item.id === items[1].comparableId);
  assert.equal(plain?.bedrooms ?? null, null);
  assert.equal(plain?.landArea ?? null, null);
  assert.equal(plain?.contactPhone ?? null, null);

  // The browser uploads the pasted screenshot and photos to that comparable, through the routes of the form.
  const image = async () => new File([new Uint8Array(await sharp({ create: { width: 60, height: 40, channels: 3, background: "#3366cc" } }).png().toBuffer())], "anuncio.png", { type: "image/png" });
  const comparableId = String(items[0].comparableId);
  const upload = async (path: "pantalla" | "fotos") => {
    const form = new FormData();
    form.set("file", await image());
    const request = new Request(`${BASE}/${fixture.publicId}/mercado/comparables/${comparableId}/${path}?tipo=INMUEBLE_VENTA`, { method: "POST", body: form });
    const params = Promise.resolve({ id: fixture.publicId, comparableId });
    return withCookies(jar, () => (path === "pantalla" ? postScreenshot(request, { params }) : postPhoto(request, { params }))).then(json);
  };
  assert.equal((await upload("pantalla")).status, 201);
  assert.equal((await upload("fotos")).status, 201);
  const withImages = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).comparables.find((item) => item.id === items[0].comparableId);
  assert.ok(withImages?.screenshot);
  assert.equal(withImages?.photos.length, 1);

  // The same listing, with the same id in the same portal, captured by another firm: its card is created and keeps the id.
  const otherFirm = await createValuationFixture();
  const otherJar = await signIn(otherFirm, "VALUADOR");
  const again = await createCards(otherJar, otherFirm.publicId, found.candidates.slice(0, 1), "INMUEBLE_VENTA");
  assert.equal(again.status, 201, again.body.error);
  const copy = (await getMarketCalculation(otherFirm.publicId, otherFirm.organizationId, "INMUEBLE_VENTA")).comparables[0];
  assert.equal(copy.listingDetails?.publicationId, "EB-XX0001");
});

test("a concluded valuation can search but not create comparables, and a made-up address is rejected", async () => {
  turnOn();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "ADMINISTRADOR");
  const invalid = await createCards(jar, fixture.publicId, [{ ...listing("x"), url: "javascript:alert(1)" }]);
  assert.equal(invalid.status, 400);
  assert.equal((await createCards(jar, fixture.publicId, [])).status, 400);

  await saveValuationSections({
    publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user,
    sections: [{ id: "terreno", label: "III", title: "INFO TERRENO", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  const found = await searchAndWait(jar, fixture.publicId);
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  const locked = await createCards(jar, fixture.publicId, found.candidates.slice(0, 1));
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error, "El avalúo está concluido; reábrelo para editarlo.");
});

/** Listings of the model's answer, numbered, each with its own page. */
const numbered = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => listing(`n${from + index}`, { landArea: 6000 + from + index }));
/** What the browser sends back to create cards, without a search: the same shape a search shows. */
const inputsOf = (answer: unknown[]) => (answer as WebListingSearchAnswer["candidates"]).flatMap((item) =>
  normalizeWebListings("TERRENO_VENTA", { candidates: [item], marketNote: "" }, { resultUrls: [], knownUrls: [] }).candidates.map(candidateInputOf));

test("V8.2: a search proposes five at most, and «Buscar 2 más» asks for two that are not on screen nor in the valuation", async () => {
  // The model answers seven, past what was asked; then, asked for more, it repeats one already shown and brings three new ones.
  const fake = createFakeAiGateway({
    webSearch: {
      answer: (prompt: { user: string }) => ({ marketNote: "", candidates: prompt.user.includes("dos anuncios más") ? [listing("n1"), ...numbered(8, 10)] : numbered(1, 7) }),
      queries: ["terrenos Villa Ejemplo"],
    },
  });
  overrideAiGateway(fake.gateway);
  overrideAiWebSearch(true);
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const first = await searchAndWait(jar, fixture.publicId);
  assert.equal(first.status, "done");
  if (first.status !== "done") return;
  assert.deepEqual(first.candidates.map((candidate) => candidate.url), numbered(1, 5).map((item) => item.url));
  assert.equal(first.count, 5);
  assert.equal(first.discards.extra, 2);
  assert.match(fake.prompts[0].prompt.user, /reporta como máximo cinco anuncios\./);
  assert.equal(fake.searchOptions[0].maxSearches, 9);
  assert.equal(fake.searchOptions[0].maxFetches, 8);

  // Three of them become comparables; the appraiser asks for two more.
  assert.equal((await createCards(jar, fixture.publicId, first.candidates.slice(0, 3))).status, 201);
  const more = await searchAndWait(jar, fixture.publicId, {
    text: REQUEST, previous: [REQUEST], knownUrls: first.candidates.slice(3).map((candidate) => candidate.url), count: 2,
  });
  assert.equal(more.status, "done");
  if (more.status !== "done") return;
  const prompt = fake.prompts[1].prompt.user;
  assert.match(prompt, /reporta como máximo dos anuncios más, distintos de los ya encontrados/);
  // Not to repeat: the two still on screen and the three already in the valuation.
  for (const item of numbered(1, 5)) assert.ok(prompt.includes(item.url), item.url);
  assert.deepEqual(more.candidates.map((candidate) => candidate.url), numbered(8, 9).map((item) => item.url));
  assert.equal(more.count, 2);
  assert.equal(fake.searchOptions[1].maxSearches, 6);
  // V8.8: the listings found count, used or not: five and two; three of them are comparables.
  assert.deepEqual(more.quota, { used: 7, cap: 25, cards: 3 });
  const records = await usageOf(fixture, "AI_COMPARABLE_SEARCH");
  assert.deepEqual(records.map((record) => (record.JMetadatos as { requested: number }).requested), [5, 2]);
});

test("V8.1 and V8.8: a valuation has 25 listings found with AI at most, across its markets, used or not, and the server holds it", async () => {
  const fake = turnOn({ marketNote: "", candidates: numbered(1, 5) });
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const before = await setup(jar, fixture.publicId);
  assert.deepEqual(before.body.data?.quota, { used: 0, cap: 25, cards: 0 });
  assert.equal(before.body.data?.batch, 5);

  // 20 land listings and 4 houses created before the searches were kept: 24 of 25, counted across both markets.
  assert.equal((await createCards(jar, fixture.publicId, inputsOf(numbered(101, 120)))).status, 201);
  const houses = inputsOf(numbered(201, 205).map((item, index) => ({ ...item, propertyType: "Casa", builtArea: 150 + index })));
  assert.equal((await createCards(jar, fixture.publicId, houses.slice(0, 4), "INMUEBLE_VENTA")).status, 201);
  assert.deepEqual((await setup(jar, fixture.publicId)).body.data?.quota, { used: 24, cap: 25, cards: 24 });

  // A search asks only for the one place left.
  const started = await start(jar, fixture.publicId, { text: REQUEST, count: 5 });
  assert.equal(started.status, 202, started.body.error);
  assert.equal(started.body.data?.count, 1);
  const found = await finished(jar, fixture.publicId, String(started.body.data?.jobId));
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  assert.equal(found.candidates.length, 1);
  assert.match(fake.prompts.at(-1)?.prompt.user ?? "", /reporta como máximo un anuncio\./);

  // Two cards do not fit: rejected whole, saying how many are left.
  const tooMany = await createCards(jar, fixture.publicId, inputsOf(numbered(301, 302)));
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.body.error ?? "", /tiene 24 de 25 comparables encontrados con IA: solo puedes agregar uno más/);
  // The listing found becomes a card: it was already counted when it was found.
  const last = await createCards(jar, fixture.publicId, found.candidates);
  assert.equal(last.status, 201, last.body.error);
  assert.deepEqual(last.body.data?.quota, { used: 25, cap: 25, cards: 25 });

  // Full: no search runs, in this market or another, and no card is created.
  const calls = fake.prompts.length;
  const refused = await start(jar, fixture.publicId, { text: REQUEST });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error ?? "", /ya tiene los 25 anuncios encontrados con IA que puede tener/);
  assert.equal((await start(jar, fixture.publicId, { text: REQUEST }, "INMUEBLE_VENTA")).status, 409);
  assert.equal(fake.prompts.length, calls, "the provider was not called");
  const fifth = await createCards(jar, fixture.publicId, houses.slice(4), "INMUEBLE_VENTA");
  assert.equal(fifth.status, 409);
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_VENTA")).comparables.length, 4);

  // V8.8: taking out of the valuation a listing a search found does not free its place («se contabilizan aunque no uses ninguno»).
  const searched = (await market(fixture)).comparables.find((item) => item.url === found.candidates[0].url);
  assert.ok(searched);
  await prisma.comparableAvaluo.update({ where: { UIdentificadorPublico: searched.id }, data: { BIncluido: false, DFechaExclusion: new Date(), SMotivoExclusion: "Prueba" } });
  assert.deepEqual((await setup(jar, fixture.publicId)).body.data?.quota, { used: 25, cap: 25, cards: 24 });
});

test("V8.1: a card created from a listing without a date is dated the day of consultation and valid six months", async () => {
  turnOn({ marketNote: "", candidates: [listing("sin-fecha"), listing("con-fecha", { listingDate: "2026-10-30", landArea: 6100 })] });
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const found = await searchAndWait(jar, fixture.publicId);
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  assert.equal((await createCards(jar, fixture.publicId, found.candidates)).status, 201);
  const [undated, dated] = (await market(fixture)).comparables;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  assert.equal(undated.offerDate, today);
  assert.equal(undated.consultedOn, today);
  assert.equal(undated.validityMonths, 6);
  assert.equal(dated.offerDate, "2026-10-30");
  assert.equal(dated.validityMonths, 6);
});

test("V8.2: the page the provider opened is read again, verified as written, and a page that says it is no longer published leaves its listing out", async () => {
  const page = `${site}/anuncio/leones`;
  const pageText = [
    "Terreno en venta en Paseo de los Leones, Ciudad Bugambilias, Zapopan", "$3,910,000", "391 m² de terreno",
    "Terreno de 10 x 39.1 m", "El lote presenta una forma irregular.", "Información del anunciante: Manuel Flores",
  ].join("\n");
  const fake = createFakeAiGateway({
    webSearch: {
      answer: {
        marketNote: "",
        candidates: [
          listing("leones", { landArea: 391, price: 3_910_000, pageStatus: "vigente" }),
          listing("baja", { pageStatus: "vigente" }),
          listing("listado", { urlKind: "listado" }),
        ],
      },
      queries: ["terrenos Ciudad Ejemplo"],
      pages: [{ url: page, text: pageText }, { url: `${site}/anuncio/baja`, text: "Este anuncio ya no está publicado." }],
    },
    extraction: {
      operation: "venta", operationEvidence: "Terreno en venta", street: "Paseo de los Leones", subdivision: "Ciudad Bugambilias",
      frontage: "Terreno de 10 x 39.1 m", depth: "Terreno de 10 x 39.1 m", shape: "forma irregular", contactName: "Manuel Flores",
      price: "$3,910,000", landArea: "391 m²", publicationId: "ID inventado que no está en la página",
    },
  });
  overrideAiGateway(fake.gateway);
  overrideAiWebSearch(true);
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture, "VALUADOR");
  const found = await searchAndWait(jar, fixture.publicId);
  assert.equal(found.status, "done");
  if (found.status !== "done") return;
  assert.deepEqual(found.candidates.map((candidate) => candidate.url), [page]);
  assert.deepEqual(found.discards, { listingPage: 1, unpublished: 1, extra: 0, other: 0 });
  const [read] = found.candidates;
  assert.equal(read.pageRead, true);
  // V8.11: a page lists other listings too; the address is never filled from it.
  assert.equal(read.street, null);
  assert.equal(read.subdivision, null);
  assert.equal(read.frontage, 10);
  assert.equal(read.depth, 39.1);
  assert.equal(read.shape, "forma irregular");
  assert.equal(read.contactName, "Manuel Flores");
  assert.equal(read.publicationId, null, "a fragment that is not in the page is never filled");
  assert.ok(read.verifiedFields.includes("price"));
  // Both pages the provider opened were read as they arrived; the reading is recorded apart.
  assert.equal(fake.prompts.filter((item) => item.kind === "extract").length, 2);
  const [record] = await usageOf(fixture, "AI_COMPARABLE_SEARCH");
  const metadata = record.JMetadatos as Record<string, number>;
  assert.equal(metadata.pagesOpened, 2);
  assert.equal(metadata.pagesRead, 1);
  assert.equal(metadata.discardedListingPages, 1);
  assert.equal(metadata.discardedUnpublished, 1);

  const created = await createCards(jar, fixture.publicId, found.candidates);
  assert.equal(created.status, 201, created.body.error);
  const [card] = (await market(fixture)).comparables;
  // Only what the search model read of this listing: never another listing's street (V8.11, «Callejón del Iris»).
  assert.equal(card.address?.street ?? null, null);
  assert.equal(card.address?.subdivision ?? null, null);
  assert.equal(card.frontage, 10);
  assert.equal(card.depth, 39.1);
  assert.equal(card.shape, "forma irregular");
  assert.equal(card.contactName, "Manuel Flores");
});
