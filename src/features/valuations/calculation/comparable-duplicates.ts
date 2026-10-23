/**
 * Whether a comparable being captured is one the firm already has: the same
 * listing URL, the same address, or the same phone with the same price (±1 %).
 * Pure; the service reads the candidates of the firm's base and asks here.
 */
import { searchText, urlKey } from "../comparable-search/normalize";
import { hasAddress, type ComparableAddress } from "./comparable-card";

export type DuplicateProbe = {
  url: string | null;
  location: string;
  address?: ComparableAddress | null;
  contactPhone: string | null;
  price: number | null;
  /** Its area (land, built or rentable, as its type says); a client of before leaves it out. */
  area?: number | null;
};

export const DUPLICATE_REASONS = ["URL", "ADDRESS", "PHONE_PRICE", "SIMILAR"] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];
export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  URL: "misma liga del anuncio",
  ADDRESS: "misma dirección",
  PHONE_PRICE: "mismo teléfono y precio",
  SIMILAR: "misma colonia, superficie y precio",
};

/** Two prices within 1 % of each other are the same offer. */
export const PRICE_TOLERANCE = 0.01;

/** Words that say what a part of an address is, not where it is. */
const NOISE = new Set([
  "calle", "c", "no", "num", "numero", "n", "col", "colonia", "fracc", "fraccionamiento", "cp", "codigo", "postal", "p",
  "de", "del", "la", "el", "los", "las", "y", "s", "sn", "ext", "exterior", "int", "interior",
]);
const SYNONYMS: Record<string, string> = {
  av: "avenida", ave: "avenida", avda: "avenida", blvd: "boulevard", blv: "boulevard", bulevar: "boulevard",
  priv: "privada", carr: "carretera", prol: "prolongacion", esq: "esquina", fco: "francisco", gral: "general",
};

/** "Av. Juárez #12-A, Col. Centro" → "avenida juarez 12 a centro". */
export function normalizeAddressText(text: string) {
  return searchText(text).split(" ").filter((word) => word && !NOISE.has(word)).map((word) => SYNONYMS[word] ?? word).join(" ");
}

/**
 * The street with its number, and the rest (colonia, municipio, C.P.). A
 * single location text is read as "street number, the rest", the way it is
 * usually written. Null without a number in the street: a street alone, or a
 * town, is not one property.
 */
export function addressKey(probe: Pick<DuplicateProbe, "location" | "address">) {
  const { street, locality } = addressParts(probe);
  if (!/\d/.test(street) || street.split(" ").length < 2) return null;
  return { street, locality };
}

/** The street with its number, and the words of where it is (colonia, municipio, C.P.). */
function addressParts(probe: Pick<DuplicateProbe, "location" | "address">) {
  let street: string;
  let rest: string[];
  if (hasAddress(probe.address)) {
    const address = probe.address ?? {};
    street = normalizeAddressText(`${address.street ?? ""} ${address.number ?? ""}`);
    rest = [address.neighborhood, address.municipality, address.postalCode].map((item) => normalizeAddressText(item ?? ""));
  } else {
    const [first = "", ...others] = probe.location.split(",");
    street = normalizeAddressText(first);
    rest = others.map(normalizeAddressText);
  }
  return { street, locality: new Set(rest.flatMap((item) => item.split(" ")).filter((word) => word.length > 2 || /\d/.test(word))) };
}

const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((word) => b.has(word));

/** The last ten digits of a phone, the Mexican number without country code; null with fewer than seven. */
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export function samePrice(a: number | null, b: number | null, tolerance = PRICE_TOLERANCE) {
  if (!a || !b || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= tolerance * Math.max(a, b) + 1e-9;
}

/** Why `candidate` is the same property as `probe`; empty when it is not. */
export function duplicateReasons(probe: DuplicateProbe, candidate: DuplicateProbe): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  const url = urlKey(probe.url);
  if (url && url === urlKey(candidate.url)) reasons.push("URL");
  const mine = addressKey(probe);
  const theirs = addressKey(candidate);
  // The same street and number, in the same colonia or municipio when both say which.
  if (mine && theirs && mine.street === theirs.street
    && (!mine.locality.size || !theirs.locality.size || overlaps(mine.locality, theirs.locality))) {
    reasons.push("ADDRESS");
  }
  const phone = phoneKey(probe.contactPhone);
  if (phone && phone === phoneKey(candidate.contactPhone) && samePrice(probe.price, candidate.price)) reasons.push("PHONE_PRICE");
  // Almost everything the same but a detail (no number, another phone): the same colonia, area and price.
  if (!reasons.length && samePrice(probe.area ?? null, candidate.area ?? null) && samePrice(probe.price, candidate.price)) {
    const here = addressParts(probe).locality;
    const there = addressParts(candidate).locality;
    if (here.size && there.size && overlaps(here, there)) reasons.push("SIMILAR");
  }
  return reasons;
}

