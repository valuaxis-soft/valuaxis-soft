/**
 * V8.1 and V8.2 (videos of 24 nov 2026): what the appraiser saw a listing
 * publish and the card did not get, read with fake model answers. Every
 * listing, street, name and figure here is invented on the pattern of those
 * videos; none is a real listing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_EXTRACTION } from "./support/fake-ai-gateway";
import { verifyListingExtraction, type ListingExtraction } from "../src/features/ai/listing-extraction";
import { parseDimensions, parseMeters } from "../src/features/ai/text-figures";
import { foundComparableSchema } from "../src/features/valuations/comparable-search/schemas";
import { withPageReading } from "../src/features/valuations/comparable-search/web-listing-pages";
import {
  addWebListingsSchema,
  candidateInputOf,
  comparableFromWebListing,
  normalizeWebListings,
  type WebListingSearchAnswer,
} from "../src/features/valuations/comparable-search/web-listings";

type ModelCandidate = WebListingSearchAnswer["candidates"][number];

/** A listing as the search model reports it, with nothing beyond its title, price, area and address. */
const bare = (overrides: Partial<ModelCandidate> = {}): ModelCandidate => ({
  title: "Terreno en venta en Ciudad Ejemplo", propertyType: "terreno", operation: "venta", landArea: 360, builtArea: null, price: 4_360_000,
  currency: "MXN", neighborhood: "", municipality: "Zapopan", state: "Jalisco", addressOrReference: "", street: "", streetNumber: "", subdivision: "",
  postalCode: "", bedrooms: null, bathrooms: null, halfBaths: null, parking: null, levels: null, floor: "", age: null, frontage: null, depth: null,
  frontCount: null, landUse: "", topography: "", services: "", shape: "", conservation: "", amenities: "", contactName: "", agency: "", contactPhone: "",
  publicationId: "", portal: "Portal Ejemplo", url: "https://portal.example/propiedades/terreno-145998.html", urlKind: "anuncio", pageStatus: "vigente",
  listingDate: "", notes: "",
  ...overrides,
});

const cardOf = (type: "TERRENO_VENTA" | "INMUEBLE_VENTA", candidate: ModelCandidate, today = "2026-11-24") => {
  const [found] = normalizeWebListings(type, { candidates: [candidate], marketNote: "" }, { resultUrls: [], knownUrls: [] }).candidates;
  const input = addWebListingsSchema.parse({ candidates: [candidateInputOf(found)] }).candidates[0];
  return foundComparableSchema.parse(comparableFromWebListing(type, input, today));
};

test("V8.1: every datum the search model read of a land listing lands in its field of the card", () => {
  const card = cardOf("TERRENO_VENTA", bare({
    street: "Remanso de los Conejos Poniente", subdivision: "Ciudad Bugambilias", frontage: 12, depth: 30, shape: "irregular",
    contactName: "Manuel Flores", agency: "Inmobiliaria Ficticia", postalCode: "C.P. 45238",
  }));
  assert.equal(card.address?.street, "Remanso de los Conejos Poniente");
  assert.equal(card.address?.subdivision, "Ciudad Bugambilias");
  assert.equal(card.address?.postalCode, "45238");
  assert.equal(card.frontage, 12);
  assert.equal(card.depth, 30);
  assert.equal(card.shape, "irregular");
  assert.equal(card.contactName, "Manuel Flores");
  // The agency beside the person goes to the notes; without a person it is the contact.
  assert.match(card.notes ?? "", /Inmobiliaria: Inmobiliaria Ficticia/);
  assert.equal(cardOf("TERRENO_VENTA", bare({ agency: "Inmobiliaria Ficticia" })).contactName, "Inmobiliaria Ficticia");
});

test("V8.2: a house's bedrooms, whole and half bathrooms, parking, floor and postal code land in their fields", () => {
  const card = cardOf("INMUEBLE_VENTA", bare({
    title: "Departamento en venta", propertyType: "Departamento", landArea: null, builtArea: 180, street: "Paseo de los Leones", streetNumber: "1200",
    subdivision: "Ciudad Bugambilias", bedrooms: 4, bathrooms: 4, halfBaths: 1, parking: 2, floor: "3", postalCode: "45238",
    contactName: "Asesora Ficticia", agency: "Inmobiliaria Ficticia",
  }));
  assert.equal(card.bedrooms, 4);
  assert.equal(card.bathrooms, 4.5, "«4 baños, 1 medio» is 4.5, as the card keeps it");
  assert.deepEqual(card.propertyDetails, { age: null, levels: null, parking: 2, kind: "DEPARTAMENTO", kindLabel: "Departamento", assetClass: "INMUEBLE" });
  assert.equal(card.address?.number, "1200");
  assert.match(card.notes ?? "", /Piso: 3/);
  assert.equal(card.address?.postalCode, "45238");
});

test("V8.1: without a date in the listing, the offer is dated the day it was consulted; the validity is six months", () => {
  const undated = cardOf("TERRENO_VENTA", bare(), "2026-11-24");
  assert.equal(undated.offerDate, "2026-11-24");
  assert.equal(undated.consultedOn, "2026-11-24");
  assert.equal(undated.validityMonths, 6);
  // A date the listing gives is kept.
  assert.equal(cardOf("TERRENO_VENTA", bare({ listingDate: "2026-10-30" })).offerDate, "2026-10-30");
});

test("front and depth written together or after a unit label are read as the listing means them", () => {
  assert.deepEqual(parseDimensions("Terreno de 12 x 30 m"), { frontage: 12, depth: 30 });
  assert.deepEqual(parseDimensions("12 por 30 metros"), { frontage: 12, depth: 30 });
  assert.deepEqual(parseDimensions("12×33"), { frontage: 12, depth: 33 });
  // A surface is not a lot of 12 by 30.
  assert.equal(parseDimensions("12 x 30 m2"), null);
  assert.equal(parseDimensions("12 m de frente"), null);
  // «M²» before the number is a label, not a 2.
  assert.equal(parseMeters("M² de frente: 12"), 12);
  assert.equal(parseMeters("M² de fondo: 30"), 30);
  assert.equal(parseMeters("300 m2"), null);
});

/** The text of a listing's page as the provider returns it, invented on the pattern of the video. */
const PAGE = [
  "Terreno en venta en Paseo de los Leones, Ciudad Bugambilias, Zapopan",
  "$3,910,000",
  "391 m² de terreno",
  "Terreno de 10 x 39.1 m",
  "El lote presenta una forma irregular.",
  "Código postal 45238",
  "Información del anunciante: Manuel Flores",
  "Ver teléfono",
  "Terrenos similares: Terreno en Valle Ejemplo $2,100,000",
].join("\n");

/** What the extraction model answers for that page: fragments, one of them not in the page. */
const READING: ListingExtraction = {
  ...EMPTY_EXTRACTION,
  operation: "venta", operationEvidence: "Terreno en venta", price: "$3,910,000", landArea: "391 m²", frontage: "Terreno de 10 x 39.1 m",
  depth: "Terreno de 10 x 39.1 m", street: "Paseo de los Leones", subdivision: "Ciudad Bugambilias", municipality: "Zapopan", postalCode: "Código postal 45238",
  shape: "forma irregular", contactName: "Manuel Flores", contactPhone: "Ver teléfono", publicationId: "ID 998877",
};

test("V8.2: the page the provider opened fills, verified as written, what the search model left empty; never the address (V8.11)", () => {
  const proposal = verifyListingExtraction(PAGE, "https://portal.example/propiedades/terreno-145998.html", READING);
  // Not in the page, or not a phone: dropped, never filled.
  assert.ok(proposal.discarded.includes("publicationId"));
  assert.ok(proposal.discarded.includes("contactPhone"));
  const [candidate] = normalizeWebListings("TERRENO_VENTA", { candidates: [bare({ price: 3_910_000, landArea: 391 })], marketNote: "" }, {
    resultUrls: [], knownUrls: [], pages: new Map([["portal.example/propiedades/terreno-145998.html", PAGE]]),
  }).candidates;
  assert.equal(candidate.pageRead, true);
  const read = withPageReading("TERRENO_VENTA", candidate, proposal);
  // A page lists other listings too: a card took another one's street and number (V8.11). The address is not filled from it.
  assert.equal(read.street, null);
  assert.equal(read.subdivision, null);
  assert.equal(read.postalCode, null);
  assert.equal(read.frontage, 10);
  assert.equal(read.depth, 39.1);
  assert.equal(read.shape, "forma irregular");
  assert.equal(read.contactName, "Manuel Flores");
  assert.equal(read.contactPhone, null);
  assert.equal(read.publicationId, null);
  assert.deepEqual(
    [...read.verifiedFields].sort(),
    ["contactName", "depth", "frontage", "landArea", "municipality", "price", "shape"],
  );
  assert.equal(read.unitValue, 10_000);
  // What the search model gave and the page says the same is still confirmed.
  const given = withPageReading("TERRENO_VENTA", { ...candidate, street: "Paseo de los Leones", postalCode: "45238" }, proposal);
  assert.equal(given.street, "Paseo de los Leones");
  assert.ok(given.verifiedFields.includes("street") && given.verifiedFields.includes("postalCode"));
});

test("where the page and the search model disagree, the search model's value stays and is not marked as verified", () => {
  const proposal = verifyListingExtraction(PAGE, null, { ...READING, price: "$2,100,000" });
  const [candidate] = normalizeWebListings("TERRENO_VENTA", { candidates: [bare({ price: 3_910_000, landArea: 391 })], marketNote: "" }, {
    resultUrls: [], knownUrls: [], pages: new Map([["portal.example/propiedades/terreno-145998.html", PAGE]]),
  }).candidates;
  const read = withPageReading("TERRENO_VENTA", candidate, proposal);
  // «Terrenos similares … $2,100,000» is another listing on the same page.
  assert.equal(read.price, 3_910_000);
  assert.ok(!read.verifiedFields.includes("price"));
});

test("«Pegar anuncio» reads «Terreno de 12 x 30 m» as front 12 and depth 30, and «4 baños, 1 medio» as 4 and a half", () => {
  const text = "Casa en venta. Terreno de 12 x 30 m. 4 baños, 1 medio. 2 estacionamientos. M² de frente: 12";
  const proposal = verifyListingExtraction(text, null, {
    ...EMPTY_EXTRACTION, frontage: "Terreno de 12 x 30 m", depth: "Terreno de 12 x 30 m", bathrooms: "4 baños", halfBaths: "1 medio", parking: "2 estacionamientos",
  });
  assert.equal(proposal.frontage?.value, 12);
  assert.equal(proposal.depth?.value, 30);
  assert.equal(proposal.bathrooms?.value, 4);
  assert.equal(proposal.halfBaths?.value, 1);
  assert.equal(proposal.parking?.value, 2);
  assert.equal(verifyListingExtraction(text, null, { ...EMPTY_EXTRACTION, frontage: "M² de frente: 12" }).frontage?.value, 12);
});
