/**
 * The advertiser's name and phone of a comparable (matrix 1.5 bis and 1.6,
 * AI annex 3.3): optional, captured only to verify the comparable, seen only
 * by who edits the valuation, and printed in the dictamen and the memoria de
 * cálculo only when the appraiser turns on «Incluir datos del anunciante en la
 * memoria» in the carátula's settings (`advertiserData`). Off by default.
 */
import type { AppSection } from "@/features/valuations/model";

export const ADVERTISER_DATA_LABEL = "Incluir datos del anunciante en la memoria";
export const ADVERTISER_DATA_HINT =
  "El nombre y el teléfono del anunciante de cada comparable solo los ve quien edita el avalúo. Actívalo solo si necesitas imprimirlos en el dictamen y la memoria de cálculo para verificar los comparables.";

/** What a document prints of the advertisers: the choice its carátula section carries. */
export function printsAdvertiserData(sections: ReadonlyArray<Pick<AppSection, "id" | "advertiserData">>): boolean {
  return sections.find((section) => section.id === "caratula")?.advertiserData === true;
}

/** A comparable as it prints: without its advertiser's name and phone unless the appraiser includes them. */
export function printableAdvertiser<T extends { contactName: string | null; contactPhone: string | null }>(comparable: T, include: boolean): T {
  if (include || (comparable.contactName === null && comparable.contactPhone === null)) return comparable;
  return { ...comparable, contactName: null, contactPhone: null };
}

/** A machinery offer as it prints: its contact person, phone and email are the advertiser's (the company stays). */
export function printableMachineryContact<T extends { contact: string; phone: string; email: string }>(offer: T, include: boolean): T {
  if (include) return offer;
  return { ...offer, contact: "", phone: "", email: "" };
}
