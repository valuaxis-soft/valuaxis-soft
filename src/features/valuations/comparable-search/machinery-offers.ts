/**
 * A listing found with «Buscar con IA» in the machinery panel, as an offer of
 * its market approach (MEH book: «Resumen de comparables» and «Información de
 * contacto»). Only what the listing gave; the brand, model, year and hours the
 * search copies to its notes stay there for the appraiser to place. Pure.
 */
import { emptyOffer, type MachineryOfferDto } from "../calculation/machinery-types";
import { formatComparableId } from "../calculation/comparable-card";
import type { WebListingCandidate } from "./web-listings";

export function offerFromListing(
  candidate: Pick<WebListingCandidate, "title" | "price" | "currency" | "listingDate" | "contactName" | "agency" | "portal" | "contactPhone" | "url" | "neighborhood" | "municipality" | "state" | "reference" | "notes">,
  folio: number | null,
  index: number,
): MachineryOfferDto {
  const place = [candidate.reference, candidate.neighborhood, candidate.municipality, candidate.state].filter(Boolean).join(", ");
  const card = formatComparableId(folio);
  // A price in dollars is not a price in pesos: it stays in the notes, as published, for the appraiser to convert.
  const dollars = candidate.currency === "USD" && candidate.price !== null;
  const notes = [
    candidate.notes,
    dollars ? `Precio publicado: USD ${candidate.price?.toLocaleString("es-MX")}` : null,
    `Búsqueda con IA, sin verificar${card ? `; ficha ${card} de la base del despacho` : ""}`,
  ].filter(Boolean).join(". ");
  return {
    ...emptyOffer(index),
    description: candidate.title,
    date: candidate.listingDate ? candidate.listingDate.split("-").reverse().join("/") : "",
    price: dollars ? null : candidate.price,
    contact: candidate.contactName ?? "",
    company: candidate.agency ?? candidate.portal,
    phone: candidate.contactPhone ?? "",
    link: candidate.url,
    location: place,
    notes: notes.slice(0, 500),
  };
}
