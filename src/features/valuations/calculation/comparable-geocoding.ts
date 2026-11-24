import {
  STREET_TYPE_LABELS,
  normalizeCrossing,
  streetTypeOfName,
  withoutNeighborhoodPrefix,
  type ComparableAddress,
} from "./comparable-card";

/**
 * Where the map of a comparable's card puts its pin when it has no
 * coordinates (V8.2, 24 nov 2026: «no me detectó bien el pin»). The line the
 * dictamen prints («Av. del Reno Pte. 2, col. …, fracc. …, C.P. 45237, …») is
 * written for a reader: its abbreviations, «col.», «fracc.» and «esquina con»
 * lead the geocoder astray, and the first answer was taken whatever its
 * precision. Here the address goes in the words a map understands, and the
 * answer that best matches the postal code, the municipality and the state
 * the appraiser captured is the one shown. Pure: tested without the network.
 */

const plain = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const part = (value: string | null | undefined) => value?.trim() ?? "";

/** Abbreviations of the names of roads, written out («Pte.» → «Poniente»). */
const WORDS: Array<[RegExp, string]> = [
  [/\bPte\.?(?=\s|,|$)/giu, "Poniente"],
  [/\bOte\.?(?=\s|,|$)/giu, "Oriente"],
  [/\bNte\.?(?=\s|,|$)/giu, "Norte"],
  [/\bAv\.?(?=\s)/giu, "Avenida"],
  [/\bAvda\.?(?=\s)/giu, "Avenida"],
  [/\bBlvd?\.?(?=\s)/giu, "Boulevard"],
  [/\bCalz\.?(?=\s)/giu, "Calzada"],
  [/\bProl\.?(?=\s)/giu, "Prolongación"],
  [/\bCda\.?(?=\s)/giu, "Cerrada"],
  [/\bPriv\.?(?=\s)/giu, "Privada"],
  [/\bCto\.?(?=\s)/giu, "Circuito"],
  [/\bCarr\.?(?=\s)/giu, "Carretera"],
  [/\bLib\.?(?=\s)/giu, "Libramiento"],
  [/\bAnd\.?(?=\s)/giu, "Andador"],
  [/\bSta\.?(?=\s)/giu, "Santa"],
  [/\bSto\.?(?=\s)/giu, "Santo"],
  [/\bGral\.?(?=\s)/giu, "General"],
];

const spelledOut = (value: string) => WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), value);

/** «S/N», «SN», «sin número»: no number to look up. */
const NO_NUMBER = /^(?:s\s*\/\s*n|sn|sin\s+n[uú]mero|s\.n\.)$/iu;

/** The road with its type in words («Avenida del Reno Poniente»), unless its name already says it. */
function streetOf(address: ComparableAddress) {
  const name = spelledOut(normalizeCrossing(part(address.street)).replace(/\s+esquina con\s+.*$/iu, ""));
  if (!name) return "";
  if (streetTypeOfName(name)) return name;
  const type = address.streetType === "OTRO" ? part(address.streetTypeOther) : address.streetType ? STREET_TYPE_LABELS[address.streetType] : "";
  // «Calle» is what a road of before reads: Google finds the name without it just as well.
  return type && address.streetType !== "CALLE" ? `${type} ${name}` : name;
}

/**
 * The text the geocoder is asked for: «Avenida del Reno Poniente 2, Ciudad
 * Bugambilia, 45237 Zapopan, Jalisco, México». Without parts, the printed
 * line without its reader's words.
 */
export function geocodingQueryOf(address: ComparableAddress | null | undefined, location: string): string {
  const parts = address ?? {};
  const street = streetOf(parts);
  const number = part(parts.number);
  const neighborhood = withoutNeighborhoodPrefix(part(parts.neighborhood)) || part(parts.subdivision).replace(/^(?:fraccionamiento|fracc?\.?)\s*/iu, "");
  const postalCode = part(parts.postalCode).replace(/\D/g, "");
  const place = [postalCode.length === 5 ? postalCode : "", part(parts.municipality)].filter(Boolean).join(" ");
  const pieces = [
    [street, number && !NO_NUMBER.test(number) ? number : ""].filter(Boolean).join(" "),
    neighborhood,
    place,
    part(parts.state),
  ].filter(Boolean);
  if (pieces.length >= 2 || (pieces.length === 1 && !location.trim())) return [...pieces, "México"].join(", ");
  const line = spelledOut(normalizeCrossing(location))
    .replace(/\s+esquina con\s+[^,]*/giu, "")
    .replace(/\b(?:col|fracc?)\.\s*/giu, "")
    .replace(/\bC\.\s?P\.\s*/giu, "")
    .replace(/\s+/g, " ")
    .trim();
  return line ? `${line}${/m[eé]xico\s*$/iu.test(line) ? "" : ", México"}` : "";
}

/** How close an answer of the geocoder is: the building, a point between numbers, the middle of a street, a zone. */
const PRECISION_SCORE: Record<string, number> = { ROOFTOP: 4, RANGE_INTERPOLATED: 3, GEOMETRIC_CENTER: 2, APPROXIMATE: 1 };

type GeocodedPlace = { address: string; precision: string };

/**
 * The answer to show among the geocoder's: the one in the postal code, the
 * municipality and the state captured, the most precise first; among equals,
 * the geocoder's own order. Null without answers.
 */
export function bestGeocodingResult<T extends GeocodedPlace>(results: T[], address: ComparableAddress | null | undefined): T | null {
  const postalCode = part(address?.postalCode).replace(/\D/g, "");
  const municipality = plain(part(address?.municipality));
  const state = plain(part(address?.state));
  const scoreOf = (result: T) => {
    const text = plain(result.address);
    const codes: string[] = text.match(/\b\d{5}\b/g) ?? [];
    let score = PRECISION_SCORE[result.precision] ?? 0;
    if (postalCode.length === 5) score += codes.includes(postalCode) ? 3 : codes.length ? -3 : 0;
    if (municipality) score += text.includes(municipality) ? 2 : -2;
    if (state) score += text.includes(state) ? 1 : -1;
    return score;
  };
  let best: { result: T; score: number } | null = null;
  for (const result of results) {
    const score = scoreOf(result);
    if (!best || score > best.score) best = { result, score };
  }
  return best?.result ?? null;
}
