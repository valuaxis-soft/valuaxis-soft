/**
 * The dates of the page header and the dates of the body (video 7.3,
 * 23:23–24:55): the header carries the valuation date, from today on, and
 * its validity on every page. A date of the body named like them («Fecha del
 * avalúo», «Fecha», «Vigencia») that says another day is pointed out, never
 * refused: the appraiser may link it to the header, and a linked date
 * follows the header from then on.
 *
 * Pure TypeScript — no React, no side effects.
 */
import type { AppSection, CaratulaFormData, Concept } from "../model";
import { validUntilDate } from "./valuation-signatures";

/** Which date of the header: the valuation's, or the end of its validity. */
export type HeaderDateKind = "valuation" | "validity";

/** The header's dates as YYYY-MM-DD; null while one is not set. */
export type HeaderDates = Record<HeaderDateKind, string | null>;

export const HEADER_DATE_LABELS: Record<HeaderDateKind, string> = {
  valuation: "la fecha del avalúo",
  validity: "la vigencia",
};

const NAMES: Record<string, HeaderDateKind> = {
  "fecha": "valuation",
  "fecha del avaluo": "valuation",
  "fecha de avaluo": "valuation",
  "fecha de la valuacion": "valuation",
  "vigencia": "validity",
  "vigencia del avaluo": "validity",
  "vigencia de avaluo": "validity",
  "fecha de vigencia": "validity",
};

const isoDate = (value: string | null | undefined) => /^\d{4}-\d{2}-\d{2}/.exec(value?.trim() ?? "")?.[0] ?? null;

/** The header date a concept stands for by its title; null for any other title. */
export function headerDateKindOf(label: string): HeaderDateKind | null {
  const key = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[:.]+\s*$/, "").replace(/\s+/g, " ").trim();
  return NAMES[key] ?? null;
}

/** The dates the header prints, as the header computes them. */
export function headerDatesOf(caratula: Pick<CaratulaFormData, "fechaAvaluo" | "fechaVigencia" | "mesesVigencia">): HeaderDates {
  const valuation = isoDate(caratula.fechaAvaluo);
  const validity = caratula.mesesVigencia === null ? isoDate(caratula.fechaVigencia) : validUntilDate(valuation, caratula.mesesVigencia);
  return { valuation, validity: isoDate(validity) };
}

/** A date of the body that says another day than the header's: which date of the header, and its day. */
export type HeaderDateMismatch = { kind: HeaderDateKind; header: string };

/** Whether a concept's date differs from the header's; null when it agrees, is linked, is empty or is not one of the header's dates. */
export function headerDateMismatch(concept: Pick<Concept, "label" | "value" | "type" | "headerDate">, dates: HeaderDates | null): HeaderDateMismatch | null {
  if (!dates || concept.type !== "date" || concept.headerDate) return null;
  const kind = headerDateKindOf(concept.label);
  const header = kind ? dates[kind] : null;
  const value = isoDate(concept.value);
  if (!kind || !header || !value || value === header) return null;
  return { kind, header };
}

/** What a new date typed in a concept writes: typed by hand, a date linked to the header stops following it. */
export function conceptDatePatch(concept: Pick<Concept, "headerDate">, value: string, dates: HeaderDates | null): Partial<Concept> {
  if (!concept.headerDate) return { value };
  const header = dates?.[concept.headerDate] ?? null;
  return isoDate(value) === header ? { value } : { value, headerDate: undefined };
}

/** The sections with every date linked to the header showing the header's day; the same sections when nothing changes. */
export function withHeaderDates(sections: AppSection[], dates: HeaderDates): AppSection[] {
  let changed = false;
  const follow = (concepts: Concept[]) => {
    let any = false;
    const next = concepts.map((concept) => {
      const header = concept.headerDate ? dates[concept.headerDate] : null;
      if (!header || isoDate(concept.value) === header) return concept;
      any = true;
      return { ...concept, value: header };
    });
    if (any) changed = true;
    return any ? next : concepts;
  };
  const next = sections.map((section) => {
    const blocks = section.blocks.map((block) => {
      const concepts = follow(block.concepts);
      const apartados = block.apartados.map((apartado) => {
        const own = follow(apartado.concepts);
        return own === apartado.concepts ? apartado : { ...apartado, concepts: own };
      });
      return concepts === block.concepts && apartados.every((apartado, index) => apartado === block.apartados[index])
        ? block
        : { ...block, concepts, apartados };
    });
    return blocks.every((block, index) => block === section.blocks[index]) ? section : { ...section, blocks };
  });
  return changed ? next : sections;
}
