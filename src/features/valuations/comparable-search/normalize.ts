/**
 * Pure parts of the comparable search: text matching without accents, the
 * identity of a comparable across sources and versions, relevance and the
 * note that says where an added comparable came from.
 */
import type { ComparableSearchHit, ComparableSearchQuery, FoundComparable } from "./types";

/** Letters or digits a search needs, at least. */
export const SEARCH_TEXT_MIN = 3;
const MAX_TOKENS = 8;
const NOTES_MAX = 1000;
/** Starts the line of the notes that says where a comparable was found. */
const PROVENANCE_PREFIX = "Encontrado en ";

/** "Av. Juárez #12, Arandas" → "av juarez 12 arandas". */
export function searchText(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The words every result must contain, without repeats. */
export function searchTokens(value: string) {
  return [...new Set(searchText(value).split(" ").filter(Boolean))].slice(0, MAX_TOKENS);
}

/** Text a query is matched against, besides the location. */
function secondaryText(comparable: FoundComparable) {
  return searchText([
    comparable.landUse, comparable.landUseKey, comparable.zone, comparable.services, comparable.notes,
    comparable.sourceName, comparable.contactName,
  ].filter(Boolean).join(" "));
}

/** Higher is closer to what was asked: the location weighs more than the rest, the whole phrase more than loose words. */
export function relevance(text: string, comparable: FoundComparable) {
  const location = searchText(comparable.location);
  const rest = secondaryText(comparable);
  const phrase = searchText(text);
  let score = phrase && location.includes(phrase) ? 3 : 0;
  for (const token of searchTokens(text)) {
    if (location.includes(token)) score += 2;
    else if (rest.includes(token)) score += 1;
  }
  return score;
}

type Identity = Pick<FoundComparable, "location" | "area" | "price" | "url">;

const urlKey = (url: string | null) =>
  url ? url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/#.*$/, "").replace(/\/+$/, "") : null;
const amount = (value: number | null) => (value === null ? "" : String(Math.round(value * 100) / 100));

/**
 * What makes two results the same offer: the same listing URL, or the same
 * location, area and price. A comparable copied to another version or added
 * from a search keeps these, whatever else was edited.
 */
export function identityKeys(comparable: Identity) {
  const url = urlKey(comparable.url);
  return [
    `c:${searchText(comparable.location)}|${amount(comparable.area)}|${amount(comparable.price)}`,
    ...(url ? [`u:${url}`] : []),
  ];
}

export function withinRanges(query: Pick<ComparableSearchQuery, "areaMin" | "areaMax" | "priceMin" | "priceMax">, comparable: Pick<FoundComparable, "area" | "price">) {
  const inside = (value: number | null, min: number | null, max: number | null) =>
    (min === null && max === null) || (value !== null && (min === null || value >= min) && (max === null || value <= max));
  return inside(comparable.area, query.areaMin, query.areaMax) && inside(comparable.price, query.priceMin, query.priceMax);
}

/**
 * Most relevant first, then most recent; of the results that are the same
 * offer only the first stays, and offers the valuation already has are left out.
 */
export function rankAndDeduplicate(text: string, hits: ComparableSearchHit[], existing: Identity[] = []) {
  const seen = new Set(existing.flatMap(identityKeys));
  const scored = hits.map((hit, index) => ({ hit, index, score: relevance(text, hit.comparable) }));
  scored.sort((a, b) =>
    b.score - a.score
    || (b.hit.capturedOn ?? "").localeCompare(a.hit.capturedOn ?? "")
    || a.index - b.index);
  return scored.flatMap(({ hit }) => {
    const keys = identityKeys(hit.comparable);
    if (keys.some((key) => seen.has(key))) return [];
    for (const key of keys) seen.add(key);
    return [hit];
  });
}

/** "Encontrado en Comparables del despacho (avalúo AV-2026-0012)." */
export function provenanceNote(sourceLabel: string, origin: string | null) {
  return `${PROVENANCE_PREFIX}${sourceLabel}${origin ? ` (${origin})` : ""}.`;
}

/**
 * The comparable with the note of where it was found at the end of its notes.
 * A note left by an earlier search is replaced, not stacked.
 */
export function withProvenance(comparable: FoundComparable, sourceLabel: string, origin: string | null): FoundComparable {
  const note = provenanceNote(sourceLabel, origin).slice(0, NOTES_MAX);
  const own = (comparable.notes ?? "").split("\n").filter((line) => !line.startsWith(PROVENANCE_PREFIX)).join("\n").trim();
  const kept = own.slice(0, NOTES_MAX - note.length - 1).trim();
  return { ...comparable, notes: kept ? `${kept}\n${note}` : note };
}
