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
  url: `${site}/anuncio/${path}`, urlKind: "anuncio", listingDate: "", notes: "",
  // What else a listing may publish; here, nothing.
  street: "", postalCode: "", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, age: null, frontage: null, depth: null,
  frontCount: null, landUse: "", topography: "", services: "", shape: "", conservation: "", amenities: "", contactName: "", contactPhone: "", publicationId: "",
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
  const { seconds, ...metadata } = usage.JMetadatos as Record<string, number | string>;
  assert.equal(typeof seconds, "number");
  assert.deepEqual(metadata, {
    model: "fake-search", inputTokens: 42_000, outputTokens: 3_000, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 2,
    candidates: 3, discarded: 1, characters: REQUEST.length,
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
  turnOn();
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

  // A new search marks what the firm already has; here, in this very valuation.
  const later = await searchAndWait(jar, fixture.publicId);
  assert.equal(later.status, "done");
  if (later.status !== "done") return;
  assert.deepEqual(later.candidates.map((candidate) => candidate.existing && { folio: candidate.existing.folio, inValuation: candidate.existing.inValuation }), [
    { folio: one.folio, inValuation: true }, { folio: two.folio, inValuation: true }, null,
  ]);

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
