/**
 * What the comparable form offers while typing (videos 7.2, 02:37 and 19:28):
 * the places and the characteristics already captured in the firm's other
 * comparables, the most used first. Only offered: any other value is typed
 * and kept as written. Pure, shared by the browser and the server.
 */

/** Parts of the address offered from the firm's comparables. */
export const SUGGESTED_ADDRESS_PARTS = ["state", "municipality", "neighborhood", "subdivision", "streetTypeOther"] as const;
export type SuggestedAddressPart = (typeof SUGGESTED_ADDRESS_PARTS)[number];

/** Characteristics of the capture offered from the firm's comparables (the text ones and frente, fondo). */
export const SUGGESTED_CHARACTERISTICS = [
  "zone", "shape", "topography", "services", "landUseKey", "frontage", "depth", "conservation", "quality", "landUse", "constructionType",
] as const;
export type SuggestedCharacteristic = (typeof SUGGESTED_CHARACTERISTICS)[number];

export type ComparableSuggestions = {
  address: Record<SuggestedAddressPart, string[]>;
  characteristics: Record<SuggestedCharacteristic, string[]>;
};

/** As many values of one field as the form offers. */
export const MAX_SUGGESTIONS_PER_FIELD = 40;

export const emptySuggestions = (): ComparableSuggestions => ({
  address: Object.fromEntries(SUGGESTED_ADDRESS_PARTS.map((part) => [part, []])) as unknown as ComparableSuggestions["address"],
  characteristics: Object.fromEntries(SUGGESTED_CHARACTERISTICS.map((key) => [key, []])) as unknown as ComparableSuggestions["characteristics"],
});

/** One stored comparable as the suggestions read it: its address and property snapshots. */
export type SuggestionSource = { address: Record<string, unknown>; property: Record<string, unknown>; sameType: boolean };

const textOf = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
};
const plain = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The values of each field, the most used first (ties in alphabetical
 * order), each once whatever its accents or case (the most used spelling
 * wins). Characteristics come only from comparables of the same type, since
 * a land's zone is not a building's; places come from all of them.
 */
export function suggestionsFrom(rows: SuggestionSource[]): ComparableSuggestions {
  const tally = new Map<string, Map<string, Map<string, number>>>();
  const count = (field: string, value: unknown) => {
    const typed = textOf(value);
    if (!typed || typed.length > 120) return;
    const byKey = tally.get(field) ?? new Map<string, Map<string, number>>();
    tally.set(field, byKey);
    const spellings = byKey.get(plain(typed)) ?? new Map<string, number>();
    byKey.set(plain(typed), spellings);
    spellings.set(typed, (spellings.get(typed) ?? 0) + 1);
  };
  for (const row of rows) {
    for (const part of SUGGESTED_ADDRESS_PARTS) count(`address:${part}`, row.address[part]);
    if (!row.sameType) continue;
    for (const key of SUGGESTED_CHARACTERISTICS) count(`property:${key}`, row.property[key]);
  }
  const ranked = (field: string) => [...(tally.get(field)?.values() ?? [])]
    .map((spellings) => {
      // The most used spelling; on a tie, the one written with a capital («Zapopan» over «zapopan»).
      const capital = (value: string) => (value.charAt(0) !== value.charAt(0).toLowerCase() ? 1 : 0);
      const entries = [...spellings.entries()].sort((a, b) => b[1] - a[1] || capital(b[0]) - capital(a[0]) || a[0].localeCompare(b[0], "es-MX"));
      return { value: entries[0][0], uses: entries.reduce((sum, [, uses]) => sum + uses, 0) };
    })
    .sort((a, b) => b.uses - a.uses || a.value.localeCompare(b.value, "es-MX"))
    .slice(0, MAX_SUGGESTIONS_PER_FIELD)
    .map((item) => item.value);
  const result = emptySuggestions();
  for (const part of SUGGESTED_ADDRESS_PARTS) result.address[part] = ranked(`address:${part}`);
  for (const key of SUGGESTED_CHARACTERISTICS) result.characteristics[key] = ranked(`property:${key}`);
  return result;
}

/** The firm's values of a field first, then the fixed list of the form, each once. */
export function mergeOptions(firm: readonly string[] | undefined, fixed: readonly string[] = []): string[] {
  const seen = new Set<string>();
  return [...(firm ?? []), ...fixed].filter((option) => {
    const key = plain(option);
    if (!option.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
