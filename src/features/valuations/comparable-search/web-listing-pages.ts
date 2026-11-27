/**
 * «Buscar con IA», second reading: the pages of the listings the provider
 * opened during its search (its web_fetch; the server downloads nothing)
 * are read again as «Pegar anuncio» reads a pasted listing: the extraction
 * model copies fragments and the server keeps only those literally in the
 * page (`verifyListingExtraction`). What the page confirms fills the fields
 * the search model left empty, except the street, number, colonia,
 * fraccionamiento and C.P. (V8.11); a value both give and that agrees is marked
 * as verified. Where they disagree the search model's stays and is not marked:
 * a page often lists other, similar listings, and the appraiser checks it.
 */
import { withoutNeighborhoodPrefix } from "../calculation/comparable-card";
import type { ComparableType } from "../calculation/market-types";
import type { ListingProposal } from "@/features/ai/listing-extraction";
import { bathroomsOf, cleanText, phoneOf, positiveAmount, postalCodeOf, unitValueOf, type WebListingCandidate, type WebListingVerifiable } from "./web-listings";

/** What is read of a page: a listing's data is at its top, and the extraction model reads no more than this. */
export const PAGE_TEXT_MAX = 24_000;

type Value = string | number | null;

/** The value of each field as the page confirms it, or null where it says nothing usable. */
export function pageValues(proposal: ListingProposal): Partial<Record<keyof WebListingVerifiable, Value>> {
  const textOf = (item: { value: string } | null, max: number) => (item ? cleanText(item.value, max) : null);
  const surface = (item: ListingProposal["landArea"]) => positiveAmount(item?.squareMeters ?? null);
  // A price per m² or per hectare, or one in dollars, is not the price of the offer in pesos.
  const price = proposal.price && !proposal.price.per && proposal.price.currency !== "USD" ? positiveAmount(proposal.price.amount) : null;
  const neighborhood = proposal.neighborhood ? withoutNeighborhoodPrefix(proposal.neighborhood.value) : null;
  const halves = proposal.halfBaths?.value ?? null;
  return {
    price,
    landArea: surface(proposal.landArea),
    builtArea: surface(proposal.builtArea),
    propertyType: textOf(proposal.propertyType, 80),
    neighborhood: neighborhood ? cleanText(neighborhood, 120) : null,
    municipality: textOf(proposal.municipality, 120),
    state: textOf(proposal.state, 80),
    listingDate: proposal.listingDate?.value ?? null,
    street: textOf(proposal.street, 180),
    streetNumber: textOf(proposal.streetNumber, 40),
    subdivision: textOf(proposal.subdivision, 180),
    postalCode: proposal.postalCode ? postalCodeOf(proposal.postalCode.value) : null,
    bedrooms: proposal.bedrooms?.value ?? null,
    bathrooms: bathroomsOf(proposal.bathrooms?.value ?? null, halves),
    parking: proposal.parking?.value ?? null,
    levels: proposal.levels?.value ?? null,
    age: proposal.age?.value ?? null,
    frontage: positiveAmount(proposal.frontage?.value ?? null),
    depth: positiveAmount(proposal.depth?.value ?? null),
    frontCount: proposal.frontCount && proposal.frontCount.value >= 1 && proposal.frontCount.value <= 20 ? proposal.frontCount.value : null,
    landUse: textOf(proposal.landUse, 180),
    topography: textOf(proposal.topography, 80),
    services: textOf(proposal.services, 180),
    shape: textOf(proposal.shape, 80),
    conservation: textOf(proposal.conservation, 80),
    amenities: proposal.amenities.length ? cleanText(proposal.amenities.map((item) => item.value).join(", "), 300) : null,
    contactName: textOf(proposal.contactName, 180),
    contactPhone: proposal.contactPhone ? phoneOf(proposal.contactPhone.value) : null,
    publicationId: textOf(proposal.publicationId, 120),
  };
}

/** The parts of the address that only the search model's own reading of the listing fills. */
const PAGE_NEVER_FILLS = new Set<keyof WebListingVerifiable>(["street", "streetNumber", "subdivision", "postalCode", "neighborhood"]);

const same = (left: Value, right: Value) =>
  typeof left === "string" && typeof right === "string"
    ? left.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() === right.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    : left === right;

/**
 * The candidate with what its page confirms: empty fields filled from the
 * page, and every field the page agrees with listed in `verifiedFields`.
 */
export function withPageReading(type: ComparableType, candidate: WebListingCandidate, proposal: ListingProposal): WebListingCandidate {
  const values = pageValues(proposal);
  const next: WebListingCandidate = { ...candidate };
  const record = next as unknown as Record<string, Value>;
  const verified: Array<keyof WebListingVerifiable> = [];
  for (const [field, value] of Object.entries(values) as Array<[keyof WebListingVerifiable, Value]>) {
    if (value === null || value === undefined) continue;
    const current = record[field] ?? null;
    // The address of the listing is never filled from its page: a page lists other, similar listings
    // and a card took another one's street and number (V8.11, «Callejón del Iris»). It is only confirmed.
    if (current === null && PAGE_NEVER_FILLS.has(field)) continue;
    if (current === null) {
      record[field] = value;
      verified.push(field);
    } else if (same(current, value)) {
      verified.push(field);
    }
  }
  // A price the page gave fills one the search left empty: it is in pesos.
  if (verified.includes("price") && candidate.price === null) next.currency = "MXN";
  next.unitValue = unitValueOf(type, next);
  next.verifiedFields = verified;
  return next;
}
