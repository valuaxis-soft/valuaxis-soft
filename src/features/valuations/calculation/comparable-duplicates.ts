/**
 * Whether a comparable being captured is one the firm already has: its
 * number, the same portal and publication id, the same listing URL, the same
 * address, the same phone with the same price or the same area (±1 %), or
 * the same place (colonia, fraccionamiento, municipio) with the same area.
 *
 * Texts are compared normalized: lower case, without accents, spaces, dashes
 * or slashes, and with their words in any order, so "Fracc. Valle de los
 * Robles" and "Robles del Valle" are one place.
 * Pure; the service reads the candidates of the firm's base and asks here.
 */
import { searchText } from "../comparable-search/normalize";
import { hasAddress, type ComparableAddress } from "./comparable-card";

export type DuplicateProbe = {
  url: string | null;
  location: string;
  address?: ComparableAddress | null;
  contactPhone: string | null;
  price: number | null;
  /** Its area (land, built or rentable, as its type says); a client of before leaves it out. */
  area?: number | null;
  /** The listing's id in its portal (`sourceName`), from the master workbook. */
  publicationId?: string | null;
  sourceName?: string | null;
  /** Its number in the firm's base ("REF / ID" of the master workbook): the same number is the same comparable. */
  folio?: number | null;
};

export const DUPLICATE_REASONS = ["FOLIO", "PUBLICATION", "URL", "ADDRESS", "PHONE_PRICE", "PHONE_AREA", "SIMILAR", "PLACE_AREA"] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];
/** Reasons that identify the listing itself: the import proposes "es el mismo" for them. */
export const EXACT_DUPLICATE_REASONS: ReadonlySet<DuplicateReason> = new Set(["FOLIO", "PUBLICATION", "URL"]);
export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  FOLIO: "mismo número de comparable",
  PUBLICATION: "mismo portal e ID de publicación",
  URL: "misma liga del anuncio",
  ADDRESS: "misma dirección",
  PHONE_PRICE: "mismo teléfono y precio",
  PHONE_AREA: "mismo teléfono y superficie",
  SIMILAR: "misma colonia, superficie y precio",
  PLACE_AREA: "misma ubicación y superficie",
};

/**
 * A listing URL as one comparable: without query or fragment, the host in
 * lower case without "www.", no trailing slash. The path keeps its case.
 * Null for a text that is not an http(s) URL.
 */
export function canonicalUrl(url: string | null | undefined) {
  const text = url?.trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.host.toLowerCase().replace(/^www\./, "");
    return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** The canonical URL compared without case (portals do not tell listings apart by case). */
export const canonicalUrlKey = (url: string | null | undefined) => canonicalUrl(url)?.toLowerCase() ?? null;

/** "Inmuebles24.com", "www.inmuebles24.com" and "Inmuebles24" are one portal. */
export const portalKey = (name: string | null | undefined) =>
  searchText(name ?? "").replace(/^www /, "").replace(/ (com|mx|net)\b/g, "").replace(/ /g, "");

/** Two prices within 1 % of each other are the same offer. */
export const PRICE_TOLERANCE = 0.01;

/** Words that say what a part of an address is, not where it is. */
const NOISE = new Set([
  "calle", "c", "no", "num", "numero", "n", "col", "colonia", "fracc", "fraccionamiento", "frac", "cp", "codigo", "postal", "p",
  "de", "del", "la", "el", "los", "las", "y", "s", "sn", "ext", "exterior", "int", "interior", "residencial", "res", "coto",
]);
const SYNONYMS: Record<string, string> = {
  av: "avenida", ave: "avenida", avda: "avenida", blvd: "boulevard", blv: "boulevard", bulevar: "boulevard",
  priv: "privada", carr: "carretera", prol: "prolongacion", esq: "esquina", fco: "francisco", gral: "general",
};

/** Mexican states: every comparable of a town shares one, so it says nothing of the place. */
const STATES = new Set([
  "aguascalientes", "baja", "california", "sur", "campeche", "chiapas", "chihuahua", "coahuila", "colima", "durango", "guanajuato",
  "guerrero", "jalisco", "mexico", "michoacan", "nayarit", "nuevo", "oaxaca", "puebla", "queretaro", "quintana", "roo", "potosi",
  "sinaloa", "sonora", "tabasco", "tamaulipas", "tlaxcala", "veracruz", "yucatan", "zacatecas", "cdmx", "jal", "gto", "mich",
]);

/** "Av. Juárez #12-A, Col. Centro" → "avenida juarez 12 a centro". */
export function normalizeAddressText(text: string) {
  return searchText(text).split(" ").filter((word) => word && !NOISE.has(word)).map((word) => SYNONYMS[word] ?? word).join(" ");
}

/** A street with its number: two words or more, one of them with a digit. */
const isStreetWithNumber = (street: string) => /\d/.test(street) && street.split(" ").length >= 2;

/** The words of a text in order, so "12 juarez" and "juarez 12" are one street. */
const sortedWords = (text: string) => text.split(" ").filter(Boolean).sort().join(" ");

/**
 * The street with its number, and the rest (colonia, municipio, C.P.). A
 * single location text is read as "street number, the rest", the way it is
 * usually written. Null without a number in the street: a street alone, or a
 * town, is not one property.
 */
export function addressKey(probe: Pick<DuplicateProbe, "location" | "address">) {
  const { street, locality } = addressParts(probe);
  if (!isStreetWithNumber(street)) return null;
  return { street, locality };
}

/**
 * The street with its number, and the words of where it is (colonia,
 * fraccionamiento, municipio, C.P.; never the state). A first part without a
 * number is a place too: "Fracc. Valle Real, Tepatitlán".
 */
function addressParts(probe: Pick<DuplicateProbe, "location" | "address">) {
  let street: string;
  let rest: string[];
  if (hasAddress(probe.address)) {
    const address = probe.address ?? {};
    street = normalizeAddressText(`${address.street ?? ""} ${address.number ?? ""}`);
    rest = [address.neighborhood, address.subdivision, address.municipality, address.postalCode].map((item) => normalizeAddressText(item ?? ""));
  } else {
    const [first = "", ...others] = probe.location.split(",");
    street = normalizeAddressText(first);
    rest = others.map(normalizeAddressText);
  }
  if (!isStreetWithNumber(street)) rest.unshift(street);
  const words = rest.flatMap((item) => item.split(" ")).filter((word) => (word.length > 2 || /\d/.test(word)) && !STATES.has(word));
  return { street, locality: new Set(words) };
}

const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((word) => b.has(word));

/** The words of a place together, without spaces: "valle real" and "vallereal" are one name. */
const joined = (words: ReadonlySet<string>) => [...words].join("");

/**
 * The same place: two words in common that are most of the shorter one's
 * (the colonia or fraccionamiento besides the municipio), or the same words
 * once written together. A municipio alone is not a place: every comparable
 * of a town would be the same.
 */
export function samePlace(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (!a.size || !b.size) return false;
  if ((a.size >= 2 || b.size >= 2) && joined(a) === joined(b)) return true;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared >= 2 && shared >= 0.6 * Math.min(a.size, b.size);
}

/** The words of where a comparable is (colonia, fraccionamiento, municipio, C.P.). */
export const localityWords = (probe: Pick<DuplicateProbe, "location" | "address">) => addressParts(probe).locality;

/** The last ten digits of a phone, the Mexican number without country code; null with fewer than seven. */
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export function samePrice(a: number | null, b: number | null, tolerance = PRICE_TOLERANCE) {
  if (!a || !b || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= tolerance * Math.max(a, b) + 1e-9;
}

/** What the check reads of a comparable captured or stored. */
export function duplicateProbeOf(comparable: {
  url: string | null; location: string; address?: ComparableAddress | null; contactPhone: string | null; price: number | null;
  area: number | null; sourceName: string | null; listingDetails?: { publicationId?: string | null } | null;
}): DuplicateProbe {
  return {
    url: comparable.url,
    location: comparable.location,
    address: comparable.address ?? null,
    contactPhone: comparable.contactPhone,
    price: comparable.price,
    area: comparable.area,
    sourceName: comparable.sourceName,
    publicationId: comparable.listingDetails?.publicationId ?? null,
  };
}

/** Why `candidate` is the same property as `probe`; empty when it is not. */
export function duplicateReasons(probe: DuplicateProbe, candidate: DuplicateProbe): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  if (probe.folio && probe.folio === candidate.folio) reasons.push("FOLIO");
  const publication = probe.publicationId?.trim().toLowerCase();
  if (publication && publication === candidate.publicationId?.trim().toLowerCase()
    && portalKey(probe.sourceName) === portalKey(candidate.sourceName)) reasons.push("PUBLICATION");
  const url = canonicalUrlKey(probe.url);
  if (url && url === canonicalUrlKey(candidate.url)) reasons.push("URL");
  const mine = addressKey(probe);
  const theirs = addressKey(candidate);
  // The same street and number, in the same colonia or municipio when both say which.
  if (mine && theirs && sortedWords(mine.street) === sortedWords(theirs.street)
    && (!mine.locality.size || !theirs.locality.size || overlaps(mine.locality, theirs.locality))) {
    reasons.push("ADDRESS");
  }
  const phone = phoneKey(probe.contactPhone);
  const samePhone = Boolean(phone && phone === phoneKey(candidate.contactPhone));
  const sameArea = samePrice(probe.area ?? null, candidate.area ?? null);
  const sameOffer = samePrice(probe.price, candidate.price);
  if (samePhone && sameOffer) reasons.push("PHONE_PRICE");
  // The same advertiser with the same area: the same property, maybe at another price.
  if (samePhone && sameArea) reasons.push("PHONE_AREA");
  // Everything the same but a detail (no number, another phone, another price): the same place and area.
  if (!reasons.length && sameArea && samePlace(localityWords(probe), localityWords(candidate))) {
    reasons.push(sameOffer ? "SIMILAR" : "PLACE_AREA");
  }
  return reasons;
}
