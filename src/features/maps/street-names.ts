/**
 * FAL-35 (24 nov 2026): one name for the subject's street. OpenStreetMap and
 * the address of the carátula can spell the same street differently
 * («Beristáin de Souza» and «Beristáin y Souza»); the croquis, its names and
 * the highlighted streets then took OpenStreetMap's while the dictamen prints
 * the address. The address wins: an OpenStreetMap street that is the same
 * street as the address's takes the address's spelling everywhere the maps
 * show it (the map, «Letreros», the image). Pure functions.
 */
import type { StreetHighlights } from "./highlights";
import type { StreetWay } from "./streets";

/** Words that do not tell two streets apart: articles, joins and the kind of road. */
const FILLER = new Set([
  "de", "del", "la", "las", "los", "el", "y", "e",
  "calle", "c", "av", "ave", "avenida", "blvd", "boulevard", "bulevar", "calz", "calzada", "priv", "privada",
  "prol", "prolongacion", "cda", "cerrada", "and", "andador", "carr", "carretera", "circ", "circuito", "paseo", "camino",
]);

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** The words that name the street, without accents or filler. */
function streetWords(name: string) {
  return plain(name)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER.has(word));
}

/** Whether two spellings name the same street: the same telling words, in any order. */
export function sameStreet(a: string, b: string) {
  const left = streetWords(a);
  const right = streetWords(b);
  if (!left.length || left.length !== right.length) return false;
  const words = new Set(right);
  return left.every((word) => words.has(word));
}

/** A token that is the number of the address, not part of the street's name. */
const NUMBER_TOKEN = /^(\d+[a-z]?(-\d+[a-z]?)?|s\/n|#\d*|no\.?|n[oº°]\.?|n[uú]m\.?|n[uú]mero)$/i;

/**
 * The street of an address as the carátula writes it, without its number:
 * «Av. Beristáin y Souza 1234, Col. Centro» → «Av. Beristáin y Souza». Null
 * when there is none.
 */
export function addressStreet(address: string) {
  const first = address.split(",")[0] ?? "";
  // «#12», «No. 12», «Núm. 12», «Int. 3», «Ext. 4»: the number starts there.
  const cut = first.split(/\s(?:#|n[oº°]\.|n[uú]m\.?|n[uú]mero|int\.?|interior|ext\.?|exterior)(?=\s|\d|$)/i)[0].split("#")[0];
  const tokens = cut.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && NUMBER_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  const street = tokens.join(" ").trim();
  return street && streetWords(street).length ? street : null;
}

/** The OpenStreetMap name that is the address's street, with the address's spelling; null when none is or they already agree. */
export function preferredStreetName(osmNames: Iterable<string>, address: string): { from: string; to: string } | null {
  const street = addressStreet(address);
  if (!street) return null;
  for (const name of osmNames) {
    if (name && name !== street && sameStreet(name, street)) return { from: name, to: street };
  }
  return null;
}

type StreetRename = { from: string; to: string } | null;

/** The pieces of the renamed street with the address's spelling. */
export function renamedWays(ways: readonly StreetWay[], rename: StreetRename): readonly StreetWay[] {
  return rename ? ways.map((way) => (way.n === rename.from ? { ...way, n: rename.to } : way)) : ways;
}

/** The front or painted street stored with OpenStreetMap's spelling takes the address's, so it stays highlighted. */
export function renamedHighlights<T extends Pick<StreetHighlights, "front" | "streets">>(highlights: T, rename: StreetRename): T {
  if (!rename) return highlights;
  const name = (value: string) => (value === rename.from ? rename.to : value);
  return {
    ...highlights,
    front: highlights.front === null ? null : name(highlights.front),
    streets: highlights.streets.map((street) => ({ ...street, name: name(street.name) })),
  };
}

/**
 * The streets around the subject and the stored highlights with the
 * address's spelling of its street. Unchanged when no street matches.
 */
export function withPreferredStreetNames<T extends Pick<StreetHighlights, "front" | "streets">>(ways: readonly StreetWay[], highlights: T, address: string): { ways: readonly StreetWay[]; highlights: T } {
  const rename = preferredStreetName(new Set(ways.map((way) => way.n)), address);
  return { ways: renamedWays(ways, rename), highlights: renamedHighlights(highlights, rename) };
}
