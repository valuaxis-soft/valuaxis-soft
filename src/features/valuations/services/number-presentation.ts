/**
 * How the numbers of a document are written: with or without the thousands
 * separator ("40,000" or "40000"). One choice for the whole document, kept on
 * its carátula section, the cover that every valuation has. Amounts of money
 * keep their own format whatever the choice.
 *
 * Pure TypeScript — no React, no side effects.
 */
import type { AppSection } from "../model";

export type NumberPresentation = {
  /** "40,000" when true, "40000" when false. */
  thousandsSeparator: boolean;
};

/** What a document says until the appraiser chooses: numbers with their separator, as always printed. */
export const DEFAULT_NUMBER_PRESENTATION: NumberPresentation = { thousandsSeparator: true };

/** The section that carries the choices of the whole document. */
export const DOCUMENT_SETTINGS_SECTION_ID = "caratula";

/** The presentation a document chose, read from its carátula section; the default while it chose nothing. */
export function documentNumberPresentation(sections: ReadonlyArray<Pick<AppSection, "id" | "thousandsSeparator">>): NumberPresentation {
  const cover = sections.find((section) => section.id === DOCUMENT_SETTINGS_SECTION_ID) ?? sections[0];
  if (cover?.thousandsSeparator === undefined) return DEFAULT_NUMBER_PRESENTATION;
  return { thousandsSeparator: cover.thousandsSeparator };
}

/** A number written with its separator, with an optional sign and a short unit after it: "40,000", "1,250.5 m²". */
const GROUPED_NUMBER = /^(\s*-?\s*)(\d{1,3}(?:,\d{3})+)((?:\.\d+)?)(\s*[^\d$,]{0,16})$/;

/**
 * The same text without the thousands separator: "40,000.50 m²" reads
 * "40000.50 m²". Money ("$ 40,000.00", "40,000 MXN") and anything that is not
 * a single number stay as written.
 */
export function withoutThousandsSeparator(text: string): string {
  const match = GROUPED_NUMBER.exec(text);
  if (!match) return text;
  const [, sign, integer, decimals, suffix] = match;
  if (/^\s*(mxn|pesos)\b/i.test(suffix)) return text;
  return `${sign}${integer.replace(/,/g, "")}${decimals}${suffix}`;
}
