/**
 * A verified listing proposal laid out for the comparable form: one row per
 * field the form has, with the value as the form takes it and the fragment
 * of the listing it came from. Runs in the browser.
 */
import { isBuiltComparableType, type ComparableType } from "@/features/valuations/calculation/market-types";
import type { ListingProposal } from "./listing-extraction";
import { plainText } from "./text-figures";

/** The fields of the comparable form a listing can fill, as the form's inputs hold them. */
export const LISTING_FORM_FIELDS = [
  "location", "area", "price", "sourceName", "contactName", "contactPhone", "url", "offerDate", "frontage", "depth", "landUse", "topography", "services",
] as const;
export type ListingFormField = (typeof LISTING_FORM_FIELDS)[number];
export type ComparablePrefill = Partial<Record<ListingFormField, string>>;

export type ListingRow = {
  field: ListingFormField;
  label: string;
  /** Empty when the listing does not say it: the field stays empty. */
  value: string;
  /** The fragment of the listing, or null without one. */
  evidence: string | null;
  /** Something the appraiser must know about how the value was read. */
  note?: string;
};

const number = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 6 });

/** The rows of the form, and what the listing says that the form has no field for. */
export function listingRows(proposal: ListingProposal, type: ComparableType, priceLabel: string): { rows: ListingRow[]; notices: string[] } {
  const notices: string[] = [];
  const built = isBuiltComparableType(type);
  const text = (field: ListingFormField, label: string, item: { value: string; evidence: string } | null): ListingRow =>
    ({ field, label, value: item?.value ?? "", evidence: item?.evidence ?? null });
  const figure = (field: ListingFormField, label: string, item: { value: number; evidence: string } | null): ListingRow =>
    ({ field, label, value: item ? String(item.value) : "", evidence: item?.evidence ?? null });

  // A messy listing names the same place for two parts: once is enough.
  const parts = [proposal.street, proposal.neighborhood, proposal.municipality, proposal.state]
    .filter((part) => part !== null)
    .filter((part, index, all) => all.findIndex((other) => plainText(other.value) === plainText(part.value)) === index);
  const location: ListingRow = {
    field: "location", label: "Ubicación",
    value: parts.map((part) => part.value).join(", "),
    evidence: parts.length ? parts.map((part) => part.evidence).join(" · ") : null,
  };

  const surface = built ? proposal.builtArea : proposal.landArea;
  const area: ListingRow = {
    field: "area", label: built ? "Superficie construida (m²)" : "Superficie de terreno (m²)",
    value: surface ? String(surface.squareMeters) : "",
    evidence: surface?.evidence ?? null,
    // Never a silent conversion: the form is in m², and the listing said hectares.
    note: surface?.unit === "ha" ? `El anuncio dice ${number(surface.value)} ha; se convirtió a m² (1 ha = 10,000 m²). Revísalo.` : undefined,
  };
  const other = built ? proposal.landArea : proposal.builtArea;
  if (other) {
    notices.push(`El anuncio también indica ${built ? "superficie de terreno" : "superficie construida"} («${other.evidence}»); este comparable no tiene campo para ella.`);
  }

  const dollars = proposal.price?.currency === "USD";
  const perUnit = proposal.price?.per ?? null;
  const price: ListingRow = {
    field: "price", label: priceLabel,
    value: proposal.price && !dollars && !perUnit ? String(proposal.price.amount) : "",
    evidence: proposal.price?.evidence ?? null,
    note: perUnit
      ? `El anuncio da el importe por ${perUnit === "ha" ? "hectárea" : "m²"}, no el de la oferta completa: no se calculó. Captura el importe de la oferta.`
      : dollars
        ? "El anuncio da el importe en dólares y el formulario es en pesos: no se convirtió. Captura el equivalente que tú determines."
        : proposal.price && proposal.price.currency === null ? "El anuncio no indica la moneda." : undefined,
  };

  if (proposal.operation) {
    const rent = type === "INMUEBLE_RENTA";
    if ((proposal.operation.value === "renta") !== rent) {
      notices.push(`El anuncio es de ${proposal.operation.value} («${proposal.operation.evidence}») y estás capturando comparables en ${rent ? "renta" : "venta"}.`);
    }
  }
  if (proposal.propertyType) notices.push(`Tipo de inmueble según el anuncio: «${proposal.propertyType.evidence}».`);

  // Without a portal named in the text, the site of the link is the source.
  let source = proposal.portal;
  if (!source && proposal.url) {
    try {
      const host = new URL(proposal.url.value).hostname.replace(/^www\./, "");
      source = { value: host, evidence: proposal.url.value };
    } catch {
      // Not a link the browser can read: no source from it.
    }
  }

  return {
    rows: [
      location, area, price,
      figure("frontage", "Frente (m)", proposal.frontage),
      figure("depth", "Fondo (m)", proposal.depth),
      text("landUse", "Uso de suelo (descripción)", proposal.landUse),
      text("topography", "Topografía", proposal.topography),
      text("services", "Servicios", proposal.services),
      text("sourceName", "Fuente", source),
      text("contactName", "Contacto", proposal.contactName),
      text("contactPhone", "Teléfono", proposal.contactPhone),
      text("url", "Liga del anuncio", proposal.url),
      text("offerDate", "Fecha de la oferta", proposal.listingDate),
    ],
    notices,
  };
}
