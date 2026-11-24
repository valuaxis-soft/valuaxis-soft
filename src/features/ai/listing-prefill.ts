/**
 * A verified listing proposal laid out for the comparable form: one row per
 * field of the card the listing can fill, with the value as the form takes it
 * and the fragment of the listing it came from. What the card has no field
 * for (amenities, other facts, rooms of a land) goes to «Observaciones», as
 * written. Runs in the browser.
 */
import { isBuiltComparableType, isRentComparableType, type ComparableType } from "@/features/valuations/calculation/market-types";
import type { ListingProposal } from "./listing-extraction";
import { plainText } from "./text-figures";

/** The fields of the comparable card a listing can fill, as the form's inputs hold them. */
export const LISTING_FORM_FIELDS = [
  // Ubicación, by parts.
  "state", "municipality", "postalCode", "neighborhood", "subdivision", "street", "number",
  // Oferta y construcción.
  "price", "area", "landArea", "constructionType", "bedrooms", "bathrooms", "parking", "levels", "age", "conservation",
  // Terreno y características.
  "frontCount", "frontage", "depth", "shape", "zone", "landUse", "topography", "services", "notes",
  // Fuente.
  "sourceName", "contactName", "contactPhone", "url", "offerDate", "publicationId",
] as const;
export type ListingFormField = (typeof LISTING_FORM_FIELDS)[number];
export type ComparablePrefill = Partial<Record<ListingFormField, string>>;

/** The longest «Observaciones» the card keeps. */
const NOTES_MAX = 1000;

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
type Item = { value: string; evidence: string } | null;
type Figure = { value: number; evidence: string } | null;

/** The rows of the card, and what the listing says that the appraiser must know. */
export function listingRows(proposal: ListingProposal, type: ComparableType, priceLabel: string): { rows: ListingRow[]; notices: string[] } {
  const notices: string[] = [];
  const built = isBuiltComparableType(type);
  const text = (field: ListingFormField, label: string, item: Item): ListingRow =>
    ({ field, label, value: item?.value ?? "", evidence: item?.evidence ?? null });
  const figure = (field: ListingFormField, label: string, item: Figure): ListingRow =>
    ({ field, label, value: item ? String(item.value) : "", evidence: item?.evidence ?? null });

  // A messy listing names the same place for two parts: the first one keeps it.
  const places = new Set<string>();
  const place = (item: Item): Item => {
    if (!item) return null;
    const key = plainText(item.value);
    if (places.has(key)) return null;
    places.add(key);
    return item;
  };
  const address = [
    text("state", "Estado", place(proposal.state)),
    text("municipality", "Municipio o alcaldía", place(proposal.municipality)),
    text("postalCode", "Código postal", proposal.postalCode),
    text("neighborhood", "Colonia", place(proposal.neighborhood)),
    text("subdivision", "Fraccionamiento", place(proposal.subdivision)),
    text("street", "Vialidad", place(proposal.street)),
    text("number", "Número", proposal.streetNumber),
  ];

  const surface = built ? proposal.builtArea : proposal.landArea;
  const hectares = (item: ListingProposal["landArea"]) =>
    // Never a silent conversion: the form is in m², and the listing said hectares.
    (item?.unit === "ha" ? `El anuncio dice ${number(item.value)} ha; se convirtió a m² (1 ha = 10,000 m²). Revísalo.` : undefined);
  const area: ListingRow = {
    field: "area", label: built ? (isRentComparableType(type) ? "Superficie rentable (m²)" : "Superficie construida (m²)") : "Superficie de terreno (m²)",
    value: surface ? String(surface.squareMeters) : "",
    evidence: surface?.evidence ?? null,
    note: hectares(surface),
  };

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
    const rent = isRentComparableType(type);
    if ((proposal.operation.value === "renta") !== rent) {
      notices.push(`El anuncio es de ${proposal.operation.value} («${proposal.operation.evidence}») y estás capturando comparables en ${rent ? "renta" : "venta"}.`);
    }
  }

  // Whole bathrooms and half ones are captured as one number: 2 and a half is 2.5.
  const full = proposal.bathrooms;
  const halves = proposal.halfBaths;
  const bathrooms: ListingRow = full && !Number.isInteger(full.value)
    ? figure("bathrooms", "Baños", full)
    : full || halves
      ? {
        field: "bathrooms", label: "Baños",
        value: String((full?.value ?? 0) + (halves?.value ?? 0) / 2),
        evidence: [full?.evidence, halves?.evidence].filter(Boolean).join(" · "),
        note: halves?.value
          ? `${full ? `${number(full.value)} baño${full.value === 1 ? "" : "s"} y ` : ""}${number(halves.value)} medio${halves.value === 1 ? "" : "s"} baño${halves.value === 1 ? "" : "s"}: cada medio baño se captura como 0.5.`
          : undefined,
      }
      : figure("bathrooms", "Baños", null);

  // The construction of a land has no field in its card: what the listing says of it goes to «Observaciones», as written.
  const asNotes: string[] = [];
  const building: ListingRow[] = [];
  if (built) {
    const land = proposal.landArea;
    building.push(
      { field: "landArea", label: "Superficie de terreno (m²)", value: land ? String(land.squareMeters) : "", evidence: land?.evidence ?? null, note: hectares(land) },
      text("constructionType", "Tipo de construcción", proposal.propertyType),
      figure("bedrooms", "Recámaras", proposal.bedrooms),
      bathrooms,
      figure("parking", "Estacionamientos", proposal.parking),
      figure("levels", "Niveles", proposal.levels),
      figure("age", "Edad (años)", proposal.age),
      text("conservation", "Conservación", proposal.conservation),
    );
  } else {
    if (proposal.propertyType) notices.push(`Tipo de inmueble según el anuncio: «${proposal.propertyType.evidence}».`);
    asNotes.push(...landRooms(proposal, true));
    if (proposal.builtArea) notices.push(`El anuncio también indica superficie construida («${proposal.builtArea.evidence}»): un terreno no tiene campo para ella y va en Observaciones.`);
  }

  if (proposal.amenities.length) asNotes.push(`Amenidades: ${proposal.amenities.map((item) => item.value).join(", ")}`);
  asNotes.push(...proposal.otherFacts.map((item) => item.value));
  const notesValue = asNotes.map((item) => item.replace(/[.;\s]+$/, "")).join(". ");
  const notesEvidence = [...(built ? [] : landRooms(proposal)), ...proposal.amenities, ...proposal.otherFacts]
    .map((item) => (typeof item === "string" ? item : item.evidence));
  const notes: ListingRow = {
    field: "notes", label: "Observaciones",
    value: notesValue ? `${notesValue}.`.slice(0, NOTES_MAX) : "",
    evidence: notesEvidence.length ? notesEvidence.join(" · ") : null,
    note: notesValue ? "Lo que el anuncio dice y la ficha no tiene campo para ello, tal como está escrito. El dictamen imprime las observaciones: edítalas a tu gusto." : undefined,
  };

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
      ...address,
      price, area,
      ...building,
      figure("frontCount", "Número de frentes", proposal.frontCount),
      figure("frontage", "Frente (m)", proposal.frontage),
      figure("depth", "Fondo (m)", proposal.depth),
      text("shape", "Forma", proposal.shape),
      text("zone", "Zona", proposal.zone),
      text("landUse", "Uso de suelo (descripción)", proposal.landUse),
      text("topography", "Topografía", proposal.topography),
      text("services", "Servicios", proposal.services),
      notes,
      text("sourceName", "Fuente", source),
      text("contactName", "Contacto", proposal.contactName),
      text("contactPhone", "Teléfono", proposal.contactPhone),
      text("url", "Liga del anuncio", proposal.url),
      text("offerDate", "Fecha de la oferta", proposal.listingDate),
      text("publicationId", "ID de publicación", proposal.publicationId),
    ],
    notices,
  };
}

/** The fragments of the construction of a land, which travel in its «Observaciones». */
function landRooms(proposal: ListingProposal, labeled = false) {
  // «90 m2» alone does not say what it measures: in the notes it says it is the construction.
  const built = proposal.builtArea && labeled && !/constru/i.test(proposal.builtArea.evidence)
    ? { evidence: `Construcción: ${proposal.builtArea.evidence}` } : proposal.builtArea;
  return [built, proposal.bedrooms, proposal.bathrooms, proposal.halfBaths, proposal.parking, proposal.levels, proposal.age, proposal.conservation]
    .flatMap((item) => (item ? [item.evidence] : []));
}
