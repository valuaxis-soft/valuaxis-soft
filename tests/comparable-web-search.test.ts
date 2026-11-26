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
  candidateInputOf,
  comparableFromWebListing,
  publishedDetails,
  WEB_SEARCH_BATCH,
  listingUrl,
  listingsWanted,
  normalizeWebListings,
  pageSaysUnpublished,
  suggestedWebSearchText,
  webListingSearchPrompt,
  webListingSearchSchema,
  webSearchRequestSchema,
  type WebListingSearchAnswer,
} from "../src/features/valuations/comparable-search/web-listings";
import { consumeAiWebSearchRateLimit } from "../src/security/rate-limit/ai-limit";

type ModelCandidate = WebListingSearchAnswer["candidates"][number];
/** The details a listing did not publish: empty texts and null numbers. */
const NOT_PUBLISHED = {
  street: "", streetNumber: "", subdivision: "", postalCode: "", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, floor: "",
  age: null, frontage: null, depth: null, frontCount: null, landUse: "", topography: "", services: "", shape: "", conservation: "", amenities: "",
  contactName: "", agency: "", contactPhone: "", publicationId: "",
} satisfies Partial<ModelCandidate>;
const listing = (overrides: Partial<ModelCandidate> = {}): ModelCandidate => ({
  title: "Terreno en Las Lomas", propertyType: "terreno", operation: "venta", landArea: 7881, builtArea: null, price: 4_216_335,
  currency: "MXN", neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", addressOrReference: "a 2 km del libramiento norte",
  portal: "Portal Ejemplo", url: "https://www.portal.example/anuncio/1/", urlKind: "anuncio", pageStatus: "sin_abrir", listingDate: "2026-11-02", notes: "Frente de 40 m.",
  ...NOT_PUBLISHED,
  ...overrides,
});
const normalize = (candidates: ModelCandidate[], options: { resultUrls?: string[]; knownUrls?: string[]; count?: number; pages?: Map<string, string> } = {}) =>
  normalizeWebListings("TERRENO_VENTA", { candidates, marketNote: "" }, { resultUrls: options.resultUrls ?? [], knownUrls: options.knownUrls ?? [], count: options.count, pages: options.pages });

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

test("V8.2: a listing known only from a page of several listings or a search is left out: its link is not the listing's own", () => {
  const { candidates, discards } = normalize([
    listing(),
    listing({ url: "https://portal.example/terrenos/villa-ejemplo", urlKind: "listado" }),
  ]);
  assert.deepEqual(candidates.map((candidate) => candidate.url), ["https://www.portal.example/anuncio/1/"]);
  assert.equal(discards.listingPage, 1);
});

test("V8.2: a listing whose page says it is no longer published is left out, by the model's word or by the page's text", () => {
  const pages = new Map([
    ["portal.example/anuncio/2", "Terreno en Las Lomas\nEste anuncio ya no está publicado. Mira otros similares."],
    ["portal.example/anuncio/3", "Terreno en venta\n$3,000,000\n7,000 m²\nInformación del anunciante: Manuel Flores"],
    ["portal.example/anuncio/4", "La propiedad ya no está disponible"],
  ]);
  const { candidates, discards } = normalize([
    listing({ url: "https://portal.example/anuncio/1", pageStatus: "no_publicado" }),
    listing({ url: "https://portal.example/anuncio/2", pageStatus: "vigente" }),
    listing({ url: "https://portal.example/anuncio/3", pageStatus: "vigente" }),
    listing({ url: "https://portal.example/anuncio/4", pageStatus: "sin_abrir" }),
    listing({ url: "https://portal.example/anuncio/5", pageStatus: "vigente" }),
  ], { pages });
  assert.deepEqual(candidates.map((candidate) => candidate.key), ["portal.example/anuncio/3", "portal.example/anuncio/5"]);
  assert.equal(discards.unpublished, 3);
  // Read only when the server saw the page: the model saying «vigente» of one nobody returned is not a reading.
  assert.deepEqual(candidates.map((candidate) => candidate.pageRead), [true, false]);
  assert.equal(pageSaysUnpublished("Publicación finalizada"), true);
  assert.equal(pageSaysUnpublished("Terreno plano, todos los servicios disponibles"), false);
});

test("V8.2: a search proposes at most the number asked for, five by default, never «varios»", () => {
  const many = Array.from({ length: 8 }, (_, index) => listing({ url: `https://portal.example/anuncio/${index + 1}` }));
  const five = normalize(many);
  assert.equal(five.candidates.length, 5);
  assert.equal(five.discards.extra, 3);
  const two = normalize(many, { count: 2 });
  assert.deepEqual(two.candidates.map((candidate) => candidate.key), ["portal.example/anuncio/1", "portal.example/anuncio/2"]);
  // More than the batch is never shown, whatever is asked.
  assert.equal(normalize(many, { count: 40 }).candidates.length, WEB_SEARCH_BATCH);
  assert.equal(listingsWanted(5), "cinco anuncios");
  assert.equal(listingsWanted(1), "un anuncio");
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
    count: 2,
  }, "2026-11-22");
  assert.match(prompt.system, /No estimes/);
  assert.match(prompt.system, /información no confiable/);
  assert.match(prompt.system, /Nunca escribas, completes ni corrijas una dirección web de memoria/);
  assert.match(prompt.user, /Tipo de comparable que se busca: terrenos en venta\./);
  assert.match(prompt.user, /<solicitud>\nterrenos de 5,000 a 7,000 m² en Villa Ejemplo\n<\/solicitud>/);
  assert.match(prompt.user, /<solicitud_anterior>\nterrenos en la mancha urbana\n<\/solicitud_anterior>/);
  assert.match(prompt.user, /<ya_encontrados>\nhttps:\/\/portal\.example\/anuncio\/1\n<\/ya_encontrados>/);
  // «Buscar 2 más»: the number in words, and only new ones.
  assert.match(prompt.user, /reporta como máximo dos anuncios más, distintos de los ya encontrados/);
  assert.match(prompt.system, /Reporta como máximo ese número, nunca más/);
  // Every datum of the listing in its field: the examples of the appraiser's videos are in the rules.
  for (const example of ["Remanso de los Conejos Poniente", "Ciudad Bugambilias", "Terreno de 12 x 30 m", "M² de frente: 12", "forma irregular", "Manuel Flores", "4 baños, 1 medio", "Piso 3", "C.P. 45238"]) {
    assert.ok(prompt.system.includes(example), example);
  }
  assert.match(prompt.system, /SU PROPIA página/);
  assert.match(prompt.system, /ya no está publicado/);
  const first = webListingSearchPrompt({ type: "INMUEBLE_RENTA", text: "otra cosa distinta", previous: [], knownUrls: [], count: 5 }, "2026-01-01");
  assert.match(first.user, /reporta como máximo cinco anuncios\./);
  // The rules are the same bytes on every call; what changes travels in the user turn.
  assert.equal(prompt.system, first.system);
});

test("the box starts with a request written from the subject", () => {
  assert.equal(
    suggestedWebSearchText("TERRENO_VENTA", {
      propertyType: "Terreno", neighborhood: "Las Lomas", municipality: "Villa Ejemplo", state: "Jalisco", address: null, area: 6000, landUse: "habitacional",
    }),
    "Terrenos en venta en Villa Ejemplo, Jalisco, en la colonia Las Lomas o cerca de ella, de 4,200 a 7,800 m² de terreno (el sujeto mide 6,000 m²), "
    + "con uso habitacional. Necesito cinco, con superficie, precio, zona, características y la liga de cada anuncio.",
  );
  assert.equal(
    suggestedWebSearchText("INMUEBLE_RENTA", { propertyType: "Local comercial", neighborhood: null, municipality: null, state: null, address: "Av. Ficticia 12, Villa Ejemplo", area: 80, landUse: null }),
    // 80 ± 30 % is 56 to 104; two significant figures.
    "Local comercial en renta cerca de Av. Ficticia 12, Villa Ejemplo, de 56 a 100 m² de construcción (el sujeto mide 80 m²). "
    + "Necesito cinco, con superficie, precio, zona, características y la liga de cada anuncio.",
  );
  assert.equal(
    suggestedWebSearchText("INMUEBLE_VENTA", { propertyType: null, neighborhood: null, municipality: null, state: null, address: null, area: null, landUse: null }),
    "Inmuebles construidos en venta. Necesito cinco, con superficie, precio, zona, características y la liga de cada anuncio.",
  );
});

test("the request of a search has a minimum, a maximum and keeps only real addresses of what is on screen", () => {
  assert.equal(webSearchRequestSchema.safeParse({ text: "terrenos" }).success, false);
  assert.equal(webSearchRequestSchema.safeParse({ text: "x".repeat(2001) }).success, false);
  assert.equal(webSearchRequestSchema.safeParse({ text: "terrenos en Villa Ejemplo", previous: Array(6).fill("antes") }).success, false);
  const parsed = webSearchRequestSchema.parse({ text: "  terrenos en Villa Ejemplo  ", knownUrls: ["https://portal.example/a", "no es una liga"] });
  assert.deepEqual(parsed, { text: "terrenos en Villa Ejemplo", previous: [], knownUrls: ["https://portal.example/a"], count: 5, target: "market" });
  // «Buscar N más»: one to five.
  assert.equal(webSearchRequestSchema.parse({ text: "terrenos en Villa Ejemplo", count: 2 }).count, 2);
  assert.equal(webSearchRequestSchema.safeParse({ text: "terrenos en Villa Ejemplo", count: 0 }).success, false);
  assert.equal(webSearchRequestSchema.safeParse({ text: "terrenos en Villa Ejemplo", count: 6 }).success, false);
});

test("a chosen listing becomes the payload of a comparable with only what the listing gave", () => {
  const [candidate] = normalize([listing()]).candidates;
  const parsed = addWebListingsSchema.parse({ candidates: [candidate] }).candidates[0];
  const comparable = comparableFromWebListing("TERRENO_VENTA", parsed, "2026-11-22");
  assert.deepEqual(foundComparableSchema.parse(comparable), {
    location: "a 2 km del libramiento norte, Las Lomas, Villa Ejemplo, Jalisco",
    area: 7881,
    price: 4_216_335,
    landUse: null, shape: null, zone: null, frontCount: null, frontage: null, depth: null, topography: null, services: null,
    notes: "Terreno en Las Lomas. Frente de 40 m.",
    sourceName: "Portal Ejemplo",
    contactName: null, contactPhone: null,
    url: "https://www.portal.example/anuncio/1/",
    offerDate: "2026-11-02",
    consultedOn: "2026-11-22",
    validityMonths: 6,
    address: { state: "Jalisco", municipality: "Villa Ejemplo", neighborhood: "Las Lomas", street: null, number: null, subdivision: null, postalCode: null },
    operationType: "VENTA",
    // A land market's card is «Terreno / Lote».
    propertyDetails: { kind: "TERRENO", kindLabel: "Terreno / Lote", assetClass: "INMUEBLE" },
    listingDetails: { currency: "MXN", dataOrigin: "Búsqueda con IA", dataVerified: "NO", publicationId: null },
  });
});

test("everything else a listing publishes lands in its field of the card; what is not published stays empty", () => {
  const { candidates } = normalizeWebListings("INMUEBLE_VENTA", {
    marketNote: "",
    candidates: [listing({
      title: "Casa en Fraccionamiento Ejemplo", propertyType: "Casa", landArea: 160, builtArea: 185, price: 2_350_000, url: "https://portal.example/casa/7",
      street: "Av. Inventada 245", postalCode: "C.P. 47600", bedrooms: 3, bathrooms: 2, halfBaths: 1, parking: 2, levels: 2, age: 10,
      frontage: 8, depth: 20, frontCount: 1, landUse: "Habitacional", topography: "Plana", services: "Todos los servicios", shape: "Regular",
      conservation: "Buen estado", amenities: "jardín, cocina integral", contactName: "Asesora Ficticia", contactPhone: "33 0000 0000",
      publicationId: "EB-XX0001", notes: "Orientación norte.",
    })],
  }, { resultUrls: [], knownUrls: [] });
  const [candidate] = candidates;
  assert.equal(candidate.bathrooms, 2.5, "two whole bathrooms and a half one are 2.5, as the card keeps them");
  assert.equal(candidate.postalCode, "47600");
  assert.deepEqual(publishedDetails(candidate).length, 19);
  const parsed = addWebListingsSchema.parse({ candidates: [candidateInputOf(candidate)] }).candidates[0];
  const comparable = foundComparableSchema.parse(comparableFromWebListing("INMUEBLE_VENTA", parsed, "2026-11-23"));
  assert.equal(comparable.area, 185);
  assert.equal(comparable.landArea, 160);
  assert.equal(comparable.bedrooms, 3);
  assert.equal(comparable.bathrooms, 2.5);
  assert.equal(comparable.conservation, "Buen estado");
  assert.deepEqual(comparable.propertyDetails, { age: 10, levels: 2, parking: 2, kind: "CASA_HABITACION", kindLabel: "Casa habitación", assetClass: "INMUEBLE" });
  assert.equal(comparable.frontage, 8);
  assert.equal(comparable.depth, 20);
  assert.equal(comparable.frontCount, 1);
  assert.equal(comparable.landUse, "Habitacional");
  assert.equal(comparable.topography, "Plana");
  assert.equal(comparable.services, "Todos los servicios");
  assert.equal(comparable.shape, "Regular");
  assert.equal(comparable.contactName, "Asesora Ficticia");
  assert.equal(comparable.contactPhone, "33 0000 0000");
  assert.equal(comparable.address?.street, "Av. Inventada 245");
  assert.equal(comparable.address?.postalCode, "47600");
  assert.equal(comparable.listingDetails?.publicationId, "EB-XX0001");
  assert.equal(comparable.notes, "Casa en Fraccionamiento Ejemplo. Referencia: a 2 km del libramiento norte. Orientación norte. Amenidades: jardín, cocina integral.");
  // With its street, the location is the line the dictamen prints from the parts, the road with the type its name says.
  assert.equal(comparable.location, "Av. Inventada 245, col. Las Lomas, C.P. 47600, Villa Ejemplo, Jalisco");
  assert.equal(comparable.address?.streetType, "AVENIDA");

  // A reference that repeats the street and the town is not written twice.
  const repeated = comparableFromWebListing("INMUEBLE_VENTA", { ...parsed, street: "Libra 1274", reference: "Libra 1274, Villa Ejemplo, Jalisco" }, "2026-11-23");
  assert.equal(repeated.location, "Libra 1274, col. Las Lomas, C.P. 47600, Villa Ejemplo, Jalisco");
  assert.doesNotMatch(repeated.notes ?? "", /Referencia/);
  const noStreet = comparableFromWebListing("INMUEBLE_VENTA", { ...parsed, street: null, reference: "Las Lomas, Villa Ejemplo" }, "2026-11-23");
  assert.equal(noStreet.location, "Las Lomas, Villa Ejemplo, Jalisco");

  // A land's card has no rooms: they go to its notes, as numbers the listing gave.
  const land = normalizeWebListings("TERRENO_VENTA", { marketNote: "", candidates: [listing({ builtArea: 90, bedrooms: 2, age: 30 })] }, { resultUrls: [], knownUrls: [] });
  const landComparable = comparableFromWebListing("TERRENO_VENTA", addWebListingsSchema.parse({ candidates: [candidateInputOf(land.candidates[0])] }).candidates[0], "2026-11-23");
  assert.equal(landComparable.bedrooms, undefined);
  assert.match(landComparable.notes ?? "", /El anuncio publica 90 m² de construcción\. 2 recámaras\. 30 años de antigüedad\./);

  // What is not a usable value is «no publicado», never a guess: a year is not an age, a word is not a phone.
  const odd = normalize([listing({ age: 1998, contactPhone: "por WhatsApp", postalCode: "476", bedrooms: 2.5, frontCount: 0 })]).candidates[0];
  assert.equal(odd.age, null);
  assert.equal(odd.contactPhone, null);
  assert.equal(odd.postalCode, null);
  assert.equal(odd.bedrooms, null);
  assert.equal(odd.frontCount, null);
});

test("a client of before that does not send the details still creates the card", () => {
  const [candidate] = normalize([listing()]).candidates;
  const { street: _street, bedrooms: _bedrooms, contactPhone: _phone, ...before } = candidateInputOf(candidate);
  const parsed = addWebListingsSchema.parse({ candidates: [before] }).candidates[0];
  assert.equal(parsed.street, null);
  assert.equal(parsed.bedrooms, null);
});

test("an unpublished price stays empty and a price in dollars is not written as the price", () => {
  const base = addWebListingsSchema.parse({ candidates: normalize([listing()]).candidates }).candidates[0];
  const unpublished = comparableFromWebListing("TERRENO_VENTA", { ...base, price: null, landArea: null }, "2026-11-22");
  assert.equal(unpublished.price, null);
  assert.equal(unpublished.area, null);
  const dollars = comparableFromWebListing("TERRENO_VENTA", { ...base, price: 250_000, currency: "USD" }, "2026-11-22");
  assert.equal(dollars.price, null);
  assert.match(dollars.notes ?? "", /Precio publicado en dólares: USD 250,000; no se convirtió a pesos: escribe el tipo de cambio en la ficha\./);
  assert.equal(dollars.listingDetails?.currency, "USD");
  // The dollars are kept, waiting for the rate the appraiser writes in the card.
  assert.equal(dollars.listingDetails?.priceInCurrency, 250_000);
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
