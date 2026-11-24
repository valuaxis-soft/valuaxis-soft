/**
 * 24 Nov 2026: a comparable created by «Crear fichas» showed its printed
 * location as a text of the appraiser's in «Ubicación como la imprime el
 * dictamen», so editing the street later left the old line printed. Every
 * place and listing here is invented.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { customLocationText, formatAddress } from "../src/features/valuations/calculation/comparable-card";
import { foundComparableSchema } from "../src/features/valuations/comparable-search/schemas";
import {
  addWebListingsSchema,
  candidateInputOf,
  comparableFromWebListing,
  normalizeWebListings,
  type WebListingSearchAnswer,
} from "../src/features/valuations/comparable-search/web-listings";

type ModelCandidate = WebListingSearchAnswer["candidates"][number];

const listing = (overrides: Partial<ModelCandidate> = {}): ModelCandidate => ({
  title: "Terreno en venta en Ciudad Ejemplo", propertyType: "terreno", operation: "venta", landArea: 360, builtArea: null, price: 4_360_000,
  currency: "MXN", neighborhood: "Lomas Ficticias", municipality: "Zapopan", state: "Jalisco", addressOrReference: "", street: "Av. de los Ejemplos",
  streetNumber: "120", subdivision: "", postalCode: "C.P. 45110", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, floor: "",
  age: null, frontage: null, depth: null, frontCount: null, landUse: "", topography: "", services: "", shape: "", conservation: "", amenities: "",
  contactName: "", agency: "", contactPhone: "", publicationId: "", portal: "Portal Ejemplo", url: "https://portal.example/propiedades/terreno-1.html",
  urlKind: "anuncio", pageStatus: "vigente", listingDate: "", notes: "",
  ...overrides,
});

const cardOf = (candidate: ModelCandidate) => {
  const [found] = normalizeWebListings("TERRENO_VENTA", { candidates: [candidate], marketNote: "" }, { resultUrls: [], knownUrls: [] }).candidates;
  const input = addWebListingsSchema.parse({ candidates: [candidateInputOf(found)] }).candidates[0];
  return foundComparableSchema.parse(comparableFromWebListing("TERRENO_VENTA", input, "2026-11-24"));
};

test("a comparable created from a listing with its street has no text of its own: the location follows the fields", () => {
  const card = cardOf(listing());
  assert.equal(card.location, formatAddress(card.address), "it prints the line the parts assemble");
  assert.equal(customLocationText(card.location, card.address), "", "the form shows the field empty, not a fixed text");
  // The appraiser corrects the street: the line printed is the new one.
  const corrected = { ...card.address!, street: "Calle Nueva Ficticia" };
  assert.match(formatAddress(corrected), /Calle Nueva Ficticia 120/);
});

test("a listing without a street keeps the reference it gave as its own text, since the fields do not assemble it", () => {
  const card = cardOf(listing({ street: "", streetNumber: "", addressOrReference: "A dos cuadras de la plaza ficticia" }));
  assert.notEqual(customLocationText(card.location, card.address), "");
  assert.match(customLocationText(card.location, card.address), /plaza ficticia/);
});

test("a stored comparable: its line equal to the assembled one is not custom; a different one is kept as typed", () => {
  const address = { street: "Hidalgo", number: "12", crossStreet: "Morelos", neighborhood: "Centro", municipality: "Arandas", state: "Jalisco", postalCode: null, subdivision: null };
  const assembled = formatAddress(address);
  assert.equal(customLocationText(assembled, address), "");
  assert.equal(customLocationText(`  ${assembled} `, address), "", "spaces around do not make it custom");
  assert.equal(customLocationText("Hidalgo 12 & Morelos, col. Centro, Arandas, Jalisco", address), "", "«&» reads «esquina con», as the dictamen prints it");
  assert.equal(customLocationText("Frente a la plaza, Arandas", address), "Frente a la plaza, Arandas");
  assert.equal(customLocationText("Hidalgo 12, Arandas", null), "Hidalgo 12, Arandas", "without parts, the stored line is the text");
  assert.equal(customLocationText(null, address), "");
});
