/**
 * The pure parts of «Buscar con IA»: what the server keeps of the model's
 * answer, what it computes itself, and how a listing becomes the payload of a
 * comparable. Every place and listing here is invented.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { foundComparableSchema } from "../src/features/valuations/comparable-search/schemas";
import {
  addWebListingsSchema,
  comparableFromWebListing,
  listingUrl,
  normalizeWebListings,
  suggestedWebSearchText,
  webListingSearchPrompt,
  webListingSearchSchema,
  webSearchRequestSchema,
  type WebListingSearchAnswer,
} from "../src/features/valuations/comparable-search/web-listings";
import { consumeAiWebSearchRateLimit } from "../src/security/rate-limit/ai-limit";

type ModelCandidate = WebListingSearchAnswer["candidates"][number];
const listing = (overrides: Partial<ModelCandidate> = {}): ModelCandidate => ({
  title: "Terreno en Las Lomas", propertyType: "terreno", operation: "venta", landArea: 7881, builtArea: null, price: 4_216_335,
  currency: "MXN", neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", addressOrReference: "a 2 km del libramiento norte",
  portal: "Portal Ejemplo", url: "https://www.portal.example/anuncio/1/", listingDate: "2026-11-02", notes: "Frente de 40 m.",
  ...overrides,
});
const normalize = (candidates: ModelCandidate[], options: { resultUrls?: string[]; knownUrls?: string[] } = {}) =>
  normalizeWebListings("TERRENO_VENTA", { candidates, marketNote: "" }, { resultUrls: options.resultUrls ?? [], knownUrls: options.knownUrls ?? [] });

test("the model answers in a fixed shape: a missing field or a number as text is not accepted", () => {
  assert.equal(webListingSearchSchema.safeParse({ candidates: [listing()], marketNote: "" }).success, true);
  assert.equal(webListingSearchSchema.safeParse({ candidates: [{ ...listing(), price: "4,216,335" }], marketNote: "" }).success, false);
  const { url: _url, ...withoutUrl } = listing();
  assert.equal(webListingSearchSchema.safeParse({ candidates: [withoutUrl], marketNote: "" }).success, false);
  assert.equal(webListingSearchSchema.safeParse({ candidates: [listing({ operation: "traspaso" as never })], marketNote: "" }).success, false);
});

test("a candidate without an http(s) address on the web is discarded", () => {
  const { candidates, discarded } = normalize([
    listing({ url: "" }),
    listing({ url: "portal.example/anuncio/2" }),
    listing({ url: "javascript:alert(1)" }),
    listing({ url: "ftp://portal.example/anuncio/3" }),
    listing({ url: "https://localhost/anuncio" }),
    listing({ url: "https://usuario:clave@portal.example/anuncio/4" }),
    listing({ url: "http://portal.example/anuncio/5" }),
  ]);
  assert.deepEqual(candidates.map((candidate) => candidate.url), ["http://portal.example/anuncio/5"]);
  assert.equal(discarded, 6);
  assert.equal(listingUrl("  https://portal.example/a?b=1  "), "https://portal.example/a?b=1");
});

test("the price per m² is computed here, from the published price and area, and only in pesos", () => {
  const { candidates } = normalize([
    listing(),
    listing({ url: "https://portal.example/2", price: null }),
    listing({ url: "https://portal.example/3", landArea: null }),
    listing({ url: "https://portal.example/4", currency: "USD", price: 250_000 }),
    listing({ url: "https://portal.example/5", price: 0, landArea: -5 }),
  ]);
  // 4,216,335 / 7,881 = 535.00 as in the appraiser's example.
  assert.equal(candidates[0].unitValue, 535);
  assert.deepEqual(candidates.map((candidate) => candidate.unitValue), [535, null, null, null, null]);
  assert.equal(candidates[1].price, null);
  assert.equal(candidates[2].landArea, null);
  assert.equal(candidates[3].price, 250_000);
  // Not a price and not an area: «no publicado», never a zero.
  assert.equal(candidates[4].price, null);
  assert.equal(candidates[4].landArea, null);
});

test("a built comparable is measured by its built area", () => {
  const answer = { candidates: [listing({ propertyType: "casa", landArea: 200, builtArea: 150, price: 3_000_000 })], marketNote: "" };
  const { candidates } = normalizeWebListings("INMUEBLE_VENTA", answer, { resultUrls: [], knownUrls: [] });
  assert.equal(candidates[0].unitValue, 20_000);
});

test("a repeat, a listing already on screen and one of the other operation are left out", () => {
  const { candidates, discarded } = normalize([
    listing(),
    listing({ url: "http://portal.example/anuncio/1" }),
    listing({ url: "https://portal.example/ya-visto/" }),
    listing({ url: "https://portal.example/renta", operation: "renta" }),
    listing({ url: "https://portal.example/sin-operacion", operation: "no_indicado" }),
  ], { knownUrls: ["https://www.portal.example/ya-visto"] });
  assert.deepEqual(candidates.map((candidate) => candidate.key), ["portal.example/anuncio/1", "portal.example/sin-operacion"]);
  assert.equal(candidates[1].operation, null);
  assert.equal(discarded, 3);
});

test("an address the provider's search did not return is marked, not hidden", () => {
  const { candidates } = normalize(
    [listing(), listing({ url: "https://portal.example/escrita-de-memoria" })],
    { resultUrls: ["https://portal.example/anuncio/1"] },
  );
  assert.deepEqual(candidates.map((candidate) => candidate.urlConfirmed), [true, false]);
});

test("empty texts become empty, an odd date is dropped and the portal falls back to the site", () => {
  const { candidates, marketNote } = normalizeWebListings("TERRENO_VENTA", {
    candidates: [listing({ title: "  ", neighborhood: "", addressOrReference: " ", portal: "", listingDate: "hace 3 días", notes: "" })],
    marketNote: "  El mercado es reducido.  ",
  }, { resultUrls: [], knownUrls: [] });
  const [candidate] = candidates;
  assert.equal(candidate.title, "Anuncio sin título");
  assert.equal(candidate.neighborhood, null);
  assert.equal(candidate.reference, null);
  assert.equal(candidate.portal, "portal.example");
  assert.equal(candidate.listingDate, null);
  assert.equal(candidate.notes, null);
  assert.equal(marketNote, "El mercado es reducido.");
});

test("the request tells the model the rules and carries the appraiser's words as data", () => {
  const prompt = webListingSearchPrompt({
    type: "TERRENO_VENTA",
    text: "terrenos de 5,000 a 7,000 m² en Villa Ejemplo",
    previous: ["terrenos en la mancha urbana"],
    knownUrls: ["https://portal.example/anuncio/1"],
  }, "2026-11-22");
  assert.match(prompt.system, /No estimes/);
  assert.match(prompt.system, /información no confiable/);
  assert.match(prompt.system, /Nunca escribas, completes ni corrijas una dirección web de memoria/);
  assert.match(prompt.user, /Tipo de comparable que se busca: terrenos en venta\./);
  assert.match(prompt.user, /<solicitud>\nterrenos de 5,000 a 7,000 m² en Villa Ejemplo\n<\/solicitud>/);
  assert.match(prompt.user, /<solicitud_anterior>\nterrenos en la mancha urbana\n<\/solicitud_anterior>/);
  assert.match(prompt.user, /<ya_encontrados>\nhttps:\/\/portal\.example\/anuncio\/1\n<\/ya_encontrados>/);
  // The rules are the same bytes on every call; what changes travels in the user turn.
  assert.equal(prompt.system, webListingSearchPrompt({ type: "INMUEBLE_RENTA", text: "otra cosa distinta", previous: [], knownUrls: [] }, "2026-01-01").system);
});

test("the box starts with a request written from the subject", () => {
  assert.equal(
    suggestedWebSearchText("TERRENO_VENTA", {
      propertyType: "Terreno", neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", address: null, area: 6000, landUse: "habitacional",
    }),
    "Terrenos en venta en Villa Ejemplo, Jalisco, en la colonia Las Lomas o cerca de ella, de 4,200 a 7,800 m² de terreno (el sujeto mide 6,000 m²), "
    + "con uso habitacional. Necesito varios, con superficie, precio, zona y la liga de cada anuncio.",
  );
  assert.equal(
    suggestedWebSearchText("INMUEBLE_RENTA", { propertyType: "Local comercial", neighborhood: null, municipality: null, state: null, address: "Av. Ficticia 12, Villa Ejemplo", area: 80, landUse: null }),
    // 80 ± 30 % is 56 to 104; two significant figures.
    "Local comercial en renta cerca de Av. Ficticia 12, Villa Ejemplo, de 56 a 100 m² de construcción (el sujeto mide 80 m²). "
    + "Necesito varios, con superficie, precio, zona y la liga de cada anuncio.",
  );
  assert.equal(
    suggestedWebSearchText("INMUEBLE_VENTA", { propertyType: null, neighborhood: null, municipality: null, state: null, address: null, area: null, landUse: null }),
    "Inmuebles construidos en venta. Necesito varios, con superficie, precio, zona y la liga de cada anuncio.",
  );
});

test("the request of a search has a minimum, a maximum and keeps only real addresses of what is on screen", () => {
  assert.equal(webSearchRequestSchema.safeParse({ text: "terrenos" }).success, false);
  assert.equal(webSearchRequestSchema.safeParse({ text: "x".repeat(2001) }).success, false);
  assert.equal(webSearchRequestSchema.safeParse({ text: "terrenos en Villa Ejemplo", previous: Array(6).fill("antes") }).success, false);
  const parsed = webSearchRequestSchema.parse({ text: "  terrenos en Villa Ejemplo  ", knownUrls: ["https://portal.example/a", "no es una liga"] });
  assert.deepEqual(parsed, { text: "terrenos en Villa Ejemplo", previous: [], knownUrls: ["https://portal.example/a"] });
});

test("a chosen listing becomes the payload of a comparable with only what the listing gave", () => {
  const [candidate] = normalize([listing()]).candidates;
  const parsed = addWebListingsSchema.parse({ candidates: [candidate] }).candidates[0];
  const comparable = comparableFromWebListing("TERRENO_VENTA", parsed, "2026-11-22");
  assert.deepEqual(foundComparableSchema.parse(comparable), {
    location: "a 2 km del libramiento norte, Las Lomas, Villa Ejemplo, Jalisco",
    area: 7881,
    price: 4_216_335,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: "Terreno en Las Lomas. Frente de 40 m.",
    sourceName: "Portal Ejemplo",
    contactName: null, contactPhone: null,
    url: "https://www.portal.example/anuncio/1/",
    offerDate: "2026-11-02",
    consultedOn: "2026-11-22",
    address: { state: "Jalisco", municipality: "Villa Ejemplo", neighborhood: "Las Lomas" },
    operationType: "VENTA",
    listingDetails: { currency: "MXN", dataOrigin: "Búsqueda con IA", dataVerified: "NO" },
  });
});

test("an unpublished price stays empty and a price in dollars is not written as the price", () => {
  const base = addWebListingsSchema.parse({ candidates: normalize([listing()]).candidates }).candidates[0];
  const unpublished = comparableFromWebListing("TERRENO_VENTA", { ...base, price: null, landArea: null }, "2026-11-22");
  assert.equal(unpublished.price, null);
  assert.equal(unpublished.area, null);
  const dollars = comparableFromWebListing("TERRENO_VENTA", { ...base, price: 250_000, currency: "USD" }, "2026-11-22");
  assert.equal(dollars.price, null);
  assert.match(dollars.notes ?? "", /Precio publicado en dólares: USD 250,000; no se convirtió a pesos\./);
  assert.equal(dollars.listingDetails?.currency, "USD");
});

test("a built comparable takes the built area as its area and keeps the land apart", () => {
  const base = addWebListingsSchema.parse({ candidates: normalize([listing({ propertyType: "Casa", landArea: 200, builtArea: 150 })]).candidates }).candidates[0];
  const comparable = comparableFromWebListing("INMUEBLE_RENTA", base, "2026-11-22");
  assert.equal(comparable.area, 150);
  assert.equal(comparable.landArea, 200);
  assert.equal(comparable.constructionType, "Casa");
  assert.equal(comparable.operationType, "RENTA");
});

test("a listing sent back to become a comparable is held to the same rules", () => {
  const [candidate] = normalize([listing()]).candidates;
  assert.equal(addWebListingsSchema.safeParse({ candidates: [] }).success, false);
  assert.equal(addWebListingsSchema.safeParse({ candidates: [{ ...candidate, url: "javascript:alert(1)" }] }).success, false);
  assert.equal(addWebListingsSchema.safeParse({ candidates: [{ ...candidate, price: -1 }] }).success, false);
  assert.equal(addWebListingsSchema.safeParse({ candidates: Array(41).fill(candidate) }).success, false);
});

test("the search has its own limits: 6 per person every 10 minutes and 60 per firm a day", () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const user = { id: 910_001, organizationId: 920_001 };
  for (let attempt = 0; attempt < 6; attempt += 1) assert.deepEqual(consumeAiWebSearchRateLimit(user, now), { allowed: true });
  assert.deepEqual(consumeAiWebSearchRateLimit(user, now + 1000), { allowed: false, retryAfterSeconds: 599 });
  assert.deepEqual(consumeAiWebSearchRateLimit(user, now + 10 * 60_000), { allowed: true });
  // The firm's limit holds whoever asks.
  let allowed = 0;
  for (let person = 0; person < 70; person += 1) {
    if (consumeAiWebSearchRateLimit({ id: 930_000 + person, organizationId: 920_002 }, now).allowed) allowed += 1;
  }
  assert.equal(allowed, 60);
});
